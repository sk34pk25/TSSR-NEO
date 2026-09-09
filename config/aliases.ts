import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/** Single source of truth for workspace path aliases (Vite + Vitest). */
export const workspacePackages: Record<string, string> = {
  '@tssr/contracts': 'core/contracts/src/index.ts',
  '@tssr/events': 'core/events/src/index.ts',
  '@tssr/storage': 'core/storage/src/index.ts',
  '@tssr/progression': 'core/progression/src/index.ts',
  '@tssr/evaluation': 'core/evaluation/src/index.ts',
  '@tssr/mission-engine': 'core/mission-engine/src/index.ts',
  '@tssr/rendering': 'core/rendering/src/index.ts',
  '@tssr/sync': 'core/sync/src/index.ts',
  '@tssr/permissions': 'core/permissions/src/index.ts',
  '@tssr/sim-network': 'simulation/network/src/index.ts',
  '@tssr/sim-systems': 'simulation/systems/src/index.ts',
  '@tssr/sim-hardware': 'simulation/hardware/src/index.ts',
  '@tssr/sim-itsm': 'simulation/itsm/src/index.ts',
  '@tssr/sim-monitoring': 'simulation/monitoring/src/index.ts',
  '@tssr/sim-virtualization': 'simulation/virtualization/src/index.ts',
  '@tssr/sim-cloud': 'simulation/cloud/src/index.ts',
  '@tssr/sim-backup': 'simulation/backup/src/index.ts',
  '@tssr/sim-deployment': 'simulation/deployment/src/index.ts',
  '@tssr/sim-remote': 'simulation/remote-operations/src/index.ts',
  '@tssr/nova': 'nova/src/index.ts',
  '@tssr/knowledge': 'knowledge/src/index.ts',
};

export const workspaceAliases: Record<string, string> = Object.fromEntries(
  Object.entries(workspacePackages).map(([name, rel]) => [name, resolve(root, rel)]),
);
