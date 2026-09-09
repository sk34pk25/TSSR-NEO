import type { NetworkInterface, NetworkNode } from '@tssr/contracts';
import type { EventBus } from '@tssr/events';
import type { NetworkEngine } from './engine.ts';
import { effectiveRoutes } from './routing.ts';
import { floodDomain } from './l2.ts';
import { describeSpanningTree } from './spanning-tree.ts';

export interface ConsoleResult {
  output: string;
  error: boolean;
}

type Mode = 'exec' | 'config' | 'config-if' | 'config-vlan';

function ok(output: string): ConsoleResult {
  return { output, error: false };
}
function ko(output: string): ConsoleResult {
  return { output, error: true };
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function parseVlanList(text: string): number[] {
  const vlans = new Set<number>();
  for (const part of text.split(',')) {
    const range = part.split('-').map((v) => Number(v.trim()));
    if (range.length === 2 && Number.isFinite(range[0]) && Number.isFinite(range[1])) {
      for (let v = range[0] as number; v <= (range[1] as number); v += 1) vlans.add(v);
    } else if (Number.isFinite(range[0])) {
      vlans.add(range[0] as number);
    }
  }
  return [...vlans].filter((v) => v >= 1 && v <= 4094).sort((a, b) => a - b);
}

/**
 * Console d equipement reseau, syntaxe proche des consoles constructeurs usuelles.
 * Chaque commande agit reellement sur la topologie simulee ;
 * l interface et les libelles sont propres a TSSR NEO.
 */
export class SwitchConsole {
  private readonly engine: NetworkEngine;
  private readonly nodeId: string;
  private readonly bus: EventBus | undefined;
  private mode: Mode = 'exec';
  private currentInterface: string | undefined;
  private currentVlan: number | undefined;
  readonly history: string[] = [];

  constructor(engine: NetworkEngine, nodeId: string, options: { bus?: EventBus } = {}) {
    this.engine = engine;
    this.nodeId = nodeId;
    this.bus = options.bus;
  }

  private node(): NetworkNode | undefined {
    return this.engine.node(this.nodeId);
  }

  prompt(): string {
    const name = this.node()?.hostname ?? 'equipement';
    switch (this.mode) {
      case 'config':
        return `${name}(config)# `;
      case 'config-if':
        return `${name}(config-if)# `;
      case 'config-vlan':
        return `${name}(config-vlan)# `;
      default:
        return `${name}> `;
    }
  }

  helpText(): string {
    return [
      'Commandes disponibles :',
      '  show vlan brief                    etat des VLAN et de leurs ports',
      '  show interfaces status             etat, VLAN et debit de chaque port',
      '  show mac address-table             adresses MAC vues par port',
      '  show ip interface brief            adressage des interfaces',
      '  show ip route                      table de routage',
      '  show spanning-tree                 pont racine et ports en blocage',
      '  show ipv6 interface                adressage IPv6 des interfaces',
      '  show running-config                configuration courante',
      '  configure terminal                 passe en mode configuration',
      '  vlan <id> / name <texte>           declare un VLAN',
      '  interface <nom>                    selectionne une interface',
      '    switchport mode access|trunk',
      '    switchport access vlan <id>',
      '    switchport trunk allowed vlan <liste>',
      '    switchport trunk native vlan <id>',
      '    ip address <ip> <masque|prefixe>',
      '    shutdown / no shutdown',
      '  exit / end                         remonte d un niveau / revient en mode exec',
    ].join('\n');
  }

  execute(line: string): ConsoleResult {
    const trimmed = line.trim();
    if (trimmed === '') return ok('');
    this.history.push(trimmed);
    this.bus?.emit({
      category: 'command',
      type: 'console.command',
      payload: { nodeId: this.nodeId, command: trimmed },
    });

    const node = this.node();
    if (!node) return ko('% equipement introuvable');
    if (!node.powered) return ko('% l equipement est hors tension');

    const tokens = trimmed.split(/\s+/);
    const head = (tokens[0] ?? '').toLowerCase();

    if (head === '?' || head === 'help' || head === 'aide') return ok(this.helpText());
    if (head === 'end') {
      this.mode = 'exec';
      this.currentInterface = undefined;
      this.currentVlan = undefined;
      return ok('');
    }
    if (head === 'exit') {
      if (this.mode === 'config-if' || this.mode === 'config-vlan') {
        this.mode = 'config';
        this.currentInterface = undefined;
        this.currentVlan = undefined;
      } else {
        this.mode = 'exec';
      }
      return ok('');
    }
    if (head === 'show') return this.show(node, tokens.slice(1));
    if (head === 'configure' || head === 'conf') {
      this.mode = 'config';
      return ok('Mode configuration. Une ligne par commande, "end" pour terminer.');
    }

    if (this.mode === 'exec') {
      return ko(`% commande "${tokens[0]}" non reconnue en mode exec. Tapez "?" pour l aide.`);
    }
    return this.configure(node, tokens);
  }

  private show(node: NetworkNode, args: string[]): ConsoleResult {
    const topic = args.map((a) => a.toLowerCase()).join(' ');
    if (topic.startsWith('vlan')) {
      const rows = [`${pad('VLAN', 6)}${pad('Nom', 18)}Ports`];
      const vlans = node.vlans.length > 0 ? node.vlans : [{ id: 1, name: 'default' }];
      for (const vlan of vlans) {
        const ports = node.interfaces
          .filter(
            (i) =>
              (i.mode === 'access' && (i.accessVlan ?? 1) === vlan.id) ||
              (i.mode === 'trunk' && i.trunkVlans.includes(vlan.id)),
          )
          .map((i) => i.name + (i.mode === 'trunk' ? '(trunk)' : ''));
        rows.push(
          `${pad(String(vlan.id), 6)}${pad(vlan.name || `VLAN${vlan.id}`, 18)}${ports.join(', ') || '(aucun)'}`,
        );
      }
      return ok(rows.join('\n'));
    }
    if (topic.startsWith('interfaces status') || topic === 'interfaces' || topic === 'int status') {
      const index = this.engine.index();
      const rows = [
        `${pad('Port', 12)}${pad('Etat', 12)}${pad('VLAN', 10)}${pad('Mode', 10)}Debit`,
      ];
      for (const iface of node.interfaces) {
        const up = iface.enabled && index.isLinkUp(iface.id);
        const vlan = iface.mode === 'trunk' ? 'trunk' : String(iface.accessVlan ?? iface.vlan ?? 1);
        rows.push(
          `${pad(iface.name, 12)}${pad(up ? 'connecte' : iface.enabled ? 'inactif' : 'desactive', 12)}${pad(vlan, 10)}${pad(iface.mode, 10)}${iface.speedMbps} Mbit/s`,
        );
      }
      return ok(rows.join('\n'));
    }
    if (topic.startsWith('mac')) {
      const index = this.engine.index();
      const rows = [`${pad('VLAN', 6)}${pad('Adresse MAC', 20)}Port`];
      for (const iface of node.interfaces) {
        if (!iface.enabled) continue;
        const flood = floodDomain(index, { nodeId: node.id, interfaceId: iface.id });
        const seen = new Set<string>();
        for (const endpoint of flood.endpoints) {
          const ref = index.interfaceRef(endpoint.interfaceId);
          if (!ref || ref.node.id === node.id) continue;
          if (seen.has(ref.iface.mac)) continue;
          seen.add(ref.iface.mac);
          rows.push(
            `${pad(String(iface.accessVlan ?? endpoint.vlan ?? 1), 6)}${pad(ref.iface.mac, 20)}${iface.name}`,
          );
        }
      }
      return ok(rows.length === 1 ? 'Aucune adresse apprise.' : rows.join('\n'));
    }
    if (topic.startsWith('ip interface') || topic.startsWith('ip int')) {
      const rows = [`${pad('Interface', 14)}${pad('Adresse IP', 20)}${pad('Etat', 12)}Mode`];
      for (const iface of node.interfaces) {
        const address = iface.addresses[0];
        rows.push(
          `${pad(iface.name, 14)}${pad(address ? `${address.address}/${address.prefix}` : 'non attribuee', 20)}${pad(iface.enabled ? 'up' : 'down', 12)}${iface.mode}`,
        );
      }
      return ok(rows.join('\n'));
    }
    if (topic.startsWith('ip route') || topic === 'route') {
      const routes = effectiveRoutes(node);
      if (routes.length === 0) return ok('Aucune route.');
      return ok(
        routes
          .map((r) => {
            const iface = node.interfaces.find((i) => i.id === r.interfaceId);
            return `${r.origin === 'connected' ? 'C' : r.origin === 'default' ? 'S*' : 'S'}  ${r.destination}${r.via ? ` via ${r.via}` : ''}, ${iface?.name ?? '?'}`;
          })
          .join('\n'),
      );
    }
    if (topic.startsWith('spanning')) {
      return ok(describeSpanningTree(this.engine.topology));
    }
    if (topic.startsWith('ipv6')) {
      const rows = [`${pad('Interface', 14)}${pad('Adresse IPv6', 32)}Origine`];
      for (const iface of node.interfaces) {
        if (iface.addressesV6.length === 0) {
          rows.push(`${pad(iface.name, 14)}${pad('aucune', 32)}-`);
          continue;
        }
        for (const address of iface.addressesV6) {
          rows.push(
            `${pad(iface.name, 14)}${pad(`${address.address}/${address.prefix}`, 32)}${address.source}`,
          );
        }
      }
      return ok(rows.join('\n'));
    }
    if (topic.startsWith('running') || topic.startsWith('run')) {
      return ok(this.runningConfig(node));
    }
    return ko(`% "show ${topic}" n est pas disponible. Tapez "?" pour la liste exacte.`);
  }

  private runningConfig(node: NetworkNode): string {
    const lines: string[] = [`hostname ${node.hostname}`, '!'];
    for (const vlan of node.vlans) {
      lines.push(`vlan ${vlan.id}`, ` name ${vlan.name || `VLAN${vlan.id}`}`, '!');
    }
    for (const iface of node.interfaces) {
      lines.push(`interface ${iface.name}`);
      if (iface.mode === 'access') {
        lines.push(' switchport mode access', ` switchport access vlan ${iface.accessVlan ?? 1}`);
      } else if (iface.mode === 'trunk') {
        lines.push(' switchport mode trunk');
        if (iface.trunkVlans.length > 0)
          lines.push(` switchport trunk allowed vlan ${iface.trunkVlans.join(',')}`);
        if (iface.nativeVlan !== undefined)
          lines.push(` switchport trunk native vlan ${iface.nativeVlan}`);
      }
      for (const address of iface.addresses) {
        lines.push(` ip address ${address.address}/${address.prefix}`);
      }
      if (!iface.enabled) lines.push(' shutdown');
      lines.push('!');
    }
    return lines.join('\n');
  }

  private currentIface(node: NetworkNode): NetworkInterface | undefined {
    if (this.currentInterface === undefined) return undefined;
    return node.interfaces.find(
      (i) => i.name.toLowerCase() === (this.currentInterface as string).toLowerCase(),
    );
  }

  private configure(node: NetworkNode, tokens: string[]): ConsoleResult {
    const head = (tokens[0] ?? '').toLowerCase();

    if (head === 'hostname' && tokens[1] !== undefined) {
      node.hostname = tokens[1];
      return ok('');
    }

    if (head === 'vlan' && tokens[1] !== undefined) {
      const id = Number(tokens[1]);
      if (!Number.isInteger(id) || id < 1 || id > 4094) return ko('% identifiant de VLAN invalide');
      this.engine.declareVlan(node.id, id);
      this.mode = 'config-vlan';
      this.currentVlan = id;
      return ok('');
    }

    if (head === 'name' && this.mode === 'config-vlan' && this.currentVlan !== undefined) {
      const vlan = node.vlans.find((v) => v.id === this.currentVlan);
      if (vlan) vlan.name = tokens.slice(1).join(' ');
      return ok('');
    }

    if (head === 'spanning-tree') {
      const enable = (tokens[1] ?? '').toLowerCase() !== 'disable';
      node.spanningTree = { enabled: enable, priority: node.spanningTree?.priority ?? 32768 };
      return ok(
        enable
          ? 'Arbre recouvrant active : les boucles seront neutralisees.'
          : 'Arbre recouvrant desactive : les boucles ne sont plus protegees.',
      );
    }
    if (head === 'no' && (tokens[1] ?? '').toLowerCase() === 'spanning-tree') {
      node.spanningTree = { enabled: false, priority: node.spanningTree?.priority ?? 32768 };
      return ok('Arbre recouvrant desactive.');
    }
    if (head === 'router' && (tokens[1] ?? '').toLowerCase() === 'dynamic') {
      node.dynamicRouting = { enabled: true, protocol: 'distance-vector' };
      const result = this.engine.converge();
      return ok(`Routage dynamique active. Convergence en ${result.iterations} echange(s).`);
    }
    if (head === 'interface' || head === 'int') {
      const name = tokens[1];
      if (name === undefined) return ko('% nom d interface manquant');
      const iface = node.interfaces.find((i) => i.name.toLowerCase() === name.toLowerCase());
      if (!iface) return ko(`% interface ${name} inexistante sur ${node.hostname}`);
      this.mode = 'config-if';
      this.currentInterface = iface.name;
      return ok('');
    }

    if (this.mode !== 'config-if') {
      return ko(`% commande "${tokens[0]}" non reconnue dans ce mode`);
    }
    const iface = this.currentIface(node);
    if (!iface) return ko('% aucune interface selectionnee');

    if (head === 'shutdown') {
      this.engine.setInterfaceEnabled(node.id, iface.name, false);
      return ok('');
    }
    if (head === 'no' && (tokens[1] ?? '').toLowerCase() === 'shutdown') {
      this.engine.setInterfaceEnabled(node.id, iface.name, true);
      return ok('');
    }
    if (head === 'switchport') {
      const sub = (tokens[1] ?? '').toLowerCase();
      if (sub === 'mode') {
        const mode = (tokens[2] ?? '').toLowerCase();
        if (mode === 'access') {
          this.engine.setAccessVlan(node.id, iface.name, iface.accessVlan ?? 1);
          return ok('');
        }
        if (mode === 'trunk') {
          this.engine.setTrunk(node.id, iface.name, iface.trunkVlans, iface.nativeVlan);
          return ok('');
        }
        return ko('% mode attendu : access ou trunk');
      }
      if (sub === 'access' && (tokens[2] ?? '').toLowerCase() === 'vlan') {
        const id = Number(tokens[3]);
        if (!Number.isInteger(id) || id < 1 || id > 4094)
          return ko('% identifiant de VLAN invalide');
        if (node.vlans.length > 0 && !node.vlans.some((v) => v.id === id)) {
          return ko(
            `% le VLAN ${id} n est pas declare sur ${node.hostname} (utilisez "vlan ${id}")`,
          );
        }
        this.engine.setAccessVlan(node.id, iface.name, id);
        return ok('');
      }
      if (sub === 'trunk') {
        const kind = (tokens[2] ?? '').toLowerCase();
        if (kind === 'allowed' && (tokens[3] ?? '').toLowerCase() === 'vlan') {
          const vlans = parseVlanList(tokens.slice(4).join(''));
          if (vlans.length === 0) return ko('% liste de VLAN invalide');
          this.engine.setTrunk(node.id, iface.name, vlans, iface.nativeVlan);
          return ok('');
        }
        if (kind === 'native' && (tokens[3] ?? '').toLowerCase() === 'vlan') {
          const id = Number(tokens[4]);
          if (!Number.isInteger(id)) return ko('% identifiant de VLAN invalide');
          this.engine.setTrunk(node.id, iface.name, iface.trunkVlans, id);
          return ok('');
        }
      }
      return ko('% option switchport non reconnue');
    }
    if (head === 'ip' && (tokens[1] ?? '').toLowerCase() === 'address') {
      const address = tokens[2];
      const maskOrPrefix = tokens[3];
      if (address === undefined || maskOrPrefix === undefined)
        return ko('% usage : ip address <ip> <masque|prefixe>');
      let prefix: number;
      if (maskOrPrefix.includes('.')) {
        const octets = maskOrPrefix.split('.').map(Number);
        if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o)))
          return ko('% masque invalide');
        prefix = octets.reduce(
          (count, octet) => count + ((octet >>> 0).toString(2).match(/1/g)?.length ?? 0),
          0,
        );
      } else {
        prefix = Number(maskOrPrefix.replace('/', ''));
      }
      if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return ko('% prefixe invalide');
      this.engine.setInterfaceAddress(node.id, iface.name, address, prefix);
      return ok('');
    }

    return ko(`% commande "${tokens.join(' ')}" non reconnue`);
  }
}
