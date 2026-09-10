import { MATERIALS, teinte } from './materials.ts';
import type { Collider, MaterialSpec, Scene3DNode, Vec3 } from './scene3d.ts';

/**
 * Kit modulaire du campus.
 *
 * Chaque fonction produit un ensemble de noeuds et, le cas echeant, les volumes
 * de collision correspondants. Le principe est simple : un objet reconnaissable
 * ne demande pas une modelisation fine, il demande les bonnes proportions et
 * les bons materiaux. Un plateau sur quatre pieds avec un ecran et un clavier
 * se lit comme un bureau ; une boite grise ne se lit comme rien.
 *
 * La repetition passe par les instances : dix chaises identiques coutent un
 * seul appel de rendu, ce qui autorise un batiment reellement meuble sans
 * sacrifier la fluidite sur du materiel modeste.
 */

export interface Piece {
  nodes: Scene3DNode[];
  colliders: Collider[];
}

const vide = (): Piece => ({ nodes: [], colliders: [] });

function fusionner(...pieces: Piece[]): Piece {
  const resultat = vide();
  for (const piece of pieces) {
    resultat.nodes.push(...piece.nodes);
    resultat.colliders.push(...piece.colliders);
  }
  return resultat;
}

/** Boite pleine, brique de base de tout le mobilier. */
function boite(
  id: string,
  position: Vec3,
  size: Vec3,
  material: MaterialSpec,
  rotation?: Vec3,
): Scene3DNode {
  return {
    id,
    kind: 'box',
    position,
    size,
    material,
    static: true,
    ...(rotation === undefined ? {} : { rotation }),
  };
}

function cylindre(
  id: string,
  position: Vec3,
  radius: number,
  height: number,
  material: MaterialSpec,
): Scene3DNode {
  return { id, kind: 'cylinder', position, radius, height, material, static: true };
}

/** Volume de collision deduit d une emprise au sol et d une hauteur. */
function bloc(id: string, centre: Vec3, size: Vec3): Collider {
  return {
    id,
    min: [centre[0] - size[0] / 2, centre[1] - size[1] / 2, centre[2] - size[2] / 2],
    max: [centre[0] + size[0] / 2, centre[1] + size[1] / 2, centre[2] + size[2] / 2],
  };
}

export interface Placement {
  position: Vec3;
  yaw?: number;
  echelle?: number;
}

/**
 * Matrices d instances, seize flottants par instance en colonne majeure.
 *
 * `offset` est exprime dans le repere local de l objet pose : c est ainsi qu on
 * decrit un ecran « vingt centimetres au-dessus du plateau, vers le fond »
 * une seule fois, quelle que soit l orientation du bureau. Le rendu ignore la
 * position du noeud pour un maillage instancie, donc tout doit etre compose ici.
 */
export function poser(
  placements: readonly Placement[],
  offset: Vec3 = [0, 0, 0],
  yawLocal = 0,
): Float32Array {
  const donnees = new Float32Array(placements.length * 16);
  placements.forEach((placement, index) => {
    const yaw = (placement.yaw ?? 0) + yawLocal;
    const e = placement.echelle ?? 1;
    const cosPlacement = Math.cos(placement.yaw ?? 0);
    const sinPlacement = Math.sin(placement.yaw ?? 0);
    const c = Math.cos(yaw) * e;
    const s = Math.sin(yaw) * e;
    const base = index * 16;
    donnees[base + 0] = c;
    donnees[base + 2] = -s;
    donnees[base + 5] = e;
    donnees[base + 8] = s;
    donnees[base + 10] = c;
    // L offset local subit la rotation du placement, jamais celle du sous-element.
    donnees[base + 12] =
      placement.position[0] + (offset[0] * cosPlacement + offset[2] * sinPlacement) * e;
    donnees[base + 13] = placement.position[1] + offset[1] * e;
    donnees[base + 14] =
      placement.position[2] + (-offset[0] * sinPlacement + offset[2] * cosPlacement) * e;
    donnees[base + 15] = 1;
  });
  return donnees;
}

/** Sous-element instancie : un seul appel de rendu pour toute la repetition. */
function partie(
  id: string,
  placements: readonly Placement[],
  offset: Vec3,
  kind: 'box' | 'cylinder' | 'sphere',
  dimensions: { size?: Vec3; radius?: number; height?: number },
  material: MaterialSpec,
): Scene3DNode {
  return {
    id,
    kind,
    position: [0, 0, 0],
    material,
    instances: poser(placements, offset),
    static: true,
    ...dimensions,
  };
}

// ---------------------------------------------------------------- bureaux

export interface PosteTravail {
  position: Vec3;
  yaw?: number;
}

/**
 * Rangee de postes de travail.
 *
 * Plateau, pietement, ecran, clavier et siege : cinq appels de rendu pour
 * l ensemble de la rangee, quel que soit le nombre de postes.
 */
export function postesDeTravail(prefixe: string, postes: readonly PosteTravail[]): Piece {
  if (postes.length === 0) return vide();
  const p: Placement[] = postes.map((poste) => ({
    position: poste.position,
    yaw: poste.yaw ?? 0,
  }));

  return {
    nodes: [
      partie(`${prefixe}-plateau`, p, [0, 0.74, 0], 'box', { size: [1.5, 0.04, 0.72] }, MATERIALS.boisClair),
      partie(`${prefixe}-caisson`, p, [0.5, 0.34, 0], 'box', { size: [0.42, 0.62, 0.6] }, MATERIALS.stratifieBlanc),
      partie(`${prefixe}-pietement`, p, [-0.62, 0.36, 0], 'box', { size: [0.06, 0.7, 0.62] }, MATERIALS.metalBrosse),
      partie(`${prefixe}-ecran`, p, [-0.05, 1.06, -0.22], 'box', { size: [0.56, 0.34, 0.02] }, MATERIALS.ecranAllume),
      partie(`${prefixe}-pied-ecran`, p, [-0.05, 0.86, -0.22], 'box', { size: [0.05, 0.22, 0.05] }, MATERIALS.plastiqueSombre),
      partie(`${prefixe}-clavier`, p, [-0.05, 0.77, 0.06], 'box', { size: [0.42, 0.02, 0.14] }, MATERIALS.plastiqueClair),
      partie(`${prefixe}-assise`, p, [-0.02, 0.45, 0.62], 'box', { size: [0.46, 0.08, 0.46] }, MATERIALS.tissuSiege),
      partie(`${prefixe}-dossier`, p, [-0.02, 0.72, 0.84], 'box', { size: [0.44, 0.46, 0.07] }, MATERIALS.tissuSiege),
      partie(`${prefixe}-colonne`, p, [-0.02, 0.22, 0.62], 'cylinder', { radius: 0.04, height: 0.44 }, MATERIALS.metalPeintSombre),
    ],
    colliders: postes.map((poste, index) =>
      bloc(`${prefixe}-obstacle-${index}`, [poste.position[0], 0.4, poste.position[2]], [1.7, 0.8, 1.7]),
    ),
  };
}

// ------------------------------------------------------------------- baies

export interface Baie {
  position: Vec3;
  yaw?: number;
  /** Un chassis par unite occupee, du bas vers le haut. */
  unitesOccupees?: number;
}

/**
 * Baie informatique de dix-neuf pouces.
 *
 * Montants, panneaux lateraux, porte vitree et equipements empiles. Les
 * chassis sont instancies : une baie pleine ne coute pas plus cher qu une baie
 * vide.
 */
export function baieInformatique(prefixe: string, baies: readonly Baie[]): Piece {
  if (baies.length === 0) return vide();
  const p: Placement[] = baies.map((baie) => ({ position: baie.position, yaw: baie.yaw ?? 0 }));

  // Les chassis sont poses baie par baie : le nombre d unites occupees varie.
  const chassis: Placement[] = [];
  for (const baie of baies) {
    const nombre = baie.unitesOccupees ?? 6;
    for (let unite = 0; unite < nombre; unite += 1) {
      chassis.push({
        position: [baie.position[0], 0.24 + unite * 0.17, baie.position[2]],
        yaw: baie.yaw ?? 0,
      });
    }
  }

  return {
    nodes: [
      partie(`${prefixe}-corps`, p, [0, 1.05, 0], 'box', { size: [0.68, 2.1, 0.98] }, MATERIALS.baieMetal),
      partie(`${prefixe}-porte`, p, [0, 1.05, 0.5], 'box', { size: [0.62, 1.94, 0.03] }, MATERIALS.vitrageInterieur),
      partie(`${prefixe}-socle`, p, [0, 0.05, 0], 'box', { size: [0.72, 0.1, 1.02] }, MATERIALS.metalPeintSombre),
      partie(`${prefixe}-chassis`, chassis, [0, 0, 0], 'box', { size: [0.56, 0.13, 0.76] }, MATERIALS.chassisReseau),
    ],
    colliders: baies.map((baie, index) =>
      bloc(`${prefixe}-obstacle-${index}`, [baie.position[0], 1.05, baie.position[2]], [0.9, 2.1, 1.15]),
    ),
  };
}

// --------------------------------------------------------------- rangement

/** Etagere ouverte, avec ses tablettes. */
export function etagere(id: string, position: Vec3, largeur = 1.2, yaw = 0): Piece {
  const hauteur = 1.8;
  const nodes: Scene3DNode[] = [
    boite(`${id}-flanc-g`, [position[0], position[1] + hauteur / 2, position[2]], [0.04, hauteur, 0.34], MATERIALS.boisFonce, [0, yaw, 0]),
    boite(`${id}-corps`, [position[0], position[1] + hauteur / 2, position[2]], [largeur, hauteur, 0.32], teinte(MATERIALS.boisFonce, 0.85), [0, yaw, 0]),
  ];
  for (let niveau = 1; niveau <= 4; niveau += 1) {
    nodes.push(
      boite(
        `${id}-tablette-${niveau}`,
        [position[0], position[1] + niveau * 0.42, position[2] + 0.02],
        [largeur - 0.06, 0.03, 0.34],
        MATERIALS.boisClair,
        [0, yaw, 0],
      ),
    );
  }
  return {
    nodes,
    colliders: [bloc(`${id}-obstacle`, [position[0], position[1] + 0.9, position[2]], [largeur + 0.2, 1.8, 0.6])],
  };
}

/** Plante en pot : le detail le moins couteux qui rende une piece habitee. */
export function plante(prefixe: string, positions: readonly Vec3[]): Piece {
  if (positions.length === 0) return vide();
  const p: Placement[] = positions.map((position, index) => ({
    position,
    yaw: index * 0.7,
    // Deux plantes strictement identiques cote a cote se remarquent.
    echelle: 0.88 + ((index * 37) % 26) / 100,
  }));
  return {
    nodes: [
      partie(`${prefixe}-pot`, p, [0, 0.18, 0], 'cylinder', { radius: 0.22, height: 0.36 }, MATERIALS.potTerreCuite),
      partie(`${prefixe}-terre`, p, [0, 0.36, 0], 'cylinder', { radius: 0.2, height: 0.04 }, MATERIALS.terreau),
      partie(`${prefixe}-feuillage-bas`, p, [0, 0.7, 0], 'sphere', { radius: 0.34 }, MATERIALS.feuillage),
      partie(`${prefixe}-feuillage-haut`, p, [0.08, 1.04, -0.05], 'sphere', { radius: 0.26 }, teinte(MATERIALS.feuillage, 1.15)),
    ],
    colliders: positions.map((position, index) =>
      bloc(`${prefixe}-obstacle-${index}`, [position[0], 0.5, position[2]], [0.6, 1, 0.6]),
    ),
  };
}

/** Banquette ou canape d attente. */
export function canape(id: string, position: Vec3, largeur = 1.9, yaw = 0): Piece {
  return {
    nodes: [
      boite(`${id}-assise`, [position[0], 0.4, position[2]], [largeur, 0.24, 0.8], MATERIALS.tissuCanape, [0, yaw, 0]),
      boite(`${id}-dossier`, [position[0], 0.66, position[2] - 0.32], [largeur, 0.5, 0.16], teinte(MATERIALS.tissuCanape, 0.9), [0, yaw, 0]),
      boite(`${id}-pieds`, [position[0], 0.14, position[2]], [largeur - 0.2, 0.28, 0.6], MATERIALS.boisFonce, [0, yaw, 0]),
    ],
    colliders: [bloc(`${id}-obstacle`, [position[0], 0.4, position[2]], [largeur + 0.2, 0.9, 1.1])],
  };
}

/** Table basse ou table de reunion. */
export function table(id: string, position: Vec3, size: Vec3, yaw = 0): Piece {
  const [largeur, hauteur, profondeur] = size;
  const nodes: Scene3DNode[] = [
    boite(`${id}-plateau`, [position[0], hauteur, position[2]], [largeur, 0.05, profondeur], MATERIALS.boisClair, [0, yaw, 0]),
  ];
  const dx = largeur / 2 - 0.12;
  const dz = profondeur / 2 - 0.12;
  for (const [index, [ox, oz]] of ([[-dx, -dz], [dx, -dz], [-dx, dz], [dx, dz]] as const).entries()) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    nodes.push(
      cylindre(
        `${id}-pied-${index}`,
        [position[0] + ox * c - oz * s, hauteur / 2, position[2] + ox * s + oz * c],
        0.035,
        hauteur,
        MATERIALS.metalBrosse,
      ),
    );
  }
  return {
    nodes,
    colliders: [bloc(`${id}-obstacle`, [position[0], hauteur / 2, position[2]], [largeur, hauteur, profondeur])],
  };
}

/** Banque d accueil : un comptoir et son retour. */
export function comptoir(id: string, position: Vec3, largeur = 2.8, yaw = 0): Piece {
  return {
    nodes: [
      boite(`${id}-corps`, [position[0], 0.55, position[2]], [largeur, 1.1, 0.7], MATERIALS.boisFonce, [0, yaw, 0]),
      boite(`${id}-tablette`, [position[0], 1.14, position[2]], [largeur + 0.16, 0.06, 0.86], MATERIALS.boisClair, [0, yaw, 0]),
      boite(`${id}-bandeau`, [position[0], 0.28, position[2] + 0.36], [largeur - 0.2, 0.5, 0.03], MATERIALS.murAccentChaud, [0, yaw, 0]),
    ],
    colliders: [bloc(`${id}-obstacle`, [position[0], 0.55, position[2]], [largeur + 0.3, 1.2, 1.1])],
  };
}

/** Tableau blanc ou panneau mural : ce qui evite le mur nu. */
export function panneauMural(
  id: string,
  position: Vec3,
  size: Vec3,
  yaw: number,
  material: MaterialSpec = MATERIALS.stratifieBlanc,
): Piece {
  return {
    nodes: [
      boite(`${id}-cadre`, position, [size[0] + 0.06, size[1] + 0.06, 0.03], MATERIALS.menuiserie, [0, yaw, 0]),
      boite(`${id}-surface`, [position[0], position[1], position[2]], size, material, [0, yaw, 0]),
    ],
    colliders: [],
  };
}


/**
 * Compacte les boites statiques en maillages instancies.
 *
 * Un batiment meuble decrit noeud par noeud demandait plus de cinq cents appels
 * de rendu, alors que la plupart de ces noeuds sont des boites partageant le
 * meme materiau : murs, plafonniers, tablettes, huisseries. Regroupees par
 * materiau, elles tiennent en un appel chacune, sans rien changer a la
 * description de la scene ni a ce qu on voit.
 *
 * Sont exclus, volontairement :
 *  - les noeuds interactifs, qui doivent rester designables individuellement ;
 *  - les noeuds cites par un identifiant, qui doivent rester modifiables ;
 *  - tout ce qui n est pas une boite alignee ou tournee autour de la verticale.
 */
export function compacter(
  nodes: readonly Scene3DNode[],
  options: { preserver?: (node: Scene3DNode) => boolean } = {},
): Scene3DNode[] {
  const preserver = options.preserver ?? (() => false);
  const conserves: Scene3DNode[] = [];
  const groupes = new Map<string, { material: MaterialSpec; membres: Scene3DNode[] }>();

  for (const node of nodes) {
    const tournePlat =
      node.rotation === undefined || (node.rotation[0] === 0 && node.rotation[2] === 0);
    const compactable =
      node.kind === 'box' &&
      node.size !== undefined &&
      node.instances === undefined &&
      node.interactive === undefined &&
      node.static === true &&
      node.visible !== false &&
      tournePlat &&
      !preserver(node);
    if (!compactable) {
      conserves.push(node);
      continue;
    }
    const cle = JSON.stringify(node.material);
    const groupe = groupes.get(cle) ?? { material: node.material, membres: [] };
    groupe.membres.push(node);
    groupes.set(cle, groupe);
  }

  let index = 0;
  for (const groupe of groupes.values()) {
    // Un seul element ne gagne rien a devenir un maillage instancie.
    if (groupe.membres.length < 2) {
      conserves.push(...groupe.membres);
      continue;
    }
    const matrices = new Float32Array(groupe.membres.length * 16);
    groupe.membres.forEach((membre, rang) => {
      const taille = membre.size ?? [1, 1, 1];
      const yaw = membre.rotation?.[1] ?? 0;
      const c = Math.cos(yaw);
      const sn = Math.sin(yaw);
      const base = rang * 16;
      matrices[base + 0] = c * taille[0];
      matrices[base + 2] = -sn * taille[0];
      matrices[base + 5] = taille[1];
      matrices[base + 8] = sn * taille[2];
      matrices[base + 10] = c * taille[2];
      matrices[base + 12] = membre.position[0];
      matrices[base + 13] = membre.position[1];
      matrices[base + 14] = membre.position[2];
      matrices[base + 15] = 1;
    });
    conserves.push({
      id: `compact-${index}`,
      kind: 'box',
      position: [0, 0, 0],
      // Cube unitaire : l echelle reelle vit dans chaque matrice d instance.
      size: [1, 1, 1],
      material: groupe.material,
      instances: matrices,
      static: true,
    });
    index += 1;
  }
  return conserves;
}

// ----------------------------------------------- imperfection controlee

/**
 * Generateur deterministe.
 *
 * Un lieu reel n est jamais parfaitement aligne, mais une variation tiree au
 * hasard a chaque chargement rendrait toute comparaison de captures
 * impossible. La graine fixe donc la variation une fois pour toutes : le
 * campus est irregulier, et il est irregulier de la meme facon a chaque fois.
 */
export function alea(graine: number): () => number {
  let etat = graine >>> 0;
  return () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let t = etat;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Variation {
  /** Ecart lateral maximal, en metres. */
  decalage?: number;
  /** Ecart d orientation maximal, en radians. */
  rotation?: number;
  /** Ecart d echelle maximal, en fraction. */
  echelle?: number;
}

/**
 * Applique une irregularite mesuree a une serie d emplacements.
 *
 * Sans elle, chaque chaise est exactement a sa place et exactement parallele a
 * sa voisine : c est ce qui donne l impression d un decor trace a la regle.
 */
export function varier(
  placements: readonly Placement[],
  rng: () => number,
  variation: Variation = {},
): Placement[] {
  const dec = variation.decalage ?? 0.12;
  const rot = variation.rotation ?? 0.18;
  const ech = variation.echelle ?? 0;
  return placements.map((placement) => ({
    position: [
      placement.position[0] + (rng() - 0.5) * 2 * dec,
      placement.position[1],
      placement.position[2] + (rng() - 0.5) * 2 * dec,
    ] as Vec3,
    yaw: (placement.yaw ?? 0) + (rng() - 0.5) * 2 * rot,
    ...(ech === 0 ? {} : { echelle: 1 + (rng() - 0.5) * 2 * ech }),
  }));
}

/**
 * Objet du decor pose a plusieurs endroits, avec sa silhouette reelle.
 *
 * La primitive transmise reste dans la description : elle sert de repli si le
 * modele n arrive pas, de volume de collision, et de version economique.
 */
export function objet(
  id: string,
  assetId: string,
  placements: readonly Placement[],
  primitive: { kind: 'box' | 'cylinder'; size?: Vec3; radius?: number; height?: number },
  material: MaterialSpec,
  options: { hauteurPrimitive?: number; interactive?: Scene3DNode['interactive'] } = {},
): Piece {
  if (placements.length === 0) return vide();
  const hauteur = options.hauteurPrimitive ?? primitive.size?.[1] ?? primitive.height ?? 0.8;
  return {
    nodes: [
      {
        ...primitive,
        id,
        position: [0, 0, 0],
        material,
        instances: poser(placements, [0, hauteur / 2, 0]),
        model: { assetId, offsetY: -hauteur / 2 },
        static: true,
        ...(options.interactive === undefined ? {} : { interactive: options.interactive }),
      },
    ],
    colliders: [],
  };
}

export { fusionner, vide, boite, cylindre, bloc };
export type { Piece as PieceDeKit };
