import type { PlayerProgress } from '@tssr/contracts';
import type { KnowledgeLibrary } from '@tssr/knowledge';
import type { MissionRunner } from '@tssr/mission-engine';
import type { SimulationWorld } from '@tssr/sim-world';
import { guidanceFor } from './rules.ts';

export type NovaSource = 'rules' | 'knowledge' | 'hint' | 'observation';

export interface NovaMessage {
  id: string;
  source: NovaSource;
  tone: 'neutral' | 'encouraging' | 'warning';
  text: string;
  /** Fiches a consulter, jamais recopiees integralement dans la reponse. */
  knowledgeEntryIds: string[];
  /** Pistes concretes proposees au joueur. */
  checks: string[];
}

export interface NovaOptions {
  library: KnowledgeLibrary;
  world: SimulationWorld;
  runner?: MissionRunner;
  progress?: PlayerProgress;
  verbosity?: 'minimal' | 'normal' | 'detailed';
  locale?: string;
}

/**
 * NOVA, mentor pedagogique.
 * Deterministe et hors ligne : regles internes puis base de connaissances.
 * Elle pose d abord une question, propose ensuite des pistes,
 * et ne delivre la solution que via les indices explicites de la mission.
 */
export class Nova {
  private readonly library: KnowledgeLibrary;
  private readonly world: SimulationWorld;
  private readonly runner: MissionRunner | undefined;
  private progress: PlayerProgress | undefined;
  private verbosity: NonNullable<NovaOptions['verbosity']>;
  private counter = 0;

  constructor(options: NovaOptions) {
    this.library = options.library;
    this.world = options.world;
    this.runner = options.runner;
    this.progress = options.progress;
    this.verbosity = options.verbosity ?? 'normal';
  }

  setProgress(progress: PlayerProgress): void {
    this.progress = progress;
    this.verbosity = progress.preferences.novaVerbosity;
  }

  private nextId(): string {
    this.counter += 1;
    return `nova-${this.counter}`;
  }

  /**
   * Presence adaptative : plus le joueur est experimente, moins NOVA intervient
   * spontanement. Elle reste toujours disponible a la demande.
   */
  shouldSpeakProactively(): boolean {
    if (this.verbosity === 'minimal') return false;
    const level = this.progress?.level ?? 1;
    if (this.verbosity === 'detailed') return true;
    return level <= 5;
  }

  /** Message d accueil de mission : contexte et cadrage, sans piste technique. */
  briefing(): NovaMessage {
    const title = this.runner?.summary().title ?? 'session libre';
    return {
      id: this.nextId(),
      source: 'rules',
      tone: 'encouraging',
      text: `Bienvenue. Objectif du moment : ${title}. Commencez par etablir les faits avant de modifier quoi que ce soit.`,
      knowledgeEntryIds: this.library.search('methode diagnostic', { limit: 1 }).map((r) => r.entry.id),
      checks: [
        'lire le ticket et relever les elements factuels',
        'delimiter le perimetre : qui est touche, depuis quand',
      ],
    };
  }

  /** Aide contextuelle : question socratique liee au premier objectif en echec. */
  guidance(): NovaMessage {
    if (!this.runner) {
      return {
        id: this.nextId(),
        source: 'rules',
        tone: 'neutral',
        text: 'Aucune mission en cours. En laboratoire libre, fixez-vous un objectif verifiable avant de configurer.',
        knowledgeEntryIds: [],
        checks: ['definir l etat attendu', 'preparer la verification qui prouvera le resultat'],
      };
    }

    const pending = this.runner
      .objectives()
      .find((o) => o.status !== 'completed' && !o.optional);
    if (!pending) {
      return {
        id: this.nextId(),
        source: 'observation',
        tone: 'encouraging',
        text: 'Les objectifs techniques sont atteints. Reste la verification depuis le poste concerne et la documentation du ticket.',
        knowledgeEntryIds: [],
        checks: ['verifier depuis le poste de l utilisateur', 'documenter la cause racine'],
      };
    }

    const objective = this.runner.definition.objectives.find((o) => o.id === pending.id);
    const rule = objective ? guidanceFor(objective.check) : undefined;
    const keywords = rule?.knowledgeKeywords ?? ['diagnostic'];
    const entries = this.library.search(keywords.join(' '), { limit: 2 }).map((r) => r.entry.id);

    const detail = this.verbosity === 'detailed' && pending.detail !== undefined ? ` Constat actuel : ${pending.detail}.` : '';
    return {
      id: this.nextId(),
      source: 'rules',
      tone: 'neutral',
      text: `${rule?.question ?? 'Que dit l etat reel du systeme ?'}${detail}`,
      knowledgeEntryIds: entries,
      checks: this.verbosity === 'minimal' ? [] : (rule?.checks ?? []),
    };
  }

  /**
   * Reponse a une question libre.
   * Priorite absolue au contenu du module : NOVA ne fabrique pas de savoir.
   */
  answer(question: string): NovaMessage {
    const results = this.library.search(question, { limit: 3 });
    if (results.length === 0) {
      return {
        id: this.nextId(),
        source: 'rules',
        tone: 'neutral',
        text:
          "Je n ai pas de fiche correspondant a cette question dans les modules charges. "
          + 'Reformulez avec un terme technique, ou consultez la base de connaissances par domaine.',
        knowledgeEntryIds: [],
        checks: ['essayer un terme plus precis', 'parcourir les fiches du domaine concerne'],
      };
    }
    const best = results[0] as (typeof results)[number];
    const others = results.slice(1);
    return {
      id: this.nextId(),
      source: 'knowledge',
      tone: 'neutral',
      text:
        `${best.summary}` +
        (others.length > 0 ? ` Voir aussi : ${others.map((r) => r.title).join(', ')}.` : ''),
      knowledgeEntryIds: results.map((r) => r.entry.id),
      checks: [],
    };
  }

  /**
   * Demande explicite d indice : delegue au moteur de mission,
   * qui applique le cout d autonomie et le plafond de difficulte.
   */
  requestHint(): NovaMessage {
    if (!this.runner) {
      return {
        id: this.nextId(),
        source: 'rules',
        tone: 'neutral',
        text: 'Les indices sont lies a une mission. En laboratoire libre, posez-moi une question precise.',
        knowledgeEntryIds: [],
        checks: [],
      };
    }
    const hint = this.runner.requestHint();
    if (!hint) {
      return {
        id: this.nextId(),
        source: 'rules',
        tone: 'neutral',
        text:
          'Aucun indice supplementaire n est disponible a ce niveau de difficulte. '
          + 'Reprenez la comparaison entre l etat constate et l etat attendu.',
        knowledgeEntryIds: [],
        checks: ['comparer avec un element equivalent qui fonctionne'],
      };
    }
    const text = typeof hint.text === 'string' ? hint.text : Object.values(hint.text)[0] ?? '';
    return {
      id: this.nextId(),
      source: 'hint',
      tone: hint.level >= 3 ? 'warning' : 'neutral',
      text,
      knowledgeEntryIds: [],
      checks: [],
    };
  }

  /**
   * Observations proactives sur l etat du monde : risques visibles,
   * jamais la cause racine d un exercice de diagnostic en cours.
   */
  observations(): NovaMessage[] {
    const messages: NovaMessage[] = [];
    const alerts = this.world.monitoring.activeAlerts();
    if (alerts.length >= 3) {
      messages.push({
        id: this.nextId(),
        source: 'observation',
        tone: 'warning',
        text: `${alerts.length} alertes sont actives simultanement. Cherchez une cause commune avant de traiter chaque symptome.`,
        knowledgeEntryIds: [],
        checks: ['regrouper les alertes par equipement amont'],
      });
    }
    for (const job of this.world.state.backupJobs) {
      if (job.enabled && job.lastRestoreTestAt === undefined && job.points.length > 0) {
        messages.push({
          id: this.nextId(),
          source: 'observation',
          tone: 'warning',
          text: `La sauvegarde "${job.name}" n a jamais fait l objet d un test de restauration.`,
          knowledgeEntryIds: [],
          checks: ['lancer un test de restauration sur le point le plus recent'],
        });
      }
    }
    return messages;
  }
}
