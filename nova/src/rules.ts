import type { Assertion, LeafAssertion } from '@tssr/contracts';

/**
 * Regles socratiques : a chaque type de verification correspond une question
 * qui oriente sans donner la reponse, et des pistes concretes de verification.
 */
export interface GuidanceRule {
  question: string;
  checks: string[];
  knowledgeKeywords: string[];
}

const RULES: Partial<Record<LeafAssertion['type'], GuidanceRule>> = {
  'ping-reachable': {
    question: 'Jusqu ou le paquet va-t-il ? La passerelle repond-elle avant la destination ?',
    checks: [
      'verifier l adressage local et le masque',
      'tester la passerelle avant la destination distante',
      'suivre le chemin avec un traceroute',
    ],
    knowledgeKeywords: ['routage', 'passerelle', 'diagnostic'],
  },
  'service-reachable': {
    question: 'Le reseau passe-t-il, ou est-ce le service qui ne repond pas ?',
    checks: [
      'joindre d abord l adresse en ICMP pour separer reseau et service',
      'verifier que le service ecoute bien sur le port attendu',
      'controler les regles de filtrage sur le chemin',
    ],
    knowledgeKeywords: ['service', 'port', 'pare-feu'],
  },
  'dns-resolves': {
    question: 'Le poste connait-il un serveur de noms, et ce serveur repond-il ?',
    checks: [
      'lister les serveurs DNS configures sur le poste',
      'joindre le serveur DNS par son adresse',
      'verifier que le service de resolution fonctionne sur le serveur',
    ],
    knowledgeKeywords: ['dns', 'resolution', 'nom'],
  },
  'dhcp-lease': {
    question: 'La demande d adresse atteint-elle un serveur ? Jusqu ou la diffusion se propage-t-elle ?',
    checks: [
      'observer l adresse obtenue : une adresse en 169.254 signale une absence de reponse',
      'comparer le port avec celui d un poste voisin qui fonctionne',
      'verifier le VLAN du port et la presence d une etendue correspondante',
    ],
    knowledgeKeywords: ['dhcp', 'vlan', 'diffusion'],
  },
  'interface-vlan': {
    question: 'Ce port est-il dans le meme VLAN que les postes equivalents ?',
    checks: [
      'afficher la table des VLAN du commutateur',
      'comparer la configuration du port en panne et d un port sain',
      's assurer que le VLAN vise est bien declare sur l equipement',
    ],
    knowledgeKeywords: ['vlan', 'commutateur', 'port'],
  },
  'interface-address': {
    question: 'L adresse et le masque correspondent-ils au plan d adressage du segment ?',
    checks: ['afficher la configuration de l interface', 'verifier le masque autant que l adresse'],
    knowledgeKeywords: ['adressage', 'masque'],
  },
  'has-route': {
    question: 'La machine sait-elle par ou envoyer ce trafic ?',
    checks: ['afficher la table de routage', 'verifier la presence et la validite de la passerelle par defaut'],
    knowledgeKeywords: ['routage', 'passerelle'],
  },
  'service-status': {
    question: 'Le service est-il reellement demarre, et le reste-t-il apres un redemarrage ?',
    checks: ['consulter l etat du service', 'verifier ses dependances', 'controler son mode de demarrage'],
    knowledgeKeywords: ['service', 'demarrage'],
  },
  'file-permissions': {
    question: 'Qui doit pouvoir lire ou ecrire ce fichier, et avec quels droits exactement ?',
    checks: ['afficher le proprietaire et les droits', 'verifier l appartenance aux groupes concernes'],
    knowledgeKeywords: ['droits', 'permissions'],
  },
  'user-in-group': {
    question: 'L acces depend-il du compte lui-meme ou du groupe auquel il appartient ?',
    checks: ['lister les groupes du compte', 'verifier la composition du groupe cible'],
    knowledgeKeywords: ['groupe', 'compte'],
  },
  'ticket-documented': {
    question: 'Un collegue qui lira ce ticket dans six mois comprendra-t-il la cause reelle ?',
    checks: [
      'decrire le symptome constate',
      'expliciter la cause racine, pas seulement l action',
      'indiquer la verification effectuee',
    ],
    knowledgeKeywords: ['ticket', 'documentation'],
  },
  unchanged: {
    question: 'Cette modification etait-elle necessaire pour resoudre le probleme signale ?',
    checks: ['revenir sur les changements hors perimetre', 'privilegier la correction la plus ciblee'],
    knowledgeKeywords: ['perimetre', 'impact'],
  },
  'backup-restorable': {
    question: 'Une sauvegarde jamais testee est-elle une sauvegarde ?',
    checks: ['lancer un test de restauration', 'controler l integrite du point le plus recent'],
    knowledgeKeywords: ['sauvegarde', 'restauration'],
  },
};

const DEFAULT_RULE: GuidanceRule = {
  question: 'Quelle est la difference entre l etat constate et l etat attendu ?',
  checks: ['reprendre la verification depuis les couches basses', 'comparer avec un element equivalent qui fonctionne'],
  knowledgeKeywords: ['methode', 'diagnostic'],
};

/** Choisit la regle correspondant a la premiere verification en echec. */
export function guidanceFor(assertion: Assertion): GuidanceRule {
  if (assertion.type === 'all' || assertion.type === 'any') {
    const first = assertion.of[0];
    return first ? guidanceFor(first) : DEFAULT_RULE;
  }
  if (assertion.type === 'not') return guidanceFor(assertion.of);
  return RULES[assertion.type] ?? DEFAULT_RULE;
}

export function knowledgeKeywordsFor(assertion: Assertion): string[] {
  return guidanceFor(assertion).knowledgeKeywords;
}
