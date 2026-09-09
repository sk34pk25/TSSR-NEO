import { z } from 'zod';
import { zId, zSeed, zSimTime } from './primitives.ts';
import { zNetworkTopology } from './network.ts';
import {
  zCloudResource,
  zDirectoryDomain,
  zHypervisorHost,
  zSystemState,
  zVirtualMachine,
} from './systems.ts';
import { zChangeRequest, zNpc, zTicket } from './itsm.ts';
import { zHardwareAsset, zPatchCable, zRack } from './hardware.ts';

export const zBackupJob = z.object({
  id: zId,
  name: z.string().min(1),
  sourceSystemIds: z.array(zId).default([]),
  kind: z.enum(['full', 'incremental', 'differential']).default('full'),
  schedule: z.string().min(1).default('daily'),
  retentionCount: z.number().int().positive().default(7),
  enabled: z.boolean().default(true),
  targetLocation: z.string().min(1).default('/backup'),
  points: z
    .array(
      z.object({
        id: zId,
        takenAt: zSimTime,
        kind: z.enum(['full', 'incremental', 'differential']),
        sizeGb: z.number().nonnegative().default(1),
        /** Une sauvegarde corrompue ne restaure pas : coeur des scenarios PRA. */
        integrity: z.enum(['verified', 'unverified', 'corrupted']).default('unverified'),
        parentId: zId.optional(),
      }),
    )
    .default([]),
  lastRestoreTestAt: zSimTime.optional(),
  rpoMinutes: z.number().int().positive().optional(),
  rtoMinutes: z.number().int().positive().optional(),
});

export const zMonitoringCheck = z.object({
  id: zId,
  name: z.string().min(1),
  targetNodeId: zId,
  metric: z.enum(['icmp', 'service', 'cpu', 'memory', 'disk', 'latency', 'temperature']),
  serviceId: zId.optional(),
  warningThreshold: z.number().optional(),
  criticalThreshold: z.number().optional(),
  intervalMs: z.number().int().positive().default(30000),
  enabled: z.boolean().default(true),
});

export const zMonitoringAlert = z.object({
  id: zId,
  checkId: zId,
  severity: z.enum(['info', 'warning', 'critical']),
  raisedAt: zSimTime,
  clearedAt: zSimTime.optional(),
  acknowledgedBy: z.string().optional(),
  message: z.string().min(1),
  value: z.number().optional(),
});

export const zDeploymentTemplate = z.object({
  id: zId,
  name: z.string().min(1),
  os: z.enum(['linux', 'windows']),
  osVersion: z.string().min(1),
  packages: z.array(z.string()).default([]),
  joinDomain: z.string().optional(),
  namingPattern: z.string().default('NEO-{n}'),
  networkConfig: z.enum(['dhcp', 'static']).default('dhcp'),
  postScripts: z.array(z.string()).default([]),
});

export const zDeploymentJob = z.object({
  id: zId,
  templateId: zId,
  targets: z
    .array(
      z.object({
        assetId: zId,
        status: z.enum(['pending', 'running', 'success', 'failed']).default('pending'),
        message: z.string().optional(),
      }),
    )
    .default([]),
  startedAt: zSimTime.optional(),
  finishedAt: zSimTime.optional(),
  status: z.enum(['draft', 'running', 'completed', 'failed', 'rolled-back']).default('draft'),
});

/**
 * Etat complet du monde simule.
 * Source de verite unique partagee par la 3D, le terminal, la GUI, les logs,
 * la supervision, les tickets, NOVA et l evaluation.
 */
export const zWorldState = z.object({
  schemaVersion: z.literal(1).default(1),
  scenarioId: zId,
  seed: zSeed,
  simTime: zSimTime.default(0),
  network: zNetworkTopology,
  systems: z.array(zSystemState).default([]),
  domains: z.array(zDirectoryDomain).default([]),
  hypervisors: z.array(zHypervisorHost).default([]),
  vms: z.array(zVirtualMachine).default([]),
  cloud: z.array(zCloudResource).default([]),
  racks: z.array(zRack).default([]),
  assets: z.array(zHardwareAsset).default([]),
  cables: z.array(zPatchCable).default([]),
  tickets: z.array(zTicket).default([]),
  changes: z.array(zChangeRequest).default([]),
  npcs: z.array(zNpc).default([]),
  backupJobs: z.array(zBackupJob).default([]),
  monitoringChecks: z.array(zMonitoringCheck).default([]),
  monitoringAlerts: z.array(zMonitoringAlert).default([]),
  deploymentTemplates: z.array(zDeploymentTemplate).default([]),
  deploymentJobs: z.array(zDeploymentJob).default([]),
});

export type BackupJob = z.infer<typeof zBackupJob>;
export type MonitoringCheck = z.infer<typeof zMonitoringCheck>;
export type MonitoringAlert = z.infer<typeof zMonitoringAlert>;
export type DeploymentTemplate = z.infer<typeof zDeploymentTemplate>;
export type DeploymentJob = z.infer<typeof zDeploymentJob>;
export type WorldState = z.infer<typeof zWorldState>;
