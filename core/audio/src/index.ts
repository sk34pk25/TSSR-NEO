/**
 * Fondation audio de TSSR NEO.
 *
 * Quatre bus separes, un bus maitre, spatialisation optionnelle, et surtout
 * une degradation propre : si le navigateur refuse le son, l application
 * continue normalement et l etat le dit clairement. Les sons sont synthetises
 * a l execution : aucun fichier a telecharger, aucun service payant.
 */

import { Musique } from './musique.ts';

export type BusName = 'ambience' | 'sfx' | 'voice' | 'music';

export interface AudioLevels {
  master: number;
  ambience: number;
  sfx: number;
  voice: number;
  music: number;
}

/*
 * Niveaux de depart.
 *
 * La musique reste basse : elle ne doit jamais couvrir un dialogue, un retour
 * d action ou l ambiance d une piece. C est la voix qui domine, puis les
 * effets, puis l ambiance, puis la musique.
 */
export const DEFAULT_LEVELS: AudioLevels = {
  master: 0.7,
  ambience: 0.35,
  sfx: 0.65,
  voice: 0.8,
  music: 0.3,
};

export type AudioStatus = 'inactif' | 'en-attente-interaction' | 'actif' | 'muet' | 'indisponible';

/** Sons du systeme, decrits par leur intention et non par un fichier. */
export type CueName =
  | 'objectif-atteint'
  | 'objectif-perdu'
  | 'alerte'
  | 'commande-refusee'
  | 'connexion-etablie'
  | 'cable-branche'
  | 'cable-debranche'
  | 'notification'
  // Interface : tres courts et tres discrets, sinon ils fatiguent.
  | 'clic'
  | 'survol'
  | 'panneau-ouvert'
  | 'panneau-ferme'
  | 'validation'
  | 'erreur'
  // Monde : ce qu on entend en manipulant les lieux.
  | 'porte-ouverte'
  | 'porte-fermee'
  | 'baie-ouverte'
  | 'pas-moquette'
  | 'pas-dur'
  | 'frappe-clavier';

interface CueSpec {
  /** Frequences successives, en hertz. */
  notes: number[];
  duration: number;
  type: OscillatorType;
  bus: BusName;
  gain: number;
}

const CUES: Record<CueName, CueSpec> = {
  'objectif-atteint': {
    notes: [523.25, 659.25, 783.99],
    duration: 0.18,
    type: 'sine',
    bus: 'sfx',
    gain: 0.5,
  },
  'objectif-perdu': {
    notes: [392, 311.13],
    duration: 0.22,
    type: 'triangle',
    bus: 'sfx',
    gain: 0.45,
  },
  alerte: { notes: [880, 660, 880], duration: 0.16, type: 'square', bus: 'sfx', gain: 0.35 },
  'commande-refusee': { notes: [220], duration: 0.12, type: 'sawtooth', bus: 'sfx', gain: 0.28 },
  'connexion-etablie': {
    notes: [587.33, 880],
    duration: 0.14,
    type: 'sine',
    bus: 'sfx',
    gain: 0.4,
  },
  'cable-branche': { notes: [330, 494], duration: 0.1, type: 'triangle', bus: 'sfx', gain: 0.45 },
  'cable-debranche': { notes: [494, 330], duration: 0.1, type: 'triangle', bus: 'sfx', gain: 0.45 },
  notification: { notes: [659.25, 987.77], duration: 0.12, type: 'sine', bus: 'sfx', gain: 0.32 },

  /*
   * Sons d interface.
   *
   * Un clic doit s entendre sans se remarquer : quelques centiemes de seconde,
   * un niveau bas, et aucune hauteur marquee. Un son de clic trop present
   * devient insupportable des la dixieme utilisation.
   */
  clic: { notes: [1180], duration: 0.028, type: 'sine', bus: 'sfx', gain: 0.1 },
  survol: { notes: [1560], duration: 0.02, type: 'sine', bus: 'sfx', gain: 0.045 },
  'panneau-ouvert': { notes: [520, 780], duration: 0.06, type: 'sine', bus: 'sfx', gain: 0.14 },
  'panneau-ferme': { notes: [780, 520], duration: 0.06, type: 'sine', bus: 'sfx', gain: 0.12 },
  validation: { notes: [784, 1046.5], duration: 0.08, type: 'sine', bus: 'sfx', gain: 0.2 },
  erreur: { notes: [196, 155.56], duration: 0.16, type: 'triangle', bus: 'sfx', gain: 0.22 },

  // Monde : matieres et mecanismes, volontairement sourds.
  'porte-ouverte': { notes: [180, 260], duration: 0.14, type: 'triangle', bus: 'sfx', gain: 0.26 },
  'porte-fermee': { notes: [260, 150], duration: 0.13, type: 'triangle', bus: 'sfx', gain: 0.28 },
  'baie-ouverte': { notes: [140, 190, 160], duration: 0.11, type: 'sawtooth', bus: 'sfx', gain: 0.2 },
  // Un pas ne doit pas s entendre comme une note : la hauteur reste tres basse.
  'pas-moquette': { notes: [88], duration: 0.05, type: 'triangle', bus: 'sfx', gain: 0.06 },
  'pas-dur': { notes: [132], duration: 0.04, type: 'square', bus: 'sfx', gain: 0.05 },
  'frappe-clavier': { notes: [900], duration: 0.018, type: 'square', bus: 'sfx', gain: 0.05 },
};

/**
 * Caractere d un lit sonore.
 *
 * Un local technique, un hall et une salle de documentation ne sonnent pas
 * pareil, et c est ce qui rend un lieu credible autant que ce qu on y voit. Les
 * profils decrivent une intention, jamais un fichier : le lit est synthetise.
 */
export interface AmbienceProfile {
  /** Coupure du filtre passe-bas, en hertz. Plus haut, plus siffant. */
  cutoff: number;
  /** Niveau du lit, entre 0 et 1. */
  gain: number;
}

export type AmbienceName = 'neutre' | 'hall' | 'bureau' | 'technique' | 'calme' | 'atelier';

export const AMBIENCES: Record<AmbienceName, AmbienceProfile> = {
  neutre: { cutoff: 620, gain: 0.25 },
  // Un hall carrele porte loin et reste grave.
  hall: { cutoff: 420, gain: 0.22 },
  // Un plateau de bureaux : rumeur sourde, presque rien.
  bureau: { cutoff: 520, gain: 0.16 },
  // Une salle machine est bruyante et aigue : ce sont les ventilateurs.
  technique: { cutoff: 2100, gain: 0.42 },
  // Une salle de documentation doit s entendre comme silencieuse.
  calme: { cutoff: 340, gain: 0.09 },
  atelier: { cutoff: 900, gain: 0.24 },
};

export interface AudioEngineOptions {
  levels?: Partial<AudioLevels>;
  /** Contexte injectable, pour les tests et pour les environnements sans son. */
  createContext?: () => AudioContext | undefined;
}

/**
 * Moteur audio.
 * Aucune ressource n est creee tant que le son n est pas reellement demande :
 * les navigateurs exigent une interaction utilisateur avant de produire du son.
 */
export class AudioEngine {
  private context: AudioContext | undefined;
  private masterGain: GainNode | undefined;
  private buses = new Map<BusName, GainNode>();
  private levels: AudioLevels;
  private status: AudioStatus = 'inactif';
  private muted = false;
  private ambienceSource: { stop: () => void } | undefined;
  private ambienceFilter: BiquadFilterNode | undefined;
  private ambienceGain: GainNode | undefined;
  private ambienceName: AmbienceName = 'neutre';
  private readonly createContext: () => AudioContext | undefined;
  private listeners = new Set<(status: AudioStatus) => void>();
  private musique: Musique | undefined;
  /** Attenuation de la musique demandee par une parole en cours. */
  private paroleEnCours = false;

  constructor(options: AudioEngineOptions = {}) {
    this.levels = { ...DEFAULT_LEVELS, ...options.levels };
    this.createContext =
      options.createContext ??
      (() => {
        const Ctor =
          typeof window === 'undefined'
            ? undefined
            : (window.AudioContext ??
              (window as unknown as { webkitAudioContext?: typeof AudioContext })
                .webkitAudioContext);
        return Ctor ? new Ctor() : undefined;
      });
  }

  subscribe(listener: (status: AudioStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(status: AudioStatus): void {
    this.status = status;
    for (const listener of this.listeners) listener(status);
  }

  getStatus(): AudioStatus {
    return this.status;
  }

  getLevels(): AudioLevels {
    return { ...this.levels };
  }

  /**
   * Initialise la chaine audio.
   * A appeler depuis un geste utilisateur : sans cela le navigateur suspend
   * le contexte, ce que l on signale au lieu de le masquer.
   */
  async resume(): Promise<AudioStatus> {
    if (this.status === 'indisponible') return this.status;
    try {
      if (!this.context) {
        const context = this.createContext();
        if (!context) {
          this.setStatus('indisponible');
          return this.status;
        }
        this.context = context;
        this.masterGain = context.createGain();
        this.masterGain.connect(context.destination);
        for (const bus of ['ambience', 'sfx', 'voice', 'music'] as BusName[]) {
          const gain = context.createGain();
          gain.connect(this.masterGain);
          this.buses.set(bus, gain);
        }
        this.applyLevels();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.setStatus(
        this.muted ? 'muet' : this.context.state === 'running' ? 'actif' : 'en-attente-interaction',
      );
    } catch {
      // Aucun son n est un mode degrade acceptable : jamais une erreur bloquante.
      this.setStatus('indisponible');
    }
    return this.status;
  }

  private applyLevels(): void {
    const factor = this.muted ? 0 : 1;
    if (this.masterGain) this.masterGain.gain.value = this.levels.master * factor;
    for (const [name, node] of this.buses) node.gain.value = this.levels[name];
  }

  setLevels(levels: Partial<AudioLevels>): void {
    this.levels = { ...this.levels, ...levels };
    this.applyLevels();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyLevels();
    if (this.status === 'actif' || this.status === 'muet') {
      this.setStatus(muted ? 'muet' : 'actif');
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  /**
   * Joue un son du systeme.
   * Retourne false si le son n a pas pu etre produit : l appelant peut alors
   * s appuyer sur un retour visuel, jamais supposer que le son a ete entendu.
   */
  play(cue: CueName, options: { pan?: number } = {}): boolean {
    const context = this.context;
    const spec = CUES[cue];
    if (!context || this.status === 'indisponible' || this.muted) return false;
    const bus = this.buses.get(spec.bus);
    if (!bus) return false;

    const now = context.currentTime;
    let destination: AudioNode = bus;
    if (options.pan !== undefined && typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, options.pan));
      panner.connect(bus);
      destination = panner;
    }

    spec.notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = spec.type;
      oscillator.frequency.value = frequency;
      const start = now + index * spec.duration * 0.7;
      const end = start + spec.duration;
      // Enveloppe courte : un clic sec est desagreable et fatigant.
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(spec.gain, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain);
      gain.connect(destination);
      oscillator.start(start);
      oscillator.stop(end + 0.02);
    });
    return true;
  }

  /**
   * Ambiance de salle technique : souffle de ventilation genere par filtrage
   * de bruit. Elle donne une presence sans jamais couvrir la parole.
   */
  startAmbience(ambience: AmbienceName = 'neutre'): boolean {
    const context = this.context;
    const bus = this.buses.get('ambience');
    if (!context || !bus) return false;
    if (this.ambienceSource) {
      // Deja en cours : on change de caractere sans recreer la source.
      this.setAmbience(ambience);
      return false;
    }

    const seconds = 4;
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < data.length; i += 1) {
      // Bruit brun : plus doux et moins fatigant qu un bruit blanc.
      const white = Math.random() * 2 - 1;
      previous = (previous + 0.02 * white) / 1.02;
      data[i] = previous * 3.5;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const profil = AMBIENCES[ambience];
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = profil.cutoff;
    const gain = context.createGain();
    gain.gain.value = profil.gain;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start();
    this.ambienceFilter = filter;
    this.ambienceGain = gain;
    this.ambienceName = ambience;
    this.ambienceSource = { stop: () => source.stop() };
    return true;
  }

  /**
   * Change le caractere du lit sonore en cours.
   *
   * La transition est progressive : une coupure nette entre deux pieces
   * s entend comme un defaut, alors qu un lieu change de son quand on avance.
   */
  setAmbience(ambience: AmbienceName): void {
    if (this.ambienceName === ambience) return;
    this.ambienceName = ambience;
    const context = this.context;
    const profil = AMBIENCES[ambience];
    if (!context || !this.ambienceFilter || !this.ambienceGain) return;
    const maintenant = context.currentTime;
    this.ambienceFilter.frequency.setTargetAtTime(profil.cutoff, maintenant, 0.6);
    this.ambienceGain.gain.setTargetAtTime(profil.gain, maintenant, 0.6);
  }

  /** Caractere actuellement en place, pour l afficher ou le verifier. */
  currentAmbience(): AmbienceName {
    return this.ambienceName;
  }

  /**
   * Proximite de la source d ambiance, entre 0 et 1.
   *
   * Le bruit des ventilateurs ne s entendait pas differemment a un metre d une
   * baie et a quinze metres de la salle machine. Ce facteur multiplie le
   * niveau du lit sonore : a l autre bout du couloir, il ne reste qu une rumeur.
   */
  setAmbienceProximity(proximite: number): void {
    const context = this.context;
    if (!context || !this.ambienceGain) return;
    const borne = Math.max(0, Math.min(1, proximite));
    const profil = AMBIENCES[this.ambienceName];
    // Un plancher : une piece n est jamais totalement silencieuse.
    const niveau = profil.gain * (0.28 + 0.72 * borne);
    this.ambienceGain.gain.setTargetAtTime(niveau, context.currentTime, 0.5);
  }

  /**
   * Lance la musique de fond.
   *
   * Elle ne demarre qu une fois le contexte autorise par un geste utilisateur :
   * un navigateur refuse tout son avant cela, et faire semblant produirait une
   * erreur au lieu d une musique.
   */
  startMusic(): boolean {
    const context = this.context;
    const bus = this.buses.get('music');
    if (!context || !bus) return false;
    this.musique ??= new Musique({ context, destination: bus });
    if (this.musique.estActive()) return false;
    this.musique.demarrer();
    this.musique.attenuer(this.paroleEnCours);
    return true;
  }

  stopMusic(): void {
    this.musique?.arreter();
  }

  isMusicPlaying(): boolean {
    return this.musique?.estActive() ?? false;
  }

  /**
   * Abaisse la musique pendant une parole.
   *
   * Sans cela, un dialogue passe derriere la nappe et devient penible a suivre.
   */
  setSpeaking(parole: boolean): void {
    this.paroleEnCours = parole;
    this.musique?.attenuer(parole);
  }

  stopAmbience(): void {
    this.ambienceFilter = undefined;
    this.ambienceGain = undefined;
    this.ambienceName = 'neutre';
    try {
      this.ambienceSource?.stop();
    } catch {
      // Une source deja arretee n est pas une erreur.
    }
    this.ambienceSource = undefined;
  }

  async dispose(): Promise<void> {
    this.stopMusic();
    this.musique = undefined;
    this.stopAmbience();
    try {
      await this.context?.close();
    } catch {
      // Fermeture impossible : sans consequence.
    }
    this.context = undefined;
    this.buses.clear();
    this.masterGain = undefined;
    this.setStatus('inactif');
  }
}

/** Sons associes aux evenements du moteur, pour un retour immediat et coherent. */
export const EVENT_CUES: Record<string, CueName> = {
  'mission.objective.completed': 'objectif-atteint',
  'mission.objective.regressed': 'objectif-perdu',
  'monitoring.alert.raised': 'alerte',
  'hardware.patched': 'cable-branche',
  'hardware.unpatched': 'cable-debranche',
  'remote.session.opened': 'connexion-etablie',
  'itsm.ticket.created': 'notification',
};
