import { z } from 'zod';
import { zId, zLocalizedText, zSemVer } from './primitives.ts';
import { zCompetency } from './competency.ts';

/** Version de l API Core exposee aux modules. Les modules declarent leur compatibilite. */
export const CORE_API_VERSION = '1.0.0';

export const zModuleCompatibility = z.object({
  /** Plage semver simplifiee : ">=1.0.0 <2.0.0". */
  coreApi: z.string().min(1).default('>=1.0.0 <2.0.0'),
  contractsSchemaVersion: z.number().int().positive().default(1),
});

export const zModuleManifest = z.object({
  schemaVersion: z.literal(1).default(1),
  id: zId,
  version: zSemVer,
  name: zLocalizedText,
  description: zLocalizedText,
  compatibility: zModuleCompatibility.default({}),
  competencies: z.array(zCompetency).default([]),
  missionIds: z.array(zId).default([]),
  knowledgeEntryIds: z.array(zId).default([]),
  scenarioIds: z.array(zId).default([]),
  /** Poids approximatif du pack en octets, pour la gestion du stockage hors ligne. */
  approximateSizeBytes: z.number().int().nonnegative().default(0),
  assets: z.array(z.object({ path: z.string().min(1), sha256: z.string().length(64).optional(), sizeBytes: z.number().int().nonnegative().default(0) })).default([]),
  license: z.string().min(1).default('MIT'),
  authors: z.array(z.string()).default(['NEO Systems']),
  offlineCapable: z.boolean().default(true),
});

export const zCourseManifest = z.object({
  schemaVersion: z.literal(1).default(1),
  id: zId,
  moduleId: zId,
  title: zLocalizedText,
  summary: zLocalizedText,
  /** Progression conseillee : suite ordonnee de missions et de revisions. */
  path: z
    .array(
      z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('mission'), missionId: zId }),
        z.object({ kind: z.literal('review'), competencyIds: z.array(zId).min(1), minutes: z.number().int().positive().default(10) }),
        z.object({ kind: z.literal('knowledge'), entryId: zId }),
      ]),
    )
    .default([]),
  estimatedHours: z.number().positive().default(2),
  level: z.enum(['decouverte', 'fondamentaux', 'intermediaire', 'avance']).default('fondamentaux'),
});

export type ModuleCompatibility = z.infer<typeof zModuleCompatibility>;
export type ModuleManifest = z.infer<typeof zModuleManifest>;
export type CourseManifest = z.infer<typeof zCourseManifest>;
