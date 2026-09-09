import type {
  DhcpPool,
  DnsZone,
  FirewallRule,
  NetworkInterface,
  NetworkNode,
  NetworkTopology,
  NodeKind,
  ServiceState,
  VlanId,
} from '@tssr/contracts';
import { parseCidr, intToIp } from './ip.ts';
import { DEFAULT_PORTS } from './services.ts';

let macCounter = 0;

/** MAC deterministe : la meme topologie produit toujours les memes adresses. */
export function deterministicMac(seedText: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedText.length; i += 1) {
    h ^= seedText.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const bytes = [0x02, 0x4e, 0x45, (h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff];
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join(':');
}

export interface IfaceSpec {
  name: string;
  /** Adresse en notation CIDR, ex "192.168.10.1/24". */
  ip?: string;
  mode?: 'access' | 'trunk' | 'routed';
  accessVlan?: VlanId;
  trunkVlans?: VlanId[];
  nativeVlan?: VlanId;
  vlan?: VlanId;
  parent?: string;
  enabled?: boolean;
  speedMbps?: number;
  /** Adresse IPv6 en notation prefixe, par exemple "2001:db8:10::1/64". */
  ipv6?: string;
  /** Adresses d assistance DHCP, pour relayer vers un autre VLAN. */
  dhcpRelay?: string[];
}

export interface ServiceSpec {
  id: string;
  kind: ServiceState['kind'];
  name?: string;
  port?: number;
  protocol?: 'tcp' | 'udp';
  status?: ServiceState['status'];
  dependsOn?: string[];
  startupType?: ServiceState['startupType'];
}

export interface NodeSpec {
  kind?: NodeKind;
  hostname?: string;
  interfaces?: IfaceSpec[];
  /** Raccourci pour un poste : une seule interface nommee eth0. */
  ip?: string;
  gateway?: string;
  dns?: string[];
  vlans?: { id: VlanId; name?: string }[];
  services?: ServiceSpec[];
  dhcpPools?: DhcpPool[];
  dnsZones?: DnsZone[];
  firewallRules?: FirewallRule[];
  powered?: boolean;
  /** Nombre de ports a generer sur un commutateur (Gi0/1..Gi0/n). */
  ports?: number;
  tags?: string[];
  dnsV6?: string[];
  /** Active l arbre recouvrant sur ce commutateur. */
  spanningTree?: boolean;
  stpPriority?: number;
  /** Active le routage dynamique sur ce routeur. */
  dynamicRouting?: boolean;
}

function buildInterface(nodeId: string, spec: IfaceSpec): NetworkInterface {
  const addresses =
    spec.ip === undefined
      ? []
      : [
          {
            address: spec.ip.split('/')[0] as string,
            prefix: parseCidr(spec.ip).prefix,
            source: 'static' as const,
          },
        ];
  macCounter += 1;
  return {
    id: `${nodeId}-${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: spec.name,
    mac: deterministicMac(`${nodeId}/${spec.name}/${macCounter}`),
    enabled: spec.enabled ?? true,
    addresses,
    mode: spec.mode ?? (spec.accessVlan !== undefined ? 'access' : 'routed'),
    ...(spec.accessVlan === undefined ? {} : { accessVlan: spec.accessVlan }),
    trunkVlans: spec.trunkVlans ?? [],
    ...(spec.nativeVlan === undefined ? {} : { nativeVlan: spec.nativeVlan }),
    speedMbps: spec.speedMbps ?? 1000,
    mtu: 1500,
    ...(spec.vlan === undefined ? {} : { vlan: spec.vlan }),
    ...(spec.parent === undefined
      ? {}
      : {
          parentInterfaceId: `${nodeId}-${spec.parent.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        }),
    addressesV6:
      spec.ipv6 === undefined
        ? []
        : [
            {
              address: spec.ipv6.split('/')[0] as string,
              prefix: Number(spec.ipv6.split('/')[1] ?? '64'),
              source: 'static' as const,
            },
          ],
    ...(spec.dhcpRelay === undefined
      ? {}
      : { dhcpRelay: { helperAddresses: spec.dhcpRelay, enabled: true } }),
  };
}

function buildService(spec: ServiceSpec): ServiceState {
  return {
    id: spec.id,
    kind: spec.kind,
    name: spec.name ?? spec.kind,
    status: spec.status ?? 'running',
    port: spec.port ?? DEFAULT_PORTS[spec.kind],
    protocol:
      spec.protocol ??
      (spec.kind === 'dns' || spec.kind === 'dhcp' || spec.kind === 'ntp' || spec.kind === 'snmp'
        ? 'udp'
        : 'tcp'),
    startupType: spec.startupType ?? 'auto',
    dependsOn: spec.dependsOn ?? [],
    bindInterfaceIds: [],
    config: {},
  };
}

/** Construction lisible d une topologie ; utilisee par les scenarios et par les tests. */
export class TopologyBuilder {
  private readonly topology: NetworkTopology;
  private linkCounter = 0;

  constructor(id: string, name: string) {
    this.topology = { schemaVersion: 1, id, name, nodes: [], links: [], dhcpLeases: [] };
  }

  node(id: string, spec: NodeSpec = {}): this {
    const kind = spec.kind ?? 'host';
    const specs: IfaceSpec[] = spec.interfaces ? [...spec.interfaces] : [];
    if (specs.length === 0) {
      if (kind === 'switch' || kind === 'access-point') {
        const ports = spec.ports ?? 8;
        for (let i = 1; i <= ports; i += 1)
          specs.push({ name: `Gi0/${i}`, mode: 'access', accessVlan: 1 });
      } else {
        specs.push({ name: 'eth0', ...(spec.ip === undefined ? {} : { ip: spec.ip }) });
      }
    }

    const node: NetworkNode = {
      id,
      kind,
      hostname: spec.hostname ?? id,
      powered: spec.powered ?? true,
      interfaces: specs.map((s) => buildInterface(id, s)),
      routes: [],
      vlans: (spec.vlans ?? []).map((v) => ({ id: v.id, name: v.name ?? `VLAN${v.id}` })),
      services: (spec.services ?? []).map(buildService),
      dhcpPools: spec.dhcpPools ?? [],
      dnsZones: spec.dnsZones ?? [],
      firewallRules: spec.firewallRules ?? [],
      natRules: [],
      dnsClients: spec.dns ?? [],
      dnsClientsV6: spec.dnsV6 ?? [],
      tags: spec.tags ?? [],
      ...(spec.spanningTree === undefined
        ? {}
        : { spanningTree: { enabled: spec.spanningTree, priority: spec.stpPriority ?? 32768 } }),
      ...(spec.dynamicRouting === undefined
        ? {}
        : {
            dynamicRouting: { enabled: spec.dynamicRouting, protocol: 'distance-vector' as const },
          }),
    };

    if (spec.gateway !== undefined) {
      const iface = node.interfaces.find((i) => i.addresses.length > 0);
      if (iface) {
        node.routes.push({
          destination: '0.0.0.0/0',
          via: spec.gateway,
          interfaceId: iface.id,
          metric: 10,
          origin: 'default',
        });
      }
    }

    this.topology.nodes.push(node);
    return this;
  }

  host(id: string, spec: Omit<NodeSpec, 'kind'> = {}): this {
    return this.node(id, { ...spec, kind: 'host' });
  }

  server(id: string, spec: Omit<NodeSpec, 'kind'> = {}): this {
    return this.node(id, { ...spec, kind: 'server' });
  }

  switchNode(id: string, spec: Omit<NodeSpec, 'kind'> = {}): this {
    return this.node(id, { ...spec, kind: 'switch' });
  }

  router(id: string, spec: Omit<NodeSpec, 'kind'> = {}): this {
    return this.node(id, { ...spec, kind: 'router' });
  }

  firewall(id: string, spec: Omit<NodeSpec, 'kind'> = {}): this {
    return this.node(id, { ...spec, kind: 'firewall' });
  }

  /** Ajoute une route statique apres coup. */
  route(nodeId: string, destination: string, via: string, ifaceName: string): this {
    const node = this.topology.nodes.find((n) => n.id === nodeId);
    const iface = node?.interfaces.find((i) => i.name === ifaceName);
    if (node && iface) {
      node.routes.push({ destination, via, interfaceId: iface.id, metric: 1, origin: 'static' });
    }
    return this;
  }

  link(
    nodeA: string,
    ifaceA: string,
    nodeB: string,
    ifaceB: string,
    options: {
      connected?: boolean;
      latencyMs?: number;
      lossRate?: number;
      media?: 'copper' | 'fiber' | 'wireless' | 'virtual';
    } = {},
  ): this {
    const a = this.resolve(nodeA, ifaceA);
    const b = this.resolve(nodeB, ifaceB);
    if (!a || !b) throw new Error(`Lien impossible : ${nodeA}/${ifaceA} <-> ${nodeB}/${ifaceB}`);
    this.linkCounter += 1;
    this.topology.links.push({
      id: `link-${this.linkCounter}`,
      a: { nodeId: nodeA, interfaceId: a },
      b: { nodeId: nodeB, interfaceId: b },
      media: options.media ?? 'copper',
      connected: options.connected ?? true,
      latencyMs: options.latencyMs ?? 0.2,
      lossRate: options.lossRate ?? 0,
      bandwidthMbps: 1000,
    });
    return this;
  }

  private resolve(nodeId: string, ifaceName: string): string | undefined {
    const node = this.topology.nodes.find((n) => n.id === nodeId);
    return node?.interfaces.find((i) => i.name.toLowerCase() === ifaceName.toLowerCase())?.id;
  }

  build(): NetworkTopology {
    return this.topology;
  }
}

/** Aide a la construction d une etendue DHCP coherente avec son sous-reseau. */
export function makePool(
  id: string,
  subnet: string,
  options: { from?: number; to?: number; gateway?: string; dns?: string[] } = {},
): DhcpPool {
  const { networkInt, prefix } = parseCidr(subnet);
  const size = 2 ** (32 - prefix);
  const from = options.from ?? 100;
  const to = options.to ?? Math.max(from, size - 2);
  return {
    id,
    subnet,
    rangeStart: intToIp(networkInt + from),
    rangeEnd: intToIp(networkInt + to),
    ...(options.gateway === undefined ? {} : { gateway: options.gateway }),
    dnsServers: options.dns ?? [],
    leaseSeconds: 86400,
    reservations: [],
  };
}
