import { beforeEach, describe, expect, it } from 'vitest';
import { EventBus } from '@tssr/events';
import { NetworkEngine } from '@tssr/sim-network';
import { SystemEngine, Terminal, createSystem, readFile } from '@tssr/sim-systems';
import type { SystemState } from '@tssr/contracts';
import { buildCampusNetwork } from './fixtures/campus-network.ts';

function setup(os: 'linux' | 'windows' = 'linux', nodeId = 'srv-infra') {
  const topology = buildCampusNetwork();
  const bus = new EventBus();
  const network = new NetworkEngine(topology, { bus });
  const system: SystemState = createSystem({
    id: `sys-${nodeId}`,
    hostname: nodeId,
    os,
    networkNodeId: nodeId,
  });
  const systems = new SystemEngine(system, { network, bus });
  const terminal = new Terminal({ system, systems, network, bus });
  return { topology, bus, network, system, systems, terminal };
}

describe('terminal Linux', () => {
  let env: ReturnType<typeof setup>;
  beforeEach(() => {
    env = setup('linux');
  });

  it('refuse une commande non implementee au lieu d inventer une reponse', () => {
    const result = env.terminal.execute('tcpdump -i eth0');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('non disponible dans cette simulation');
  });

  it("l'aide ne liste que des commandes reellement executables", () => {
    const listed = env.terminal
      .helpText()
      .split('\n')
      .slice(1)
      .map((l) => l.split(/\s{2,}/)[0]?.trim())
      .filter((n): n is string => Boolean(n));
    expect(listed.length).toBeGreaterThan(20);
    for (const name of listed) {
      const result = env.terminal.execute(name);
      expect(result.stderr).not.toContain('non disponible dans cette simulation');
    }
  });

  it('cree, ecrit et relit un fichier via redirection', () => {
    env.terminal.execute('mkdir -p /srv/neo');
    env.terminal.execute('echo bonjour > /srv/neo/note.txt');
    env.terminal.execute('echo suite >> /srv/neo/note.txt');
    const result = env.terminal.execute('cat /srv/neo/note.txt');
    expect(result.stdout).toBe('bonjour\nsuite\n');
    const stored = readFile(env.system, '/srv/neo/note.txt', 'root');
    expect(stored.ok && stored.value).toBe('bonjour\nsuite\n');
  });

  it('applique reellement les permissions POSIX', () => {
    env.terminal.execute('useradd alice');
    env.terminal.execute('mkdir /srv/prive');
    env.terminal.execute('echo secret > /srv/prive/data.txt');
    env.terminal.execute('chmod 600 /srv/prive/data.txt');
    env.terminal.session.user = 'alice';
    const denied = env.terminal.execute('cat /srv/prive/data.txt');
    expect(denied.exitCode).not.toBe(0);
    expect(denied.stderr).toContain('permission refusee');
    env.terminal.session.user = 'root';
    expect(env.terminal.execute('cat /srv/prive/data.txt').stdout).toBe('secret\n');
  });

  it('sudo n eleve que la commande concernee', () => {
    env.terminal.execute('useradd bob');
    env.terminal.execute('usermod -aG sudo bob');
    env.terminal.session.user = 'bob';
    expect(env.terminal.execute('systemctl stop svc-dns').exitCode).not.toBe(0);
    expect(env.terminal.execute('sudo systemctl stop svc-dns').exitCode).toBe(0);
    expect(env.terminal.session.user).toBe('bob');
    expect(env.network.node('srv-infra')?.services.find((s) => s.id === 'svc-dns')?.status).toBe('stopped');
  });

  it('un utilisateur sans sudo ne peut pas elever ses droits', () => {
    env.terminal.execute('useradd carol');
    env.terminal.session.user = 'carol';
    const result = env.terminal.execute('sudo systemctl stop svc-dns');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('sudo');
  });

  it('les pipes chainent reellement les commandes', () => {
    env.terminal.execute('echo alpha > /tmp/a.txt');
    env.terminal.execute('echo beta >> /tmp/a.txt');
    env.terminal.execute('echo alphabet >> /tmp/a.txt');
    expect(env.terminal.execute('cat /tmp/a.txt | grep alpha | wc -l').stdout).toBe('2');
  });

  it('ip addr reflete la configuration reseau reelle', () => {
    const before = env.terminal.execute('ip a');
    expect(before.stdout).toContain('10.10.20.10/24');
    env.terminal.execute('ip addr add 10.10.20.55/24 dev eth0');
    expect(env.terminal.execute('ip a').stdout).toContain('10.10.20.55/24');
    expect(env.network.node('srv-infra')?.interfaces[0]?.addresses[0]?.address).toBe('10.10.20.55');
  });

  it('desactiver une interface casse reellement le ping', () => {
    const ok = env.terminal.execute('ping -c 2 10.10.10.20');
    expect(ok.exitCode).toBe(0);
    env.terminal.execute('ip link set eth0 down');
    const ko = env.terminal.execute('ping -c 2 10.10.10.20');
    expect(ko.exitCode).not.toBe(0);
  });

  it('systemctl agit sur l etat de service partage avec le reseau', () => {
    expect(env.terminal.execute('systemctl status svc-dns').stdout).toContain('running');
    env.terminal.execute('systemctl stop svc-dns');
    expect(env.terminal.execute('systemctl status svc-dns').stdout).toContain('stopped');
    const dig = env.terminal.execute('dig intranet.neo.lan');
    expect(dig.exitCode).not.toBe(0);
  });

  it('les services non automatiques ne repartent pas au redemarrage', () => {
    env.terminal.execute('systemctl stop svc-smb');
    env.terminal.execute('systemctl disable svc-smb');
    env.terminal.execute('reboot');
    expect(env.network.node('srv-infra')?.services.find((s) => s.id === 'svc-smb')?.status).toBe('stopped');
    expect(env.network.node('srv-infra')?.services.find((s) => s.id === 'svc-dns')?.status).toBe('running');
  });

  it('journalise chaque commande pour l evaluation de la methode', () => {
    env.terminal.execute('ip a');
    env.terminal.execute('systemctl status svc-dns');
    const commands = env.bus
      .all()
      .filter((e) => e.type === 'terminal.command')
      .map((e) => e.payload.command);
    expect(commands).toEqual(['ip a', 'systemctl status svc-dns']);
  });
});

describe('terminal Windows', () => {
  it('expose des cmdlets PowerShell qui agissent sur le meme etat', () => {
    const env = setup('windows', 'pc-compta');
    expect(env.terminal.prompt()).toContain('PS ');
    const config = env.terminal.execute('Get-NetIPConfiguration');
    expect(config.stdout).toContain('10.10.10.20');

    env.terminal.execute('New-LocalUser -Name julie');
    expect(env.terminal.execute('Get-LocalUser').stdout).toContain('julie');

    env.terminal.execute('Add-LocalGroupMember -Group Administrators -Member julie');
    expect(env.system.groups.find((g) => g.name === 'Administrators')?.members).toContain('julie');

    const test = env.terminal.execute('Test-NetConnection srv-infra.neo.lan -Port 445');
    expect(test.stdout).toContain('TcpTestSucceeded    : True');
  });

  it('respecte le refus explicite des ACL Windows', () => {
    const env = setup('windows', 'pc-compta');
    env.terminal.execute('New-LocalUser -Name marc');
    env.system.files['C:/Partages/rh.txt'] = {
      kind: 'file',
      content: 'confidentiel',
      permissions: {
        owner: 'Administrator',
        group: 'Administrators',
        mode: '0666',
        acl: [
          { principal: 'Everyone', rights: ['read'], type: 'allow' },
          { principal: 'marc', rights: ['read'], type: 'deny' },
        ],
      },
      sizeBytes: 12,
      modifiedAt: 0,
    };
    env.terminal.session.user = 'marc';
    const denied = env.terminal.execute('Get-Content C:\\Partages\\rh.txt');
    expect(denied.exitCode).not.toBe(0);
    env.terminal.session.user = 'Administrator';
    expect(env.terminal.execute('Get-Content C:\\Partages\\rh.txt').stdout).toBe('confidentiel');
  });

  it('un service arrete rend le test de port negatif', () => {
    const env = setup('windows', 'pc-compta');
    env.network.setServiceStatus('srv-infra', 'svc-smb', 'stopped');
    const test = env.terminal.execute('Test-NetConnection srv-infra.neo.lan -Port 445');
    expect(test.stdout).toContain('TcpTestSucceeded    : False');
  });
});
