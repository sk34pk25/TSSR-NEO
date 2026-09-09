import type { CompetencyMastery, MissionScore } from '@tssr/contracts';

/**
 * Modele de maitrise.
 * La maitrise evolue par moyenne mobile ponderee par la confiance :
 * une seule reussite ne suffit pas a declarer une competence acquise,
 * et un seul echec ne detruit pas un acquis.
 */
export function updateMastery(
  current: CompetencyMastery | undefined,
  competencyId: string,
  observed: number,
  now: number,
): CompetencyMastery {
  const previous = current ?? {
    competencyId,
    mastery: 0,
    confidence: 0,
    observations: 0,
    lastPracticedAt: now,
  };
  const observations = previous.observations + 1;
  // Poids decroissant : les premieres observations pesent plus lourd, ensuite on stabilise.
  const weight = Math.max(0.15, 1 / (observations + 1));
  const mastery = Math.max(0, Math.min(1, previous.mastery * (1 - weight) + observed * weight));
  const confidence = Math.min(1, observations / 5);
  return {
    competencyId,
    mastery: Math.round(mastery * 1000) / 1000,
    confidence: Math.round(confidence * 100) / 100,
    observations,
    lastPracticedAt: now,
    dueAt: nextReviewAt(mastery, observations, now),
  };
}

/**
 * Repetition espacee : plus la maitrise est haute, plus la revision est lointaine.
 * Intervalles en jours : 1, 3, 7, 16, 35.
 */
export function nextReviewAt(mastery: number, observations: number, now: number): number {
  const steps = [1, 3, 7, 16, 35];
  const index = Math.min(steps.length - 1, Math.max(0, Math.floor(mastery * steps.length) - (mastery < 0.5 ? 1 : 0)));
  const base = steps[index] ?? 1;
  const bonus = observations >= 5 && mastery >= 0.8 ? 1.5 : 1;
  return now + Math.round(base * bonus * 24 * 3600 * 1000);
}

export function isDue(mastery: CompetencyMastery, now: number): boolean {
  return mastery.dueAt === undefined || mastery.dueAt <= now;
}

/** Competences a retravailler en priorite : faible maitrise et echeance depassee d abord. */
export function weakestFirst(masteries: readonly CompetencyMastery[], now: number): CompetencyMastery[] {
  return [...masteries].sort((a, b) => {
    const dueA = isDue(a, now) ? 0 : 1;
    const dueB = isDue(b, now) ? 0 : 1;
    if (dueA !== dueB) return dueA - dueB;
    return a.mastery - b.mastery;
  });
}

/** Observation deduite d un score de mission, bornee entre 0 et 1. */
export function observedFromScore(score: MissionScore, competencyId: string): number {
  const delta = score.competencyDeltas.find((d) => d.competencyId === competencyId);
  if (delta) return Math.max(0, Math.min(1, 0.5 + delta.delta));
  return score.dimensions.technicalAccuracy ?? score.overall;
}
