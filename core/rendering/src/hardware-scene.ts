import type { HardwareAsset, WorldState } from '@tssr/contracts';
import type { Collider, NodePatch, Scene3D, Scene3DNode, Vec3 } from './scene3d.ts';

/**
 * Representation tridimensionnelle du materiel.
 *
 * Tout ce qui est affiche est **derive de l etat de simulation** : la couleur d un
 * temoin vient de l etat reel du port, la presence d un cable vient du brassage
 * reel, et un equipement hors tension est visiblement eteint. Rien n est decoratif.
 */

const RACK_UNITS = 42;
const UNIT_HEIGHT = 0.0445;
const RACK_WIDTH = 0.62;
const RACK_DEPTH = 1.0;
const RACK_INNER_HEIGHT = RACK_UNITS * UNIT_HEIGHT;

export interface RackPlacement {
  rackId: string;
  origin: Vec3;
}

/** Disposition des baies : alignees, espacees, deterministe. */
export function placeRacks(world: WorldState): RackPlacement[] {
  return world.racks.map((rack, index) => ({
    rackId: rack.id,
    origin: [-3 + index * 1.4, 0, 0] as Vec3,
  }));
}

function assetY(asset: HardwareAsset): number {
  const unit = asset.rackUnit ?? 1;
  const height = asset.heightU * UNIT_HEIGHT;
  return 0.12 + (unit - 1) * UNIT_HEIGHT + height / 2;
}

const KIND_COLOR: Record<string, Vec3> = {
  server: [0.17, 0.2, 0.24],
  switch: [0.11, 0.18, 0.24],
  router: [0.2, 0.15, 0.24],
  firewall: [0.24, 0.14, 0.16],
  'patch-panel': [0.19, 0.19, 0.21],
  pdu: [0.14, 0.14, 0.15],
  ups: [0.16, 0.15, 0.13],
  storage: [0.15, 0.19, 0.2],
  desktop: [0.18, 0.19, 0.22],
  laptop: [0.18, 0.19, 0.22],
  printer: [0.2, 0.2, 0.2],
  'access-point': [0.16, 0.2, 0.22],
};

/** Position du port sur la face avant de l equipement. */
export function portPosition(asset: HardwareAsset, portIndex: number, origin: Vec3): Vec3 {
  const perRow = 12;
  const column = portIndex % perRow;
  const row = Math.floor(portIndex / perRow);
  const spacing = (RACK_WIDTH - 0.12) / perRow;
  return [
    origin[0] - RACK_WIDTH / 2 + 0.06 + column * spacing + spacing / 2,
    origin[1] + assetY(asset) + (row === 0 ? 0.008 : -0.012),
    origin[2] + RACK_DEPTH / 2 + 0.012,
  ];
}

export interface HardwareLayout {
  racks: RackPlacement[];
  /** Ordre des temoins, pour reconstruire le tampon de couleurs a chaque image. */
  ledOrder: { assetId: string; portId: string }[];
  /** Position de chaque port, indexee par "assetId:portId". */
  portPositions: Map<string, Vec3>;
}

export interface HardwareScenePart {
  nodes: Scene3DNode[];
  colliders: Collider[];
  anchors: Scene3D['anchors'];
  layout: HardwareLayout;
}

/** Couleur d un temoin, deduite de l etat reel du port et de l alimentation. */
function ledColor(led: string, powered: boolean): Vec3 {
  if (!powered) return [0.06, 0.06, 0.07];
  switch (led) {
    case 'green':
      return [0.15, 0.95, 0.45];
    case 'amber':
      return [1, 0.68, 0.2];
    case 'blinking':
      return [0.3, 0.85, 1];
    default:
      return [0.08, 0.09, 0.1];
  }
}

/** Construit la partie materielle de la scene a partir de l etat du monde. */
export function buildHardwareScene(world: WorldState, origin: Vec3 = [0, 0, 0]): HardwareScenePart {
  const nodes: Scene3DNode[] = [];
  const colliders: Collider[] = [];
  const anchors: Scene3D['anchors'] = [];
  const racks = placeRacks(world);
  const ledOrder: HardwareLayout['ledOrder'] = [];
  const portPositions = new Map<string, Vec3>();
  const ledMatrices: number[] = [];
  const ledColors: number[] = [];

  for (const placement of racks) {
    const rack = world.racks.find((r) => r.id === placement.rackId);
    if (!rack) continue;
    const base: Vec3 = [
      origin[0] + placement.origin[0],
      origin[1] + placement.origin[1],
      origin[2] + placement.origin[2],
    ];

    // Montants de baie : quatre poteaux, laissant voir les equipements.
    for (const [index, offset] of (
      [
        [-RACK_WIDTH / 2, -RACK_DEPTH / 2],
        [RACK_WIDTH / 2, -RACK_DEPTH / 2],
        [-RACK_WIDTH / 2, RACK_DEPTH / 2],
        [RACK_WIDTH / 2, RACK_DEPTH / 2],
      ] as const
    ).entries()) {
      nodes.push({
        id: `${rack.id}-post-${index}`,
        kind: 'box',
        position: [base[0] + offset[0], base[1] + RACK_INNER_HEIGHT / 2, base[2] + offset[1]],
        size: [0.05, RACK_INNER_HEIGHT, 0.05],
        material: { color: [0.08, 0.09, 0.11], metallic: 0.85, roughness: 0.35 },
        static: true,
      });
    }
    nodes.push({
      id: `${rack.id}-base`,
      kind: 'box',
      position: [base[0], base[1] + 0.05, base[2]],
      size: [RACK_WIDTH + 0.08, 0.1, RACK_DEPTH + 0.08],
      material: { color: [0.07, 0.08, 0.09], metallic: 0.8, roughness: 0.4 },
      interactive: {
        kind: 'asset',
        targetId: rack.id,
        label: rack.name,
        description: `Baie situee en ${rack.room}`,
      },
      static: true,
    });

    colliders.push({
      id: `${rack.id}-collider`,
      min: [base[0] - RACK_WIDTH / 2 - 0.1, 0, base[2] - RACK_DEPTH / 2 - 0.1],
      max: [base[0] + RACK_WIDTH / 2 + 0.1, RACK_INNER_HEIGHT, base[2] + RACK_DEPTH / 2 + 0.1],
    });
    anchors.push({
      id: `anchor-${rack.id}`,
      label: rack.name,
      position: [base[0], base[1] + RACK_INNER_HEIGHT + 0.18, base[2]],
      targetId: rack.id,
    });

    for (const asset of world.assets.filter((a) => a.rackId === rack.id)) {
      const height = asset.heightU * UNIT_HEIGHT;
      const y = base[1] + assetY(asset);
      const dimmed = asset.powered ? 1 : 0.45;
      const baseColor = KIND_COLOR[asset.kind] ?? [0.18, 0.18, 0.2];

      nodes.push({
        id: `asset-${asset.id}`,
        kind: 'box',
        position: [base[0], y, base[2]],
        size: [RACK_WIDTH - 0.04, height - 0.004, RACK_DEPTH - 0.06],
        material: {
          color: [baseColor[0] * dimmed, baseColor[1] * dimmed, baseColor[2] * dimmed],
          metallic: 0.7,
          roughness: 0.45,
        },
        interactive: {
          kind: 'asset',
          targetId: asset.id,
          label: `${asset.assetTag} - ${asset.model}`,
          description: asset.powered
            ? `${asset.kind}, ${asset.ports.length} port(s), etat ${asset.lifecycle}`
            : `${asset.kind} hors tension`,
        },
      });

      for (const [portIndex, port] of asset.ports.entries()) {
        const position = portPosition(asset, portIndex, [base[0], base[1], base[2]]);
        portPositions.set(`${asset.id}:${port.id}`, position);

        nodes.push({
          id: `port-${asset.id}-${port.id}`,
          kind: 'box',
          position,
          size: [0.026, 0.02, 0.016],
          material: { color: [0.1, 0.1, 0.12], metallic: 0.5, roughness: 0.6 },
          interactive: {
            kind: 'port',
            targetId: `${asset.id}:${port.id}`,
            label: `${asset.assetTag} port ${port.label}`,
            description: `Voyant ${port.ledLink}`,
          },
        });

        // Temoin lumineux : instancie, sa couleur suit l etat reel du port.
        const color = ledColor(port.ledLink, asset.powered);
        ledOrder.push({ assetId: asset.id, portId: port.id });
        ledMatrices.push(
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          0,
          0,
          0,
          1,
          0,
          position[0],
          position[1] + 0.016,
          position[2] + 0.004,
          1,
        );
        ledColors.push(color[0], color[1], color[2], 1);
      }
    }
  }

  if (ledOrder.length > 0) {
    nodes.push({
      id: 'hardware-leds',
      kind: 'box',
      position: [0, 0, 0],
      size: [0.012, 0.006, 0.006],
      material: { color: [1, 1, 1], emissive: [1, 1, 1], emissiveIntensity: 1.6, roughness: 0.3 },
      instances: new Float32Array(ledMatrices),
      instanceColors: new Float32Array(ledColors),
    });
  }

  // Cables de brassage : un tube par cable reellement present dans la simulation.
  for (const cable of world.cables) {
    const from = portPositions.get(`${cable.from.assetId}:${cable.from.portId}`);
    const to = portPositions.get(`${cable.to.assetId}:${cable.to.portId}`);
    if (!from || !to) continue;
    const sag = 0.08 + Math.abs(from[0] - to[0]) * 0.05;
    const middle: Vec3 = [
      (from[0] + to[0]) / 2,
      Math.min(from[1], to[1]) - sag,
      Math.max(from[2], to[2]) + 0.14,
    ];
    const damaged = cable.condition !== 'ok';
    nodes.push({
      id: `cable-${cable.id}`,
      kind: 'tube',
      position: [0, 0, 0],
      path: [from, middle, to],
      radius: 0.005,
      material: {
        color: damaged ? [0.75, 0.25, 0.25] : [0.15, 0.5, 0.7],
        roughness: 0.75,
        metallic: 0,
      },
      interactive: {
        kind: 'cable',
        targetId: cable.id,
        label: `Cable ${cable.id}`,
        description: damaged
          ? `Cable en etat "${cable.condition}" : il perturbe la liaison`
          : `${cable.media}, ${cable.lengthM} m`,
      },
    });
  }

  return { nodes, colliders, anchors, layout: { racks, ledOrder, portPositions } };
}

/**
 * Recalcule les elements variables a partir de l etat courant.
 * Appele a chaque changement de simulation, sans reconstruire la scene.
 */
export function hardwarePatches(world: WorldState, layout: HardwareLayout): NodePatch[] {
  const patches: NodePatch[] = [];
  const assets = new Map(world.assets.map((asset) => [asset.id, asset]));

  if (layout.ledOrder.length > 0) {
    const colors = new Float32Array(layout.ledOrder.length * 4);
    layout.ledOrder.forEach((entry, index) => {
      const asset = assets.get(entry.assetId);
      const port = asset?.ports.find((p) => p.id === entry.portId);
      const color = ledColor(port?.ledLink ?? 'off', asset?.powered ?? false);
      colors.set([color[0], color[1], color[2], 1], index * 4);
    });
    patches.push({ id: 'hardware-leds', instanceColors: colors });
  }

  for (const asset of world.assets) {
    const baseColor = KIND_COLOR[asset.kind] ?? [0.18, 0.18, 0.2];
    const dim = asset.powered ? 1 : 0.45;
    patches.push({
      id: `asset-${asset.id}`,
      material: { color: [baseColor[0] * dim, baseColor[1] * dim, baseColor[2] * dim] },
    });
  }

  return patches;
}

/** Assemble une scene de salle technique complete autour du materiel. */
export function buildDatacenterScene(world: WorldState): Scene3D {
  const hardware = buildHardwareScene(world, [0, 0, 0]);
  const nodes: Scene3DNode[] = [
    {
      id: 'dc-floor',
      kind: 'box',
      position: [0, -0.05, 0],
      size: [14, 0.1, 10],
      material: { color: [0.11, 0.12, 0.14], roughness: 0.9, metallic: 0.05 },
      static: true,
    },
    {
      id: 'dc-ceiling',
      kind: 'box',
      position: [0, 3.2, 0],
      size: [14, 0.1, 10],
      material: { color: [0.07, 0.08, 0.1], roughness: 0.95 },
      static: true,
    },
    ...hardware.nodes,
  ];

  for (const [index, spec] of (
    [
      [0, 1.6, -5, 14, 3.2, 0.2],
      [0, 1.6, 5, 14, 3.2, 0.2],
      [-7, 1.6, 0, 0.2, 3.2, 10],
      [7, 1.6, 0, 0.2, 3.2, 10],
    ] as const
  ).entries()) {
    nodes.push({
      id: `dc-wall-${index}`,
      kind: 'box',
      position: [spec[0], spec[1], spec[2]],
      size: [spec[3], spec[4], spec[5]],
      material: { color: [0.15, 0.16, 0.19], roughness: 0.92 },
      static: true,
    });
  }

  return {
    id: 'datacenter',
    background: [0.015, 0.02, 0.03],
    nodes,
    lights: [
      { kind: 'hemisphere', color: [0.5, 0.62, 0.8], intensity: 0.5 },
      { kind: 'directional', color: [1, 0.98, 0.95], intensity: 1.2, position: [5, 8, 5] },
      { kind: 'point', color: [0.55, 0.8, 1], intensity: 10, position: [0, 2.9, 2], range: 12 },
    ],
    colliders: hardware.colliders,
    anchors: hardware.anchors,
  };
}
