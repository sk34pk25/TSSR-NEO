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
  /**
   * Rotation demandee. Deux natures cohabitent, et il faut les distinguer :
   * une intention continue au clavier, exprimee entre -1 et 1 et rapportee au
   * temps ecoule, et un deplacement de souris deja exprime en radians.
   */
  turn: number;
  look: number;
  /** Rotation instantanee en radians, appliquee telle quelle. */
  yaw: number;
  pitch: number;
  run: boolean;
}

export const NEUTRAL_INPUT: ControllerInput = {
  forward: 0,
  strafe: 0,
  turn: 0,
  look: 0,
  yaw: 0,
  pitch: 0,
  run: false,
};

const EYE_HEIGHT = 1.62;
const WALK_SPEED = 3.2;
const RUN_SPEED = 5.4;
const PITCH_LIMIT = Math.PI / 2 - 0.08;
/** Vitesse de rotation au clavier, en radians par seconde. */
const TURN_SPEED = 2.2;
const LOOK_SPEED = 1.5;
/*
 * Temps de mise en vitesse et d arret, en secondes.
 *
 * La vitesse passait de zero au maximum en une seule image, ce qui est
 * exactement l origine de la sensation de camera robotique. Ces constantes
 * restent courtes : il s agit d amortir un demarrage, pas de patiner.
 */
const ACCELERATION = 12;
const FREINAGE = 16;

const FOV: Record<CameraMode, number> = {
  'first-person': 72,
  'third-person': 62,
  // Champ large : on inspecte une piece entiere, pas un objet isole.
  inspection: 66,
  tactical: 55,
};

/** Rapproche une vitesse de sa consigne, plus vite a l arret qu au demarrage. */
function approcher(courante: number, voulue: number, delta: number): number {
  const taux = Math.abs(voulue) > Math.abs(courante) ? ACCELERATION : FREINAGE;
  const ecart = voulue - courante;
  const pas = taux * delta;
  if (Math.abs(ecart) <= pas) return voulue;
  return courante + Math.sign(ecart) * pas;
}

export class CampusCameraController {
  private position: Vec3;
  private yaw = 0;
  private pitch = -0.05;
  /** Vitesse courante, lissee : c est elle qui donne du poids au deplacement. */
  private vitesse: { avant: number; cote: number } = { avant: 0, cote: 0 };
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
    const libre = this.mode !== 'inspection' && this.mode !== 'tactical';

    if (libre) {
      /*
       * La souris fournit deja des radians ; le clavier fournit une intention,
       * qu il faut rapporter au temps ecoule. Sans cela la vitesse de rotation
       * dependait de la cadence d affichage de la machine.
       */
      this.yaw += input.yaw + input.turn * TURN_SPEED * delta;
      this.pitch = Math.max(
        -PITCH_LIMIT,
        Math.min(PITCH_LIMIT, this.pitch + input.pitch + input.look * LOOK_SPEED * delta),
      );
    }

    // Mise en vitesse progressive, puis freinage : le deplacement a du poids.
    const plafond = input.run ? RUN_SPEED : WALK_SPEED;
    const vouluAvant = libre ? input.forward * plafond : 0;
    const vouluCote = libre ? input.strafe * plafond : 0;
    this.vitesse = {
      avant: approcher(this.vitesse.avant, vouluAvant, delta),
      cote: approcher(this.vitesse.cote, vouluCote, delta),
    };

    const bouge = Math.abs(this.vitesse.avant) > 0.01 || Math.abs(this.vitesse.cote) > 0.01;
    if (bouge) {
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      const wanted: Vec3 = [
        this.position[0] + (this.vitesse.avant * sin + this.vitesse.cote * cos) * delta,
        this.position[1],
        this.position[2] + (this.vitesse.avant * cos - this.vitesse.cote * sin) * delta,
      ];
      this.position = resolveCollisions(this.position, wanted, this.colliders);
    }

    /*
     * Se deplacer volontairement quitte le cadrage d inspection et rend la
     * main a hauteur d homme. La version precedente basculait en troisieme
     * personne : le point de vue changeait sans qu on l ait demande.
     */
    if ((input.forward !== 0 || input.strafe !== 0) && this.mode === 'inspection') {
      this.mode = 'first-person';
      this.inspectTarget = undefined;
    }

    return this.toCameraState();
  }

  /** Position et orientation courantes, pour les restituer plus tard. */
  snapshot(): { position: Vec3; yaw: number; pitch: number; mode: CameraMode } {
    return { position: this.position, yaw: this.yaw, pitch: this.pitch, mode: this.mode };
  }

  /** Restaure un etat precedemment releve, sans transition. */
  restore(etat: { position: Vec3; yaw: number; pitch: number; mode: CameraMode }): void {
    this.position = etat.position;
    this.yaw = etat.yaw;
    this.pitch = etat.pitch;
    this.mode = etat.mode === 'inspection' ? 'first-person' : etat.mode;
    this.inspectTarget = undefined;
    this.vitesse = { avant: 0, cote: 0 };
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
/**
 * Intention de deplacement lue au clavier.
 *
 * Les lettres deplacent, les fleches font tourner la tete. Auparavant les
 * fleches faisaient un pas de cote et **aucune touche ne permettait de
 * tourner** : sans souris, il etait impossible de regarder autour de soi, donc
 * impossible de visiter le campus au clavier seul.
 */
export function inputFromKeys(pressed: ReadonlySet<string>): ControllerInput {
  const has = (...keys: string[]): boolean => keys.some((key) => pressed.has(key));
  return {
    forward: (has('KeyW', 'KeyZ') ? 1 : 0) - (has('KeyS') ? 1 : 0),
    strafe: (has('KeyD') ? 1 : 0) - (has('KeyA', 'KeyQ') ? 1 : 0),
    turn: (has('ArrowRight') ? 1 : 0) - (has('ArrowLeft') ? 1 : 0),
    look: (has('ArrowUp') ? 1 : 0) - (has('ArrowDown') ? 1 : 0),
    yaw: 0,
    pitch: 0,
    run: has('ShiftLeft', 'ShiftRight'),
  };
}
