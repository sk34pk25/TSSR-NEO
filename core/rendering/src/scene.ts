import type { NodeKind, WorldState } from '@tssr/contracts';

export interface SceneNode {
  id: string;
  kind: NodeKind;
  label: string;
  sublabel: string;
  x: number;
  y: number;
  powered: boolean;
  /** VLAN principal du noeud, utilise pour la coloration pedagogique. */
  vlan: number | undefined;
  alert: 'none' | 'warning' | 'critical';
}

export interface SceneLink {
  id: string;
  from: string;
  to: string;
  state: 'up' | 'down' | 'degraded';
  label: string;
  vlans: number[];
}

export interface SceneFlow {
  /** Suite de noeuds traverses, dans l ordre. */
  path: string[];
  status: 'delivered' | 'blocked';
  blockedAt: string | undefined;
  label: string;
}

export interface SceneGraph {
  nodes: SceneNode[];
  links: SceneLink[];
  flows: SceneFlow[];
}

const TIER: Record<NodeKind, number> = {
  internet: 0,
  firewall: 1,
  router: 2,
  switch: 3,
  'access-point': 3,
  server: 4,
  host: 4,
  printer: 4,
};

/**
 * Disposition deterministe en couches : Internet en haut, postes en bas.
 * Le meme reseau produit toujours le meme plan, ce qui aide a le memoriser.
 */
export function layoutScene(nodes: SceneNode[]): SceneNode[] {
  const tiers = new Map<number, SceneNode[]>();
  for (const node of nodes) {
    const tier = TIER[node.kind] ?? 4;
    const list = tiers.get(tier) ?? [];
    list.push(node);
    tiers.set(tier, list);
  }
  const orderedTiers = [...tiers.keys()].sort((a, b) => a - b);
  const rows = orderedTiers.length;
  for (const [rowIndex, tier] of orderedTiers.entries()) {
    const list = (tiers.get(tier) ?? []).sort((a, b) => a.id.localeCompare(b.id));
    const count = list.length;
    for (const [columnIndex, node] of list.entries()) {
      node.x = count === 1 ? 0.5 : 0.12 + (columnIndex / (count - 1)) * 0.76;
      node.y = rows === 1 ? 0.5 : 0.12 + (rowIndex / (rows - 1)) * 0.76;
    }
  }
  return nodes;
}

/** Construit la scene a partir de l etat reel : aucune donnee decorative. */
export function buildScene(world: WorldState): SceneGraph {
  const alerts = new Map<string, 'warning' | 'critical'>();
  for (const alert of world.monitoringAlerts) {
    if (alert.clearedAt !== undefined) continue;
    const check = world.monitoringChecks.find((c) => c.id === alert.checkId);
    if (!check) continue;
    const current = alerts.get(check.targetNodeId);
    if (current !== 'critical') alerts.set(check.targetNodeId, alert.severity === 'critical' ? 'critical' : 'warning');
  }

  const nodes: SceneNode[] = world.network.nodes.map((node) => {
    const addresses = node.interfaces.flatMap((i) => i.addresses);
    const accessVlans = node.interfaces
      .map((i) => i.accessVlan ?? i.vlan)
      .filter((v): v is number => v !== undefined);
    return {
      id: node.id,
      kind: node.kind,
      label: node.hostname,
      sublabel: addresses[0] ? `${addresses[0].address}/${addresses[0].prefix}` : 'sans adresse',
      x: 0.5,
      y: 0.5,
      powered: node.powered,
      vlan: accessVlans[0],
      alert: alerts.get(node.id) ?? 'none',
    };
  });

  const nodeIndex = new Map(world.network.nodes.map((n) => [n.id, n]));
  const links: SceneLink[] = world.network.links.map((link) => {
    const a = nodeIndex.get(link.a.nodeId);
    const b = nodeIndex.get(link.b.nodeId);
    const ifaceA = a?.interfaces.find((i) => i.id === link.a.interfaceId);
    const ifaceB = b?.interfaces.find((i) => i.id === link.b.interfaceId);
    const bothEnabled = (ifaceA?.enabled ?? false) && (ifaceB?.enabled ?? false);
    const state: SceneLink['state'] = !link.connected || !bothEnabled ? 'down' : link.lossRate > 0.05 ? 'degraded' : 'up';
    const vlans = [
      ...new Set([
        ...(ifaceA?.trunkVlans ?? []),
        ...(ifaceB?.trunkVlans ?? []),
        ...(ifaceA?.accessVlan === undefined ? [] : [ifaceA.accessVlan]),
        ...(ifaceB?.accessVlan === undefined ? [] : [ifaceB.accessVlan]),
      ]),
    ].sort((x, y) => x - y);
    return {
      id: link.id,
      from: link.a.nodeId,
      to: link.b.nodeId,
      state,
      label: `${ifaceA?.name ?? '?'} - ${ifaceB?.name ?? '?'}`,
      vlans,
    };
  });

  return { nodes: layoutScene(nodes), links, flows: [] };
}

/** Palette VLAN stable : le meme VLAN garde toujours la meme teinte. */
export function vlanHue(vlan: number | undefined): number {
  if (vlan === undefined) return 200;
  return (vlan * 47) % 360;
}
