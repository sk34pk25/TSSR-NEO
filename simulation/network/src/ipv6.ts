import type { NetworkTopology } from '@tssr/contracts';
import { TopologyIndex } from './topology-index.ts';
import { floodDomain } from './l2.ts';

/**
 * Fondation IPv6.
 *
 * Portee assumee : adressage, compression, prefixes, adresse de lien-local
 * derivee de l adresse physique, decouverte de voisins et joignabilite en
 * double pile. Les mecanismes qui n apportent rien de plus au technicien
 * debutant (fragmentation, extensions d en-tete) ne sont pas simules, et
 * l absence est documentee plutot que masquee.
 */

/** Developpe une adresse en huit groupes de quatre chiffres hexadecimaux. */
export function expandIpv6(address: string): string {
  const trimmed = address.trim().toLowerCase();
  if (!trimmed.includes(':')) throw new Error(`Adresse IPv6 invalide : ${address}`);

  const [head = '', tail] = trimmed.split('::');
  const headGroups = head === '' ? [] : head.split(':').filter((g) => g !== '');
  const tailGroups =
    tail === undefined || tail === '' ? [] : tail.split(':').filter((g) => g !== '');

  if (tail === undefined) {
    if (headGroups.length !== 8) throw new Error(`Adresse IPv6 invalide : ${address}`);
    return headGroups.map((group) => group.padStart(4, '0')).join(':');
  }

  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0) throw new Error(`Adresse IPv6 invalide : ${address}`);
  const groups = [...headGroups, ...Array.from({ length: missing }, () => '0'), ...tailGroups];
  return groups.map((group) => group.padStart(4, '0')).join(':');
}

/** Compression canonique : la plus longue suite de zeros est remplacee par "::". */
export function compressIpv6(address: string): string {
  const groups = expandIpv6(address)
    .split(':')
    .map((group) => group.replace(/^0+(?=.)/, ''));

  let bestStart = -1;
  let bestLength = 0;
  let currentStart = -1;
  let currentLength = 0;
  groups.forEach((group, index) => {
    if (group === '0') {
      if (currentStart === -1) currentStart = index;
      currentLength += 1;
      if (currentLength > bestLength) {
        bestLength = currentLength;
        bestStart = currentStart;
      }
    } else {
      currentStart = -1;
      currentLength = 0;
    }
  });

  // Une seule occurrence de zero ne justifie pas la compression.
  if (bestLength < 2) return groups.join(':');
  const head = groups.slice(0, bestStart).join(':');
  const tail = groups.slice(bestStart + bestLength).join(':');
  return `${head}::${tail}`;
}

function toBigInt(address: string): bigint {
  return expandIpv6(address)
    .split(':')
    .reduce((value, group) => (value << 16n) + BigInt(parseInt(group, 16)), 0n);
}

function fromBigInt(value: bigint): string {
  const groups: string[] = [];
  let remaining = value;
  for (let i = 0; i < 8; i += 1) {
    groups.unshift((remaining & 0xffffn).toString(16).padStart(4, '0'));
    remaining >>= 16n;
  }
  return groups.join(':');
}

export function ipv6Network(address: string, prefix: number): string {
  if (prefix < 0 || prefix > 128) throw new Error(`Prefixe IPv6 invalide : /${prefix}`);
  const mask = ((1n << BigInt(prefix)) - 1n) << BigInt(128 - prefix);
  return compressIpv6(fromBigInt(toBigInt(address) & mask));
}

export function sameIpv6Prefix(a: string, b: string, prefix: number): boolean {
  return ipv6Network(a, prefix) === ipv6Network(b, prefix);
}

export function isLinkLocal(address: string): boolean {
  return expandIpv6(address).startsWith('fe80');
}

export function isMulticastV6(address: string): boolean {
  return expandIpv6(address).startsWith('ff');
}

/**
 * Adresse de lien-local derivee de l adresse physique.
 * On applique la construction usuelle : le bit universel est inverse et
 * la valeur fffe est inseree au milieu de l identifiant.
 */
export function linkLocalFromMac(mac: string): string {
  const bytes = mac.split(':').map((part) => parseInt(part, 16));
  if (bytes.length !== 6 || bytes.some((b) => Number.isNaN(b))) {
    throw new Error(`Adresse physique invalide : ${mac}`);
  }
  const first = ((bytes[0] as number) ^ 0b0000_0010) & 0xff;
  const groups = [
    'fe80',
    '0000',
    '0000',
    '0000',
    ((first << 8) | (bytes[1] as number)).toString(16).padStart(4, '0'),
    (((bytes[2] as number) << 8) | 0xff).toString(16).padStart(4, '0'),
    ((0xfe << 8) | (bytes[3] as number)).toString(16).padStart(4, '0'),
    (((bytes[4] as number) << 8) | (bytes[5] as number)).toString(16).padStart(4, '0'),
  ];
  return compressIpv6(groups.join(':'));
}

/** Adresse globale auto-configurée a partir d un prefixe annonce. */
export function slaacAddress(prefix: string, prefixLength: number, mac: string): string {
  const identifier = toBigInt(linkLocalFromMac(mac)) & ((1n << 64n) - 1n);
  const network = toBigInt(ipv6Network(prefix, prefixLength));
  return compressIpv6(fromBigInt(network | identifier));
}

export interface NdpResult {
  resolved: boolean;
  /** Interface du voisin ayant repondu a la sollicitation. */
  endpoint?: { nodeId: string; interfaceId: string; mac: string };
  reason?: string;
}

/**
 * Decouverte de voisins.
 * Equivalent IPv6 de la resolution d adresse physique : la sollicitation est
 * une diffusion restreinte, elle reste donc confinee au domaine de couche 2.
 */
export function discoverNeighbour(
  topology: NetworkTopology,
  from: { nodeId: string; interfaceId: string },
  targetAddress: string,
  blockedInterfaceIds?: ReadonlySet<string>,
): NdpResult {
  const index = new TopologyIndex(topology);
  const flood = floodDomain(index, from, blockedInterfaceIds);
  const target = expandIpv6(targetAddress);

  for (const endpoint of flood.endpoints) {
    const ref = index.interfaceRef(endpoint.interfaceId);
    if (!ref) continue;
    const owns = ref.iface.addressesV6.some((entry) => expandIpv6(entry.address) === target);
    const ownsLinkLocal =
      isLinkLocal(target) && linkLocalFromMac(ref.iface.mac) === compressIpv6(target);
    if (owns || ownsLinkLocal) {
      return {
        resolved: true,
        endpoint: { nodeId: ref.node.id, interfaceId: ref.iface.id, mac: ref.iface.mac },
      };
    }
  }

  const blockers = [...new Set(flood.blocked.map((entry) => entry.reason))];
  return {
    resolved: false,
    reason:
      blockers.length > 0
        ? `aucun voisin ne repond pour ${compressIpv6(target)} : ${blockers.join(', ')}`
        : `aucun voisin ne repond pour ${compressIpv6(target)}`,
  };
}

export interface Ipv6ReachResult {
  delivered: boolean;
  hops: { nodeId: string; hostname: string }[];
  reason?: string;
}

/**
 * Joignabilite IPv6.
 * Seul le cas du lien local et du routage par prefixe direct est simule :
 * c est ce qui permet d enseigner la double pile sans promettre un routage
 * IPv6 complet qui n existe pas encore.
 */
export function reachIpv6(
  topology: NetworkTopology,
  fromNodeId: string,
  targetAddress: string,
  blockedInterfaceIds?: ReadonlySet<string>,
): Ipv6ReachResult {
  const index = new TopologyIndex(topology);
  const source = index.node(fromNodeId);
  if (!source) return { delivered: false, hops: [], reason: 'noeud source inconnu' };
  if (!source.powered) {
    return { delivered: false, hops: [], reason: `${source.hostname} est hors tension` };
  }

  for (const iface of source.interfaces) {
    if (!iface.enabled || iface.addressesV6.length === 0) continue;
    // Une interface porte plusieurs adresses : lien-local et globale au moins.
    // Il faut donc toutes les examiner, pas seulement la premiere.
    const onLink =
      isLinkLocal(targetAddress) ||
      iface.addressesV6.some((entry) => sameIpv6Prefix(entry.address, targetAddress, entry.prefix));
    if (!onLink) continue;

    const ndp = discoverNeighbour(
      topology,
      { nodeId: source.id, interfaceId: iface.id },
      targetAddress,
      blockedInterfaceIds,
    );
    if (ndp.resolved && ndp.endpoint) {
      const peer = index.node(ndp.endpoint.nodeId);
      return {
        delivered: true,
        hops: [
          { nodeId: source.id, hostname: source.hostname },
          { nodeId: ndp.endpoint.nodeId, hostname: peer?.hostname ?? ndp.endpoint.nodeId },
        ],
      };
    }
    return {
      delivered: false,
      hops: [{ nodeId: source.id, hostname: source.hostname }],
      ...(ndp.reason === undefined ? {} : { reason: ndp.reason }),
    };
  }

  return {
    delivered: false,
    hops: [{ nodeId: source.id, hostname: source.hostname }],
    reason:
      'aucune interface de ce noeud ne partage un prefixe avec la destination : le routage IPv6 entre prefixes n est pas simule',
  };
}

/** Applique l auto-configuration a partir des prefixes annonces par les routeurs. */
export function applySlaac(
  topology: NetworkTopology,
  blockedInterfaceIds?: ReadonlySet<string>,
): number {
  const index = new TopologyIndex(topology);
  let configured = 0;

  for (const node of topology.nodes) {
    if (node.kind === 'router' || node.kind === 'internet' || !node.powered) continue;
    for (const iface of node.interfaces) {
      if (!iface.enabled) continue;
      // Un port de commutation ne porte pas d adresse : seules les interfaces
      // routees, y compris les interfaces virtuelles de VLAN, en obtiennent une.
      if (iface.mode !== 'routed') continue;
      if (iface.addressesV6.some((entry) => entry.source !== 'link-local')) continue;

      // Un routeur du meme domaine annonce son prefixe : le poste s en sert.
      const flood = floodDomain(
        index,
        { nodeId: node.id, interfaceId: iface.id },
        blockedInterfaceIds,
      );
      for (const endpoint of flood.endpoints) {
        const ref = index.interfaceRef(endpoint.interfaceId);
        if (!ref || !index.isForwarder(ref.node)) continue;
        const announced = ref.iface.addressesV6.find((entry) => entry.source !== 'link-local');
        if (!announced) continue;
        iface.addressesV6 = [
          ...iface.addressesV6,
          {
            address: slaacAddress(announced.address, announced.prefix, iface.mac),
            prefix: announced.prefix,
            source: 'slaac',
          },
        ];
        configured += 1;
        break;
      }
    }
  }
  return configured;
}

/** Ajoute l adresse de lien-local a toute interface qui n en a pas. */
export function ensureLinkLocal(topology: NetworkTopology): number {
  let added = 0;
  for (const node of topology.nodes) {
    for (const iface of node.interfaces) {
      if (iface.mode !== 'routed') continue;
      if (iface.addressesV6.some((entry) => isLinkLocal(entry.address))) continue;
      iface.addressesV6 = [
        { address: linkLocalFromMac(iface.mac), prefix: 64, source: 'link-local' },
        ...iface.addressesV6,
      ];
      added += 1;
    }
  }
  return added;
}
