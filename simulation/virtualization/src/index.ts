import type { HypervisorHost, VirtualMachine, WorldState } from '@tssr/contracts';
import type { EventBus } from '@tssr/events';
import type { NetworkEngine } from '@tssr/sim-network';

export interface CapacityReport {
  hostId: string;
  vcpuAllocated: number;
  vcpuAvailable: number;
  memoryAllocatedMb: number;
  memoryTotalMb: number;
  storageAllocatedGb: number;
  storageTotalGb: number;
  overcommitRatio: number;
}

export type VmError = 'not-found' | 'host-down' | 'insufficient-memory' | 'insufficient-storage' | 'already-running';

/**
 * Virtualisation : les VM consomment reellement les ressources de leur hote
 * et leurs cartes virtuelles participent a la topologie reseau.
 */
export class VirtualizationEngine {
  private readonly world: WorldState;
  private readonly network: NetworkEngine;
  private readonly bus: EventBus | undefined;

  constructor(world: WorldState, deps: { network: NetworkEngine; bus?: EventBus }) {
    this.world = world;
    this.network = deps.network;
    this.bus = deps.bus;
  }

  host(id: string): HypervisorHost | undefined {
    return this.world.hypervisors.find((h) => h.id === id || h.name === id);
  }

  vm(id: string): VirtualMachine | undefined {
    return this.world.vms.find((v) => v.id === id || v.name === id);
  }

  vmsOn(hostId: string): VirtualMachine[] {
    return this.world.vms.filter((v) => v.hostId === hostId);
  }

  capacity(hostId: string): CapacityReport | undefined {
    const host = this.host(hostId);
    if (!host) return undefined;
    const running = this.vmsOn(host.id).filter((v) => v.state === 'running');
    const all = this.vmsOn(host.id);
    const vcpu = running.reduce((sum, v) => sum + v.vcpu, 0);
    const memory = running.reduce((sum, v) => sum + v.memoryMb, 0);
    const storage = all.reduce((sum, v) => sum + v.diskGb, 0);
    return {
      hostId: host.id,
      vcpuAllocated: vcpu,
      vcpuAvailable: Math.max(0, host.cpuCores - vcpu),
      memoryAllocatedMb: memory,
      memoryTotalMb: host.memoryMb,
      storageAllocatedGb: storage,
      storageTotalGb: host.storageGb,
      overcommitRatio: host.cpuCores === 0 ? 0 : Math.round((vcpu / host.cpuCores) * 100) / 100,
    };
  }

  start(vmId: string): { ok: boolean; error?: VmError; detail?: string } {
    const vm = this.vm(vmId);
    if (!vm) return { ok: false, error: 'not-found', detail: 'machine virtuelle introuvable' };
    if (vm.state === 'running') return { ok: false, error: 'already-running', detail: 'la VM est deja demarree' };
    const host = this.host(vm.hostId);
    if (!host || host.state !== 'up') {
      return { ok: false, error: 'host-down', detail: 'l hote de virtualisation n est pas disponible' };
    }
    const cap = this.capacity(host.id);
    if (cap && cap.memoryAllocatedMb + vm.memoryMb > cap.memoryTotalMb) {
      return {
        ok: false,
        error: 'insufficient-memory',
        detail: `memoire insuffisante sur ${host.name} : ${cap.memoryTotalMb - cap.memoryAllocatedMb} Mo libres, ${vm.memoryMb} Mo demandes`,
      };
    }
    vm.state = 'running';
    if (vm.systemId !== undefined) {
      const system = this.world.systems.find((s) => s.id === vm.systemId);
      if (system) {
        system.powerState = 'running';
        this.network.setNodePower(system.networkNodeId, true);
      }
    }
    this.bus?.emit({
      category: 'config-change',
      type: 'virtualization.vm.started',
      payload: { vmId: vm.id, hostId: host.id },
      significant: true,
      label: `VM ${vm.name} demarree sur ${host.name}`,
    });
    return { ok: true };
  }

  stop(vmId: string): boolean {
    const vm = this.vm(vmId);
    if (!vm) return false;
    vm.state = 'stopped';
    if (vm.systemId !== undefined) {
      const system = this.world.systems.find((s) => s.id === vm.systemId);
      if (system) {
        system.powerState = 'stopped';
        this.network.setNodePower(system.networkNodeId, false);
      }
    }
    this.bus?.emit({
      category: 'config-change',
      type: 'virtualization.vm.stopped',
      payload: { vmId: vm.id },
      significant: true,
      label: `VM ${vm.name} arretee`,
    });
    return true;
  }

  snapshot(vmId: string, name: string): string | undefined {
    const vm = this.vm(vmId);
    if (!vm) return undefined;
    const id = `${vm.id}-snap-${vm.snapshots.length + 1}`;
    const parent = vm.snapshots[vm.snapshots.length - 1]?.id;
    vm.snapshots.push({
      id,
      name,
      takenAt: this.bus?.getSimTime() ?? 0,
      ...(parent === undefined ? {} : { parentId: parent }),
    });
    this.bus?.emit({
      category: 'snapshot',
      type: 'virtualization.snapshot.taken',
      payload: { vmId: vm.id, snapshotId: id },
      significant: true,
      label: `Instantane "${name}" de ${vm.name}`,
    });
    return id;
  }

  /** Clone : une VM template produit une copie independante, arretee. */
  clone(vmId: string, newName: string): VirtualMachine | undefined {
    const source = this.vm(vmId);
    if (!source) return undefined;
    const clone: VirtualMachine = {
      ...structuredClone(source),
      id: `${source.id}-clone-${this.world.vms.length + 1}`,
      name: newName,
      state: 'stopped',
      snapshots: [],
      template: false,
    };
    this.world.vms.push(clone);
    this.bus?.emit({
      category: 'config-change',
      type: 'virtualization.vm.cloned',
      payload: { source: source.id, clone: clone.id },
      significant: true,
      label: `VM ${newName} clonee depuis ${source.name}`,
    });
    return clone;
  }

  /** Une panne d hote arrete toutes ses VM : c est la lecon de la haute disponibilite. */
  failHost(hostId: string): string[] {
    const host = this.host(hostId);
    if (!host) return [];
    host.state = 'down';
    const stopped: string[] = [];
    for (const vm of this.vmsOn(host.id)) {
      if (vm.state === 'running') {
        this.stop(vm.id);
        stopped.push(vm.id);
      }
    }
    this.bus?.emit({
      category: 'incident',
      type: 'virtualization.host.failed',
      payload: { hostId: host.id, stopped },
      significant: true,
      label: `Hote ${host.name} indisponible`,
    });
    return stopped;
  }
}
