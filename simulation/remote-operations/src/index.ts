import type { SystemState, WorldState } from '@tssr/contracts';
import type { EventBus } from '@tssr/events';
import type { NetworkEngine } from '@tssr/sim-network';
import { isPrivileged } from '@tssr/sim-systems';

export type RemoteFailure =
  | 'host-unresolved'
  | 'network-unreachable'
  | 'service-unavailable'
  | 'authentication-failed'
  | 'account-disabled'
  | 'insufficient-rights'
  | 'no-system';

export interface RemoteSession {
  id: string;
  fromNodeId: string;
  targetSystemId: string;
  user: string;
  protocol: 'ssh' | 'winrm' | 'rdp';
  openedAt: number;
}

export interface RemoteResult {
  ok: boolean;
  session?: RemoteSession;
  failure?: { reason: RemoteFailure; detail: string };
}

const PROTOCOL_PORTS: Record<'ssh' | 'winrm' | 'rdp', number> = { ssh: 22, winrm: 5985, rdp: 3389 };

/**
 * Administration a distance : l acces depend reellement du DNS, du routage,
 * du pare-feu, de l etat du service et des droits du compte.
 */
export class RemoteOperationsEngine {
  private readonly world: WorldState;
  private readonly network: NetworkEngine;
  private readonly bus: EventBus | undefined;
  private readonly sessions: RemoteSession[] = [];
  private counter = 0;

  constructor(world: WorldState, deps: { network: NetworkEngine; bus?: EventBus }) {
    this.world = world;
    this.network = deps.network;
    this.bus = deps.bus;
  }

  openSessions(): readonly RemoteSession[] {
    return this.sessions.filter((s) => s.id !== '');
  }

  private systemFor(nodeId: string): SystemState | undefined {
    return this.world.systems.find((s) => s.networkNodeId === nodeId);
  }

  connect(
    fromNodeId: string,
    target: string,
    user: string,
    protocol: 'ssh' | 'winrm' | 'rdp' = 'ssh',
  ): RemoteResult {
    const dns = this.network.resolve(fromNodeId, target);
    if (!dns.resolved || dns.address === undefined) {
      return {
        ok: false,
        failure: { reason: 'host-unresolved', detail: dns.failure?.detail ?? `${target} non resolu` },
      };
    }
    const connection = this.network.connect(fromNodeId, dns.address, PROTOCOL_PORTS[protocol]);
    if (!connection.connected) {
      const reason: RemoteFailure =
        connection.failure?.reason === 'network-unreachable' ? 'network-unreachable' : 'service-unavailable';
      return { ok: false, failure: { reason, detail: connection.failure?.detail ?? 'connexion refusee' } };
    }

    const targetNode = this.network.index().ownersOf(dns.address)[0]?.node;
    if (!targetNode) {
      return { ok: false, failure: { reason: 'network-unreachable', detail: 'hote distant introuvable' } };
    }
    const system = this.systemFor(targetNode.id);
    if (!system) {
      return {
        ok: false,
        failure: { reason: 'no-system', detail: 'cet equipement n expose pas de systeme administrable' },
      };
    }
    const account = system.users.find((u) => u.name.toLowerCase() === user.toLowerCase());
    if (!account) {
      return { ok: false, failure: { reason: 'authentication-failed', detail: `compte ${user} inconnu sur ${system.hostname}` } };
    }
    if (!account.enabled || account.lockedOut) {
      return { ok: false, failure: { reason: 'account-disabled', detail: `le compte ${user} est desactive ou verrouille` } };
    }
    // L administration distante Windows exige des droits d administration.
    if (protocol === 'winrm' && !isPrivileged(system, account.name)) {
      return {
        ok: false,
        failure: { reason: 'insufficient-rights', detail: `${user} n est pas administrateur de ${system.hostname}` },
      };
    }

    this.counter += 1;
    const session: RemoteSession = {
      id: `sess-${this.counter}`,
      fromNodeId,
      targetSystemId: system.id,
      user: account.name,
      protocol,
      openedAt: this.bus?.getSimTime() ?? 0,
    };
    this.sessions.push(session);
    this.bus?.emit({
      category: 'session',
      type: 'remote.session.opened',
      payload: { sessionId: session.id, target: system.hostname, user: account.name, protocol },
      significant: true,
      label: `Session ${protocol.toUpperCase()} ouverte sur ${system.hostname} (${account.name})`,
    });
    return { ok: true, session };
  }

  close(sessionId: string): boolean {
    const index = this.sessions.findIndex((s) => s.id === sessionId);
    if (index === -1) return false;
    this.sessions.splice(index, 1);
    this.bus?.emit({ category: 'session', type: 'remote.session.closed', payload: { sessionId } });
    return true;
  }

  /** Transfert de fichier : le contenu est reellement copie entre systemes simules. */
  copyFile(
    sessionId: string,
    fromSystemId: string,
    sourcePath: string,
    destinationPath: string,
  ): { ok: boolean; error?: string } {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (!session) return { ok: false, error: 'session inexistante' };
    const source = this.world.systems.find((s) => s.id === fromSystemId);
    const target = this.world.systems.find((s) => s.id === session.targetSystemId);
    if (!source || !target) return { ok: false, error: 'systeme introuvable' };
    const node = source.files[sourcePath];
    if (!node) return { ok: false, error: `${sourcePath} introuvable sur ${source.hostname}` };
    target.files[destinationPath] = structuredClone(node);
    this.bus?.emit({
      category: 'config-change',
      type: 'remote.file.copied',
      payload: { sessionId, sourcePath, destinationPath },
      significant: true,
      label: `Fichier copie vers ${target.hostname}`,
    });
    return { ok: true };
  }

  /** Inventaire distant : uniquement des machines de la simulation, jamais du poste reel. */
  inventory(): { hostname: string; os: string; ip: string; services: number }[] {
    return this.world.systems.map((system) => {
      const node = this.network.node(system.networkNodeId);
      return {
        hostname: system.hostname,
        os: `${system.os} ${system.osVersion}`,
        ip: node?.interfaces.flatMap((i) => i.addresses)[0]?.address ?? '(aucune)',
        services: node?.services.length ?? 0,
      };
    });
  }
}
