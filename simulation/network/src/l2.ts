import type { NetworkInterface, NetworkNode } from '@tssr/contracts';
import type { TopologyIndex } from './topology-index.ts';

export interface L2Endpoint {
  nodeId: string;
  interfaceId: string;
  /** VLAN dans lequel la trame a ete remise, null si non taguee de bout en bout. */
  vlan: number | null;
}

export interface L2Block {
  nodeId: string;
  interfaceId: string;
  reason: L2BlockReason;
}

export type L2BlockReason =
  | 'port-disabled'
  | 'spanning-tree-blocked'
  | 'node-powered-off'
  | 'link-disconnected'
  | 'no-link'
  | 'tagged-frame-on-access-port'
  | 'vlan-not-allowed-on-trunk'
  | 'vlan-not-declared-on-switch'
  | 'vlan-mismatch'
  | 'no-matching-subinterface';

export interface L2FloodResult {
  /** Interfaces qui recoivent effectivement la trame. */
  endpoints: L2Endpoint[];
  /** Points de blocage : c est la matiere du diagnostic pedagogique. */
  blocked: L2Block[];
  /** Commutateurs traverses, dans l ordre de visite. */
  path: { nodeId: string; interfaceId: string }[];
  loopDetected: boolean;
}

interface Hop {
  nodeId: string;
  interfaceId: string;
  tag: number | null;
}

/** Determine par quel port physique et avec quel tag une trame quitte une interface. */
export function egressOf(
  index: TopologyIndex,
  nodeId: string,
  interfaceId: string,
): { interfaceId: string; tag: number | null } | undefined {
  const ref = index.interfaceRef(interfaceId);
  if (!ref || ref.node.id !== nodeId) return undefined;
  const { iface } = ref;
  if (iface.parentInterfaceId !== undefined && iface.vlan !== undefined) {
    return { interfaceId: iface.parentInterfaceId, tag: iface.vlan };
  }
  if (iface.mode === 'access') {
    return { interfaceId: iface.id, tag: null };
  }
  return { interfaceId: iface.id, tag: iface.vlan ?? null };
}

function trunkAllows(iface: NetworkInterface, vlan: number): boolean {
  return iface.trunkVlans.includes(vlan) || iface.nativeVlan === vlan;
}

function switchPortVlan(
  iface: NetworkInterface,
  tag: number | null,
): { vlan: number } | { block: L2BlockReason } {
  if (iface.mode === 'access') {
    if (tag !== null) return { block: 'tagged-frame-on-access-port' };
    return { vlan: iface.accessVlan ?? 1 };
  }
  if (iface.mode === 'trunk') {
    const vlan = tag ?? iface.nativeVlan ?? 1;
    if (!trunkAllows(iface, vlan)) return { block: 'vlan-not-allowed-on-trunk' };
    return { vlan };
  }
  // Port route sur un commutateur (SVI ou port L3) : il termine la trame.
  return { vlan: iface.vlan ?? tag ?? 1 };
}

/**
 * Propage une trame de diffusion depuis une interface et renvoie tout ce qu elle atteint.
 * C est la base de l ARP, du DHCP et de toute la connectivite de couche 2.
 */
export function floodDomain(
  index: TopologyIndex,
  from: { nodeId: string; interfaceId: string },
  /** Ports neutralises par l arbre recouvrant, s il est actif. */
  blockedInterfaceIds: ReadonlySet<string> = EMPTY_BLOCKED,
): L2FloodResult {
  const result: L2FloodResult = { endpoints: [], blocked: [], path: [], loopDetected: false };
  const source = index.interfaceRef(from.interfaceId);
  if (!source || source.node.id !== from.nodeId) return result;
  if (!source.node.powered) {
    result.blocked.push({ ...from, reason: 'node-powered-off' });
    return result;
  }
  if (!source.iface.enabled) {
    result.blocked.push({ ...from, reason: 'port-disabled' });
    return result;
  }

  const egress = egressOf(index, from.nodeId, from.interfaceId);
  if (!egress) return result;

  const visited = new Set<string>();
  const queue: Hop[] = [{ nodeId: from.nodeId, interfaceId: egress.interfaceId, tag: egress.tag }];
  const blocked = blockedInterfaceIds;

  while (queue.length > 0) {
    const hop = queue.shift() as Hop;
    const peer = index.peer(hop.interfaceId);
    if (!peer) {
      result.blocked.push({ nodeId: hop.nodeId, interfaceId: hop.interfaceId, reason: 'no-link' });
      continue;
    }
    if (!peer.link.connected) {
      result.blocked.push({
        nodeId: hop.nodeId,
        interfaceId: hop.interfaceId,
        reason: 'link-disconnected',
      });
      continue;
    }
    const target = peer.ref;
    // Un port en blocage recoit le signal mais ne transmet aucune trame.
    if (blocked.has(hop.interfaceId) || blocked.has(target.iface.id)) {
      result.blocked.push({
        nodeId: target.node.id,
        interfaceId: target.iface.id,
        reason: 'spanning-tree-blocked',
      });
      continue;
    }
    const targetKey = `${target.iface.id}|${hop.tag ?? 'u'}`;
    if (visited.has(targetKey)) {
      result.loopDetected = true;
      continue;
    }
    visited.add(targetKey);

    if (!target.node.powered) {
      result.blocked.push({
        nodeId: target.node.id,
        interfaceId: target.iface.id,
        reason: 'node-powered-off',
      });
      continue;
    }
    if (!target.iface.enabled) {
      result.blocked.push({
        nodeId: target.node.id,
        interfaceId: target.iface.id,
        reason: 'port-disabled',
      });
      continue;
    }

    result.path.push({ nodeId: target.node.id, interfaceId: target.iface.id });

    if (index.isSwitching(target.node)) {
      forwardThroughSwitch(target.node, target.iface, hop.tag, result, queue, blocked);
    } else {
      deliverToEndpoint(index, target.node, target.iface, hop.tag, result);
    }
  }

  return result;
}

const EMPTY_BLOCKED: ReadonlySet<string> = new Set<string>();

function forwardThroughSwitch(
  node: NetworkNode,
  ingress: NetworkInterface,
  tag: number | null,
  result: L2FloodResult,
  queue: Hop[],
  blocked: ReadonlySet<string>,
): void {
  const resolved = switchPortVlan(ingress, tag);
  if ('block' in resolved) {
    result.blocked.push({ nodeId: node.id, interfaceId: ingress.id, reason: resolved.block });
    return;
  }
  const vlan = resolved.vlan;

  if (node.vlans.length > 0 && !node.vlans.some((v) => v.id === vlan)) {
    result.blocked.push({
      nodeId: node.id,
      interfaceId: ingress.id,
      reason: 'vlan-not-declared-on-switch',
    });
    return;
  }

  if (ingress.mode === 'routed') {
    result.endpoints.push({ nodeId: node.id, interfaceId: ingress.id, vlan: tag });
    return;
  }

  for (const iface of node.interfaces) {
    if (iface.id === ingress.id || !iface.enabled) continue;
    if (blocked.has(iface.id)) continue;
    if (iface.mode === 'routed') {
      // Interface virtuelle de VLAN (SVI) : elle recoit le trafic de son VLAN.
      if (iface.vlan === vlan) {
        result.endpoints.push({ nodeId: node.id, interfaceId: iface.id, vlan: tag });
      }
      continue;
    }
    if (iface.mode === 'access') {
      if ((iface.accessVlan ?? 1) === vlan) {
        queue.push({ nodeId: node.id, interfaceId: iface.id, tag: null });
      }
      continue;
    }
    if (trunkAllows(iface, vlan)) {
      queue.push({
        nodeId: node.id,
        interfaceId: iface.id,
        tag: iface.nativeVlan === vlan ? null : vlan,
      });
    } else {
      // Un trunk qui ne transporte pas le VLAN est une cause de panne frequente :
      // on la remonte explicitement au lieu de la faire disparaitre silencieusement.
      result.blocked.push({
        nodeId: node.id,
        interfaceId: iface.id,
        reason: 'vlan-not-allowed-on-trunk',
      });
    }
  }
}

function deliverToEndpoint(
  index: TopologyIndex,
  node: NetworkNode,
  ingress: NetworkInterface,
  tag: number | null,
  result: L2FloodResult,
): void {
  if (ingress.mode === 'trunk') {
    const wanted = tag ?? ingress.nativeVlan ?? null;
    const sub = index
      .subInterfaces(ingress.id)
      .find((s) => (wanted === null ? s.vlan === undefined : s.vlan === wanted));
    if (sub) {
      result.endpoints.push({ nodeId: node.id, interfaceId: sub.id, vlan: tag });
      return;
    }
    if (tag === null && ingress.addresses.length > 0) {
      result.endpoints.push({ nodeId: node.id, interfaceId: ingress.id, vlan: null });
      return;
    }
    result.blocked.push({
      nodeId: node.id,
      interfaceId: ingress.id,
      reason: 'no-matching-subinterface',
    });
    return;
  }

  const expected = ingress.mode === 'access' ? null : (ingress.vlan ?? null);
  if (tag !== expected) {
    result.blocked.push({ nodeId: node.id, interfaceId: ingress.id, reason: 'vlan-mismatch' });
    return;
  }
  result.endpoints.push({ nodeId: node.id, interfaceId: ingress.id, vlan: tag });
}

export interface ArpResult {
  resolved: boolean;
  endpoint?: L2Endpoint;
  flood: L2FloodResult;
}

/** Resolution ARP : qui, dans le domaine de diffusion, porte cette adresse IP ? */
export function arpResolve(
  index: TopologyIndex,
  from: { nodeId: string; interfaceId: string },
  targetIp: string,
  blockedInterfaceIds?: ReadonlySet<string>,
): ArpResult {
  const flood = floodDomain(index, from, blockedInterfaceIds);
  for (const endpoint of flood.endpoints) {
    const ref = index.interfaceRef(endpoint.interfaceId);
    if (!ref) continue;
    if (ref.iface.addresses.some((a) => a.address === targetIp)) {
      return { resolved: true, endpoint, flood };
    }
  }
  return { resolved: false, flood };
}
