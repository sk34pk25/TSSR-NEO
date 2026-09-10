import {
  alea,
  baieInformatique,
  bloc,
  compacter,
  boite,
  comptoir,
  fusionner,
  panneauMural,
  plante,
  table,
  objet,
  varier,
  vide,
  type Piece,
  type Placement,
} from './kit.ts';
import { MATERIALS, teinte } from './materials.ts';
import { buildNpcNodes } from './npc.ts';
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
 * Poste de travail complet, avec de vraies silhouettes.
 *
 * Le kit procedural reste sous chaque objet : il tient lieu de repli, de volume
 * de collision et de version economique. Ce qui change est ce que l on voit.
 */
function postesModelises(prefixe: string, postes: readonly Placement[], rng: () => number): Piece {
  if (postes.length === 0) return vide();
  // Un bureau reste droit ; ce sont les sieges et les objets poses qui bougent.
  const bureaux = varier(postes, rng, { decalage: 0.05, rotation: 0.03 });
  const sieges = bureaux.map((poste) => decaler(poste, [-0.02, 0, 0.66]));
  const ecrans = bureaux.map((poste) => decaler(poste, [-0.05, 0.74, -0.2]));
  const claviers = bureaux.map((poste) => decaler(poste, [-0.05, 0.75, 0.08]));
  const souris = bureaux.map((poste) => decaler(poste, [0.28, 0.755, 0.08]));

  return fusionner(
    objet(`${prefixe}-bureau`, 'bureau', bureaux, { kind: 'box', size: [1.5, 0.74, 0.75] }, MATERIALS.boisClair),
    objet(
      `${prefixe}-siege`,
      'siege-bureau',
      varier(sieges, rng, { decalage: 0.14, rotation: 0.5 }),
      { kind: 'box', size: [0.5, 1, 0.5] },
      MATERIALS.tissuSiege,
    ),
    objet(`${prefixe}-ecran`, 'ecran', ecrans, { kind: 'box', size: [0.56, 0.42, 0.06] }, MATERIALS.ecranAllume),
    objet(
      `${prefixe}-clavier`,
      'clavier',
      varier(claviers, rng, { decalage: 0.04, rotation: 0.12 }),
      { kind: 'box', size: [0.42, 0.03, 0.14] },
      MATERIALS.plastiqueClair,
    ),
    objet(
      `${prefixe}-souris`,
      'souris',
      varier(souris, rng, { decalage: 0.05, rotation: 0.4 }),
      { kind: 'box', size: [0.07, 0.035, 0.11] },
      MATERIALS.plastiqueClair,
    ),
    {
      nodes: [],
      colliders: bureaux.map((poste, index) =>
        bloc(`${prefixe}-obstacle-${index}`, [poste.position[0], 0.4, poste.position[2]], [
          1.7, 0.8, 1.7,
        ]),
      ),
    },
  );
}

/** Deplace un emplacement dans son propre repere, orientation comprise. */
function decaler(placement: Placement, offset: Vec3): Placement {
  const yaw = placement.yaw ?? 0;
  const c = Math.cos(yaw);
  const sn = Math.sin(yaw);
  return {
    position: [
      placement.position[0] + offset[0] * c + offset[2] * sn,
      placement.position[1] + offset[1],
      placement.position[2] - offset[0] * sn + offset[2] * c,
    ],
    yaw,
  };
}

/**
 * Petits objets poses sur les surfaces.
 *
 * Ce sont eux qui font qu une piece semble occupee : un carton laisse la, des
 * livres, une corbeille, une tasse. Sans eux, un decor meuble reste un decor.
 */
function accessoires(prefixe: string, rng: () => number, endroits: readonly Vec3[]): Piece {
  if (endroits.length === 0) return vide();
  const choix = [
    { asset: 'carton-ferme', taille: [0.34, 0.32, 0.34] as Vec3, materiau: MATERIALS.boisClair },
    { asset: 'carton-ouvert', taille: [0.34, 0.34, 0.34] as Vec3, materiau: MATERIALS.boisClair },
    { asset: 'livres', taille: [0.24, 0.2, 0.16] as Vec3, materiau: MATERIALS.boisFonce },
    { asset: 'corbeille', taille: [0.3, 0.4, 0.3] as Vec3, materiau: MATERIALS.plastiqueSombre },
    { asset: 'plante-petite-a', taille: [0.3, 0.34, 0.3] as Vec3, materiau: MATERIALS.feuillage },
    { asset: 'plante-petite-b', taille: [0.28, 0.3, 0.28] as Vec3, materiau: MATERIALS.feuillage },
  ];
  const groupes = new Map<number, Placement[]>();
  for (const endroit of endroits) {
    const index = Math.floor(rng() * choix.length) % choix.length;
    const liste = groupes.get(index) ?? [];
    liste.push({ position: endroit, yaw: rng() * Math.PI * 2 });
    groupes.set(index, liste);
  }
  const pieces: Piece[] = [];
  for (const [index, placements] of groupes) {
    const modele = choix[index];
    if (!modele) continue;
    pieces.push(
      objet(
        `${prefixe}-accessoire-${index}`,
        modele.asset,
        placements,
        { kind: 'box', size: modele.taille },
        modele.materiau,
      ),
    );
  }
  return fusionner(...pieces);
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
  // Graine derivee du nom de la zone : chaque piece est irreguliere a sa facon,
  // et toujours de la meme facon d une execution a l autre.
  const rng = alea(
    [...zone.id].reduce((total, lettre) => total + lettre.charCodeAt(0), zone.id.length * 7),
  );

  /** Plante en pot modelisee, avec une echelle variable. */
  const plantes = (positions: readonly Vec3[]): Piece =>
    objet(
      `${zone.id}-plante`,
      'plante-pot',
      varier(
        positions.map((position) => ({ position })),
        rng,
        { decalage: 0.16, rotation: Math.PI, echelle: 0.14 },
      ),
      { kind: 'cylinder', radius: 0.3, height: 1.05 },
      MATERIALS.feuillage,
    );

  switch (zone.id) {
    case 'reception':
      return fusionner(
        comptoir(`${zone.id}-banque`, [cx - 1.4, 0, fond + versCouloir * 0.6], 3.4, 0),
        objet(
          `${zone.id}-canape`,
          'canape',
          varier([{ position: [droite - 2.2, 0, cz + versCouloir * 0.6], yaw: Math.PI / 2 }], rng, {
            decalage: 0.08,
            rotation: 0.05,
          }),
          { kind: 'box', size: [2, 0.78, 0.85] },
          MATERIALS.tissuCanape,
        ),
        objet(
          `${zone.id}-table-basse`,
          'table-basse',
          varier([{ position: [droite - 3.7, 0, cz + versCouloir * 0.6] }], rng, {
            decalage: 0.1,
            rotation: 0.25,
          }),
          { kind: 'box', size: [0.9, 0.42, 0.9] },
          MATERIALS.boisClair,
        ),
        objet(
          `${zone.id}-fauteuil`,
          'fauteuil',
          varier(
            [
              { position: [droite - 4.9, 0, cz + versCouloir * 1.6], yaw: -Math.PI / 2.4 },
              { position: [droite - 4.9, 0, cz - versCouloir * 0.5], yaw: -Math.PI / 1.8 },
            ],
            rng,
            { decalage: 0.15, rotation: 0.35 },
          ),
          { kind: 'box', size: [0.8, 0.74, 0.8] },
          MATERIALS.tissuSiege,
        ),
        objet(
          `${zone.id}-portemanteau`,
          'portemanteau',
          [{ position: [gauche + 0.8, 0, cz + versCouloir * 2.6], yaw: 0.4 }],
          { kind: 'cylinder', radius: 0.28, height: 1.75 },
          MATERIALS.metalBrosse,
        ),
        plantes([
          [gauche + 1, 0, cz - versCouloir * 1.2],
          [droite - 0.9, 0, fond + versCouloir * 0.9],
        ]),
        accessoires(zone.id, rng, [
          [droite - 3.7, 0.44, cz + versCouloir * 0.6],
          [gauche + 1.9, 0, fond + versCouloir * 2.4],
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
      const postes: Placement[] = [];
      for (let rangee = 0; rangee < 2; rangee += 1) {
        for (let poste = 0; poste < 3; poste += 1) {
          postes.push({
            position: [gauche + 1.9 + poste * 2.4, 0, fond + versCouloir * (0.6 + rangee * 3.1)],
            yaw: rangee === 0 ? 0 : Math.PI,
          });
        }
      }
      return fusionner(
        postesModelises(`${zone.id}-poste`, postes, rng),
        objet(
          `${zone.id}-etagere`,
          'etagere-large',
          [{ position: [gauche + 0.75, 0, cz + versCouloir * 2.2], yaw: Math.PI / 2 }],
          { kind: 'box', size: [1.6, 1.1, 0.4] },
          MATERIALS.boisFonce,
        ),
        plantes([
          [droite - 0.9, 0, fond + versCouloir * 0.8],
          [droite - 0.9, 0, cz + versCouloir * 2.4],
        ]),
        accessoires(zone.id, rng, [
          [gauche + 0.9, 0, cz - versCouloir * 1.4],
          [droite - 1.6, 0, cz + versCouloir * 3.1],
          [gauche + 3, 0, cz + versCouloir * 3.2],
        ]),
      );
    }

    case 'command-center': {
      const postes: Placement[] = [0, 1, 2, 3].map((index) => ({
        position: [gauche + 1.8 + index * 1.9, 0, cz + versCouloir * 1.6],
        yaw: zone.doorSide === 'south' ? 0 : Math.PI,
      }));
      const ecrans: Piece = { nodes: [], colliders: [] };
      for (let index = 0; index < 3; index += 1) {
        const p = panneauMural(
          `${zone.id}-mur-ecran-${index}`,
          [gauche + 2.2 + index * 2.4, 1.95, fond + versCouloir * 0.5],
          [2, 1.1, 0.05],
          0,
          MATERIALS.ecranAllume,
        );
        ecrans.nodes.push(...p.nodes);
      }
      return fusionner(
        ecrans,
        postesModelises(`${zone.id}-poste`, postes, rng),
        plantes([[droite - 0.9, 0, cz + versCouloir * 2.6]]),
        accessoires(zone.id, rng, [[gauche + 1, 0, cz + versCouloir * 2.8]]),
      );
    }

    case 'knowledge': {
      const rayons: Placement[] = [];
      for (let index = 0; index < 3; index += 1) {
        rayons.push({
          position: [gauche + 0.75, 0, fond + versCouloir * (0.9 + index * 2.1)],
          yaw: Math.PI / 2,
        });
        rayons.push({
          position: [droite - 0.75, 0, fond + versCouloir * (0.9 + index * 2.1)],
          yaw: -Math.PI / 2,
        });
      }
      return fusionner(
        objet(
          `${zone.id}-rayon`,
          'etagere-large',
          varier(rayons, rng, { decalage: 0.04, rotation: 0.02 }),
          { kind: 'box', size: [1.6, 1.1, 0.4] },
          MATERIALS.boisFonce,
        ),
        table(`${zone.id}-lecture`, [cx, 0, cz + versCouloir * 0.4], [2.4, 0.74, 1.1]),
        objet(
          `${zone.id}-chaise`,
          'chaise',
          varier(
            [
              { position: [cx - 0.7, 0, cz + versCouloir * 1.4], yaw: zone.doorSide === 'south' ? Math.PI : 0 },
              { position: [cx + 0.7, 0, cz + versCouloir * 1.4], yaw: zone.doorSide === 'south' ? Math.PI : 0 },
              { position: [cx, 0, cz - versCouloir * 0.7], yaw: zone.doorSide === 'south' ? 0 : Math.PI },
            ],
            rng,
            { decalage: 0.16, rotation: 0.45 },
          ),
          { kind: 'box', size: [0.46, 0.86, 0.46] },
          MATERIALS.tissuSiege,
        ),
        accessoires(zone.id, rng, [
          [cx - 0.5, 0.76, cz + versCouloir * 0.4],
          [cx + 0.6, 0.76, cz + versCouloir * 0.2],
        ]),
        plantes([[cx - 2.6, 0, cz + versCouloir * 2.6]]),
      );
    }

    case 'personal-space':
      return fusionner(
        objet(
          `${zone.id}-canape`,
          'canape',
          [{ position: [cx, 0, fond + versCouloir * 0.9], yaw: zone.doorSide === 'south' ? 0 : Math.PI }],
          { kind: 'box', size: [2, 0.78, 0.85] },
          MATERIALS.tissuCanape,
        ),
        objet(
          `${zone.id}-table-basse`,
          'table-basse',
          varier([{ position: [cx, 0, fond + versCouloir * 2.3] }], rng, { decalage: 0.12, rotation: 0.3 }),
          { kind: 'box', size: [1, 0.42, 0.7] },
          MATERIALS.boisClair,
        ),
        objet(
          `${zone.id}-etagere`,
          'etagere-large',
          [{ position: [gauche + 0.75, 0, cz], yaw: Math.PI / 2 }],
          { kind: 'box', size: [1.6, 1.1, 0.4] },
          MATERIALS.boisFonce,
        ),
        objet(
          `${zone.id}-cafe`,
          'machine-cafe',
          [{ position: [gauche + 0.9, 0.9, cz + versCouloir * 2.2], yaw: Math.PI / 2 }],
          { kind: 'box', size: [0.3, 0.34, 0.3] },
          MATERIALS.plastiqueSombre,
        ),
        plantes([
          [droite - 0.9, 0, fond + versCouloir * 1.2],
          [droite - 0.9, 0, cz + versCouloir * 2],
        ]),
        accessoires(zone.id, rng, [[cx + 0.3, 0.44, fond + versCouloir * 2.3]]),
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
        objet(
          `${zone.id}-tabouret`,
          'tabouret',
          varier([{ position: [cx + 1.4, 0, cz + versCouloir * 2.5] }], rng, {
            decalage: 0.2,
            rotation: Math.PI,
          }),
          { kind: 'cylinder', radius: 0.2, height: 0.75 },
          MATERIALS.metalBrosse,
        ),
        accessoires(zone.id, rng, [
          [cx + 0.9, 0.92, cz + versCouloir * 1.4],
          [gauche + 3.6, 0, cz + versCouloir * 2.6],
          [droite - 1.2, 0, fond + versCouloir * 2.8],
        ]),
      );

    case 'datacenter': {
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
        accessoires(zone.id, rng, [
          [droite - 1.4, 0, cz + versCouloir * 3.4],
          [gauche + 1, 0, cz - versCouloir * 2.6],
        ]),
      );
    }

    case 'training-lab': {
      const postes: Placement[] = [
        { position: [gauche + 2, 0, fond + versCouloir * 2.2], yaw: Math.PI / 2 },
        { position: [gauche + 2, 0, fond + versCouloir * 4.4], yaw: Math.PI / 2 },
        { position: [droite - 2, 0, fond + versCouloir * 2.2], yaw: -Math.PI / 2 },
        { position: [droite - 2, 0, fond + versCouloir * 4.4], yaw: -Math.PI / 2 },
      ];
      return fusionner(
        postesModelises(`${zone.id}-poste`, postes, rng),
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
        objet(
          `${zone.id}-bureau-formateur`,
          'bureau',
          [{ position: [cx - 1.6, 0, fond + versCouloir * 0.9], yaw: zone.doorSide === 'south' ? Math.PI : 0 }],
          { kind: 'box', size: [1.5, 0.74, 0.75] },
          MATERIALS.boisClair,
        ),
        plantes([[gauche + 0.95, 0, cz + versCouloir * 3]]),
        accessoires(zone.id, rng, [
          [cx - 1.6, 0.76, fond + versCouloir * 0.9],
          [droite - 1, 0, cz + versCouloir * 3.4],
        ]),
      );
    }

    case 'lab-builder':
      return fusionner(
        table(`${zone.id}-etabli-a`, [cx - 1.6, 0, cz], [3, 0.9, 1.1]),
        table(`${zone.id}-etabli-b`, [cx + 2, 0, cz + versCouloir * 1.8], [2.2, 0.9, 0.9]),
        objet(
          `${zone.id}-stock`,
          'etagere-large',
          varier(
            [
              { position: [gauche + 0.75, 0, fond + versCouloir * 1.4], yaw: Math.PI / 2 },
              { position: [gauche + 0.75, 0, fond + versCouloir * 3.6], yaw: Math.PI / 2 },
            ],
            rng,
            { decalage: 0.05, rotation: 0.03 },
          ),
          { kind: 'box', size: [1.6, 1.1, 0.4] },
          MATERIALS.boisFonce,
        ),
        baieInformatique(`${zone.id}-baie`, [
          { position: [droite - 1.2, 0, fond + versCouloir * 1.1], yaw: 0, unitesOccupees: 3 },
        ]),
        objet(
          `${zone.id}-tabouret`,
          'tabouret',
          varier(
            [
              { position: [cx - 1.6, 0, cz + versCouloir * 1.1] },
              { position: [cx + 2, 0, cz + versCouloir * 2.9] },
            ],
            rng,
            { decalage: 0.24, rotation: Math.PI },
          ),
          { kind: 'cylinder', radius: 0.2, height: 0.75 },
          MATERIALS.metalBrosse,
        ),
        plantes([[droite - 1, 0, cz + versCouloir * 2.6]]),
        accessoires(zone.id, rng, [
          [cx - 2.2, 0.92, cz],
          [cx + 1.6, 0.92, cz + versCouloir * 1.8],
          [gauche + 2.4, 0, cz + versCouloir * 2.8],
          [droite - 2.2, 0, fond + versCouloir * 3.2],
        ]),
      );

    default:
      return vide();
  }
}

/**
 * Points d interaction poses sur le mobilier.
 *
 * Le mobilier est instancie, donc un objet parmi dix ne peut pas etre designe
 * individuellement. Les seuls objets manipulables recoivent donc un noeud
 * dedie, qui epouse une piece du meuble : l ecran d un poste, la porte d une
 * baie. Il est visible, il fait partie du meuble, et il est designable.
 */
function pointsDInteraction(zone: CampusZone): Scene3DNode[] {
  const nodes: Scene3DNode[] = [];
  const [cx, , cz] = zone.center;
  const [largeur, profondeur] = zone.size;
  const versCouloir = zone.doorSide === 'south' ? 1 : -1;
  const fond = cz - versCouloir * (profondeur / 2 - 1.4);
  const gauche = cx - largeur / 2;

  const poste = (id: string, position: Vec3, yaw: number, libelle: string): void => {
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const decalage: Vec3 = [-0.05, 0.95, -0.2];
    nodes.push({
      id,
      kind: 'box',
      position: [
        position[0] + decalage[0] * c + decalage[2] * sn,
        decalage[1],
        position[2] - decalage[0] * sn + decalage[2] * c,
      ],
      rotation: [0, yaw, 0],
      size: [0.6, 0.44, 0.05],
      material: MATERIALS.ecranAllume,
      model: { assetId: 'ecran', offsetY: -0.21 },
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
      poste(`${zone.id}-poste-interactif`, [gauche + 1.9, 0, fond + versCouloir * 3.7], Math.PI, 'Poste utilisateur');
      poste(`${zone.id}-poste-interactif-b`, [gauche + 4.3, 0, fond + versCouloir * 3.7], Math.PI, 'Poste utilisateur');
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
      poste(`${zone.id}-poste-interactif`, [gauche + 2, 0, fond + versCouloir * 4.4], Math.PI / 2, 'Poste de formation');
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

  const rng = alea(20260910);
  const mobilier = fusionner(
    objet(
      'corridor-plante',
      'plante-pot',
      varier(
        [
          { position: [minX + 1.3, 0, -CORRIDOR_HALF + 0.7] },
          { position: [minX + 1.3, 0, CORRIDOR_HALF - 0.7] },
          { position: [maxX - 1.3, 0, CORRIDOR_HALF - 0.7] },
          { position: [(minX + maxX) / 2 - 6, 0, -CORRIDOR_HALF + 0.7] },
          { position: [(minX + maxX) / 2 + 5, 0, CORRIDOR_HALF - 0.7] },
        ],
        rng,
        { decalage: 0.14, rotation: Math.PI, echelle: 0.16 },
      ),
      { kind: 'cylinder', radius: 0.3, height: 1.05 },
      MATERIALS.feuillage,
    ),
    objet(
      'corridor-banc',
      'canape',
      varier([{ position: [minX + 3.6, 0, -CORRIDOR_HALF + 0.65] }], rng, {
        decalage: 0.08,
        rotation: 0.04,
      }),
      { kind: 'box', size: [1.9, 0.78, 0.8] },
      MATERIALS.tissuCanape,
    ),
    objet(
      'corridor-appoint',
      'table-appoint',
      varier([{ position: [minX + 5.1, 0, -CORRIDOR_HALF + 0.7] }], rng, {
        decalage: 0.1,
        rotation: 0.4,
      }),
      { kind: 'cylinder', radius: 0.24, height: 0.55 },
      MATERIALS.boisClair,
    ),
    objet(
      'corridor-carton',
      'carton-ferme',
      varier(
        [
          { position: [maxX - 3.2, 0, CORRIDOR_HALF - 0.55] },
          { position: [maxX - 3.6, 0, CORRIDOR_HALF - 0.6] },
        ],
        rng,
        { decalage: 0.1, rotation: Math.PI },
      ),
      { kind: 'box', size: [0.34, 0.32, 0.34] },
      MATERIALS.boisClair,
    ),
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
  /** Permet de decrire le batiment seul, pour les verifications de decor. */
  avecPersonnages?: boolean;
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

  // Les gens arrivent apres le decor : ils ne doivent jamais etre fusionnes.
  if (options.avecPersonnages !== false) {
    const monde = buildNpcNodes();
    nodes.push(...monde.nodes);
    colliders.push(...monde.colliders);
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
    preserver: (node) => node.id.endsWith('-ceiling') || node.model !== undefined,
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
