import type { MaterialSpec, Vec3 } from './scene3d.ts';

/**
 * Bibliotheque de materiaux du campus.
 *
 * L ancienne palette comptait six entrees, toutes anthracite bleutees : la
 * surface la plus claire du batiment plafonnait a 0,15 de luminance et les six
 * materiaux avaient un canal bleu superieur au canal rouge. Il n existait donc
 * ni contraste possible, ni un seul ton chaud, ce qui donnait a l ensemble
 * l aspect d un batiment evacue la nuit.
 *
 * Les valeurs ci-dessous decrivent un batiment tertiaire ordinaire : des murs
 * clairs, du bois, de la moquette, du textile, du metal peint. Les tons froids
 * subsistent la ou ils sont vrais, c est-a-dire dans les locaux techniques.
 */

/** Cree un materiau a partir d une couleur en pourcentage 0..255, plus lisible. */
function rgb(r: number, g: number, b: number, extra: Partial<MaterialSpec> = {}): MaterialSpec {
  return {
    color: [r / 255, g / 255, b / 255] as Vec3,
    metallic: 0,
    roughness: 0.85,
    ...extra,
  };
}

export const MATERIALS = {
  // ------------------------------------------------------------- gros oeuvre
  /** Peinture mate claire, la surface dominante d un batiment de bureaux. */
  murClair: rgb(216, 210, 200, { roughness: 0.94 }),
  /** Rappel de couleur sur un pan de mur, pour distinguer une piece d une autre. */
  murAccentChaud: rgb(196, 150, 108, { roughness: 0.9 }),
  murAccentVert: rgb(122, 146, 122, { roughness: 0.9 }),
  murAccentBleu: rgb(108, 138, 166, { roughness: 0.9 }),
  /** Beton lisse des locaux techniques, franchement plus froid et plus sombre. */
  betonTechnique: rgb(122, 124, 128, { roughness: 0.95 }),
  plafondAcoustique: rgb(232, 230, 226, { roughness: 0.98 }),
  plinthe: rgb(72, 70, 68, { roughness: 0.7 }),

  // ------------------------------------------------------------------- sols
  moquetteBureau: rgb(96, 92, 88, { roughness: 0.99 }),
  moquetteChaude: rgb(126, 104, 88, { roughness: 0.99 }),
  parquet: rgb(158, 116, 74, { roughness: 0.62 }),
  carrelageHall: rgb(198, 192, 184, { metallic: 0.04, roughness: 0.35 }),
  solTechnique: rgb(86, 90, 96, { metallic: 0.08, roughness: 0.55 }),
  dalleAntistatique: rgb(58, 62, 68, { metallic: 0.1, roughness: 0.45 }),

  // -------------------------------------------------------------- mobilier
  boisClair: rgb(196, 158, 112, { roughness: 0.55 }),
  boisFonce: rgb(112, 78, 52, { roughness: 0.6 }),
  stratifieBlanc: rgb(226, 224, 220, { roughness: 0.4 }),
  metalPeintSombre: rgb(58, 60, 64, { metallic: 0.55, roughness: 0.42 }),
  metalBrosse: rgb(158, 162, 168, { metallic: 0.8, roughness: 0.32 }),
  tissuSiege: rgb(64, 84, 106, { roughness: 0.96 }),
  tissuCanape: rgb(148, 106, 84, { roughness: 0.96 }),
  plastiqueSombre: rgb(38, 40, 44, { roughness: 0.5 }),
  plastiqueClair: rgb(214, 212, 208, { roughness: 0.55 }),

  // ------------------------------------------------------- materiel actif
  chassisReseau: rgb(44, 48, 54, { metallic: 0.6, roughness: 0.38 }),
  baieMetal: rgb(34, 36, 40, { metallic: 0.7, roughness: 0.3 }),
  panneauBrassage: rgb(198, 200, 202, { metallic: 0.3, roughness: 0.4 }),

  // ------------------------------------------------------------- vitrages
  /*
   * Verre interieur : franchement desature. Une teinte trop marquee ressortait
   * comme un panneau lumineux cyan et redonnait a l ensemble l aspect science
   * fiction qu on cherche precisement a quitter.
   */
  vitrageInterieur: rgb(222, 226, 228, {
    metallic: 0.02,
    roughness: 0.05,
    opacity: 0.11,
  }),
  vitrageExterieur: rgb(174, 202, 216, {
    metallic: 0.02,
    roughness: 0.05,
    opacity: 0.24,
  }),
  menuiserie: rgb(70, 72, 76, { metallic: 0.4, roughness: 0.45 }),

  // ------------------------------------------------------------- vegetal
  feuillage: rgb(74, 118, 68, { roughness: 0.9 }),
  potTerreCuite: rgb(168, 104, 76, { roughness: 0.9 }),
  terreau: rgb(58, 46, 38, { roughness: 1 }),

  // ------------------------------------------- emissif : ecrans et temoins
  /** Luminaire tertiaire : blanc chaud, jamais cyan. */
  luminaire: {
    color: [1, 0.96, 0.9],
    emissive: [1, 0.94, 0.84],
    emissiveIntensity: 2.2,
    roughness: 0.9,
  } as MaterialSpec,
  ecranAllume: {
    color: [0.1, 0.12, 0.15],
    emissive: [0.34, 0.46, 0.6],
    emissiveIntensity: 1.5,
    roughness: 0.25,
  } as MaterialSpec,
  ecranEteint: rgb(24, 26, 30, { metallic: 0.2, roughness: 0.2 }),

  // ---------------------------------------------------------- exterieur
  cielJour: rgb(150, 186, 216, { roughness: 1 }),
  pelouse: rgb(96, 122, 74, { roughness: 1 }),
  bitume: rgb(74, 74, 78, { roughness: 0.95 }),
} as const satisfies Record<string, MaterialSpec>;

export type MaterialName = keyof typeof MATERIALS;

/** Variante d un materiau, pour eviter que deux objets voisins soient identiques. */
export function teinte(base: MaterialSpec, facteur: number): MaterialSpec {
  return {
    ...base,
    color: [
      Math.min(1, base.color[0] * facteur),
      Math.min(1, base.color[1] * facteur),
      Math.min(1, base.color[2] * facteur),
    ] as Vec3,
  };
}

/** Temoin lumineux d equipement : la couleur porte l etat, pas la decoration. */
export function temoin(couleur: Vec3, intensite = 2.6): MaterialSpec {
  return {
    color: couleur,
    emissive: couleur,
    emissiveIntensity: intensite,
    roughness: 0.4,
    metallic: 0,
  };
}
