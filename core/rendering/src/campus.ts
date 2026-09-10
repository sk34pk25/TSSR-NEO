import {
  baieInformatique,
  bloc,
  compacter,
  boite,
  canape,
  comptoir,
  etagere,
  fusionner,
  panneauMural,
  plante,
  postesDeTravail,
  table,
  vide,
  type Piece,
} from './kit.ts';
import { MATERIALS, teinte } from './materials.ts';
import type { Collider, MaterialSpec, Scene3D, Scene3DNode, Vec3 } from './scene3d.ts';

/**
 * Campus NEO Systems, version 2.
 *
 * La version precedente decrivait neuf salles rigoureusement identiques de huit
 * metres sur huit, distinguees par la seule couleur d un bandeau lumineux, dans
 * une palette entierement froide, et sans un seul objet de mobilier : cent cinq
 * noeuds, tous de gros oeuvre. C etait un blockout, c est-a-dire l etape qui
 * precede normalement la construction du decor.
 *
 * Cette version decrit un batiment tertiaire ordinaire : des pieces de tailles
 * differentes, meublees selon ce qu on y fait, eclairees en blanc chaud, avec
 * des fenetres donnant sur un exterieur reel. La repetition passe par les
 * instances, donc un batiment reellement meuble ne coute pas plus d appels de
 * rendu qu un batiment vide.
 */

export type CampusRoute =
  | 'tickets'
  | 'supervision'
  | 'laboratoire'
  | 'mission'
  | 'parcours';

/** Ce que la piece est, avant ce qu elle sert : cela decide sols et lumiere. */
export type Ambiance = 'accueil' | 'bureau' | 'technique' | 'atelier' | 'detente' | 'etude';

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
  ambiance: Ambiance;
}

const ROOM_HEIGHT = 3.2;
const CORRIDOR_HALF = 2.4;
const DOOR_WIDTH = 2.2;
const DOOR_HEIGHT = 2.35;
const THICKNESS = 0.22;

/** Profondeur de la piece selon le cote du couloir ou elle se trouve. */
function centerZ(doorSide: 'north' | 'south', depth: number): number {
  return doorSide === 'south'
    ? -CORRIDOR_HALF - depth / 2
    : CORRIDOR_HALF + depth / 2;
}

export const CAMPUS_ZONES: CampusZone[] = [
  {
    id: 'reception',
    name: 'Accueil',
    purpose: 'Reception des demandes utilisateurs, qualification et priorisation.',
    route: 'tickets',
    center: [-17, 0, centerZ('south', 9)],
    size: [10, 9],
    doorSide: 'south',
    accent: [0.25, 0.7, 0.95],
    ambiance: 'accueil',
  },
  {
    id: 'offices',
    name: 'Bureaux',
    purpose: 'Postes des utilisateurs : c est ici que les incidents sont vecus.',
    route: 'tickets',
    center: [-7, 0, centerZ('south', 8)],
    size: [9, 8],
    doorSide: 'south',
    accent: [0.55, 0.6, 0.9],
    ambiance: 'bureau',
  },
  {
    id: 'command-center',
    name: 'Centre de commandement',
    purpose: 'Supervision des equipements et des services, alertes en cours.',
    route: 'supervision',
    center: [2, 0, centerZ('south', 8)],
    size: [9, 8],
    doorSide: 'south',
    accent: [0.95, 0.7, 0.3],
    ambiance: 'bureau',
  },
  {
    id: 'knowledge',
    name: 'NEO Knowledge',
    purpose: 'Fiches de connaissances, revisions courtes, graphe de competences.',
    route: 'parcours',
    center: [11, 0, centerZ('south', 8)],
    size: [8, 8],
    doorSide: 'south',
    accent: [0.4, 0.85, 0.6],
    ambiance: 'etude',
  },
  {
    id: 'personal-space',
    name: 'Espace personnel',
    purpose: 'Progression, competences suivies, badges et parametres.',
    route: 'parcours',
    center: [19, 0, centerZ('south', 7)],
    size: [7, 7],
    doorSide: 'south',
    accent: [0.7, 0.5, 0.95],
    ambiance: 'detente',
  },
  {
    id: 'network-room',
    name: 'Salle reseau',
    purpose: 'Commutateurs, brassage physique, VLAN et plan d adressage.',
    route: 'laboratoire',
    center: [-17, 0, centerZ('north', 7)],
    size: [9, 7],
    doorSide: 'north',
    accent: [0.25, 0.8, 0.85],
    ambiance: 'technique',
  },
  {
    id: 'datacenter',
    name: 'Datacenter',
    purpose: 'Baies de production : serveurs, alimentation, refroidissement.',
    route: 'laboratoire',
    center: [-6, 0, centerZ('north', 10)],
    size: [11, 10],
    doorSide: 'north',
    accent: [0.3, 0.65, 1],
    ambiance: 'technique',
  },
  {
    id: 'training-lab',
    name: 'NEO Training Lab',
    purpose: 'Missions scenarisees et diagnostic guide.',
    route: 'mission',
    center: [5, 0, centerZ('north', 9)],
    size: [10, 9],
    doorSide: 'north',
    accent: [0.95, 0.45, 0.55],
    ambiance: 'atelier',
  },
  {
    id: 'lab-builder',
    name: 'NEO Lab Builder',
    purpose: 'Laboratoire libre : construire, casser, observer, recommencer.',
    route: 'laboratoire',
    center: [15, 0, centerZ('north', 8)],
    size: [9, 8],
    doorSide: 'north',
    accent: [0.55, 0.85, 0.4],
    ambiance: 'atelier',
  },
];

/**
 * Chaque ambiance a son sol, son mur d accent et sa lumiere.
 *
 * C est ce qui rend une piece reconnaissable avant d avoir lu son etiquette :
 * un local technique n a pas de moquette, une salle de detente n a pas de dalle
 * antistatique, et l eclairage d un atelier n est pas celui d un salon.
 */
const AMBIANCES: Record<
  Ambiance,
  {
    sol: MaterialSpec;
    murAccent: MaterialSpec;
    lumiere: Vec3;
    intensite: number;
    /** Une piece technique reste plus froide : c est vrai, pas decoratif. */
    hauteurLuminaire: number;
  }
> = {
  accueil: {
    sol: MATERIALS.carrelageHall,
    murAccent: MATERIALS.murAccentChaud,
    lumiere: [1, 0.93, 0.82],
    intensite: 9,
    hauteurLuminaire: 2.95,
  },
  bureau: {
    sol: MATERIALS.moquetteBureau,
    murAccent: MATERIALS.murAccentBleu,
    lumiere: [1, 0.96, 0.9],
    intensite: 8,
    hauteurLuminaire: 2.9,
  },
  etude: {
    sol: MATERIALS.parquet,
    murAccent: MATERIALS.murAccentVert,
    lumiere: [1, 0.92, 0.8],
    intensite: 8,
    hauteurLuminaire: 2.85,
  },
  detente: {
    sol: MATERIALS.moquetteChaude,
    murAccent: MATERIALS.murAccentChaud,
    lumiere: [1, 0.9, 0.76],
    intensite: 7,
    hauteurLuminaire: 2.8,
  },
  technique: {
    sol: MATERIALS.dalleAntistatique,
    murAccent: MATERIALS.betonTechnique,
    lumiere: [0.9, 0.95, 1],
    intensite: 9,
    hauteurLuminaire: 3,
  },
  atelier: {
    sol: MATERIALS.solTechnique,
    murAccent: MATERIALS.murAccentVert,
    lumiere: [1, 0.97, 0.92],
    intensite: 9,
    hauteurLuminaire: 2.95,
  },
};

/** Mur plein. */
function mur(id: string, position: Vec3, size: Vec3, material = MATERIALS.murClair): Scene3DNode {
  return boite(id, position, size, material);
}

const ALLEGE = 0.95;
const HAUT_BAIE = 2.45;

/**
 * Mur exterieur reellement perce de baies.
 *
 * La version precedente posait un vitrage a l interieur d un mur plein reste
 * entier : les deux surfaces se disputaient la meme profondeur, ce qui donnait
 * des rayures, et surtout on ne voyait rien dehors. Le mur est desormais
 * construit en morceaux autour des ouvertures, comme un vrai mur.
 */
function murPerce(
  prefixe: string,
  centre: Vec3,
  longueur: number,
  axe: 'x' | 'z',
  ouvertures: readonly { centre: number; largeur: number }[],
  material: MaterialSpec,
): Scene3DNode[] {
  const nodes: Scene3DNode[] = [];
  const le = axe === 'x' ? 0 : 2;

  /** Pose un morceau de mur, exprime en coordonnee le long du mur. */
  const morceau = (
    id: string,
    debut: number,
    fin: number,
    bas: number,
    haut: number,
    mat: MaterialSpec,
    epaisseur = THICKNESS,
  ): void => {
    if (fin - debut < 0.01 || haut - bas < 0.01) return;
    const milieu = (debut + fin) / 2;
    const position: Vec3 =
      le === 0
        ? [centre[0] + milieu, (bas + haut) / 2, centre[2]]
        : [centre[0], (bas + haut) / 2, centre[2] + milieu];
    const size: Vec3 =
      le === 0 ? [fin - debut, haut - bas, epaisseur] : [epaisseur, haut - bas, fin - debut];
    nodes.push(boite(id, position, size, mat));
  };

  const triees = [...ouvertures].sort((a, b) => a.centre - b.centre);
  let curseur = -longueur / 2;
  triees.forEach((ouverture, index) => {
    const gauche = ouverture.centre - ouverture.largeur / 2;
    const droite = ouverture.centre + ouverture.largeur / 2;
    morceau(`${prefixe}-trumeau-${index}`, curseur, gauche, 0, ROOM_HEIGHT, material);
    morceau(`${prefixe}-allege-${index}`, gauche, droite, 0, ALLEGE, material);
    morceau(`${prefixe}-linteau-${index}`, gauche, droite, HAUT_BAIE, ROOM_HEIGHT, material);
    // Le vitrage occupe l ouverture, jamais l epaisseur du mur.
    morceau(
      `${prefixe}-vitrage-${index}`,
      gauche,
      droite,
      ALLEGE,
      HAUT_BAIE,
      MATERIALS.vitrageExterieur,
      0.05,
    );
    morceau(
      `${prefixe}-appui-${index}`,
      gauche - 0.08,
      droite + 0.08,
      ALLEGE - 0.06,
      ALLEGE,
      MATERIALS.menuiserie,
      THICKNESS + 0.1,
    );
    morceau(
      `${prefixe}-traverse-${index}`,
      gauche - 0.08,
      droite + 0.08,
      HAUT_BAIE,
      HAUT_BAIE + 0.06,
      MATERIALS.menuiserie,
      THICKNESS + 0.04,
    );
    curseur = droite;
  });
  morceau(`${prefixe}-trumeau-fin`, curseur, longueur / 2, 0, ROOM_HEIGHT, material);
  return nodes;
}

/** Luminaire encastre : la source de lumiere chaude et son plafonnier visible. */
function luminaires(prefixe: string, positions: readonly Vec3[]): Scene3DNode[] {
  return positions.map((position, index) =>
    boite(
      `${prefixe}-luminaire-${index}`,
      position,
      [1.25, 0.06, 0.25],
      MATERIALS.luminaire,
    ),
  );
}

/** Enveloppe d une piece : sol, plafond, murs perces d une porte et de fenetres. */
function enveloppe(zone: CampusZone): Piece {
  const [cx, , cz] = zone.center;
  const [largeur, profondeur] = zone.size;
  const demiL = largeur / 2;
  const demiP = profondeur / 2;
  const ambiance = AMBIANCES[zone.ambiance];
  const nodes: Scene3DNode[] = [];
  const colliders: Collider[] = [];

  nodes.push({
    id: `${zone.id}-floor`,
    kind: 'box',
    position: [cx, -0.05, cz],
    size: [largeur, 0.1, profondeur],
    material: ambiance.sol,
    static: true,
    interactive: {
      kind: 'zone',
      targetId: zone.id,
      label: zone.name,
      description: zone.purpose,
    },
  });
  nodes.push(
    boite(
      `${zone.id}-ceiling`,
      [cx, ROOM_HEIGHT, cz],
      [largeur, 0.1, profondeur],
      MATERIALS.plafondAcoustique,
    ),
  );

  const zPorte = zone.doorSide === 'south' ? cz + demiP : cz - demiP;
  const zFond = zone.doorSide === 'south' ? cz - demiP : cz + demiP;

  // Mur exterieur : pan d accent reellement perce de deux baies.
  const largeurFenetre = Math.min(2.6, largeur / 3.4);
  nodes.push(
    ...murPerce(
      `${zone.id}-facade`,
      [cx, 0, zFond],
      largeur,
      'x',
      [
        { centre: -largeur / 4, largeur: largeurFenetre },
        { centre: largeur / 4, largeur: largeurFenetre },
      ],
      ambiance.murAccent,
    ),
  );

  for (const [cote, signe] of [
    ['left', -1],
    ['right', 1],
  ] as const) {
    nodes.push(
      mur(
        `${zone.id}-wall-${cote}`,
        [cx + signe * demiL, ROOM_HEIGHT / 2, cz],
        [THICKNESS, ROOM_HEIGHT, profondeur],
      ),
    );
    // Plinthe : le detail qui distingue un mur construit d une boite grise.
    nodes.push(
      boite(
        `${zone.id}-plinthe-${cote}`,
        [cx + signe * (demiL - 0.13), 0.06, cz],
        [0.03, 0.12, profondeur - 0.2],
        MATERIALS.plinthe,
      ),
    );
    colliders.push(
      bloc(`${zone.id}-col-${cote}`, [cx + signe * demiL, ROOM_HEIGHT / 2, cz], [
        THICKNESS,
        ROOM_HEIGHT,
        profondeur,
      ]),
    );
  }
  colliders.push(
    bloc(`${zone.id}-col-back`, [cx, ROOM_HEIGHT / 2, zFond], [largeur, ROOM_HEIGHT, THICKNESS]),
  );

  // Facade sur couloir : deux trumeaux vitres encadrant la porte, plus un linteau.
  const largeurTrumeau = (largeur - DOOR_WIDTH) / 2;
  for (const [cote, signe] of [
    ['a', -1],
    ['b', 1],
  ] as const) {
    const centreTrumeau = cx + signe * (DOOR_WIDTH / 2 + largeurTrumeau / 2);
    nodes.push(
      mur(
        `${zone.id}-pier-${cote}`,
        [centreTrumeau, ROOM_HEIGHT / 2, zPorte],
        [largeurTrumeau, ROOM_HEIGHT, THICKNESS],
      ),
    );
    // Imposte vitree : on voit ce qui se passe dans la piece depuis le couloir.
    nodes.push(
      boite(
        `${zone.id}-imposte-${cote}`,
        [centreTrumeau, 1.75, zPorte],
        [Math.max(0.4, largeurTrumeau - 0.7), 1.5, 0.05],
        MATERIALS.vitrageInterieur,
      ),
    );
    colliders.push(
      bloc(`${zone.id}-col-pier-${cote}`, [centreTrumeau, ROOM_HEIGHT / 2, zPorte], [
        largeurTrumeau,
        ROOM_HEIGHT,
        THICKNESS,
      ]),
    );
  }
  nodes.push(
    mur(
      `${zone.id}-lintel`,
      [cx, (ROOM_HEIGHT + DOOR_HEIGHT) / 2, zPorte],
      [DOOR_WIDTH, ROOM_HEIGHT - DOOR_HEIGHT, THICKNESS],
    ),
  );

  // Porte vitree : c est elle qu on clique pour entrer.
  nodes.push({
    id: `${zone.id}-door`,
    kind: 'box',
    position: [cx, DOOR_HEIGHT / 2, zPorte],
    size: [DOOR_WIDTH - 0.16, DOOR_HEIGHT, 0.06],
    material: MATERIALS.vitrageInterieur,
    static: true,
    interactive: {
      kind: 'door',
      targetId: zone.id,
      label: zone.name,
      description: zone.purpose,
    },
  });
  /*
   * Huisserie en trois morceaux, pas un bloc plein : un cadre modelise comme
   * une boite pleine recouvrait entierement le vitrage et transformait chaque
   * porte en rectangle sombre vu du couloir.
   */
  for (const [cote, signe] of [
    ['g', -1],
    ['d', 1],
  ] as const) {
    nodes.push(
      boite(
        `${zone.id}-jambage-${cote}`,
        [cx + signe * (DOOR_WIDTH / 2 - 0.04), DOOR_HEIGHT / 2, zPorte],
        [0.08, DOOR_HEIGHT, 0.11],
        MATERIALS.menuiserie,
      ),
    );
  }
  nodes.push(
    boite(
      `${zone.id}-traverse-porte`,
      [cx, DOOR_HEIGHT + 0.04, zPorte],
      [DOOR_WIDTH, 0.08, 0.11],
      MATERIALS.menuiserie,
    ),
  );
  nodes.push(
    boite(
      `${zone.id}-poignee`,
      [cx + DOOR_WIDTH / 2 - 0.3, 1.05, zPorte + (zone.doorSide === 'south' ? 0.06 : -0.06)],
      [0.05, 0.05, 0.16],
      MATERIALS.metalBrosse,
    ),
  );

  // Signaletique au-dessus de la porte, dans la couleur de la zone.
  /*
   * Signaletique de porte : un panneau imprime clair et un filet de couleur.
   * La version precedente etait un bandeau emissif pleine couleur ; a trois
   * metres il saturait le champ de vision et ramenait l ambiance de science
   * fiction qu on cherche a quitter.
   */
  const zSign = zPorte + (zone.doorSide === 'south' ? 0.16 : -0.16);
  nodes.push({
    id: `${zone.id}-sign`,
    kind: 'box',
    position: [cx, DOOR_HEIGHT + 0.3, zSign],
    size: [DOOR_WIDTH * 0.78, 0.3, 0.04],
    material: MATERIALS.stratifieBlanc,
    static: true,
    interactive: {
      kind: 'sign',
      targetId: zone.id,
      label: zone.name,
      description: zone.purpose,
    },
  });
  nodes.push(
    boite(
      `${zone.id}-sign-filet`,
      [cx, DOOR_HEIGHT + 0.16, zSign + (zone.doorSide === 'south' ? 0.01 : -0.01)],
      [DOOR_WIDTH * 0.78, 0.05, 0.04],
      { color: zone.accent, emissive: zone.accent, emissiveIntensity: 0.12, roughness: 0.6 },
    ),
  );

  // Luminaires repartis selon la surface, pas un plafonnier unique.
  const rangees = Math.max(2, Math.round(profondeur / 3.2));
  const colonnes = Math.max(2, Math.round(largeur / 3.4));
  const positions: Vec3[] = [];
  for (let r = 0; r < rangees; r += 1) {
    for (let c = 0; c < colonnes; c += 1) {
      positions.push([
        cx - demiL + ((c + 0.5) * largeur) / colonnes,
        ROOM_HEIGHT - 0.12,
        cz - demiP + ((r + 0.5) * profondeur) / rangees,
      ]);
    }
  }
  nodes.push(...luminaires(zone.id, positions));

  return { nodes, colliders };
}

/**
 * Amenagement propre a chaque zone.
 *
 * C est le coeur du probleme corrige ici : neuf volumes identiques et vides ne
 * deviennent neuf lieux distincts que par ce qu on y trouve.
 */
function amenagement(zone: CampusZone): Piece {
  const [cx, , cz] = zone.center;
  const [largeur, profondeur] = zone.size;
  const versCouloir = zone.doorSide === 'south' ? 1 : -1;
  const fond = cz - versCouloir * (profondeur / 2 - 1.4);
  const gauche = cx - largeur / 2;
  const droite = cx + largeur / 2;

  switch (zone.id) {
    case 'reception':
      return fusionner(
        comptoir(`${zone.id}-banque`, [cx - 1.4, 0, fond + versCouloir * 0.6], 3.4, 0),
        canape(`${zone.id}-banquette`, [droite - 2.2, 0, cz + versCouloir * 0.6], 2.2, Math.PI / 2),
        table(`${zone.id}-basse`, [droite - 3.6, 0, cz + versCouloir * 0.6], [0.9, 0.42, 0.9]),
        plante(`${zone.id}-vert`, [
          [gauche + 0.9, 0, cz - versCouloir * 1.2],
          [gauche + 0.9, 0, cz + versCouloir * 2.4],
          [droite - 0.9, 0, fond + versCouloir * 0.9],
        ]),
        panneauMural(
          `${zone.id}-signaletique`,
          [gauche + 0.2, 1.85, cz],
          [0.04, 1.1, 2.4],
          0,
          MATERIALS.stratifieBlanc,
        ),
      );

    case 'offices': {
      const postes = [];
      for (let rangee = 0; rangee < 2; rangee += 1) {
        for (let poste = 0; poste < 3; poste += 1) {
          postes.push({
            position: [gauche + 1.9 + poste * 2.4, 0, fond + versCouloir * (0.6 + rangee * 3.1)] as Vec3,
            yaw: rangee === 0 ? 0 : Math.PI,
          });
        }
      }
      return fusionner(
        postesDeTravail(`${zone.id}-poste`, postes),
        plante(`${zone.id}-vert`, [
          [droite - 0.9, 0, fond + versCouloir * 0.8],
          [droite - 0.9, 0, cz + versCouloir * 2.4],
        ]),
        etagere(`${zone.id}-rangement`, [gauche + 0.7, 0, cz + versCouloir * 2.2], 1.6, Math.PI / 2),
      );
    }

    case 'command-center': {
      // Une supervision, c est un mur d ecrans et une rangee de postes en face.
      const postes = [0, 1, 2, 3].map((index) => ({
        position: [gauche + 1.8 + index * 1.9, 0, cz + versCouloir * 1.6] as Vec3,
        yaw: zone.doorSide === 'south' ? 0 : Math.PI,
      }));
      const ecrans: Piece = { nodes: [], colliders: [] };
      for (let index = 0; index < 3; index += 1) {
        const p = panneauMural(
          `${zone.id}-ecran-${index}`,
          [gauche + 2.2 + index * 2.4, 1.95, fond + versCouloir * 0.5],
          [2, 1.1, 0.05],
          0,
          MATERIALS.ecranAllume,
        );
        ecrans.nodes.push(...p.nodes);
      }
      return fusionner(
        ecrans,
        postesDeTravail(`${zone.id}-poste`, postes),
        plante(`${zone.id}-vert`, [[droite - 0.9, 0, cz + versCouloir * 2.6]]),
      );
    }

    case 'knowledge': {
      const rayonnages: Piece[] = [];
      for (let index = 0; index < 3; index += 1) {
        rayonnages.push(
          etagere(
            `${zone.id}-rayon-${index}`,
            [gauche + 0.7, 0, fond + versCouloir * (0.9 + index * 2.1)],
            1.8,
            Math.PI / 2,
          ),
        );
        rayonnages.push(
          etagere(
            `${zone.id}-rayon-d-${index}`,
            [droite - 0.7, 0, fond + versCouloir * (0.9 + index * 2.1)],
            1.8,
            -Math.PI / 2,
          ),
        );
      }
      return fusionner(
        ...rayonnages,
        table(`${zone.id}-lecture`, [cx, 0, cz + versCouloir * 0.4], [2.4, 0.74, 1.1]),
        plante(`${zone.id}-vert`, [[cx - 2.4, 0, cz + versCouloir * 2.6]]),
      );
    }

    case 'personal-space':
      return fusionner(
        canape(`${zone.id}-canape`, [cx, 0, fond + versCouloir * 0.9], 2.2, zone.doorSide === 'south' ? 0 : Math.PI),
        table(`${zone.id}-basse`, [cx, 0, fond + versCouloir * 2.3], [1.1, 0.42, 0.7]),
        etagere(`${zone.id}-etagere`, [gauche + 0.7, 0, cz], 1.6, Math.PI / 2),
        plante(`${zone.id}-vert`, [
          [droite - 0.9, 0, fond + versCouloir * 1.2],
          [droite - 0.9, 0, cz + versCouloir * 2],
        ]),
      );

    case 'network-room':
      return fusionner(
        baieInformatique(`${zone.id}-baie`, [
          { position: [gauche + 1.4, 0, fond + versCouloir * 0.9], yaw: 0, unitesOccupees: 8 },
          { position: [gauche + 2.6, 0, fond + versCouloir * 0.9], yaw: 0, unitesOccupees: 5 },
        ]),
        panneauMural(
          `${zone.id}-brassage`,
          [droite - 0.2, 1.7, cz],
          [0.05, 1.3, 2.6],
          0,
          MATERIALS.panneauBrassage,
        ),
        table(`${zone.id}-etabli`, [cx + 1.4, 0, cz + versCouloir * 1.4], [2.2, 0.9, 0.8]),
      );

    case 'datacenter': {
      // Deux allees de baies : c est la forme meme d une salle machine.
      const baies = [];
      for (let allee = 0; allee < 2; allee += 1) {
        for (let index = 0; index < 4; index += 1) {
          baies.push({
            position: [gauche + 2 + index * 1.15, 0, fond + versCouloir * (1.2 + allee * 4.2)] as Vec3,
            yaw: allee === 0 ? 0 : Math.PI,
            unitesOccupees: 6 + ((index + allee) % 5),
          });
        }
      }
      return fusionner(
        baieInformatique(`${zone.id}-baie`, baies),
        panneauMural(
          `${zone.id}-tableau`,
          [droite - 0.2, 1.7, cz],
          [0.05, 1, 1.6],
          0,
          MATERIALS.metalBrosse,
        ),
      );
    }

    case 'training-lab': {
      // Disposition en U autour d un tableau : une salle de formation.
      const postes = [
        { position: [gauche + 2, 0, fond + versCouloir * 2.2] as Vec3, yaw: Math.PI / 2 },
        { position: [gauche + 2, 0, fond + versCouloir * 4.4] as Vec3, yaw: Math.PI / 2 },
        { position: [droite - 2, 0, fond + versCouloir * 2.2] as Vec3, yaw: -Math.PI / 2 },
        { position: [droite - 2, 0, fond + versCouloir * 4.4] as Vec3, yaw: -Math.PI / 2 },
      ];
      return fusionner(
        postesDeTravail(`${zone.id}-poste`, postes),
        panneauMural(
          `${zone.id}-tableau`,
          [gauche + 0.18, 1.75, cz - versCouloir * 0.6],
          [0.05, 1.4, 3.2],
          0,
          MATERIALS.stratifieBlanc,
        ),
        baieInformatique(`${zone.id}-baie`, [
          { position: [cx + 2.6, 0, fond + versCouloir * 0.9], yaw: 0, unitesOccupees: 4 },
        ]),
        plante(`${zone.id}-vert`, [[gauche + 0.9, 0, cz + versCouloir * 3]]),
      );
    }

    case 'lab-builder':
      return fusionner(
        table(`${zone.id}-etabli-a`, [cx - 1.6, 0, cz], [3, 0.9, 1.1]),
        table(`${zone.id}-etabli-b`, [cx + 2, 0, cz + versCouloir * 1.8], [2.2, 0.9, 0.9]),
        etagere(`${zone.id}-stock-a`, [gauche + 0.7, 0, fond + versCouloir * 1.4], 1.8, Math.PI / 2),
        etagere(`${zone.id}-stock-b`, [gauche + 0.7, 0, fond + versCouloir * 3.6], 1.8, Math.PI / 2),
        baieInformatique(`${zone.id}-baie`, [
          { position: [droite - 1.2, 0, fond + versCouloir * 1.1], yaw: 0, unitesOccupees: 3 },
        ]),
        plante(`${zone.id}-vert`, [[droite - 1, 0, cz + versCouloir * 2.6]]),
      );

    default:
      return vide();
  }
}


/**
 * Points d interaction poses sur le mobilier.
 *
 * Le mobilier est instancie, donc un objet parmi dix ne peut pas etre designe
 * individuellement. On emet donc, pour les seuls objets manipulables, un noeud
 * dedie qui epouse une piece de l objet : l ecran d un poste, la porte d une
 * baie. Il est visible, il fait partie du meuble, et il est designable.
 */
function pointsDInteraction(zone: CampusZone): Scene3DNode[] {
  const nodes: Scene3DNode[] = [];
  const [cx, , cz] = zone.center;
  const [largeur, profondeur] = zone.size;
  const versCouloir = zone.doorSide === 'south' ? 1 : -1;
  const fond = cz - versCouloir * (profondeur / 2 - 1.4);
  const gauche = cx - largeur / 2;

  /** Ecran d un poste de travail, designable et utilisable. */
  const poste = (id: string, position: Vec3, yaw: number, libelle: string): void => {
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const decalage: Vec3 = [-0.05, 1.06, -0.22];
    nodes.push({
      id,
      kind: 'box',
      position: [
        position[0] + decalage[0] * c + decalage[2] * sn,
        decalage[1],
        position[2] - decalage[0] * sn + decalage[2] * c,
      ],
      rotation: [0, yaw, 0],
      size: [0.58, 0.36, 0.03],
      material: MATERIALS.ecranAllume,
      static: true,
      interactive: {
        kind: 'workstation',
        targetId: zone.id,
        label: libelle,
        description: 'Ouvre un terminal sur une machine reelle de l infrastructure simulee.',
        verbe: 'Utiliser',
      },
    });
  };

  /** Porte d une baie, designable et ouvrable. */
  const baie = (id: string, position: Vec3, libelle: string): void => {
    nodes.push({
      id,
      kind: 'box',
      position: [position[0], 1.05, position[2] + 0.52],
      size: [0.64, 1.96, 0.04],
      material: MATERIALS.vitrageInterieur,
      static: true,
      interactive: {
        kind: 'rack',
        targetId: zone.id,
        label: libelle,
        description: 'Montre les equipements montes, leurs ports et leurs temoins reels.',
        verbe: 'Ouvrir',
      },
    });
  };

  switch (zone.id) {
    case 'offices':
      // Rangee la plus proche de la porte : on la rencontre en entrant.
      poste(
        `${zone.id}-poste-interactif`,
        [gauche + 1.9, 0, fond + versCouloir * 3.7],
        Math.PI,
        'Poste utilisateur',
      );
      poste(
        `${zone.id}-poste-interactif-b`,
        [gauche + 4.3, 0, fond + versCouloir * 3.7],
        Math.PI,
        'Poste utilisateur',
      );
      break;
    case 'command-center':
      poste(
        `${zone.id}-poste-interactif`,
        [gauche + 1.8, 0, cz + versCouloir * 1.6],
        zone.doorSide === 'south' ? 0 : Math.PI,
        'Console de supervision',
      );
      break;
    case 'training-lab':
      poste(
        `${zone.id}-poste-interactif`,
        [gauche + 2, 0, fond + versCouloir * 4.4],
        Math.PI / 2,
        'Poste de formation',
      );
      poste(
        `${zone.id}-poste-interactif-b`,
        [cx + largeur / 2 - 2, 0, fond + versCouloir * 4.4],
        -Math.PI / 2,
        'Poste de formation',
      );
      baie(`${zone.id}-baie-interactive`, [cx + 2.6, 0, fond + versCouloir * 0.9], 'Baie du laboratoire');
      break;
    case 'network-room':
      baie(`${zone.id}-baie-interactive`, [gauche + 1.4, 0, fond + versCouloir * 0.9], 'Baie de brassage');
      break;
    case 'datacenter':
      baie(`${zone.id}-baie-interactive`, [gauche + 2, 0, fond + versCouloir * 1.2], 'Baie de production');
      break;
    case 'lab-builder':
      baie(
        `${zone.id}-baie-interactive`,
        [cx + largeur / 2 - 1.2, 0, fond + versCouloir * 1.1],
        'Baie du laboratoire libre',
      );
      break;
    default:
      break;
  }
  return nodes;
}

/** Couloir de distribution, avec son sol, son plafond et son mobilier d attente. */
function couloir(minX: number, maxX: number): Piece {
  const largeur = maxX - minX;
  const centre = (minX + maxX) / 2;
  const nodes: Scene3DNode[] = [
    boite(
      'corridor-floor',
      [centre, -0.05, 0],
      [largeur, 0.1, CORRIDOR_HALF * 2],
      MATERIALS.moquetteChaude,
    ),
    boite(
      'corridor-ceiling',
      [centre, ROOM_HEIGHT, 0],
      [largeur, 0.1, CORRIDOR_HALF * 2],
      MATERIALS.plafondAcoustique,
    ),
  ];
  const colliders: Collider[] = [];

  // Pignons : au lieu d un mur noir, une baie vitree qui donne sur l exterieur.
  for (const [nom, x] of [
    ['ouest', minX],
    ['est', maxX],
  ] as const) {
    nodes.push(
      ...murPerce(
        `corridor-pignon-${nom}`,
        [x, 0, 0],
        CORRIDOR_HALF * 2,
        'z',
        [{ centre: 0, largeur: CORRIDOR_HALF * 1.55 }],
        MATERIALS.murClair,
      ),
    );
    colliders.push(
      bloc(`corridor-col-${nom}`, [x, ROOM_HEIGHT / 2, 0], [THICKNESS, ROOM_HEIGHT, CORRIDOR_HALF * 2]),
    );
  }

  // Bandeau lumineux continu, blanc chaud, plus deux rangees de spots.
  const spots: Vec3[] = [];
  for (let x = minX + 2.5; x < maxX; x += 3.2) {
    spots.push([x, ROOM_HEIGHT - 0.12, -1.1]);
    spots.push([x, ROOM_HEIGHT - 0.12, 1.1]);
  }
  nodes.push(...luminaires('corridor', spots));

  const mobilier = fusionner(
    plante('corridor-vert', [
      [minX + 1.2, 0, -CORRIDOR_HALF + 0.7],
      [minX + 1.2, 0, CORRIDOR_HALF - 0.7],
      [maxX - 1.2, 0, CORRIDOR_HALF - 0.7],
    ]),
    canape('corridor-banc', [minX + 3.4, 0, -CORRIDOR_HALF + 0.6], 1.6, 0),
  );

  return {
    nodes: [...nodes, ...mobilier.nodes],
    colliders: [...colliders, ...mobilier.colliders],
  };
}

/**
 * Monde exterieur.
 *
 * Sans lui, le regard tombe dans le noir des qu il franchit une ouverture et le
 * batiment se lit comme une maquette flottante. Un sol, une pelouse et une ligne
 * d horizon suffisent a ancrer les fenetres dans quelque chose.
 */
function exterieur(minX: number, maxX: number, profondeurMax: number): Scene3DNode[] {
  const centre = (minX + maxX) / 2;
  const etendue = (maxX - minX) * 3.4;
  const nodes: Scene3DNode[] = [
    boite('exterieur-sol', [centre, -0.35, 0], [etendue, 0.4, etendue], MATERIALS.pelouse),
    boite(
      'exterieur-parvis',
      [centre, -0.28, -profondeurMax - 13],
      [etendue * 0.4, 0.4, 16],
      MATERIALS.bitume,
    ),
  ];

  /*
   * Batiments voisins : des volumes simples, mais assez loin pour donner une
   * echelle sans obstruer les baies. Trop proches, ils remplissaient chaque
   * fenetre d une masse grise et annulaient l ouverture.
   */
  const voisins: { position: Vec3; size: Vec3; facteur: number }[] = [
    { position: [minX - 46, 7, -profondeurMax - 42], size: [18, 14, 14], facteur: 0.78 },
    { position: [maxX + 44, 5.5, profondeurMax + 38], size: [16, 11, 16], facteur: 0.72 },
    { position: [centre - 10, 9, -profondeurMax - 78], size: [30, 18, 14], facteur: 0.68 },
    { position: [centre + 22, 6, profondeurMax + 66], size: [22, 12, 16], facteur: 0.74 },
  ];
  for (const [index, voisin] of voisins.entries()) {
    nodes.push(
      boite(
        `exterieur-voisin-${index}`,
        voisin.position,
        voisin.size,
        teinte(MATERIALS.murClair, voisin.facteur),
      ),
    );
  }

  // Quelques arbres : sans eux la pelouse reste une nappe verte uniforme.
  const arbres = plante('exterieur-arbre', [
    [minX - 6, 0, -profondeurMax - 6],
    [maxX + 6, 0, -profondeurMax - 8],
    [minX - 8, 0, profondeurMax + 7],
    [maxX + 9, 0, profondeurMax + 5],
    [centre - 12, 0, -profondeurMax - 12],
  ]);
  // A cette echelle les arbres sont des volumes lointains : pas d obstacle.
  for (const node of arbres.nodes) {
    const matrices = node.instances;
    if (matrices) {
      for (let index = 0; index < matrices.length; index += 16) {
        matrices[index] = (matrices[index] ?? 1) * 3.4;
        matrices[index + 5] = (matrices[index + 5] ?? 1) * 3.4;
        matrices[index + 10] = (matrices[index + 10] ?? 1) * 3.4;
      }
    }
  }
  nodes.push(...arbres.nodes);

  return nodes;
}

export interface CampusOptions {
  highlightZoneIds?: readonly string[];
}

export function buildCampusScene(options: CampusOptions = {}): Scene3D {
  const nodes: Scene3DNode[] = [];
  const colliders: Collider[] = [];
  const anchors: Scene3D['anchors'] = [];

  const minX = Math.min(...CAMPUS_ZONES.map((zone) => zone.center[0] - zone.size[0] / 2)) - 1;
  const maxX = Math.max(...CAMPUS_ZONES.map((zone) => zone.center[0] + zone.size[0] / 2)) + 1;
  const profondeurMax = Math.max(
    ...CAMPUS_ZONES.map((zone) => Math.abs(zone.center[2]) + zone.size[1] / 2),
  );

  nodes.push(...exterieur(minX, maxX, profondeurMax));

  const distribution = couloir(minX, maxX);
  nodes.push(...distribution.nodes);
  colliders.push(...distribution.colliders);

  for (const zone of CAMPUS_ZONES) {
    const coque = enveloppe(zone);
    const meubles = amenagement(zone);
    nodes.push(...coque.nodes, ...meubles.nodes, ...pointsDInteraction(zone));
    colliders.push(...coque.colliders, ...meubles.colliders);

    anchors.push({
      id: `anchor-${zone.id}`,
      label: zone.name,
      position: [
        zone.center[0],
        DOOR_HEIGHT + 0.32,
        zone.center[2] +
          (zone.doorSide === 'south' ? zone.size[1] / 2 + 0.2 : -zone.size[1] / 2 - 0.2),
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

  /*
   * Les plafonds sont escamotes par la vue d ensemble : ils doivent rester
   * designables un par un, donc ils echappent au regroupement.
   */
  const compacts = compacter(nodes, {
    preserver: (node) => node.id.endsWith('-ceiling'),
  });

  return {
    id: 'campus-neo-systems',
    // Ciel de jour : ce qu on voit par les fenetres et au bout du couloir.
    background: [0.58, 0.71, 0.82],
    fog: { color: [0.7, 0.77, 0.84], near: 60, far: 230 },
    nodes: compacts,
    lights: [
      /*
       * Lumiere du jour dominante, plus un appoint interieur chaud.
       *
       * Les quatre lumieres precedentes etaient toutes froides, dont deux
       * ponctuelles en cyan pur : aucune source chaude n existait dans la scene.
       */
      {
        kind: 'hemisphere',
        color: [0.78, 0.82, 0.88],
        // Rebond du sol vers les plafonds : sans lui, tout ce qui regarde vers
        // le bas reste noir, y compris un plafond peint en blanc.
        groundColor: [0.6, 0.55, 0.49],
        intensity: 1.5,
      },
      {
        kind: 'directional',
        color: [1, 0.95, 0.86],
        intensity: 1.6,
        position: [-26, 22, -18],
      },
      { kind: 'point', color: [1, 0.9, 0.78], intensity: 14, position: [minX + 9, 2.7, 0], range: 24 },
      { kind: 'point', color: [1, 0.9, 0.78], intensity: 14, position: [maxX - 9, 2.7, 0], range: 24 },
      ...CAMPUS_ZONES.map((zone) => {
        const ambiance = AMBIANCES[zone.ambiance];
        return {
          kind: 'point' as const,
          color: ambiance.lumiere,
          intensity: ambiance.intensite,
          position: [zone.center[0], ambiance.hauteurLuminaire, zone.center[2]] as Vec3,
          range: Math.max(zone.size[0], zone.size[1]) * 1.4,
        };
      }),
    ],
    colliders,
    anchors,
  };
}

/** Point d apparition : ouest du couloir, regard vers l est, pour voir l enfilade. */
export const CAMPUS_SPAWN: Vec3 = [-20, 1.65, 0];

/** Orientation initiale : le couloir se deploie selon l axe des abscisses. */
export const CAMPUS_SPAWN_YAW = Math.PI / 2;

export function zoneById(id: string): CampusZone | undefined {
  return CAMPUS_ZONES.find((zone) => zone.id === id);
}


/**
 * Zone occupee par un point donne, ou `undefined` dans le couloir.
 *
 * Sert a savoir ou se trouve reellement le visiteur, pour adapter ce qu il
 * entend. Le calcul est purement geometrique : le rendu n a pas a le connaitre.
 */
export function zoneAt(position: Vec3): CampusZone | undefined {
  return CAMPUS_ZONES.find(
    (zone) =>
      Math.abs(position[0] - zone.center[0]) <= zone.size[0] / 2 &&
      Math.abs(position[2] - zone.center[2]) <= zone.size[1] / 2,
  );
}

/**
 * Point d entree dans une piece : juste au-dela du seuil, tourne vers le fond.
 *
 * Franchir une porte faisait quitter la 3D pour un ecran classique. On peut
 * desormais aussi entrer pour de bon, et se retrouver dans la piece, face a ce
 * qu elle contient.
 */
export function zoneEntryPoint(zone: CampusZone): { position: Vec3; yaw: number } {
  const versCouloir = zone.doorSide === 'south' ? 1 : -1;
  const zPorte = zone.center[2] + versCouloir * (zone.size[1] / 2);
  return {
    position: [zone.center[0], 1.65, zPorte - versCouloir * 1.2],
    // Un lacet nul regarde vers les Z croissants, cote controleur de camera.
    yaw: versCouloir > 0 ? Math.PI : 0,
  };
}

/**
 * Position d observation d une zone.
 *
 * Le point de vue se tient dans l embrasure et regarde vers le fond de la
 * piece. Se placer dans le couloir ne montrait rien : la largeur de circulation
 * est inferieure au recul necessaire, et la camera finissait dans le mur d en
 * face.
 */
export function zoneViewpoint(zone: CampusZone): { position: Vec3; target: Vec3 } {
  const versCouloir = zone.doorSide === 'south' ? 1 : -1;
  const zPorte = zone.center[2] + versCouloir * (zone.size[1] / 2);
  return {
    position: [zone.center[0], 1.72, zPorte - versCouloir * 0.2],
    target: [zone.center[0], 1.2, zone.center[2] - versCouloir * (zone.size[1] / 2 - 1)],
  };
}
