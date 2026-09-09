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
  kind: 'zone' | 'asset' | 'port' | 'cable' | 'door' | 'sign';
  /** Identifiant de l objet metier correspondant (zone, equipement, port...). */
  targetId: string;
  label: string;
  /** Description lue par les technologies d assistance. */
  description?: string;
}

export interface Scene3DNode {
  id: string;
  kind: GeometryKind;
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
