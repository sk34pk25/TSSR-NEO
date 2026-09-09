import type { NetworkTopology } from '@tssr/contracts';
import { TopologyIndex } from './topology-index.ts';

/**
 * Arbre recouvrant, abstraction pedagogique.
 *
 * Le but n est pas de reproduire l echange de trames de configuration, mais de
 * produire le **resultat observable** qui compte pour un technicien : un pont
 * racine elu, des ports bloques, et donc une boucle physique qui ne provoque
 * plus de tempete de diffusion.
 *
 * Le protocole reste desactive par defaut sur chaque commutateur : un scenario
 * peut ainsi montrer d abord le probleme, puis le resoudre en l activant.
 */

export interface SpanningTreeResult {
  /** Commutateur elu racine, ou indefini si aucun ne participe. */
  rootId: string | undefined;
  /** Interfaces mises hors service logique pour briser les boucles. */
  blockedInterfaceIds: Set<string>;
  /** Liens neutralises, avec le motif : c est ce que lit le joueur. */
  blockedLinks: { linkId: string; reason: string }[];
  /** Vrai si une boucle existait reellement dans la topologie participante. */
  loopsFound: boolean;
}

/**
 * Election de la racine : priorite la plus basse, puis identifiant le plus petit.
 * C est la regle usuelle, et elle rend le resultat previsible pour l apprenant.
 */
function electRoot(topology: NetworkTopology): string | undefined {
  const candidates = topology.nodes
    .filter((node) => node.spanningTree?.enabled === true && node.powered)
    .map((node) => ({ id: node.id, priority: node.spanningTree?.priority ?? 32768 }))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return candidates[0]?.id;
}

/**
 * Calcule l arbre recouvrant sur le graphe des commutateurs participants.
 * Les liens qui n appartiennent pas a l arbre sont bloques d un seul cote.
 */
export function computeSpanningTree(topology: NetworkTopology): SpanningTreeResult {
  const index = new TopologyIndex(topology);
  const rootId = electRoot(topology);
  const blockedInterfaceIds = new Set<string>();
  const blockedLinks: { linkId: string; reason: string }[] = [];

  if (rootId === undefined) {
    return { rootId: undefined, blockedInterfaceIds, blockedLinks, loopsFound: false };
  }

  const participates = (nodeId: string): boolean =>
    index.node(nodeId)?.spanningTree?.enabled === true && index.node(nodeId)?.powered === true;

  // Parcours en largeur depuis la racine : les liens qui rejoignent un
  // commutateur deja atteint ferment une boucle et sont donc bloques.
  const visited = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  const usedLinks = new Set<string>();
  let loopsFound = false;

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const node = index.node(current);
    if (!node) continue;

    // Ordre stable : le resultat ne depend pas de l ordre de declaration.
    const links = topology.links
      .filter((link) => link.a.nodeId === current || link.b.nodeId === current)
      .sort((a, b) => a.id.localeCompare(b.id));

    for (const link of links) {
      if (!link.connected) continue;
      const isA = link.a.nodeId === current;
      const peerId = isA ? link.b.nodeId : link.a.nodeId;
      if (!participates(peerId)) continue;
      if (usedLinks.has(link.id)) continue;

      if (visited.has(peerId)) {
        // Le lien reboucle sur un commutateur deja atteint : on le neutralise.
        loopsFound = true;
        const blockedSide = isA ? link.b.interfaceId : link.a.interfaceId;
        blockedInterfaceIds.add(blockedSide);
        blockedLinks.push({
          linkId: link.id,
          reason: `boucle detectee vers ${index.node(peerId)?.hostname ?? peerId} : port mis en blocage`,
        });
        usedLinks.add(link.id);
        continue;
      }

      usedLinks.add(link.id);
      visited.add(peerId);
      queue.push(peerId);
    }
  }

  return { rootId, blockedInterfaceIds, blockedLinks, loopsFound };
}

/** Vue lisible de l arbre, destinee a la console d equipement. */
export function describeSpanningTree(topology: NetworkTopology): string {
  const result = computeSpanningTree(topology);
  if (result.rootId === undefined) {
    return 'Aucun commutateur ne participe a l arbre recouvrant : les boucles ne sont pas protegees.';
  }
  const index = new TopologyIndex(topology);
  const lines = [`Pont racine : ${index.node(result.rootId)?.hostname ?? result.rootId}`];
  if (result.blockedLinks.length === 0) {
    lines.push('Aucun port en blocage : la topologie participante est sans boucle.');
  } else {
    for (const blocked of result.blockedLinks) {
      lines.push(`Lien ${blocked.linkId} : ${blocked.reason}`);
    }
  }
  return lines.join('\n');
}
