import {
  resolveCollisions,
  type CameraMode,
  type CameraState,
  type Collider,
  type Vec3,
} from './scene3d.ts';

/**
 * Controleur de camera du campus.
 *
 * Quatre modes, une seule position de joueur : changer de mode ne teleporte
 * jamais l apprenant, il change seulement le point de vue sur le meme endroit.
 * C est ce qui evite les transitions desorientantes.
 */

export interface ControllerInput {
  forward: number;
  strafe: number;
  /** Rotation demandee en radians, cumulative. */
  yaw: number;
  pitch: number;
  run: boolean;
}

export const NEUTRAL_INPUT: ControllerInput = {
  forward: 0,
  strafe: 0,
  yaw: 0,
  pitch: 0,
  run: false,
};

const EYE_HEIGHT = 1.62;
const WALK_SPEED = 3.2;
const RUN_SPEED = 5.4;
const PITCH_LIMIT = Math.PI / 2 - 0.08;

const FOV: Record<CameraMode, number> = {
  'first-person': 72,
  'third-person': 62,
  // Champ large : on inspecte une piece entiere, pas un objet isole.
  inspection: 66,
  tactical: 55,
};

export class CampusCameraController {
  private position: Vec3;
  private yaw = 0;
  private pitch = -0.05;
  // Vue tactique a l arrivee : elle repond immediatement a « ou suis-je ».
  // Le campus s ouvre a hauteur d homme : un plan ne fait pas un lieu.
  private mode: CameraMode = 'first-person';
  private colliders: readonly Collider[] = [];
  /** Cible d inspection : mise a jour uniquement en mode inspection. */
  private inspectTarget: { position: Vec3; target: Vec3 } | undefined;

  constructor(spawn: Vec3, spawnYaw = 0) {
    this.position = spawn;
    this.yaw = spawnYaw;
  }

  setColliders(colliders: readonly Collider[]): void {
    this.colliders = colliders;
  }

  getMode(): CameraMode {
    return this.mode;
  }

  getPosition(): Vec3 {
    return this.position;
  }

  getYaw(): number {
    return this.yaw;
  }

  /** Change de point de vue sans deplacer le joueur. */
  setMode(mode: CameraMode): void {
    this.mode = mode;
    if (mode !== 'inspection') this.inspectTarget = undefined;
  }

  /** Cadre un element precis ; la camera y va en transition douce. */
  inspect(viewpoint: { position: Vec3; target: Vec3 }): void {
    this.mode = 'inspection';
    this.inspectTarget = viewpoint;
  }

  teleport(position: Vec3, yaw = this.yaw): void {
    this.position = position;
    this.yaw = yaw;
  }

  /** Applique une image d entree et renvoie l etat de camera correspondant. */
  update(input: ControllerInput, deltaMs: number): CameraState {
    const delta = Math.min(64, deltaMs) / 1000;

    if (this.mode !== 'inspection' && this.mode !== 'tactical') {
      this.yaw += input.yaw;
      this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + input.pitch));
    }

    if (input.forward !== 0 || input.strafe !== 0) {
      const speed = (input.run ? RUN_SPEED : WALK_SPEED) * delta;
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const wanted: Vec3 = [
        this.position[0] + (input.forward * sin + input.strafe * cos) * speed,
        this.position[1],
        this.position[2] + (input.forward * cos - input.strafe * sin) * speed,
      ];
      this.position = resolveCollisions(this.position, wanted, this.colliders);
      // Un deplacement volontaire quitte le cadrage d inspection.
      if (this.mode === 'inspection') {
        this.mode = 'third-person';
        this.inspectTarget = undefined;
      }
    }

    return this.toCameraState();
  }

  private toCameraState(): CameraState {
    const [x, , z] = this.position;
    const eye = EYE_HEIGHT;

    if (this.mode === 'inspection' && this.inspectTarget) {
      return {
        mode: 'inspection',
        position: this.inspectTarget.position,
        target: this.inspectTarget.target,
        fov: FOV.inspection,
        transitionMs: 700,
      };
    }

    if (this.mode === 'tactical') {
      // Vue tactique : plan zenithal legerement incline, pour lire l ensemble.
      return {
        mode: 'tactical',
        position: [x, 26, z + 10],
        target: [x, 0, z],
        fov: FOV.tactical,
        transitionMs: 600,
      };
    }

    const lookAt: Vec3 = [
      x + Math.sin(this.yaw) * Math.cos(this.pitch),
      eye + Math.sin(this.pitch),
      z + Math.cos(this.yaw) * Math.cos(this.pitch),
    ];

    if (this.mode === 'first-person') {
      return {
        mode: 'first-person',
        position: [x, eye, z],
        target: lookAt,
        fov: FOV['first-person'],
      };
    }

    // Troisieme personne : recul derriere le joueur, sans traverser les murs.
    const distance = 4.2;
    const wanted: Vec3 = [
      x - Math.sin(this.yaw) * distance,
      eye + 1.1,
      z - Math.cos(this.yaw) * distance,
    ];
    const safe = resolveCollisions([x, eye + 1.1, z], wanted, this.colliders, 0.5);
    return {
      mode: 'third-person',
      position: safe,
      target: [x, eye - 0.1, z],
      fov: FOV['third-person'],
    };
  }

  /** Etat courant sans consommer d entree, utile au premier rendu. */
  current(): CameraState {
    return this.toCameraState();
  }
}

/** Traduction des touches en intentions, avec disposition AZERTY et QWERTY. */
export function inputFromKeys(pressed: ReadonlySet<string>): ControllerInput {
  const has = (...keys: string[]): boolean => keys.some((key) => pressed.has(key));
  return {
    forward: (has('KeyW', 'KeyZ', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0),
    strafe: (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'KeyQ', 'ArrowLeft') ? 1 : 0),
    yaw: 0,
    pitch: 0,
    run: has('ShiftLeft', 'ShiftRight'),
  };
}
