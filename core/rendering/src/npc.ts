import { objet, varier, alea, type Piece, type Placement } from './kit.ts';
import { MATERIALS } from './materials.ts';
import { zoneById, type CampusZone } from './campus.ts';
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
  /** Points de passage, pour les personnages qui circulent. */
  ronde?: readonly Vec3[];
  dialogue: NpcDialogue;
}

/** Position au sol d une zone, decalee dans son repere. */
function dans(zoneId: string, dx: number, dz: number): Vec3 {
  const zone = zoneById(zoneId) as CampusZone;
  const versCouloir = zone.doorSide === 'south' ? 1 : -1;
  return [zone.center[0] + dx, 0, zone.center[2] + versCouloir * dz];
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
    position: dans('offices', -2.6, -0.5),
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
    position: dans('offices', 2.4, -0.5),
    orientation: Math.PI,
    activite: 'assis',
    asset: 'personne-c',
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
    ronde: [
      dans('network-room', 1.6, 1.8),
      dans('network-room', -2.2, 1.2),
      [0, 0, 0],
      dans('datacenter', 0, 2.4),
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

  for (const npc of npcs()) {
    const placement: Placement = { position: npc.position, yaw: npc.orientation };
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
