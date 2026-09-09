/**
 * Normalisation des chemins.
 * Un seul modele interne (separateur "/") pour Linux et Windows ;
 * l affichage restitue la forme attendue par chaque systeme.
 */

export function isWindowsPath(path: string): boolean {
  return /^[a-z]:/i.test(path) || path.includes('\\');
}

export function toInternal(path: string): string {
  return path.replace(/\\/g, '/');
}

export function toDisplay(path: string, os: 'linux' | 'windows'): string {
  return os === 'windows' ? path.replace(/\//g, '\\') : path;
}

/** Resout un chemin relatif ou absolu et supprime "." et "..". */
export function resolvePath(cwd: string, input: string): string {
  const raw = toInternal(input.trim());
  const base = toInternal(cwd);
  let combined: string;
  if (/^[a-z]:\//i.test(raw)) {
    combined = raw;
  } else if (raw.startsWith('/')) {
    const drive = /^([a-z]:)/i.exec(base);
    combined = drive ? `${drive[1]}${raw}` : raw;
  } else if (raw === '~') {
    combined = base;
  } else {
    combined = `${base.replace(/\/$/, '')}/${raw}`;
  }

  const driveMatch = /^([a-z]:)/i.exec(combined);
  const drive = driveMatch ? (driveMatch[1] as string).toUpperCase() : '';
  const body = drive ? combined.slice(drive.length) : combined;

  const parts: string[] = [];
  for (const segment of body.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  const joined = `/${parts.join('/')}`;
  return drive ? `${drive}${joined}` : joined;
}

export function parentOf(path: string): string {
  const resolved = resolvePath('/', path);
  const driveMatch = /^([a-z]:)/i.exec(resolved);
  const drive = driveMatch ? (driveMatch[1] as string) : '';
  const body = drive ? resolved.slice(drive.length) : resolved;
  const parts = body.split('/').filter(Boolean);
  parts.pop();
  return `${drive}/${parts.join('/')}`.replace(/\/$/, '') || `${drive}/`;
}

export function basename(path: string): string {
  const parts = toInternal(path).split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '/';
}

export function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/$/, '')}/${name}`;
}

/** Racine par defaut selon le systeme. */
export function rootFor(os: 'linux' | 'windows'): string {
  return os === 'windows' ? 'C:/' : '/';
}
