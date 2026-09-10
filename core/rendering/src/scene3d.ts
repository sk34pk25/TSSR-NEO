import type { QualityProfile } from './capabilities.ts';

/**
 * Description de scene tridimensionnelle, independante de toute bibliotheque graphique.
 *
 * Le code metier et les modules ne manipulent que ces structures : changer de moteur
 * revient a ecrire une autre implementation de `Renderer3D`, sans toucher au reste.
 */

export type Vec3 = readonly [number, number, number];

export interface MaterialSpec {
  /** Couleur de base en composantes lineaires 0..1. */
  color: Vec3;
  metallic?: number;
  roughness?: number;
  /** Couleur emise ; sert notamment aux temoins lumineux. */
  emissive?: Vec3;
  emissiveIntensity?: number;
  opacity?: number;
}

export type GeometryKind = 'box' | 'plane' | 'cylinder' | 'tube' | 'sphere';

export interface InteractiveSpec {
  /** Nature de l element, pour que l interface sache quoi proposer. */
  kind: 'zone' | 'asset' | 'port' | 'cable' | 'door' | 'sign' | 'workstation' | 'rack' | 'npc';
  /** Identifiant de l objet metier correspondant (zone, equipement, port...). */
  targetId: string;
  label: string;
  /** Description lue par les technologies d assistance. */
  description?: string;
  /**
   * Verbe propose quand le joueur s en approche : « Utiliser », « Ouvrir ».
   * Sans lui, l invite ne saurait pas quoi annoncer.
   */
  verbe?: string;
}

/**
 * Modele importe attache a un noeud.
 *
 * Le noeud conserve sa geometrie primitive : elle sert de repli si le fichier
 * n arrive pas, de version simplifiee a distance, et de volume de collision.
 * Une silhouette credible ne doit jamais etre une condition de fonctionnement.
 */
export interface ModelRef {
  /** Identifiant dans le registre d assets. */
  assetId: string;
  /** Rotation propre du modele, en plus de celle du noeud. */
  yaw?: number;
  /** Ajustement d echelle autour de la hauteur declaree par le registre. */
  echelle?: number;
  /** Nom d animation a jouer, pour les modeles animes. */
  animation?: string;
  /**
   * Correction verticale a appliquer au modele.
   *
   * Une primitive est centree sur elle-meme, alors qu un modele importe est
   * ancre a sa base : sans cette correction, le modele flotte de la moitie de
   * la hauteur de la primitive qu il remplace.
   */
  offsetY?: number;
}

export interface Scene3DNode {
  id: string;
  kind: GeometryKind;
  /** Silhouette reelle, chargee a la demande. La primitive reste le repli. */
  model?: ModelRef;
  position: Vec3;
  rotation?: Vec3;
  size?: Vec3;
  radius?: number;
  height?: number;
  /** Points du tube, pour les cables de brassage. */
  path?: Vec3[];
  material: MaterialSpec;
  /** Transformations d instances, seize flottants par instance. */
  instances?: Float32Array;
  /** Couleurs d instances, quatre flottants par instance. */
  instanceColors?: Float32Array;
  interactive?: InteractiveSpec;
  visible?: boolean;
  /** Distance au-dela de laquelle une version simplifiee est utilisee. */
  lodDistance?: number;
  /** Un noeud statique n est jamais recalcule entre deux images. */
  static?: boolean;
}

export interface LightSpec {
  kind: 'hemisphere' | 'directional' | 'point';
  color: Vec3;
  /**
   * Couleur renvoyee par le sol, pour une lumiere hemispherique.
   *
   * C est elle qui eclaire toutes les faces tournees vers le bas. Sa valeur
   * etait figee a un gris quasi noir, ce qui rendait chaque plafond noir quelle
   * que soit la couleur qu on lui donnait.
   */
  groundColor?: Vec3;
  intensity: number;
  position?: Vec3;
  direction?: Vec3;
  range?: number;
}

/** Volume de collision : le joueur ne traverse pas les murs ni les baies. */
export interface Collider {
  id: string;
  min: Vec3;
  max: Vec3;
}

export interface Scene3D {
  id: string;
  background: Vec3;
  fog?: { color: Vec3; near: number; far: number };
  nodes: Scene3DNode[];
  lights: LightSpec[];
  colliders: Collider[];
  /** Ancres de l habillage pedagogique, projetees en DOM par l interface. */
  anchors: { id: string; label: string; position: Vec3; targetId?: string }[];
}


/**
 * Element manipulable le plus pertinent depuis un point de vue.
 *
 * Un objet ne devient proposable que si le joueur en est proche et qu il le
 * regarde : sans le second critere, l invite changerait sans arret de cible
 * dans une piece meublee.
 */
/** Position reelle d un noeud, qu il soit pose directement ou instancie. */
function positionEffective(node: Scene3DNode): Vec3 {
  const matrices = node.instances;
  if (!matrices || matrices.length < 16) return node.position;
  return [matrices[12] ?? 0, matrices[13] ?? 0, matrices[14] ?? 0];
}

export function interactionLaPlusProche(
  nodes: readonly Scene3DNode[],
  oeil: Vec3,
  regard: Vec3,
  portee = 2.6,
): Scene3DNode | undefined {
  const norme = Math.hypot(regard[0], regard[2]) || 1;
  const dirX = regard[0] / norme;
  const dirZ = regard[2] / norme;

  let meilleur: { node: Scene3DNode; score: number } | undefined;
  for (const node of nodes) {
    const interaction = node.interactive;
    if (!interaction) continue;
    if (
      interaction.kind !== 'workstation' &&
      interaction.kind !== 'rack' &&
      interaction.kind !== 'npc'
    ) {
      continue;
    }
    if (node.visible === false) continue;

    /*
     * Un noeud instancie porte sa position dans sa matrice, pas dans son champ
     * `position`, qui vaut alors l origine du monde. Lire le mauvais champ
     * rendait les personnages impossibles a aborder : ils etaient tous
     * consideres comme situes au point zero.
     */
    const emplacement = positionEffective(node);
    const dx = emplacement[0] - oeil[0];
    const dz = emplacement[2] - oeil[2];
    /*
     * On aborde quelqu un de plus loin qu on ne saisit une souris : imposer la
     * meme distance obligerait a se coller aux gens pour leur parler.
     */
    const atteinte = interaction.kind === 'npc' ? portee * 1.5 : portee;
    const distance = Math.hypot(dx, dz);
    if (distance > atteinte || distance < 0.05) continue;

    // Produit scalaire : 1 signifie droit devant, 0 sur le cote.
    const alignement = (dx / distance) * dirX + (dz / distance) * dirZ;
    if (alignement < 0.55) continue;

    const score = alignement - distance / atteinte;
    if (!meilleur || score > meilleur.score) meilleur = { node, score };
  }
  return meilleur?.node;
}

export type CameraMode = 'first-person' | 'third-person' | 'inspection' | 'tactical';

export interface CameraState {
  mode: CameraMode;
  position: Vec3;
  target: Vec3;
  fov: number;
  /** Duree de transition souhaitee, en millisecondes. */
  transitionMs?: number;
}

export interface PickHit {
  nodeId: string;
  interactive?: InteractiveSpec;
  /** Point d impact dans la scene, utile pour poser un reticule. */
  point: Vec3;
  distance: number;
}

export interface RenderStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
}

/** Modification legere appliquee entre deux images, sans reconstruire la scene. */
export interface NodePatch {
  id: string;
  visible?: boolean;
  material?: Partial<MaterialSpec>;
  position?: Vec3;
  instanceColors?: Float32Array;
  /** Mise en evidence contextuelle : contour et surbrillance. */
  highlighted?: boolean;
}

export interface Renderer3D {
  mount(canvas: HTMLCanvasElement): Promise<void>;
  setScene(scene: Scene3D): void;
  applyPatches(patches: readonly NodePatch[]): void;
  setCamera(state: CameraState): void;
  setQuality(profile: QualityProfile): void;
  resize(): void;
  start(): void;
  stop(): void;
  pick(clientX: number, clientY: number): PickHit | undefined;
  /** Projette un point de la scene en coordonnees d ecran, pour l habillage DOM. */
  project(position: Vec3): { x: number; y: number; visible: boolean };
  stats(): RenderStats;
  dispose(): void;
}

/**
 * Deplace un point en respectant les volumes de collision.
 *
 * Le test est **balaye** et non ponctuel : on compare la position de depart et
 * celle d arrivee sur chaque axe. Un simple test du point d arrivee laisserait
 * traverser un mur fin des que le pas est plus grand que son epaisseur, ce qui
 * arrive des qu on court ou que la cadence chute.
 *
 * Le traitement axe par axe produit naturellement le glissement le long des murs.
 */
function sweepAxis(
  current: Vec3,
  next: number,
  axis: 0 | 2,
  colliders: readonly Collider[],
  radius: number,
): number {
  const start = current[axis];
  if (next === start) return next;
  const other = axis === 0 ? 2 : 0;
  let result = next;

  for (const collider of colliders) {
    // L obstacle doit etre a la bonne hauteur et aligne sur l autre axe.
    if (current[1] < collider.min[1] - 0.1 || current[1] > collider.max[1] + 0.1) continue;
    const minOther = collider.min[other] - radius;
    const maxOther = collider.max[other] + radius;
    if (current[other] <= minOther || current[other] >= maxOther) continue;

    const minAxis = collider.min[axis] - radius;
    const maxAxis = collider.max[axis] + radius;
    // Deja a l interieur : on ne bloque pas, sinon on resterait coince.
    if (start > minAxis && start < maxAxis) continue;

    if (next > start && start <= minAxis && result > minAxis) result = minAxis;
    if (next < start && start >= maxAxis && result < maxAxis) result = maxAxis;
  }
  return result;
}

export function resolveCollisions(
  from: Vec3,
  to: Vec3,
  colliders: readonly Collider[],
  radius = 0.35,
): Vec3 {
  if (colliders.length === 0) return to;
  const x = sweepAxis(from, to[0], 0, colliders, radius);
  const afterX: Vec3 = [x, to[1], from[2]];
  const z = sweepAxis(afterX, to[2], 2, colliders, radius);
  return Number.isFinite(x) && Number.isFinite(z) ? [x, to[1], z] : from;
}

/** Interpolation douce utilisee pour les transitions de camera. */
export function easeInOut(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - (-2 * clamped + 2) ** 2 / 2;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
