import type {
  Competency,
  CompetencyDomain,
  CompetencyMastery,
  KnowledgeEntry,
  KnowledgeGraph,
  KnowledgeGraphEdge,
  MissionDefinition,
} from '@tssr/contracts';
import { SearchIndex, type SearchHit } from './search.ts';

const KIND_BOOST: Record<KnowledgeEntry['kind'], number> = {
  concept: 1.25,
  pitfall: 1.15,
  procedure: 1.1,
  glossary: 1,
  diagram: 1,
  command: 0.95,
};

function localized(value: unknown, locale = 'fr'): string {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, string>;
    return record[locale] ?? Object.values(record)[0] ?? '';
  }
  return '';
}

export interface KnowledgeSearchResult extends SearchHit {
  entry: KnowledgeEntry;
  title: string;
  summary: string;
}

export interface LibraryFilters {
  domain?: CompetencyDomain;
  moduleId?: string;
  competencyId?: string;
  kind?: KnowledgeEntry['kind'];
}

/**
 * Base de connaissances NEO.
 * Entierement locale : elle reste consultable hors ligne pour les modules telecharges.
 */
export class KnowledgeLibrary {
  private readonly entries = new Map<string, KnowledgeEntry>();
  private readonly competencies = new Map<string, Competency>();
  private readonly missions = new Map<string, MissionDefinition>();
  private index = new SearchIndex();
  private dirty = false;

  addEntries(entries: readonly KnowledgeEntry[]): this {
    for (const entry of entries) this.entries.set(entry.id, entry);
    this.dirty = true;
    return this;
  }

  addCompetencies(competencies: readonly Competency[]): this {
    for (const competency of competencies) this.competencies.set(competency.id, competency);
    return this;
  }

  addMissions(missions: readonly MissionDefinition[]): this {
    for (const mission of missions) this.missions.set(mission.id, mission);
    return this;
  }

  entry(id: string): KnowledgeEntry | undefined {
    return this.entries.get(id);
  }

  all(filters: LibraryFilters = {}): KnowledgeEntry[] {
    return [...this.entries.values()]
      .filter((e) => filters.domain === undefined || e.domain === filters.domain)
      .filter((e) => filters.moduleId === undefined || e.moduleIds.includes(filters.moduleId))
      .filter(
        (e) => filters.competencyId === undefined || e.competencies.includes(filters.competencyId),
      )
      .filter((e) => filters.kind === undefined || e.kind === filters.kind)
      .sort((a, b) => localized(a.title).localeCompare(localized(b.title)));
  }

  private rebuild(locale: string): void {
    this.index = new SearchIndex();
    for (const entry of this.entries.values()) {
      const commandText = entry.command
        ? [
            entry.command.syntax,
            ...entry.command.examples.map((e) => `${e.cmd} ${localized(e.explanation, locale)}`),
          ].join(' ')
        : '';
      this.index.add({
        id: entry.id,
        // Priorite editoriale : sur un terme generique, la fiche de concept
        // eclaire mieux qu une fiche de commande.
        boost: KIND_BOOST[entry.kind] ?? 1,
        fields: [
          { text: localized(entry.title, locale), weight: 5 },
          { text: entry.keywords.join(' '), weight: 4 },
          { text: commandText, weight: 3 },
          { text: localized(entry.summary, locale), weight: 2 },
          { text: localized(entry.body, locale), weight: 1 },
        ],
      });
    }
    this.dirty = false;
  }

  search(
    query: string,
    options: LibraryFilters & { limit?: number; locale?: string } = {},
  ): KnowledgeSearchResult[] {
    const locale = options.locale ?? 'fr';
    if (this.dirty) this.rebuild(locale);
    const allowed = new Set(this.all(options).map((e) => e.id));
    return this.index
      .search(query, (options.limit ?? 10) * 3)
      .filter((hit) => allowed.has(hit.id))
      .slice(0, options.limit ?? 10)
      .map((hit) => {
        const entry = this.entries.get(hit.id) as KnowledgeEntry;
        return {
          ...hit,
          entry,
          title: localized(entry.title, locale),
          summary: localized(entry.summary, locale),
        };
      });
  }

  /** Graphe de connaissances : concepts, competences, missions et leurs relations. */
  buildGraph(locale = 'fr'): KnowledgeGraph {
    const nodes: KnowledgeGraph['nodes'] = [];
    const edges: KnowledgeGraphEdge[] = [];

    for (const competency of this.competencies.values()) {
      nodes.push({
        id: competency.id,
        kind: 'competency',
        label: localized(competency.label, locale),
        domain: competency.domain,
      });
      for (const prerequisite of competency.prerequisites) {
        edges.push({ from: prerequisite, to: competency.id, relation: 'prerequisite', weight: 1 });
      }
    }
    for (const entry of this.entries.values()) {
      nodes.push({
        id: entry.id,
        kind: 'concept',
        label: localized(entry.title, locale),
        domain: entry.domain,
      });
      for (const prerequisite of entry.prerequisites) {
        edges.push({ from: prerequisite, to: entry.id, relation: 'prerequisite', weight: 1 });
      }
      for (const related of entry.relatedIds) {
        edges.push({ from: entry.id, to: related, relation: 'related', weight: 0.5 });
      }
      for (const competencyId of entry.competencies) {
        edges.push({ from: entry.id, to: competencyId, relation: 'teaches', weight: 0.8 });
      }
    }
    for (const mission of this.missions.values()) {
      nodes.push({ id: mission.id, kind: 'mission', label: localized(mission.title, locale) });
      for (const competencyId of mission.competencies) {
        edges.push({ from: mission.id, to: competencyId, relation: 'applies-to', weight: 1 });
      }
    }

    const known = new Set(nodes.map((n) => n.id));
    return {
      schemaVersion: 1,
      nodes,
      // On n affiche que les relations dont les deux extremites existent reellement.
      edges: edges.filter((e) => known.has(e.from) && known.has(e.to)),
    };
  }

  /** Recommandations : ce qu il est pertinent de reviser, avec la raison. */
  recommend(
    masteries: readonly CompetencyMastery[],
    limit = 5,
    now = Date.now(),
  ): { entryId: string; title: string; reason: string }[] {
    const byCompetency = new Map(masteries.map((m) => [m.competencyId, m]));
    const scored: { entryId: string; title: string; reason: string; priority: number }[] = [];

    for (const entry of this.entries.values()) {
      let priority = 0;
      let reason = '';
      for (const competencyId of entry.competencies) {
        const mastery = byCompetency.get(competencyId);
        if (!mastery) {
          priority = Math.max(priority, 0.6);
          reason = reason || 'competence jamais travaillee';
          continue;
        }
        if (mastery.dueAt !== undefined && mastery.dueAt <= now) {
          priority = Math.max(priority, 0.9 - mastery.mastery * 0.3);
          reason = 'revision arrivee a echeance';
        } else if (mastery.mastery < 0.5) {
          priority = Math.max(priority, 0.8 - mastery.mastery);
          reason = reason || 'maitrise encore fragile';
        }
      }
      if (priority > 0) {
        scored.push({ entryId: entry.id, title: localized(entry.title), reason, priority });
      }
    }

    return scored
      .sort((a, b) => b.priority - a.priority || a.entryId.localeCompare(b.entryId))
      .slice(0, limit)
      .map(({ entryId, title, reason }) => ({ entryId, title, reason }));
  }

  /** Verifie que le graphe ne contient pas de prerequis circulaire. */
  detectCycles(): string[][] {
    const graph = this.buildGraph();
    const adjacency = new Map<string, string[]>();
    for (const edge of graph.edges) {
      if (edge.relation !== 'prerequisite') continue;
      const list = adjacency.get(edge.from) ?? [];
      list.push(edge.to);
      adjacency.set(edge.from, list);
    }
    const cycles: string[][] = [];
    const state = new Map<string, 'visiting' | 'done'>();
    const stack: string[] = [];

    const visit = (node: string): void => {
      const current = state.get(node);
      if (current === 'done') return;
      if (current === 'visiting') {
        const start = stack.indexOf(node);
        cycles.push([...stack.slice(start), node]);
        return;
      }
      state.set(node, 'visiting');
      stack.push(node);
      for (const next of adjacency.get(node) ?? []) visit(next);
      stack.pop();
      state.set(node, 'done');
    };

    for (const node of adjacency.keys()) visit(node);
    return cycles;
  }
}
