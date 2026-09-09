import type { Competency, MissionDefinition, PlayerProgress } from '@tssr/contracts';
import type { StorageAdapter } from '@tssr/storage';

/**
 * Cockpit formateur, entierement local.
 *
 * Aucune synchronisation distante n est simulee : la cohorte vit dans le
 * stockage de l appareil. Chaque apprenant porte une origine explicite, de
 * sorte qu un profil de demonstration ne puisse jamais etre confondu avec un
 * apprenant reel.
 */

export type LearnerOrigin = 'local' | 'demonstration';

export interface Learner {
  id: string;
  displayName: string;
  /** Provenance de la donnee : elle est affichee, jamais deduite. */
  origin: LearnerOrigin;
  progress: PlayerProgress;
}

export interface Assignment {
  id: string;
  missionId: string;
  title: string;
  createdAt: number;
  dueAt?: number;
  learnerIds: string[];
  note?: string;
}

export interface Cohort {
  schemaVersion: 1;
  id: string;
  name: string;
  learners: Learner[];
  assignments: Assignment[];
}

const COHORT_KEY = 'cohort';

export function createCohort(id = 'classe-locale', name = 'Groupe local'): Cohort {
  return { schemaVersion: 1, id, name, learners: [], assignments: [] };
}

export interface CompetencyReport {
  competencyId: string;
  label: string;
  /** Moyenne de maitrise sur les apprenants ayant reellement pratique. */
  averageMastery: number;
  learnersMeasured: number;
  learnersBelowThreshold: number;
  /** Apprenants dont la maitrise reste fragile, du plus faible au moins faible. */
  fragile: { learnerId: string; displayName: string; mastery: number }[];
}

export interface MissionReport {
  missionId: string;
  title: string;
  attempted: number;
  completed: number;
  averageAttempts: number;
  averageScore: number;
  averageHints: number;
}

export interface CohortReport {
  cohortId: string;
  learners: number;
  demonstrationLearners: number;
  competencies: CompetencyReport[];
  missions: MissionReport[];
  /** Points faibles du groupe, tries par urgence pedagogique. */
  weakPoints: { competencyId: string; label: string; reason: string; severity: number }[];
}

function localized(value: unknown, locale = 'fr'): string {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, string>;
    return record[locale] ?? Object.values(record)[0] ?? '';
  }
  return '';
}

/**
 * Analyse d une cohorte.
 * Toutes les moyennes ignorent les apprenants qui n ont pas pratique : une
 * competence jamais travaillee n est pas une competence a zero.
 */
export function analyseCohort(
  cohort: Cohort,
  competencies: readonly Competency[],
  missions: readonly MissionDefinition[],
  threshold = 0.5,
): CohortReport {
  const competencyReports: CompetencyReport[] = competencies.map((competency) => {
    const measured = cohort.learners
      .map((learner) => ({
        learner,
        entry: learner.progress.competencies.find((c) => c.competencyId === competency.id),
      }))
      .filter((row) => row.entry !== undefined && row.entry.observations > 0);

    const average =
      measured.length === 0
        ? 0
        : measured.reduce((sum, row) => sum + (row.entry?.mastery ?? 0), 0) / measured.length;

    const fragile = measured
      .filter((row) => (row.entry?.mastery ?? 0) < threshold)
      .map((row) => ({
        learnerId: row.learner.id,
        displayName: row.learner.displayName,
        mastery: row.entry?.mastery ?? 0,
      }))
      .sort((a, b) => a.mastery - b.mastery);

    return {
      competencyId: competency.id,
      label: localized(competency.label),
      averageMastery: Math.round(average * 1000) / 1000,
      learnersMeasured: measured.length,
      learnersBelowThreshold: fragile.length,
      fragile,
    };
  });

  const missionReports: MissionReport[] = missions.map((mission) => {
    const records = cohort.learners
      .map((learner) => learner.progress.missions.find((m) => m.missionId === mission.id))
      .filter((record): record is NonNullable<typeof record> => record !== undefined);

    const completed = records.filter((record) => record.completed).length;
    const totalAttempts = records.reduce((sum, record) => sum + record.attempts, 0);
    const totalScore = records.reduce((sum, record) => sum + (record.bestScore?.overall ?? 0), 0);
    const totalHints = records.reduce((sum, record) => sum + (record.lastScore?.hintsUsed ?? 0), 0);

    return {
      missionId: mission.id,
      title: localized(mission.title),
      attempted: records.length,
      completed,
      averageAttempts:
        records.length === 0 ? 0 : Math.round((totalAttempts / records.length) * 10) / 10,
      averageScore:
        records.length === 0 ? 0 : Math.round((totalScore / records.length) * 100) / 100,
      averageHints: records.length === 0 ? 0 : Math.round((totalHints / records.length) * 10) / 10,
    };
  });

  const weakPoints = competencyReports
    .filter((report) => report.learnersMeasured > 0)
    .map((report) => {
      const share = report.learnersBelowThreshold / report.learnersMeasured;
      return {
        competencyId: report.competencyId,
        label: report.label,
        reason:
          share >= 0.5
            ? `plus de la moitie du groupe reste sous le seuil de maitrise`
            : `${report.learnersBelowThreshold} apprenant(s) sous le seuil`,
        // La severite combine l ampleur du retard et le nombre d apprenants concernes.
        severity: Math.round((1 - report.averageMastery) * share * 1000) / 1000,
      };
    })
    .filter((entry) => entry.severity > 0)
    .sort((a, b) => b.severity - a.severity);

  return {
    cohortId: cohort.id,
    learners: cohort.learners.length,
    demonstrationLearners: cohort.learners.filter((l) => l.origin === 'demonstration').length,
    competencies: competencyReports,
    missions: missionReports,
    weakPoints,
  };
}

/** Depot local de la cohorte : rien ne quitte l appareil. */
export class ClassroomStore {
  private cohort: Cohort;
  private readonly storage: StorageAdapter | undefined;

  constructor(storage?: StorageAdapter, cohort: Cohort = createCohort()) {
    this.storage = storage;
    this.cohort = cohort;
  }

  async load(): Promise<Cohort> {
    const stored = await this.storage?.get<Cohort>('progress', COHORT_KEY);
    if (stored && Array.isArray(stored.learners)) this.cohort = stored;
    return this.cohort;
  }

  private async persist(): Promise<void> {
    await this.storage?.put('progress', COHORT_KEY, this.cohort);
  }

  get(): Cohort {
    return this.cohort;
  }

  /** Met a jour l apprenant reel de cet appareil. */
  async upsertLocalLearner(progress: PlayerProgress): Promise<void> {
    const existing = this.cohort.learners.find((learner) => learner.id === progress.profileId);
    if (existing) {
      existing.progress = progress;
      existing.displayName = progress.displayName;
    } else {
      this.cohort.learners.unshift({
        id: progress.profileId,
        displayName: progress.displayName,
        origin: 'local',
        progress,
      });
    }
    await this.persist();
  }

  async addDemonstrationLearner(learner: Omit<Learner, 'origin'>): Promise<void> {
    this.cohort.learners.push({ ...learner, origin: 'demonstration' });
    await this.persist();
  }

  async removeLearner(id: string): Promise<void> {
    this.cohort.learners = this.cohort.learners.filter((learner) => learner.id !== id);
    await this.persist();
  }

  async createAssignment(
    assignment: Omit<Assignment, 'id' | 'createdAt'>,
    now: number,
  ): Promise<Assignment> {
    const created: Assignment = {
      ...assignment,
      id: `aff-${this.cohort.assignments.length + 1}-${now}`,
      createdAt: now,
    };
    this.cohort.assignments.push(created);
    await this.persist();
    return created;
  }

  async removeAssignment(id: string): Promise<void> {
    this.cohort.assignments = this.cohort.assignments.filter((entry) => entry.id !== id);
    await this.persist();
  }

  /** Avancement d une affectation, calcule sur la progression reelle. */
  assignmentProgress(assignment: Assignment): { done: number; total: number } {
    const learners = this.cohort.learners.filter((learner) =>
      assignment.learnerIds.includes(learner.id),
    );
    const done = learners.filter((learner) =>
      learner.progress.missions.some((m) => m.missionId === assignment.missionId && m.completed),
    ).length;
    return { done, total: learners.length };
  }
}
