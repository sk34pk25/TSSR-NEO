import type { DnsZone, NetworkNode, NetworkTopology, ServiceKind, ServiceState } from '@tssr/contracts';
import { TopologyIndex } from './topology-index.ts';
import { forwardPacket, type ForwardResult } from './forward.ts';
import { floodDomain } from './l2.ts';
import { inCidr, intToIp, ipToInt, isValidIpv4, parseCidr } from './ip.ts';

export const DEFAULT_PORTS: Record<ServiceKind, number> = {
  dhcp: 67,
  dns: 53,
  http: 80,
  https: 443,
  ssh: 22,
  rdp: 3389,
  smb: 445,
  ldap: 389,
  kerberos: 88,
  ntp: 123,
  smtp: 25,
  snmp: 161,
  winrm: 5985,
  sql: 1433,
};

/** Un service est reellement disponible si lui et toutes ses dependances tournent. */
export function serviceAvailable(node: NetworkNode, service: ServiceState, seen = new Set<string>()): boolean {
  if (!node.powered) return false;
  if (service.status !== 'running') return false;
  if (seen.has(service.id)) return true;
  seen.add(service.id);
  for (const depId of service.dependsOn) {
    const dep = node.services.find((s) => s.id === depId);
    if (!dep) continue;
    if (!serviceAvailable(node, dep, seen)) return false;
  }
  return true;
}

export function findListeningService(
  node: NetworkNode,
  port: number,
  protocol: 'tcp' | 'udp',
): ServiceState | undefined {
  return node.services.find((s) => s.port === port && s.protocol === protocol);
}

export type ConnectFailure =
  | 'network-unreachable'
  | 'no-service-listening'
  | 'service-stopped'
  | 'service-failed'
  | 'dependency-down'
  | 'host-not-found';

export interface ConnectResult {
  connected: boolean;
  transport: ForwardResult;
  service?: ServiceState;
  failure?: { reason: ConnectFailure; detail: string };
}

/** Etablit une connexion applicative : reseau, puis service, puis dependances. */
export function connectToService(
  topology: NetworkTopology,
  fromNodeId: string,
  destinationAddress: string,
  port: number,
  protocol: 'tcp' | 'udp' = 'tcp',
): ConnectResult {
  const transport = forwardPacket(topology, fromNodeId, destinationAddress, {
    protocol,
    destinationPort: port,
  });
  if (!transport.delivered) {
    return {
      connected: false,
      transport,
      failure: {
        reason: 'network-unreachable',
        detail: transport.failure?.detail ?? 'destination injoignable',
      },
    };
  }

  const index = new TopologyIndex(topology);
  const owner = index.ownersOf(destinationAddress)[0]?.node;
  if (!owner) {
    return { connected: false, transport, failure: { reason: 'host-not-found', detail: 'hote introuvable' } };
  }

  const service = findListeningService(owner, port, protocol);
  if (!service) {
    return {
      connected: false,
      transport,
      failure: {
        reason: 'no-service-listening',
        detail: `aucun service n ecoute sur ${protocol}/${port} sur ${owner.hostname}`,
      },
    };
  }
  if (service.status === 'stopped') {
    return {
      connected: false,
      transport,
      service,
      failure: { reason: 'service-stopped', detail: `le service ${service.name} est arrete` },
    };
  }
  if (service.status === 'failed') {
    return {
      connected: false,
      transport,
      service,
      failure: { reason: 'service-failed', detail: `le service ${service.name} est en erreur` },
    };
  }
  if (!serviceAvailable(owner, service)) {
    const missing = service.dependsOn
      .map((id) => owner.services.find((s) => s.id === id))
      .filter((s): s is ServiceState => s !== undefined && s.status !== 'running')
      .map((s) => s.name);
    return {
      connected: false,
      transport,
      service,
      failure: {
        reason: 'dependency-down',
        detail: `dependance indisponible : ${missing.join(', ') || 'inconnue'}`,
      },
    };
  }

  return { connected: true, transport, service };
}

export type DnsFailure = 'no-resolver' | 'resolver-unreachable' | 'service-down' | 'nxdomain' | 'loop';

export interface DnsResult {
  resolved: boolean;
  address?: string;
  serverAddress?: string;
  /** Chaine de resolution suivie (CNAME, redirecteurs) : utile pour expliquer le resultat. */
  chain: string[];
  failure?: { reason: DnsFailure; detail: string };
}

function normalize(name: string): string {
  return name.replace(/\.$/, '').toLowerCase();
}

function zoneFor(node: NetworkNode, name: string): DnsZone | undefined {
  const target = normalize(name);
  return node.dnsZones.find((z) => {
    const zoneName = normalize(z.name);
    return target === zoneName || target.endsWith(`.${zoneName}`);
  });
}

function lookupInZone(node: NetworkNode, name: string, chain: string[], depth = 0): string | undefined {
  if (depth > 5) return undefined;
  const zone = zoneFor(node, name);
  if (!zone) return undefined;
  const target = normalize(name);
  const record = zone.records.find((r) => normalize(r.name) === target && (r.type === 'A' || r.type === 'CNAME'));
  if (!record) return undefined;
  chain.push(`${record.name} ${record.type} ${record.value}`);
  if (record.type === 'A') return record.value;
  return lookupInZone(node, record.value, chain, depth + 1);
}

/** Resolution DNS complete depuis un client, en traversant reellement le reseau. */
export function resolveName(
  topology: NetworkTopology,
  fromNodeId: string,
  name: string,
): DnsResult {
  const chain: string[] = [];
  if (isValidIpv4(name)) return { resolved: true, address: name, chain };

  const index = new TopologyIndex(topology);
  const client = index.node(fromNodeId);
  if (!client) {
    return { resolved: false, chain, failure: { reason: 'no-resolver', detail: 'client introuvable' } };
  }
  if (client.dnsClients.length === 0) {
    return {
      resolved: false,
      chain,
      failure: { reason: 'no-resolver', detail: `aucun serveur DNS configure sur ${client.hostname}` },
    };
  }

  let lastFailure: DnsResult['failure'];
  for (const serverIp of client.dnsClients) {
    const reach = forwardPacket(topology, fromNodeId, serverIp, { protocol: 'udp', destinationPort: 53 });
    if (!reach.delivered) {
      lastFailure = {
        reason: 'resolver-unreachable',
        detail: `serveur DNS ${serverIp} injoignable : ${reach.failure?.detail ?? 'inconnu'}`,
      };
      continue;
    }
    const server = index.ownersOf(serverIp)[0]?.node;
    if (!server) continue;
    const dns = server.services.find((s) => s.kind === 'dns');
    if (!dns || !serviceAvailable(server, dns)) {
      lastFailure = {
        reason: 'service-down',
        detail: `le service DNS de ${server.hostname} ne repond pas`,
      };
      continue;
    }

    const direct = lookupInZone(server, name, chain);
    if (direct !== undefined) {
      return { resolved: true, address: direct, serverAddress: serverIp, chain };
    }

    const zone = zoneFor(server, name);
    const forwarder = zone?.forwarder;
    if (forwarder !== undefined) {
      chain.push(`redirection vers ${forwarder}`);
      const upstream = index.ownersOf(forwarder)[0]?.node;
      if (upstream) {
        const viaForwarder = lookupInZone(upstream, name, chain);
        if (viaForwarder !== undefined) {
          return { resolved: true, address: viaForwarder, serverAddress: forwarder, chain };
        }
      }
    }

    lastFailure = {
      reason: 'nxdomain',
      detail: `${name} est inconnu du serveur ${server.hostname}`,
    };
  }

  return {
    resolved: false,
    chain,
    failure: lastFailure ?? { reason: 'nxdomain', detail: `${name} introuvable` },
  };
}

export interface DhcpOffer {
  address: string;
  prefix: number;
  gateway?: string;
  dnsServers: string[];
  leaseSeconds: number;
  serverNodeId: string;
  poolId: string;
}

export type DhcpFailure = 'no-server' | 'pool-exhausted' | 'link-down' | 'no-pool-for-subnet';

export interface DhcpResult {
  success: boolean;
  offer?: DhcpOffer;
  /** Adresse d auto-configuration attribuee faute de serveur : symptome tres parlant. */
  apipa?: string;
  failure?: { reason: DhcpFailure; detail: string };
}

function apipaFor(mac: string): string {
  const bytes = mac.split(':').map((h) => parseInt(h, 16));
  const b3 = ((bytes[4] ?? 0) % 254) + 1;
  const b4 = ((bytes[5] ?? 0) % 254) + 1;
  return `169.254.${b3}.${b4}`;
}

/** Sequence DHCP complete : diffusion, selection du serveur, allocation deterministe. */
export function requestDhcpLease(
  topology: NetworkTopology,
  nodeId: string,
  interfaceId: string,
): DhcpResult {
  const index = new TopologyIndex(topology);
  const clientRef = index.interfaceRef(interfaceId);
  if (!clientRef || clientRef.node.id !== nodeId) {
    return { success: false, failure: { reason: 'no-server', detail: 'interface introuvable' } };
  }
  const mac = clientRef.iface.mac;

  const flood = floodDomain(index, { nodeId, interfaceId });
  if (flood.endpoints.length === 0) {
    return {
      success: false,
      apipa: apipaFor(mac),
      failure: { reason: 'link-down', detail: 'aucun equipement joignable en diffusion' },
    };
  }

  const candidates = flood.endpoints
    .map((ep) => ({ ep, ref: index.interfaceRef(ep.interfaceId) }))
    .filter((c) => c.ref !== undefined)
    .filter((c) => {
      const server = c.ref?.node;
      if (!server) return false;
      const dhcp = server.services.find((s) => s.kind === 'dhcp');
      return dhcp !== undefined && serviceAvailable(server, dhcp);
    })
    // Ordre stable : le premier serveur par identifiant repond, pas un tirage arbitraire.
    .sort((a, b) => (a.ref?.node.id ?? '').localeCompare(b.ref?.node.id ?? ''));

  if (candidates.length === 0) {
    return {
      success: false,
      apipa: apipaFor(mac),
      failure: { reason: 'no-server', detail: 'aucun serveur DHCP n a repondu dans ce domaine de diffusion' },
    };
  }

  for (const candidate of candidates) {
    const server = candidate.ref?.node;
    const serverIface = candidate.ref?.iface;
    if (!server || !serverIface) continue;

    const pool = server.dhcpPools.find((p) =>
      serverIface.addresses.some((a) => inCidr(a.address, p.subnet)),
    );
    if (!pool) continue;

    const reservation = pool.reservations.find((r) => r.mac === mac);
    const { prefix } = parseCidr(pool.subnet);
    const used = new Set<string>();
    for (const node of topology.nodes) {
      for (const iface of node.interfaces) {
        for (const addr of iface.addresses) used.add(addr.address);
      }
    }
    for (const lease of topology.dhcpLeases) {
      if (lease.mac !== mac) used.add(lease.address);
    }

    if (reservation) {
      return {
        success: true,
        offer: {
          address: reservation.address,
          prefix,
          ...(pool.gateway === undefined ? {} : { gateway: pool.gateway }),
          dnsServers: pool.dnsServers,
          leaseSeconds: pool.leaseSeconds,
          serverNodeId: server.id,
          poolId: pool.id,
        },
      };
    }

    const existing = topology.dhcpLeases.find((l) => l.mac === mac && l.poolId === pool.id);
    if (existing && !used.has(existing.address)) {
      return {
        success: true,
        offer: {
          address: existing.address,
          prefix,
          ...(pool.gateway === undefined ? {} : { gateway: pool.gateway }),
          dnsServers: pool.dnsServers,
          leaseSeconds: pool.leaseSeconds,
          serverNodeId: server.id,
          poolId: pool.id,
        },
      };
    }

    const start = ipToInt(pool.rangeStart);
    const end = ipToInt(pool.rangeEnd);
    for (let candidateInt = start; candidateInt <= end; candidateInt += 1) {
      const address = intToIp(candidateInt);
      if (used.has(address)) continue;
      return {
        success: true,
        offer: {
          address,
          prefix,
          ...(pool.gateway === undefined ? {} : { gateway: pool.gateway }),
          dnsServers: pool.dnsServers,
          leaseSeconds: pool.leaseSeconds,
          serverNodeId: server.id,
          poolId: pool.id,
        },
      };
    }

    return {
      success: false,
      apipa: apipaFor(mac),
      failure: { reason: 'pool-exhausted', detail: `la plage ${pool.rangeStart}-${pool.rangeEnd} est saturee` },
    };
  }

  return {
    success: false,
    apipa: apipaFor(mac),
    failure: {
      reason: 'no-pool-for-subnet',
      detail: 'un serveur DHCP repond mais aucune etendue ne correspond a ce sous-reseau',
    },
  };
}
