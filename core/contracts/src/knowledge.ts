import { z } from 'zod';
import { zId, zLocalizedText } from './primitives.ts';
import { zCompetencyDomain } from './competency.ts';

export const zKnowledgeKind = z.enum(['concept', 'command', 'procedure', 'diagram', 'glossary', 'pitfall']);

export const zKnowledgeEntry = z.object({
  schemaVersion: z.literal(1).default(1),
  id: zId,
  kind: zKnowledgeKind,
  title: zLocalizedText,
  /** Resume court affiche dans les resultats de recherche. */
  summary: zLocalizedText,
  body: zLocalizedText,
  domain: zCompetencyDomain,
  competencies: z.array(zId).default([]),
  moduleIds: z.array(zId).default([]),
  prerequisites: z.array(zId).default([]),
  relatedIds: z.array(zId).default([]),
  /** Pour les fiches commande : syntaxe, exemples et pieges. */
  command: z
    .object({
      os: z.enum(['linux', 'windows', 'both']),
      syntax: z.string().min(1),
      examples: z.array(z.object({ cmd: z.string().min(1), explanation: zLocalizedText })).default([]),
      cautions: z.array(zLocalizedText).default([]),
    })
    .optional(),
  keywords: z.array(z.string().max(48)).default([]),
  /** Source pedagogique interne ; aucun contenu tiers copie. */
  origin: z.enum(['neo-internal']).default('neo-internal'),
});

export const zKnowledgeGraphEdge = z.object({
  from: zId,
  to: zId,
  relation: z.enum(['prerequisite', 'related', 'applies-to', 'teaches', 'requires']),
  weight: z.number().min(0).max(1).default(1),
});

export const zKnowledgeGraph = z.object({
  schemaVersion: z.literal(1).default(1),
  nodes: z
    .array(
      z.object({
        id: zId,
        kind: z.enum(['concept', 'competency', 'mission', 'module']),
        label: zLocalizedText,
        domain: zCompetencyDomain.optional(),
      }),
    )
    .default([]),
  edges: z.array(zKnowledgeGraphEdge).default([]),
});

export type KnowledgeKind = z.infer<typeof zKnowledgeKind>;
export type KnowledgeEntry = z.infer<typeof zKnowledgeEntry>;
export type KnowledgeGraph = z.infer<typeof zKnowledgeGraph>;
export type KnowledgeGraphEdge = z.infer<typeof zKnowledgeGraphEdge>;
