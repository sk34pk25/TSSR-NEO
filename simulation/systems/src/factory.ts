import type { FsNode, OsFamily, SystemState } from '@tssr/contracts';

function dir(owner = 'root', group = 'root', mode = '0755'): FsNode {
  return {
    kind: 'dir',
    content: '',
    permissions: { owner, group, mode, acl: [] },
    sizeBytes: 0,
    modifiedAt: 0,
  };
}

function file(content: string, owner = 'root', group = 'root', mode = '0644'): FsNode {
  return {
    kind: 'file',
    content,
    permissions: { owner, group, mode, acl: [] },
    sizeBytes: content.length,
    modifiedAt: 0,
  };
}

export interface SystemSpec {
  id: string;
  hostname: string;
  os: OsFamily;
  networkNodeId: string;
  osVersion?: string;
  users?: SystemState['users'];
  groups?: SystemState['groups'];
  files?: Record<string, FsNode>;
  shares?: SystemState['shares'];
  resources?: Partial<SystemState['resources']>;
  domain?: string;
}

const LINUX_BASE = (hostname: string): Record<string, FsNode> => ({
  '/': dir(),
  '/bin': dir(),
  '/etc': dir(),
  '/etc/hostname': file(`${hostname}\n`),
  '/etc/hosts': file(`127.0.0.1 localhost\n127.0.1.1 ${hostname}\n`),
  '/etc/resolv.conf': file('# genere par la configuration reseau\n'),
  '/home': dir(),
  '/root': dir('root', 'root', '0700'),
  '/srv': dir(),
  '/tmp': dir('root', 'root', '1777'),
  '/var': dir(),
  '/var/log': dir(),
  '/var/log/syslog': file(''),
  '/opt': dir(),
});

const WINDOWS_BASE = (hostname: string): Record<string, FsNode> => ({
  'C:/': dir('Administrator', 'Administrators', '0755'),
  'C:/Windows': dir('Administrator', 'Administrators'),
  'C:/Windows/System32': dir('Administrator', 'Administrators'),
  'C:/Windows/System32/drivers': dir('Administrator', 'Administrators'),
  'C:/Windows/System32/drivers/etc': dir('Administrator', 'Administrators'),
  'C:/Windows/System32/drivers/etc/hosts': file(
    `127.0.0.1 localhost\n127.0.1.1 ${hostname}\n`,
    'Administrator',
    'Administrators',
  ),
  'C:/Users': dir('Administrator', 'Administrators'),
  'C:/Users/Administrator': dir('Administrator', 'Administrators', '0700'),
  'C:/Users/Public': dir('Administrator', 'Administrators'),
  'C:/Program Files': dir('Administrator', 'Administrators'),
  'C:/Partages': dir('Administrator', 'Administrators'),
});

/** Construit un systeme coherent et minimal, pret a etre enrichi par un scenario. */
export function createSystem(spec: SystemSpec): SystemState {
  const isWindows = spec.os === 'windows';
  const baseUsers: SystemState['users'] = isWindows
    ? [
        {
          name: 'Administrator',
          displayName: 'Administrateur',
          groups: ['Administrators'],
          enabled: true,
          passwordSet: true,
          mustChangePassword: false,
          lockedOut: false,
        },
      ]
    : [
        {
          name: 'root',
          uid: 0,
          groups: ['root'],
          enabled: true,
          passwordSet: true,
          mustChangePassword: false,
          lockedOut: false,
          homeDir: '/root',
          shell: '/bin/bash',
        },
      ];
  const baseGroups: SystemState['groups'] = isWindows
    ? [
        {
          name: 'Administrators',
          members: ['Administrator'],
          scope: 'local',
          description: 'Administrateurs locaux',
        },
        { name: 'Users', members: [], scope: 'local', description: 'Utilisateurs' },
      ]
    : [
        { name: 'root', gid: 0, members: ['root'], scope: 'local' },
        { name: 'sudo', gid: 27, members: [], scope: 'local' },
        { name: 'users', gid: 100, members: [], scope: 'local' },
      ];

  return {
    schemaVersion: 1,
    id: spec.id,
    hostname: spec.hostname,
    os: spec.os,
    osVersion: spec.osVersion ?? (isWindows ? 'Windows Server (simule)' : 'GNU/Linux (simule)'),
    powerState: 'running',
    files: {
      ...(isWindows ? WINDOWS_BASE(spec.hostname) : LINUX_BASE(spec.hostname)),
      ...spec.files,
    },
    users: [...baseUsers, ...(spec.users ?? [])],
    groups: [...baseGroups, ...(spec.groups ?? [])],
    processes: isWindows
      ? [
          { pid: 4, name: 'System', user: 'SYSTEM', cpuPercent: 0.2, memoryMb: 24 },
          { pid: 640, name: 'services.exe', user: 'SYSTEM', cpuPercent: 0.4, memoryMb: 48 },
        ]
      : [
          { pid: 1, name: 'systemd', user: 'root', cpuPercent: 0.2, memoryMb: 12 },
          { pid: 220, name: 'sshd', user: 'root', cpuPercent: 0.1, memoryMb: 18 },
        ],
    scheduledTasks: [],
    shares: spec.shares ?? [],
    packages: [],
    environment: {},
    logs: [{ at: 0, source: 'kernel', level: 'info', message: `demarrage de ${spec.hostname}` }],
    resources: {
      cpuPercent: 5,
      memoryTotalMb: 8192,
      memoryUsedMb: 1536,
      diskTotalGb: 120,
      diskUsedGb: 32,
      ...spec.resources,
    },
    ...(spec.domain === undefined ? {} : { domainJoin: { domain: spec.domain, joined: true } }),
    networkNodeId: spec.networkNodeId,
    pendingReboot: false,
  };
}
