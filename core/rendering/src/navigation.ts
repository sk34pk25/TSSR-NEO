import type { Collider, Vec3 } from './scene3d.ts';

/**
 * Espace marchable du campus.
 *
 * Les personnages se deplacaient jusqu ici entre des coordonnees ecrites a la
 * main, sans que rien ne verifie qu un mur se trouvait sur le trajet. Trois
 * d entre eux etaient enfonces dans une geometrie solide, et l un traversait
 * trois cloisons a chaque ronde. Un point de passage valait meme litteralement
 * l origine du monde.
 *
 * Cette grille est la verite spatiale partagee : elle dit ou l on peut poser
 * les pieds, et elle est construite a partir des memes volumes de collision
 * que ceux que rencontre le joueur. Personne ne peut donc marcher la ou le
 * joueur se cognerait.
 */

/** Cote d une cellule, en metres. Assez fin pour un couloir, assez grossier pour rester rapide. */
export const PAS_GRILLE = 0.25;

/** Rayon d encombrement d un personnage, utilise pour dilater les obstacles. */
export const RAYON_PERSONNAGE = 0.32;

export interface ZoneMarchable {
  /** Emprise rectangulaire au sol. */
  min: readonly [number, number];
  max: readonly [number, number];
}

export interface NavigationOptions {
  colliders: readonly Collider[];
  /** Surfaces ou l on a le droit de marcher : pieces et circulations. */
  zones: readonly ZoneMarchable[];
  /** Hauteurs auxquelles un obstacle gene reellement la marche. */
  hauteurs?: readonly number[];
}

export class Navigation {
  private readonly minX: number;
  private readonly minZ: number;
  private readonly colonnes: number;
  private readonly lignes: number;
  /** Une cellule marchable vaut 1, un obstacle vaut 0. */
  private readonly grille: Uint8Array;

  constructor(options: NavigationOptions) {
    const hauteurs = options.hauteurs ?? [0.25, 0.9, 1.6];
    const minX = Math.min(...options.zones.map((z) => z.min[0]));
    const maxX = Math.max(...options.zones.map((z) => z.max[0]));
    const minZ = Math.min(...options.zones.map((z) => z.min[1]));
    const maxZ = Math.max(...options.zones.map((z) => z.max[1]));

    this.minX = minX;
    this.minZ = minZ;
    this.colonnes = Math.ceil((maxX - minX) / PAS_GRILLE) + 1;
    this.lignes = Math.ceil((maxZ - minZ) / PAS_GRILLE) + 1;
    this.grille = new Uint8Array(this.colonnes * this.lignes);

    /*
     * Les obstacles sont dilates du rayon d un corps : un chemin qui frole un
     * mur au centimetre pres se traduit a l ecran par une epaule dans la
     * cloison. Mieux vaut refuser un passage trop etroit que produire cela.
     */
    for (let ligne = 0; ligne < this.lignes; ligne += 1) {
      for (let colonne = 0; colonne < this.colonnes; colonne += 1) {
        const x = minX + colonne * PAS_GRILLE;
        const z = minZ + ligne * PAS_GRILLE;
        const dansUneZone = options.zones.some(
          (zone) => x >= zone.min[0] && x <= zone.max[0] && z >= zone.min[1] && z <= zone.max[1],
        );
        if (!dansUneZone) continue;
        const bloque = options.colliders.some((collider) =>
          hauteurs.some(
            (hauteur) =>
              hauteur > collider.min[1] - 0.05 &&
              hauteur < collider.max[1] + 0.05 &&
              x > collider.min[0] - RAYON_PERSONNAGE &&
              x < collider.max[0] + RAYON_PERSONNAGE &&
              z > collider.min[2] - RAYON_PERSONNAGE &&
              z < collider.max[2] + RAYON_PERSONNAGE,
          ),
        );
        if (!bloque) this.grille[ligne * this.colonnes + colonne] = 1;
      }
    }
  }

  private index(colonne: number, ligne: number): number {
    return ligne * this.colonnes + colonne;
  }

  private cellule(point: Vec3 | readonly [number, number, number]): { colonne: number; ligne: number } {
    return {
      colonne: Math.round((point[0] - this.minX) / PAS_GRILLE),
      ligne: Math.round((point[2] - this.minZ) / PAS_GRILLE),
    };
  }

  private centre(colonne: number, ligne: number): Vec3 {
    return [this.minX + colonne * PAS_GRILLE, 0, this.minZ + ligne * PAS_GRILLE];
  }

  private valide(colonne: number, ligne: number): boolean {
    if (colonne < 0 || ligne < 0 || colonne >= this.colonnes || ligne >= this.lignes) return false;
    return this.grille[this.index(colonne, ligne)] === 1;
  }

  /** Peut-on tenir debout a cet endroit ? */
  estMarchable(point: Vec3 | readonly [number, number, number]): boolean {
    const { colonne, ligne } = this.cellule(point);
    return this.valide(colonne, ligne);
  }

  /**
   * Point marchable le plus proche.
   *
   * Sert a rattraper une position ecrite a la main qui se revele dans un mur,
   * et a replacer un personnage dont la navigation a echoue plutot que de le
   * laisser dans le decor.
   */
  pointSur(point: Vec3 | readonly [number, number, number], rayonMax = 6): Vec3 | undefined {
    if (this.estMarchable(point)) {
      const { colonne, ligne } = this.cellule(point);
      const c = this.centre(colonne, ligne);
      return [c[0], point[1], c[2]];
    }
    const depart = this.cellule(point);
    const anneaux = Math.ceil(rayonMax / PAS_GRILLE);
    for (let rayon = 1; rayon <= anneaux; rayon += 1) {
      let meilleur: { colonne: number; ligne: number; distance: number } | undefined;
      for (let dl = -rayon; dl <= rayon; dl += 1) {
        for (let dc = -rayon; dc <= rayon; dc += 1) {
          // Seulement le pourtour de l anneau courant.
          if (Math.max(Math.abs(dl), Math.abs(dc)) !== rayon) continue;
          const colonne = depart.colonne + dc;
          const ligne = depart.ligne + dl;
          if (!this.valide(colonne, ligne)) continue;
          const distance = dc * dc + dl * dl;
          if (!meilleur || distance < meilleur.distance) meilleur = { colonne, ligne, distance };
        }
      }
      if (meilleur) {
        const c = this.centre(meilleur.colonne, meilleur.ligne);
        return [c[0], point[1], c[2]];
      }
    }
    return undefined;
  }

  /**
   * Chemin d un point a un autre, en A*.
   *
   * Les huit voisins sont explores, mais une diagonale n est autorisee que si
   * les deux cellules orthogonales le sont aussi : sans cette regle, un
   * personnage couperait par l angle de deux murs.
   */
  chemin(
    depart: Vec3 | readonly [number, number, number],
    arrivee: Vec3 | readonly [number, number, number],
  ): Vec3[] | undefined {
    const a = this.pointSur(depart);
    const b = this.pointSur(arrivee);
    if (!a || !b) return undefined;
    const debut = this.cellule(a);
    const fin = this.cellule(b);
    const cibleIndex = this.index(fin.colonne, fin.ligne);

    const total = this.colonnes * this.lignes;
    const cout = new Float32Array(total).fill(Number.POSITIVE_INFINITY);
    const precedent = new Int32Array(total).fill(-1);
    const vus = new Uint8Array(total);
    const departIndex = this.index(debut.colonne, debut.ligne);
    cout[departIndex] = 0;

    // File de priorite simple : la grille reste petite, un tas serait du luxe.
    const ouverts: { index: number; score: number }[] = [
      { index: departIndex, score: this.heuristique(debut, fin) },
    ];

    const VOISINS = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const;

    while (ouverts.length > 0) {
      ouverts.sort((x, y) => x.score - y.score);
      const courant = ouverts.shift();
      if (!courant) break;
      if (vus[courant.index] === 1) continue;
      vus[courant.index] = 1;
      if (courant.index === cibleIndex) break;

      const colonne = courant.index % this.colonnes;
      const ligne = Math.floor(courant.index / this.colonnes);

      for (const [dc, dl] of VOISINS) {
        const nc = colonne + dc;
        const nl = ligne + dl;
        if (!this.valide(nc, nl)) continue;
        // Pas de passage par l angle : les deux cotes doivent etre libres.
        if (dc !== 0 && dl !== 0 && (!this.valide(colonne + dc, ligne) || !this.valide(colonne, ligne + dl))) {
          continue;
        }
        const voisin = this.index(nc, nl);
        if (vus[voisin] === 1) continue;
        const pas = dc !== 0 && dl !== 0 ? Math.SQRT2 : 1;
        const nouveau = (cout[courant.index] ?? 0) + pas;
        if (nouveau < (cout[voisin] ?? Number.POSITIVE_INFINITY)) {
          cout[voisin] = nouveau;
          precedent[voisin] = courant.index;
          ouverts.push({
            index: voisin,
            score: nouveau + this.heuristique({ colonne: nc, ligne: nl }, fin),
          });
        }
      }
    }

    if (precedent[cibleIndex] === -1 && cibleIndex !== departIndex) return undefined;

    const cellules: number[] = [];
    let curseur = cibleIndex;
    while (curseur !== -1) {
      cellules.push(curseur);
      if (curseur === departIndex) break;
      curseur = precedent[curseur] ?? -1;
    }
    cellules.reverse();
    const brut = cellules.map((index) => {
      const colonne = index % this.colonnes;
      const ligne = Math.floor(index / this.colonnes);
      const c = this.centre(colonne, ligne);
      return [c[0], depart[1], c[2]] as Vec3;
    });
    return this.lisser(brut);
  }

  private heuristique(a: { colonne: number; ligne: number }, b: { colonne: number; ligne: number }): number {
    const dc = Math.abs(a.colonne - b.colonne);
    const dl = Math.abs(a.ligne - b.ligne);
    return Math.max(dc, dl) + (Math.SQRT2 - 1) * Math.min(dc, dl);
  }

  /**
   * Supprime les points intermediaires inutiles.
   *
   * Un chemin de grille compte un point tous les vingt-cinq centimetres, ce qui
   * produit une demarche saccadee. On ne garde que les sommets ou la direction
   * change reellement, a condition que le raccourci reste degage.
   */
  private lisser(points: readonly Vec3[]): Vec3[] {
    if (points.length <= 2) return [...points];
    const garde: Vec3[] = [points[0] as Vec3];
    let ancre = 0;
    for (let index = 2; index < points.length; index += 1) {
      if (!this.vueDegagee(points[ancre] as Vec3, points[index] as Vec3)) {
        garde.push(points[index - 1] as Vec3);
        ancre = index - 1;
      }
    }
    const dernier = points[points.length - 1] as Vec3;
    // Le dernier segment doit lui aussi etre degage, sinon le raccourci final
    // couperait par un obstacle.
    const derniereAncre = garde[garde.length - 1] as Vec3;
    if (!this.vueDegagee(derniereAncre, dernier) && points.length >= 2) {
      garde.push(points[points.length - 2] as Vec3);
    }
    garde.push(dernier);
    return garde;
  }

  /** Le segment reste-t-il entierement sur des cellules marchables ? */
  vueDegagee(a: Vec3, b: Vec3): boolean {
    const distance = Math.hypot(b[0] - a[0], b[2] - a[2]);
    /*
     * Un quart de cellule : un echantillonnage plus grossier laissait passer
     * une cellule bloquee traversee en diagonale, et le marcheur s y arretait.
     */
    const etapes = Math.max(1, Math.ceil(distance / (PAS_GRILLE * 0.25)));
    for (let i = 0; i <= etapes; i += 1) {
      const t = i / etapes;
      if (!this.estMarchable([a[0] + (b[0] - a[0]) * t, a[1], a[2] + (b[2] - a[2]) * t])) return false;
    }
    return true;
  }

  /** Statistiques de la grille, pour les verifications et le mode developpeur. */
  statistiques(): { cellules: number; marchables: number; colonnes: number; lignes: number } {
    let marchables = 0;
    for (const valeur of this.grille) marchables += valeur;
    return {
      cellules: this.grille.length,
      marchables,
      colonnes: this.colonnes,
      lignes: this.lignes,
    };
  }
}
