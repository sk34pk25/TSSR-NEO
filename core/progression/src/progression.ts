import type {
  Badge,
  CompetencyMastery,
  DifficultyMode,
  MissionDefinition,
  MissionScore,
  PlayerProgress,
  PrerequisiteCheck,
} from '@tssr/contracts';
import { observedFromScore, updateMastery, weakestFirst } from './mastery.ts';

/** Palier d experience : progression lisible, sans inflation. */
export function levelForXp(xp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(xp / 50)) + 1);
}

export function xpForLevel(level: number): number {
  return Math.max(0, (level - 1) ** 2 * 50);
}

const RANKS: { rank: PlayerProgress['careerRank']; minLevel: number }[] = [
  { rank: 'junior', minLevel: 1 },
  { rank: 'technician', minLevel: 4 },
  { rank: 'senior', minLevel: 9 },
  { rank: 'lead', minLevel: 15 },
];

export function rankForLevel(level: number): PlayerProgress['careerRank'] {
  let result: PlayerProgress['careerRank'] = 'junior';
  for (const entry of RANKS) if (level >= entry.minLevel) result = entry.rank;
  return result;
}

/** XP gagne : proportionnel a la qualite reelle, jamais au temps passe. */
export function xpForMission(definition: MissionDefinition, score: MissionScore, firstCompletion: boolean): number {
  const base = definition.estimatedMinutes * 2;
  const quality = 0.4 + score.overall * 0.6;
  const repeatFactor = firstCompletion ? 1 : 0.25;
  return Math.round(base * quality * repeatFactor);
}

export interface BadgeRule {
  id: string;
  label: string;
  description: string;
  /** Evalue sur la progression apres mise a jour. */
  earned: (progress: PlayerProgress, score: MissionScore) => boolean;
}

/** Badges pedagogiques uniquement : ni certification, ni attestation. */
export const BADGE_RULES: BadgeRule[] = [
  {
    id: 'badge-premiere-resolution',
    label: 'Premiere resolution',
    description: 'Premiere mission menee a son terme.',
    earned: (progress) => progress.missions.filter((m) => m.completed).length >= 1,
  },
  {
    id: 'badge-autonome',
    label: 'En autonomie',
    description: 'Mission reussie sans consulter le moindre indice.',
    earned: (_progress, score) => score.hintsUsed === 0 && score.overall >= 0.7,
  },
  {
    id: 'badge-methodique',
    label: 'Methodique',
    description: 'Verification et documentation au rendez-vous sur une meme mission.',
    earned: (_progress, score) =>
      (score.dimensions.verification ?? 0) >= 0.6 && (score.dimensions.documentation ?? 0) >= 0.8,
  },
  {
    id: 'badge-sans-degat',
    label: 'Sans degat collateral',
    description: 'Intervention menee sans rien casser autour.',
    earned: (_progress, score) => (score.dimensions.safety ?? 0) === 1 && (score.dimensions.impact ?? 0) === 1,
  },
  {
    id: 'badge-perseverant',
    label: 'Perseverant',
    description: 'Cinq missions differentes terminees.',
    earned: (progress) => progress.missions.filter((m) => m.completed).length >= 5,
  },
];

export interface ProgressionUpdate {
  progress: PlayerProgress;
  xpGained: number;
  levelUp: boolean;
  newBadges: Badge[];
  masteryChanges: { competencyId: string; before: number; after: number }[];
}

/** Applique le resultat d une mission a la progression du joueur. */
export function applyMissionResult(
  progress: PlayerProgress,
  definition: MissionDefinition,
  score: MissionScore,
  now = Date.now(),
): ProgressionUpdate {
  const next: PlayerProgress = structuredClone(progress);
  const record = next.missions.find((m) => m.missionId === definition.id);
  const firstCompletion = record === undefined || !record.completed;

  const xpGained = xpForMission(definition, score, firstCompletion);
  next.xp += xpGained;
  const previousLevel = next.level;
  next.level = levelForXp(next.xp);
  next.careerRank = rankForLevel(next.level);
  next.updatedAt = now;

  if (record) {
    record.attempts += 1;
    record.lastScore = score;
    record.lastPlayedAt = now;
    record.completed = record.completed || score.overall >= 0.5;
    if ((record.bestScore?.overall ?? 0) < score.overall) record.bestScore = score;
  } else {
    next.missions.push({
      missionId: definition.id,
      attempts: 1,
      bestScore: score,
      lastScore: score,
      completed: score.overall >= 0.5,
      lastPlayedAt: now,
    });
  }

  const masteryChanges: ProgressionUpdate['masteryChanges'] = [];
  for (const competencyId of definition.competencies) {
    const current = next.competencies.find((c) => c.competencyId === competencyId);
    const observed = observedFromScore(score, competencyId);
    const updated = updateMastery(current, competencyId, observed, now);
    masteryChanges.push({ competencyId, before: current?.mastery ?? 0, after: updated.mastery });
    if (current) Object.assign(current, updated);
    else next.competencies.push(updated);
  }

  const newBadges: Badge[] = [];
  for (const rule of BADGE_RULES) {
    if (next.badges.some((b) => b.id === rule.id)) continue;
    if (rule.earned(next, score)) {
      const badge: Badge = { id: rule.id, earnedAt: now, missionId: definition.id };
      next.badges.push(badge);
      newBadges.push(badge);
    }
  }

  return { progress: next, xpGained, levelUp: next.level > previousLevel, newBadges, masteryChanges };
}

export interface PrerequisiteReport {
  satisfied: boolean;
  blocking: { competencyId: string; required: number; actual: number }[];
  advisory: { competencyId: string; required: number; actual: number }[];
}

/**
 * Verification des prerequis.
 * Un prerequis non bloquant informe sans interdire : on ne verrouille jamais
 * arbitrairement l acces a un contenu.
 */
export function checkPrerequisites(
  progress: PlayerProgress,
  prerequisites: readonly PrerequisiteCheck[],
): PrerequisiteReport {
  const blocking: PrerequisiteReport['blocking'] = [];
  const advisory: PrerequisiteReport['advisory'] = [];
  for (const prerequisite of prerequisites) {
    const mastery = progress.competencies.find((c) => c.competencyId === prerequisite.competencyId);
    const actual = mastery?.mastery ?? 0;
    if (actual >= prerequisite.requiredMastery) continue;
    const entry = { competencyId: prerequisite.competencyId, required: prerequisite.requiredMastery, actual };
    if (prerequisite.blocking) blocking.push(entry);
    else advisory.push(entry);
  }
  return { satisfied: blocking.length === 0, blocking, advisory };
}

/**
 * Difficulte adaptative : elle suit la maitrise reelle des competences visees.
 * Elle ne change jamais brutalement de plus d un cran.
 */
export function suggestDifficulty(
  progress: PlayerProgress,
  competencyIds: readonly string[],
  current: DifficultyMode = 'standard',
): DifficultyMode {
  const ladder: DifficultyMode[] = ['guided', 'standard', 'advanced', 'expert'];
  const relevant = competencyIds
    .map((id) => progress.competencies.find((c) => c.competencyId === id))
    .filter((c): c is CompetencyMastery => c !== undefined);
  if (relevant.length === 0) return 'guided';
  const average = relevant.reduce((sum, c) => sum + c.mastery, 0) / relevant.length;
  const confidence = relevant.reduce((sum, c) => sum + c.confidence, 0) / relevant.length;
  const target: DifficultyMode =
    average >= 0.85 && confidence >= 0.6 ? 'expert' : average >= 0.65 ? 'advanced' : average >= 0.35 ? 'standard' : 'guided';
  const currentIndex = ladder.indexOf(current === 'adaptive' ? 'standard' : current);
  const targetIndex = ladder.indexOf(target);
  const step = Math.sign(targetIndex - currentIndex);
  return ladder[currentIndex + step] ?? target;
}

/** Selection d une session de revision courte, guidee par la repetition espacee. */
export function planReviewSession(
  progress: PlayerProgress,
  minutes: number,
  now = Date.now(),
): { competencyId: string; mastery: number; reason: 'due' | 'weak' }[] {
  const perItemMinutes = 2.5;
  const capacity = Math.max(1, Math.floor(minutes / perItemMinutes));
  return weakestFirst(progress.competencies, now)
    .slice(0, capacity)
    .map((c) => ({
      competencyId: c.competencyId,
      mastery: c.mastery,
      reason: c.dueAt !== undefined && c.dueAt <= now ? ('due' as const) : ('weak' as const),
    }));
}

export function createProfile(profileId: string, displayName = 'Technicien', now = Date.now()): PlayerProgress {
  return {
    schemaVersion: 1,
    profileId,
    displayName,
    createdAt: now,
    updatedAt: now,
    xp: 0,
    level: 1,
    careerRank: 'junior',
    competencies: [],
    missions: [],
    badges: [],
    preferences: {
      locale: 'fr',
      graphicsQuality: 'auto',
      difficulty: 'adaptive',
      audio: { master: 0.7, music: 0.4, sfx: 0.8, ambience: 0.5, voice: 0.8 },
      accessibility: {
        uiScale: 1,
        textSize: 'm',
        contrast: 'normal',
        colorBlindMode: 'none',
        reduceMotion: false,
        reduceVisualComplexity: false,
        subtitles: true,
        keyboardOnly: false,
        screenReaderHints: false,
      },
      novaVerbosity: 'normal',
      telemetryConsent: false,
      keybindings: {},
    },
    offlineModules: [],
  };
}
