import type {
  GroupAccount,
  LogEntry,
  ServiceStatus,
  SystemState,
  UserAccount,
} from '@tssr/contracts';
import type { EventBus } from '@tssr/events';
import type { NetworkEngine } from '@tssr/sim-network';
import { isPrivileged } from './fs.ts';

export interface SystemEngineDeps {
  network: NetworkEngine;
  bus?: EventBus;
}

/**
 * Facade systeme : comptes, services, journaux, etat d execution.
 * Les services et l adressage vivent dans la topologie reseau : ils ne sont jamais dupliques ici.
 */
export class SystemEngine {
  readonly system: SystemState;
  private readonly network: NetworkEngine;
  private readonly bus: EventBus | undefined;

  constructor(system: SystemState, deps: SystemEngineDeps) {
    this.system = system;
    this.network = deps.network;
    this.bus = deps.bus;
  }

  private emit(type: string, payload: Record<string, unknown>, label?: string): void {
    this.bus?.emit({
      category: 'config-change',
      type,
      payload: { systemId: this.system.id, ...payload },
      significant: true,
      ...(label === undefined ? {} : { label }),
    });
  }

  log(level: LogEntry['level'], source: string, message: string): void {
    this.system.logs.push({ at: this.bus?.getSimTime() ?? 0, source, level, message });
    if (this.system.logs.length > 500) this.system.logs.splice(0, this.system.logs.length - 500);
  }

  node() {
    return this.network.node(this.system.networkNodeId);
  }

  services() {
    return this.node()?.services ?? [];
  }

  setServiceStatus(serviceName: string, status: ServiceStatus, actor: string): boolean {
    if (!isPrivileged(this.system, actor)) return false;
    const ok = this.network.setServiceStatus(this.system.networkNodeId, serviceName, status);
    if (ok) {
      this.log('info', 'systemd', `service ${serviceName} -> ${status}`);
      const service = this.services().find((s) => s.id === serviceName || s.name === serviceName);
      if (service) {
        if (status === 'running') {
          if (!this.system.processes.some((p) => p.serviceId === service.id)) {
            this.system.processes.push({
              pid: 1000 + this.system.processes.length,
              name: service.name,
              user: 'root',
              cpuPercent: 1,
              memoryMb: 64,
              serviceId: service.id,
            });
          }
        } else {
          this.system.processes = this.system.processes.filter((p) => p.serviceId !== service.id);
        }
      }
    }
    return ok;
  }

  setServiceStartup(
    serviceName: string,
    startupType: 'auto' | 'manual' | 'disabled',
    actor: string,
  ): boolean {
    if (!isPrivileged(this.system, actor)) return false;
    const service = this.services().find((s) => s.id === serviceName || s.name === serviceName);
    if (!service) return false;
    service.startupType = startupType;
    this.emit('system.service.startup', { service: service.name, startupType });
    return true;
  }

  addUser(account: Omit<UserAccount, 'groups'> & { groups?: string[] }, actor: string): boolean {
    if (!isPrivileged(this.system, actor)) return false;
    if (this.system.users.some((u) => u.name.toLowerCase() === account.name.toLowerCase()))
      return false;
    this.system.users.push({ ...account, groups: account.groups ?? [] });
    this.emit(
      'system.user.created',
      { user: account.name },
      `${this.system.hostname} : compte ${account.name} cree`,
    );
    this.log('info', 'accounts', `compte ${account.name} cree`);
    return true;
  }

  setUserEnabled(name: string, enabled: boolean, actor: string): boolean {
    if (!isPrivileged(this.system, actor)) return false;
    const user = this.system.users.find((u) => u.name.toLowerCase() === name.toLowerCase());
    if (!user) return false;
    user.enabled = enabled;
    this.emit('system.user.state', { user: name, enabled });
    return true;
  }

  addGroup(group: Omit<GroupAccount, 'members'> & { members?: string[] }, actor: string): boolean {
    if (!isPrivileged(this.system, actor)) return false;
    if (this.system.groups.some((g) => g.name.toLowerCase() === group.name.toLowerCase()))
      return false;
    this.system.groups.push({ ...group, members: group.members ?? [] });
    this.emit('system.group.created', { group: group.name });
    return true;
  }

  addUserToGroup(user: string, group: string, actor: string): boolean {
    if (!isPrivileged(this.system, actor)) return false;
    const account = this.system.users.find((u) => u.name.toLowerCase() === user.toLowerCase());
    const target = this.system.groups.find((g) => g.name.toLowerCase() === group.toLowerCase());
    if (!account || !target) return false;
    if (!target.members.includes(account.name)) target.members.push(account.name);
    if (!account.groups.includes(target.name)) account.groups.push(target.name);
    this.emit(
      'system.group.member-added',
      { user: account.name, group: target.name },
      `${account.name} ajoute au groupe ${target.name}`,
    );
    return true;
  }

  reboot(actor: string): boolean {
    if (!isPrivileged(this.system, actor)) return false;
    this.system.powerState = 'running';
    this.system.pendingReboot = false;
    // Au redemarrage, seuls les services en demarrage automatique repartent.
    for (const service of this.services()) {
      if (service.startupType === 'auto') {
        this.network.setServiceStatus(this.system.networkNodeId, service.id, 'running');
      } else {
        this.network.setServiceStatus(this.system.networkNodeId, service.id, 'stopped');
      }
    }
    this.log('info', 'kernel', 'redemarrage du systeme');
    this.emit('system.reboot', {}, `${this.system.hostname} redemarre`);
    return true;
  }
}
