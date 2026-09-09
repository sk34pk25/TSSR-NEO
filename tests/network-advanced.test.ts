import { describe, expect, it } from 'vitest';
import { EventBus } from '@tssr/events';
import {
  NetworkEngine,
  TopologyBuilder,
  compressIpv6,
  computeSpanningTree,
  convergeDistanceVector,
  discoverNeighbour,
  expandIpv6,
  forwardPacket,
  linkLocalFromMac,
  makePool,
  reachIpv6,
  slaacAddress,
} from '@tssr/sim-network';

/** Deux VLAN, un serveur DHCP central, un routeur relais : cas tres courant. */
function relayLab(withRelay: boolean) {
  const b = new TopologyBuilder('lab-relais', 'Relais DHCP');
  b.switchNode('sw', {
    vlans: [
      { id: 10, name: 'BUREAUX' },
      { id: 20, name: 'SERVEURS' },
    ],
    interfaces: [
      { name: 'Gi0/1', mode: 'access', accessVlan: 10 },
      { name: 'Gi0/2', mode: 'access', accessVlan: 20 },
      { name: 'Gi0/24', mode: 'trunk', trunkVlans: [10, 20], nativeVlan: 1 },
    ],
  });
  b.router('r1', {
    interfaces: [
      { name: 'Gi0/0', mode: 'trunk', trunkVlans: [10, 20], nativeVlan: 1 },
      {
        name: 'Gi0/0.10',
        ip: '10.0.10.1/24',
        vlan: 10,
        parent: 'Gi0/0',
        ...(withRelay ? { dhcpRelay: ['10.0.20.10'] } : {}),
      },
      { name: 'Gi0/0.20', ip: '10.0.20.1/24', vlan: 20, parent: 'Gi0/0' },
    ],
  });
  b.server('srv', {
    ip: '10.0.20.10/24',
    gateway: '10.0.20.1',
    services: [{ id: 'svc-dhcp', kind: 'dhcp' }],
    dhcpPools: [
      // L etendue couvre le reseau des bureaux, pas celui du serveur.
      makePool('pool-bureaux', '10.0.10.0/24', {
        from: 100,
        to: 120,
        gateway: '10.0.10.1',
        dns: ['10.0.20.10'],
      }),
    ],
  });
  b.host('pc1');
  b.link('pc1', 'eth0', 'sw', 'Gi0/1');
  b.link('srv', 'eth0', 'sw', 'Gi0/2');
  b.link('sw', 'Gi0/24', 'r1', 'Gi0/0');
  return b.build();
}

describe('relais DHCP', () => {
  it('sans relais, la demande ne sort pas du VLAN', () => {
    const engine = new NetworkEngine(relayLab(false));
    const result = engine.renewDhcp('pc1', 'eth0');
    expect(result.success).toBe(false);
    expect(result.failure?.reason).toBe('no-server');
    expect(engine.node('pc1')?.interfaces[0]?.addresses[0]?.address).toMatch(/^169\.254\./);
  });

  it('avec un relais, le bail vient du reseau d origine et non de celui du serveur', () => {
    const bus = new EventBus();
    const engine = new NetworkEngine(relayLab(true), { bus });
    const result = engine.renewDhcp('pc1', 'eth0');
    expect(result.success).toBe(true);
    // L etendue retenue est celle du reseau du client, pas celle du serveur.
    expect(result.offer?.address).toBe('10.0.10.100');
    expect(result.offer?.gateway).toBe('10.0.10.1');
    expect(result.relayedBy?.nodeId).toBe('r1');
    expect(bus.timeline().some((e) => String(e.label).includes('relaye par'))).toBe(true);
  });

  it('le relais rend le serveur joignable de bout en bout', () => {
    const engine = new NetworkEngine(relayLab(true));
    engine.renewDhcp('pc1', 'eth0');
    expect(engine.reach('pc1', '10.0.20.10').delivered).toBe(true);
  });

  it('un serveur sans etendue pour le reseau relaye le dit explicitement', () => {
    const topology = relayLab(true);
    const server = topology.nodes.find((n) => n.id === 'srv');
    if (server) server.dhcpPools[0]!.subnet = '10.0.99.0/24';
    const engine = new NetworkEngine(topology);
    const result = engine.renewDhcp('pc1', 'eth0');
    expect(result.success).toBe(false);
    expect(result.failure?.reason).toBe('no-pool-for-subnet');
    expect(result.failure?.detail).toContain('aucune etendue');
  });
});

/** Trois commutateurs en anneau : boucle physique volontaire. */
function loopLab(stp: boolean) {
  const b = new TopologyBuilder('lab-boucle', 'Boucle de couche 2');
  for (const id of ['sw1', 'sw2', 'sw3']) {
    b.switchNode(id, {
      vlans: [{ id: 1, name: 'DEFAUT' }],
      spanningTree: stp,
      stpPriority: id === 'sw1' ? 4096 : 32768,
      interfaces: [
        { name: 'Gi0/1', mode: 'access', accessVlan: 1 },
        { name: 'Gi0/2', mode: 'trunk', trunkVlans: [1], nativeVlan: 1 },
        { name: 'Gi0/3', mode: 'trunk', trunkVlans: [1], nativeVlan: 1 },
      ],
    });
  }
  b.host('pcA', { ip: '192.168.1.10/24' });
  b.host('pcB', { ip: '192.168.1.11/24' });
  b.link('pcA', 'eth0', 'sw1', 'Gi0/1');
  b.link('pcB', 'eth0', 'sw3', 'Gi0/1');
  b.link('sw1', 'Gi0/2', 'sw2', 'Gi0/3');
  b.link('sw2', 'Gi0/2', 'sw3', 'Gi0/3');
  b.link('sw3', 'Gi0/2', 'sw1', 'Gi0/3');
  return b.build();
}

describe('arbre recouvrant', () => {
  it('sans protocole actif, aucun port n est bloque et la boucle subsiste', () => {
    const result = computeSpanningTree(loopLab(false));
    expect(result.rootId).toBeUndefined();
    expect(result.blockedInterfaceIds.size).toBe(0);
  });

  it('elit la racine sur la priorite la plus basse et brise la boucle', () => {
    const result = computeSpanningTree(loopLab(true));
    expect(result.rootId).toBe('sw1');
    expect(result.loopsFound).toBe(true);
    expect(result.blockedInterfaceIds.size).toBe(1);
  });

  it('la connectivite est preservee malgre le port bloque', () => {
    const topology = loopLab(true);
    const engine = new NetworkEngine(topology);
    expect(engine.blockedPorts().size).toBe(1);
    expect(engine.reach('pcA', '192.168.1.11').delivered).toBe(true);
  });

  it('le rapport nomme la racine et explique le blocage', () => {
    const engine = new NetworkEngine(loopLab(true));
    const report = engine.spanningTreeReport();
    expect(report).toContain('Pont racine');
    expect(report).toContain('boucle detectee');
  });
});

/** Trois routeurs en chaine : la convergence doit propager les reseaux extremes. */
function routingLab() {
  const b = new TopologyBuilder('lab-routage', 'Routage dynamique');
  b.router('r1', {
    dynamicRouting: true,
    interfaces: [
      { name: 'eth0', ip: '10.1.0.1/24' },
      { name: 'eth1', ip: '10.12.0.1/30' },
    ],
  });
  b.router('r2', {
    dynamicRouting: true,
    interfaces: [
      { name: 'eth0', ip: '10.12.0.2/30' },
      { name: 'eth1', ip: '10.23.0.1/30' },
    ],
  });
  b.router('r3', {
    dynamicRouting: true,
    interfaces: [
      { name: 'eth0', ip: '10.23.0.2/30' },
      { name: 'eth1', ip: '10.3.0.1/24' },
    ],
  });
  b.host('pc1', { ip: '10.1.0.10/24', gateway: '10.1.0.1' });
  b.host('pc3', { ip: '10.3.0.10/24', gateway: '10.3.0.1' });
  b.link('pc1', 'eth0', 'r1', 'eth0');
  b.link('r1', 'eth1', 'r2', 'eth0');
  b.link('r2', 'eth1', 'r3', 'eth0');
  b.link('r3', 'eth1', 'pc3', 'eth0');
  return b.build();
}

describe('routage dynamique', () => {
  it('un routeur apprend les reseaux distants de ses voisins', () => {
    const result = convergeDistanceVector(routingLab());
    const learned = result.routesByNode.get('r1') ?? [];
    const destinations = learned.map((route) => route.destination);
    expect(destinations).toContain('10.3.0.0/24');
    expect(learned.find((r) => r.destination === '10.3.0.0/24')?.metric).toBe(2);
    expect(result.converged).toBe(true);
  });

  it('sans convergence, les reseaux extremes ne se joignent pas', () => {
    const topology = routingLab();
    expect(forwardPacket(topology, 'pc1', '10.3.0.10').delivered).toBe(false);
  });

  it('apres convergence, la traversee complete fonctionne', () => {
    const engine = new NetworkEngine(routingLab());
    engine.converge();
    expect(engine.reach('pc1', '10.3.0.10').delivered).toBe(true);
  });

  it('une coupure retire la route obsolete au lieu de la laisser subsister', () => {
    const engine = new NetworkEngine(routingLab());
    engine.converge();
    expect(engine.reach('pc1', '10.3.0.10').delivered).toBe(true);

    const link = engine.topology.links.find((l) => l.a.nodeId === 'r2' && l.b.nodeId === 'r3');
    expect(link).toBeDefined();
    engine.setLinkConnected(link!.id, false);
    engine.converge();

    const routes = engine.routingTable('r1').filter((r) => r.origin === 'dynamic');
    expect(routes.some((r) => r.destination === '10.3.0.0/24')).toBe(false);
    expect(engine.reach('pc1', '10.3.0.10').delivered).toBe(false);
  });
});

describe('IPv6', () => {
  it('developpe et compresse les adresses de facon canonique', () => {
    expect(expandIpv6('2001:db8::1')).toBe('2001:0db8:0000:0000:0000:0000:0000:0001');
    expect(compressIpv6('2001:0db8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1');
    expect(compressIpv6('fe80:0000:0000:0000:0204:61ff:fe9d:f156')).toBe(
      'fe80::204:61ff:fe9d:f156',
    );
    // Un seul groupe nul ne justifie pas la compression.
    expect(compressIpv6('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1');
  });

  it('derive une adresse de lien-local a partir de l adresse physique', () => {
    // Le bit universel est inverse et fffe est insere au milieu.
    expect(linkLocalFromMac('00:04:61:9d:f1:56')).toBe('fe80::204:61ff:fe9d:f156');
  });

  it('l auto-configuration combine le prefixe annonce et l identifiant local', () => {
    const address = slaacAddress('2001:db8:10::', 64, '00:04:61:9d:f1:56');
    expect(address.startsWith('2001:db8:10:')).toBe(true);
    expect(address.endsWith('204:61ff:fe9d:f156')).toBe(true);
  });

  it('la decouverte de voisins reste confinee au domaine de diffusion', () => {
    const b = new TopologyBuilder('lab-v6', 'Double pile');
    b.switchNode('sw', {
      vlans: [
        { id: 10, name: 'A' },
        { id: 20, name: 'B' },
      ],
      interfaces: [
        { name: 'Gi0/1', mode: 'access', accessVlan: 10 },
        { name: 'Gi0/2', mode: 'access', accessVlan: 10 },
        { name: 'Gi0/3', mode: 'access', accessVlan: 20 },
      ],
    });
    b.host('pcA', {
      ip: '10.0.0.1/24',
      interfaces: [{ name: 'eth0', ip: '10.0.0.1/24', ipv6: '2001:db8::1/64' }],
    });
    b.host('pcB', {
      ip: '10.0.0.2/24',
      interfaces: [{ name: 'eth0', ip: '10.0.0.2/24', ipv6: '2001:db8::2/64' }],
    });
    b.host('pcC', {
      ip: '10.0.0.3/24',
      interfaces: [{ name: 'eth0', ip: '10.0.0.3/24', ipv6: '2001:db8::3/64' }],
    });
    b.link('pcA', 'eth0', 'sw', 'Gi0/1');
    b.link('pcB', 'eth0', 'sw', 'Gi0/2');
    b.link('pcC', 'eth0', 'sw', 'Gi0/3');
    const topology = b.build();

    const pcA = topology.nodes.find((n) => n.id === 'pcA');
    const iface = pcA?.interfaces[0];
    expect(iface).toBeDefined();

    // Meme VLAN : le voisin repond.
    expect(
      discoverNeighbour(topology, { nodeId: 'pcA', interfaceId: iface!.id }, '2001:db8::2')
        .resolved,
    ).toBe(true);
    // VLAN different : la sollicitation ne l atteint pas.
    expect(
      discoverNeighbour(topology, { nodeId: 'pcA', interfaceId: iface!.id }, '2001:db8::3')
        .resolved,
    ).toBe(false);

    expect(reachIpv6(topology, 'pcA', '2001:db8::2').delivered).toBe(true);
    const blocked = reachIpv6(topology, 'pcA', '2001:db8::3');
    expect(blocked.delivered).toBe(false);
    expect(blocked.reason).toContain('aucun voisin');
  });

  it('annonce clairement ce qui n est pas simule', () => {
    const b = new TopologyBuilder('lab-v6-routage', 'Routage IPv6');
    b.host('pcA', { interfaces: [{ name: 'eth0', ipv6: '2001:db8:1::1/64' }] });
    b.host('pcB', { interfaces: [{ name: 'eth0', ipv6: '2001:db8:2::1/64' }] });
    b.link('pcA', 'eth0', 'pcB', 'eth0');
    const result = reachIpv6(b.build(), 'pcA', '2001:db8:2::1');
    expect(result.delivered).toBe(false);
    expect(result.reason).toContain('routage IPv6 entre prefixes n est pas simule');
  });

  it('la double pile prepare le lien-local et l auto-configuration', () => {
    const b = new TopologyBuilder('lab-slaac', 'SLAAC');
    b.switchNode('sw', { vlans: [{ id: 1, name: 'DEFAUT' }], ports: 3 });
    b.router('r1', {
      interfaces: [{ name: 'eth0', ip: '10.0.0.1/24', ipv6: '2001:db8:42::1/64' }],
    });
    b.host('pc1', { ip: '10.0.0.10/24' });
    b.link('r1', 'eth0', 'sw', 'Gi0/1');
    b.link('pc1', 'eth0', 'sw', 'Gi0/2');
    const engine = new NetworkEngine(b.build());

    const result = engine.enableIpv6();
    expect(result.linkLocal).toBeGreaterThan(0);
    expect(result.slaac).toBe(1);

    const pc = engine.node('pc1');
    const global = pc?.interfaces[0]?.addressesV6.find((entry) => entry.source === 'slaac');
    expect(global?.address.startsWith('2001:db8:42:')).toBe(true);
    expect(engine.reachV6('pc1', '2001:db8:42::1').delivered).toBe(true);
  });
});
