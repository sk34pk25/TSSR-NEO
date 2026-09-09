import * as THREE from 'three';
import type { QualityProfile } from './capabilities.ts';
import {
  easeInOut,
  lerpVec3,
  type CameraState,
  type MaterialSpec,
  type NodePatch,
  type PickHit,
  type RenderStats,
  type Renderer3D,
  type Scene3D,
  type Scene3DNode,
  type Vec3,
} from './scene3d.ts';

/**
 * Implementation Three.js de l abstraction de rendu.
 *
 * Choix documente dans docs/adr/0002-choix-du-moteur-3d.md, apres mesure.
 * C est le seul fichier du depot qui importe une bibliotheque graphique.
 */
/** Deux etats de camera decrivent-ils le meme cadrage ? */
function memeCadrage(a: CameraState, b: CameraState): boolean {
  const proche = (u: readonly number[], v: readonly number[]): boolean =>
    u.every((valeur, index) => Math.abs(valeur - (v[index] ?? 0)) < 0.001);
  return (
    a.mode === b.mode &&
    Math.abs(a.fov - b.fov) < 0.001 &&
    proche(a.position, b.position) &&
    proche(a.target, b.target)
  );
}

export class ThreeRenderer implements Renderer3D {
  private renderer: THREE.WebGLRenderer | undefined;
  private canvas: HTMLCanvasElement | undefined;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.05, 200);
  private objects = new Map<string, THREE.Object3D>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private profile: QualityProfile;
  private frame: number | undefined;
  private raycaster = new THREE.Raycaster();
  private description: Scene3D | undefined;
  private frameTimes: number[] = [];
  private highlighted = new Set<string>();

  private transition:
    { from: CameraState; to: CameraState; startedAt: number; durationMs: number } | undefined;
  private target: CameraState = {
    mode: 'third-person',
    position: [0, 2, 8],
    target: [0, 1, 0],
    fov: 60,
  };

  constructor(profile: QualityProfile) {
    this.profile = profile;
  }

  async mount(canvas: HTMLCanvasElement): Promise<void> {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: this.profile.quality !== 'performance',
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(this.profile.pixelRatio);
    this.renderer.shadowMap.enabled = false;
    this.resize();
  }

  private materialFor(spec: MaterialSpec): THREE.MeshStandardMaterial {
    const key = JSON.stringify(spec);
    const existing = this.materials.get(key);
    if (existing) return existing;
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color[0], spec.color[1], spec.color[2]),
      metalness: spec.metallic ?? 0.2,
      roughness: spec.roughness ?? 0.7,
      transparent: (spec.opacity ?? 1) < 1,
      opacity: spec.opacity ?? 1,
    });
    if (spec.emissive) {
      material.emissive = new THREE.Color(spec.emissive[0], spec.emissive[1], spec.emissive[2]);
      material.emissiveIntensity = spec.emissiveIntensity ?? 1;
    }
    this.materials.set(key, material);
    return material;
  }

  private geometryFor(node: Scene3DNode): THREE.BufferGeometry {
    const detailed = this.profile.quality === 'quality' || this.profile.quality === 'ultra';
    switch (node.kind) {
      case 'plane': {
        const [w = 1, , d = 1] = node.size ?? [1, 1, 1];
        const geometry = new THREE.PlaneGeometry(w, d);
        geometry.rotateX(-Math.PI / 2);
        return geometry;
      }
      case 'cylinder':
        return new THREE.CylinderGeometry(
          node.radius ?? 0.1,
          node.radius ?? 0.1,
          node.height ?? 1,
          detailed ? 16 : 8,
        );
      case 'sphere':
        return new THREE.SphereGeometry(node.radius ?? 0.1, detailed ? 16 : 8, detailed ? 12 : 6);
      case 'tube': {
        const points = (node.path ?? []).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
        if (points.length < 2) return new THREE.BufferGeometry();
        const curve = new THREE.CatmullRomCurve3(points);
        return new THREE.TubeGeometry(
          curve,
          detailed ? 12 : 6,
          node.radius ?? 0.006,
          detailed ? 6 : 4,
          false,
        );
      }
      default: {
        const [w = 1, h = 1, d = 1] = node.size ?? [1, 1, 1];
        return new THREE.BoxGeometry(w, h, d);
      }
    }
  }

  setScene(description: Scene3D): void {
    this.description = description;
    this.scene.clear();
    this.objects.clear();
    this.scene.background = new THREE.Color(
      description.background[0],
      description.background[1],
      description.background[2],
    );
    if (description.fog && this.profile.quality !== 'performance') {
      this.scene.fog = new THREE.Fog(
        new THREE.Color(
          description.fog.color[0],
          description.fog.color[1],
          description.fog.color[2],
        ),
        description.fog.near,
        description.fog.far,
      );
    } else {
      this.scene.fog = null;
    }

    for (const light of description.lights) {
      const color = new THREE.Color(light.color[0], light.color[1], light.color[2]);
      if (light.kind === 'hemisphere') {
        const sol = light.groundColor
          ? new THREE.Color(light.groundColor[0], light.groundColor[1], light.groundColor[2])
          : new THREE.Color(0.05, 0.06, 0.08);
        this.scene.add(new THREE.HemisphereLight(color, sol, light.intensity));
      } else if (light.kind === 'directional') {
        const directional = new THREE.DirectionalLight(color, light.intensity);
        if (light.position) directional.position.set(...light.position);
        this.scene.add(directional);
      } else if (this.profile.quality !== 'performance') {
        // Les lumieres ponctuelles sont les plus couteuses : elles sautent en mode performance.
        const point = new THREE.PointLight(color, light.intensity, light.range ?? 10);
        if (light.position) point.position.set(...light.position);
        this.scene.add(point);
      }
    }

    let budget = this.profile.maxInstances;
    for (const node of description.nodes) {
      const object = this.createObject(node, budget);
      if (!object) continue;
      if (node.instances) budget -= node.instances.length / 16;
      this.objects.set(node.id, object);
      this.scene.add(object);
    }
  }

  private createObject(node: Scene3DNode, budget: number): THREE.Object3D | undefined {
    const material = this.materialFor(node.material);
    const geometry = this.geometryFor(node);

    if (node.instances) {
      const count = Math.min(node.instances.length / 16, Math.max(1, budget));
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      const matrix = new THREE.Matrix4();
      for (let i = 0; i < count; i += 1) {
        matrix.fromArray(node.instances, i * 16);
        mesh.setMatrixAt(i, matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (node.instanceColors) {
        const color = new THREE.Color();
        for (let i = 0; i < count; i += 1) {
          const offset = i * 4;
          color.setRGB(
            node.instanceColors[offset] ?? 1,
            node.instanceColors[offset + 1] ?? 1,
            node.instanceColors[offset + 2] ?? 1,
          );
          mesh.setColorAt(i, color);
        }
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      mesh.name = node.id;
      mesh.userData.node = node;
      mesh.visible = node.visible !== false;
      if (node.static === true) mesh.matrixAutoUpdate = false;
      return mesh;
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...node.position);
    if (node.rotation) mesh.rotation.set(...node.rotation);
    mesh.name = node.id;
    mesh.userData.node = node;
    mesh.visible = node.visible !== false;
    if (node.static === true) {
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
    }
    return mesh;
  }

  applyPatches(patches: readonly NodePatch[]): void {
    for (const patch of patches) {
      const object = this.objects.get(patch.id);
      if (!object) continue;
      if (patch.visible !== undefined) object.visible = patch.visible;
      if (patch.position) object.position.set(...patch.position);

      const mesh = object as THREE.Mesh & { instanceColor?: THREE.InstancedBufferAttribute };
      if (patch.instanceColors && object instanceof THREE.InstancedMesh) {
        const color = new THREE.Color();
        const count = object.count;
        for (let i = 0; i < count; i += 1) {
          const offset = i * 4;
          color.setRGB(
            patch.instanceColors[offset] ?? 1,
            patch.instanceColors[offset + 1] ?? 1,
            patch.instanceColors[offset + 2] ?? 1,
          );
          object.setColorAt(i, color);
        }
        if (object.instanceColor) object.instanceColor.needsUpdate = true;
      }

      if (patch.material && mesh.material instanceof THREE.MeshStandardMaterial) {
        // Le materiau est clone a la premiere modification, pour ne pas
        // repeindre tous les objets qui le partagent.
        if (!mesh.userData.ownMaterial) {
          mesh.material = mesh.material.clone();
          mesh.userData.ownMaterial = true;
        }
        const target = mesh.material as THREE.MeshStandardMaterial;
        if (patch.material.color) target.color.setRGB(...patch.material.color);
        if (patch.material.emissive) target.emissive.setRGB(...patch.material.emissive);
        if (patch.material.emissiveIntensity !== undefined) {
          target.emissiveIntensity = patch.material.emissiveIntensity;
        }
        if (patch.material.opacity !== undefined) {
          target.opacity = patch.material.opacity;
          target.transparent = patch.material.opacity < 1;
        }
      }

      if (patch.highlighted !== undefined) {
        this.setHighlight(object, patch.id, patch.highlighted);
      }
    }
  }

  /** Mise en evidence contextuelle : une emission legere, sans changer la geometrie. */
  private setHighlight(object: THREE.Object3D, id: string, on: boolean): void {
    const mesh = object as THREE.Mesh;
    if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
    if (on === this.highlighted.has(id)) return;
    if (!mesh.userData.ownMaterial) {
      mesh.material = mesh.material.clone();
      mesh.userData.ownMaterial = true;
    }
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (on) {
      mesh.userData.previousEmissive = material.emissive.clone();
      material.emissive.setRGB(0.12, 0.45, 0.6);
      material.emissiveIntensity = 1;
      this.highlighted.add(id);
    } else {
      const previous = mesh.userData.previousEmissive as THREE.Color | undefined;
      material.emissive.copy(previous ?? new THREE.Color(0, 0, 0));
      this.highlighted.delete(id);
    }
  }

  setCamera(state: CameraState): void {
    const duration = state.transitionMs ?? 0;
    /*
     * La camera est reglee a chaque image. Relancer la transition a chaque
     * appel la faisait repartir sans cesse de la position courante pour une
     * duree pleine : elle approchait sa cible sans jamais l atteindre, et un
     * cadrage de piece demandait plusieurs secondes au lieu de sept dixiemes.
     * Une transition ne demarre donc que si la destination a reellement change.
     */
    if (duration > 0 && this.transition && memeCadrage(this.transition.to, state)) {
      this.target = state;
      return;
    }
    if (duration > 0) {
      this.transition = {
        from: {
          ...this.target,
          position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
        },
        to: state,
        startedAt: performance.now(),
        durationMs: duration,
      };
    } else {
      this.transition = undefined;
      this.camera.position.set(...state.position);
      this.camera.lookAt(...state.target);
      this.camera.fov = state.fov;
      this.camera.updateProjectionMatrix();
    }
    this.target = state;
  }

  setQuality(profile: QualityProfile): void {
    this.profile = profile;
    this.renderer?.setPixelRatio(profile.pixelRatio);
    if (this.description) this.setScene(this.description);
    this.resize();
  }

  resize(): void {
    const canvas = this.canvas;
    const renderer = this.renderer;
    if (!canvas || !renderer) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(240, Math.round(rect.height));
    renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.frame !== undefined || typeof requestAnimationFrame === 'undefined') return;
    let last = performance.now();
    const loop = (now: number): void => {
      const delta = now - last;
      last = now;
      // Une duree nulle ou negative n a pas de sens : elle fausserait la moyenne.
      if (delta > 0 && delta < 2000) this.frameTimes.push(delta);
      if (this.frameTimes.length > 90) this.frameTimes.shift();
      this.advanceTransition(now);
      this.renderer?.render(this.scene, this.camera);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  private advanceTransition(now: number): void {
    const transition = this.transition;
    if (!transition) return;
    const progress = easeInOut((now - transition.startedAt) / transition.durationMs);
    const position = lerpVec3(transition.from.position, transition.to.position, progress);
    const target = lerpVec3(transition.from.target, transition.to.target, progress);
    this.camera.position.set(...position);
    this.camera.lookAt(...target);
    this.camera.fov = transition.from.fov + (transition.to.fov - transition.from.fov) * progress;
    this.camera.updateProjectionMatrix();
    if (progress >= 1) this.transition = undefined;
  }

  stop(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  pick(clientX: number, clientY: number): PickHit | undefined {
    const canvas = this.canvas;
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, false);
    for (const hit of hits) {
      const node = hit.object.userData.node as Scene3DNode | undefined;
      if (!node || node.interactive === undefined) continue;
      return {
        nodeId: node.id,
        interactive: node.interactive,
        point: [hit.point.x, hit.point.y, hit.point.z],
        distance: hit.distance,
      };
    }
    return undefined;
  }

  project(position: Vec3): { x: number; y: number; visible: boolean } {
    const canvas = this.canvas;
    if (!canvas) return { x: 0, y: 0, visible: false };
    const rect = canvas.getBoundingClientRect();
    const vector = new THREE.Vector3(...position).project(this.camera);
    return {
      x: (vector.x * 0.5 + 0.5) * rect.width,
      y: (-vector.y * 0.5 + 0.5) * rect.height,
      visible: vector.z > -1 && vector.z < 1,
    };
  }

  stats(): RenderStats {
    const info = this.renderer?.info;
    const average =
      this.frameTimes.length === 0
        ? 0
        : this.frameTimes.reduce((sum, value) => sum + value, 0) / this.frameTimes.length;
    return {
      fps: average === 0 ? 0 : Math.round(1000 / average),
      frameMs: Math.round(average * 100) / 100,
      drawCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
    };
  }

  dispose(): void {
    this.stop();
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
    this.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      mesh.geometry?.dispose?.();
    });
    this.scene.clear();
    this.objects.clear();
    this.renderer?.dispose();
    this.renderer = undefined;
    this.canvas = undefined;
  }
}

/** Chargement paresseux : Three.js n entre jamais dans le paquet initial. */
export async function createThreeRenderer(profile: QualityProfile): Promise<Renderer3D> {
  return new ThreeRenderer(profile);
}
