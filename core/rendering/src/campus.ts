import type { Collider, MaterialSpec, Scene3D, Scene3DNode, Vec3 } from './scene3d.ts';

/**
 * Campus NEO Systems, version 1.
 *
 * Chaque zone visible correspond a une fonction reelle de la plateforme :
 * aucune piece n est purement decorative. La description reste independante
 * du moteur graphique.
 */

export type CampusRoute =
  'tickets' | 'supervision' | 'laboratoire' | 'mission' | 'connaissances' | 'progression';

export interface CampusZone {
  id: string;
  name: string;
  /** Ce que l on vient reellement y faire. */
  purpose: string;
  /** Ecran de la plateforme atteint depuis cette zone. */
  route: CampusRoute;
  center: Vec3;
  size: readonly [number, number];
  /** Cote du couloir ou se trouve la porte. */
  doorSide: 'north' | 'south';
  accent: Vec3;
}

const ROOM_DEPTH = 8;
const ROOM_HEIGHT = 3.4;
const CORRIDOR_HALF = 2.2;
const DOOR_WIDTH = 2.2;

export const CAMPUS_ZONES: CampusZone[] = [
  {
    id: 'reception',
    name: 'Accueil',
    purpose: 'Reception des demandes utilisateurs, qualification et priorisation.',
    route: 'tickets',
    center: [-16, 0, -CORRIDOR_HALF - ROOM_DEPTH / 2],
    size: [8, ROOM_DEPTH],
    doorSide: 'south',
    accent: [0.25, 0.7, 0.95],
  },
  {
    id: 'offices',
    name: 'Bureaux',
    purpose: 'Postes des utilisateurs : c est ici que les incidents sont vecus.',
    route: 'tickets',
    center: [-8, 0, -CORRIDOR_HALF - ROOM_DEPTH / 2],
    size: [8, ROOM_DEPTH],
    doorSide: 'south',
    accent: [0.55, 0.6, 0.9],
  },
  {
    id: 'command-center',
    name: 'Centre de commandement',
    purpose: 'Supervision des equipements et des services, alertes en cours.',
    route: 'supervision',
    center: [0, 0, -CORRIDOR_HALF - ROOM_DEPTH / 2],
    size: [8, ROOM_DEPTH],
    doorSide: 'south',
    accent: [0.95, 0.7, 0.3],
  },
  {
    id: 'knowledge',
    name: 'NEO Knowledge',
    purpose: 'Fiches de connaissances, revisions courtes, graphe de competences.',
    route: 'connaissances',
    center: [8, 0, -CORRIDOR_HALF - ROOM_DEPTH / 2],
    size: [8, ROOM_DEPTH],
    doorSide: 'south',
    accent: [0.4, 0.85, 0.6],
  },
  {
    id: 'personal-space',
    name: 'Espace personnel',
    purpose: 'Progression, competences suivies, badges et parametres.',
    route: 'progression',
    center: [16, 0, -CORRIDOR_HALF - ROOM_DEPTH / 2],
    size: [8, ROOM_DEPTH],
    doorSide: 'south',
    accent: [0.7, 0.5, 0.95],
  },
  {
    id: 'network-room',
    name: 'Salle reseau',
    purpose: 'Commutateurs, brassage physique, VLAN et plan d adressage.',
    route: 'laboratoire',
    center: [-16, 0, CORRIDOR_HALF + ROOM_DEPTH / 2],
    size: [8, ROOM_DEPTH],
    doorSide: 'north',
    accent: [0.25, 0.8, 0.85],
  },
  {
    id: 'datacenter',
    name: 'Datacenter',
    purpose: 'Baies de production : serveurs, alimentation, refroidissement.',
    route: 'laboratoire',
    center: [-8, 0, CORRIDOR_HALF + ROOM_DEPTH / 2],
    size: [8, ROOM_DEPTH],
    doorSide: 'north',
    accent: [0.3, 0.65, 1],
  },
  {
    id: 'training-lab',
    name: 'NEO Training Lab',
    purpose: 'Missions scenarisees et diagnostic guide.',
    route: 'mission',
    center: [0, 0, CORRIDOR_HALF + ROOM_DEPTH / 2],
    size: [8, ROOM_DEPTH],
    doorSide: 'north',
    accent: [0.95, 0.45, 0.55],
  },
  {
    id: 'lab-builder',
    name: 'NEO Lab Builder',
    purpose: 'Laboratoire libre : construire, casser, observer, recommencer.',
    route: 'laboratoire',
    center: [8, 0, CORRIDOR_HALF + ROOM_DEPTH / 2],
    size: [8, ROOM_DEPTH],
    doorSide: 'north',
    accent: [0.55, 0.85, 0.4],
  },
];

const MATERIALS: Record<string, MaterialSpec> = {
  floor: { color: [0.07, 0.08, 0.095], metallic: 0.05, roughness: 0.9 },
  corridor: { color: [0.085, 0.095, 0.115], metallic: 0.12, roughness: 0.75 },
  wall: { color: [0.115, 0.125, 0.15], metallic: 0.05, roughness: 0.92 },
  ceiling: { color: [0.05, 0.055, 0.07], metallic: 0.05, roughness: 0.95 },
  glass: { color: [0.2, 0.35, 0.45], metallic: 0.1, roughness: 0.2, opacity: 0.22 },
};

function wall(id: string, position: Vec3, size: Vec3): Scene3DNode {
  return {
    id,
    kind: 'box',
    position,
    size,
    material: MATERIALS.wall as MaterialSpec,
    static: true,
  };
}

/** Construit une piece avec une ouverture de porte du cote du couloir. */
function room(zone: CampusZone): { nodes: Scene3DNode[]; colliders: Collider[] } {
  const [cx, , cz] = zone.center;
  const [width, depth] = zone.size;
  const halfW = width / 2;
  const halfD = depth / 2;
  const nodes: Scene3DNode[] = [];
  const colliders: Collider[] = [];
  const thickness = 0.2;

  nodes.push({
    id: `${zone.id}-floor`,
    kind: 'box',
    position: [cx, -0.05, cz],
    size: [width, 0.1, depth],
    material: MATERIALS.floor as MaterialSpec,
    static: true,
    interactive: {
      kind: 'zone',
      targetId: zone.id,
      label: zone.name,
      description: zone.purpose,
    },
  });
  nodes.push({
    id: `${zone.id}-ceiling`,
    kind: 'box',
    position: [cx, ROOM_HEIGHT, cz],
    size: [width, 0.1, depth],
    material: MATERIALS.ceiling as MaterialSpec,
    static: true,
  });

  const doorZ = zone.doorSide === 'south' ? cz + halfD : cz - halfD;
  const backZ = zone.doorSide === 'south' ? cz - halfD : cz + halfD;

  // Mur du fond et murs lateraux, pleins.
  nodes.push(
    wall(`${zone.id}-wall-back`, [cx, ROOM_HEIGHT / 2, backZ], [width, ROOM_HEIGHT, thickness]),
  );
  nodes.push(
    wall(
      `${zone.id}-wall-left`,
      [cx - halfW, ROOM_HEIGHT / 2, cz],
      [thickness, ROOM_HEIGHT, depth],
    ),
  );
  nodes.push(
    wall(
      `${zone.id}-wall-right`,
      [cx + halfW, ROOM_HEIGHT / 2, cz],
      [thickness, ROOM_HEIGHT, depth],
    ),
  );

  // Facade sur couloir : deux trumeaux encadrant la porte, plus un linteau.
  const sideWidth = (width - DOOR_WIDTH) / 2;
  nodes.push(
    wall(
      `${zone.id}-wall-front-a`,
      [cx - DOOR_WIDTH / 2 - sideWidth / 2, ROOM_HEIGHT / 2, doorZ],
      [sideWidth, ROOM_HEIGHT, thickness],
    ),
  );
  nodes.push(
    wall(
      `${zone.id}-wall-front-b`,
      [cx + DOOR_WIDTH / 2 + sideWidth / 2, ROOM_HEIGHT / 2, doorZ],
      [sideWidth, ROOM_HEIGHT, thickness],
    ),
  );
  nodes.push(wall(`${zone.id}-lintel`, [cx, ROOM_HEIGHT - 0.5, doorZ], [DOOR_WIDTH, 1, thickness]));

  // Porte vitree interactive : elle mene reellement a un ecran de la plateforme.
  nodes.push({
    id: `${zone.id}-door`,
    kind: 'box',
    position: [cx, 1.1, doorZ],
    size: [DOOR_WIDTH - 0.15, 2.2, 0.06],
    material: {
      ...(MATERIALS.glass as MaterialSpec),
      emissive: zone.accent,
      emissiveIntensity: 0.25,
    },
    interactive: {
      kind: 'door',
      targetId: zone.id,
      label: `Entrer : ${zone.name}`,
      description: zone.purpose,
    },
  });

  // Signaletique : bandeau lumineux aux couleurs de la zone.
  nodes.push({
    id: `${zone.id}-sign`,
    kind: 'box',
    position: [cx, ROOM_HEIGHT - 0.15, doorZ + (zone.doorSide === 'south' ? 0.12 : -0.12)],
    size: [DOOR_WIDTH + 0.6, 0.18, 0.06],
    material: { color: zone.accent, emissive: zone.accent, emissiveIntensity: 1.4, roughness: 0.4 },
    interactive: { kind: 'sign', targetId: zone.id, label: zone.name, description: zone.purpose },
    static: true,
  });

  colliders.push(
    {
      id: `${zone.id}-c-back`,
      min: [cx - halfW, 0, backZ - 0.2],
      max: [cx + halfW, ROOM_HEIGHT, backZ + 0.2],
    },
    {
      id: `${zone.id}-c-left`,
      min: [cx - halfW - 0.2, 0, cz - halfD],
      max: [cx - halfW + 0.2, ROOM_HEIGHT, cz + halfD],
    },
    {
      id: `${zone.id}-c-right`,
      min: [cx + halfW - 0.2, 0, cz - halfD],
      max: [cx + halfW + 0.2, ROOM_HEIGHT, cz + halfD],
    },
    {
      id: `${zone.id}-c-front-a`,
      min: [cx - halfW, 0, doorZ - 0.2],
      max: [cx - DOOR_WIDTH / 2, ROOM_HEIGHT, doorZ + 0.2],
    },
    {
      id: `${zone.id}-c-front-b`,
      min: [cx + DOOR_WIDTH / 2, 0, doorZ - 0.2],
      max: [cx + halfW, ROOM_HEIGHT, doorZ + 0.2],
    },
  );

  return { nodes, colliders };
}

export interface CampusSceneOptions {
  /** Zones a mettre en evidence, par exemple celle de la mission en cours. */
  highlightZoneIds?: readonly string[];
}

/** Assemble le campus complet : couloir, pieces, eclairage, collisions, ancres. */
export function buildCampusScene(options: CampusSceneOptions = {}): Scene3D {
  const nodes: Scene3DNode[] = [];
  const colliders: Collider[] = [];
  const anchors: Scene3D['anchors'] = [];

  const corridorLength = 46;
  nodes.push({
    id: 'corridor-floor',
    kind: 'box',
    position: [0, -0.05, 0],
    size: [corridorLength, 0.1, CORRIDOR_HALF * 2],
    material: MATERIALS.corridor as MaterialSpec,
    static: true,
  });
  nodes.push({
    id: 'corridor-ceiling',
    kind: 'box',
    position: [0, ROOM_HEIGHT, 0],
    size: [corridorLength, 0.1, CORRIDOR_HALF * 2],
    material: MATERIALS.ceiling as MaterialSpec,
    static: true,
  });
  nodes.push(
    wall(
      'corridor-end-west',
      [-corridorLength / 2, ROOM_HEIGHT / 2, 0],
      [0.2, ROOM_HEIGHT, CORRIDOR_HALF * 2],
    ),
  );
  nodes.push(
    wall(
      'corridor-end-east',
      [corridorLength / 2, ROOM_HEIGHT / 2, 0],
      [0.2, ROOM_HEIGHT, CORRIDOR_HALF * 2],
    ),
  );
  colliders.push(
    {
      id: 'c-west',
      min: [-corridorLength / 2 - 0.2, 0, -CORRIDOR_HALF],
      max: [-corridorLength / 2 + 0.2, ROOM_HEIGHT, CORRIDOR_HALF],
    },
    {
      id: 'c-east',
      min: [corridorLength / 2 - 0.2, 0, -CORRIDOR_HALF],
      max: [corridorLength / 2 + 0.2, ROOM_HEIGHT, CORRIDOR_HALF],
    },
  );

  // Bandeau lumineux du couloir : repere directionnel, pas simple decor.
  for (let i = -5; i <= 5; i += 1) {
    nodes.push({
      id: `corridor-light-${i}`,
      kind: 'box',
      position: [i * 4, ROOM_HEIGHT - 0.12, 0],
      size: [2.4, 0.06, 0.18],
      material: {
        color: [0.5, 0.8, 1],
        emissive: [0.35, 0.7, 0.95],
        emissiveIntensity: 1.2,
        roughness: 0.4,
      },
      static: true,
    });
  }

  for (const zone of CAMPUS_ZONES) {
    const built = room(zone);
    nodes.push(...built.nodes);
    colliders.push(...built.colliders);
    anchors.push({
      id: `anchor-${zone.id}`,
      label: zone.name,
      position: [
        zone.center[0],
        ROOM_HEIGHT - 0.45,
        zone.center[2] + (zone.doorSide === 'south' ? 3.2 : -3.2),
      ],
      targetId: zone.id,
    });
  }

  const highlight = new Set(options.highlightZoneIds ?? []);
  for (const node of nodes) {
    if (node.interactive?.kind === 'sign' && highlight.has(node.interactive.targetId)) {
      node.material = { ...node.material, emissiveIntensity: 3 };
    }
  }

  return {
    id: 'campus-neo-systems',
    background: [0.02, 0.03, 0.045],
    fog: { color: [0.02, 0.03, 0.045], near: 18, far: 58 },
    nodes,
    lights: [
      // Eclairage sobre : un local technique n est pas un studio.
      { kind: 'hemisphere', color: [0.32, 0.4, 0.55], intensity: 0.42 },
      { kind: 'directional', color: [0.85, 0.88, 0.95], intensity: 0.55, position: [12, 14, 8] },
      { kind: 'point', color: [0.45, 0.72, 1], intensity: 6, position: [-12, 2.9, 0], range: 14 },
      { kind: 'point', color: [0.45, 0.72, 1], intensity: 6, position: [12, 2.9, 0], range: 14 },
    ],
    colliders,
    anchors,
  };
}

/** Point d apparition : ouest du couloir, regard vers l est, pour voir l enfilade. */
export const CAMPUS_SPAWN: Vec3 = [-12, 1.6, 0];

/** Orientation initiale : le couloir se deploie selon l axe des abscisses. */
export const CAMPUS_SPAWN_YAW = Math.PI / 2;

export function zoneById(id: string): CampusZone | undefined {
  return CAMPUS_ZONES.find((zone) => zone.id === id);
}

/** Position d observation d une zone, utilisee par la camera d inspection. */
export function zoneViewpoint(zone: CampusZone): { position: Vec3; target: Vec3 } {
  const offset = zone.doorSide === 'south' ? 1 : -1;
  return {
    position: [zone.center[0], 1.7, zone.center[2] + offset * 6.2],
    target: [zone.center[0], 1.4, zone.center[2]],
  };
}
