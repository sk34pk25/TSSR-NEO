import type {
  HardwareAsset,
  NetworkLink,
  PatchCable,
  PhysicalPort,
  WorldState,
} from '@tssr/contracts';
import type { EventBus } from '@tssr/events';
import type { NetworkEngine } from '@tssr/sim-network';

export type PatchError =
  'asset-not-found' | 'port-not-found' | 'port-occupied' | 'same-port' | 'no-logical-interface';

export interface PatchResult {
  ok: boolean;
  cable?: PatchCable;
  linkId?: string;
  error?: { reason: PatchError; detail: string };
}

/**
 * Laboratoire materiel : le brassage physique cree et detruit reellement
 * les liens de la topologie. Un mauvais brassage casse le reseau simule.
 */
export class HardwareEngine {
  private readonly world: WorldState;
  private readonly network: NetworkEngine;
  private readonly bus: EventBus | undefined;
  private cableCounter = 0;

  constructor(world: WorldState, deps: { network: NetworkEngine; bus?: EventBus }) {
    this.world = world;
    this.network = deps.network;
    this.bus = deps.bus;
    this.cableCounter = world.cables.length;
  }

  asset(id: string): HardwareAsset | undefined {
    return this.world.assets.find((a) => a.id === id || a.assetTag === id);
  }

  port(assetId: string, portId: string): PhysicalPort | undefined {
    return this.asset(assetId)?.ports.find((p) => p.id === portId || p.label === portId);
  }

  private cableOnPort(assetId: string, portId: string): PatchCable | undefined {
    return this.world.cables.find(
      (c) =>
        (c.from.assetId === assetId && c.from.portId === portId) ||
        (c.to.assetId === assetId && c.to.portId === portId),
    );
  }

  /** Raccorde deux ports physiques et cree le lien logique correspondant. */
  patch(
    from: { assetId: string; portId: string },
    to: { assetId: string; portId: string },
    options: {
      media?: 'copper' | 'fiber';
      lengthM?: number;
      condition?: PatchCable['condition'];
      color?: string;
    } = {},
  ): PatchResult {
    if (from.assetId === to.assetId && from.portId === to.portId) {
      return {
        ok: false,
        error: { reason: 'same-port', detail: 'un cable ne peut pas boucler sur le meme port' },
      };
    }
    const assetA = this.asset(from.assetId);
    const assetB = this.asset(to.assetId);
    if (!assetA || !assetB) {
      return { ok: false, error: { reason: 'asset-not-found', detail: 'equipement introuvable' } };
    }
    const portA = this.port(from.assetId, from.portId);
    const portB = this.port(to.assetId, to.portId);
    if (!portA || !portB) {
      return {
        ok: false,
        error: { reason: 'port-not-found', detail: 'port physique introuvable' },
      };
    }
    if (this.cableOnPort(assetA.id, portA.id) || this.cableOnPort(assetB.id, portB.id)) {
      return {
        ok: false,
        error: { reason: 'port-occupied', detail: 'un des ports est deja brasse' },
      };
    }
    if (portA.interfaceId === undefined || portB.interfaceId === undefined) {
      return {
        ok: false,
        error: {
          reason: 'no-logical-interface',
          detail: 'ce port n est rattache a aucune interface reseau',
        },
      };
    }

    this.cableCounter += 1;
    const condition = options.condition ?? 'ok';
    const linkId = `cable-link-${this.cableCounter}`;
    const link: NetworkLink = {
      id: linkId,
      a: { nodeId: assetA.networkNodeId ?? assetA.id, interfaceId: portA.interfaceId },
      b: { nodeId: assetB.networkNodeId ?? assetB.id, interfaceId: portB.interfaceId },
      media: options.media ?? 'copper',
      // Un cable abime ou au mauvais standard ne transmet pas : c est une panne de couche 1.
      connected: condition === 'ok',
      latencyMs: options.media === 'fiber' ? 0.1 : 0.2,
      lossRate: condition === 'damaged' ? 0.35 : 0,
      bandwidthMbps: options.media === 'fiber' ? 10000 : 1000,
    };
    this.world.network.links.push(link);

    const cable: PatchCable = {
      id: `cable-${this.cableCounter}`,
      from: { assetId: assetA.id, portId: portA.id },
      to: { assetId: assetB.id, portId: portB.id },
      media: options.media ?? 'copper',
      lengthM: options.lengthM ?? 2,
      condition,
      linkId,
      ...(options.color === undefined ? {} : { color: options.color }),
    };
    this.world.cables.push(cable);
    this.refreshLeds();
    this.bus?.emit({
      category: 'config-change',
      type: 'hardware.patched',
      payload: { cableId: cable.id, from, to, condition },
      significant: true,
      label: `Brassage ${assetA.assetTag}/${portA.label} vers ${assetB.assetTag}/${portB.label}`,
    });
    return { ok: true, cable, linkId };
  }

  unpatch(cableId: string): boolean {
    const index = this.world.cables.findIndex((c) => c.id === cableId);
    if (index === -1) return false;
    const cable = this.world.cables[index] as PatchCable;
    this.world.cables.splice(index, 1);
    if (cable.linkId !== undefined) {
      this.world.network.links = this.world.network.links.filter((l) => l.id !== cable.linkId);
    }
    this.refreshLeds();
    this.bus?.emit({
      category: 'config-change',
      type: 'hardware.unpatched',
      payload: { cableId },
      significant: true,
      label: `Cable ${cableId} retire`,
    });
    return true;
  }

  /** Etat des LED derive de la simulation : jamais une valeur decorative. */
  refreshLeds(): void {
    const index = this.network.index();
    for (const asset of this.world.assets) {
      for (const port of asset.ports) {
        if (port.interfaceId === undefined) {
          port.ledLink = 'off';
          continue;
        }
        const ref = index.interfaceRef(port.interfaceId);
        if (!ref || !asset.powered || !ref.node.powered || !ref.iface.enabled) {
          port.ledLink = 'off';
          continue;
        }
        const link = index.link(port.interfaceId);
        if (!link || !link.connected) {
          port.ledLink = 'off';
        } else if (link.lossRate > 0.1) {
          port.ledLink = 'amber';
        } else {
          port.ledLink = ref.iface.speedMbps >= 1000 ? 'green' : 'amber';
        }
      }
    }
  }

  setPower(assetId: string, powered: boolean): boolean {
    const asset = this.asset(assetId);
    if (!asset) return false;
    asset.powered = powered;
    if (asset.networkNodeId !== undefined) this.network.setNodePower(asset.networkNodeId, powered);
    this.refreshLeds();
    asset.history.push({
      at: this.bus?.getSimTime() ?? 0,
      event: powered ? 'mise sous tension' : 'mise hors tension',
    });
    return true;
  }

  /**
   * Panne materielle : une carte reseau HS desactive l interface,
   * une alimentation HS coupe l equipement. La consequence est reelle.
   */
  setComponentHealth(
    assetId: string,
    componentId: string,
    health: 'ok' | 'warning' | 'failed',
  ): boolean {
    const asset = this.asset(assetId);
    const component = asset?.components.find((c) => c.id === componentId);
    if (!asset || !component) return false;
    component.health = health;
    asset.history.push({
      at: this.bus?.getSimTime() ?? 0,
      event: `${component.kind} ${component.slot} -> ${health}`,
    });

    if (component.kind === 'psu' && health === 'failed') {
      const remaining = asset.components.filter((c) => c.kind === 'psu' && c.health === 'ok');
      if (remaining.length === 0) this.setPower(asset.id, false);
    }
    if (component.kind === 'nic' && asset.networkNodeId !== undefined) {
      const port = asset.ports.find((p) => p.id === component.slot || p.label === component.slot);
      if (port?.interfaceId !== undefined) {
        const ref = this.network.index().interfaceRef(port.interfaceId);
        if (ref)
          this.network.setInterfaceEnabled(
            asset.networkNodeId,
            ref.iface.name,
            health !== 'failed',
          );
      }
    }
    this.refreshLeds();
    this.bus?.emit({
      category: 'incident',
      type: 'hardware.component.health',
      payload: { assetId, componentId, health },
      significant: true,
      label: `${asset.assetTag} : ${component.kind} ${component.slot} -> ${health}`,
    });
    return true;
  }

  /** Inventaire lisible : sert au module de gestion de parc. */
  inventory(): {
    assetTag: string;
    kind: string;
    location: string;
    lifecycle: string;
    powered: boolean;
  }[] {
    return this.world.assets.map((a) => ({
      assetTag: a.assetTag,
      kind: a.kind,
      location: a.location ?? '(non renseigne)',
      lifecycle: a.lifecycle,
      powered: a.powered,
    }));
  }
}
