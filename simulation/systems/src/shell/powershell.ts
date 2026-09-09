import type { FsNode } from '@tssr/contracts';
import { effectiveRoutes } from '@tssr/sim-network';
import {
  canAccess,
  copyPath,
  getNode,
  isPrivileged,
  listDirectory,
  makeDirectory,
  movePath,
  readFile,
  removePath,
  writeFile,
} from '../fs.ts';
import { joinPath, resolvePath, toDisplay } from '../paths.ts';
import { failure, output, table, type CommandResult, type CommandSpec, type ShellContext } from './core.ts';

/** Analyse des parametres nommes PowerShell (-Path valeur, -Recurse). */
function named(args: string[]): { params: Map<string, string>; switches: Set<string>; positional: string[] } {
  const params = new Map<string, string>();
  const switches = new Set<string>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg.startsWith('-')) {
      const key = arg.slice(1).toLowerCase();
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        params.set(key, next);
        i += 1;
      } else {
        switches.add(key);
      }
    } else {
      positional.push(arg);
    }
  }
  return { params, switches, positional };
}

function pathArg(ctx: ShellContext, args: string[], key = 'path'): string {
  const { params, positional } = named(args);
  return resolvePath(ctx.session.cwd, params.get(key) ?? positional[0] ?? '.');
}

function display(ctx: ShellContext, path: string): string {
  return toDisplay(path, ctx.system.os);
}

export const POWERSHELL_COMMANDS: CommandSpec[] = [
  {
    name: 'Get-Location',
    summary: 'affiche le repertoire courant',
    usage: 'Get-Location',
    aliases: ['pwd', 'gl'],
    run: (_args, ctx) => output(display(ctx, ctx.session.cwd)),
  },
  {
    name: 'Set-Location',
    summary: 'change de repertoire',
    usage: 'Set-Location <chemin>',
    aliases: ['cd', 'sl', 'chdir'],
    run: (args, ctx) => {
      const target = pathArg(ctx, args);
      const node = getNode(ctx.system, target);
      if (!node) return failure(`Set-Location : le chemin ${display(ctx, target)} n existe pas.`);
      if (node.kind !== 'dir') return failure(`Set-Location : ${display(ctx, target)} n est pas un repertoire.`);
      ctx.session.cwd = target;
      return output('');
    },
  },
  {
    name: 'Get-ChildItem',
    summary: 'liste le contenu d un repertoire',
    usage: 'Get-ChildItem [-Path <chemin>]',
    aliases: ['ls', 'dir', 'gci'],
    run: (args, ctx) => {
      const target = pathArg(ctx, args);
      if (!canAccess(ctx.system, target, ctx.session.user, 'read')) {
        return failure(`Get-ChildItem : acces refuse au chemin ${display(ctx, target)}.`);
      }
      const listed = listDirectory(ctx.system, target);
      if (!listed.ok) return failure(`Get-ChildItem : ${listed.error.message}`);
      const rows: string[][] = [['Mode', 'Taille', 'Nom']];
      for (const name of listed.value) {
        const node = getNode(ctx.system, joinPath(target, name)) as FsNode;
        rows.push([node.kind === 'dir' ? 'd----' : '-a---', String(node.sizeBytes), name]);
      }
      return output(table(rows));
    },
  },
  {
    name: 'Get-Content',
    summary: 'affiche le contenu d un fichier',
    usage: 'Get-Content <chemin>',
    aliases: ['cat', 'type', 'gc'],
    run: (args, ctx) => {
      const target = pathArg(ctx, args);
      const read = readFile(ctx.system, target, ctx.session.user);
      return read.ok ? output(read.value) : failure(`Get-Content : ${read.error.message}`);
    },
  },
  {
    name: 'Set-Content',
    summary: 'ecrit dans un fichier',
    usage: 'Set-Content -Path <chemin> -Value <texte>',
    aliases: ['sc'],
    run: (args, ctx) => {
      const { params, positional } = named(args);
      const target = resolvePath(ctx.session.cwd, params.get('path') ?? positional[0] ?? '');
      const value = params.get('value') ?? positional[1] ?? '';
      const written = writeFile(ctx.system, target, value, ctx.session.user);
      return written.ok ? output('') : failure(`Set-Content : ${written.error.message}`);
    },
  },
  {
    name: 'New-Item',
    summary: 'cree un fichier ou un repertoire',
    usage: 'New-Item -Path <chemin> [-ItemType Directory|File]',
    aliases: ['ni'],
    run: (args, ctx) => {
      const { params, positional } = named(args);
      const target = resolvePath(ctx.session.cwd, params.get('path') ?? positional[0] ?? '');
      const type = (params.get('itemtype') ?? 'File').toLowerCase();
      const result =
        type === 'directory'
          ? makeDirectory(ctx.system, target, ctx.session.user, { recursive: true })
          : writeFile(ctx.system, target, params.get('value') ?? '', ctx.session.user);
      return result.ok ? output(display(ctx, target)) : failure(`New-Item : ${result.error.message}`);
    },
  },
  {
    name: 'Remove-Item',
    summary: 'supprime un element',
    usage: 'Remove-Item <chemin> [-Recurse]',
    aliases: ['rm', 'del', 'ri'],
    run: (args, ctx) => {
      const { switches } = named(args);
      const target = pathArg(ctx, args);
      const result = removePath(ctx.system, target, ctx.session.user, { recursive: switches.has('recurse') });
      return result.ok ? output('') : failure(`Remove-Item : ${result.error.message}`);
    },
  },
  {
    name: 'Copy-Item',
    summary: 'copie un element',
    usage: 'Copy-Item <source> <destination> [-Recurse]',
    aliases: ['copy', 'cp'],
    run: (args, ctx) => {
      const { switches, params, positional } = named(args);
      const from = resolvePath(ctx.session.cwd, params.get('path') ?? positional[0] ?? '');
      const to = resolvePath(ctx.session.cwd, params.get('destination') ?? positional[1] ?? '');
      const result = copyPath(ctx.system, from, to, ctx.session.user, { recursive: switches.has('recurse') });
      return result.ok ? output('') : failure(`Copy-Item : ${result.error.message}`);
    },
  },
  {
    name: 'Move-Item',
    summary: 'deplace un element',
    usage: 'Move-Item <source> <destination>',
    aliases: ['move', 'mv'],
    run: (args, ctx) => {
      const { params, positional } = named(args);
      const from = resolvePath(ctx.session.cwd, params.get('path') ?? positional[0] ?? '');
      const to = resolvePath(ctx.session.cwd, params.get('destination') ?? positional[1] ?? '');
      const result = movePath(ctx.system, from, to, ctx.session.user);
      return result.ok ? output('') : failure(`Move-Item : ${result.error.message}`);
    },
  },
  {
    name: 'Get-LocalUser',
    summary: 'liste les comptes locaux',
    usage: 'Get-LocalUser',
    run: (_args, ctx) =>
      output(
        table([
          ['Nom', 'Actif', 'Description'],
          ...ctx.system.users.map((u) => [u.name, u.enabled ? 'True' : 'False', u.displayName ?? '']),
        ]),
      ),
  },
  {
    name: 'New-LocalUser',
    summary: 'cree un compte local',
    usage: 'New-LocalUser -Name <nom>',
    run: (args, ctx) => {
      const { params, positional } = named(args);
      const name = params.get('name') ?? positional[0];
      if (name === undefined) return failure('New-LocalUser : parametre -Name obligatoire.', 2);
      const created = ctx.systems.addUser(
        { name, enabled: true, passwordSet: true, mustChangePassword: false, lockedOut: false },
        ctx.session.user,
      );
      return created
        ? output(`Compte ${name} cree.`)
        : failure(`New-LocalUser : creation impossible (droits insuffisants ou compte existant).`);
    },
  },
  {
    name: 'Get-LocalGroup',
    summary: 'liste les groupes locaux',
    usage: 'Get-LocalGroup',
    run: (_args, ctx) =>
      output(table([['Nom', 'Membres'], ...ctx.system.groups.map((g) => [g.name, g.members.join(', ')])])),
  },
  {
    name: 'Add-LocalGroupMember',
    summary: 'ajoute un membre a un groupe',
    usage: 'Add-LocalGroupMember -Group <groupe> -Member <utilisateur>',
    run: (args, ctx) => {
      const { params } = named(args);
      const group = params.get('group');
      const member = params.get('member');
      if (group === undefined || member === undefined) {
        return failure('Add-LocalGroupMember : parametres -Group et -Member obligatoires.', 2);
      }
      const done = ctx.systems.addUserToGroup(member, group, ctx.session.user);
      return done ? output('') : failure('Add-LocalGroupMember : echec (droits, groupe ou compte inexistant).');
    },
  },
  {
    name: 'Get-Service',
    summary: 'liste les services',
    usage: 'Get-Service [-Name <service>]',
    aliases: ['gsv'],
    run: (args, ctx) => {
      const { params, positional } = named(args);
      const filter = params.get('name') ?? positional[0];
      const services = ctx.systems.services().filter((s) => filter === undefined || s.name.toLowerCase().includes(filter.toLowerCase()));
      return output(
        table([
          ['Statut', 'Nom', 'Demarrage', 'Port'],
          ...services.map((s) => [
            s.status === 'running' ? 'Running' : s.status === 'stopped' ? 'Stopped' : s.status,
            s.name,
            s.startupType,
            `${s.protocol}/${s.port}`,
          ]),
        ]),
      );
    },
  },
  {
    name: 'Start-Service',
    summary: 'demarre un service',
    usage: 'Start-Service -Name <service>',
    run: (args, ctx) => {
      const { params, positional } = named(args);
      const name = params.get('name') ?? positional[0];
      if (name === undefined) return failure('Start-Service : parametre -Name obligatoire.', 2);
      return ctx.systems.setServiceStatus(name, 'running', ctx.session.user)
        ? output('')
        : failure('Start-Service : service introuvable ou privileges insuffisants.');
    },
  },
  {
    name: 'Stop-Service',
    summary: 'arrete un service',
    usage: 'Stop-Service -Name <service>',
    run: (args, ctx) => {
      const { params, positional } = named(args);
      const name = params.get('name') ?? positional[0];
      if (name === undefined) return failure('Stop-Service : parametre -Name obligatoire.', 2);
      return ctx.systems.setServiceStatus(name, 'stopped', ctx.session.user)
        ? output('')
        : failure('Stop-Service : service introuvable ou privileges insuffisants.');
    },
  },
  {
    name: 'Set-Service',
    summary: 'configure le demarrage d un service',
    usage: 'Set-Service -Name <service> -StartupType Automatic|Manual|Disabled',
    run: (args, ctx) => {
      const { params } = named(args);
      const name = params.get('name');
      const startup = (params.get('startuptype') ?? '').toLowerCase();
      if (name === undefined) return failure('Set-Service : parametre -Name obligatoire.', 2);
      const mapped = startup === 'automatic' ? 'auto' : startup === 'manual' ? 'manual' : startup === 'disabled' ? 'disabled' : undefined;
      if (mapped === undefined) return failure('Set-Service : -StartupType attendu (Automatic, Manual, Disabled).', 2);
      return ctx.systems.setServiceStartup(name, mapped, ctx.session.user)
        ? output('')
        : failure('Set-Service : service introuvable ou privileges insuffisants.');
    },
  },
  {
    name: 'Get-Process',
    summary: 'liste les processus',
    usage: 'Get-Process',
    aliases: ['ps', 'gps'],
    run: (_args, ctx) =>
      output(
        table([
          ['Id', 'Utilisateur', 'CPU', 'Mo', 'Nom'],
          ...ctx.system.processes.map((p) => [
            String(p.pid),
            p.user,
            p.cpuPercent.toFixed(1),
            String(p.memoryMb),
            p.name,
          ]),
        ]),
      ),
  },
  {
    name: 'Get-NetIPConfiguration',
    summary: 'affiche la configuration IP',
    usage: 'Get-NetIPConfiguration',
    aliases: ['ipconfig'],
    run: (args, ctx) => {
      const node = ctx.systems.node();
      if (!node) return failure('Get-NetIPConfiguration : noeud reseau introuvable.');
      const all = args.some((a) => a.toLowerCase() === '/all' || a.toLowerCase() === '-detailed');
      const routes = effectiveRoutes(node);
      const gateway = routes.find((r) => r.destination === '0.0.0.0/0')?.via;
      const lines: string[] = [];
      for (const iface of node.interfaces) {
        lines.push(`Carte ${iface.name} :`);
        lines.push(`   Etat . . . . . . . . . . . : ${iface.enabled ? 'connecte' : 'deconnecte'}`);
        if (all) lines.push(`   Adresse physique . . . . . : ${iface.mac.toUpperCase().replace(/:/g, '-')}`);
        for (const addr of iface.addresses) {
          lines.push(`   Adresse IPv4 . . . . . . . : ${addr.address} (${addr.source})`);
          lines.push(`   Masque de sous-reseau. . . : /${addr.prefix}`);
        }
        if (iface.addresses.length === 0) lines.push('   Adresse IPv4 . . . . . . . : (aucune)');
        lines.push('');
      }
      if (gateway !== undefined) lines.push(`Passerelle par defaut . . . : ${gateway}`);
      if (node.dnsClients.length > 0) lines.push(`Serveurs DNS . . . . . . . : ${node.dnsClients.join(', ')}`);
      return output(lines.join('\n'));
    },
  },
  {
    name: 'New-NetIPAddress',
    summary: 'configure une adresse IP',
    usage: 'New-NetIPAddress -InterfaceAlias <iface> -IPAddress <ip> -PrefixLength <n>',
    run: (args, ctx) => {
      const { params } = named(args);
      const iface = params.get('interfacealias');
      const ip = params.get('ipaddress');
      const prefix = Number(params.get('prefixlength') ?? '24');
      const node = ctx.systems.node();
      if (node === undefined) return failure('New-NetIPAddress : noeud reseau introuvable.');
      if (iface === undefined || ip === undefined) {
        return failure('New-NetIPAddress : -InterfaceAlias et -IPAddress obligatoires.', 2);
      }
      if (!isPrivileged(ctx.system, ctx.session.user)) {
        return failure('New-NetIPAddress : privileges administrateur requis.');
      }
      return ctx.network.setInterfaceAddress(node.id, iface, ip, prefix)
        ? output('')
        : failure(`New-NetIPAddress : interface ${iface} introuvable.`);
    },
  },
  {
    name: 'Get-NetRoute',
    summary: 'affiche la table de routage',
    usage: 'Get-NetRoute',
    aliases: ['route'],
    run: (_args, ctx) => {
      const node = ctx.systems.node();
      if (!node) return failure('Get-NetRoute : noeud reseau introuvable.');
      return output(
        table([
          ['Destination', 'Passerelle', 'Interface', 'Metrique', 'Origine'],
          ...effectiveRoutes(node).map((r) => [
            r.destination,
            r.via ?? 'sur le lien',
            node.interfaces.find((i) => i.id === r.interfaceId)?.name ?? '?',
            String(r.metric),
            r.origin,
          ]),
        ]),
      );
    },
  },
  {
    name: 'Test-NetConnection',
    summary: 'teste la joignabilite ou un port',
    usage: 'Test-NetConnection <hote> [-Port <port>]',
    aliases: ['tnc'],
    run: (args, ctx) => {
      const { params, positional } = named(args);
      const target = params.get('computername') ?? positional[0];
      const port = params.get('port');
      const node = ctx.systems.node();
      if (node === undefined) return failure('Test-NetConnection : noeud reseau introuvable.');
      if (target === undefined) return failure('Test-NetConnection : hote manquant.', 2);
      const dns = ctx.network.resolve(node.id, target);
      if (!dns.resolved || dns.address === undefined) {
        return failure(`Test-NetConnection : ${dns.failure?.detail ?? 'nom non resolu'}`);
      }
      if (port !== undefined) {
        const result = ctx.network.connect(node.id, dns.address, Number(port));
        return output(
          [
            `NomOrdinateur       : ${target}`,
            `AdresseDistante     : ${dns.address}`,
            `PortTeste           : ${port}`,
            `TcpTestSucceeded    : ${result.connected ? 'True' : 'False'}`,
            result.connected ? '' : `Detail              : ${result.failure?.detail ?? ''}`,
          ]
            .filter(Boolean)
            .join('\n'),
        );
      }
      const ping = ctx.network.ping(node.id, dns.address, 4);
      return output(
        [
          `NomOrdinateur       : ${target}`,
          `AdresseDistante     : ${dns.address}`,
          `PingSucceeded       : ${ping.received > 0 ? 'True' : 'False'}`,
          `TempsMoyenMs        : ${ping.averageMs ?? 'n/a'}`,
        ].join('\n'),
      );
    },
  },
  {
    name: 'Resolve-DnsName',
    summary: 'resout un nom DNS',
    usage: 'Resolve-DnsName <nom>',
    aliases: ['nslookup'],
    run: (args, ctx) => {
      const { positional, params } = named(args);
      const name = params.get('name') ?? positional[0];
      const node = ctx.systems.node();
      if (node === undefined) return failure('Resolve-DnsName : noeud reseau introuvable.');
      if (name === undefined) return failure('Resolve-DnsName : nom manquant.', 2);
      const result = ctx.network.resolve(node.id, name);
      if (!result.resolved) return failure(`Resolve-DnsName : ${result.failure?.detail ?? 'echec'}`);
      return output(
        table([
          ['Nom', 'Type', 'Adresse'],
          [name, 'A', result.address ?? ''],
          ...result.chain.map((c) => ['', 'trace', c]),
        ]),
      );
    },
  },
  {
    name: 'Get-SmbShare',
    summary: 'liste les partages',
    usage: 'Get-SmbShare',
    run: (_args, ctx) =>
      output(
        table([
          ['Nom', 'Chemin', 'Actif', 'Droits de partage'],
          ...ctx.system.shares.map((s) => [
            s.name,
            toDisplay(s.path, ctx.system.os),
            s.enabled ? 'True' : 'False',
            s.sharePermissions.map((p) => `${p.principal}:${p.rights}`).join(', ') || '(aucun)',
          ]),
        ]),
      ),
  },
  {
    name: 'Get-EventLog',
    summary: 'affiche le journal des evenements',
    usage: 'Get-EventLog [-Newest <n>]',
    run: (args, ctx) => {
      const { params } = named(args);
      const limit = Number(params.get('newest') ?? '20');
      return output(
        table([
          ['Heure', 'Niveau', 'Source', 'Message'],
          ...ctx.system.logs.slice(-limit).map((l) => [String(l.at), l.level, l.source, l.message]),
        ]),
      );
    },
  },
  {
    name: 'Restart-Computer',
    summary: 'redemarre la machine simulee',
    usage: 'Restart-Computer',
    run: (_args, ctx) =>
      ctx.systems.reboot(ctx.session.user)
        ? output('Redemarrage en cours...')
        : failure('Restart-Computer : privileges administrateur requis.'),
  },
  {
    name: 'hostname',
    summary: 'affiche le nom de la machine',
    usage: 'hostname',
    run: (_args, ctx) => output(ctx.system.hostname),
  },
  {
    name: 'ping',
    summary: 'teste la joignabilite',
    usage: 'ping <hote>',
    run: (args, ctx): CommandResult => {
      const target = args.find((a) => !a.startsWith('-') && !a.startsWith('/'));
      const node = ctx.systems.node();
      if (node === undefined) return failure('ping : noeud reseau introuvable.');
      if (target === undefined) return failure('ping : hote manquant.', 2);
      const result = ctx.network.ping(node.id, target, 4);
      if (result.resolvedAddress === undefined) {
        return failure(`La demande ping n a pas pu trouver l hote ${target}.`);
      }
      const lines = [`Envoi d une requete ping sur ${target} [${result.resolvedAddress}] :`];
      for (const reply of result.replies) {
        lines.push(
          reply.success
            ? `Reponse de ${result.resolvedAddress} : octets=32 temps=${reply.timeMs}ms`
            : `${reply.reason}`,
        );
      }
      lines.push('', `Paquets : envoyes = ${result.transmitted}, recus = ${result.received}, perdus = ${result.transmitted - result.received} (perte ${result.lossPercent}%)`);
      return { stdout: lines.join('\n'), stderr: '', exitCode: result.received > 0 ? 0 : 1 };
    },
  },
];
