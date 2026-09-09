import type {
  NetworkInterface,
  NetworkNode,
  NetworkTopology,
  Route,
  ServiceStatus,
  VlanId,
} from '@tssr/contracts';
import { EventBus, Rng } from '@tssr/events';
import { TopologyIndex } from './topology-index.ts';
import { checkReachability, forwardPacket, type ForwardResult, type ReachabilityResult } from './forward.ts';
import { connectToService, requestDhcpLease, resolveName, type ConnectResult, type DnsResult } from './services.ts';
import { effectiveRoutes, type EffectiveRoute } from './routing.ts';
import { networkOf } from './ip.ts';

export interface PingReply {
  seq: number;
  success: boolean;
  timeMs?: number;
  reason?: string;
}

export interface PingResult {
  target: string;
  resolvedAddress?: string;
  replies: PingReply[];
  transmitted: number;
  received: number;
  lossPercent: number;
  averageMs?: number;
  /** Trace structurelle : identique quel que soit le tirage aleatoire. */
  path: ReachabilityResult;
  dns?: DnsResult;
}

export interface TracerouteHop {
  ttl: number;
  nodeId: string;
  hostname: string;
  timeMs: number;
}

export interface TracerouteResult {
  target: string;
  resolvedAddress?: string;
  hops: TracerouteHop[];
  completed: boolean;
  failure?: string;
}

/**
 * Facade du moteur reseau : lecture, diagnostic et mutations.
 * Chaque mutation emet un evenement afin que la 3D, la supervision, les tickets
 * et l evaluation observent exactement le meme changement.
 */
export class NetworkEngine {
  private state: NetworkTopology;
  private readonly bus: EventBus | undefined;
  private rng: Rng;

  constructor(topology: NetworkTopology, options: { bus?: EventBus; rng?: Rng } = {}) {
    this.state = topology;
    this.bus = options.bus;
    this.rng = options.rng ?? new Rng(1);
  }

  get topology(): NetworkTopology {
    return this.state;
  }

  index(): TopologyIndex {
    return new TopologyIndex(this.state);
  }

  node(idOrHostname: string): NetworkNode | undefined {
    const index = this.index();
    return index.node(idOrHostname) ?? index.nodeByHostname(idOrHostname);
  }

  routingTable(nodeId: string): EffectiveRoute[] {
    const node = this.node(nodeId);
    return node ? effectiveRoutes(node) : [];
  }

  private emit(type: string, payload: Record<string, unknown>, label?: string): void {
    this.bus?.emit({
      category: 'config-change',
      type,
      payload,
      significant: true,
      ...(label === undefined ? {} : { label }),
    });
  }

  private findInterface(nodeId: string, nameOrId: string): { node: NetworkNode; iface: NetworkInterface } | undefined {
    const node = this.node(nodeId);
    if (!node) return undefined;
    const iface =
      node.interfaces.find((i) => i.id === nameOrId) ??
      node.interfaces.find((i) => i.name.toLowerCase() === nameOrId.toLowerCase());
    return iface ? { node, iface } : undefined;
  }

  // ---------------------------------------------------------------- diagnostic

  resolve(fromNodeId: string, name: string): DnsResult {
    return resolveName(this.state, fromNodeId, name);
  }

  reach(fromNodeId: string, address: string): ReachabilityResult {
    return checkReachability(this.state, fromNodeId, address);
  }

  connect(fromNodeId: string, address: string, port: number, protocol: 'tcp' | 'udp' = 'tcp'): ConnectResult {
    return connectToService(this.state, fromNodeId, address, port, protocol);
  }

  ping(fromNodeId: string, target: string, count = 4): PingResult {
    const dns = resolveName(this.state, fromNodeId, target);
    if (!dns.resolved || dns.address === undefined) {
      const empty = forwardPacket(this.state, fromNodeId, '0.0.0.0');
      return {
        target,
        replies: [],
        transmitted: 0,
        received: 0,
        lossPercent: 100,
        path: { ...empty, returnOk: false },
        dns,
      };
    }
    const address = dns.address;
    const path = checkReachability(this.state, fromNodeId, address);
    const replies: PingReply[] = [];
    for (let seq = 1; seq <= count; seq += 1) {
      if (!path.delivered || !path.returnOk) {
        replies.push({
          seq,
          success: false,
          reason: path.delivered ? 'pas de route de retour' : (path.failure?.detail ?? 'destination injoignable'),
        });
        continue;
      }
      // La perte est tiree par le generateur deterministe : rejouable a l identique.
      if (this.rng.next() < path.lossRate) {
        replies.push({ seq, success: false, reason: 'paquet perdu' });
        continue;
      }
      const jitter = 1 + (this.rng.next() - 0.5) * 0.3;
      replies.push({ seq, success: true, timeMs: Math.round(path.latencyMs * 2 * jitter * 100) / 100 });
    }
    const received = replies.filter((r) => r.success).length;
    const times = replies.filter((r) => r.timeMs !== undefined).map((r) => r.timeMs as number);
    this.bus?.emit({
      category: 'command',
      type: 'network.ping',
      payload: { from: fromNodeId, target, address, received, transmitted: count },
    });
    return {
      target,
      resolvedAddress: address,
      replies,
      transmitted: count,
      received,
      lossPercent: count === 0 ? 100 : Math.round(((count - received) / count) * 100),
      ...(times.length > 0
        ? { averageMs: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 100) / 100 }
        : {}),
      path,
      dns,
    };
  }

  traceroute(fromNodeId: string, target: string): TracerouteResult {
    const dns = resolveName(this.state, fromNodeId, target);
    if (!dns.resolved || dns.address === undefined) {
      return { target, hops: [], completed: false, failure: dns.failure?.detail ?? 'nom non resolu' };
    }
    const result: ForwardResult = forwardPacket(this.state, fromNodeId, dns.address);
    const hops: TracerouteHop[] = [];
    let ttl = 1;
    let cumulative = 0;
    for (const hop of result.hops) {
      if (hop.action === 'nat') continue;
      cumulative += hop.latencyMs;
      hops.push({
        ttl,
        nodeId: hop.nodeId,
        hostname: hop.hostname,
        timeMs: Math.round(cumulative * 2 * 100) / 100,
      });
      ttl += 1;
    }
    return {
      target,
      resolvedAddress: dns.address,
      hops,
      completed: result.delivered,
      ...(result.failure === undefined ? {} : { failure: result.failure.detail }),
    };
  }

  // ----------------------------------------------------------------- mutations

  setInterfaceAddress(nodeId: string, ifaceName: string, address: string, prefix: number): boolean {
    const found = this.findInterface(nodeId, ifaceName);
    if (!found) return false;
    found.iface.addresses = [{ address, prefix, source: 'static' }];
    this.emit(
      'network.interface.address',
      { nodeId: found.node.id, interfaceId: found.iface.id, address, prefix },
      `${found.node.hostname} : ${found.iface.name} = ${address}/${prefix}`,
    );
    return true;
  }

  clearInterfaceAddresses(nodeId: string, ifaceName: string): boolean {
    const found = this.findInterface(nodeId, ifaceName);
    if (!found) return false;
    found.iface.addresses = [];
    this.emit('network.interface.address-cleared', {
      nodeId: found.node.id,
      interfaceId: found.iface.id,
    });
    return true;
  }

  setInterfaceEnabled(nodeId: string, ifaceName: string, enabled: boolean): boolean {
    const found = this.findInterface(nodeId, ifaceName);
    if (!found) return false;
    found.iface.enabled = enabled;
    this.emit(
      'network.interface.state',
      { nodeId: found.node.id, interfaceId: found.iface.id, enabled },
      `${found.node.hostname} : ${found.iface.name} ${enabled ? 'active' : 'desactive'}`,
    );
    return true;
  }

  setAccessVlan(nodeId: string, ifaceName: string, vlan: VlanId): boolean {
    const found = this.findInterface(nodeId, ifaceName);
    if (!found) return false;
    found.iface.mode = 'access';
    found.iface.accessVlan = vlan;
    this.emit(
      'network.interface.vlan',
      { nodeId: found.node.id, interfaceId: found.iface.id, mode: 'access', vlan },
      `${found.node.hostname} : ${found.iface.name} en access VLAN ${vlan}`,
    );
    return true;
  }

  setTrunk(nodeId: string, ifaceName: string, vlans: VlanId[], nativeVlan?: VlanId): boolean {
    const found = this.findInterface(nodeId, ifaceName);
    if (!found) return false;
    found.iface.mode = 'trunk';
    found.iface.trunkVlans = [...new Set(vlans)].sort((a, b) => a - b);
    if (nativeVlan !== undefined) found.iface.nativeVlan = nativeVlan;
    this.emit(
      'network.interface.vlan',
      { nodeId: found.node.id, interfaceId: found.iface.id, mode: 'trunk', vlans: found.iface.trunkVlans },
      `${found.node.hostname} : ${found.iface.name} en trunk`,
    );
    return true;
  }

  declareVlan(nodeId: string, vlan: VlanId, name = ''): boolean {
    const node = this.node(nodeId);
    if (!node) return false;
    if (node.vlans.some((v) => v.id === vlan)) return true;
    node.vlans.push({ id: vlan, name });
    this.emit('network.vlan.declared', { nodeId: node.id, vlan, name }, `VLAN ${vlan} declare sur ${node.hostname}`);
    return true;
  }

  addRoute(nodeId: string, route: Omit<Route, 'origin'> & { origin?: Route['origin'] }): boolean {
    const node = this.node(nodeId);
    if (!node) return false;
    const exists = node.routes.some((r) => r.destination === route.destination && r.via === route.via);
    if (exists) return true;
    node.routes.push({ origin: 'static', ...route, metric: route.metric ?? 0 });
    this.emit(
      'network.route.added',
      { nodeId: node.id, destination: route.destination, via: route.via },
      `${node.hostname} : route ${route.destination}${route.via ? ` via ${route.via}` : ''}`,
    );
    return true;
  }

  removeRoute(nodeId: string, destination: string): boolean {
    const node = this.node(nodeId);
    if (!node) return false;
    const before = node.routes.length;
    node.routes = node.routes.filter((r) => r.destination !== destination);
    if (node.routes.length === before) return false;
    this.emit('network.route.removed', { nodeId: node.id, destination }, `${node.hostname} : route ${destination} supprimee`);
    return true;
  }

  setDefaultGateway(nodeId: string, gateway: string): boolean {
    const node = this.node(nodeId);
    if (!node) return false;
    const iface = node.interfaces.find((i) =>
      i.enabled && i.addresses.some((a) => networkOf(a.address, a.prefix) === networkOf(gateway, a.prefix)),
    );
    if (!iface) return false;
    node.routes = node.routes.filter((r) => r.destination !== '0.0.0.0/0');
    node.routes.push({ destination: '0.0.0.0/0', via: gateway, interfaceId: iface.id, metric: 10, origin: 'default' });
    this.emit('network.route.default', { nodeId: node.id, gateway }, `${node.hostname} : passerelle par defaut ${gateway}`);
    return true;
  }

  setDnsClients(nodeId: string, servers: string[]): boolean {
    const node = this.node(nodeId);
    if (!node) return false;
    node.dnsClients = [...servers];
    this.emit('network.dns.client', { nodeId: node.id, servers }, `${node.hostname} : DNS ${servers.join(', ')}`);
    return true;
  }

  setLinkConnected(linkId: string, connected: boolean): boolean {
    const link = this.state.links.find((l) => l.id === linkId);
    if (!link) return false;
    link.connected = connected;
    this.emit(
      'network.link.state',
      { linkId, connected },
      connected ? `lien ${linkId} raccorde` : `lien ${linkId} debranche`,
    );
    return true;
  }

  setNodePower(nodeId: string, powered: boolean): boolean {
    const node = this.node(nodeId);
    if (!node) return false;
    node.powered = powered;
    this.emit(
      'network.node.power',
      { nodeId: node.id, powered },
      `${node.hostname} ${powered ? 'demarre' : 'eteint'}`,
    );
    return true;
  }

  setServiceStatus(nodeId: string, serviceId: string, status: ServiceStatus): boolean {
    const node = this.node(nodeId);
    if (!node) return false;
    const service = node.services.find((s) => s.id === serviceId || s.name === serviceId);
    if (!service) return false;
    service.status = status;
    this.emit(
      'network.service.status',
      { nodeId: node.id, serviceId: service.id, status },
      `${node.hostname} : service ${service.name} -> ${status}`,
    );
    return true;
  }

  /** Demande de bail DHCP appliquee reellement a l interface (adresse, passerelle, DNS). */
  renewDhcp(nodeId: string, ifaceName: string): ReturnType<typeof requestDhcpLease> {
    const found = this.findInterface(nodeId, ifaceName);
    if (!found) {
      return { success: false, failure: { reason: 'no-server', detail: 'interface introuvable' } };
    }
    const result = requestDhcpLease(this.state, found.node.id, found.iface.id);
    if (result.success && result.offer) {
      const offer = result.offer;
      found.iface.addresses = [{ address: offer.address, prefix: offer.prefix, source: 'dhcp' }];
      this.state.dhcpLeases = this.state.dhcpLeases.filter((l) => l.mac !== found.iface.mac);
      this.state.dhcpLeases.push({
        serverNodeId: offer.serverNodeId,
        poolId: offer.poolId,
        mac: found.iface.mac,
        address: offer.address,
        clientNodeId: found.node.id,
        expiresAt: (this.bus?.getSimTime() ?? 0) + offer.leaseSeconds * 1000,
      });
      if (offer.gateway !== undefined) this.setDefaultGateway(found.node.id, offer.gateway);
      if (offer.dnsServers.length > 0) found.node.dnsClients = [...offer.dnsServers];
      this.emit(
        'network.dhcp.lease',
        { nodeId: found.node.id, address: offer.address, serverNodeId: offer.serverNodeId },
        `${found.node.hostname} obtient ${offer.address} par DHCP`,
      );
    } else if (result.apipa !== undefined) {
      found.iface.addresses = [{ address: result.apipa, prefix: 16, source: 'apipa' }];
      this.emit(
        'network.dhcp.failed',
        { nodeId: found.node.id, reason: result.failure?.reason, apipa: result.apipa },
        `${found.node.hostname} : echec DHCP, auto-configuration ${result.apipa}`,
      );
    }
    return result;
  }
}
