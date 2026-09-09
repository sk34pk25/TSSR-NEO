import { z } from 'zod';
import { zId, zLocalizedText } from './primitives.ts';

/** Domaines de competence TSSR couverts par la plateforme. */
export const COMPETENCY_DOMAINS = [
  'systems',
  'network',
  'virtualization',
  'cloud',
  'security',
  'hardware',
  'itsm',
  'monitoring',
  'backup',
  'deployment',
  'support',
  'documentation',
] as const;

export const zCompetencyDomain = z.enum(COMPETENCY_DOMAINS);

export const zCompetency = z.object({
  id: zId,
  domain: zCompetencyDomain,
  label: zLocalizedText,
  description: zLocalizedText.optional(),
  /** Competences requises avant de pouvoir travailler serieusement celle-ci. */
  prerequisites: z.array(zId).default([]),
  /** Niveau taxonomique vise : 1 connaitre, 2 appliquer, 3 diagnostiquer, 4 concevoir. */
  level: z.number().int().min(1).max(4).default(2),
});

/** Maitrise mesuree d une competence, entre 0 et 1, avec sa fiabilite statistique. */
export const zCompetencyMastery = z.object({
  competencyId: zId,
  mastery: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  observations: z.number().int().nonnegative().default(0),
  lastPracticedAt: z.number().int().nonnegative().optional(),
  /** Prochaine revision conseillee (repetition espacee), en ms epoch local. */
  dueAt: z.number().int().nonnegative().optional(),
});

export const zPrerequisiteCheck = z.object({
  competencyId: zId,
  requiredMastery: z.number().min(0).max(1).default(0.5),
  /** Un prerequis "soft" informe mais ne bloque pas l acces. */
  blocking: z.boolean().default(false),
});

export type CompetencyDomain = z.infer<typeof zCompetencyDomain>;
export type Competency = z.infer<typeof zCompetency>;
export type CompetencyMastery = z.infer<typeof zCompetencyMastery>;
export type PrerequisiteCheck = z.infer<typeof zPrerequisiteCheck>;
