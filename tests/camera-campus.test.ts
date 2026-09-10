import { describe, expect, it } from 'vitest';
import {
  CAMPUS_SPAWN,
  CampusCameraController,
  NEUTRAL_INPUT,
  inputFromKeys,
  type ControllerInput,
} from '@tssr/rendering';

/**
 * Non-regression du controleur de camera.
 *
 * Chacune de ces verifications correspond a un defaut reellement reproduit
 * pendant l audit V0.4, et decrit un geste d utilisateur, jamais une structure
 * interne.
 */

function avancer(
  controleur: CampusCameraController,
  input: Partial<ControllerInput>,
  images: number,
  msParImage = 16,
): void {
  for (let i = 0; i < images; i += 1) {
    controleur.update({ ...NEUTRAL_INPUT, ...input }, msParImage);
  }
}

function cap(controleur: CampusCameraController): number {
  return controleur.snapshot().yaw;
}

describe('deplacement au clavier', () => {
  it('les lettres deplacent et les fleches tournent', () => {
    const clavier = inputFromKeys(new Set(['KeyZ', 'ArrowRight']));
    expect(clavier.forward).toBe(1);
    // Une fleche ne doit plus produire de pas de cote : elle fait tourner.
    expect(clavier.strafe).toBe(0);
    expect(clavier.turn).toBe(1);
  });

  it('on peut regarder autour de soi sans souris', () => {
    const controleur = new CampusCameraController(CAMPUS_SPAWN, 0);
    const depart = cap(controleur);
    avancer(controleur, inputFromKeys(new Set(['ArrowRight'])), 60);
    expect(Math.abs(cap(controleur) - depart)).toBeGreaterThan(1);
  });

  it('la rotation ne depend pas de la cadence d affichage', () => {
    const rapide = new CampusCameraController(CAMPUS_SPAWN, 0);
    const lent = new CampusCameraController(CAMPUS_SPAWN, 0);
    // Une seconde de rotation, a soixante puis a vingt images par seconde.
    avancer(rapide, inputFromKeys(new Set(['ArrowRight'])), 60, 16.67);
    avancer(lent, inputFromKeys(new Set(['ArrowRight'])), 20, 50);
    expect(Math.abs(cap(rapide) - cap(lent))).toBeLessThan(0.05);
  });
});

describe('inertie', () => {
  it('la vitesse monte progressivement au lieu de sauter au maximum', () => {
    const controleur = new CampusCameraController([0, 1.6, 0], 0);
    const depart = controleur.snapshot().position[2];
    controleur.update({ ...NEUTRAL_INPUT, forward: 1 }, 16);
    const apresUneImage = controleur.snapshot().position[2];
    const parcouruPremiereImage = Math.abs(apresUneImage - depart);

    // Apres une demi-seconde, la vitesse de croisiere est atteinte.
    avancer(controleur, { forward: 1 }, 30);
    const avantDerniere = controleur.snapshot().position[2];
    controleur.update({ ...NEUTRAL_INPUT, forward: 1 }, 16);
    const parcouruEnRegime = Math.abs(controleur.snapshot().position[2] - avantDerniere);

    expect(parcouruPremiereImage).toBeLessThan(parcouruEnRegime / 3);
  });

  it('le personnage s arrete au relachement, sans glisser indefiniment', () => {
    const controleur = new CampusCameraController([0, 1.6, 0], 0);
    avancer(controleur, { forward: 1 }, 40);
    const auRelachement = controleur.snapshot().position[2];
    avancer(controleur, {}, 40);
    const apres = controleur.snapshot().position[2];
    const glissade = Math.abs(apres - auRelachement);
    expect(glissade).toBeGreaterThan(0);
    // Moins d un demi-metre : un amorti, pas un patinage.
    expect(glissade).toBeLessThan(0.5);
  });
});

describe('modes de camera', () => {
  it('se deplacer depuis une inspection rend la main a hauteur d homme', () => {
    const controleur = new CampusCameraController([0, 1.6, 0], 0);
    controleur.inspect({ position: [4, 1.7, 4], target: [4, 1.2, 0] });
    expect(controleur.snapshot().mode).toBe('inspection');
    avancer(controleur, { forward: 1 }, 5);
    // Auparavant on basculait en troisieme personne, sans l avoir demande.
    expect(controleur.snapshot().mode).toBe('first-person');
  });

  it('un releve permet de revenir exactement au meme endroit', () => {
    const controleur = new CampusCameraController(CAMPUS_SPAWN, 0);
    avancer(controleur, { forward: 1, turn: 1 }, 45);
    const releve = controleur.snapshot();

    const nouveau = new CampusCameraController(CAMPUS_SPAWN, 0);
    nouveau.restore(releve);
    expect(nouveau.snapshot().position).toEqual(releve.position);
    expect(nouveau.snapshot().yaw).toBeCloseTo(releve.yaw, 6);
    expect(nouveau.snapshot().pitch).toBeCloseTo(releve.pitch, 6);
  });

  it('une vue d ensemble ne se deplace pas au clavier', () => {
    const controleur = new CampusCameraController([0, 1.6, 0], 0);
    controleur.setMode('tactical');
    const depart = controleur.snapshot().position;
    avancer(controleur, { forward: 1 }, 30);
    expect(controleur.snapshot().position).toEqual(depart);
  });
});
