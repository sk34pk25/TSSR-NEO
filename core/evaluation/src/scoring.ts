import type {
  MissionDefinition,
  MissionScore,
  MissionState,
  ScoreDimension,
} from '@tssr/contracts';
import { SCORE_DIMENSIONS } from '@tssr/contracts';
import type { EventBus } from '@tssr/events';

export interface ScoringInput {
  definition: MissionDefinition;
  state: MissionState;
  bus: EventBus;
  durationMs: number;
  /** Resultats des verifications de securite (assertions "unchanged", pas de casse). */
  safetyPassed: number;
  safetyTotal: number;
}

/** Ponderation par defaut : la justesse technique prime, sans ecraser le reste. */
const WEIGHTS: Record<ScoreDimension, number> = {
  technicalAccuracy: 3,
  diagnosis: 2,
  autonomy: 1.5,
  efficiency: 1,
  impact: 1.5,
  safety: 2,
  verification: 1.5,
  documentation: 1,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Score multidimensionnel.
 * La lenteur d un debutant n est jamais penalisee mecaniquement : l efficacite
 * mesure le nombre d actions inutiles, pas le temps ecoule.
 */
export function scoreMission(input: ScoringInput): MissionScore {
  const { definition, state, bus, durationMs } = input;
  const objectives = definition.objectives;
  const required = objectives.filter((o) => !o.optional);
  const completedRequired = required.filter(
    (o) => state.objectives.find((s) => s.objectiveId === o.id)?.status === 'completed',
  );
  const completedOptional = objectives.filter(
    (o) =>
      o.optional && state.objectives.find((s) => s.objectiveId === o.id)?.status === 'completed',
  );

  const requiredWeight = required.reduce((sum, o) => sum + o.weight, 0) || 1;
  const achievedWeight = completedRequired.reduce((sum, o) => sum + o.weight, 0);
  const technicalAccuracy = clamp(achievedWeight / requiredWeight);

  // Diagnostic : penalise les allers-retours (objectif rempli puis casse a nouveau).
  const toggles = state.objectives.reduce((sum, o) => sum + Math.max(0, o.toggles - 1), 0);
  const diagnosis = clamp(technicalAccuracy - toggles * 0.1);

  // Autonomie : chaque indice consomme coute selon son niveau.
  const hintCost = state.hintsUsed.reduce((sum, used) => {
    const hint = definition.hints.find((h) => h.id === used.hintId);
    return sum + (hint?.autonomyCost ?? 0.15);
  }, 0);
  const autonomy = clamp(1 - hintCost);

  // Efficacite : rapport entre actions de configuration et actions strictement utiles.
  const configChanges = bus.count((e) => e.category === 'config-change');
  const expectedChanges = Math.max(1, required.length);
  const efficiency = clamp(expectedChanges / Math.max(expectedChanges, configChanges));

  // Verification : le technicien a-t-il controle son travail (ping, test, statut) ?
  const verificationCommands = bus.count(
    (e) =>
      e.type === 'terminal.command' &&
      /ping|test-netconnection|systemctl status|get-service|dig|nslookup|resolve-dnsname|ip a|ipconfig|traceroute/i.test(
        String(e.payload.command ?? ''),
      ),
  );
  const verification = clamp(verificationCommands / Math.max(2, required.length));

  // Documentation : commentaires et resolutions renseignes dans les tickets.
  const documented = bus.count(
    (e) => e.type === 'itsm.ticket.resolved' && e.payload.documented === true,
  );
  const comments = bus.count((e) => e.type === 'itsm.ticket.comment');
  const documentation =
    definition.ticketIds.length === 0
      ? 1
      : clamp((documented + Math.min(comments, 2) * 0.25) / definition.ticketIds.length);

  const safety = input.safetyTotal === 0 ? 1 : clamp(input.safetyPassed / input.safetyTotal);

  // Impact : degradation reelle causee pendant l intervention.
  const incidents = bus.count(
    (e) => e.category === 'incident' && e.type === 'monitoring.alert.raised',
  );
  const impact = clamp(1 - incidents * 0.2);

  const dimensions: Record<ScoreDimension, number> = {
    technicalAccuracy,
    diagnosis,
    autonomy,
    efficiency,
    impact,
    safety,
    verification,
    documentation,
  };

  const totalWeight = SCORE_DIMENSIONS.reduce((sum, d) => sum + WEIGHTS[d], 0);
  const overall = clamp(
    SCORE_DIMENSIONS.reduce((sum, d) => sum + dimensions[d] * WEIGHTS[d], 0) / totalWeight,
  );

  // Progression de maitrise : proportionnelle a la reussite, jamais negative sur un echec unique.
  const competencyDeltas = definition.competencies.map((competencyId) => ({
    competencyId,
    delta:
      Math.round((technicalAccuracy * 0.6 + autonomy * 0.2 + verification * 0.2 - 0.25) * 100) /
      100,
  }));

  return {
    missionId: definition.id,
    dimensions,
    overall: Math.round(overall * 1000) / 1000,
    objectivesCompleted: completedRequired.length + completedOptional.length,
    objectivesTotal: objectives.length,
    hintsUsed: state.hintsUsed.length,
    durationMs,
    competencyDeltas,
  };
}

/** Libelle pedagogique du score : jamais une note officielle ni une certification. */
export function scoreLabel(overall: number): string {
  if (overall >= 0.9) return 'maitrise';
  if (overall >= 0.75) return 'solide';
  if (overall >= 0.55) return 'en progression';
  if (overall >= 0.35) return 'a consolider';
  return 'a retravailler';
}
