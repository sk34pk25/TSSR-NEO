/**
 * Registre des modeles tridimensionnels.
 *
 * Chaque entree declare **ce que l objet est**, pas comment il a ete modelise :
 * sa hauteur reelle en metres, la facon dont il se pose, et d ou il vient. Le
 * chargeur s en sert pour normaliser des modeles issus de sources differentes,
 * qui n ont ni la meme echelle ni la meme convention d origine.
 *
 * Aucun asset n entre ici sans licence explicite. La liste alimente aussi
 * `THIRD_PARTY_NOTICES.md` et la verification automatique des fichiers.
 */

export type AssetCategory = 'furniture' | 'props' | 'characters' | 'hardware' | 'environment';

/** Comment l objet se pose une fois charge. */
export type AssetAnchor =
  /** Pose au sol : la base du modele touche le plan de reference. */
  | 'sol'
  /** Suspendu : le sommet du modele touche le plan de reference. */
  | 'plafond'
  /** Centre : ni haut ni bas ne sont privilegies. */
  | 'centre';

export interface AssetLicense {
  /** Identifiant SPDX quand il existe, ou nom explicite. */
  id: string;
  auteur: string;
  source: string;
  /** Modification apportee au fichier d origine, le cas echeant. */
  modification?: string;
}

export interface AssetSpec {
  id: string;
  category: AssetCategory;
  /** Chemin relatif a `assets/3d/`. */
  fichier: string;
  /**
   * Hauteur reelle voulue, en metres.
   *
   * C est elle qui donne l echelle, jamais celle du fichier : deux
   * bibliotheques differentes n ont aucune raison d employer la meme unite.
   */
  hauteur: number;
  ancrage: AssetAnchor;
  /**
   * Hauteur du modele dans ses propres unites, quand la mesure automatique se
   * trompe. C est le cas des personnages : leur pose de repos ecarte les bras,
   * ce qui gonfle la boite englobante et rapetisse tout le corps.
   */
  hauteurSource?: number;
  licence: AssetLicense;
  /** Noms d animation attendus, pour les modeles animes. */
  animations?: readonly string[];
}

const KENNEY_MOBILIER: AssetLicense = {
  id: 'CC0-1.0',
  auteur: 'Kenney',
  source: 'https://kenney.nl/assets/furniture-kit',
};

const KENNEY_PERSONNAGES: AssetLicense = {
  id: 'CC0-1.0',
  auteur: 'Kenney',
  source: 'https://kenney.nl/assets/blocky-characters',
};

const ANIMATIONS_PERSONNAGE = ['idle', 'walk', 'sit', 'emote-yes', 'emote-no'] as const;

function mobilier(
  id: string,
  fichier: string,
  hauteur: number,
  ancrage: AssetAnchor = 'sol',
): AssetSpec {
  return { id, category: 'furniture', fichier: `furniture/${fichier}`, hauteur, ancrage, licence: KENNEY_MOBILIER };
}

function personnage(id: string, fichier: string): AssetSpec {
  return {
    id,
    category: 'characters',
    fichier: `characters/${fichier}`,
    // Taille humaine moyenne : les personnages doivent etre a l echelle des portes.
    hauteur: 1.75,
    ancrage: 'sol',
    // Hauteur reelle du corps debout, hors ecartement des bras au repos.
    hauteurSource: 1.7,
    licence: KENNEY_PERSONNAGES,
    animations: ANIMATIONS_PERSONNAGE,
  };
}

export const ASSETS: readonly AssetSpec[] = [
  // ------------------------------------------------------------- mobilier
  mobilier('bureau', 'desk.glb', 0.74),
  mobilier('bureau-angle', 'deskCorner.glb', 0.74),
  mobilier('siege-bureau', 'chairDesk.glb', 1.02),
  mobilier('chaise', 'chairModernCushion.glb', 0.86),
  mobilier('canape', 'loungeSofa.glb', 0.78),
  mobilier('fauteuil', 'loungeChair.glb', 0.74),
  mobilier('table-basse', 'tableCoffee.glb', 0.42),
  mobilier('table-appoint', 'sideTable.glb', 0.55),
  mobilier('etagere-ouverte', 'bookcaseOpen.glb', 1.8),
  mobilier('etagere-large', 'bookcaseClosedWide.glb', 1.1),
  mobilier('tabouret', 'stoolBar.glb', 0.75),
  mobilier('portemanteau', 'coatRackStanding.glb', 1.75),

  // ------------------------------------------------------- postes et ecrans
  mobilier('ecran', 'computerScreen.glb', 0.42),
  mobilier('clavier', 'computerKeyboard.glb', 0.03),
  mobilier('souris', 'computerMouse.glb', 0.035),
  mobilier('portable', 'laptop.glb', 0.24),
  mobilier('televiseur', 'televisionModern.glb', 0.62),

  // ------------------------------------------------------------ accessoires
  mobilier('plante-pot', 'pottedPlant.glb', 1.05),
  mobilier('plante-petite-a', 'plantSmall1.glb', 0.34),
  mobilier('plante-petite-b', 'plantSmall2.glb', 0.3),
  mobilier('carton-ouvert', 'cardboardBoxOpen.glb', 0.34),
  mobilier('carton-ferme', 'cardboardBoxClosed.glb', 0.32),
  mobilier('livres', 'books.glb', 0.2),
  mobilier('corbeille', 'trashcan.glb', 0.4),
  mobilier('tapis', 'rugRectangle.glb', 0.01),
  mobilier('machine-cafe', 'kitchenCoffeeMachine.glb', 0.34),
  mobilier('enceinte', 'speakerSmall.glb', 0.26),
  mobilier('radio', 'radio.glb', 0.18),
  mobilier('plafonnier', 'lampSquareCeiling.glb', 0.12, 'plafond'),

  // ------------------------------------------------------------ personnages
  personnage('personne-a', 'character-a.glb'),
  personnage('personne-b', 'character-b.glb'),
  personnage('personne-c', 'character-c.glb'),
  personnage('personne-d', 'character-d.glb'),
  personnage('personne-e', 'character-e.glb'),
  personnage('personne-f', 'character-f.glb'),
];

const PAR_ID = new Map(ASSETS.map((asset) => [asset.id, asset]));

export function assetById(id: string): AssetSpec | undefined {
  return PAR_ID.get(id);
}

/** Licences distinctes utilisees, pour la page d attribution. */
export function licences(): { licence: AssetLicense; assets: string[] }[] {
  const groupes = new Map<string, { licence: AssetLicense; assets: string[] }>();
  for (const asset of ASSETS) {
    const cle = `${asset.licence.id}|${asset.licence.source}`;
    const groupe = groupes.get(cle) ?? { licence: asset.licence, assets: [] };
    groupe.assets.push(asset.id);
    groupes.set(cle, groupe);
  }
  return [...groupes.values()];
}
