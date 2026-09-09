/**
 * Fondation audio de TSSR NEO.
 *
 * Quatre bus separes, un bus maitre, spatialisation optionnelle, et surtout
 * une degradation propre : si le navigateur refuse le son, l application
 * continue normalement et l etat le dit clairement. Les sons sont synthetises
 * a l execution : aucun fichier a telecharger, aucun service payant.
 */

export type BusName = 'ambience' | 'sfx' | 'voice' | 'music';

export interface AudioLevels {
  master: number;
  ambience: number;
  sfx: number;
  voice: number;
  music: number;
}

export const DEFAULT_LEVELS: AudioLevels = {
  master: 0.7,
  ambience: 0.5,
  sfx: 0.8,
  voice: 0.8,
  music: 0.4,
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
  | 'notification';

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
  private readonly createContext: () => AudioContext | undefined;
  private listeners = new Set<(status: AudioStatus) => void>();

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
  startAmbience(): boolean {
    const context = this.context;
    const bus = this.buses.get('ambience');
    if (!context || !bus || this.ambienceSource) return false;

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
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;
    const gain = context.createGain();
    gain.gain.value = 0.25;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start();
    this.ambienceSource = { stop: () => source.stop() };
    return true;
  }

  stopAmbience(): void {
    try {
      this.ambienceSource?.stop();
    } catch {
      // Une source deja arretee n est pas une erreur.
    }
    this.ambienceSource = undefined;
  }

  async dispose(): Promise<void> {
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
