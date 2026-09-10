/**
 * Musique d ambiance.
 *
 * Piece originale, generee par le moteur : aucun fichier n est telecharge,
 * donc aucune question de licence ne se pose et aucun octet ne s ajoute au
 * chargement. Elle boucle par construction, ce qu un enregistrement ne fait
 * jamais parfaitement.
 *
 * L intention est celle d un simulateur professionnel : calme, lente, sans
 * evenement marquant. Une musique de fond qui se remarque a echoue.
 */

/** Un accord, exprime en demi-tons au-dessus de la fondamentale. */
type Accord = readonly number[];

/**
 * Progression en la majeur, quatre accords a sept temps chacun.
 *
 * Les septiemes majeures et mineures evitent la couleur triomphale des accords
 * parfaits : on cherche une assise, pas une annonce.
 */
const PROGRESSION: readonly Accord[] = [
  [0, 4, 7, 11], // la majeur septieme
  [-3, 0, 4, 7], // fa diese mineur septieme
  [-7, -3, 0, 5], // re majeur septieme
  [-10, -5, -1, 2], // si mineur septieme
];

/** Fondamentale, volontairement basse : une nappe ne doit pas occuper l aigu. */
const FONDAMENTALE = 110;
/** Duree d un accord, en secondes. Assez long pour qu on cesse d y prêter attention. */
const DUREE_ACCORD = 11;

function frequence(demiTons: number): number {
  return FONDAMENTALE * Math.pow(2, demiTons / 12);
}

export interface MusiqueOptions {
  context: AudioContext;
  /** Bus de destination, deja regle au niveau voulu. */
  destination: AudioNode;
}

/**
 * Nappe generative.
 *
 * Chaque accord est joue par des oscillateurs legerement desaccordes, passes
 * dans un filtre passe-bas dont la coupure respire lentement. Les enveloppes se
 * chevauchent d un accord a l autre : sans ce recouvrement, on entendrait la
 * jointure, exactement le defaut qu on reproche a une boucle mal faite.
 */
export class Musique {
  private readonly context: AudioContext;
  private readonly destination: AudioNode;
  private readonly sortie: GainNode;
  private readonly filtre: BiquadFilterNode;
  private minuterie: ReturnType<typeof setTimeout> | undefined;
  private accord = 0;
  private active = false;
  /** Attenuation temporaire, quand une voix doit passer devant. */
  private attenuation = 1;

  constructor(options: MusiqueOptions) {
    this.context = options.context;
    this.destination = options.destination;

    this.filtre = this.context.createBiquadFilter();
    this.filtre.type = 'lowpass';
    this.filtre.frequency.value = 900;
    this.filtre.Q.value = 0.6;

    this.sortie = this.context.createGain();
    this.sortie.gain.value = 0;

    this.filtre.connect(this.sortie);
    this.sortie.connect(this.destination);
  }

  demarrer(): void {
    if (this.active) return;
    this.active = true;
    // Entree progressive : une musique qui commence net se remarque.
    const maintenant = this.context.currentTime;
    this.sortie.gain.cancelScheduledValues(maintenant);
    this.sortie.gain.setValueAtTime(0, maintenant);
    this.sortie.gain.linearRampToValueAtTime(this.attenuation, maintenant + 4);
    this.jouerAccord();
  }

  arreter(): void {
    if (!this.active) return;
    this.active = false;
    if (this.minuterie !== undefined) clearTimeout(this.minuterie);
    this.minuterie = undefined;
    const maintenant = this.context.currentTime;
    this.sortie.gain.cancelScheduledValues(maintenant);
    this.sortie.gain.setTargetAtTime(0, maintenant, 0.8);
  }

  estActive(): boolean {
    return this.active;
  }

  /**
   * Abaisse la musique le temps d une parole.
   *
   * Six decibels : de quoi laisser passer un dialogue sans donner l impression
   * que la musique s est arretee.
   */
  attenuer(reduire: boolean): void {
    this.attenuation = reduire ? 0.5 : 1;
    if (!this.active) return;
    this.sortie.gain.setTargetAtTime(this.attenuation, this.context.currentTime, 0.35);
  }

  private jouerAccord(): void {
    if (!this.active) return;
    const debut = this.context.currentTime + 0.05;
    const accord = PROGRESSION[this.accord % PROGRESSION.length] as Accord;
    this.accord += 1;

    for (const [rang, demiTons] of accord.entries()) {
      // Deux oscillateurs par note, legerement desaccordes : c est ce
      // battement lent qui donne son epaisseur a une nappe.
      for (const desaccord of [-3, 3]) {
        const oscillateur = this.context.createOscillator();
        oscillateur.type = rang === 0 ? 'sine' : 'triangle';
        oscillateur.frequency.value = frequence(demiTons) * Math.pow(2, desaccord / 1200);

        const enveloppe = this.context.createGain();
        const niveau = rang === 0 ? 0.16 : 0.075;
        enveloppe.gain.setValueAtTime(0, debut);
        enveloppe.gain.linearRampToValueAtTime(niveau, debut + 3.2);
        enveloppe.gain.setValueAtTime(niveau, debut + DUREE_ACCORD - 3.5);
        enveloppe.gain.linearRampToValueAtTime(0, debut + DUREE_ACCORD + 1.4);

        oscillateur.connect(enveloppe);
        enveloppe.connect(this.filtre);
        oscillateur.start(debut);
        oscillateur.stop(debut + DUREE_ACCORD + 1.6);
      }
    }

    // La coupure respire : sans ce mouvement, la nappe devient une note tenue.
    const coupure = 700 + (this.accord % 2 === 0 ? 260 : 0);
    this.filtre.frequency.setTargetAtTime(coupure, debut, 3.5);

    // L accord suivant demarre avant la fin du precedent : ils se recouvrent.
    this.minuterie = setTimeout(() => this.jouerAccord(), (DUREE_ACCORD - 1.2) * 1000);
  }
}
