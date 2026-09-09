import { z } from 'zod';
import { zFqdn, zHostname, zId, zIPv4 } from './primitives.ts';

export const zOsFamily = z.enum(['linux', 'windows']);

export const zFileKind = z.enum(['file', 'dir', 'symlink']);

/** Permissions POSIX + ACL simplifiee Windows, dans un modele unique et verifiable. */
export const zPermissions = z.object({
  owner: z.string().default('root'),
  group: z.string().default('root'),
  /** Mode POSIX octal, ex "0644". Utilise cote linux. */
  mode: z
    .string()
    .regex(/^[0-7]{3,4}$/)
    .default('0644'),
  /** ACE Windows : principal -> droits accordes. */
  acl: z
    .array(
      z.object({
        principal: z.string().min(1),
        rights: z.array(z.enum(['read', 'write', 'execute', 'modify', 'full'])).min(1),
        type: z.enum(['allow', 'deny']).default('allow'),
      }),
    )
    .default([]),
});

export const zFsNode = z.object({
  kind: zFileKind,
  /** Contenu texte pour un fichier ; les binaires sont representes par un marqueur. */
  content: z.string().default(''),
  target: z.string().optional(),
  permissions: zPermissions.default({}),
  sizeBytes: z.number().int().nonnegative().default(0),
  modifiedAt: z.number().int().nonnegative().default(0),
});

export const zUserAccount = z.object({
  name: z.string().min(1).max(64),
  uid: z.number().int().nonnegative().optional(),
  displayName: z.string().max(80).optional(),
  groups: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  /** Mot de passe simule : jamais un vrai secret, uniquement un marqueur de scenario. */
  passwordSet: z.boolean().default(true),
  mustChangePassword: z.boolean().default(false),
  lockedOut: z.boolean().default(false),
  homeDir: z.string().optional(),
  shell: z.string().optional(),
  domain: zFqdn.optional(),
});

export const zGroupAccount = z.object({
  name: z.string().min(1).max(64),
  gid: z.number().int().nonnegative().optional(),
  members: z.array(z.string()).default([]),
  scope: z.enum(['local', 'domain-local', 'global', 'universal']).default('local'),
  description: z.string().max(160).optional(),
});

export const zProcess = z.object({
  pid: z.number().int().positive(),
  name: z.string().min(1),
  user: z.string().min(1),
  cpuPercent: z.number().min(0).max(100).default(0),
  memoryMb: z.number().nonnegative().default(0),
  serviceId: zId.optional(),
});

export const zScheduledTask = z.object({
  id: zId,
  name: z.string().min(1),
  command: z.string().min(1),
  /** Expression cron simplifiee ou declencheur nomme. */
  schedule: z.string().min(1),
  enabled: z.boolean().default(true),
  runAsUser: z.string().default('root'),
  lastResult: z.enum(['never', 'success', 'failure']).default('never'),
});

export const zShare = z.object({
  name: z.string().min(1).max(64),
  path: z.string().min(1),
  /** Permissions de partage, distinctes des permissions NTFS/POSIX du dossier. */
  sharePermissions: z
    .array(
      z.object({
        principal: z.string().min(1),
        rights: z.enum(['read', 'change', 'full']),
        type: z.enum(['allow', 'deny']).default('allow'),
      }),
    )
    .default([]),
  enabled: z.boolean().default(true),
});

export const zInstalledPackage = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  state: z.enum(['installed', 'broken', 'pending-reboot']).default('installed'),
});

export const zLogEntry = z.object({
  at: z.number().int().nonnegative(),
  source: z.string().min(1),
  level: z.enum(['debug', 'info', 'warning', 'error', 'critical']),
  message: z.string().min(1),
  eventId: z.number().int().optional(),
});

export const zResourceUsage = z.object({
  cpuPercent: z.number().min(0).max(100).default(5),
  memoryTotalMb: z.number().int().positive().default(4096),
  memoryUsedMb: z.number().int().nonnegative().default(1024),
  diskTotalGb: z.number().positive().default(80),
  diskUsedGb: z.number().nonnegative().default(20),
  temperatureC: z.number().optional(),
});

export const zSystemState = z.object({
  schemaVersion: z.literal(1).default(1),
  id: zId,
  hostname: zHostname,
  os: zOsFamily,
  osVersion: z.string().min(1).default('generic'),
  powerState: z.enum(['running', 'stopped', 'rebooting', 'crashed']).default('running'),
  /** Racine du systeme de fichiers simule : chemin absolu -> noeud. */
  files: z.record(z.string(), zFsNode).default({}),
  users: z.array(zUserAccount).default([]),
  groups: z.array(zGroupAccount).default([]),
  processes: z.array(zProcess).default([]),
  scheduledTasks: z.array(zScheduledTask).default([]),
  shares: z.array(zShare).default([]),
  packages: z.array(zInstalledPackage).default([]),
  environment: z.record(z.string(), z.string()).default({}),
  logs: z.array(zLogEntry).default([]),
  resources: zResourceUsage.default({}),
  /** Rattachement au domaine Active Directory simule. */
  domainJoin: z.object({ domain: zFqdn, joined: z.boolean() }).optional(),
  /** Noeud reseau correspondant : la machine et son adressage ne sont jamais dupliques. */
  networkNodeId: zId,
  pendingReboot: z.boolean().default(false),
});

export const zGpo = z.object({
  id: zId,
  name: z.string().min(1),
  linkedTo: z.array(z.string()).default([]),
  enabled: z.boolean().default(true),
  settings: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  /** Ordre d application ; le dernier applique l emporte en cas de conflit. */
  precedence: z.number().int().nonnegative().default(0),
});

export const zDirectoryDomain = z.object({
  schemaVersion: z.literal(1).default(1),
  name: zFqdn,
  netbiosName: z.string().min(1).max(15),
  controllerNodeIds: z.array(zId).default([]),
  organizationalUnits: z
    .array(
      z.object({ dn: z.string().min(1), name: z.string().min(1), parentDn: z.string().optional() }),
    )
    .default([]),
  users: z.array(zUserAccount).default([]),
  groups: z.array(zGroupAccount).default([]),
  computers: z
    .array(
      z.object({ name: zHostname, ou: z.string().optional(), enabled: z.boolean().default(true) }),
    )
    .default([]),
  gpos: z.array(zGpo).default([]),
});

export const zVirtualMachine = z.object({
  id: zId,
  name: zHostname,
  hostId: zId,
  state: z.enum(['running', 'stopped', 'paused', 'suspended']).default('stopped'),
  vcpu: z.number().int().positive().default(2),
  memoryMb: z.number().int().positive().default(2048),
  diskGb: z.number().positive().default(40),
  vnics: z
    .array(
      z.object({
        id: zId,
        virtualSwitchId: zId,
        vlan: z.number().int().optional(),
        networkInterfaceId: zId.optional(),
      }),
    )
    .default([]),
  systemId: zId.optional(),
  snapshots: z
    .array(
      z.object({
        id: zId,
        name: z.string(),
        takenAt: z.number().int().nonnegative(),
        parentId: zId.optional(),
      }),
    )
    .default([]),
  template: z.boolean().default(false),
});

export const zHypervisorHost = z.object({
  id: zId,
  name: zHostname,
  networkNodeId: zId,
  cpuCores: z.number().int().positive().default(16),
  memoryMb: z.number().int().positive().default(65536),
  storageGb: z.number().positive().default(2000),
  virtualSwitches: z
    .array(
      z.object({
        id: zId,
        name: z.string(),
        uplinkInterfaceId: zId.optional(),
        vlans: z.array(z.number().int()).default([]),
      }),
    )
    .default([]),
  state: z.enum(['up', 'down', 'maintenance']).default('up'),
});

export const zCloudResource = z.object({
  id: zId,
  kind: z.enum([
    'vpc',
    'subnet',
    'vm',
    'storage',
    'load-balancer',
    'dns-zone',
    'security-group',
    'iam-role',
  ]),
  name: z.string().min(1),
  region: z.string().min(1),
  zone: z.string().optional(),
  parentId: zId.optional(),
  state: z.enum(['provisioning', 'running', 'stopped', 'error', 'deleted']).default('running'),
  /** Cout pedagogique simule, en unites fictives par heure. */
  hourlyCost: z.number().nonnegative().default(0),
  properties: z.record(z.string(), z.unknown()).default({}),
  privateIp: zIPv4.optional(),
});

export type OsFamily = z.infer<typeof zOsFamily>;
export type Permissions = z.infer<typeof zPermissions>;
export type FsNode = z.infer<typeof zFsNode>;
export type UserAccount = z.infer<typeof zUserAccount>;
export type GroupAccount = z.infer<typeof zGroupAccount>;
export type ProcessInfo = z.infer<typeof zProcess>;
export type ScheduledTask = z.infer<typeof zScheduledTask>;
export type Share = z.infer<typeof zShare>;
export type LogEntry = z.infer<typeof zLogEntry>;
export type ResourceUsage = z.infer<typeof zResourceUsage>;
export type SystemState = z.infer<typeof zSystemState>;
export type Gpo = z.infer<typeof zGpo>;
export type DirectoryDomain = z.infer<typeof zDirectoryDomain>;
export type VirtualMachine = z.infer<typeof zVirtualMachine>;
export type HypervisorHost = z.infer<typeof zHypervisorHost>;
export type CloudResource = z.infer<typeof zCloudResource>;
