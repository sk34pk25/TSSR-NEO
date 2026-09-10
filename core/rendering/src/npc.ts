import { objet, varier, alea, type Piece, type Placement } from './kit.ts';
import { MATERIALS } from './materials.ts';
import { campusNavigation, zoneById, type CampusZone } from './campus.ts';
import type { Scene3DNode, Vec3 } from './scene3d.ts';

/**
 * Presence humaine dans le campus.
 *
 * Le batiment etait meuble mais vide de monde, ce qui reste le defaut le plus
 * immediatement perceptible. Ces personnages ne simulent aucune intelligence :
 * ils occupent un poste, se deplacent entre quelques points de passage, et
 * savent dire ce qu ils constatent. C est exactement ce qu il faut pour qu un
 * lieu de travail se lise comme tel, et pour qu un diagnostic commence par une
 * conversation plutot que par une commande.
 */

export type NpcRole =
  | 'accueil'
  | 'utilisateur'
  | 'technicien'
  | 'responsable'
  | 'formateur';

export type NpcActivite = 'assis' | 'debout' | 'ronde';

export interface NpcDialogue {
  /** Ce que dit le personnage quand on l aborde. */
  ouverture: string;
  /**
   * Questions que le joueur peut poser, et ce qu elles revelent.
   *
   * Elles enseignent le diagnostic humain : depuis quand, qu est-ce qui a
   * change, quel message exact. Aucune ne donne la cause : elles donnent des
   * symptomes, que le joueur doit relier lui-meme.
   */
  questions: readonly { question: string; reponse: string }[];
}

export interface NpcSpec {
  id: string;
  nom: string;
  role: NpcRole;
  /** Zone ou le personnage se tient habituellement. */
  zoneId: string;
  /** Position au sol, dans le repere du campus. */
  position: Vec3;
  orientation: number;
  activite: NpcActivite;
  /** Modele du registre d assets. */
  asset: string;
  /**
   * Itineraire, exprime en destinations qui ont un sens dans le metier.
   *
   * Le trajet entre deux destinations n est plus une ligne droite : il est
   * calcule par l espace marchable, donc il contourne les murs et le mobilier.
   */
  itineraire?: readonly Etape[];
  dialogue: NpcDialogue;
}

/**
 * Position au sol d une zone, decalee dans son repere, **puis validee**.
 *
 * Les coordonnees etaient jusqu ici ecrites a la main et prises telles quelles.
 * Trois personnages se retrouvaient dans une geometrie solide : l un dans un
 * trumeau de porte, un autre dans un comptoir, un troisieme dans un poste de
 * travail. Chaque position passe desormais par l espace marchable, qui la
 * ramene au point libre le plus proche si elle tombe dans un obstacle.
 */
function dans(zoneId: string, dx: number, dz: number): Vec3 {
  const zone = zoneById(zoneId) as CampusZone;
  const versCouloir = zone.doorSide === 'south' ? 1 : -1;
  const voulu: Vec3 = [zone.center[0] + dx, 0, zone.center[2] + versCouloir * dz];
  return campusNavigation().pointSur(voulu) ?? voulu;
}

/**
 * Place quelqu un a un poste de travail.
 *
 * Une personne assise occupe une chaise, et une chaise est un obstacle : la
 * contraindre au sol marchable la repoussait dans l allee, a cote de son
 * bureau. On la pose donc directement au poste, sans passer par la grille, ce
 * qui n a pas d inconvenient puisqu elle ne s y deplace pas.
 */
function auPoste(zoneId: string, dx: number, dz: number): Vec3 {
  const zone = zoneById(zoneId) as CampusZone;
  const versCouloir = zone.doorSide === 'south' ? 1 : -1;
  return [zone.center[0] + dx, 0, zone.center[2] + versCouloir * dz];
}

/** Destination nommee d un personnage, elle aussi ramenee sur le marchable. */
export interface Etape {
  nom: string;
  point: Vec3;
  /** Temps passe sur place avant de repartir, en secondes simulees. */
  pause: number;
  activite: NpcActivite;
}

/*
 * La liste est construite a la premiere demande, pas au chargement du module :
 * elle a besoin de la geometrie des zones, qui vit dans le module du campus,
 * lequel a besoin des personnages. Une evaluation paresseuse rompt le cycle.
 */
let cache: readonly NpcSpec[] | undefined;

export function npcs(): readonly NpcSpec[] {
  cache ??= construire();
  return cache;
}

function construire(): readonly NpcSpec[] {
  return [
  {
    id: 'npc-lea',
    nom: 'Lea Moreau',
    role: 'accueil',
    zoneId: 'reception',
    position: dans('reception', -1.4, -2.4),
    orientation: 0,
    activite: 'debout',
    asset: 'personne-a',
    dialogue: {
      ouverture:
        'Bonjour. Deux personnes du service comptabilite sont passees ce matin, elles ont un souci reseau. J ai ouvert un ticket, il est dans votre file.',
      questions: [
        {
          question: 'Combien de personnes sont concernees ?',
          reponse:
            'Une seule pour l instant : Camille Renard. Sa collegue de bureau n a rien signale.',
        },
        {
          question: 'Est-ce que quelque chose a change recemment ?',
          reponse:
            'Il y a eu des travaux la semaine derniere. Des bureaux ont ete deplaces au deuxieme.',
        },
      ],
    },
  },
  {
    id: 'npc-camille',
    nom: 'Camille Renard',
    role: 'utilisateur',
    zoneId: 'offices',
    position: auPoste('offices', -3.1, 0.5),
    orientation: Math.PI,
    activite: 'assis',
    asset: 'personne-b',
    dialogue: {
      ouverture:
        'Depuis ce matin je n ai plus acces au serveur de production. Le reste du bureau fonctionne normalement.',
      questions: [
        {
          question: 'Depuis quand exactement ?',
          reponse:
            'Depuis mon arrivee, vers huit heures et demie. Hier soir tout marchait encore quand je suis partie.',
        },
        {
          question: 'Qu est-ce qui a change depuis hier ?',
          reponse:
            'Mon poste a ete deplace pendant les travaux. On l a rebranche a un autre endroit du bureau.',
        },
        {
          question: 'Quel message d erreur voyez-vous ?',
          reponse:
            'Rien de precis. Le lecteur reseau reste introuvable, et le navigateur ne charge aucune page interne.',
        },
      ],
    },
  },
  {
    id: 'npc-thomas',
    nom: 'Thomas Baillet',
    role: 'utilisateur',
    zoneId: 'offices',
    position: auPoste('offices', 2.1, 0.5),
    orientation: Math.PI,
    activite: 'assis',
    asset: 'personne-c',
    itineraire: [
      { nom: 'son poste', point: auPoste('offices', 2.1, 0.5), pause: 40, activite: 'assis' },
      { nom: 'espace detente', point: dans('personal-space', 0, 2.4), pause: 16, activite: 'debout' },
      { nom: 'son poste', point: auPoste('offices', 2.1, 0.5), pause: 30, activite: 'assis' },
    ],
    dialogue: {
      ouverture:
        'Moi je n ai aucun probleme, tout fonctionne. Camille est juste a cote pourtant.',
      questions: [
        {
          question: 'Vous avez ete deplace aussi ?',
          reponse:
            'Non, je n ai pas bouge. C est peut-etre pour ca que je n ai rien remarque.',
        },
      ],
    },
  },
  {
    id: 'npc-yanis',
    nom: 'Yanis Delorme',
    role: 'technicien',
    zoneId: 'network-room',
    position: dans('network-room', 1.9, 3.4),
    orientation: Math.PI / 2,
    activite: 'ronde',
    asset: 'personne-d',
    /*
     * Une tournee de technicien reseau, pas une promenade : la salle reseau,
     * le couloir, la supervision, puis la salle machine. Le point de passage
     * qui valait l origine du monde a disparu.
     */
    itineraire: [
      { nom: 'baie de brassage', point: dans('network-room', 1.9, 3.4), pause: 14, activite: 'debout' },
      { nom: 'couloir', point: campusNavigation().pointSur([-12, 0, 0]) ?? [-12, 0, 0], pause: 3, activite: 'ronde' },
      { nom: 'supervision', point: dans('command-center', -1.2, 3.2), pause: 10, activite: 'debout' },
      { nom: 'salle machine', point: dans('datacenter', 0, 3.6), pause: 12, activite: 'debout' },
    ],
    dialogue: {
      ouverture:
        'Salut. J ai repris le brassage apres les travaux, mais je n ai pas eu le temps de tout verifier port par port.',
      questions: [
        {
          question: 'Qu est-ce qui a ete touche ?',
          reponse:
            'Les prises murales du deuxieme, cote comptabilite. Les cables ont ete reperes puis rebranches.',
        },
        {
          question: 'Ou est-ce que je regarde en premier ?',
          reponse:
            'Le commutateur d etage. Si un port a ete reconfigure a la va-vite, ca se voit dans sa configuration.',
        },
      ],
    },
  },
  {
    id: 'npc-nadia',
    nom: 'Nadia Fournier',
    role: 'responsable',
    zoneId: 'command-center',
    position: dans('command-center', 2.8, 1.4),
    orientation: Math.PI,
    activite: 'debout',
    asset: 'personne-e',
    dialogue: {
      ouverture:
        'La supervision ne remonte aucune alerte sur les serveurs. Si un poste ne repond pas, le probleme est en aval.',
      questions: [
        {
          question: 'Les services sont-ils tous operationnels ?',
          reponse:
            'Oui. Resolution de noms, attribution d adresses et partage de fichiers repondent normalement.',
        },
        {
          question: 'Quel delai ai-je pour cet incident ?',
          reponse:
            'Un poste isole reste une priorite moyenne. Documentez la cause : c est ce qui evitera la recidive.',
        },
      ],
    },
  },
  {
    id: 'npc-marc',
    nom: 'Marc Villard',
    role: 'formateur',
    zoneId: 'training-lab',
    position: dans('training-lab', 0, 1.2),
    orientation: 0,
    activite: 'debout',
    asset: 'personne-f',
    dialogue: {
      ouverture:
        'Bienvenue au laboratoire. Ici vous pouvez casser ce que vous voulez : rien de ce qui s y passe n atteint la production.',
      questions: [
        {
          question: 'Par quoi commencer ?',
          reponse:
            'Par la methode, pas par les commandes. Partez des couches basses et comparez avec un poste qui fonctionne.',
        },
        {
          question: 'Comment savoir si j ai bien corrige ?',
          reponse:
            'En verifiant l etat, pas en supposant. Un service joignable et un bail conforme, c est verifiable.',
        },
      ],
    },
  },
  ];
}

export function npcById(id: string): NpcSpec | undefined {
  return npcs().find((npc) => npc.id === id);
}

export function npcsDeLaZone(zoneId: string): NpcSpec[] {
  return npcs().filter((npc) => npc.zoneId === zoneId);
}

/** Animation correspondant a une activite. */
export function animationPour(activite: NpcActivite): string {
  if (activite === 'assis') return 'sit';
  if (activite === 'ronde') return 'walk';
  return 'idle';
}

/**
 * Noeuds des personnages.
 *
 * Chaque personnage est un noeud distinct : il doit pouvoir etre aborde
 * individuellement, et son animation depend de ce qu il fait. La primitive
 * sous-jacente reste une simple silhouette debout, qui sert de repli.
 */
export function buildNpcNodes(): Piece {
  const rng = alea(0x4e504331);
  const pieces: Piece[] = [];

  const navigation = campusNavigation();
  for (const npc of npcs()) {
    /*
     * Ultime garde-fou : meme si une position echappait a la validation, elle
     * est ramenee ici. Un personnage doit toujours pouvoir etre replace sur le
     * dernier endroit sur plutot que rester dans le decor.
     */
    // Une personne assise reste a son poste ; seules celles qui se deplacent
    // doivent imperativement se tenir sur le sol marchable.
    const sur =
      npc.activite === 'assis'
        ? npc.position
        : (navigation.pointSur(npc.position) ?? npc.position);
    const placement: Placement = { position: sur, yaw: npc.orientation };
    // Une legere irregularite d orientation : personne ne se tient pile droit.
    const pose = varier([placement], rng, { decalage: 0.05, rotation: 0.14 })[0] as Placement;
    const piece = objet(
      npc.id,
      npc.asset,
      [pose],
      { kind: 'cylinder', radius: 0.28, height: 1.75 },
      MATERIALS.tissuSiege,
      {
        hauteurPrimitive: 1.75,
        interactive: {
          kind: 'npc',
          targetId: npc.id,
          label: npc.nom,
          description: roleLibelle(npc.role),
          verbe: 'Parler a',
        },
      },
    );
    for (const node of piece.nodes as Scene3DNode[]) {
      node.model = {
        assetId: npc.asset,
        animation: animationPour(npc.activite),
        offsetY: node.model?.offsetY ?? 0,
      };
    }
    pieces.push(piece);
  }

  return {
    nodes: pieces.flatMap((piece) => piece.nodes),
    // Personne n est un obstacle : on doit pouvoir s approcher pour parler.
    colliders: [],
  };
}

export function roleLibelle(role: NpcRole): string {
  switch (role) {
    case 'accueil':
      return 'Accueil et qualification des demandes';
    case 'utilisateur':
      return 'Utilisatrice ou utilisateur du service';
    case 'technicien':
      return 'Technicien reseau';
    case 'responsable':
      return 'Responsable d exploitation';
    case 'formateur':
      return 'Formateur du laboratoire';
  }
}
