#!/usr/bin/env node
/**
 * Verification des frontieres architecturales de TSSR NEO.
 *
 * Regles appliquees :
 *  1. Un paquet ne peut dependre que de sa couche ou d une couche inferieure.
 *  2. Aucune dependance circulaire entre paquets.
 *  3. Un module de cours ne depend jamais d un autre module de cours.
 *  4. Aucun paquet du Core ou de la simulation ne depend d une application.
 *  5. Aucun import relatif ne traverse la frontiere d un paquet.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Couches, de la plus basse a la plus haute. */
const LAYERS = [
  { level: 0, name: 'contrats', match: (p) => p === 'core/contracts' || p === 'core/events' },
  { level: 1, name: 'simulation', match: (p) => p.startsWith('simulation/') },
  { level: 2, name: 'core', match: (p) => p.startsWith('core/') },
  { level: 3, name: 'savoir', match: (p) => p === 'nova' || p === 'knowledge' },
  { level: 4, name: 'modules', match: (p) => p.startsWith('modules/') },
  { level: 5, name: 'applications', match: (p) => p.startsWith('apps/') },
];

const PACKAGE_ROOTS = ['core', 'simulation', 'modules', 'apps'];
const SINGLE_PACKAGES = ['nova', 'knowledge'];

function listPackages() {
  const packages = new Map();
  const register = (dir) => {
    const packageJson = join(root, dir, 'package.json');
    try {
      const manifest = JSON.parse(readFileSync(packageJson, 'utf8'));
      packages.set(manifest.name, dir);
    } catch {
      // Repertoire sans paquet : ignore.
    }
  };
  for (const group of PACKAGE_ROOTS) {
    let entries = [];
    try {
      entries = readdirSync(join(root, group));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const dir = `${group}/${entry}`;
      if (statSync(join(root, dir)).isDirectory()) register(dir);
    }
  }
  for (const single of SINGLE_PACKAGES) register(single);
  return packages;
}

function layerOf(dir) {
  const layer = LAYERS.find((candidate) => candidate.match(dir));
  return layer ?? { level: 99, name: 'inconnue' };
}

function walk(dir, files = []) {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

const IMPORT_PATTERN = /(?:from|import)\s+['"]([^'"]+)['"]/g;

function importsOf(file) {
  const source = readFileSync(file, 'utf8');
  const found = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1];
    if (specifier) found.push(specifier);
  }
  return found;
}

const packages = listPackages();
const byDir = new Map([...packages.entries()].map(([name, dir]) => [dir, name]));
const violations = [];
const graph = new Map();

for (const [name, dir] of packages) {
  graph.set(name, new Set());
  const layer = layerOf(dir);
  for (const file of walk(join(root, dir))) {
    const shown = relative(root, file);
    for (const specifier of importsOf(file)) {
      if (specifier.startsWith('.')) {
        // Les fichiers de configuration de construction referencent volontairement
        // la configuration partagee du depot : ils ne font pas partie du code applicatif.
        if (/\.config\.(ts|mts|js|mjs)$/.test(shown)) continue;
        // Regle 5 : un import relatif ne doit jamais sortir du paquet.
        const target = resolve(dirname(file), specifier);
        const targetRelative = relative(root, target);
        if (!targetRelative.startsWith(dir)) {
          violations.push(
            `${shown} : import relatif "${specifier}" sort du paquet ${name}. Utilisez l API publique du paquet cible.`,
          );
        }
        continue;
      }
      if (!specifier.startsWith('@tssr/')) continue;
      // Un sous-chemin (@tssr/x/y) appartient au paquet @tssr/x.
      const parts = specifier.split('/');
      const packageName = parts.slice(0, 2).join('/');
      const targetDir = packages.get(packageName);
      if (targetDir === undefined) {
        violations.push(`${shown} : paquet interne inconnu "${specifier}".`);
        continue;
      }
      graph.get(name)?.add(packageName);
      const targetLayer = layerOf(targetDir);

      // Regle 1 : pas de dependance vers une couche superieure.
      if (targetLayer.level > layer.level) {
        violations.push(
          `${shown} : ${name} (couche ${layer.name}) depend de ${specifier} (couche ${targetLayer.name}). Les dependances vont toujours vers le bas.`,
        );
      }
      // Regle 3 : isolation des modules de cours.
      if (dir.startsWith('modules/') && targetDir.startsWith('modules/') && targetDir !== dir) {
        violations.push(
          `${shown} : le module ${name} depend du module ${specifier}. Les modules doivent rester autonomes.`,
        );
      }
      // Regle 4 : rien ne depend d une application.
      if (targetDir.startsWith('apps/') && !dir.startsWith('apps/')) {
        violations.push(`${shown} : ${name} depend de l application ${specifier}.`);
      }
    }
  }
}

// Regle 2 : detection des cycles entre paquets.
const state = new Map();
const stack = [];
const cycles = [];
function visit(node) {
  const current = state.get(node);
  if (current === 'done') return;
  if (current === 'visiting') {
    cycles.push([...stack.slice(stack.indexOf(node)), node].join(' -> '));
    return;
  }
  state.set(node, 'visiting');
  stack.push(node);
  for (const next of graph.get(node) ?? []) visit(next);
  stack.pop();
  state.set(node, 'done');
}
for (const node of graph.keys()) visit(node);
for (const cycle of cycles) violations.push(`dependance circulaire : ${cycle}`);

if (violations.length > 0) {
  console.error(`\nFrontieres architecturales violees (${violations.length}) :\n`);
  for (const violation of violations) console.error(`  - ${violation}`);
  console.error('');
  process.exit(1);
}

console.log(
  `Architecture conforme : ${packages.size} paquets, ${byDir.size} repertoires, aucun cycle.`,
);
for (const layer of LAYERS) {
  const members = [...packages.entries()]
    .filter(([, dir]) => layer.match(dir))
    .map(([name]) => name);
  if (members.length > 0)
    console.log(`  couche ${layer.level} ${layer.name} : ${members.join(', ')}`);
}
