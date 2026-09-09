import { z } from 'zod';
import { zId, zSemVer } from './primitives.ts';

export const zRole = z.enum(['guest', 'student', 'trainer', 'admin']);

export const zFeatureFlag = z.object({
  key: z.string().min(1),
  enabled: z.boolean().default(false),
  /** Restrictions cumulatives : toutes doivent etre satisfaites. */
  environments: z.array(z.enum(['dev', 'test', 'preview', 'production'])).default(['dev', 'test', 'preview', 'production']),
  roles: z.array(zRole).default(['guest', 'student', 'trainer', 'admin']),
  moduleIds: z.array(zId).default([]),
  /** Capacite navigateur requise (ex "webgpu", "storage-persistent"). */
  requiresCapability: z.string().optional(),
  description: z.string().max(200).default(''),
  /** Date au-dela de laquelle le drapeau doit etre nettoye. */
  reviewBy: z.string().optional(),
});

export const zFeatureFlags = z.object({
  schemaVersion: z.literal(1).default(1),
  flags: z.array(zFeatureFlag).default([]),
});

export const zPerformanceBudget = z.object({
  /** Taille max du bundle initial (gzip) en Ko. */
  initialJsKb: z.number().positive().default(320),
  initialCssKb: z.number().positive().default(60),
  /** Budget total de la premiere visite, assets compris. */
  firstLoadKb: z.number().positive().default(1200),
  targetFps: z.number().int().positive().default(60),
  minAcceptableFps: z.number().int().positive().default(30),
  maxSceneDrawCalls: z.number().int().positive().default(900),
});

export const zAppConfig = z.object({
  schemaVersion: z.literal(1).default(1),
  appName: z.literal('TSSR NEO').default('TSSR NEO'),
  coreVersion: zSemVer,
  environment: z.enum(['dev', 'test', 'preview', 'production']).default('dev'),
  /** Chemin de base : compatible sous-repertoire GitHub Pages. */
  basePath: z.string().default('/'),
  defaultLocale: z.string().min(2).max(8).default('fr'),
  supportedLocales: z.array(z.string().min(2).max(8)).default(['fr', 'en']),
  rendering: z
    .object({
      preferWebGpu: z.boolean().default(true),
      allowWebGlFallback: z.boolean().default(true),
      maxPixelRatio: z.number().min(1).max(3).default(2),
    })
    .default({}),
  pwa: z.object({ enabled: z.boolean().default(true), cacheVersion: z.string().default('v1') }).default({}),
  supabase: z
    .object({
      enabled: z.boolean().default(false),
      /** URL et cle ANON uniquement : jamais de service-role cote client. */
      url: z.string().url().optional(),
      anonKey: z.string().optional(),
    })
    .default({}),
  nova: z
    .object({
      /** Ordre de resolution : regles -> base de connaissances -> IA locale -> provider externe. */
      strategy: z.array(z.enum(['rules', 'knowledge', 'local-model', 'remote-provider'])).default(['rules', 'knowledge']),
      maxHintLevel: z.number().int().min(1).max(4).default(4),
    })
    .default({}),
  budgets: zPerformanceBudget.default({}),
  telemetry: z.object({ localOnly: z.boolean().default(true), remoteEndpoint: z.string().url().optional() }).default({}),
});

export type Role = z.infer<typeof zRole>;
export type FeatureFlag = z.infer<typeof zFeatureFlag>;
export type FeatureFlags = z.infer<typeof zFeatureFlags>;
export type PerformanceBudget = z.infer<typeof zPerformanceBudget>;
export type AppConfig = z.infer<typeof zAppConfig>;
