import type { FsNode } from '@tssr/contracts';
import { effectiveRoutes } from '@tssr/sim-network';
import {
  canAccess,
  chmod,
  chown,
  copyPath,
  formatMode,
  getNode,
  isPrivileged,
  listDirectory,
  makeDirectory,
  movePath,
  readFile,
  removePath,
  writeFile,
} from '../fs.ts';
import { basename, joinPath, resolvePath } from '../paths.ts';
import { failure, output, parseArgs, table, type CommandResult, type CommandSpec, type ShellContext } from './core.ts';

function requireArg(args: string[], index: number, usage: string): string | CommandResult {
  const value = args[index];
  if (value === undefined) return failure(`argument manquant. Usage : ${usage}`, 2);
  return value;
}

function isResult(value: unknown): value is CommandResult {
  return typeof value === 'object' && value !== null && 'exitCode' in value;
}

function longListing(ctx: ShellContext, dir: string, names: string[]): string {
  const rows = names.map((name) => {
    const path = joinPath(dir, name);
    const node = getNode(ctx.system, path) as FsNode;
    return [
      formatMode(node),
      node.permissions.owner,
      node.permissions.group,
      String(node.sizeBytes),
      name + (node.kind === 'dir' ? '/' : ''),
    ];
  });
  return table(rows);
}

export const BASH_COMMANDS: CommandSpec[] = [
  {
    name: 'pwd',
    summary: 'affiche le repertoire courant',
    usage: 'pwd',
    run: (_args, ctx) => output(ctx.session.cwd),
  },
  {
    name: 'cd',
    summary: 'change de repertoire',
    usage: 'cd <chemin>',
    run: (args, ctx) => {
      const target = resolvePath(ctx.session.cwd, args[0] ?? ctx.session.env.HOME ?? '/');
      const node = getNode(ctx.system, target);
      if (!node) return failure(`cd: ${args[0] ?? target}: aucun fichier ou dossier de ce type`);
      if (node.kind !== 'dir') return failure(`cd: ${target}: n est pas un repertoire`);
      if (!canAccess(ctx.system, target, ctx.session.user, 'execute')) {
        return failure(`cd: ${target}: permission refusee`);
      }
      ctx.session.cwd = target;
      return output('');
    },
  },
  {
    name: 'ls',
    summary: 'liste le contenu d un repertoire',
    usage: 'ls [-l] [-a] [chemin]',
    run: (args, ctx) => {
      const { flags, positional } = parseArgs(args);
      const target = resolvePath(ctx.session.cwd, positional[0] ?? '.');
      const node = getNode(ctx.system, target);
      if (!node) return failure(`ls: ${positional[0] ?? target}: aucun fichier ou dossier de ce type`);
      if (node.kind !== 'dir') return output(basename(target));
      if (!canAccess(ctx.system, target, ctx.session.user, 'read')) {
        return failure(`ls: ${target}: permission refusee`);
      }
      const listed = listDirectory(ctx.system, target);
      if (!listed.ok) return failure(`ls: ${listed.error.message}`);
      const names = flags.has('a') ? ['.', '..', ...listed.value] : listed.value;
      if (flags.has('l')) {
        const visible = names.filter((n) => n !== '.' && n !== '..');
        return output(longListing(ctx, target, visible));
      }
      return output(names.join('  '));
    },
  },
  {
    name: 'cat',
    summary: 'affiche le contenu d un fichier',
    usage: 'cat <fichier>',
    run: (args, ctx, stdin) => {
      if (args.length === 0) return output(stdin);
      const chunks: string[] = [];
      for (const arg of args) {
        const result = readFile(ctx.system, resolvePath(ctx.session.cwd, arg), ctx.session.user);
        if (!result.ok) return failure(`cat: ${result.error.message}`);
        chunks.push(result.value);
      }
      return output(chunks.join(''));
    },
  },
  {
    name: 'echo',
    summary: 'affiche une chaine',
    usage: 'echo <texte>',
    run: (args, ctx) =>
      output(
        args
          .map((a) => a.replace(/\$(\w+)/g, (_m, key: string) => ctx.session.env[key] ?? ''))
          .join(' '),
      ),
  },
  {
    name: 'mkdir',
    summary: 'cree un repertoire',
    usage: 'mkdir [-p] <chemin>',
    run: (args, ctx) => {
      const { flags, positional } = parseArgs(args);
      const path = requireArg(positional, 0, 'mkdir [-p] <chemin>');
      if (isResult(path)) return path;
      const result = makeDirectory(ctx.system, resolvePath(ctx.session.cwd, path), ctx.session.user, {
        recursive: flags.has('p'),
      });
      return result.ok ? output('') : failure(`mkdir: ${result.error.message}`);
    },
  },
  {
    name: 'touch',
    summary: 'cree un fichier vide ou met a jour sa date',
    usage: 'touch <fichier>',
    run: (args, ctx) => {
      const path = requireArg(args, 0, 'touch <fichier>');
      if (isResult(path)) return path;
      const full = resolvePath(ctx.session.cwd, path);
      const existing = getNode(ctx.system, full);
      if (existing) return output('');
      const result = writeFile(ctx.system, full, '', ctx.session.user);
      return result.ok ? output('') : failure(`touch: ${result.error.message}`);
    },
  },
  {
    name: 'rm',
    summary: 'supprime un fichier ou un repertoire',
    usage: 'rm [-r] <chemin>',
    run: (args, ctx) => {
      const { flags, positional } = parseArgs(args);
      const path = requireArg(positional, 0, 'rm [-r] <chemin>');
      if (isResult(path)) return path;
      const result = removePath(ctx.system, resolvePath(ctx.session.cwd, path), ctx.session.user, {
        recursive: flags.has('r') || flags.has('R'),
      });
      return result.ok ? output('') : failure(`rm: ${result.error.message}`);
    },
  },
  {
    name: 'cp',
    summary: 'copie un fichier ou un repertoire',
    usage: 'cp [-r] <source> <destination>',
    run: (args, ctx) => {
      const { flags, positional } = parseArgs(args);
      if (positional.length < 2) return failure('cp: usage : cp [-r] <source> <destination>', 2);
      const result = copyPath(
        ctx.system,
        resolvePath(ctx.session.cwd, positional[0] as string),
        resolvePath(ctx.session.cwd, positional[1] as string),
        ctx.session.user,
        { recursive: flags.has('r') || flags.has('R') },
      );
      return result.ok ? output('') : failure(`cp: ${result.error.message}`);
    },
  },
  {
    name: 'mv',
    summary: 'deplace ou renomme',
    usage: 'mv <source> <destination>',
    run: (args, ctx) => {
      if (args.length < 2) return failure('mv: usage : mv <source> <destination>', 2);
      const result = movePath(
        ctx.system,
        resolvePath(ctx.session.cwd, args[0] as string),
        resolvePath(ctx.session.cwd, args[1] as string),
        ctx.session.user,
      );
      return result.ok ? output('') : failure(`mv: ${result.error.message}`);
    },
  },
  {
    name: 'chmod',
    summary: 'modifie les droits POSIX',
    usage: 'chmod <mode octal> <chemin>',
    run: (args, ctx) => {
      if (args.length < 2) return failure('chmod: usage : chmod <mode> <chemin>', 2);
      const result = chmod(
        ctx.system,
        resolvePath(ctx.session.cwd, args[1] as string),
        args[0] as string,
        ctx.session.user,
      );
      return result.ok ? output('') : failure(`chmod: ${result.error.message}`);
    },
  },
  {
    name: 'chown',
    summary: 'change le proprietaire',
    usage: 'chown <user>[:<groupe>] <chemin>',
    run: (args, ctx) => {
      if (args.length < 2) return failure('chown: usage : chown <user>[:<groupe>] <chemin>', 2);
      const [owner, group] = (args[0] as string).split(':');
      const result = chown(
        ctx.system,
        resolvePath(ctx.session.cwd, args[1] as string),
        owner as string,
        group,
        ctx.session.user,
      );
      return result.ok ? output('') : failure(`chown: ${result.error.message}`);
    },
  },
  {
    name: 'whoami',
    summary: 'affiche l utilisateur courant',
    usage: 'whoami',
    run: (_args, ctx) => output(ctx.session.user),
  },
  {
    name: 'id',
    summary: 'affiche l identite et les groupes',
    usage: 'id [utilisateur]',
    run: (args, ctx) => {
      const name = args[0] ?? ctx.session.user;
      const user = ctx.system.users.find((u) => u.name === name);
      if (!user) return failure(`id: ${name}: utilisateur inexistant`);
      const groups = [...new Set([...user.groups, ...ctx.system.groups.filter((g) => g.members.includes(name)).map((g) => g.name)])];
      return output(`uid=${user.uid ?? 1000}(${user.name}) groupes=${groups.join(',') || '(aucun)'}`);
    },
  },
  {
    name: 'hostname',
    summary: 'affiche le nom d hote',
    usage: 'hostname',
    run: (_args, ctx) => output(ctx.system.hostname),
  },
  {
    name: 'uname',
    summary: 'affiche les informations systeme',
    usage: 'uname [-a]',
    run: (args, ctx) => {
      const { flags } = parseArgs(args);
      if (flags.has('a')) {
        return output(`Linux ${ctx.system.hostname} ${ctx.system.osVersion} NEO-SIM x86_64`);
      }
      return output('Linux');
    },
  },
  {
    name: 'uptime',
    summary: 'affiche la duree de fonctionnement simulee',
    usage: 'uptime',
    run: (_args, ctx) => {
      const ms = ctx.bus?.getSimTime() ?? 0;
      const minutes = Math.floor(ms / 60000);
      return output(`fonctionne depuis ${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}, charge simulee ${(ctx.system.resources.cpuPercent / 100).toFixed(2)}`);
    },
  },
  {
    name: 'free',
    summary: 'affiche l utilisation memoire',
    usage: 'free [-m]',
    run: (_args, ctx) => {
      const r = ctx.system.resources;
      return output(
        table([
          ['', 'total', 'utilise', 'libre'],
          ['Mem:', String(r.memoryTotalMb), String(r.memoryUsedMb), String(r.memoryTotalMb - r.memoryUsedMb)],
        ]),
      );
    },
  },
  {
    name: 'df',
    summary: 'affiche l occupation disque',
    usage: 'df [-h]',
    run: (_args, ctx) => {
      const r = ctx.system.resources;
      const percent = Math.round((r.diskUsedGb / r.diskTotalGb) * 100);
      return output(
        table([
          ['Systeme', 'Taille', 'Utilise', 'Dispo', 'Use%', 'Monte sur'],
          ['/dev/sda1', `${r.diskTotalGb}G`, `${r.diskUsedGb}G`, `${Math.round(r.diskTotalGb - r.diskUsedGb)}G`, `${percent}%`, '/'],
        ]),
      );
    },
  },
  {
    name: 'ps',
    summary: 'liste les processus',
    usage: 'ps [aux]',
    run: (_args, ctx) =>
      output(
        table([
          ['PID', 'UTILISATEUR', '%CPU', 'MEM(Mo)', 'COMMANDE'],
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
    name: 'systemctl',
    summary: 'controle les services',
    usage: 'systemctl <status|start|stop|restart|enable|disable|list-units> [service]',
    run: (args, ctx) => {
      const action = args[0];
      const services = ctx.systems.services();
      if (action === undefined || action === 'list-units') {
        return output(
          table([
            ['UNITE', 'ETAT', 'DEMARRAGE', 'PORT'],
            ...services.map((s) => [s.name, s.status, s.startupType, `${s.protocol}/${s.port}`]),
          ]),
        );
      }
      const name = args[1];
      if (name === undefined) return failure('systemctl: nom de service manquant', 2);
      const service = services.find((s) => s.name === name || s.id === name || s.name === name.replace(/\.service$/, ''));
      if (!service) return failure(`systemctl: unite ${name} introuvable`);
      if (action === 'status') {
        return output(
          `${service.name} - ${service.kind}\n  Etat : ${service.status}\n  Demarrage : ${service.startupType}\n  Ecoute : ${service.protocol}/${service.port}\n  Depend de : ${service.dependsOn.join(', ') || '(rien)'}`,
        );
      }
      const target = action === 'start' || action === 'restart' ? 'running' : action === 'stop' ? 'stopped' : undefined;
      if (target !== undefined) {
        if (!ctx.systems.setServiceStatus(service.id, target, ctx.session.user)) {
          return failure('systemctl: privileges insuffisants (essayez sudo)');
        }
        return output('');
      }
      if (action === 'enable' || action === 'disable') {
        if (!ctx.systems.setServiceStartup(service.id, action === 'enable' ? 'auto' : 'disabled', ctx.session.user)) {
          return failure('systemctl: privileges insuffisants (essayez sudo)');
        }
        return output('');
      }
      return failure(`systemctl: action inconnue "${action}"`, 2);
    },
  },
  {
    name: 'ip',
    summary: 'affiche ou configure adresses et routes',
    usage: 'ip a | ip r | ip addr add <ip>/<prefixe> dev <iface> | ip link set <iface> up|down',
    run: (args, ctx) => {
      const node = ctx.systems.node();
      if (!node) return failure('ip: noeud reseau introuvable');
      const sub = args[0] ?? 'a';
      if (sub === 'a' || sub === 'addr' || sub === 'address') {
        if (args[1] === 'add' || args[1] === 'del') {
          const cidr = args[2];
          const devIndex = args.indexOf('dev');
          const dev = devIndex === -1 ? undefined : args[devIndex + 1];
          if (cidr === undefined || dev === undefined) {
            return failure('ip: usage : ip addr add <ip>/<prefixe> dev <iface>', 2);
          }
          if (!isPrivileged(ctx.system, ctx.session.user)) return failure('ip: operation non permise');
          if (args[1] === 'del') {
            ctx.network.clearInterfaceAddresses(node.id, dev);
            return output('');
          }
          const [address, prefixText] = cidr.split('/');
          if (address === undefined || prefixText === undefined) return failure('ip: adresse invalide', 2);
          const okAddr = ctx.network.setInterfaceAddress(node.id, dev, address, Number(prefixText));
          return okAddr ? output('') : failure(`ip: interface ${dev} introuvable`);
        }
        const lines: string[] = [];
        node.interfaces.forEach((iface, i) => {
          const state = iface.enabled ? 'UP' : 'DOWN';
          lines.push(`${i + 1}: ${iface.name}: <${state}> mtu ${iface.mtu}`);
          lines.push(`    link/ether ${iface.mac}`);
          for (const addr of iface.addresses) {
            lines.push(`    inet ${addr.address}/${addr.prefix} source ${addr.source}`);
          }
        });
        return output(lines.join('\n'));
      }
      if (sub === 'r' || sub === 'route') {
        const routes = effectiveRoutes(node);
        return output(
          routes
            .map((r) => {
              const iface = node.interfaces.find((i) => i.id === r.interfaceId);
              const dest = r.destination === '0.0.0.0/0' ? 'default' : r.destination;
              return `${dest}${r.via ? ` via ${r.via}` : ''} dev ${iface?.name ?? '?'} metric ${r.metric} (${r.origin})`;
            })
            .join('\n'),
        );
      }
      if (sub === 'link') {
        if (args[1] === 'set') {
          const dev = args[2];
          const state = args[3];
          if (dev === undefined || (state !== 'up' && state !== 'down')) {
            return failure('ip: usage : ip link set <iface> up|down', 2);
          }
          if (!isPrivileged(ctx.system, ctx.session.user)) return failure('ip: operation non permise');
          const okLink = ctx.network.setInterfaceEnabled(node.id, dev, state === 'up');
          return okLink ? output('') : failure(`ip: interface ${dev} introuvable`);
        }
        return output(node.interfaces.map((i) => `${i.name} ${i.enabled ? 'UP' : 'DOWN'} ${i.mac}`).join('\n'));
      }
      return failure(`ip: sous-commande "${sub}" non simulee`, 2);
    },
  },
  {
    name: 'ping',
    summary: 'teste la joignabilite',
    usage: 'ping [-c <n>] <hote>',
    run: (args, ctx) => {
      const { flags: _flags, options, positional } = parseArgs(args);
      const countIndex = args.indexOf('-c');
      const count = countIndex !== -1 ? Number(args[countIndex + 1] ?? 4) : Number(options.get('count') ?? 4);
      const target = positional.find((p) => p !== String(count));
      if (target === undefined) return failure('ping: usage : ping [-c <n>] <hote>', 2);
      const node = ctx.systems.node();
      if (!node) return failure('ping: noeud reseau introuvable');
      const result = ctx.network.ping(node.id, target, Number.isFinite(count) ? count : 4);
      const lines: string[] = [];
      if (result.resolvedAddress === undefined) {
        return failure(`ping: ${target}: ${result.dns?.failure?.detail ?? 'nom ou service inconnu'}`);
      }
      lines.push(`PING ${target} (${result.resolvedAddress})`);
      for (const reply of result.replies) {
        lines.push(
          reply.success
            ? `64 octets depuis ${result.resolvedAddress} : icmp_seq=${reply.seq} temps=${reply.timeMs} ms`
            : `Depuis ${result.resolvedAddress} : icmp_seq=${reply.seq} ${reply.reason}`,
        );
      }
      lines.push('');
      lines.push(`--- statistiques ping ${target} ---`);
      lines.push(
        `${result.transmitted} paquets transmis, ${result.received} recus, ${result.lossPercent}% de perte` +
          (result.averageMs === undefined ? '' : `, temps moyen ${result.averageMs} ms`),
      );
      return { stdout: lines.join('\n'), stderr: '', exitCode: result.received > 0 ? 0 : 1 };
    },
  },
  {
    name: 'traceroute',
    summary: 'affiche le chemin reseau',
    usage: 'traceroute <hote>',
    run: (args, ctx) => {
      const target = args[0];
      if (target === undefined) return failure('traceroute: usage : traceroute <hote>', 2);
      const node = ctx.systems.node();
      if (!node) return failure('traceroute: noeud reseau introuvable');
      const trace = ctx.network.traceroute(node.id, target);
      if (trace.hops.length === 0) return failure(`traceroute: ${trace.failure ?? 'destination injoignable'}`);
      const lines = trace.hops.map((h) => ` ${h.ttl}  ${h.hostname}  ${h.timeMs} ms`);
      if (!trace.completed) lines.push(` *  ${trace.failure ?? 'chemin interrompu'}`);
      return output([`traceroute vers ${target}`, ...lines].join('\n'));
    },
  },
  {
    name: 'dig',
    summary: 'interroge le DNS',
    usage: 'dig <nom>',
    aliases: ['nslookup', 'host'],
    run: (args, ctx) => {
      const name = args[0];
      if (name === undefined) return failure('dig: usage : dig <nom>', 2);
      const node = ctx.systems.node();
      if (!node) return failure('dig: noeud reseau introuvable');
      const result = ctx.network.resolve(node.id, name);
      if (!result.resolved) return failure(`dig: ${result.failure?.detail ?? 'resolution impossible'}`);
      const lines = [`;; SERVEUR : ${result.serverAddress ?? 'local'}`, ';; REPONSE :'];
      for (const step of result.chain) lines.push(`  ${step}`);
      lines.push(`${name}. A ${result.address}`);
      return output(lines.join('\n'));
    },
  },
  {
    name: 'ss',
    summary: 'liste les services en ecoute',
    usage: 'ss -tuln',
    aliases: ['netstat'],
    run: (_args, ctx) => {
      const services = ctx.systems.services();
      return output(
        table([
          ['Proto', 'Port', 'Etat', 'Service'],
          ...services.map((s) => [s.protocol, String(s.port), s.status === 'running' ? 'LISTEN' : 'CLOSED', s.name]),
        ]),
      );
    },
  },
  {
    name: 'dhclient',
    summary: 'demande un bail DHCP',
    usage: 'dhclient <iface>',
    run: (args, ctx) => {
      const dev = args[0] ?? 'eth0';
      const node = ctx.systems.node();
      if (!node) return failure('dhclient: noeud reseau introuvable');
      if (!isPrivileged(ctx.system, ctx.session.user)) return failure('dhclient: operation non permise');
      const result = ctx.network.renewDhcp(node.id, dev);
      if (result.success && result.offer) {
        return output(
          `bail obtenu : ${result.offer.address}/${result.offer.prefix} depuis ${result.offer.serverNodeId}` +
            (result.offer.gateway ? `\npasserelle ${result.offer.gateway}` : ''),
        );
      }
      return failure(
        `dhclient: ${result.failure?.detail ?? 'echec'}` +
          (result.apipa ? `\nauto-configuration : ${result.apipa}` : ''),
      );
    },
  },
  {
    name: 'useradd',
    summary: 'cree un compte local',
    usage: 'useradd [-m] [-G groupe] <nom>',
    run: (args, ctx) => {
      const { flags, positional } = parseArgs(args);
      const groupIndex = args.indexOf('-G');
      const extraGroup = groupIndex === -1 ? undefined : args[groupIndex + 1];
      const name = positional.find((p) => p !== extraGroup);
      if (name === undefined) return failure('useradd: usage : useradd [-m] [-G groupe] <nom>', 2);
      const created = ctx.systems.addUser(
        {
          name,
          uid: 1000 + ctx.system.users.length,
          enabled: true,
          passwordSet: false,
          mustChangePassword: true,
          lockedOut: false,
          homeDir: `/home/${name}`,
          shell: '/bin/bash',
        },
        ctx.session.user,
      );
      if (!created) return failure(`useradd: impossible de creer ${name} (droits insuffisants ou compte existant)`);
      if (flags.has('m')) makeDirectory(ctx.system, `/home/${name}`, 'root', { recursive: true });
      if (extraGroup !== undefined) ctx.systems.addUserToGroup(name, extraGroup, ctx.session.user);
      return output('');
    },
  },
  {
    name: 'groupadd',
    summary: 'cree un groupe local',
    usage: 'groupadd <nom>',
    run: (args, ctx) => {
      const name = args[0];
      if (name === undefined) return failure('groupadd: usage : groupadd <nom>', 2);
      const created = ctx.systems.addGroup({ name, gid: 1000 + ctx.system.groups.length, scope: 'local' }, ctx.session.user);
      return created ? output('') : failure(`groupadd: impossible de creer ${name}`);
    },
  },
  {
    name: 'usermod',
    summary: 'modifie un compte',
    usage: 'usermod -aG <groupe> <utilisateur>',
    run: (args, ctx) => {
      const groupIndex = args.findIndex((a) => a === '-aG' || a === '-G');
      const group = groupIndex === -1 ? undefined : args[groupIndex + 1];
      const user = args[args.length - 1];
      if (group === undefined || user === undefined) {
        return failure('usermod: usage : usermod -aG <groupe> <utilisateur>', 2);
      }
      const done = ctx.systems.addUserToGroup(user, group, ctx.session.user);
      return done ? output('') : failure(`usermod: echec (droits, utilisateur ou groupe inexistant)`);
    },
  },
  {
    name: 'getent',
    summary: 'consulte la base des comptes',
    usage: 'getent passwd|group',
    run: (args, ctx) => {
      if (args[0] === 'group') {
        return output(ctx.system.groups.map((g) => `${g.name}:x:${g.gid ?? ''}:${g.members.join(',')}`).join('\n'));
      }
      return output(
        ctx.system.users
          .map((u) => `${u.name}:x:${u.uid ?? ''}::${u.homeDir ?? ''}:${u.shell ?? '/bin/sh'}`)
          .join('\n'),
      );
    },
  },
  {
    name: 'journalctl',
    summary: 'affiche le journal systeme',
    usage: 'journalctl [-n <lignes>] [-p <niveau>]',
    run: (args, ctx) => {
      const nIndex = args.indexOf('-n');
      const limit = nIndex === -1 ? 20 : Number(args[nIndex + 1] ?? 20);
      const pIndex = args.indexOf('-p');
      const level = pIndex === -1 ? undefined : args[pIndex + 1];
      let logs = ctx.system.logs;
      if (level !== undefined) logs = logs.filter((l) => l.level === level);
      return output(
        logs
          .slice(-Math.max(1, limit))
          .map((l) => `[${l.at}] ${l.level.toUpperCase().padEnd(8)} ${l.source}: ${l.message}`)
          .join('\n'),
      );
    },
  },
  {
    name: 'grep',
    summary: 'filtre des lignes',
    usage: 'grep [-i] [-v] <motif> [fichier]',
    run: (args, ctx, stdin) => {
      const { flags, positional } = parseArgs(args);
      const pattern = positional[0];
      if (pattern === undefined) return failure('grep: usage : grep <motif> [fichier]', 2);
      let content = stdin;
      if (positional[1] !== undefined) {
        const read = readFile(ctx.system, resolvePath(ctx.session.cwd, positional[1]), ctx.session.user);
        if (!read.ok) return failure(`grep: ${read.error.message}`);
        content = read.value;
      }
      let regex: RegExp;
      try {
        regex = new RegExp(pattern, flags.has('i') ? 'i' : '');
      } catch {
        return failure(`grep: motif invalide : ${pattern}`, 2);
      }
      const lines = content.split('\n').filter((l) => (flags.has('v') ? !regex.test(l) : regex.test(l)));
      return { stdout: lines.join('\n'), stderr: '', exitCode: lines.length > 0 ? 0 : 1 };
    },
  },
  {
    name: 'head',
    summary: 'affiche le debut',
    usage: 'head [-n <lignes>] [fichier]',
    run: (args, ctx, stdin) => {
      const nIndex = args.indexOf('-n');
      const limit = nIndex === -1 ? 10 : Number(args[nIndex + 1] ?? 10);
      const file = args.find((a, i) => !a.startsWith('-') && i !== nIndex + 1);
      let content = stdin;
      if (file !== undefined) {
        const read = readFile(ctx.system, resolvePath(ctx.session.cwd, file), ctx.session.user);
        if (!read.ok) return failure(`head: ${read.error.message}`);
        content = read.value;
      }
      return output(content.split('\n').slice(0, limit).join('\n'));
    },
  },
  {
    name: 'tail',
    summary: 'affiche la fin',
    usage: 'tail [-n <lignes>] [fichier]',
    run: (args, ctx, stdin) => {
      const nIndex = args.indexOf('-n');
      const limit = nIndex === -1 ? 10 : Number(args[nIndex + 1] ?? 10);
      const file = args.find((a, i) => !a.startsWith('-') && i !== nIndex + 1);
      let content = stdin;
      if (file !== undefined) {
        const read = readFile(ctx.system, resolvePath(ctx.session.cwd, file), ctx.session.user);
        if (!read.ok) return failure(`tail: ${read.error.message}`);
        content = read.value;
      }
      return output(content.split('\n').slice(-limit).join('\n'));
    },
  },
  {
    name: 'wc',
    summary: 'compte lignes, mots et caracteres',
    usage: 'wc [-l] [fichier]',
    run: (args, ctx, stdin) => {
      const { flags, positional } = parseArgs(args);
      let content = stdin;
      if (positional[0] !== undefined) {
        const read = readFile(ctx.system, resolvePath(ctx.session.cwd, positional[0]), ctx.session.user);
        if (!read.ok) return failure(`wc: ${read.error.message}`);
        content = read.value;
      }
      const lines = content === '' ? 0 : content.split('\n').length;
      if (flags.has('l')) return output(String(lines));
      const words = content.split(/\s+/).filter(Boolean).length;
      return output(`${lines} ${words} ${content.length}`);
    },
  },
  {
    name: 'sort',
    summary: 'trie les lignes',
    usage: 'sort',
    run: (_args, _ctx, stdin) => output(stdin.split('\n').sort().join('\n')),
  },
  {
    name: 'env',
    summary: 'affiche les variables d environnement',
    usage: 'env',
    run: (_args, ctx) =>
      output(
        Object.entries(ctx.session.env)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
      ),
  },
  {
    name: 'export',
    summary: 'definit une variable d environnement',
    usage: 'export CLE=valeur',
    run: (args, ctx) => {
      const assignment = args[0];
      if (assignment === undefined || !assignment.includes('=')) {
        return failure('export: usage : export CLE=valeur', 2);
      }
      const [key, ...rest] = assignment.split('=');
      if (key === undefined) return failure('export: cle invalide', 2);
      ctx.session.env[key] = rest.join('=');
      return output('');
    },
  },
  {
    name: 'history',
    summary: 'affiche l historique de la session',
    usage: 'history',
    run: (_args, ctx) => output(ctx.session.history.map((h, i) => `${i + 1}  ${h}`).join('\n')),
  },
  {
    name: 'reboot',
    summary: 'redemarre la machine simulee',
    usage: 'reboot',
    run: (_args, ctx) => {
      const done = ctx.systems.reboot(ctx.session.user);
      return done ? output('redemarrage en cours...') : failure('reboot: operation non permise');
    },
  },
];
