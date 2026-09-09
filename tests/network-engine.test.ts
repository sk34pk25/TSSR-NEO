import { describe, expect, it } from 'vitest';
import { EventBus, Rng } from '@tssr/events';
import {
  NetworkEngine,
  TopologyBuilder,
  checkReachability,
  effectiveRoutes,
  floodDomain,
  forwardPacket,
  makePool,
  requestDhcpLease,
  resolveName,
  TopologyIndex,
  connectToService,
} from '@tssr/sim-network';
import { zNetworkTopology } from '@tssr/contracts';
import { buildCampusNetwork } from './fixtures/campus-network.ts';

describe('contrat de topologie', () => {
  it('le scenario de validation respecte le schema', () => {
    const parsed = zNetworkTopology.safeParse(buildCampusNetwork());
    expect(parsed.success).toBe(true);
  });
});

describe('couche 2 et VLAN', () => {
  it('deux postes du meme VLAN se voient', () => {
    const topo = buildCampusNetwork();
    const result = checkReachability(topo, 'pc-compta', '10.10.10.21');
    expect(result.delivered).toBe(true);
    expect(result.returnOk).toBe(true);
  });

  it('un poste place dans un autre VLAN d acces perd la joignabilite directe', () => {
    const topo = buildCampusNetwork();
    const engine = new NetworkEngine(topo);
    engine.setAccessVlan('sw-acces', 'Gi0/2', 30);
    const result = forwardPacket(topo, 'pc-compta', '10.10.10.21');
    expect(result.delivered).toBe(false);
    expect(result.failure?.reason).toBe('arp-failed');
  });

  it('un VLAN retire du trunk coupe le routage inter-VLAN', () => {
    const topo = buildCampusNetwork();
    const engine = new NetworkEngine(topo);
    engine.setTrunk('sw-acces', 'Gi0/24', [20, 30], 1);
    const result = forwardPacket(topo, 'pc-compta', '10.10.20.10');
    expect(result.delivered).toBe(false);
    expect(result.failure?.reason).toBe('arp-failed');
    expect(result.failure?.detail).toContain('VLAN');
  });

  it('la diffusion reste confinee au VLAN', () => {
    const topo = buildCampusNetwork();
    const index = new TopologyIndex(topo);
    const pc = index.node('pc-compta');
    const iface = pc?.interfaces[0];
    expect(iface).toBeDefined();
    const flood = floodDomain(index, { nodeId: 'pc-compta', interfaceId: iface?.id ?? '' });
    const reachedHostnames = flood.endpoints
      .map((e) => index.interfaceRef(e.interfaceId)?.node.hostname)
      .filter((h): h is string => h !== undefined);
    expect(reachedHostnames).toContain('pc-accueil');
    expect(reachedHostnames).toContain('r-coeur');
    expect(reachedHostnames).not.toContain('srv-infra');
    expect(reachedHostnames).not.toContain('pc-invite');
  });

  it('un cable debranche est un point de blocage identifiable', () => {
    const topo = buildCampusNetwork();
    const engine = new NetworkEngine(topo);
    const link = topo.links.find((l) => l.a.nodeId === 'pc-compta' || l.b.nodeId === 'pc-compta');
    expect(link).toBeDefined();
    engine.setLinkConnected(link?.id ?? '', false);
    const result = forwardPacket(topo, 'pc-compta', '10.10.10.21');
    expect(result.delivered).toBe(false);
    expect(result.failure?.detail).toContain('cable');
  });
});

describe('couche 3, routage et filtrage', () => {
  it('la table de routage effective contient les reseaux connectes', () => {
    const topo = buildCampusNetwork();
    const router = new TopologyIndex(topo).node('r-coeur');
    const routes = effectiveRoutes(router!);
    const destinations = routes.map((r) => r.destination);
    expect(destinations).toContain('10.10.10.0/24');
    expect(destinations).toContain('10.10.20.0/24');
    expect(destinations).toContain('0.0.0.0/0');
    // Le prefixe le plus long doit primer.
    expect(routes[0]?.prefix).toBeGreaterThanOrEqual(routes[routes.length - 1]?.prefix ?? 0);
  });

  it('le routage inter-VLAN fonctionne via les sous-interfaces', () => {
    const topo = buildCampusNetwork();
    const result = checkReachability(topo, 'pc-compta', '10.10.20.10');
    expect(result.delivered).toBe(true);
    expect(result.returnOk).toBe(true);
    expect(result.hops.map((h) => h.hostname)).toContain('r-coeur');
  });

  it('une passerelle manquante produit une absence de route', () => {
    const topo = buildCampusNetwork();
    const engine = new NetworkEngine(topo);
    engine.removeRoute('pc-compta', '0.0.0.0/0');
    const result = forwardPacket(topo, 'pc-compta', '10.10.20.10');
    expect(result.delivered).toBe(false);
    expect(result.failure?.reason).toBe('no-route');
  });

  it('une route de retour absente est detectee separement', () => {
    const topo = buildCampusNetwork();
    const engine = new NetworkEngine(topo);
    engine.removeRoute('srv-infra', '0.0.0.0/0');
    const result = checkReachability(topo, 'pc-compta', '10.10.20.10');
    expect(result.delivered).toBe(true);
    expect(result.returnOk).toBe(false);
  });

  it('la regle de pare-feu bloque reellement les invites vers les serveurs', () => {
    const topo = buildCampusNetwork();
    const guest = forwardPacket(topo, 'pc-invite', '10.10.20.10');
    expect(guest.delivered).toBe(false);
    expect(guest.failure?.reason).toBe('firewall-blocked');
    expect(guest.failure?.detail).toContain('invites');

    const staff = forwardPacket(topo, 'pc-compta', '10.10.20.10');
    expect(staff.delivered).toBe(true);
  });

  it('un equipement eteint est signale comme tel', () => {
    const topo = buildCampusNetwork();
    const engine = new NetworkEngine(topo);
    engine.setNodePower('srv-infra', false);
    const result = forwardPacket(topo, 'pc-compta', '10.10.20.10');
    expect(result.delivered).toBe(false);
    expect(['arp-failed', 'destination-powered-off']).toContain(result.failure?.reason);
  });
});

describe('services applicatifs', () => {
  it('la resolution DNS suit la chaine CNAME', () => {
    const topo = buildCampusNetwork();
    const result = resolveName(topo, 'pc-compta', 'intranet.neo.lan');
    expect(result.resolved).toBe(true);
    expect(result.address).toBe('10.10.20.10');
    expect(result.chain.join(' ')).toContain('CNAME');
  });

  it('un service DNS arrete rend la resolution impossible mais l IP reste joignable', () => {
    const topo = buildCampusNetwork();
    const engine = new NetworkEngine(topo);
    engine.setServiceStatus('srv-infra', 'svc-dns', 'stopped');
    const dns = resolveName(topo, 'pc-compta', 'intranet.neo.lan');
    expect(dns.resolved).toBe(false);
    expect(dns.failure?.reason).toBe('service-down');
    expect(forwardPacket(topo, 'pc-compta', '10.10.20.10').delivered).toBe(true);
  });

  it('une dependance de service en panne empeche la connexion', () => {
    const topo = buildCampusNetwork();
    const engine = new NetworkEngine(topo);
    engine.setServiceStatus('srv-infra', 'svc-dns', 'stopped');
    const result = connectToService(topo, 'pc-compta', '10.10.20.10', 445);
    expect(result.connected).toBe(false);
    expect(result.failure?.reason).toBe('dependency-down');
  });

  it('un poste sans serveur DNS configure echoue explicitement', () => {
    const topo = buildCampusNetwork();
    const engine = new NetworkEngine(topo);
    engine.setDnsClients('pc-compta', []);
    const result = resolveName(topo, 'pc-compta', 'intranet.neo.lan');
    expect(result.failure?.reason).toBe('no-resolver');
  });
});

describe('DHCP', () => {
  function labWithDhcp() {
    const b = new TopologyBuilder('lab-dhcp', 'Lab DHCP');
    b.switchNode('sw', { ports: 4, vlans: [{ id: 1, name: 'DEFAUT' }] });
    b.server('srv', {
      ip: '192.168.50.1/24',
      services: [{ id: 'svc-dhcp', kind: 'dhcp' }],
      dhcpPools: [makePool('pool', '192.168.50.0/24', { from: 100, to: 102, gateway: '192.168.50.1', dns: ['192.168.50.1'] })],
    });
    b.host('pc1');
    b.host('pc2');
    b.link('srv', 'eth0', 'sw', 'Gi0/1');
    b.link('pc1', 'eth0', 'sw', 'Gi0/2');
    b.link('pc2', 'eth0', 'sw', 'Gi0/3');
    return b.build();
  }

  it('attribue une adresse, une passerelle et un DNS', () => {
    const topo = labWithDhcp();
    const engine = new NetworkEngine(topo);
    const result = engine.renewDhcp('pc1', 'eth0');
    expect(result.success).toBe(true);
    expect(result.offer?.address).toBe('192.168.50.100');
    const pc1 = engine.node('pc1');
    expect(pc1?.interfaces[0]?.addresses[0]?.source).toBe('dhcp');
    expect(pc1?.dnsClients).toEqual(['192.168.50.1']);
    expect(engine.routingTable('pc1').some((r) => r.destination === '0.0.0.0/0')).toBe(true);
  });

  it('n attribue jamais deux fois la meme adresse', () => {
    const topo = labWithDhcp();
    const engine = new NetworkEngine(topo);
    const a = engine.renewDhcp('pc1', 'eth0');
    const b = engine.renewDhcp('pc2', 'eth0');
    expect(a.offer?.address).not.toBe(b.offer?.address);
  });

  it('sans serveur joignable, le poste bascule en auto-configuration', () => {
    const topo = labWithDhcp();
    const engine = new NetworkEngine(topo);
    engine.setServiceStatus('srv', 'svc-dhcp', 'stopped');
    const result = engine.renewDhcp('pc1', 'eth0');
    expect(result.success).toBe(false);
    expect(result.failure?.reason).toBe('no-server');
    expect(engine.node('pc1')?.interfaces[0]?.addresses[0]?.address).toMatch(/^169\.254\./);
  });

  it('respecte une reservation par adresse MAC', () => {
    const topo = labWithDhcp();
    const engine = new NetworkEngine(topo);
    const mac = engine.node('pc2')?.interfaces[0]?.mac ?? '';
    const pool = engine.node('srv')?.dhcpPools[0];
    pool?.reservations.push({ mac, address: '192.168.50.200' });
    expect(engine.renewDhcp('pc2', 'eth0').offer?.address).toBe('192.168.50.200');
  });
});

describe('determinisme et journal', () => {
  it('deux moteurs avec la meme graine produisent le meme ping', () => {
    const build = () => {
      const topo = buildCampusNetwork();
      const link = topo.links.find((l) => l.a.nodeId === 'pc-compta' || l.b.nodeId === 'pc-compta');
      if (link) link.lossRate = 0.4;
      return new NetworkEngine(topo, { rng: new Rng(4242) });
    };
    const a = build().ping('pc-compta', '10.10.20.10', 8);
    const b = build().ping('pc-compta', '10.10.20.10', 8);
    expect(a.replies).toEqual(b.replies);
    expect(a.lossPercent).toBe(b.lossPercent);
  });

  it('chaque modification de configuration est journalisee', () => {
    const topo = buildCampusNetwork();
    const bus = new EventBus();
    const engine = new NetworkEngine(topo, { bus });
    engine.setInterfaceAddress('pc-compta', 'eth0', '10.10.10.99', 24);
    engine.setInterfaceEnabled('pc-accueil', 'eth0', false);
    const types = bus.timeline().map((e) => e.type);
    expect(types).toContain('network.interface.address');
    expect(types).toContain('network.interface.state');
  });

  it('traceroute liste les equipements traverses', () => {
    const topo = buildCampusNetwork();
    const engine = new NetworkEngine(topo);
    const trace = engine.traceroute('pc-compta', 'srv-infra.neo.lan');
    expect(trace.completed).toBe(true);
    expect(trace.hops.map((h) => h.hostname)).toEqual(['pc-compta', 'r-coeur', 'srv-infra']);
  });
});
