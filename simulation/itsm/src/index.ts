import type {
  ChangeRequest,
  Impact,
  Priority,
  Ticket,
  TicketComment,
  TicketStatus,
  Urgency,
  WorldState,
} from '@tssr/contracts';
import { PRIORITY_MATRIX } from '@tssr/contracts';
import type { EventBus } from '@tssr/events';

/** Priorite derivee de la matrice impact x urgence : jamais saisie librement. */
export function computePriority(impact: Impact, urgency: Urgency): Priority {
  return PRIORITY_MATRIX[`${impact}|${urgency}`] ?? 'P3';
}

const DEFAULT_SLA_MINUTES: Record<Priority, number> = { P1: 60, P2: 240, P3: 480, P4: 1440 };

export interface SlaStatus {
  slaMinutes: number;
  elapsedMinutes: number;
  remainingMinutes: number;
  breached: boolean;
}

/**
 * Moteur ITSM relie a l etat technique : un ticket designe des elements
 * de configuration reels, et sa resolution est verifiable.
 */
export class ItsmEngine {
  private readonly world: WorldState;
  private readonly bus: EventBus | undefined;

  constructor(world: WorldState, options: { bus?: EventBus } = {}) {
    this.world = world;
    this.bus = options.bus;
  }

  get tickets(): Ticket[] {
    return this.world.tickets;
  }

  ticket(id: string): Ticket | undefined {
    return this.world.tickets.find((t) => t.id === id || t.reference === id);
  }

  private emit(type: string, payload: Record<string, unknown>, label?: string): void {
    this.bus?.emit({
      category: 'ticket',
      type,
      payload,
      significant: true,
      ...(label === undefined ? {} : { label }),
    });
  }

  private now(): number {
    return this.bus?.getSimTime() ?? this.world.simTime;
  }

  create(input: Omit<Ticket, 'schemaVersion' | 'priority' | 'createdAt' | 'updatedAt' | 'comments'> & { comments?: TicketComment[] }): Ticket {
    const priority = computePriority(input.impact, input.urgency);
    const ticket: Ticket = {
      schemaVersion: 1,
      ...input,
      priority,
      slaMinutes: input.slaMinutes ?? DEFAULT_SLA_MINUTES[priority],
      createdAt: this.now(),
      updatedAt: this.now(),
      comments: input.comments ?? [],
    };
    this.world.tickets.push(ticket);
    this.emit('itsm.ticket.created', { ticketId: ticket.id, priority }, `Ticket ${ticket.reference} ouvert`);
    return ticket;
  }

  /** Modifier impact ou urgence recalcule la priorite : la coherence est garantie. */
  reclassify(ticketId: string, impact: Impact, urgency: Urgency): Ticket | undefined {
    const ticket = this.ticket(ticketId);
    if (!ticket) return undefined;
    ticket.impact = impact;
    ticket.urgency = urgency;
    ticket.priority = computePriority(impact, urgency);
    ticket.slaMinutes = DEFAULT_SLA_MINUTES[ticket.priority];
    ticket.updatedAt = this.now();
    this.emit('itsm.ticket.reclassified', { ticketId, priority: ticket.priority });
    return ticket;
  }

  assign(ticketId: string, assignee: string): boolean {
    const ticket = this.ticket(ticketId);
    if (!ticket) return false;
    ticket.assignee = assignee;
    if (ticket.status === 'new') ticket.status = 'assigned';
    ticket.updatedAt = this.now();
    this.emit('itsm.ticket.assigned', { ticketId, assignee });
    return true;
  }

  setStatus(ticketId: string, status: TicketStatus): boolean {
    const ticket = this.ticket(ticketId);
    if (!ticket) return false;
    ticket.status = status;
    ticket.updatedAt = this.now();
    if (status === 'resolved') ticket.resolvedAt = this.now();
    this.emit('itsm.ticket.status', { ticketId, status }, `Ticket ${ticket.reference} -> ${status}`);
    return true;
  }

  comment(
    ticketId: string,
    comment: Omit<TicketComment, 'id' | 'at' | 'authorRole' | 'visibility'> &
      Partial<Pick<TicketComment, 'authorRole' | 'visibility'>>,
  ): boolean {
    const ticket = this.ticket(ticketId);
    if (!ticket) return false;
    ticket.comments.push({
      id: `c-${ticket.comments.length + 1}`,
      at: this.now(),
      authorRole: 'technician',
      visibility: 'public',
      ...comment,
    });
    ticket.updatedAt = this.now();
    this.emit('itsm.ticket.comment', { ticketId, author: comment.author });
    return true;
  }

  /** Cloture documentee : c est ce qui est evalue, pas le simple changement de statut. */
  resolve(ticketId: string, summary: string, rootCause?: string): boolean {
    const ticket = this.ticket(ticketId);
    if (!ticket) return false;
    ticket.resolutionSummary = summary;
    if (rootCause !== undefined) ticket.rootCause = rootCause;
    ticket.status = 'resolved';
    ticket.resolvedAt = this.now();
    ticket.updatedAt = this.now();
    this.emit(
      'itsm.ticket.resolved',
      { ticketId, documented: summary.length >= 40 },
      `Ticket ${ticket.reference} resolu`,
    );
    return true;
  }

  link(ticketId: string, otherId: string): boolean {
    const a = this.ticket(ticketId);
    const b = this.ticket(otherId);
    if (!a || !b) return false;
    if (!a.linkedTicketIds.includes(b.id)) a.linkedTicketIds.push(b.id);
    if (!b.linkedTicketIds.includes(a.id)) b.linkedTicketIds.push(a.id);
    this.emit('itsm.ticket.linked', { ticketId: a.id, otherId: b.id });
    return true;
  }

  /** Promotion en incident majeur : regroupe les tickets lies sous un incident parent. */
  declareMajorIncident(ticketId: string): boolean {
    const ticket = this.ticket(ticketId);
    if (!ticket) return false;
    ticket.majorIncident = true;
    ticket.impact = 'high';
    ticket.urgency = 'high';
    ticket.priority = 'P1';
    ticket.slaMinutes = DEFAULT_SLA_MINUTES.P1;
    for (const id of ticket.linkedTicketIds) {
      const child = this.ticket(id);
      if (child) child.parentTicketId = ticket.id;
    }
    this.emit('itsm.major-incident', { ticketId }, `Incident majeur declare : ${ticket.reference}`);
    return true;
  }

  sla(ticketId: string): SlaStatus | undefined {
    const ticket = this.ticket(ticketId);
    if (!ticket || ticket.slaMinutes === undefined) return undefined;
    const end = ticket.resolvedAt ?? this.now();
    const elapsed = Math.max(0, Math.round((end - ticket.createdAt) / 60000));
    return {
      slaMinutes: ticket.slaMinutes,
      elapsedMinutes: elapsed,
      remainingMinutes: ticket.slaMinutes - elapsed,
      breached: elapsed > ticket.slaMinutes,
    };
  }

  /** File de travail triee par priorite puis anciennete : base du module de priorisation. */
  queue(): Ticket[] {
    const rank: Record<Priority, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };
    return [...this.world.tickets]
      .filter((t) => t.status !== 'closed' && t.status !== 'cancelled' && t.status !== 'resolved')
      .sort((a, b) => rank[a.priority] - rank[b.priority] || a.createdAt - b.createdAt);
  }

  // ------------------------------------------------------------- changements

  createChange(change: Omit<ChangeRequest, 'schemaVersion'>): ChangeRequest {
    const record: ChangeRequest = { schemaVersion: 1, ...change };
    this.world.changes.push(record);
    this.emit('itsm.change.created', { changeId: record.id, risk: record.risk });
    return record;
  }

  change(id: string): ChangeRequest | undefined {
    return this.world.changes.find((c) => c.id === id);
  }

  submitChange(id: string): boolean {
    const change = this.change(id);
    if (!change) return false;
    change.approvalState = 'submitted';
    this.emit('itsm.change.submitted', { changeId: id });
    return true;
  }

  /**
   * Approbation : un changement risque exige un plan de retour arriere et
   * une fenetre de maintenance, sinon il est refuse.
   */
  approveChange(id: string): { approved: boolean; reason?: string } {
    const change = this.change(id);
    if (!change) return { approved: false, reason: 'changement introuvable' };
    if (change.approvalState !== 'submitted') {
      return { approved: false, reason: 'le changement doit d abord etre soumis' };
    }
    if (change.changeType !== 'standard') {
      if (change.rollbackPlan === undefined || change.rollbackPlan.trim().length < 20) {
        change.approvalState = 'rejected';
        this.emit('itsm.change.rejected', { changeId: id, reason: 'rollback' });
        return { approved: false, reason: 'plan de retour arriere absent ou insuffisant' };
      }
      if (change.risk === 'high' && change.maintenanceWindow === undefined) {
        change.approvalState = 'rejected';
        this.emit('itsm.change.rejected', { changeId: id, reason: 'window' });
        return { approved: false, reason: 'fenetre de maintenance obligatoire pour un changement a risque eleve' };
      }
    }
    change.approvalState = 'approved';
    this.emit('itsm.change.approved', { changeId: id }, `Changement ${id} approuve`);
    return { approved: true };
  }

  checkChangeStep(id: string, kind: 'pre' | 'post', stepId: string): boolean {
    const change = this.change(id);
    if (!change) return false;
    const list = kind === 'pre' ? change.preChecks : change.postChecks;
    const step = list.find((s) => s.id === stepId);
    if (!step) return false;
    step.done = true;
    this.emit('itsm.change.step', { changeId: id, kind, stepId });
    return true;
  }
}
