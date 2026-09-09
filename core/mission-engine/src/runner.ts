import type {
  DifficultyMode,
  DynamicEvent,
  Hint,
  MissionDefinition,
  MissionScore,
  MissionState,
  ObjectiveState,
  WorldState,
} from '@tssr/contracts';
import type { EventBus } from '@tssr/events';
import {
  evaluateAssertion,
  scoreMission,
  type AssertionResult,
  type EvaluationContext,
} from '@tssr/evaluation';
import type { SimulationWorld } from '@tssr/sim-world';

export interface ObjectiveView {
  id: string;
  label: string;
  optional: boolean;
  hidden: boolean;
  status: ObjectiveState['status'];
  /** Explication de l ecart, affichee seulement si la difficulte l autorise. */
  detail?: string;
}

export interface MissionTick {
  completed: string[];
  regressed: string[];
  firedEvents: string[];
  failed?: { id: string; label: string };
}

export interface MissionSummary {
  missionId: string;
  title: string;
  objectives: ObjectiveView[];
  commandsUsed: string[];
  hintsUsed: number;
  keyPoints: string[];
  alternatives: MissionDefinition['debrief']['alternatives'];
  knowledgeEntryIds: string[];
  timeline: { at: number; label: string; type: string }[];
  score?: MissionScore;
}

/** Niveau maximal d indice accessible selon le mode de difficulte. */
const MAX_HINT_LEVEL: Record<DifficultyMode, number> = {
  guided: 4,
  standard: 3,
  advanced: 2,
  expert: 1,
  adaptive: 3,
};

/** La difficulte determine la quantite d aide affichee, jamais la verite technique. */
const SHOW_OBJECTIVE_DETAIL: Record<DifficultyMode, boolean> = {
  guided: true,
  standard: true,
  advanced: false,
  expert: false,
  adaptive: true,
};

function localized(value: unknown, locale = 'fr'): string {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, string>;
    return record[locale] ?? Object.values(record)[0] ?? '';
  }
  return '';
}

/**
 * Deroulement d une mission.
 * Les objectifs ne sont jamais valides par un clic : ils sont reevalues
 * contre l etat reel du monde a chaque changement significatif.
 */
export class MissionRunner {
  readonly definition: MissionDefinition;
  readonly world: SimulationWorld;
  readonly state: MissionState;
  private readonly bus: EventBus;
  private readonly baseline: WorldState;
  private readonly startedAtWall: number;
  private lastResults = new Map<string, AssertionResult>();

  constructor(
    definition: MissionDefinition,
    world: SimulationWorld,
    options: { seed?: number; difficulty?: DifficultyMode; variantId?: string; now?: number } = {},
  ) {
    this.definition = definition;
    this.world = world;
    this.bus = world.bus;
    this.baseline = world.snapshotState();
    this.startedAtWall = options.now ?? Date.now();
    this.state = {
      schemaVersion: 1,
      missionId: definition.id,
      ...(options.variantId === undefined ? {} : { variantId: options.variantId }),
      seed: options.seed ?? world.state.seed,
      startedAt: this.startedAtWall,
      simTime: world.state.simTime,
      status: 'briefing',
      objectives: definition.objectives.map((o) => ({
        objectiveId: o.id,
        status: 'pending',
        toggles: 0,
        discovered: !o.hidden,
      })),
      hintsUsed: [],
      firedEventIds: [],
      difficulty: options.difficulty ?? definition.difficulty,
      actionCount: 0,
    };
  }

  private context(): EvaluationContext {
    return { world: this.world, baseline: this.baseline };
  }

  start(): void {
    this.state.status = 'active';
    this.bus.emit({
      category: 'mission',
      type: 'mission.started',
      payload: { missionId: this.definition.id, difficulty: this.state.difficulty },
      significant: true,
      label: `Mission demarree : ${localized(this.definition.title)}`,
    });
    this.tick();
  }

  /**
   * Reevalue objectifs, evenements dynamiques et conditions d echec.
   * A appeler apres toute action du joueur ou avancee du temps simule.
   */
  tick(): MissionTick {
    const result: MissionTick = { completed: [], regressed: [], firedEvents: [] };
    if (this.state.status !== 'active') return result;

    this.state.simTime = this.world.state.simTime;
    const ctx = this.context();

    for (const objective of this.definition.objectives) {
      const evaluation = evaluateAssertion(objective.check, ctx);
      this.lastResults.set(objective.id, evaluation);
      const entry = this.state.objectives.find((o) => o.objectiveId === objective.id);
      if (!entry) continue;

      if (evaluation.passed && entry.status !== 'completed') {
        entry.status = 'completed';
        entry.completedAt = this.state.simTime;
        entry.toggles += 1;
        entry.discovered = true;
        result.completed.push(objective.id);
        this.bus.emit({
          category: 'objective',
          type: 'mission.objective.completed',
          payload: { missionId: this.definition.id, objectiveId: objective.id },
          significant: true,
          label: `Objectif atteint : ${localized(objective.label)}`,
        });
      } else if (!evaluation.passed && entry.status === 'completed') {
        // Regression : l objectif etait rempli et ne l est plus. Cela compte.
        entry.status = 'pending';
        result.regressed.push(objective.id);
        this.bus.emit({
          category: 'objective',
          type: 'mission.objective.regressed',
          payload: {
            missionId: this.definition.id,
            objectiveId: objective.id,
            reason: evaluation.detail,
          },
          significant: true,
          label: `Objectif de nouveau en echec : ${localized(objective.label)}`,
        });
      }
    }

    for (const event of this.definition.dynamicEvents) {
      if (event.once && this.state.firedEventIds.includes(event.id)) continue;
      if (this.shouldFire(event, ctx)) {
        this.applyEvent(event);
        this.state.firedEventIds.push(event.id);
        result.firedEvents.push(event.id);
      }
    }

    for (const condition of this.definition.failureConditions) {
      if (evaluateAssertion(condition.when, ctx).passed) {
        this.state.status = 'failed';
        this.state.failureReason = localized(condition.label);
        result.failed = { id: condition.id, label: localized(condition.label) };
        this.bus.emit({
          category: 'mission',
          type: 'mission.failed',
          payload: { missionId: this.definition.id, condition: condition.id },
          significant: true,
          label: `Mission en echec : ${localized(condition.label)}`,
        });
        return result;
      }
    }

    if (this.requiredObjectives().every((o) => this.statusOf(o.id) === 'completed')) {
      this.state.status = 'succeeded';
      this.bus.emit({
        category: 'mission',
        type: 'mission.succeeded',
        payload: { missionId: this.definition.id },
        significant: true,
        label: `Mission reussie : ${localized(this.definition.title)}`,
      });
    }

    return result;
  }

  private shouldFire(event: DynamicEvent, ctx: EvaluationContext): boolean {
    switch (event.trigger.kind) {
      case 'after-ms':
        return this.world.state.simTime >= event.trigger.ms;
      case 'objective-completed':
        return this.statusOf(event.trigger.objectiveId) === 'completed';
      case 'condition':
        return evaluateAssertion(event.trigger.when, ctx).passed;
      default:
        return false;
    }
  }

  private applyEvent(event: DynamicEvent): void {
    for (const effect of event.effects) {
      switch (effect.kind) {
        case 'set-link':
          this.world.network.setLinkConnected(effect.linkId, effect.connected);
          break;
        case 'set-service-status':
          this.world.network.setServiceStatus(effect.nodeId, effect.serviceId, effect.status);
          break;
        case 'set-interface-enabled':
          this.world.network.setInterfaceEnabled(
            effect.nodeId,
            effect.interfaceName,
            effect.enabled,
          );
          break;
        case 'set-node-power':
          this.world.network.setNodePower(effect.nodeId, effect.powered);
          break;
        case 'open-ticket': {
          const ticket = this.world.itsm.ticket(effect.ticketId);
          if (ticket) ticket.status = ticket.status === 'new' ? 'new' : ticket.status;
          break;
        }
        case 'set-component-health':
          this.world.hardware.setComponentHealth(effect.assetId, effect.componentId, effect.health);
          break;
        case 'npc-message':
          this.bus.emit({
            category: 'mission',
            type: 'mission.npc.message',
            payload: { npcId: effect.npcId, text: localized(effect.text) },
            significant: true,
            label: localized(effect.text),
          });
          break;
        case 'log': {
          const system = this.world.state.systems.find((s) => s.networkNodeId === effect.nodeId);
          system?.logs.push({
            at: this.world.state.simTime,
            source: 'scenario',
            level: effect.level,
            message: effect.message,
          });
          break;
        }
        default:
          break;
      }
    }
    this.bus.emit({
      category: 'mission',
      type: 'mission.event.fired',
      payload: { missionId: this.definition.id, eventId: event.id },
      significant: true,
      ...(event.label === undefined ? {} : { label: localized(event.label) }),
    });
  }

  private requiredObjectives() {
    return this.definition.objectives.filter((o) => !o.optional);
  }

  statusOf(objectiveId: string): ObjectiveState['status'] {
    return this.state.objectives.find((o) => o.objectiveId === objectiveId)?.status ?? 'pending';
  }

  /** Vue des objectifs adaptee a la difficulte : le detail n est pas toujours revele. */
  objectives(locale = 'fr'): ObjectiveView[] {
    const showDetail = SHOW_OBJECTIVE_DETAIL[this.state.difficulty];
    return this.definition.objectives
      .filter(
        (o) =>
          !o.hidden ||
          this.state.objectives.find((s) => s.objectiveId === o.id)?.discovered === true,
      )
      .map((o) => {
        const status = this.statusOf(o.id);
        const result = this.lastResults.get(o.id);
        return {
          id: o.id,
          label: localized(o.label, locale),
          optional: o.optional,
          hidden: o.hidden,
          status,
          ...(showDetail && status !== 'completed' && result !== undefined
            ? { detail: result.detail }
            : {}),
        };
      });
  }

  /** Indices disponibles : contextuels, progressifs, plafonnes par la difficulte. */
  availableHints(): Hint[] {
    const maxLevel = MAX_HINT_LEVEL[this.state.difficulty];
    const ctx = this.context();
    const usedIds = new Set(this.state.hintsUsed.map((h) => h.hintId));
    return this.definition.hints
      .filter((h) => h.level <= maxLevel)
      .filter((h) => !usedIds.has(h.id))
      .filter((h) => h.objectiveId === undefined || this.statusOf(h.objectiveId) !== 'completed')
      .filter((h) => h.when === undefined || evaluateAssertion(h.when, ctx).passed)
      .sort((a, b) => a.level - b.level);
  }

  /** Consomme l indice le plus leger disponible : NOVA ne donne jamais la solution d emblee. */
  requestHint(): Hint | undefined {
    const hint = this.availableHints()[0];
    if (!hint) return undefined;
    this.state.hintsUsed.push({ hintId: hint.id, at: this.world.state.simTime });
    this.bus.emit({
      category: 'hint',
      type: 'mission.hint.used',
      payload: { missionId: this.definition.id, hintId: hint.id, level: hint.level },
      significant: true,
      label: `Indice de niveau ${hint.level} consulte`,
    });
    return hint;
  }

  abandon(): void {
    this.state.status = 'abandoned';
    this.bus.emit({
      category: 'mission',
      type: 'mission.abandoned',
      payload: { missionId: this.definition.id },
      significant: true,
    });
  }

  score(now = Date.now()): MissionScore {
    const safetyChecks = this.definition.objectives.filter((o) => o.dimensions.includes('safety'));
    const safetyPassed = safetyChecks.filter((o) => this.statusOf(o.id) === 'completed').length;
    return scoreMission({
      definition: this.definition,
      state: this.state,
      bus: this.bus,
      durationMs: Math.max(0, now - this.startedAtWall),
      safetyPassed,
      safetyTotal: safetyChecks.length,
    });
  }

  /** Fiche de synthese de fin de mission. */
  summary(locale = 'fr', now = Date.now()): MissionSummary {
    const commands = this.bus
      .all()
      .filter((e) => e.type === 'terminal.command')
      .map((e) => String(e.payload.command ?? ''))
      .filter((c) => c !== '');
    return {
      missionId: this.definition.id,
      title: localized(this.definition.title, locale),
      objectives: this.objectives(locale),
      commandsUsed: [...new Set(commands)],
      hintsUsed: this.state.hintsUsed.length,
      keyPoints: this.definition.debrief.keyPoints.map((k) => localized(k, locale)),
      alternatives: this.definition.debrief.alternatives,
      knowledgeEntryIds: this.definition.debrief.knowledgeEntryIds,
      timeline: this.bus
        .timeline()
        .map((e) => ({ at: e.simTime, label: e.label ?? e.type, type: e.type })),
      ...(this.state.status === 'succeeded' || this.state.status === 'failed'
        ? { score: this.score(now) }
        : {}),
    };
  }
}
