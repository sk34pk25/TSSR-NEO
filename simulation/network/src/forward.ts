import type { NetworkNode, NetworkTopology } from '@tssr/contracts';
import { TopologyIndex } from './topology-index.ts';
import { arpResolve } from './l2.ts';
import { effectiveRoutes, lookupRoute, ownsAddress, selectSourceAddress } from './routing.ts';
import { evaluateFirewall, type PacketDescriptor } from './firewall.ts';
import { inCidr } from './ip.ts';

export type ForwardFailureReason =
  | 'source-not-found'
  | 'source-powered-off'
  | 'no-source-address'
  | 'no-route'
  | 'egress-port-disabled'
  | 'link-down'
  | 'arp-failed'
  | 'firewall-blocked'
  | 'not-forwarding'
  | 'destination-powered-off'
  | 'ttl-exceeded';

export interface ForwardHop {
  nodeId: string;
  hostname: string;
  ingressInterfaceId?: string;
  egressInterfaceId?: string;
  action: 'origin' | 'route' | 'nat' | 'deliver' | 'drop';
  latencyMs: number;
  detail?: string;
}

export interface ForwardResult {
  delivered: boolean;
  hops: ForwardHop[];
  latencyMs: number;
  /** Perte cumulee des liens traverses, 0..1. Structurelle, pas tiree au hasard. */
  lossRate: number;
  sourceAddress?: string;
  destinationAddress: string;
  natApplied: boolean;
  failure?: { reason: ForwardFailureReason; nodeId: string; detail: string };
}

export interface ForwardOptions {
  protocol?: 'icmp' | 'tcp' | 'udp';
  destinationPort?: number;
  maxHops?: number;
  /** Adresse source imposee (utile pour tester une reponse). */
  sourceAddress?: string;
}

const BLOCK_LABELS: Record<string, string> = {
  'port-disabled': 'port administrativement desactive',
  'node-powered-off': 'equipement hors tension',
  'link-disconnected': 'cable debranche ou lien coupe',
  'no-link': 'aucun cable raccorde a ce port',
  'tagged-frame-on-access-port': 'trame taguee recue sur un port access',
  'vlan-not-allowed-on-trunk': 'VLAN non autorise sur le trunk',
  'vlan-not-declared-on-switch': 'VLAN non declare sur le commutateur',
  'vlan-mismatch': 'VLAN incoherent entre les deux extremites',
  'no-matching-subinterface': 'aucune sous-interface pour ce VLAN',
};

/**
 * Achemine un paquet de bout en bout et renvoie la trace complete.
 * Le resultat sert a la fois au diagnostic du joueur, a la visualisation des flux
 * et a l evaluation automatique des objectifs.
 */
export function forwardPacket(
  topology: NetworkTopology,
  fromNodeId: string,
  destinationAddress: string,
  options: ForwardOptions = {},
): ForwardResult {
  const index = new TopologyIndex(topology);
  const protocol = options.protocol ?? 'icmp';
  const maxHops = options.maxHops ?? 32;
  const hops: ForwardHop[] = [];
  const result: ForwardResult = {
    delivered: false,
    hops,
    latencyMs: 0,
    lossRate: 0,
    destinationAddress,
    natApplied: false,
  };

  const origin = index.node(fromNodeId);
  if (!origin) {
    result.failure = {
      reason: 'source-not-found',
      nodeId: fromNodeId,
      detail: 'noeud source inconnu',
    };
    return result;
  }
  if (!origin.powered) {
    result.failure = {
      reason: 'source-powered-off',
      nodeId: fromNodeId,
      detail: `${origin.hostname} est hors tension`,
    };
    return result;
  }

  // Boucle locale : la machine se joint elle-meme sans passer par le reseau.
  if (ownsAddress(origin, destinationAddress) || destinationAddress === '127.0.0.1') {
    hops.push({ nodeId: origin.id, hostname: origin.hostname, action: 'deliver', latencyMs: 0 });
    result.delivered = true;
    result.sourceAddress = destinationAddress;
    return result;
  }

  let current: NetworkNode = origin;
  let ingressInterfaceId: string | undefined;
  let sourceAddress: string | undefined = options.sourceAddress;
  let ttl = maxHops;

  for (;;) {
    ttl -= 1;
    if (ttl <= 0) {
      result.failure = {
        reason: 'ttl-exceeded',
        nodeId: current.id,
        detail: 'boucle de routage suspectee',
      };
      return result;
    }

    const isOrigin = current.id === origin.id;

    if (!isOrigin) {
      if (ownsAddress(current, destinationAddress)) {
        const packet: PacketDescriptor = {
          source: sourceAddress ?? '0.0.0.0',
          destination: destinationAddress,
          protocol,
          ...(options.destinationPort === undefined
            ? {}
            : { destinationPort: options.destinationPort }),
        };
        const decision = evaluateFirewall(current, packet, 'in');
        if (!decision.allowed) {
          hops.push({
            nodeId: current.id,
            hostname: current.hostname,
            action: 'drop',
            latencyMs: 0,
            ...(ingressInterfaceId === undefined ? {} : { ingressInterfaceId }),
            detail: decision.rule?.label ?? 'regle de filtrage entrante',
          });
          result.failure = {
            reason: 'firewall-blocked',
            nodeId: current.id,
            detail: `bloque en entree sur ${current.hostname} (${decision.rule?.label ?? decision.rule?.id ?? 'regle'})`,
          };
          return result;
        }
        hops.push({
          nodeId: current.id,
          hostname: current.hostname,
          action: 'deliver',
          latencyMs: 0,
          ...(ingressInterfaceId === undefined ? {} : { ingressInterfaceId }),
        });
        result.delivered = true;
        if (sourceAddress !== undefined) result.sourceAddress = sourceAddress;
        return result;
      }
      if (!index.isForwarder(current)) {
        result.failure = {
          reason: 'not-forwarding',
          nodeId: current.id,
          detail: `${current.hostname} n est pas un routeur : le paquet s arrete ici`,
        };
        return result;
      }
    }

    const routes = effectiveRoutes(current);
    const route = lookupRoute(routes, destinationAddress);
    if (!route) {
      result.failure = {
        reason: 'no-route',
        nodeId: current.id,
        detail: `aucune route vers ${destinationAddress} sur ${current.hostname}`,
      };
      return result;
    }

    const egressIface = current.interfaces.find((i) => i.id === route.interfaceId);
    if (!egressIface || !egressIface.enabled) {
      result.failure = {
        reason: 'egress-port-disabled',
        nodeId: current.id,
        detail: `interface de sortie inactive sur ${current.hostname}`,
      };
      return result;
    }

    const nextHop = route.via ?? destinationAddress;

    if (sourceAddress === undefined) {
      sourceAddress = selectSourceAddress(current, egressIface.id, nextHop);
      if (sourceAddress === undefined) {
        result.failure = {
          reason: 'no-source-address',
          nodeId: current.id,
          detail: `${current.hostname} n a pas d adresse IP sur ${egressIface.name}`,
        };
        return result;
      }
    }

    const packet: PacketDescriptor = {
      source: sourceAddress,
      destination: destinationAddress,
      protocol,
      ...(options.destinationPort === undefined
        ? {}
        : { destinationPort: options.destinationPort }),
    };
    const decision = evaluateFirewall(current, packet, isOrigin ? 'out' : 'forward');
    if (!decision.allowed) {
      hops.push({
        nodeId: current.id,
        hostname: current.hostname,
        action: 'drop',
        latencyMs: 0,
        egressInterfaceId: egressIface.id,
        detail: decision.rule?.label ?? 'regle de filtrage',
      });
      result.failure = {
        reason: 'firewall-blocked',
        nodeId: current.id,
        detail: `bloque par ${current.hostname} (${decision.rule?.label ?? decision.rule?.id ?? 'regle'})`,
      };
      return result;
    }

    // Traduction d adresse en sortie (masquerade) : l adresse source devient publique.
    const nat = current.natRules.find(
      (r) =>
        r.enabled &&
        r.kind === 'masquerade' &&
        r.outsideInterfaceId === egressIface.id &&
        (r.insideCidr === undefined || inCidr(sourceAddress as string, r.insideCidr)),
    );
    if (nat) {
      const outside = selectSourceAddress(current, egressIface.id, nextHop);
      if (outside !== undefined) {
        sourceAddress = outside;
        result.natApplied = true;
        hops.push({
          nodeId: current.id,
          hostname: current.hostname,
          action: 'nat',
          latencyMs: 0,
          egressInterfaceId: egressIface.id,
          detail: `translation de source vers ${outside}`,
        });
      }
    }

    const arp = arpResolve(index, { nodeId: current.id, interfaceId: egressIface.id }, nextHop);
    if (!arp.resolved || !arp.endpoint) {
      const blockers = arp.flood.blocked
        .map((b) => BLOCK_LABELS[b.reason] ?? b.reason)
        .filter((v, i, arr) => arr.indexOf(v) === i);
      const detail =
        blockers.length > 0
          ? `${nextHop} injoignable depuis ${current.hostname} : ${blockers.join(', ')}`
          : `aucune reponse ARP pour ${nextHop} depuis ${current.hostname}`;
      result.failure = { reason: 'arp-failed', nodeId: current.id, detail };
      hops.push({
        nodeId: current.id,
        hostname: current.hostname,
        action: 'drop',
        latencyMs: 0,
        egressInterfaceId: egressIface.id,
        detail,
      });
      return result;
    }

    const link = index.link(egressIface.id);
    const latency = link?.latencyMs ?? 0.2;
    result.latencyMs += latency;
    result.lossRate = 1 - (1 - result.lossRate) * (1 - (link?.lossRate ?? 0));

    hops.push({
      nodeId: current.id,
      hostname: current.hostname,
      action: isOrigin ? 'origin' : 'route',
      latencyMs: latency,
      egressInterfaceId: egressIface.id,
      ...(ingressInterfaceId === undefined ? {} : { ingressInterfaceId }),
      detail: route.via === undefined ? 'reseau directement connecte' : `via ${route.via}`,
    });

    const nextRef = index.interfaceRef(arp.endpoint.interfaceId);
    if (!nextRef) {
      result.failure = {
        reason: 'link-down',
        nodeId: current.id,
        detail: 'extremite de lien introuvable',
      };
      return result;
    }
    if (!nextRef.node.powered) {
      result.failure = {
        reason: 'destination-powered-off',
        nodeId: nextRef.node.id,
        detail: `${nextRef.node.hostname} est hors tension`,
      };
      return result;
    }

    ingressInterfaceId = nextRef.iface.id;
    current = nextRef.node;
  }
}

export interface ReachabilityResult extends ForwardResult {
  /** Le retour est verifie separement : une absence de route retour est une panne classique. */
  returnPath?: ForwardResult;
  returnOk: boolean;
}

/** Aller-retour complet : c est ce que teste reellement un ping. */
export function checkReachability(
  topology: NetworkTopology,
  fromNodeId: string,
  destinationAddress: string,
  options: ForwardOptions = {},
): ReachabilityResult {
  const forward = forwardPacket(topology, fromNodeId, destinationAddress, options);
  if (!forward.delivered) return { ...forward, returnOk: false };

  const index = new TopologyIndex(topology);
  const destNode = index.ownersOf(destinationAddress)[0]?.node;
  const sourceAddress = forward.sourceAddress;
  if (!destNode || sourceAddress === undefined) return { ...forward, returnOk: true };
  if (forward.natApplied) {
    // Derriere une translation d adresse, le retour est assure par la table de sessions.
    return { ...forward, returnOk: true };
  }

  const back = forwardPacket(topology, destNode.id, sourceAddress, {
    protocol: options.protocol ?? 'icmp',
  });
  return { ...forward, returnPath: back, returnOk: back.delivered };
}
