import { z } from 'zod';
import { zId, zSimTime } from './primitives.ts';

export const zTicketKind = z.enum(['incident', 'request', 'problem', 'change']);
export const zTicketStatus = z.enum([
  'new',
  'assigned',
  'in-progress',
  'pending-user',
  'pending-change',
  'resolved',
  'closed',
  'cancelled',
]);
export const zImpact = z.enum(['low', 'medium', 'high']);
export const zUrgency = z.enum(['low', 'medium', 'high']);
export const zPriority = z.enum(['P1', 'P2', 'P3', 'P4']);

/** Matrice ITIL classique impact x urgence -> priorite. Utilisee par le moteur, pas saisie a la main. */
export const PRIORITY_MATRIX: Record<string, 'P1' | 'P2' | 'P3' | 'P4'> = {
  'high|high': 'P1',
  'high|medium': 'P2',
  'high|low': 'P3',
  'medium|high': 'P2',
  'medium|medium': 'P3',
  'medium|low': 'P3',
  'low|high': 'P3',
  'low|medium': 'P4',
  'low|low': 'P4',
};

export const zTicketComment = z.object({
  id: zId,
  at: zSimTime,
  author: z.string().min(1),
  authorRole: z.enum(['user', 'technician', 'manager', 'system', 'expert']).default('technician'),
  body: z.string().min(1),
  visibility: z.enum(['public', 'internal']).default('public'),
});

export const zTicket = z.object({
  schemaVersion: z.literal(1).default(1),
  id: zId,
  reference: z.string().min(1),
  kind: zTicketKind,
  title: z.string().min(1).max(140),
  description: z.string().min(1),
  status: zTicketStatus.default('new'),
  impact: zImpact.default('medium'),
  urgency: zUrgency.default('medium'),
  priority: zPriority.default('P3'),
  requesterNpcId: zId.optional(),
  assignee: z.string().optional(),
  createdAt: zSimTime.default(0),
  updatedAt: zSimTime.default(0),
  resolvedAt: zSimTime.optional(),
  /** Delai pedagogique de resolution, en minutes de temps simule. */
  slaMinutes: z.number().int().positive().optional(),
  /** Elements de configuration concernes : relie le ticket a l etat technique reel. */
  affectedNodeIds: z.array(zId).default([]),
  affectedServiceIds: z.array(zId).default([]),
  linkedTicketIds: z.array(zId).default([]),
  parentTicketId: zId.optional(),
  majorIncident: z.boolean().default(false),
  category: z.string().max(64).optional(),
  comments: z.array(zTicketComment).default([]),
  resolutionSummary: z.string().optional(),
  rootCause: z.string().optional(),
});

export const zChangeRequest = z.object({
  schemaVersion: z.literal(1).default(1),
  id: zId,
  ticketId: zId,
  changeType: z.enum(['standard', 'normal', 'emergency']),
  risk: z.enum(['low', 'medium', 'high']).default('medium'),
  maintenanceWindow: z.object({ startsAt: zSimTime, endsAt: zSimTime }).optional(),
  approvalState: z.enum(['draft', 'submitted', 'approved', 'rejected']).default('draft'),
  preChecks: z
    .array(z.object({ id: zId, label: z.string(), done: z.boolean().default(false) }))
    .default([]),
  postChecks: z
    .array(z.object({ id: zId, label: z.string(), done: z.boolean().default(false) }))
    .default([]),
  rollbackPlan: z.string().optional(),
  snapshotId: zId.optional(),
  communicationSent: z.boolean().default(false),
});

export const zNpc = z.object({
  id: zId,
  name: z.string().min(1),
  role: z.enum(['user', 'colleague', 'manager', 'expert', 'supplier']),
  department: z.string().max(64).optional(),
  /** Ton de reponse : influence la formulation, jamais la verite technique. */
  temperament: z.enum(['calm', 'stressed', 'impatient', 'precise', 'vague']).default('calm'),
  nodeId: zId.optional(),
  avatar: z.string().optional(),
  /** Connaissances que le PNJ peut reveler si on l interroge correctement. */
  knownFacts: z
    .array(z.object({ id: zId, prompt: z.array(z.string()).default([]), answer: z.string() }))
    .default([]),
});

export type TicketKind = z.infer<typeof zTicketKind>;
export type TicketStatus = z.infer<typeof zTicketStatus>;
export type Impact = z.infer<typeof zImpact>;
export type Urgency = z.infer<typeof zUrgency>;
export type Priority = z.infer<typeof zPriority>;
export type Ticket = z.infer<typeof zTicket>;
export type TicketComment = z.infer<typeof zTicketComment>;
export type ChangeRequest = z.infer<typeof zChangeRequest>;
export type Npc = z.infer<typeof zNpc>;
