import { z } from 'zod';
import { zId } from './primitives.ts';

export const zPortRole = z.enum(['ethernet', 'sfp', 'console', 'power', 'usb', 'patch']);

export const zPhysicalPort = z.object({
  id: zId,
  label: z.string().min(1).max(32),
  role: zPortRole.default('ethernet'),
  /** Interface logique correspondante sur le noeud reseau, s il y en a une. */
  interfaceId: zId.optional(),
  /** Etat des LED, derive de la simulation et jamais saisi a la main. */
  ledLink: z.enum(['off', 'green', 'amber', 'blinking']).default('off'),
});

export const zHardwareAsset = z.object({
  schemaVersion: z.literal(1).default(1),
  id: zId,
  assetTag: z.string().min(1),
  kind: z.enum([
    'server',
    'desktop',
    'laptop',
    'switch',
    'router',
    'firewall',
    'patch-panel',
    'pdu',
    'ups',
    'printer',
    'access-point',
    'storage',
  ]),
  model: z.string().min(1),
  vendor: z.string().max(64).default('NEO Systems'),
  serial: z.string().optional(),
  rackId: zId.optional(),
  rackUnit: z.number().int().min(1).max(48).optional(),
  heightU: z.number().int().min(1).max(12).default(1),
  ports: z.array(zPhysicalPort).default([]),
  powered: z.boolean().default(true),
  powerSourceId: zId.optional(),
  networkNodeId: zId.optional(),
  ownerService: z.string().max(64).optional(),
  location: z.string().max(64).optional(),
  lifecycle: z.enum(['stock', 'in-service', 'maintenance', 'retired']).default('in-service'),
  purchasedAt: z.number().int().nonnegative().optional(),
  warrantyUntil: z.number().int().nonnegative().optional(),
  history: z
    .array(z.object({ at: z.number().int().nonnegative(), event: z.string().min(1) }))
    .default([]),
  /** Composants internes manipulables au laboratoire materiel. */
  components: z
    .array(
      z.object({
        id: zId,
        kind: z.enum(['cpu', 'ram', 'disk', 'nic', 'psu', 'fan', 'gpu']),
        model: z.string().min(1),
        slot: z.string().min(1),
        health: z.enum(['ok', 'warning', 'failed']).default('ok'),
        capacity: z.string().optional(),
      }),
    )
    .default([]),
  temperatureC: z.number().optional(),
});

export const zRack = z.object({
  id: zId,
  name: z.string().min(1),
  room: z.string().min(1),
  units: z.number().int().min(6).max(48).default(42),
});

/** Brassage physique : un patch errone doit reellement casser la connectivite simulee. */
export const zPatchCable = z.object({
  id: zId,
  from: z.object({ assetId: zId, portId: zId }),
  to: z.object({ assetId: zId, portId: zId }),
  media: z.enum(['copper', 'fiber']).default('copper'),
  lengthM: z.number().positive().default(2),
  color: z.string().max(16).optional(),
  /** Un cable abime transmet mal : sert aux scenarios de couche 1. */
  condition: z.enum(['ok', 'damaged', 'wrong-standard']).default('ok'),
  /** Lien logique cree dans la topologie reseau par ce brassage. */
  linkId: zId.optional(),
});

export type PhysicalPort = z.infer<typeof zPhysicalPort>;
export type HardwareAsset = z.infer<typeof zHardwareAsset>;
export type Rack = z.infer<typeof zRack>;
export type PatchCable = z.infer<typeof zPatchCable>;
