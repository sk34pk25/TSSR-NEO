import type { Preferences } from '@tssr/contracts';

/**
 * Commandes du campus.
 *
 * Elles etaient cablees dans le composant de rendu, decrites nulle part, et la
 * seule aide affichee decrivait des touches qui n existaient pas. Elles vivent
 * desormais ici : nommees, remappables, et exprimees dans un vocabulaire que
 * l utilisateur reconnait.
 */

export type ActionCampus =
  | 'avancer'
  | 'reculer'
  | 'gauche'
  | 'droite'
  | 'tournerGauche'
  | 'tournerDroite'
  | 'regarderHaut'
  | 'regarderBas'
  | 'courir'
  | 'interagir'
  | 'commandes';

export interface DescriptionAction {
  action: ActionCampus;
  libelle: string;
  /** Regroupement pour l affichage : deplacement, regard, actions. */
  famille: 'deplacement' | 'regard' | 'action';
}

export const ACTIONS: readonly DescriptionAction[] = [
  { action: 'avancer', libelle: 'Avancer', famille: 'deplacement' },
  { action: 'reculer', libelle: 'Reculer', famille: 'deplacement' },
  { action: 'gauche', libelle: 'Pas a gauche', famille: 'deplacement' },
  { action: 'droite', libelle: 'Pas a droite', famille: 'deplacement' },
  { action: 'courir', libelle: 'Marcher plus vite', famille: 'deplacement' },
  { action: 'tournerGauche', libelle: 'Tourner a gauche', famille: 'regard' },
  { action: 'tournerDroite', libelle: 'Tourner a droite', famille: 'regard' },
  { action: 'regarderHaut', libelle: 'Regarder vers le haut', famille: 'regard' },
  { action: 'regarderBas', libelle: 'Regarder vers le bas', famille: 'regard' },
  { action: 'interagir', libelle: 'Utiliser ce qu on a devant soi', famille: 'action' },
  { action: 'commandes', libelle: 'Afficher les commandes', famille: 'action' },
];

export type Bindings = Record<ActionCampus, string>;

/**
 * Disposition francaise.
 *
 * Z Q S D, et non W A S D : melanger les deux logiques donnait un clavier ou
 * la moitie des touches tombaient sous des doigts differents selon la machine.
 */
export const PRESET_AZERTY: Bindings = {
  avancer: 'KeyZ',
  reculer: 'KeyS',
  gauche: 'KeyQ',
  droite: 'KeyD',
  tournerGauche: 'ArrowLeft',
  tournerDroite: 'ArrowRight',
  regarderHaut: 'ArrowUp',
  regarderBas: 'ArrowDown',
  courir: 'ShiftLeft',
  interagir: 'KeyE',
  commandes: 'F1',
};

export const PRESET_QWERTY: Bindings = {
  ...PRESET_AZERTY,
  avancer: 'KeyW',
  gauche: 'KeyA',
};

export const PRESETS: Record<'azerty' | 'qwerty', Bindings> = {
  azerty: PRESET_AZERTY,
  qwerty: PRESET_QWERTY,
};

/**
 * Nom lisible d un code de touche.
 *
 * Le code physique ne dit rien a personne : `KeyZ` doit s afficher « Z », et
 * `ArrowLeft` « Fleche gauche ».
 */
export function nomDeTouche(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Pave ${code.slice(6)}`;
  const noms: Record<string, string> = {
    ArrowLeft: 'Fleche gauche',
    ArrowRight: 'Fleche droite',
    ArrowUp: 'Fleche haut',
    ArrowDown: 'Fleche bas',
    ShiftLeft: 'Maj gauche',
    ShiftRight: 'Maj droite',
    ControlLeft: 'Ctrl gauche',
    ControlRight: 'Ctrl droit',
    AltLeft: 'Alt',
    AltRight: 'Alt Gr',
    Space: 'Espace',
    Escape: 'Echap',
    Tab: 'Tab',
    Enter: 'Entree',
    Backquote: 'Carre',
  };
  return noms[code] ?? code;
}

/** Action deja associee a une touche, pour signaler un conflit. */
export function conflit(
  bindings: Bindings,
  code: string,
  sauf: ActionCampus,
): ActionCampus | undefined {
  return (Object.keys(bindings) as ActionCampus[]).find(
    (action) => action !== sauf && bindings[action] === code,
  );
}

/** Touches valides : on refuse ce qui casserait le navigateur ou la page. */
const INTERDITES = new Set(['Escape', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight']);

export function toucheAcceptable(code: string): boolean {
  return code.length > 0 && !INTERDITES.has(code);
}

/** Commandes effectives, avec repli sur la disposition francaise. */
export function bindingsDe(preferences: Preferences): Bindings {
  const stockees = preferences.keybindings as Partial<Record<ActionCampus, string>>;
  const base = { ...PRESET_AZERTY };
  for (const action of Object.keys(base) as ActionCampus[]) {
    const code = stockees[action];
    if (typeof code === 'string' && toucheAcceptable(code)) base[action] = code;
  }
  return base;
}
