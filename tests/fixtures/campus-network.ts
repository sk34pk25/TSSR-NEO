import { TopologyBuilder, makePool } from '@tssr/sim-network';
import type { NetworkTopology } from '@tssr/contracts';

/**
 * Scenario de validation fictif "NEO Campus".
 * Deux VLAN utilisateur, un VLAN serveurs, un routeur inter-VLAN, un pare-feu vers Internet.
 * Aucun lien avec un cours reel : sert uniquement aux tests du moteur.
 */
export function buildCampusNetwork(): NetworkTopology {
  const b = new TopologyBuilder('campus-net', 'NEO Campus');

  b.switchNode('sw-acces', {
    hostname: 'sw-acces',
    vlans: [
      { id: 10, name: 'BUREAUX' },
      { id: 20, name: 'SERVEURS' },
      { id: 30, name: 'INVITES' },
    ],
    interfaces: [
      { name: 'Gi0/1', mode: 'access', accessVlan: 10 },
      { name: 'Gi0/2', mode: 'access', accessVlan: 10 },
      { name: 'Gi0/3', mode: 'access', accessVlan: 20 },
      { name: 'Gi0/4', mode: 'access', accessVlan: 30 },
      { name: 'Gi0/24', mode: 'trunk', trunkVlans: [10, 20, 30], nativeVlan: 1 },
    ],
  });

  b.router('r-coeur', {
    hostname: 'r-coeur',
    interfaces: [
      { name: 'Gi0/0', mode: 'trunk', trunkVlans: [10, 20, 30], nativeVlan: 1 },
      { name: 'Gi0/0.10', ip: '10.10.10.1/24', vlan: 10, parent: 'Gi0/0' },
      { name: 'Gi0/0.20', ip: '10.10.20.1/24', vlan: 20, parent: 'Gi0/0' },
      { name: 'Gi0/0.30', ip: '10.10.30.1/24', vlan: 30, parent: 'Gi0/0' },
      { name: 'Gi0/1', ip: '172.16.0.2/30' },
    ],
    gateway: '172.16.0.1',
    firewallRules: [
      {
        id: 'acl-invites-serveurs',
        order: 10,
        action: 'deny',
        direction: 'forward',
        protocol: 'any',
        source: '10.10.30.0/24',
        destination: '10.10.20.0/24',
        label: 'les invites n accedent pas au VLAN serveurs',
        enabled: true,
      },
    ],
  });

  b.firewall('fw-bordure', {
    hostname: 'fw-bordure',
    interfaces: [
      { name: 'eth0', ip: '172.16.0.1/30' },
      { name: 'eth1', ip: '198.51.100.2/30' },
    ],
    firewallRules: [
      {
        id: 'fw-sortie-http',
        order: 10,
        action: 'allow',
        direction: 'forward',
        protocol: 'tcp',
        source: '10.10.0.0/16',
        destination: 'any',
        destinationPort: 443,
        label: 'navigation web autorisee vers Internet',
        enabled: true,
      },
      {
        id: 'fw-deny-invites-internet',
        order: 20,
        action: 'deny',
        direction: 'forward',
        protocol: 'any',
        source: '10.10.30.0/24',
        destination: 'any',
        label: 'le VLAN invites ne sort pas par ce pare-feu',
        enabled: true,
      },
    ],
  });
  b.route('fw-bordure', '10.10.0.0/16', '172.16.0.2', 'eth0');
  b.route('fw-bordure', '0.0.0.0/0', '198.51.100.1', 'eth1');

  b.node('internet', {
    kind: 'internet',
    hostname: 'internet',
    interfaces: [{ name: 'eth0', ip: '198.51.100.1/30' }],
  });
  b.route('internet', '10.10.0.0/16', '198.51.100.2', 'eth0');

  b.server('srv-infra', {
    hostname: 'srv-infra',
    ip: '10.10.20.10/24',
    gateway: '10.10.20.1',
    dns: ['10.10.20.10'],
    services: [
      { id: 'svc-dns', kind: 'dns' },
      { id: 'svc-dhcp', kind: 'dhcp' },
      { id: 'svc-smb', kind: 'smb', dependsOn: ['svc-dns'] },
    ],
    dnsZones: [
      {
        name: 'neo.lan',
        records: [
          { name: 'srv-infra.neo.lan', type: 'A', value: '10.10.20.10', ttl: 3600 },
          { name: 'intranet.neo.lan', type: 'CNAME', value: 'srv-infra.neo.lan', ttl: 3600 },
          { name: 'pc-compta.neo.lan', type: 'A', value: '10.10.10.20', ttl: 3600 },
        ],
      },
    ],
    dhcpPools: [
      makePool('pool-serveurs', '10.10.20.0/24', {
        from: 100,
        to: 150,
        gateway: '10.10.20.1',
        dns: ['10.10.20.10'],
      }),
    ],
  });

  b.host('pc-compta', {
    hostname: 'pc-compta',
    ip: '10.10.10.20/24',
    gateway: '10.10.10.1',
    dns: ['10.10.20.10'],
  });
  b.host('pc-accueil', {
    hostname: 'pc-accueil',
    ip: '10.10.10.21/24',
    gateway: '10.10.10.1',
    dns: ['10.10.20.10'],
  });
  b.host('pc-invite', {
    hostname: 'pc-invite',
    ip: '10.10.30.50/24',
    gateway: '10.10.30.1',
    dns: ['10.10.20.10'],
  });

  b.link('pc-compta', 'eth0', 'sw-acces', 'Gi0/1');
  b.link('pc-accueil', 'eth0', 'sw-acces', 'Gi0/2');
  b.link('srv-infra', 'eth0', 'sw-acces', 'Gi0/3');
  b.link('pc-invite', 'eth0', 'sw-acces', 'Gi0/4');
  b.link('sw-acces', 'Gi0/24', 'r-coeur', 'Gi0/0');
  b.link('r-coeur', 'Gi0/1', 'fw-bordure', 'eth0');
  b.link('fw-bordure', 'eth1', 'internet', 'eth0');

  return b.build();
}
