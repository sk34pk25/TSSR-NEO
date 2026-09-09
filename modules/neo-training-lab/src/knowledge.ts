import type { Competency, KnowledgeEntry } from '@tssr/contracts';

export const trainingLabCompetencies: Competency[] = [
  {
    id: 'net-vlan-access',
    domain: 'network',
    label: 'Segmentation VLAN et ports d acces',
    description:
      'Comprendre le role d un VLAN, configurer un port en acces et verifier son affectation.',
    prerequisites: [],
    level: 3,
  },
  {
    id: 'net-dhcp',
    domain: 'network',
    label: 'Attribution d adresses par DHCP',
    description:
      'Comprendre la sequence DHCP, ses limites de diffusion et interpreter une adresse d auto-configuration.',
    prerequisites: [],
    level: 3,
  },
  {
    id: 'sup-diagnostic',
    domain: 'support',
    label: 'Methode de diagnostic',
    description:
      'Isoler une panne par comparaison et par elimination, en partant des couches basses.',
    prerequisites: [],
    level: 3,
  },
  {
    id: 'itsm-documentation',
    domain: 'itsm',
    label: 'Documentation d un ticket',
    description:
      'Renseigner une resolution exploitable : symptome, cause racine, action, verification.',
    prerequisites: [],
    level: 2,
  },
];

export const trainingLabKnowledge: KnowledgeEntry[] = [
  {
    schemaVersion: 1,
    id: 'kb-vlan',
    kind: 'concept',
    title: 'VLAN : segmenter un reseau local',
    summary:
      'Un VLAN cree plusieurs reseaux logiques independants sur un meme equipement physique.',
    body:
      'Un VLAN (reseau local virtuel) decoupe un commutateur en plusieurs domaines de diffusion separes. ' +
      'Deux machines branchees sur le meme commutateur mais dans deux VLAN differents ne se voient pas directement : ' +
      'leur trafic doit passer par un routeur ou une interface de niveau 3.\n\n' +
      'Un port dit d acces appartient a un seul VLAN et transporte des trames non taguees. ' +
      'Un port dit trunk transporte plusieurs VLAN vers un autre equipement, en marquant chaque trame de son identifiant. ' +
      'Le VLAN natif d un trunk est celui dont les trames circulent sans marquage.\n\n' +
      'Consequence pratique : deplacer un poste d une prise a une autre peut le faire changer de VLAN, ' +
      'et donc lui faire perdre sa passerelle, son serveur DHCP et ses partages.',
    domain: 'network',
    competencies: ['net-vlan-access'],
    moduleIds: ['neo-training-lab'],
    prerequisites: [],
    relatedIds: ['kb-dhcp', 'kb-apipa'],
    keywords: ['vlan', 'trunk', 'access', 'segmentation', 'domaine de diffusion'],
    origin: 'neo-internal',
  },
  {
    schemaVersion: 1,
    id: 'kb-dhcp',
    kind: 'concept',
    title: 'DHCP : obtenir une configuration automatiquement',
    summary:
      'Le client diffuse une demande, un serveur du meme domaine de diffusion propose un bail.',
    body:
      'Le protocole DHCP attribue automatiquement une adresse IP, un masque, une passerelle et des serveurs DNS.\n\n' +
      'La sequence comporte quatre etapes : le client diffuse une decouverte, un serveur repond par une offre, ' +
      'le client demande l adresse proposee, le serveur confirme le bail.\n\n' +
      'Point essentiel : la decouverte est une diffusion de couche 2. Elle ne sort donc pas du VLAN du port. ' +
      'Si le serveur DHCP se trouve dans un autre VLAN, il faut un relais configure sur le routeur. ' +
      'Sans reponse, le poste ne recoit aucune configuration utilisable.',
    domain: 'network',
    competencies: ['net-dhcp'],
    moduleIds: ['neo-training-lab'],
    prerequisites: ['kb-vlan'],
    relatedIds: ['kb-apipa'],
    keywords: ['dhcp', 'bail', 'diffusion', 'relais', 'etendue'],
    origin: 'neo-internal',
  },
  {
    schemaVersion: 1,
    id: 'kb-apipa',
    kind: 'pitfall',
    title: 'Une adresse en 169.254.x.x : ce que cela signifie',
    summary: 'Cette plage indique une auto-configuration : aucun serveur DHCP n a repondu.',
    body:
      'Lorsqu un poste ne recoit aucune reponse DHCP, il s attribue lui-meme une adresse dans la plage 169.254.0.0/16. ' +
      'Cette adresse ne permet de communiquer qu avec des machines du meme segment ayant fait de meme : ' +
      'ni passerelle, ni DNS, ni acces aux serveurs.\n\n' +
      'C est donc un symptome, pas une cause. Les pistes a verifier, dans l ordre :\n' +
      '1. le lien physique (cable, voyant du port) ;\n' +
      '2. le VLAN du port sur le commutateur ;\n' +
      '3. la disponibilite du serveur ou du relais DHCP ;\n' +
      '4. l epuisement de l etendue d adresses.',
    domain: 'network',
    competencies: ['net-dhcp', 'sup-diagnostic'],
    moduleIds: ['neo-training-lab'],
    prerequisites: ['kb-dhcp'],
    relatedIds: ['kb-methode-diagnostic'],
    keywords: ['apipa', '169.254', 'auto-configuration', 'symptome'],
    origin: 'neo-internal',
  },
  {
    schemaVersion: 1,
    id: 'kb-methode-diagnostic',
    kind: 'procedure',
    title: 'Methode : isoler une panne de poste de travail',
    summary: 'Partir des couches basses et comparer avec un poste identique qui fonctionne.',
    body:
      '1. Recueillir les faits aupres de l utilisateur : depuis quand, quel changement recent, qui d autre est touche.\n' +
      '2. Delimiter le perimetre : un seul poste, un bureau, un etage, tout le site.\n' +
      '3. Verifier la couche physique : cable, voyant du port, port du commutateur.\n' +
      '4. Verifier l adressage du poste : adresse obtenue, passerelle, DNS.\n' +
      '5. Tester la joignabilite par etapes : passerelle, puis serveur, puis nom de service.\n' +
      '6. Comparer avec un poste voisin qui fonctionne : la difference est souvent la cause.\n' +
      '7. Corriger a la source, pas seulement le symptome.\n' +
      '8. Verifier depuis le poste de l utilisateur, puis documenter la cause racine dans le ticket.',
    domain: 'support',
    competencies: ['sup-diagnostic'],
    moduleIds: ['neo-training-lab'],
    prerequisites: [],
    relatedIds: ['kb-apipa'],
    keywords: ['methode', 'diagnostic', 'isolation', 'comparaison'],
    origin: 'neo-internal',
  },
  {
    schemaVersion: 1,
    id: 'kb-cmd-ipconfig',
    kind: 'command',
    title: 'Consulter et renouveler la configuration IP',
    summary: 'Afficher l adressage courant et forcer une nouvelle demande DHCP.',
    body: 'Ces commandes permettent de constater l adressage reel du poste et de relancer une demande de bail.',
    domain: 'network',
    competencies: ['net-dhcp'],
    moduleIds: ['neo-training-lab'],
    prerequisites: [],
    relatedIds: ['kb-apipa'],
    command: {
      os: 'both',
      syntax: 'ipconfig [/all] [/renew] [/release]   |   ip a  /  dhclient <interface>',
      examples: [
        {
          cmd: 'ipconfig /all',
          explanation:
            'affiche l adressage complet, y compris l adresse physique et les serveurs DNS',
        },
        { cmd: 'ipconfig /renew', explanation: 'relance une demande DHCP sur la carte reseau' },
        { cmd: 'ip a', explanation: 'affiche les interfaces et leurs adresses sous Linux' },
        { cmd: 'dhclient eth0', explanation: 'demande un bail DHCP sur eth0 sous Linux' },
      ],
      cautions: [
        'Un renouvellement ne corrige rien si le port est dans le mauvais VLAN : il echouera de la meme facon.',
      ],
    },
    keywords: ['ipconfig', 'dhclient', 'renew', 'adressage'],
    origin: 'neo-internal',
  },
  {
    schemaVersion: 1,
    id: 'kb-cmd-show-vlan',
    kind: 'command',
    title: 'Inspecter les VLAN d un commutateur',
    summary: 'Lister les VLAN, leurs ports et l etat des interfaces depuis la console.',
    body: 'La console du commutateur permet de comparer la configuration d un port en panne avec celle d un port qui fonctionne.',
    domain: 'network',
    competencies: ['net-vlan-access'],
    moduleIds: ['neo-training-lab'],
    prerequisites: ['kb-vlan'],
    relatedIds: ['kb-vlan'],
    command: {
      os: 'both',
      syntax:
        'show vlan brief | show interfaces status | interface <port> ; switchport access vlan <id>',
      examples: [
        {
          cmd: 'show vlan brief',
          explanation: 'liste les VLAN declares et les ports qui leur sont affectes',
        },
        {
          cmd: 'show interfaces status',
          explanation: 'affiche l etat, le VLAN et le debit de chaque port',
        },
        { cmd: 'configure terminal', explanation: 'entre en mode configuration' },
        { cmd: 'interface Gi0/2', explanation: 'selectionne le port a modifier' },
        { cmd: 'switchport access vlan 10', explanation: 'place le port dans le VLAN 10' },
      ],
      cautions: [
        'Verifier que le VLAN vise est declare sur le commutateur avant de l affecter a un port.',
        'Noter la modification dans le ticket : une configuration non tracee est une panne future.',
      ],
    },
    keywords: ['show vlan', 'switchport', 'console', 'commutateur'],
    origin: 'neo-internal',
  },
];
