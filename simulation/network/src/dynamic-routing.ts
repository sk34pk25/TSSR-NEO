import type { NetworkTopology, Route } from '@tssr/contracts';
import { TopologyIndex } from './topology-index.ts';
import { effectiveRoutes } from './routing.ts';
import { floodDomain } from './l2.ts';

/**
 * Routage dynamique, abstraction pedagogique a vecteur de distance.
 *
 * On ne reproduit pas les temporisateurs ni le format des messages d un
 * protocole particulier : on reproduit ce qui compte pedagogiquement, a savoir
 * qu un routeur **apprend** les reseaux de ses voisins, qu il choisit le chemin
 * le plus court, et que la table **converge** puis se reconstruit apres une
 * coupure de lien.
 *
 * Le calcul est deterministe et sans etat : il repart de la topologie reelle,
 * ce qui garantit qu il ne peut jamais diverger de ce que le joueur observe.
 */

export interface LearnedRoute {
  destination: string;
  via: string;
  interfaceId: string;
  metric: number;
  /** Routeur ayant annonce ce reseau. */
  learnedFrom: string;
}

export interface ConvergenceResult {
  /** Routes apprises par routeur participant. */
  routesByNode: Map<string, LearnedRoute[]>;
  /** Nombre d echanges necessaires avant stabilisation. */
  iterations: number;
  converged: boolean;
}

const MAX_METRIC = 16;

/** Voisins de routage directement joignables en couche 2. */
function neighboursOf(
  index: TopologyIndex,
  nodeId: string,
  blocked?: ReadonlySet<string>,
): { nodeId: string; localInterfaceId: string; remoteAddress: string }[] {
  const node = index.node(nodeId);
  if (!node) return [];
  const out: { nodeId: string; localInterfaceId: string; remoteAddress: string }[] = [];

  for (const iface of node.interfaces) {
    if (!iface.enabled || iface.addresses.length === 0) continue;
    const flood = floodDomain(index, { nodeId, interfaceId: iface.id }, blocked);
    for (const endpoint of flood.endpoints) {
      const ref = index.interfaceRef(endpoint.interfaceId);
      if (!ref || ref.node.id === nodeId) continue;
      if (!index.isForwarder(ref.node)) continue;
      if (ref.node.dynamicRouting?.enabled !== true) continue;
      const address = ref.iface.addresses[0]?.address;
      if (address === undefined) continue;
      out.push({ nodeId: ref.node.id, localInterfaceId: iface.id, remoteAddress: address });
    }
  }
  return out;
}

/**
 * Fait converger les tables par echanges successifs.
 * Chaque tour, un routeur adopte la meilleure annonce de ses voisins.
 */
export function convergeDistanceVector(
  topology: NetworkTopology,
  options: { blockedInterfaceIds?: ReadonlySet<string>; maxIterations?: number } = {},
): ConvergenceResult {
  const index = new TopologyIndex(topology);
  const participants = topology.nodes.filter(
    (node) => node.dynamicRouting?.enabled === true && node.powered,
  );
  const routesByNode = new Map<string, LearnedRoute[]>();
  const tables = new Map<string, Map<string, LearnedRoute>>();

  // Etat initial : chaque routeur ne connait que ses reseaux directs.
  for (const node of participants) {
    const table = new Map<string, LearnedRoute>();
    for (const route of effectiveRoutes(node)) {
      if (route.origin !== 'connected') continue;
      table.set(route.destination, {
        destination: route.destination,
        via: '',
        interfaceId: route.interfaceId,
        metric: 0,
        learnedFrom: node.id,
      });
    }
    tables.set(node.id, table);
  }

  const maxIterations = options.maxIterations ?? 32;
  let iterations = 0;
  let changed = true;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations += 1;

    for (const node of participants) {
      const table = tables.get(node.id);
      if (!table) continue;
      for (const neighbour of neighboursOf(index, node.id, options.blockedInterfaceIds)) {
        const neighbourTable = tables.get(neighbour.nodeId);
        if (!neighbourTable) continue;

        for (const advertised of neighbourTable.values()) {
          const metric = advertised.metric + 1;
          // Au-dela du plafond, le reseau est considere inaccessible :
          // c est ce qui evite les boucles de comptage a l infini.
          if (metric >= MAX_METRIC) continue;

          const existing = table.get(advertised.destination);
          // Une route directe n est jamais remplacee par une route apprise.
          if (existing && existing.metric === 0) continue;
          if (existing && existing.metric <= metric) continue;

          table.set(advertised.destination, {
            destination: advertised.destination,
            via: neighbour.remoteAddress,
            interfaceId: neighbour.localInterfaceId,
            metric,
            learnedFrom: neighbour.nodeId,
          });
          changed = true;
        }
      }
    }
  }

  for (const node of participants) {
    const table = tables.get(node.id);
    routesByNode.set(
      node.id,
      [...(table?.values() ?? [])]
        .filter((route) => route.metric > 0)
        .sort((a, b) => a.destination.localeCompare(b.destination)),
    );
  }

  return { routesByNode, iterations, converged: !changed };
}

/**
 * Applique les routes apprises a la topologie.
 * Les anciennes routes dynamiques sont retirees d abord : apres une coupure,
 * une route obsolete disparait au lieu de subsister indefiniment.
 */
export function applyDynamicRoutes(
  topology: NetworkTopology,
  options: { blockedInterfaceIds?: ReadonlySet<string> } = {},
): ConvergenceResult {
  const result = convergeDistanceVector(topology, options);
  for (const node of topology.nodes) {
    if (node.dynamicRouting?.enabled !== true) continue;
    node.routes = node.routes.filter((route) => route.origin !== 'dynamic');
    for (const learned of result.routesByNode.get(node.id) ?? []) {
      const route: Route = {
        destination: learned.destination,
        via: learned.via,
        interfaceId: learned.interfaceId,
        metric: learned.metric,
        origin: 'dynamic',
      };
      node.routes.push(route);
    }
  }
  return result;
}
