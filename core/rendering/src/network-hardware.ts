import { bloc, boite, fusionner, poser, vide, type Piece, type Placement } from './kit.ts';
import { MATERIALS, temoin } from './materials.ts';
import type { Collider, MaterialSpec, Scene3DNode, Vec3 } from './scene3d.ts';

/**
 * Materiel actif, modelise pour etre appris.
 *
 * Une baie representee par une boite grise n enseigne rien : on ne peut ni
 * compter les ports, ni reperer une prise, ni voir qu un temoin est eteint.
 * Ces objets sont construits par programme plutot qu importes, pour une raison
 * precise : leur geometrie doit correspondre a la realite pedagogique, un
 * commutateur vingt-quatre ports doit en montrer vingt-quatre, et aucune
 * bibliotheque libre ne garantit cela.
 *
 * Tout est instancie : une facade de vingt-quatre ports coute un appel de rendu.
 */

/** Hauteur d une unite de baie, en metres. La valeur reelle du standard. */
export const UNITE = 0.04445;
const LARGEUR_UTILE = 0.4826;

export interface ChassisSpec {
  /** Unites occupees en hauteur. */
  unites: number;
  /** Nombre de ports en facade, zero pour un equipement sans port visible. */
  ports: number;
  /** Etat de chaque port : allume, eteint, ou en defaut. */
  etats?: readonly ('actif' | 'inactif' | 'defaut')[];
  materiau?: MaterialSpec;
  /** Ventilation visible en facade, pour les serveurs et les onduleurs. */
  ventilation?: boolean;
}

const VERT: Vec3 = [0.3, 0.95, 0.45];
const ORANGE: Vec3 = [1, 0.7, 0.25];
const ROUGE: Vec3 = [1, 0.3, 0.4];

function couleurPort(etat: 'actif' | 'inactif' | 'defaut'): Vec3 | undefined {
  if (etat === 'actif') return VERT;
  if (etat === 'defaut') return ROUGE;
  return undefined;
}

/**
 * Face avant d un chassis : ports RJ45, temoins, ventilation.
 *
 * Les ports sont poses par rangees de douze, comme sur un equipement reel :
 * c est ce qui permet de dire « le troisieme port de la rangee du haut ».
 */
function facade(
  prefixe: string,
  origine: Vec3,
  yaw: number,
  spec: ChassisSpec,
): { nodes: Scene3DNode[]; portPositions: Vec3[] } {
  const nodes: Scene3DNode[] = [];
  const portPositions: Vec3[] = [];
  if (spec.ports === 0) return { nodes, portPositions };

  const parRangee = spec.ports > 12 ? Math.ceil(spec.ports / 2) : spec.ports;
  const rangees = spec.ports > 12 ? 2 : 1;
  const pas = LARGEUR_UTILE / (parRangee + 1);
  const hauteurChassis = spec.unites * UNITE;

  const corps: Placement[] = [];
  const diodes: { placement: Placement; couleur: Vec3 }[] = [];

  for (let index = 0; index < spec.ports; index += 1) {
    const rangee = rangees === 2 && index >= parRangee ? 1 : 0;
    const colonne = rangee === 1 ? index - parRangee : index;
    const x = -LARGEUR_UTILE / 2 + (colonne + 1) * pas;
    const y =
      rangees === 2
        ? hauteurChassis * (rangee === 0 ? 0.68 : 0.32)
        : hauteurChassis * 0.5;
    const local: Vec3 = [x, y, 0];
    const monde = tourner(local, yaw, origine);
    portPositions.push(monde);
    corps.push({ position: monde, yaw });

    const etat = spec.etats?.[index] ?? 'inactif';
    const couleur = couleurPort(etat);
    if (couleur) {
      diodes.push({
        placement: { position: tourner([x, y + 0.011, 0.004], yaw, origine), yaw },
        couleur,
      });
    }
  }

  // Corps des prises : un seul appel de rendu pour toute la facade.
  nodes.push({
    id: `${prefixe}-ports`,
    kind: 'box',
    position: [0, 0, 0],
    size: [0.0125, 0.0135, 0.012],
    material: MATERIALS.plastiqueSombre,
    instances: poser(corps, [0, 0, 0]),
    static: true,
  });

  // Temoins, regroupes par couleur pour rester a un appel chacun.
  for (const [nom, couleur] of [
    ['vert', VERT],
    ['orange', ORANGE],
    ['rouge', ROUGE],
  ] as const) {
    const groupe = diodes.filter((d) => d.couleur === couleur).map((d) => d.placement);
    if (groupe.length === 0) continue;
    nodes.push({
      id: `${prefixe}-temoin-${nom}`,
      kind: 'box',
      position: [0, 0, 0],
      size: [0.005, 0.003, 0.003],
      material: temoin(couleur, 3.2),
      instances: poser(groupe, [0, 0, 0]),
      static: true,
    });
  }

  if (spec.ventilation === true) {
    const fentes: Placement[] = [];
    for (let i = 0; i < 14; i += 1) {
      fentes.push({
        position: tourner(
          [-LARGEUR_UTILE / 2 + 0.02 + i * 0.032, hauteurChassis * 0.5, 0.002],
          yaw,
          origine,
        ),
        yaw,
      });
    }
    nodes.push({
      id: `${prefixe}-ventilation`,
      kind: 'box',
      position: [0, 0, 0],
      size: [0.02, hauteurChassis * 0.62, 0.004],
      material: MATERIALS.plastiqueSombre,
      instances: poser(fentes, [0, 0, 0]),
      static: true,
    });
  }

  return { nodes, portPositions };
}

/** Applique une rotation autour de la verticale puis une translation. */
function tourner(local: Vec3, yaw: number, origine: Vec3): Vec3 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [
    origine[0] + local[0] * c + local[2] * s,
    origine[1] + local[1],
    origine[2] - local[0] * s + local[2] * c,
  ];
}

export interface BaieSpec {
  id: string;
  position: Vec3;
  yaw?: number;
  /** Equipements montes, du bas vers le haut. */
  chassis: readonly ChassisSpec[];
  /** Une porte vitree ouverte laisse voir et atteindre les ports. */
  porteOuverte?: boolean;
  label?: string;
}

export interface BaieConstruite extends Piece {
  /** Position de chaque port, pour y accrocher un cable. */
  ports: { chassis: number; port: number; position: Vec3 }[];
}

/**
 * Baie complete : montants, rails, socle, porte, et equipements montes.
 *
 * Les montants et les trous de fixation sont ce qui fait reconnaitre une baie
 * dix-neuf pouces plutot qu une armoire quelconque.
 */
export function baie(spec: BaieSpec): BaieConstruite {
  const yaw = spec.yaw ?? 0;
  const [bx, , bz] = spec.position;
  const hauteurBaie = 2.1;
  const profondeur = 0.98;
  const largeur = 0.68;
  const nodes: Scene3DNode[] = [];
  const colliders: Collider[] = [];
  const ports: BaieConstruite['ports'] = [];

  const pose = (local: Vec3): Vec3 => tourner(local, yaw, [bx, 0, bz]);
  const ajouter = (id: string, local: Vec3, taille: Vec3, materiau: MaterialSpec): void => {
    nodes.push(boite(id, pose(local), taille, materiau, [0, yaw, 0]));
  };

  ajouter(`${spec.id}-socle`, [0, 0.05, 0], [largeur + 0.04, 0.1, profondeur + 0.04], MATERIALS.metalPeintSombre);
  ajouter(`${spec.id}-toit`, [0, hauteurBaie - 0.03, 0], [largeur, 0.06, profondeur], MATERIALS.baieMetal);
  ajouter(`${spec.id}-flanc-g`, [-largeur / 2, hauteurBaie / 2, 0], [0.03, hauteurBaie, profondeur], MATERIALS.baieMetal);
  ajouter(`${spec.id}-flanc-d`, [largeur / 2, hauteurBaie / 2, 0], [0.03, hauteurBaie, profondeur], MATERIALS.baieMetal);
  ajouter(`${spec.id}-fond`, [0, hauteurBaie / 2, -profondeur / 2], [largeur, hauteurBaie, 0.02], MATERIALS.metalPeintSombre);

  // Montants avant : c est eux qui portent les equipements.
  for (const cote of [-1, 1]) {
    ajouter(
      `${spec.id}-montant-${cote < 0 ? 'g' : 'd'}`,
      [cote * (LARGEUR_UTILE / 2 + 0.02), hauteurBaie / 2, profondeur / 2 - 0.06],
      [0.04, hauteurBaie - 0.16, 0.05],
      MATERIALS.metalBrosse,
    );
  }

  // Trous de fixation, par groupes de trois : le repere visuel d une baie.
  const trous: Placement[] = [];
  for (let u = 0; u < 42; u += 1) {
    for (const cote of [-1, 1]) {
      for (const tiers of [0.25, 0.5, 0.75]) {
        trous.push({
          position: pose([
            cote * (LARGEUR_UTILE / 2 + 0.02),
            0.12 + (u + tiers) * UNITE,
            profondeur / 2 - 0.032,
          ]),
          yaw,
        });
      }
    }
  }
  nodes.push({
    id: `${spec.id}-fixations`,
    kind: 'box',
    position: [0, 0, 0],
    size: [0.008, 0.008, 0.006],
    material: MATERIALS.plastiqueSombre,
    instances: poser(trous, [0, 0, 0]),
    static: true,
  });

  /*
   * Les equipements se montent en partie haute, a hauteur de travail, comme
   * dans une salle reelle : personne ne brasse a genoux. Le bas reste
   * disponible, ce qui est aussi la verite d une baie non saturee.
   */
  const totalUnites = spec.chassis.reduce((somme, c) => somme + c.unites + 1, 0);
  let uniteCourante = Math.max(1, 34 - totalUnites);
  spec.chassis.forEach((chassis, index) => {
    const hauteur = chassis.unites * UNITE;
    const yBas = 0.12 + uniteCourante * UNITE;
    ajouter(
      `${spec.id}-chassis-${index}`,
      [0, yBas + hauteur / 2, profondeur / 2 - 0.24],
      [LARGEUR_UTILE, hauteur - 0.002, 0.42],
      chassis.materiau ?? MATERIALS.chassisReseau,
    );
    // Oreilles de fixation : elles debordent des montants, comme en vrai.
    for (const cote of [-1, 1]) {
      ajouter(
        `${spec.id}-oreille-${index}-${cote < 0 ? 'g' : 'd'}`,
        [cote * (LARGEUR_UTILE / 2 + 0.018), yBas + hauteur / 2, profondeur / 2 - 0.05],
        [0.036, hauteur - 0.004, 0.008],
        MATERIALS.metalBrosse,
      );
    }

    const avant = facade(
      `${spec.id}-facade-${index}`,
      pose([0, yBas, profondeur / 2 - 0.028]),
      yaw,
      chassis,
    );
    nodes.push(...avant.nodes);
    avant.portPositions.forEach((position, port) => {
      ports.push({ chassis: index, port, position });
    });

    uniteCourante += chassis.unites + 1;
  });

  if (spec.porteOuverte !== true) {
    ajouter(
      `${spec.id}-porte`,
      [0, hauteurBaie / 2, profondeur / 2 + 0.01],
      [largeur - 0.04, hauteurBaie - 0.16, 0.02],
      MATERIALS.vitrageInterieur,
    );
  }

  colliders.push(
    bloc(`${spec.id}-obstacle`, [bx, hauteurBaie / 2, bz], [largeur + 0.2, hauteurBaie, profondeur + 0.2]),
  );

  return { nodes, colliders, ports };
}

/**
 * Panneau de brassage mural, avec ses ports numerotes.
 *
 * C est l objet que l on apprend a lire en premier dans une salle reseau : il
 * relie une prise murale a un port de commutateur.
 */
export function panneauDeBrassage(
  id: string,
  position: Vec3,
  yaw: number,
  ports = 24,
): Piece {
  const nodes: Scene3DNode[] = [
    boite(id, position, [0.06, 0.26, 0.52], MATERIALS.panneauBrassage, [0, yaw, 0]),
  ];
  const prises: Placement[] = [];
  for (let index = 0; index < ports; index += 1) {
    const rangee = index < ports / 2 ? 0 : 1;
    const colonne = index % (ports / 2);
    prises.push({
      position: tourner(
        [0.035, 0.07 - rangee * 0.07, -0.22 + colonne * (0.44 / (ports / 2 - 1))],
        yaw,
        position,
      ),
      yaw,
    });
  }
  nodes.push({
    id: `${id}-prises`,
    kind: 'box',
    position: [0, 0, 0],
    size: [0.012, 0.014, 0.013],
    material: MATERIALS.plastiqueSombre,
    instances: poser(prises, [0, 0, 0]),
    static: true,
  });
  return { nodes, colliders: [] };
}

/** Prise murale RJ45, le point de depart d une liaison utilisateur. */
export function priseMurale(id: string, position: Vec3, yaw: number): Piece {
  return fusionner(
    { nodes: [boite(id, position, [0.03, 0.08, 0.08], MATERIALS.plastiqueClair, [0, yaw, 0])], colliders: [] },
    {
      nodes: [
        boite(
          `${id}-prise`,
          tourner([0.018, 0, 0], yaw, position),
          [0.012, 0.014, 0.013],
          MATERIALS.plastiqueSombre,
          [0, yaw, 0],
        ),
      ],
      colliders: [],
    },
  );
}

/** Cable de brassage tendu entre deux points, avec une legere retombee. */
export function cableDeBrassage(
  id: string,
  depart: Vec3,
  arrivee: Vec3,
  couleur: Vec3,
): Piece {
  const points: Vec3[] = [];
  const segments = 8;
  // Une chainette approchee : un cable ne va jamais en ligne droite.
  const retombee = Math.min(0.22, Math.hypot(arrivee[0] - depart[0], arrivee[2] - depart[2]) * 0.25);
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    points.push([
      depart[0] + (arrivee[0] - depart[0]) * t,
      depart[1] + (arrivee[1] - depart[1]) * t - Math.sin(t * Math.PI) * retombee,
      depart[2] + (arrivee[2] - depart[2]) * t,
    ]);
  }
  return {
    nodes: [
      {
        id,
        kind: 'tube',
        /*
         * Le trace d un tube est deja exprime en coordonnees du monde : lui
         * donner en plus une position ajouterait le point de depart une
         * seconde fois, et le cable partirait a l autre bout du batiment.
         */
        position: [0, 0, 0],
        radius: 0.005,
        path: points,
        material: { color: couleur, roughness: 0.6, metallic: 0 },
        static: true,
      },
    ],
    colliders: [],
  };
}

export { vide as aucunMateriel };
