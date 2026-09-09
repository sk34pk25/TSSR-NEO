import type { NetworkNode, Route } from '@tssr/contracts';
import { ipToInt, networkOf, prefixToMaskInt } from './ip.ts';

export interface EffectiveRoute extends Route {
  prefix: number;
  networkInt: number;
}

/**
 * Table de routage effective d un noeud :
 * routes connectees derivees des interfaces + routes statiques declarees.
 * Les routes connectees ne sont jamais saisies a la main dans les scenarios.
 */
export function effectiveRoutes(node: NetworkNode): EffectiveRoute[] {
  const routes: EffectiveRoute[] = [];

  for (const iface of node.interfaces) {
    if (!iface.enabled) continue;
    for (const addr of iface.addresses) {
      const network = networkOf(addr.address, addr.prefix);
      routes.push({
        destination: `${network}/${addr.prefix}`,
        interfaceId: iface.id,
        metric: 0,
        origin: 'connected',
        prefix: addr.prefix,
        networkInt: ipToInt(network),
      });
    }
  }

  for (const route of node.routes) {
    if (route.origin === 'connected') continue;
    const [addr, prefixText] = route.destination.split('/');
    if (addr === undefined || prefixText === undefined) continue;
    const prefix = Number(prefixText);
    const iface = node.interfaces.find((i) => i.id === route.interfaceId);
    if (!iface || !iface.enabled) continue;
    routes.push({
      ...route,
      prefix,
      networkInt: ipToInt(networkOf(addr, prefix)),
    });
  }

  // Prefixe le plus long d abord, puis metrique la plus faible : ordre deterministe.
  return routes.sort((a, b) => b.prefix - a.prefix || a.metric - b.metric);
}

/** Recherche du meilleur chemin (longest prefix match). */
export function lookupRoute(
  routes: readonly EffectiveRoute[],
  destination: string,
): EffectiveRoute | undefined {
  const dest = ipToInt(destination);
  for (const route of routes) {
    const mask = prefixToMaskInt(route.prefix);
    if ((dest & mask) >>> 0 === (route.networkInt & mask) >>> 0) return route;
  }
  return undefined;
}

/** Adresse locale utilisee comme source pour joindre une destination via une interface. */
export function selectSourceAddress(
  node: NetworkNode,
  interfaceId: string,
  nextHop: string,
): string | undefined {
  const iface = node.interfaces.find((i) => i.id === interfaceId);
  if (!iface) return undefined;
  const nextHopInt = ipToInt(nextHop);
  for (const addr of iface.addresses) {
    const mask = prefixToMaskInt(addr.prefix);
    if ((ipToInt(addr.address) & mask) >>> 0 === (nextHopInt & mask) >>> 0) return addr.address;
  }
  return iface.addresses[0]?.address;
}

export function ownsAddress(node: NetworkNode, ip: string): boolean {
  return node.interfaces.some((i) => i.enabled && i.addresses.some((a) => a.address === ip));
}

export function hasDefaultRoute(node: NetworkNode): boolean {
  return effectiveRoutes(node).some((r) => r.destination === '0.0.0.0/0');
}
