import { z } from 'zod';
import {
  zCidrV4,
  zFqdn,
  zHostname,
  zIPv4,
  zId,
  zMac,
  zPort,
  zPrefixV4,
  zVlanId,
} from './primitives.ts';

export const NODE_KINDS = [
  'host',
  'server',
  'switch',
  'router',
  'firewall',
  'access-point',
  'printer',
  'internet',
] as const;
export const zNodeKind = z.enum(NODE_KINDS);

export const zIpv4Address = z.object({
  address: zIPv4,
  prefix: zPrefixV4,
  /** Origine de l adresse : utile pedagogiquement (statique vs bail DHCP). */
  source: z.enum(['static', 'dhcp', 'apipa']).default('static'),
});

export const zInterfaceMode = z.enum(['access', 'trunk', 'routed']);

export const zIPv6 = z
  .string()
  .regex(/^[0-9a-fA-F:]{2,45}$/, 'adresse IPv6 invalide')
  .refine((value) => value.includes(':'), 'adresse IPv6 invalide');

export const zIpv6Address = z.object({
  address: zIPv6,
  prefix: z.number().int().min(0).max(128),
  /** Origine : configuration manuelle, auto-configuration ou lien-local. */
  source: z.enum(['static', 'slaac', 'dhcpv6', 'link-local']).default('static'),
});

/** Relais DHCP : equivalent de l adresse d assistance sur une interface routee. */
export const zDhcpRelay = z.object({
  helperAddresses: z.array(zIPv4).default([]),
  enabled: z.boolean().default(true),
});

export const zNetworkInterface = z.object({
  id: zId,
  name: z.string().min(1).max(32),
  mac: zMac,
  /** Etat administratif (no shutdown / shutdown). */
  enabled: z.boolean().default(true),
  /** Adressage L3. Vide sur un port de switch pur. */
  addresses: z.array(zIpv4Address).default([]),
  mode: zInterfaceMode.default('routed'),
  accessVlan: zVlanId.optional(),
  trunkVlans: z.array(zVlanId).default([]),
  nativeVlan: zVlanId.optional(),
  speedMbps: z.number().int().positive().default(1000),
  mtu: z.number().int().min(576).max(9216).default(1500),
  /** Sous-interface logique rattachee a un VLAN (router-on-a-stick). */
  vlan: zVlanId.optional(),
  parentInterfaceId: zId.optional(),
  /** Adressage IPv6, en double pile avec IPv4. */
  addressesV6: z.array(zIpv6Address).default([]),
  /** Relais des diffusions DHCP vers un serveur situe dans un autre VLAN. */
  dhcpRelay: zDhcpRelay.optional(),
});

export const zRouteOrigin = z.enum(['connected', 'static', 'default', 'dhcp', 'dynamic']);

export const zRoute = z.object({
  destination: zCidrV4,
  /** Passerelle. Absente pour une route directement connectee. */
  via: zIPv4.optional(),
  interfaceId: zId,
  metric: z.number().int().nonnegative().default(0),
  origin: zRouteOrigin.default('static'),
});

export const zDhcpPool = z.object({
  id: zId,
  vlan: zVlanId.optional(),
  subnet: zCidrV4,
  rangeStart: zIPv4,
  rangeEnd: zIPv4,
  gateway: zIPv4.optional(),
  dnsServers: z.array(zIPv4).default([]),
  leaseSeconds: z.number().int().positive().default(86400),
  reservations: z.array(z.object({ mac: zMac, address: zIPv4 })).default([]),
});

export const zDnsRecord = z.object({
  name: zFqdn,
  type: z.enum(['A', 'CNAME', 'PTR', 'SRV', 'MX']),
  value: z.string().min(1),
  ttl: z.number().int().positive().default(3600),
});

export const zDnsZone = z.object({
  name: zFqdn,
  records: z.array(zDnsRecord).default([]),
  /** Redirecteur utilise pour les noms hors zone. */
  forwarder: zIPv4.optional(),
});

export const zFirewallAction = z.enum(['allow', 'deny']);

export const zFirewallRule = z.object({
  id: zId,
  order: z.number().int().nonnegative(),
  action: zFirewallAction,
  direction: z.enum(['in', 'out', 'forward']).default('forward'),
  protocol: z.enum(['any', 'icmp', 'tcp', 'udp']).default('any'),
  source: z.union([zCidrV4, z.literal('any')]).default('any'),
  destination: z.union([zCidrV4, z.literal('any')]).default('any'),
  destinationPort: zPort.optional(),
  /** Texte affiche au joueur lors d un blocage (pedagogie du diagnostic). */
  label: z.string().max(120).optional(),
  enabled: z.boolean().default(true),
});

export const zNatRule = z.object({
  id: zId,
  kind: z.enum(['masquerade', 'static', 'port-forward']),
  insideCidr: zCidrV4.optional(),
  outsideInterfaceId: zId,
  insideAddress: zIPv4.optional(),
  outsideAddress: zIPv4.optional(),
  insidePort: zPort.optional(),
  outsidePort: zPort.optional(),
  protocol: z.enum(['tcp', 'udp']).optional(),
  enabled: z.boolean().default(true),
});

export const SERVICE_KINDS = [
  'dhcp',
  'dns',
  'http',
  'https',
  'ssh',
  'rdp',
  'smb',
  'ldap',
  'kerberos',
  'ntp',
  'smtp',
  'snmp',
  'winrm',
  'sql',
] as const;
export const zServiceKind = z.enum(SERVICE_KINDS);

export const SERVICE_STATUS = ['running', 'stopped', 'failed', 'degraded'] as const;
export const zServiceStatus = z.enum(SERVICE_STATUS);

export const zServiceState = z.object({
  id: zId,
  kind: zServiceKind,
  name: z.string().min(1).max(64),
  status: zServiceStatus.default('running'),
  port: zPort,
  protocol: z.enum(['tcp', 'udp']).default('tcp'),
  /** Le service demarre-t-il automatiquement au boot ? */
  startupType: z.enum(['auto', 'manual', 'disabled']).default('auto'),
  /** Services dont celui-ci depend pour fonctionner (ex: ldap -> dns). */
  dependsOn: z.array(zId).default([]),
  /** Interfaces d ecoute ; vide = toutes. */
  bindInterfaceIds: z.array(zId).default([]),
  config: z.record(z.string(), z.unknown()).default({}),
});

export const zNetworkNode = z.object({
  id: zId,
  kind: zNodeKind,
  hostname: zHostname,
  label: z.string().max(80).optional(),
  /** Un noeud eteint ne repond a rien. */
  powered: z.boolean().default(true),
  interfaces: z.array(zNetworkInterface).default([]),
  routes: z.array(zRoute).default([]),
  /** VLAN declares sur un commutateur. */
  vlans: z.array(z.object({ id: zVlanId, name: z.string().max(32).default('') })).default([]),
  services: z.array(zServiceState).default([]),
  dhcpPools: z.array(zDhcpPool).default([]),
  dnsZones: z.array(zDnsZone).default([]),
  firewallRules: z.array(zFirewallRule).default([]),
  natRules: z.array(zNatRule).default([]),
  /** Resolveurs DNS configures sur le client. */
  dnsClients: z.array(zIPv4).default([]),
  /** Emplacement 3D / plan logique (rack, salle). */
  placement: z
    .object({
      site: zId.optional(),
      room: zId.optional(),
      rackId: zId.optional(),
      unit: z.number().int().optional(),
    })
    .optional(),
  systemId: zId.optional(),
  tags: z.array(z.string().max(32)).default([]),
  /**
   * Protocole d arbre recouvrant.
   * Desactive par defaut : un scenario peut ainsi montrer d abord la tempete
   * de diffusion, puis la resoudre en l activant.
   */
  spanningTree: z
    .object({
      enabled: z.boolean().default(false),
      priority: z.number().int().min(0).max(65535).default(32768),
    })
    .optional(),
  /** Routage dynamique : abstraction pedagogique a vecteur de distance. */
  dynamicRouting: z
    .object({
      enabled: z.boolean().default(false),
      protocol: z.literal('distance-vector').default('distance-vector'),
    })
    .optional(),
  /** Resolveurs DNS IPv6 configures sur le client. */
  dnsClientsV6: z.array(zIPv6).default([]),
});

export const zLinkEndpoint = z.object({ nodeId: zId, interfaceId: zId });

export const zNetworkLink = z.object({
  id: zId,
  a: zLinkEndpoint,
  b: zLinkEndpoint,
  media: z.enum(['copper', 'fiber', 'wireless', 'virtual']).default('copper'),
  /** Etat physique du lien : un cable debranche ou coupe passe a false. */
  connected: z.boolean().default(true),
  latencyMs: z.number().nonnegative().default(0.2),
  /** Taux de perte 0..1, utilise pour les scenarios de degradation. */
  lossRate: z.number().min(0).max(1).default(0),
  bandwidthMbps: z.number().int().positive().default(1000),
});

export const zNetworkTopology = z.object({
  schemaVersion: z.literal(1).default(1),
  id: zId,
  name: z.string().min(1).max(80),
  nodes: z.array(zNetworkNode).default([]),
  links: z.array(zNetworkLink).default([]),
  /** Bail DHCP actifs, reconstruits par le moteur mais persistes pour le determinisme. */
  dhcpLeases: z
    .array(
      z.object({
        serverNodeId: zId,
        poolId: zId,
        mac: zMac,
        address: zIPv4,
        clientNodeId: zId,
        expiresAt: z.number().int().nonnegative(),
      }),
    )
    .default([]),
});

export type NodeKind = z.infer<typeof zNodeKind>;
export type Ipv4Address = z.infer<typeof zIpv4Address>;
export type Ipv6Address = z.infer<typeof zIpv6Address>;
export type DhcpRelay = z.infer<typeof zDhcpRelay>;
export type NetworkInterface = z.infer<typeof zNetworkInterface>;
export type Route = z.infer<typeof zRoute>;
export type DhcpPool = z.infer<typeof zDhcpPool>;
export type DnsRecord = z.infer<typeof zDnsRecord>;
export type DnsZone = z.infer<typeof zDnsZone>;
export type FirewallRule = z.infer<typeof zFirewallRule>;
export type NatRule = z.infer<typeof zNatRule>;
export type ServiceKind = z.infer<typeof zServiceKind>;
export type ServiceStatus = z.infer<typeof zServiceStatus>;
export type ServiceState = z.infer<typeof zServiceState>;
export type NetworkNode = z.infer<typeof zNetworkNode>;
export type NetworkLink = z.infer<typeof zNetworkLink>;
export type NetworkTopology = z.infer<typeof zNetworkTopology>;
export type LinkEndpoint = z.infer<typeof zLinkEndpoint>;
