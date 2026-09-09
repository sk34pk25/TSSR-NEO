import type { NetworkInterface, NetworkLink, NetworkNode, NetworkTopology } from '@tssr/contracts';

export interface InterfaceRef {
  node: NetworkNode;
  iface: NetworkInterface;
}

/**
 * Index de consultation d une topologie.
 * Reconstruit a la volee : la topologie reste l unique source de verite.
 */
export class TopologyIndex {
  readonly topology: NetworkTopology;
  private readonly nodesById = new Map<string, NetworkNode>();
  private readonly nodesByHostname = new Map<string, NetworkNode>();
  private readonly ifaceById = new Map<string, InterfaceRef>();
  private readonly ifacesByNode = new Map<string, NetworkInterface[]>();
  private readonly linksByIface = new Map<string, NetworkLink>();
  private readonly ipOwners = new Map<string, InterfaceRef[]>();

  constructor(topology: NetworkTopology) {
    this.topology = topology;
    for (const node of topology.nodes) {
      this.nodesById.set(node.id, node);
      this.nodesByHostname.set(node.hostname.toLowerCase(), node);
      this.ifacesByNode.set(node.id, node.interfaces);
      for (const iface of node.interfaces) {
        this.ifaceById.set(iface.id, { node, iface });
        for (const addr of iface.addresses) {
          const list = this.ipOwners.get(addr.address) ?? [];
          list.push({ node, iface });
          this.ipOwners.set(addr.address, list);
        }
      }
    }
    for (const link of topology.links) {
      this.linksByIface.set(link.a.interfaceId, link);
      this.linksByIface.set(link.b.interfaceId, link);
    }
  }

  node(id: string): NetworkNode | undefined {
    return this.nodesById.get(id);
  }

  nodeByHostname(hostname: string): NetworkNode | undefined {
    return this.nodesByHostname.get(hostname.toLowerCase());
  }

  interfaceRef(id: string): InterfaceRef | undefined {
    return this.ifaceById.get(id);
  }

  interfaceByName(nodeId: string, name: string): NetworkInterface | undefined {
    return (this.ifacesByNode.get(nodeId) ?? []).find(
      (i) => i.name.toLowerCase() === name.toLowerCase(),
    );
  }

  interfaces(nodeId: string): readonly NetworkInterface[] {
    return this.ifacesByNode.get(nodeId) ?? [];
  }

  /** Interfaces (potentiellement plusieurs) portant cette adresse IP. */
  ownersOf(ip: string): readonly InterfaceRef[] {
    return this.ipOwners.get(ip) ?? [];
  }

  link(interfaceId: string): NetworkLink | undefined {
    return this.linksByIface.get(interfaceId);
  }

  /** Extremite opposee d un lien, si le lien existe. */
  peer(interfaceId: string): { link: NetworkLink; ref: InterfaceRef } | undefined {
    const link = this.linksByIface.get(interfaceId);
    if (!link) return undefined;
    const otherId = link.a.interfaceId === interfaceId ? link.b.interfaceId : link.a.interfaceId;
    const ref = this.ifaceById.get(otherId);
    if (!ref) return undefined;
    return { link, ref };
  }

  /** Un port est operationnel si le noeud est allume, l interface activee et le lien connecte. */
  isOperational(nodeId: string, interfaceId: string): boolean {
    const node = this.nodesById.get(nodeId);
    const ref = this.ifaceById.get(interfaceId);
    if (!node || !ref || !node.powered || !ref.iface.enabled) return false;
    return true;
  }

  isLinkUp(interfaceId: string): boolean {
    const peer = this.peer(interfaceId);
    if (!peer) return false;
    if (!peer.link.connected) return false;
    const self = this.ifaceById.get(interfaceId);
    if (!self || !self.iface.enabled || !self.node.powered) return false;
    return peer.ref.iface.enabled && peer.ref.node.powered;
  }

  /** Sous-interfaces logiques rattachees a une interface physique. */
  subInterfaces(parentId: string): readonly NetworkInterface[] {
    const ref = this.ifaceById.get(parentId);
    if (!ref) return [];
    return ref.node.interfaces.filter((i) => i.parentInterfaceId === parentId);
  }

  /** Un noeud qui route les paquets qui ne lui sont pas destines. */
  isForwarder(node: NetworkNode): boolean {
    return node.kind === 'router' || node.kind === 'firewall' || node.kind === 'internet';
  }

  isSwitching(node: NetworkNode): boolean {
    return node.kind === 'switch' || node.kind === 'access-point';
  }
}
