import { z } from 'zod';
import { zCidrV4, zId, zIPv4, zPort, zVlanId } from './primitives.ts';

/**
 * DSL d assertions declaratives.
 * Une assertion est evaluee par le moteur contre l etat REEL du monde simule.
 * Elle ne decrit jamais "le joueur a clique ici" mais "le systeme est dans cet etat".
 */

const base = { note: z.string().max(200).optional() };

export const zLeafAssertion = z.discriminatedUnion('type', [
  z.object({
    ...base,
    type: z.literal('ping-reachable'),
    from: zId,
    to: z.string().min(1),
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('service-reachable'),
    from: zId,
    to: z.string().min(1),
    port: zPort,
    protocol: z.enum(['tcp', 'udp']).default('tcp'),
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('dns-resolves'),
    from: zId,
    name: z.string().min(1),
    expectedAddress: zIPv4.optional(),
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('dhcp-lease'),
    nodeId: zId,
    expectedSubnet: zCidrV4.optional(),
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('interface-address'),
    nodeId: zId,
    interfaceName: z.string().min(1),
    address: zIPv4.optional(),
    prefix: z.number().int().min(0).max(32).optional(),
    enabled: z.boolean().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('has-route'),
    nodeId: zId,
    destination: zCidrV4,
    via: zIPv4.optional(),
  }),
  z.object({
    ...base,
    type: z.literal('interface-vlan'),
    nodeId: zId,
    interfaceName: z.string().min(1),
    mode: z.enum(['access', 'trunk', 'routed']).optional(),
    accessVlan: zVlanId.optional(),
    trunkContains: z.array(zVlanId).optional(),
  }),
  z.object({ ...base, type: z.literal('link-up'), linkId: zId, expect: z.boolean().default(true) }),
  z.object({
    ...base,
    type: z.literal('service-status'),
    nodeId: zId,
    serviceId: zId,
    status: z.enum(['running', 'stopped', 'failed', 'degraded']),
  }),
  z.object({
    ...base,
    type: z.literal('service-startup'),
    nodeId: zId,
    serviceId: zId,
    startupType: z.enum(['auto', 'manual', 'disabled']),
  }),
  z.object({
    ...base,
    type: z.literal('file-exists'),
    systemId: zId,
    path: z.string().min(1),
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('file-matches'),
    systemId: zId,
    path: z.string().min(1),
    pattern: z.string().min(1),
    flags: z.string().max(4).default(''),
  }),
  z.object({
    ...base,
    type: z.literal('file-permissions'),
    systemId: zId,
    path: z.string().min(1),
    mode: z
      .string()
      .regex(/^[0-7]{3,4}$/)
      .optional(),
    owner: z.string().optional(),
    group: z.string().optional(),
  }),
  z.object({
    ...base,
    type: z.literal('user-exists'),
    systemId: zId,
    user: z.string().min(1),
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('user-in-group'),
    systemId: zId,
    user: z.string().min(1),
    group: z.string().min(1),
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('user-enabled'),
    systemId: zId,
    user: z.string().min(1),
    enabled: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('share-exists'),
    systemId: zId,
    share: z.string().min(1),
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('process-running'),
    systemId: zId,
    processName: z.string().min(1),
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('scheduled-task'),
    systemId: zId,
    taskName: z.string().min(1),
    enabled: z.boolean().optional(),
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('domain-joined'),
    systemId: zId,
    domain: z.string().min(1),
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('vm-state'),
    vmId: zId,
    state: z.enum(['running', 'stopped', 'paused', 'suspended']),
  }),
  z.object({
    ...base,
    type: z.literal('ticket-status'),
    ticketId: zId,
    status: z.enum([
      'new',
      'assigned',
      'in-progress',
      'pending-user',
      'pending-change',
      'resolved',
      'closed',
      'cancelled',
    ]),
  }),
  z.object({
    ...base,
    type: z.literal('ticket-priority'),
    ticketId: zId,
    priority: z.enum(['P1', 'P2', 'P3', 'P4']),
  }),
  z.object({
    ...base,
    type: z.literal('ticket-documented'),
    ticketId: zId,
    minLength: z.number().int().positive().default(40),
    requireRootCause: z.boolean().default(false),
  }),
  z.object({
    ...base,
    type: z.literal('backup-restorable'),
    jobId: zId,
    expect: z.boolean().default(true),
  }),
  z.object({
    ...base,
    type: z.literal('snapshot-taken'),
    scope: z.enum(['any', 'node', 'vm']).default('any'),
    targetId: zId.optional(),
    expect: z.boolean().default(true),
  }),
  /** Verifie la METHODE : une commande correspondant au motif a-t-elle ete executee ? */
  z.object({
    ...base,
    type: z.literal('command-used'),
    pattern: z.string().min(1),
    systemId: zId.optional(),
    expect: z.boolean().default(true),
    minCount: z.number().int().positive().default(1),
  }),
  /** Verifie qu aucun degat collateral n a ete cause sur des elements hors perimetre. */
  z.object({
    ...base,
    type: z.literal('unchanged'),
    scope: z.enum(['node', 'system', 'service']),
    targetId: zId,
  }),
  z.object({
    ...base,
    type: z.literal('event-occurred'),
    eventType: z.string().min(1),
    expect: z.boolean().default(true),
  }),
]);

export type LeafAssertion = z.infer<typeof zLeafAssertion>;

export type Assertion =
  | LeafAssertion
  | { type: 'all'; of: Assertion[]; note?: string | undefined }
  | { type: 'any'; of: Assertion[]; note?: string | undefined }
  | { type: 'not'; of: Assertion; note?: string | undefined };

export const zAssertion: z.ZodType<Assertion, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    zLeafAssertion,
    z.object({
      type: z.literal('all'),
      of: z.array(zAssertion).min(1),
      note: z.string().max(200).optional(),
    }),
    z.object({
      type: z.literal('any'),
      of: z.array(zAssertion).min(1),
      note: z.string().max(200).optional(),
    }),
    z.object({ type: z.literal('not'), of: zAssertion, note: z.string().max(200).optional() }),
  ]),
);

export const ASSERTION_TYPES = zLeafAssertion.options.map((o) => o.shape.type.value);
