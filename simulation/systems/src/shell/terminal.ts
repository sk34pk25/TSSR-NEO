import { isPrivileged, writeFile } from '../fs.ts';
import { resolvePath, rootFor } from '../paths.ts';
import { BASH_COMMANDS } from './bash.ts';
import { POWERSHELL_COMMANDS } from './powershell.ts';
import {
  failure,
  output,
  parseLine,
  table,
  type CommandResult,
  type CommandSpec,
  type ShellContext,
  type ShellSessionState,
} from './core.ts';

export interface TerminalOptions {
  user?: string;
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * Terminal reellement interprete : chaque commande agit sur l etat simule.
 * Une commande non implementee le dit explicitement plutot que de simuler une reponse.
 */
export class Terminal {
  private readonly ctx: ShellContext;
  private readonly commands = new Map<string, CommandSpec>();
  private readonly specs: CommandSpec[];

  constructor(ctx: Omit<ShellContext, 'session'>, options: TerminalOptions = {}) {
    const os = ctx.system.os;
    this.specs = os === 'windows' ? POWERSHELL_COMMANDS : BASH_COMMANDS;
    const defaultUser = options.user ?? (os === 'windows' ? 'Administrator' : 'root');
    const session: ShellSessionState = {
      cwd: options.cwd ?? (os === 'windows' ? 'C:/Users/Administrator' : `/root`),
      user: defaultUser,
      env: {
        HOME: os === 'windows' ? 'C:/Users/Administrator' : '/root',
        USER: defaultUser,
        HOSTNAME: ctx.system.hostname,
        ...ctx.system.environment,
        ...options.env,
      },
      history: [],
    };
    if (ctx.system.files[session.cwd] === undefined) session.cwd = rootFor(os);
    this.ctx = { ...ctx, session };
    for (const spec of this.specs) {
      this.commands.set(spec.name.toLowerCase(), spec);
      for (const alias of spec.aliases ?? []) this.commands.set(alias.toLowerCase(), spec);
    }
  }

  get session(): ShellSessionState {
    return this.ctx.session;
  }

  /** Invite affichee, coherente avec le systeme simule. */
  prompt(): string {
    if (this.ctx.system.os === 'windows') {
      return `PS ${this.ctx.session.cwd.replace(/\//g, '\\')}> `;
    }
    const suffix = this.ctx.session.user === 'root' ? '#' : '$';
    return `${this.ctx.session.user}@${this.ctx.system.hostname}:${this.ctx.session.cwd}${suffix} `;
  }

  /** Liste exacte des commandes disponibles : elle ne promet rien qui n existe pas. */
  helpText(filter?: string): string {
    const unique = new Map<string, CommandSpec>();
    for (const spec of this.specs) unique.set(spec.name, spec);
    const entries = [...unique.values()].filter(
      (s) => filter === undefined || s.name.toLowerCase().includes(filter.toLowerCase()),
    );
    if (filter !== undefined && entries.length === 1) {
      const spec = entries[0] as CommandSpec;
      return `${spec.name} - ${spec.summary}\nUsage : ${spec.usage}${spec.aliases ? `\nAlias : ${spec.aliases.join(', ')}` : ''}`;
    }
    return table([
      ['COMMANDE', 'DESCRIPTION'],
      ...entries.sort((a, b) => a.name.localeCompare(b.name)).map((s) => [s.name, s.summary]),
    ]);
  }

  availableCommands(): string[] {
    return [...new Set(this.specs.map((s) => s.name))].sort();
  }

  execute(line: string): CommandResult {
    const trimmed = line.trim();
    if (trimmed === '') return output('');
    this.ctx.session.history.push(trimmed);

    this.ctx.bus?.emit({
      category: 'command',
      type: 'terminal.command',
      payload: {
        systemId: this.ctx.system.id,
        hostname: this.ctx.system.hostname,
        command: trimmed,
      },
    });

    if (this.ctx.system.powerState !== 'running') {
      return failure(
        `${this.ctx.system.hostname} ne repond pas : la machine est ${this.ctx.system.powerState}.`,
      );
    }

    const lower = trimmed.toLowerCase();
    if (
      lower === 'help' ||
      lower === 'aide' ||
      lower.startsWith('help ') ||
      lower.startsWith('aide ')
    ) {
      const parts = trimmed.split(/\s+/);
      return output(this.helpText(parts[1]));
    }
    if (lower === 'clear' || lower === 'cls' || lower === 'clear-host') {
      return { stdout: '\u000c', stderr: '', exitCode: 0 };
    }

    const segments = parseLine(trimmed);
    let stdin = '';
    let last: CommandResult = output('');

    for (const segment of segments) {
      let tokens = segment.tokens;
      if (tokens.length === 0) continue;

      // Elevation ponctuelle : sudo n execute que la commande qui suit.
      let elevated = false;
      const previousUser = this.ctx.session.user;
      if ((tokens[0] === 'sudo' || tokens[0] === 'runas') && tokens.length > 1) {
        if (!this.canElevate(previousUser)) {
          return failure(
            `${previousUser} n est pas autorise a utiliser sudo sur ${this.ctx.system.hostname}.`,
          );
        }
        elevated = true;
        this.ctx.session.user = this.ctx.system.os === 'windows' ? 'Administrator' : 'root';
        tokens = tokens.slice(1);
      }

      const name = (tokens[0] as string).toLowerCase();
      const spec = this.commands.get(name);
      if (!spec) {
        if (elevated) this.ctx.session.user = previousUser;
        return failure(this.unknownMessage(tokens[0] as string));
      }

      try {
        last = spec.run(tokens.slice(1), this.ctx, stdin);
      } catch (error) {
        last = failure(`${spec.name} : erreur interne de simulation (${String(error)})`, 70);
      } finally {
        if (elevated) this.ctx.session.user = previousUser;
      }

      if (segment.redirect) {
        const target = resolvePath(this.ctx.session.cwd, segment.redirect.path);
        // Comme un vrai shell, une redirection termine toujours la ligne ecrite.
        const payload =
          last.stdout === '' || last.stdout.endsWith('\n') ? last.stdout : `${last.stdout}\n`;
        const written = writeFile(this.ctx.system, target, payload, this.ctx.session.user, {
          append: segment.redirect.append,
          simTime: this.ctx.bus?.getSimTime() ?? 0,
        });
        if (!written.ok) return failure(`redirection : ${written.error.message}`);
        stdin = '';
        last = { stdout: '', stderr: last.stderr, exitCode: last.exitCode };
      } else {
        stdin = last.stdout;
      }
    }

    return last;
  }

  private canElevate(user: string): boolean {
    if (isPrivileged(this.ctx.system, user)) return true;
    const account = this.ctx.system.users.find((u) => u.name === user);
    const groups = new Set([
      ...(account?.groups ?? []),
      ...this.ctx.system.groups.filter((g) => g.members.includes(user)).map((g) => g.name),
    ]);
    return groups.has('sudo') || groups.has('wheel') || groups.has('Administrators');
  }

  private unknownMessage(name: string): string {
    const candidates = this.availableCommands()
      .filter((c) => c.toLowerCase().startsWith(name.slice(0, 2).toLowerCase()))
      .slice(0, 4);
    const suggestion = candidates.length > 0 ? ` Peut-etre : ${candidates.join(', ')}.` : '';
    return `${name} : commande non disponible dans cette simulation. Tapez "aide" pour la liste exacte des commandes implementees.${suggestion}`;
  }
}
