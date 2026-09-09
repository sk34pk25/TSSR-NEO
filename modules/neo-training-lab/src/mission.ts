import type { MissionDefinition } from '@tssr/contracts';

/**
 * Mission de demonstration du Training Lab.
 * Plusieurs strategies sont acceptees : corriger le VLAN du port depuis la console
 * du commutateur, ou rebrancher le poste sur un port deja dans le bon VLAN.
 */
export const missionPosteSansReseau: MissionDefinition = {
  schemaVersion: 1,
  id: 'tl-poste-sans-reseau',
  moduleId: 'neo-training-lab',
  version: '1.0.0',
  title: 'Le poste de Camille n a plus de reseau',
  summary:
    'Un poste bureautique ne recupere plus d adresse et n accede plus aux partages. Diagnostiquer et retablir le service.',
  estimatedMinutes: 20,
  difficulty: 'standard',
  competencies: ['net-vlan-access', 'net-dhcp', 'sup-diagnostic', 'itsm-documentation'],
  prerequisites: [],
  briefing:
    'Camille Renard, du service comptabilite, n a plus acces au reseau depuis ce matin. ' +
    'Son poste a ete deplace pendant les travaux. Ses collegues du meme bureau ne rencontrent aucun probleme. ' +
    'Diagnostiquez la panne, retablissez le service et documentez le ticket INC-2041.',
  scenarioId: 'neo-training-lab-site',
  ticketIds: ['inc-2041'],
  npcIds: ['npc-camille', 'npc-yanis'],
  objectives: [
    {
      id: 'obj-lease',
      label: 'Le poste obtient une adresse du reseau bureautique',
      description:
        'Le poste doit recuperer un bail DHCP dans le sous-reseau des bureaux, pas une adresse d auto-configuration.',
      optional: false,
      hidden: false,
      check: {
        type: 'dhcp-lease',
        nodeId: 'pc-camille',
        expectedSubnet: '10.20.10.0/24',
        expect: true,
      },
      competencies: ['net-dhcp'],
      weight: 2,
      dimensions: ['technicalAccuracy', 'diagnosis'],
    },
    {
      id: 'obj-ping-serveur',
      label: 'Le poste joint le serveur d infrastructure',
      optional: false,
      hidden: false,
      check: { type: 'ping-reachable', from: 'pc-camille', to: '10.20.20.10', expect: true },
      competencies: ['net-vlan-access'],
      weight: 2,
      dimensions: ['technicalAccuracy'],
    },
    {
      id: 'obj-dns',
      label: 'La resolution de noms fonctionne depuis le poste',
      optional: false,
      hidden: false,
      check: {
        type: 'dns-resolves',
        from: 'pc-camille',
        name: 'partages.neo.lan',
        expectedAddress: '10.20.20.10',
        expect: true,
      },
      competencies: ['net-dhcp'],
      weight: 1,
      dimensions: ['technicalAccuracy', 'verification'],
    },
    {
      id: 'obj-ticket',
      label: 'Le ticket est resolu et documente',
      description:
        'La resolution doit expliquer la cause reelle, pas seulement le retour a la normale.',
      optional: false,
      hidden: false,
      check: {
        type: 'all',
        of: [
          { type: 'ticket-status', ticketId: 'inc-2041', status: 'resolved' },
          {
            type: 'ticket-documented',
            ticketId: 'inc-2041',
            minLength: 60,
            requireRootCause: true,
          },
        ],
      },
      competencies: ['itsm-documentation'],
      weight: 1,
      dimensions: ['documentation'],
    },
    {
      id: 'obj-no-collateral',
      label: 'Aucun degat collateral sur le serveur',
      description:
        'Le serveur d infrastructure ne doit pas avoir ete modifie pour resoudre un probleme de poste.',
      optional: false,
      hidden: false,
      check: { type: 'unchanged', scope: 'node', targetId: 'srv-neo' },
      competencies: ['sup-diagnostic'],
      weight: 1,
      dimensions: ['safety', 'impact'],
    },
    {
      id: 'obj-verification',
      label: 'Le retablissement a ete verifie depuis le poste',
      optional: true,
      hidden: false,
      check: {
        type: 'any',
        of: [
          {
            type: 'command-used',
            pattern: 'ping',
            systemId: 'sys-pc-camille',
            expect: true,
            minCount: 1,
          },
          {
            type: 'command-used',
            pattern: 'test-netconnection',
            systemId: 'sys-pc-camille',
            expect: true,
            minCount: 1,
          },
        ],
      },
      competencies: ['sup-diagnostic'],
      weight: 1,
      dimensions: ['verification'],
    },
  ],
  hints: [
    {
      id: 'hint-1',
      level: 1,
      text: 'Les collegues du meme bureau fonctionnent normalement. Qu est-ce qui differe entre leur poste et celui de Camille ?',
      autonomyCost: 0.05,
    },
    {
      id: 'hint-2',
      level: 2,
      text: 'Le poste n a pas d adresse utilisable. Une demande DHCP est une diffusion : elle ne sort pas du VLAN du port.',
      autonomyCost: 0.12,
      when: {
        type: 'dhcp-lease',
        nodeId: 'pc-camille',
        expectedSubnet: '10.20.10.0/24',
        expect: false,
      },
    },
    {
      id: 'hint-3',
      level: 3,
      text: 'Depuis la console de sw-lab, comparez la configuration du port de Camille (Gi0/2) avec celle d un poste qui fonctionne (Gi0/1) : "show vlan brief".',
      autonomyCost: 0.2,
    },
    {
      id: 'hint-4',
      level: 4,
      text: 'Le port Gi0/2 est dans le VLAN 99 (quarantaine). Replacez-le dans le VLAN 10, puis renouvelez le bail sur le poste avec "ipconfig /renew".',
      autonomyCost: 0.35,
    },
  ],
  dynamicEvents: [
    {
      id: 'evt-camille-relance',
      label: 'Camille demande ou en est l intervention',
      trigger: { kind: 'after-ms', ms: 600000 },
      once: true,
      effects: [
        {
          kind: 'npc-message',
          npcId: 'npc-camille',
          text: 'Bonjour, avez-vous du nouveau ? J ai une cloture comptable a rendre ce soir.',
        },
      ],
    },
  ],
  variants: [
    { id: 'var-vlan99', parameters: { brokenVlan: 99 }, weight: 2 },
    { id: 'var-vlan20', parameters: { brokenVlan: 20 }, weight: 1 },
  ],
  failureConditions: [
    {
      id: 'fail-serveur-hs',
      label: 'Le serveur d infrastructure a ete rendu injoignable pendant l intervention',
      when: { type: 'ping-reachable', from: 'pc-tech', to: '10.20.20.10', expect: false },
    },
  ],
  debrief: {
    keyPoints: [
      'Une demande DHCP est une diffusion de couche 2 : elle reste confinee au VLAN du port.',
      'Une adresse en 169.254.x.x indique une auto-configuration, donc une absence de reponse DHCP.',
      'Comparer un poste en panne avec un poste identique qui fonctionne oriente vite le diagnostic.',
      'Un ticket resolu sans cause racine documentee ne previent pas la recidive.',
    ],
    alternatives: [
      {
        id: 'alt-vlan',
        label: 'Corriger le VLAN du port sur le commutateur',
        worksTechnically: true,
        professionallySound: true,
        explanation:
          'Remet la configuration en conformite avec le plan d adressage. Solution durable et tracable.',
      },
      {
        id: 'alt-repatch',
        label: 'Rebrancher le poste sur un autre port deja dans le bon VLAN',
        worksTechnically: true,
        professionallySound: false,
        explanation:
          'Retablit le service mais laisse un port mal configure dans la baie : la panne reviendra au prochain deplacement.',
      },
      {
        id: 'alt-static',
        label: 'Attribuer une adresse IP statique au poste',
        worksTechnically: false,
        professionallySound: false,
        explanation:
          'Ne fonctionne pas ici : le port reste dans un VLAN sans passerelle. Meme dans le bon VLAN, cela contournerait le plan d adressage.',
      },
    ],
    knowledgeEntryIds: ['kb-vlan', 'kb-dhcp', 'kb-apipa', 'kb-methode-diagnostic'],
  },
  tags: ['reseau', 'vlan', 'dhcp', 'support'],
};
