import { z } from 'zod';
import { zId, zSimTime } from './primitives.ts';

/** Categories d evenements du journal pedagogique. */
export const zEventCategory = z.enum([
  'session',
  'mission',
  'objective',
  'command',
  'config-change',
  'incident',
  'ticket',
  'hint',
  'snapshot',
  'evaluation',
  'system',
]);

export const zEventLogEntry = z.object({
  id: zId,
  seq: z.number().int().nonnegative(),
  at: z.number().int().nonnegative(),
  simTime: zSimTime,
  category: zEventCategory,
  type: z.string().min(1),
  /** Charge utile serialisable ; jamais de donnee personnelle. */
  payload: z.record(z.string(), z.unknown()).default({}),
  /** Affiche dans la timeline pedagogique. Les micro-actions restent a false. */
  significant: z.boolean().default(false),
  label: z.string().max(160).optional(),
});

export const zEventLog = z.object({
  schemaVersion: z.literal(1).default(1),
  entries: z.array(zEventLogEntry).default([]),
  nextSeq: z.number().int().nonnegative().default(0),
});

export type EventCategory = z.infer<typeof zEventCategory>;
export type EventLogEntry = z.infer<typeof zEventLogEntry>;
export type EventLog = z.infer<typeof zEventLog>;
