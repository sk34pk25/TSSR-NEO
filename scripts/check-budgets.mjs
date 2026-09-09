#!/usr/bin/env node
/**
 * Controle des budgets de performance sur la construction de production.
 *
 * On distingue le **chargement initial** (ce que toute visite telecharge) des
 * **blocs paresseux** (moteur graphique, campus), qui ne sont recuperes que
 * lorsque l utilisateur ouvre l ecran concerne. Confondre les deux masquerait
 * une regression sur le chemin critique.
 *
 * Un depassement fait echouer la publication.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'apps/web/dist');

/** Budgets en kilo-octets compresses (gzip). */
const BUDGETS = {
  initialJsKb: 320,
  initialCssKb: 60,
  initialTotalKb: 400,
  /** Bloc du moteur 3D, telecharge uniquement a l ouverture du campus. */
  lazy3dKb: 200,
  /** Tout ce que le site peut servir, blocs paresseux compris. */
  shippedTotalKb: 1200,
};

function gzipKb(file) {
  return gzipSync(readFileSync(file)).length / 1024;
}

function collect(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else files.push(full);
    }
  };
  walk(dir);
  return files;
}

let files;
try {
  files = collect(distDir);
} catch {
  console.error(`Aucune construction trouvee dans ${distDir}. Lancez "npm run build" d abord.`);
  process.exit(1);
}

// Les fichiers de source map ne sont jamais telecharges par les utilisateurs.
const shipped = files.filter((file) => !file.endsWith('.map'));

// Le chargement initial est defini par ce que la page d entree reference.
const referenced = new Set();
try {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (match[1])
      referenced.add(
        match[1]
          .replace(/^\.?\//, '')
          .split('/')
          .pop(),
      );
  }
} catch {
  console.error('index.html introuvable : impossible de distinguer le chargement initial.');
  process.exit(1);
}

const rel = (file) => relative(distDir, file).split(sep).join('/');
const isInitial = (file) => {
  const name = rel(file).split('/').pop();
  return rel(file) === 'index.html' || referenced.has(name);
};

const initialJs = shipped.filter((f) => isInitial(f) && f.endsWith('.js'));
const initialCss = shipped.filter((f) => isInitial(f) && f.endsWith('.css'));
const initial = shipped.filter(isInitial);
const lazy3d = shipped.filter((f) => rel(f).includes('moteur-3d'));

const sum = (list) => list.reduce((total, file) => total + gzipKb(file), 0);

const rows = [
  { label: 'JavaScript initial', value: sum(initialJs), budget: BUDGETS.initialJsKb },
  { label: 'CSS initial', value: sum(initialCss), budget: BUDGETS.initialCssKb },
  { label: 'Chargement initial, total', value: sum(initial), budget: BUDGETS.initialTotalKb },
  { label: 'Moteur 3D (paresseux)', value: sum(lazy3d), budget: BUDGETS.lazy3dKb },
  { label: 'Tout le contenu servi', value: sum(shipped), budget: BUDGETS.shippedTotalKb },
];

let failed = false;
console.log('\nBudgets de performance (gzip)\n');
for (const row of rows) {
  const ratio = (row.value / row.budget) * 100;
  const status = row.value > row.budget ? 'DEPASSE' : 'ok';
  if (row.value > row.budget) failed = true;
  console.log(
    `  ${row.label.padEnd(30)} ${row.value.toFixed(1).padStart(8)} Ko / ${String(row.budget).padStart(5)} Ko  (${ratio.toFixed(0)} %)  ${status}`,
  );
}

console.log(
  `\n  Blocs paresseux : ${
    shipped
      .filter((f) => !isInitial(f))
      .map(rel)
      .join(', ') || 'aucun'
  }\n`,
);

if (failed) {
  console.error('Budget de performance depasse : la publication est bloquee.');
  process.exit(1);
}
