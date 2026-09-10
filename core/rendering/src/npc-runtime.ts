import { campusNavigation } from './campus.ts';
import { animationPour, npcs, type NpcSpec } from './npc.ts';
import type { Vec3 } from './scene3d.ts';

/**
 * Vie des personnages.
 *
 * Un personnage ne saute plus d un point a un autre : il suit un chemin
 * calcule sur l espace marchable, a vitesse humaine, en tournant
 * progressivement vers la ou il va. Quand il arrive, il s arrete le temps
 * annonce par sa destination, puis repart.
 *
 * Toute la logique est deterministe et sans dependance au temps reel : elle
 * recoit une duree ecoulee, ce qui la rend verifiable image par image.
 */

export type EtatNpc = 'idle' | 'walking' | 'sitting' | 'interacting';

/** Vitesse de marche, en metres par seconde. Un pas de promenade, pas une course. */
const VITESSE = 1.15;
/** Vitesse de rotation, en radians par seconde. */
const ROTATION = 2.6;
/**
 * Distance a laquelle un point de passage est considere atteint.
 *
 * Elle doit rester petite : le chemin lisse garantit que chaque segment est
 * degage, mais seulement d un point a l autre. Une tolerance large laissait le
 * marcheur couper les virages, quitter ce trace garanti, et venir buter dans un
 * bureau au premier changement de direction.
 */
const TOLERANCE = 0.06;

export interface PresenceNpc {
  id: string;
  position: Vec3;
  orientation: number;
  etat: EtatNpc;
  /** Nom de l animation a jouer, deduit de l etat. */
  animation: string;
  /** Destination courante, pour l affichage en mode developpeur. */
  destination: string | undefined;
}

interface Interne {
  spec: NpcSpec;
  position: Vec3;
  orientation: number;
  orientationVoulue: number;
  etat: EtatNpc;
  /** Index de l etape courante dans l itineraire. */
  etape: number;
  chemin: Vec3[];
  indexChemin: number;
  attente: number;
  /** Dernier endroit sur connu, pour rattraper une navigation qui echoue. */
  dernierPointSur: Vec3;
  /** Echecs consecutifs de deplacement, avant de renoncer a la destination. */
  blocages: number;
}

function distancePlane(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[2] - a[2]);
}

/** Rapproche un angle d un autre par le plus court chemin. */
function tournerVers(courant: number, voulu: number, pas: number): number {
  let ecart = ((voulu - courant + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (ecart < -Math.PI) ecart += Math.PI * 2;
  if (Math.abs(ecart) <= pas) return voulu;
  return courant + Math.sign(ecart) * pas;
}

export class NpcRuntime {
  private readonly gens: Interne[];

  constructor(liste: readonly NpcSpec[] = npcs()) {
    const navigation = campusNavigation();
    this.gens = liste.map((spec) => {
      const sur = navigation.pointSur(spec.position) ?? spec.position;
      return {
        spec,
        position: sur,
        orientation: spec.orientation,
        orientationVoulue: spec.orientation,
        etat: spec.activite === 'assis' ? 'sitting' : 'idle',
        etape: 0,
        chemin: [],
        indexChemin: 0,
        // Une premiere attente decalee evite que tout le monde parte ensemble.
        attente: 2 + liste.indexOf(spec) * 1.7,
        dernierPointSur: sur,
        blocages: 0,
      };
    });
  }

  /** Avance la vie du campus d une duree donnee, en secondes. */
  avancer(secondes: number): void {
    const navigation = campusNavigation();
    const delta = Math.min(0.25, Math.max(0, secondes));

    for (const gens of this.gens) {
      const etapes = gens.spec.itineraire ?? [];
      gens.orientation = tournerVers(gens.orientation, gens.orientationVoulue, ROTATION * delta);

      // Un personnage sans itineraire reste a son poste.
      if (etapes.length < 2) {
        gens.etat = gens.spec.activite === 'assis' ? 'sitting' : 'idle';
        continue;
      }

      if (gens.attente > 0) {
        gens.attente -= delta;
        continue;
      }

      if (gens.chemin.length === 0) {
        const suivante = etapes[(gens.etape + 1) % etapes.length];
        if (!suivante) continue;
        const trace = navigation.chemin(gens.position, suivante.point);
        if (!trace || trace.length === 0) {
          /*
           * Navigation impossible : plutot que d avancer en ligne droite a
           * travers le decor, on revient au dernier endroit sur et on attend.
           * C est la regle qui empeche un personnage de finir dans un mur.
           */
          gens.position = gens.dernierPointSur;
          gens.attente = 4;
          continue;
        }
        gens.chemin = trace;
        gens.indexChemin = 0;
        gens.etat = 'walking';
        gens.etape = (gens.etape + 1) % etapes.length;
        continue;
      }

      const cible = gens.chemin[gens.indexChemin];
      if (!cible) {
        gens.chemin = [];
        continue;
      }

      const reste = distancePlane(gens.position, cible);
      if (reste <= TOLERANCE) {
        // On se recale exactement sur le point : sans cela, l ecart residuel
        // s accumule d un segment a l autre et finit par sortir du couloir sur.
        gens.position = [cible[0], gens.position[1], cible[2]];
        gens.indexChemin += 1;
        if (gens.indexChemin >= gens.chemin.length) {
          const arrivee = etapes[gens.etape];
          gens.chemin = [];
          gens.attente = arrivee?.pause ?? 6;
          gens.etat = arrivee?.activite === 'assis' ? 'sitting' : 'idle';
          gens.dernierPointSur = gens.position;
        }
        continue;
      }

      const avance = Math.min(VITESSE * delta, reste);
      const nouvelle: Vec3 = [
        gens.position[0] + ((cible[0] - gens.position[0]) / reste) * avance,
        gens.position[1],
        gens.position[2] + ((cible[2] - gens.position[2]) / reste) * avance,
      ];

      /*
       * Verification a chaque pas : aucun deplacement ne quitte le marchable.
       *
       * En cas de refus, on ne renvoie pas la personne en arriere : la ramener
       * a son dernier point sur produisait un recul visible, et elle repartait
       * aussitot pour rebuter au meme endroit. On recalcule simplement un
       * chemin depuis la ou elle se trouve, qui est un endroit valide.
       */
      if (navigation.estMarchable(nouvelle)) {
        gens.position = nouvelle;
        gens.dernierPointSur = nouvelle;
        gens.blocages = 0;
      } else {
        gens.chemin = [];
        gens.blocages += 1;
        if (gens.blocages >= 3) {
          // Trois echecs de suite : la destination est hors d atteinte, on
          // repose la personne a son dernier endroit sur et on passe a la suite.
          gens.position = gens.dernierPointSur;
          gens.blocages = 0;
          gens.attente = 3;
          gens.etat = 'idle';
        }
        continue;
      }

      gens.orientationVoulue = Math.atan2(
        cible[0] - gens.position[0],
        cible[2] - gens.position[2],
      );
      gens.etat = 'walking';
    }
  }

  /** Etat courant de chaque personne, pour l affichage. */
  presences(): PresenceNpc[] {
    return this.gens.map((gens) => ({
      id: gens.spec.id,
      position: gens.position,
      orientation: gens.orientation,
      etat: gens.etat,
      animation: animationDeLEtat(gens.etat, gens.spec),
      destination: gens.spec.itineraire?.[gens.etape]?.nom,
    }));
  }

  /** Marque une personne comme occupee par une conversation. */
  engager(id: string, engage: boolean): void {
    const gens = this.gens.find((entree) => entree.spec.id === id);
    if (!gens) return;
    if (engage) {
      gens.etat = 'interacting';
      gens.chemin = [];
      // On ne s en va pas au milieu d une phrase.
      gens.attente = Math.max(gens.attente, 6);
    } else if (gens.etat === 'interacting') {
      gens.etat = 'idle';
    }
  }
}

/** Animation correspondant a l etat courant. */
export function animationDeLEtat(etat: EtatNpc, spec: NpcSpec): string {
  if (etat === 'walking') return 'walk';
  if (etat === 'sitting') return 'sit';
  if (etat === 'interacting') return 'emote-yes';
  return animationPour(spec.activite === 'ronde' ? 'debout' : spec.activite);
}
