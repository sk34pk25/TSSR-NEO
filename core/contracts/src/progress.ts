import { z } from 'zod';
import { zId, zSeed, zSemVer } from './primitives.ts';
import { zCompetencyMastery } from './competency.ts';
import { zDifficultyMode, zMissionScore, zMissionState } from './mission.ts';
import { zWorldState } from './world.ts';
import { zEventLog } from './events.ts';

export const zAccessibilityPrefs = z.object({
  uiScale: z.number().min(0.75).max(2).default(1),
  textSize: z.enum(['s', 'm', 'l', 'xl']).default('m'),
  contrast: z.enum(['normal', 'high']).default('normal'),
  colorBlindMode: z.enum(['none', 'protanopia', 'deuteranopia', 'tritanopia']).default('none'),
  reduceMotion: z.boolean().default(false),
  reduceVisualComplexity: z.boolean().default(false),
  subtitles: z.boolean().default(true),
  keyboardOnly: z.boolean().default(false),
  screenReaderHints: z.boolean().default(false),
});

export const zGraphicsQuality = z.enum(['auto', 'performance', 'balanced', 'quality', 'ultra']);

export const zPreferences = z.object({
  locale: z.string().min(2).max(8).default('fr'),
  graphicsQuality: zGraphicsQuality.default('auto'),
  difficulty: zDifficultyMode.default('adaptive'),
  audio: z
    .object({
      master: z.number().min(0).max(1).default(0.7),
      music: z.number().min(0).max(1).default(0.4),
      sfx: z.number().min(0).max(1).default(0.8),
      ambience: z.number().min(0).max(1).default(0.5),
      voice: z.number().min(0).max(1).default(0.8),
    })
    .default({}),
  accessibility: zAccessibilityPrefs.default({}),
  novaVerbosity: z.enum(['minimal', 'normal', 'detailed']).default('normal'),
  telemetryConsent: z.boolean().default(false),
  /**
   * Mode developpeur : revele les mesures techniques (images par seconde,
   * appels de rendu, greffons de diagnostic). Elles n ont aucun sens pour un
   * apprenant en formation et signalaient le prototype ; elles restent
   * indispensables au reglage, donc elles sont deplacees, pas supprimees.
   */
  developerMode: z.boolean().default(false),
  /**
   * La prise en main a ete vue. Elle vit dans les preferences parce qu elle
   * doit suivre le profil : reimporter sa progression sur une autre machine ne
   * doit pas rejouer un accueil deja lu.
   */
  onboardingSeen: z.boolean().default(false),
  keybindings: z.record(z.string(), z.string()).default({}),
});

export const zBadge = z.object({
  id: zId,
  earnedAt: z.number().int().nonnegative(),
  missionId: zId.optional(),
});

export const zMissionRecord = z.object({
  missionId: zId,
  attempts: z.number().int().positive().default(1),
  bestScore: zMissionScore.optional(),
  lastScore: zMissionScore.optional(),
  completed: z.boolean().default(false),
  lastPlayedAt: z.number().int().nonnegative(),
});

export const zPlayerProgress = z.object({
  schemaVersion: z.literal(1).default(1),
  profileId: zId,
  displayName: z.string().max(48).default('Technicien'),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  xp: z.number().int().nonnegative().default(0),
  level: z.number().int().positive().default(1),
  careerRank: z.enum(['junior', 'technician', 'senior', 'lead']).default('junior'),
  competencies: z.array(zCompetencyMastery).default([]),
  missions: z.array(zMissionRecord).default([]),
  badges: z.array(zBadge).default([]),
  preferences: zPreferences.default({}),
  /** Modules telecharges pour un usage hors ligne. */
  offlineModules: z.array(zId).default([]),
});

/** Sauvegarde deterministe d une session en cours : reprise exacte garantie. */
export const zSaveState = z.object({
  schemaVersion: z.literal(1).default(1),
  id: zId,
  coreVersion: zSemVer,
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  seed: zSeed,
  world: zWorldState,
  mission: zMissionState.optional(),
  eventLog: zEventLog,
  /** Position et camera du joueur dans le campus. */
  presence: z
    .object({
      area: zId.default('lobby'),
      position: z.tuple([z.number(), z.number(), z.number()]).default([0, 0, 0]),
      rotationY: z.number().default(0),
      cameraMode: z
        .enum(['first-person', 'third-person', 'equipment', 'tactical', 'network'])
        .default('third-person'),
    })
    .default({}),
  /** Empreinte d integrite du contenu serialise, verifiee au chargement. */
  integrity: z.string().min(8),
});

export const zSnapshot = z.object({
  schemaVersion: z.literal(1).default(1),
  id: zId,
  name: z.string().min(1).max(64),
  kind: z.enum(['autosave', 'manual', 'checkpoint', 'exam']).default('manual'),
  createdAt: z.number().int().nonnegative(),
  saveId: zId,
  save: zSaveState,
  parentSnapshotId: zId.optional(),
  note: z.string().max(280).optional(),
});

export type AccessibilityPrefs = z.infer<typeof zAccessibilityPrefs>;
export type GraphicsQuality = z.infer<typeof zGraphicsQuality>;
export type Preferences = z.infer<typeof zPreferences>;
export type Badge = z.infer<typeof zBadge>;
export type MissionRecord = z.infer<typeof zMissionRecord>;
export type PlayerProgress = z.infer<typeof zPlayerProgress>;
export type SaveState = z.infer<typeof zSaveState>;
export type Snapshot = z.infer<typeof zSnapshot>;
