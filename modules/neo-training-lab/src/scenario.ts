import type { HardwareAsset, WorldState } from '@tssr/contracts';
import { TopologyBuilder, makePool } from '@tssr/sim-network';
import { createSystem } from '@tssr/sim-systems';
import type { ScenarioContext, ScenarioFactory } from '@tssr/mission-engine';

const VLAN_BUREAUX = 10;
const VLAN_SERVEURS = 20;
const VLAN_QUARANTAINE = 99;

function switchAsset(
  networkNodeId: string,
  ports: { label: string; interfaceId: string }[],
): HardwareAsset {
  return {
    schemaVersion: 1,
    id: 'asset-sw-lab',
    assetTag: 'NEO-SW-001',
    kind: 'switch',
    model: 'NEO SwitchLine 24',
    vendor: 'NEO Systems',
    serial: 'SWL-0001',
    rackId: 'rack-lab',
    rackUnit: 40,
    heightU: 1,
    ports: ports.map((p) => ({
      id: `port-${p.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      label: p.label,
      role: 'ethernet',
      interfaceId: p.interfaceId,
      ledLink: 'off',
    })),
    powered: true,
    networkNodeId,
    ownerService: 'Infrastructure',
    location: 'Local technique - baie A',
    lifecycle: 'in-service',
    history: [],
    components: [
      { id: 'psu-1', kind: 'psu', model: 'PSU 150W', slot: 'PSU1', health: 'ok' },
      { id: 'fan-1', kind: 'fan', model: 'Ventilateur', slot: 'FAN1', health: 'ok' },
    ],
    temperatureC: 32,
  };
}

/**
 * Scenario du laboratoire de demonstration NEO.
 * Petit site realiste : un commutateur, un routeur inter-VLAN, un serveur d infrastructure
 * et deux postes. La panne initiale est un port place dans le mauvais VLAN.
 */
export const trainingLabScenario: ScenarioFactory = {
  id: 'neo-training-lab-site',
  build(context: ScenarioContext): WorldState {
    const lanBureaux = String(context.params.lanBureaux ?? '10.20.10.0/24');
    const gatewayBureaux = String(context.params.gatewayBureaux ?? '10.20.10.1');
    const serverAddress = String(context.params.serverAddress ?? '10.20.20.10');
    const brokenVlan = Number(context.params.brokenVlan ?? VLAN_QUARANTAINE);

    const b = new TopologyBuilder('neo-training-lab', 'Site NEO Training Lab');

    b.switchNode('sw-lab', {
      hostname: 'sw-lab',
      vlans: [
        { id: VLAN_BUREAUX, name: 'BUREAUX' },
        { id: VLAN_SERVEURS, name: 'SERVEURS' },
        { id: VLAN_QUARANTAINE, name: 'QUARANTAINE' },
      ],
      interfaces: [
        { name: 'Gi0/1', mode: 'access', accessVlan: VLAN_BUREAUX },
        // Panne initiale : le port de Camille a ete laisse en quarantaine.
        { name: 'Gi0/2', mode: 'access', accessVlan: brokenVlan },
        { name: 'Gi0/3', mode: 'access', accessVlan: VLAN_SERVEURS },
        { name: 'Gi0/4', mode: 'access', accessVlan: VLAN_BUREAUX },
        { name: 'Gi0/24', mode: 'trunk', trunkVlans: [VLAN_BUREAUX, VLAN_SERVEURS], nativeVlan: 1 },
      ],
    });

    b.router('r-lab', {
      hostname: 'r-lab',
      interfaces: [
        { name: 'Gi0/0', mode: 'trunk', trunkVlans: [VLAN_BUREAUX, VLAN_SERVEURS], nativeVlan: 1 },
        { name: 'Gi0/0.10', ip: `${gatewayBureaux}/24`, vlan: VLAN_BUREAUX, parent: 'Gi0/0' },
        { name: 'Gi0/0.20', ip: '10.20.20.1/24', vlan: VLAN_SERVEURS, parent: 'Gi0/0' },
      ],
      services: [{ id: 'svc-dhcp-bureaux', kind: 'dhcp', name: 'dhcp-server' }],
      dhcpPools: [
        makePool('pool-bureaux', lanBureaux, {
          from: 100,
          to: 150,
          gateway: gatewayBureaux,
          dns: [serverAddress],
        }),
      ],
    });

    b.server('srv-neo', {
      hostname: 'srv-neo',
      ip: `${serverAddress}/24`,
      gateway: '10.20.20.1',
      dns: [serverAddress],
      services: [
        { id: 'svc-dns', kind: 'dns', name: 'dns-server' },
        { id: 'svc-smb', kind: 'smb', name: 'partage-fichiers', dependsOn: ['svc-dns'] },
        { id: 'svc-snmp', kind: 'snmp', name: 'agent-supervision' },
      ],
      dnsZones: [
        {
          name: 'neo.lan',
          records: [
            { name: 'srv-neo.neo.lan', type: 'A', value: serverAddress, ttl: 3600 },
            { name: 'partages.neo.lan', type: 'CNAME', value: 'srv-neo.neo.lan', ttl: 3600 },
            { name: 'r-lab.neo.lan', type: 'A', value: gatewayBureaux, ttl: 3600 },
          ],
        },
      ],
    });

    b.host('pc-tech', {
      hostname: 'pc-tech',
      ip: '10.20.10.10/24',
      gateway: gatewayBureaux,
      dns: [serverAddress],
    });
    // Le poste en panne n a aucune adresse : il doit obtenir un bail DHCP.
    b.host('pc-camille', { hostname: 'pc-camille', dns: [serverAddress] });

    b.link('pc-tech', 'eth0', 'sw-lab', 'Gi0/1');
    b.link('pc-camille', 'eth0', 'sw-lab', 'Gi0/2');
    b.link('srv-neo', 'eth0', 'sw-lab', 'Gi0/3');
    b.link('sw-lab', 'Gi0/24', 'r-lab', 'Gi0/0');

    const network = b.build();
    const swNode = network.nodes.find((n) => n.id === 'sw-lab');
    const ports = (swNode?.interfaces ?? []).map((i) => ({ label: i.name, interfaceId: i.id }));

    const systems = [
      createSystem({
        id: 'sys-srv-neo',
        hostname: 'srv-neo',
        os: 'linux',
        networkNodeId: 'srv-neo',
        osVersion: 'NEO Server Linux',
      }),
      createSystem({
        id: 'sys-pc-tech',
        hostname: 'pc-tech',
        os: 'linux',
        networkNodeId: 'pc-tech',
        osVersion: 'NEO Desktop Linux',
      }),
      createSystem({
        id: 'sys-pc-camille',
        hostname: 'pc-camille',
        os: 'windows',
        networkNodeId: 'pc-camille',
        osVersion: 'NEO Desktop Windows',
        users: [
          {
            name: 'camille',
            displayName: 'Camille Renard',
            groups: ['Users'],
            enabled: true,
            passwordSet: true,
            mustChangePassword: false,
            lockedOut: false,
          },
        ],
      }),
    ];

    const world: WorldState = {
      schemaVersion: 1,
      scenarioId: trainingLabScenario.id,
      seed: context.seed,
      simTime: 0,
      network,
      systems,
      domains: [],
      hypervisors: [],
      vms: [],
      cloud: [],
      racks: [{ id: 'rack-lab', name: 'Baie A', room: 'Local technique', units: 42 }],
      assets: [switchAsset('sw-lab', ports)],
      cables: [],
      tickets: [
        {
          schemaVersion: 1,
          id: 'inc-2041',
          reference: 'INC-2041',
          kind: 'incident',
          title: 'Poste sans acces reseau au retour de conges',
          description:
            'Camille Renard signale que son poste n a plus d acces au reseau depuis ce matin. ' +
            'Elle indique que le voyant de la prise murale est eteint et qu aucun partage n est accessible. ' +
            'Le poste a ete deplace la semaine derniere pendant les travaux.',
          status: 'new',
          impact: 'medium',
          urgency: 'high',
          priority: 'P2',
          requesterNpcId: 'npc-camille',
          createdAt: 0,
          updatedAt: 0,
          slaMinutes: 240,
          affectedNodeIds: ['pc-camille'],
          affectedServiceIds: [],
          linkedTicketIds: [],
          majorIncident: false,
          category: 'Reseau / poste de travail',
          comments: [],
        },
      ],
      changes: [],
      npcs: [
        {
          id: 'npc-camille',
          name: 'Camille Renard',
          role: 'user',
          department: 'Comptabilite',
          temperament: 'stressed',
          nodeId: 'pc-camille',
          knownFacts: [
            {
              id: 'fact-move',
              prompt: ['deplacement', 'travaux', 'bureau'],
              answer:
                'Mon poste a ete debranche puis rebranche la semaine derniere pendant les travaux, sur une autre prise.',
            },
            {
              id: 'fact-symptom',
              prompt: ['symptome', 'erreur', 'message'],
              answer:
                'Windows affiche que je n ai pas d acces reseau, et je ne vois plus le lecteur des partages.',
            },
            {
              id: 'fact-others',
              prompt: ['collegues', 'autres'],
              answer: 'Mes collegues du meme bureau n ont aucun probleme, eux.',
            },
          ],
        },
        {
          id: 'npc-yanis',
          name: 'Yanis Berger',
          role: 'colleague',
          department: 'Infrastructure',
          temperament: 'precise',
          knownFacts: [
            {
              id: 'fact-vlan',
              prompt: ['vlan', 'commutateur', 'switch'],
              answer:
                'Les postes bureautiques sont dans le VLAN 10. Le VLAN 99 sert de quarantaine, il n a ni passerelle ni DHCP.',
            },
            {
              id: 'fact-console',
              prompt: ['console', 'acces'],
              answer:
                'La console du commutateur sw-lab est accessible depuis l atelier, tu peux verifier la configuration des ports.',
            },
          ],
        },
      ],
      backupJobs: [
        {
          id: 'job-srv-neo',
          name: 'Sauvegarde srv-neo',
          sourceSystemIds: ['sys-srv-neo'],
          kind: 'full',
          schedule: 'daily',
          retentionCount: 7,
          enabled: true,
          targetLocation: '/backup/srv-neo',
          points: [],
          rpoMinutes: 1440,
          rtoMinutes: 240,
        },
      ],
      monitoringChecks: [
        {
          id: 'chk-srv-icmp',
          name: 'srv-neo joignable',
          targetNodeId: 'srv-neo',
          metric: 'icmp',
          intervalMs: 30000,
          enabled: true,
        },
        {
          id: 'chk-srv-dns',
          name: 'Service DNS',
          targetNodeId: 'srv-neo',
          metric: 'service',
          serviceId: 'svc-dns',
          intervalMs: 30000,
          enabled: true,
        },
        {
          id: 'chk-camille-icmp',
          name: 'pc-camille joignable',
          targetNodeId: 'pc-camille',
          metric: 'icmp',
          intervalMs: 60000,
          enabled: true,
        },
      ],
      monitoringAlerts: [],
      deploymentTemplates: [],
      deploymentJobs: [],
    };

    return world;
  },
};
