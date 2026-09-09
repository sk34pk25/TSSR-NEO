import { z } from 'zod';
import { zAssertion } from './assertions.ts';
import { zId, zLocalizedText, zSeed, zSemVer, zSimTime } from './primitives.ts';
import { zPrerequisiteCheck } from './competency.ts';

export const DIFFICULTY_MODES = ['guided', 'standard', 'advanced', 'expert', 'adaptive'] as const;
export const zDifficultyMode = z.enum(DIFFICULTY_MODES);

export const SCORE_DIMENSIONS = [
  'technicalAccuracy',
  'diagnosis',
  'autonomy',
  'efficiency',
  'impact',
  'safety',
  'verification',
  'documentation',
] as const;
export const zScoreDimension = z.enum(SCORE_DIMENSIONS);

export const zObjective = z.object({
  id: zId,
  label: zLocalizedText,
  description: zLocalizedText.optional(),
  optional: z.boolean().default(false),
  /** Un objectif cache n apparait qu une fois decouvert : evite de donner la reponse. */
  hidden: z.boolean().default(false),
  /** Condition reellement evaluee contre l etat du monde. */
  check: zAssertion,
  competencies: z.array(zId).default([]),
  weight: z.number().positive().default(1),
  /** Dimensions de score alimentees par cet objectif. */
  dimensions: z.array(zScoreDimension).default(['technicalAccuracy']),
});

export const zHint = z.object({
  id: zId,
  /** Niveaux croissants : 1 question socratique, 2 piste, 3 methode, 4 solution partielle. */
  level: z.number().int().min(1).max(4),
  text: zLocalizedText,
  /** Cout applique a la dimension autonomie (0..1). */
  autonomyCost: z.number().min(0).max(1).default(0.15),
  /** N est propose que si cette condition est vraie (indice contextuel). */
  when: zAssertion.optional(),
  objectiveId: zId.optional(),
});

export const zDynamicEvent = z.object({
  id: zId,
  label: zLocalizedText.optional(),
  /** Declencheur : temps simule ecoule, objectif atteint, ou condition d etat. */
  trigger: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('after-ms'), ms: z.number().int().positive() }),
    z.object({ kind: z.literal('objective-completed'), objectiveId: zId }),
    z.object({ kind: z.literal('condition'), when: zAssertion }),
  ]),
  once: z.boolean().default(true),
  /** Mutations appliquees au monde ; chacune est executee par le moteur de simulation. */
  effects: z.array(
    z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('set-link'), linkId: zId, connected: z.boolean() }),
      z.object({ kind: z.literal('set-service-status'), nodeId: zId, serviceId: zId, status: z.enum(['running', 'stopped', 'failed', 'degraded']) }),
      z.object({ kind: z.literal('set-interface-enabled'), nodeId: zId, interfaceName: z.string(), enabled: z.boolean() }),
      z.object({ kind: z.literal('set-node-power'), nodeId: zId, powered: z.boolean() }),
      z.object({ kind: z.literal('open-ticket'), ticketId: zId }),
      z.object({ kind: z.literal('npc-message'), npcId: zId, text: zLocalizedText }),
      z.object({ kind: z.literal('set-component-health'), assetId: zId, componentId: zId, health: z.enum(['ok', 'warning', 'failed']) }),
      z.object({ kind: z.literal('log'), nodeId: zId, level: z.enum(['debug', 'info', 'warning', 'error', 'critical']), message: z.string() }),
    ]),
  ),
});

/** Parametrage d une variante : meme competence, valeurs differentes, difficulte comparable. */
export const zVariantSpec = z.object({
  id: zId,
  /** Cles substituees dans la definition de mission (ex "{{lanCidr}}"). */
  parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  weight: z.number().positive().default(1),
});

export const zMissionDefinition = z.object({
  schemaVersion: z.literal(1).default(1),
  id: zId,
  moduleId: zId,
  version: zSemVer.default('1.0.0'),
  title: zLocalizedText,
  summary: zLocalizedText,
  /** Duree indicative en minutes ; jamais une contrainte cachee. */
  estimatedMinutes: z.number().int().positive().default(20),
  difficulty: zDifficultyMode.default('standard'),
  competencies: z.array(zId).min(1),
  prerequisites: z.array(zPrerequisiteCheck).default([]),
  briefing: zLocalizedText,
  /** Scenario technique initial charge par le moteur de simulation. */
  scenarioId: zId,
  ticketIds: z.array(zId).default([]),
  npcIds: z.array(zId).default([]),
  objectives: z.array(zObjective).min(1),
  hints: z.array(zHint).default([]),
  dynamicEvents: z.array(zDynamicEvent).default([]),
  variants: z.array(zVariantSpec).default([]),
  /** Conditions d echec explicites (ex : service critique casse). */
  failureConditions: z.array(z.object({ id: zId, label: zLocalizedText, when: zAssertion })).default([]),
  /** Elements de debrief compares aux strategies possibles. */
  debrief: z
    .object({
      keyPoints: z.array(zLocalizedText).default([]),
      alternatives: z
        .array(
          z.object({
            id: zId,
            label: zLocalizedText,
            worksTechnically: z.boolean(),
            professionallySound: z.boolean(),
            explanation: zLocalizedText,
          }),
        )
        .default([]),
      knowledgeEntryIds: z.array(zId).default([]),
    })
    .default({}),
  tags: z.array(z.string().max(32)).default([]),
});

export const zObjectiveState = z.object({
  objectiveId: zId,
  status: z.enum(['pending', 'completed', 'failed']).default('pending'),
  completedAt: zSimTime.optional(),
  /** Nombre de fois ou la condition a bascule : detecte les regressions. */
  toggles: z.number().int().nonnegative().default(0),
  discovered: z.boolean().default(false),
});

export const zMissionState = z.object({
  schemaVersion: z.literal(1).default(1),
  missionId: zId,
  variantId: zId.optional(),
  seed: zSeed,
  startedAt: z.number().int().nonnegative(),
  simTime: zSimTime.default(0),
  status: z.enum(['briefing', 'active', 'succeeded', 'failed', 'abandoned']).default('briefing'),
  objectives: z.array(zObjectiveState).default([]),
  hintsUsed: z.array(z.object({ hintId: zId, at: zSimTime })).default([]),
  firedEventIds: z.array(zId).default([]),
  difficulty: zDifficultyMode.default('standard'),
  /** Compteur d actions significatives, pour la dimension efficacite. */
  actionCount: z.number().int().nonnegative().default(0),
  failureReason: z.string().optional(),
});

export const zMissionScore = z.object({
  missionId: zId,
  dimensions: z.record(zScoreDimension, z.number().min(0).max(1)),
  /** Score global pondere, 0..1. Jamais presente comme une note officielle. */
  overall: z.number().min(0).max(1),
  objectivesCompleted: z.number().int().nonnegative(),
  objectivesTotal: z.number().int().nonnegative(),
  hintsUsed: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  competencyDeltas: z.array(z.object({ competencyId: zId, delta: z.number() })).default([]),
});

export type DifficultyMode = z.infer<typeof zDifficultyMode>;
export type ScoreDimension = z.infer<typeof zScoreDimension>;
export type Objective = z.infer<typeof zObjective>;
export type Hint = z.infer<typeof zHint>;
export type DynamicEvent = z.infer<typeof zDynamicEvent>;
export type VariantSpec = z.infer<typeof zVariantSpec>;
export type MissionDefinition = z.infer<typeof zMissionDefinition>;
export type ObjectiveState = z.infer<typeof zObjectiveState>;
export type MissionState = z.infer<typeof zMissionState>;
export type MissionScore = z.infer<typeof zMissionScore>;
