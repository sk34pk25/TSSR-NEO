import { z } from 'zod';
import { zId, zSemVer } from './primitives.ts';
import { zPlayerProgress, zPreferences, zSnapshot } from './progress.ts';

export const zSyncPayload = z.object({
  schemaVersion: z.literal(1).default(1),
  coreVersion: zSemVer,
  profileId: zId,
  /** Horloge logique pour la resolution de conflits multi-appareils. */
  revision: z.number().int().nonnegative().default(0),
  updatedAt: z.number().int().nonnegative(),
  progress: zPlayerProgress,
  snapshots: z.array(zSnapshot).default([]),
  deviceId: z.string().min(1),
});

/** Format d export/import utilisateur, versionne et migrable. */
export const zUserExport = z.object({
  format: z.literal('tssr-neo-export').default('tssr-neo-export'),
  schemaVersion: z.literal(1).default(1),
  exportedAt: z.number().int().nonnegative(),
  coreVersion: zSemVer,
  progress: zPlayerProgress,
  preferences: zPreferences,
  snapshots: z.array(zSnapshot).default([]),
  labs: z.array(z.object({ id: zId, name: z.string(), data: z.unknown() })).default([]),
  integrity: z.string().min(8),
});

export type SyncPayload = z.infer<typeof zSyncPayload>;
export type UserExport = z.infer<typeof zUserExport>;
