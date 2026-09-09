import type { FsNode, Permissions, SystemState } from '@tssr/contracts';
import { basename, joinPath, parentOf, resolvePath } from './paths.ts';

export type Access = 'read' | 'write' | 'execute';

export interface FsError {
  code: 'ENOENT' | 'EEXIST' | 'ENOTDIR' | 'EISDIR' | 'EACCES' | 'ENOTEMPTY';
  message: string;
}

export type FsResult<T> = { ok: true; value: T } | { ok: false; error: FsError };

function ok<T>(value: T): FsResult<T> {
  return { ok: true, value };
}
function err<T>(code: FsError['code'], message: string): FsResult<T> {
  return { ok: false, error: { code, message } };
}

export function getNode(system: SystemState, path: string): FsNode | undefined {
  return system.files[resolvePath('/', path)];
}

export function exists(system: SystemState, path: string): boolean {
  return getNode(system, path) !== undefined;
}

export function isDirectory(system: SystemState, path: string): boolean {
  return getNode(system, path)?.kind === 'dir';
}

/** Entrees directes d un repertoire (pas de recursion). */
export function listDirectory(system: SystemState, path: string): FsResult<string[]> {
  const target = resolvePath('/', path);
  const node = system.files[target];
  if (!node) return err('ENOENT', `${path} : aucun fichier ou dossier de ce type`);
  if (node.kind !== 'dir') return err('ENOTDIR', `${path} : n est pas un repertoire`);
  const prefix = target === '/' ? '/' : `${target}/`;
  const names = new Set<string>();
  for (const key of Object.keys(system.files)) {
    if (key === target || !key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const head = rest.split('/')[0];
    if (head) names.add(head);
  }
  return ok([...names].sort());
}

function groupsOf(system: SystemState, user: string): string[] {
  const account = system.users.find((u) => u.name === user);
  const fromUser = account?.groups ?? [];
  const fromGroups = system.groups.filter((g) => g.members.includes(user)).map((g) => g.name);
  return [...new Set([...fromUser, ...fromGroups])];
}

export function isPrivileged(system: SystemState, user: string): boolean {
  if (system.os === 'linux') return user === 'root';
  const groups = groupsOf(system, user);
  return user === 'Administrator' || groups.includes('Administrators') || groups.includes('Administrateurs');
}

function posixAllows(permissions: Permissions, user: string, groups: string[], access: Access): boolean {
  const mode = permissions.mode.padStart(4, '0');
  const digits = mode.slice(-3).split('').map((d) => parseInt(d, 10));
  const bit = access === 'read' ? 4 : access === 'write' ? 2 : 1;
  const [ownerBits = 0, groupBits = 0, otherBits = 0] = digits;
  if (permissions.owner === user) return (ownerBits & bit) !== 0;
  if (groups.includes(permissions.group)) return (groupBits & bit) !== 0;
  return (otherBits & bit) !== 0;
}

function aclAllows(permissions: Permissions, user: string, groups: string[], access: Access): boolean {
  const principals = new Set([user, ...groups, 'Everyone', 'Tout le monde']);
  const required: Record<Access, string[]> = {
    read: ['read', 'modify', 'full'],
    write: ['write', 'modify', 'full'],
    execute: ['execute', 'modify', 'full'],
  };
  const wanted = required[access];
  // Un refus explicite l emporte toujours : regle fondamentale des ACL Windows.
  for (const ace of permissions.acl) {
    if (ace.type !== 'deny' || !principals.has(ace.principal)) continue;
    if (ace.rights.some((r) => wanted.includes(r))) return false;
  }
  for (const ace of permissions.acl) {
    if (ace.type !== 'allow' || !principals.has(ace.principal)) continue;
    if (ace.rights.some((r) => wanted.includes(r))) return true;
  }
  return false;
}

/** Controle d acces reel : POSIX cote Linux, ACL avec priorite au refus cote Windows. */
export function canAccess(system: SystemState, path: string, user: string, access: Access): boolean {
  const node = getNode(system, path);
  if (!node) return false;
  if (isPrivileged(system, user)) return true;
  const groups = groupsOf(system, user);
  if (system.os === 'windows' && node.permissions.acl.length > 0) {
    return aclAllows(node.permissions, user, groups, access);
  }
  return posixAllows(node.permissions, user, groups, access);
}

export function readFile(system: SystemState, path: string, user: string): FsResult<string> {
  const target = resolvePath('/', path);
  const node = system.files[target];
  if (!node) return err('ENOENT', `${path} : aucun fichier ou dossier de ce type`);
  if (node.kind === 'dir') return err('EISDIR', `${path} : est un repertoire`);
  if (!canAccess(system, target, user, 'read')) return err('EACCES', `${path} : permission refusee`);
  return ok(node.content);
}

export function writeFile(
  system: SystemState,
  path: string,
  content: string,
  user: string,
  options: { append?: boolean; simTime?: number } = {},
): FsResult<void> {
  const target = resolvePath('/', path);
  const parent = parentOf(target);
  const parentNode = system.files[parent];
  if (!parentNode) return err('ENOENT', `${parent} : repertoire inexistant`);
  if (parentNode.kind !== 'dir') return err('ENOTDIR', `${parent} : n est pas un repertoire`);

  const existing = system.files[target];
  if (existing) {
    if (existing.kind === 'dir') return err('EISDIR', `${path} : est un repertoire`);
    if (!canAccess(system, target, user, 'write')) return err('EACCES', `${path} : permission refusee`);
    const next = options.append === true ? existing.content + content : content;
    system.files[target] = {
      ...existing,
      content: next,
      sizeBytes: next.length,
      modifiedAt: options.simTime ?? existing.modifiedAt,
    };
    return ok(undefined);
  }

  if (!canAccess(system, parent, user, 'write')) return err('EACCES', `${parent} : permission refusee`);
  system.files[target] = {
    kind: 'file',
    content,
    target: undefined as unknown as string | undefined,
    permissions: {
      owner: user,
      group: system.users.find((u) => u.name === user)?.groups[0] ?? user,
      mode: system.os === 'linux' ? '0644' : '0644',
      acl: [],
    },
    sizeBytes: content.length,
    modifiedAt: options.simTime ?? 0,
  } as FsNode;
  return ok(undefined);
}

export function makeDirectory(
  system: SystemState,
  path: string,
  user: string,
  options: { recursive?: boolean; simTime?: number } = {},
): FsResult<void> {
  const target = resolvePath('/', path);
  if (system.files[target]) return err('EEXIST', `${path} : le fichier existe`);
  const parent = parentOf(target);
  if (!system.files[parent]) {
    if (options.recursive !== true) return err('ENOENT', `${parent} : repertoire inexistant`);
    const created = makeDirectory(system, parent, user, options);
    if (!created.ok) return created;
  }
  if (!canAccess(system, parent, user, 'write')) return err('EACCES', `${parent} : permission refusee`);
  system.files[target] = {
    kind: 'dir',
    content: '',
    permissions: {
      owner: user,
      group: system.users.find((u) => u.name === user)?.groups[0] ?? user,
      mode: '0755',
      acl: [],
    },
    sizeBytes: 0,
    modifiedAt: options.simTime ?? 0,
  } as FsNode;
  return ok(undefined);
}

export function removePath(
  system: SystemState,
  path: string,
  user: string,
  options: { recursive?: boolean } = {},
): FsResult<number> {
  const target = resolvePath('/', path);
  const node = system.files[target];
  if (!node) return err('ENOENT', `${path} : aucun fichier ou dossier de ce type`);
  if (!canAccess(system, parentOf(target), user, 'write')) {
    return err('EACCES', `${path} : permission refusee`);
  }
  if (node.kind === 'dir') {
    const children = Object.keys(system.files).filter((k) => k.startsWith(`${target}/`));
    if (children.length > 0 && options.recursive !== true) {
      return err('ENOTEMPTY', `${path} : le repertoire n est pas vide`);
    }
    for (const child of children) delete system.files[child];
    delete system.files[target];
    return ok(children.length + 1);
  }
  delete system.files[target];
  return ok(1);
}

export function copyPath(
  system: SystemState,
  from: string,
  to: string,
  user: string,
  options: { recursive?: boolean; simTime?: number } = {},
): FsResult<number> {
  const source = resolvePath('/', from);
  const node = system.files[source];
  if (!node) return err('ENOENT', `${from} : aucun fichier ou dossier de ce type`);
  let destination = resolvePath('/', to);
  if (system.files[destination]?.kind === 'dir') {
    destination = joinPath(destination, basename(source));
  }
  if (node.kind === 'file') {
    const content = readFile(system, source, user);
    if (!content.ok) return err(content.error.code, content.error.message);
    const written = writeFile(system, destination, content.value, user, options);
    if (!written.ok) return err(written.error.code, written.error.message);
    return ok(1);
  }
  if (options.recursive !== true) return err('EISDIR', `${from} : est un repertoire`);
  const created = makeDirectory(system, destination, user, { recursive: true, ...options });
  if (!created.ok) return created;
  let count = 1;
  for (const key of Object.keys(system.files).filter((k) => k.startsWith(`${source}/`))) {
    const child = system.files[key];
    if (!child) continue;
    const relative = key.slice(source.length + 1);
    const targetKey = joinPath(destination, relative);
    system.files[targetKey] = { ...child, permissions: { ...child.permissions, acl: [...child.permissions.acl] } };
    count += 1;
  }
  return ok(count);
}

export function movePath(system: SystemState, from: string, to: string, user: string): FsResult<void> {
  const copied = copyPath(system, from, to, user, { recursive: true });
  if (!copied.ok) return err(copied.error.code, copied.error.message);
  const removed = removePath(system, from, user, { recursive: true });
  if (!removed.ok) return err(removed.error.code, removed.error.message);
  return ok(undefined);
}

export function chmod(system: SystemState, path: string, mode: string, user: string): FsResult<void> {
  const target = resolvePath('/', path);
  const node = system.files[target];
  if (!node) return err('ENOENT', `${path} : aucun fichier ou dossier de ce type`);
  if (!isPrivileged(system, user) && node.permissions.owner !== user) {
    return err('EACCES', `${path} : seul le proprietaire peut changer les droits`);
  }
  if (!/^[0-7]{3,4}$/.test(mode)) return err('EACCES', `${mode} : mode octal invalide`);
  node.permissions.mode = mode;
  return ok(undefined);
}

export function chown(
  system: SystemState,
  path: string,
  owner: string,
  group: string | undefined,
  user: string,
): FsResult<void> {
  const target = resolvePath('/', path);
  const node = system.files[target];
  if (!node) return err('ENOENT', `${path} : aucun fichier ou dossier de ce type`);
  if (!isPrivileged(system, user)) return err('EACCES', 'operation reservee a l administrateur');
  node.permissions.owner = owner;
  if (group !== undefined) node.permissions.group = group;
  return ok(undefined);
}

/** Representation "ls -l" du mode, exacte pour la lecture pedagogique. */
export function formatMode(node: FsNode): string {
  const kind = node.kind === 'dir' ? 'd' : node.kind === 'symlink' ? 'l' : '-';
  const digits = node.permissions.mode.padStart(4, '0').slice(-3).split('');
  const rwx = digits
    .map((d) => {
      const value = parseInt(d, 10);
      return `${value & 4 ? 'r' : '-'}${value & 2 ? 'w' : '-'}${value & 1 ? 'x' : '-'}`;
    })
    .join('');
  return kind + rwx;
}
