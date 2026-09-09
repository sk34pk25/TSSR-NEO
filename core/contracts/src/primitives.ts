import { z } from 'zod';

/** Version du schema global des contrats TSSR NEO. Toute rupture incremente ce numero. */
export const CONTRACTS_SCHEMA_VERSION = 1;

export const zId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9][a-z0-9._-]*$/, 'identifiant kebab/snake minuscule attendu');

export const zSemVer = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'version semver attendue');

export const zSeed = z.number().int().nonnegative();

/** Horodatage simule (ms depuis le debut de la session de simulation), jamais l'heure reelle. */
export const zSimTime = z.number().int().nonnegative();

export const zIsoDate = z.string().datetime({ offset: true });

export const zLocalizedText = z.union([
  z.string(),
  z.record(z.string().min(2).max(8), z.string()),
]);

export const zIPv4 = z
  .string()
  .regex(
    /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/,
    'adresse IPv4 invalide',
  );

export const zPrefixV4 = z.number().int().min(0).max(32);

export const zCidrV4 = z.string().regex(
  /^(?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\/(?:3[0-2]|[12]?\d)$/,
  'notation CIDR IPv4 invalide',
);

export const zMac = z
  .string()
  .regex(/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/, 'adresse MAC invalide (minuscules, separateur ":")');

export const zVlanId = z.number().int().min(1).max(4094);

export const zPort = z.number().int().min(1).max(65535);

export const zHostname = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i, 'nom d hote invalide');

export const zFqdn = z
  .string()
  .min(1)
  .max(253)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.?$/i);

export type Id = z.infer<typeof zId>;
export type SemVer = z.infer<typeof zSemVer>;
export type Seed = z.infer<typeof zSeed>;
export type SimTime = z.infer<typeof zSimTime>;
export type LocalizedText = z.infer<typeof zLocalizedText>;
export type IPv4 = z.infer<typeof zIPv4>;
export type CidrV4 = z.infer<typeof zCidrV4>;
export type Mac = z.infer<typeof zMac>;
export type VlanId = z.infer<typeof zVlanId>;
