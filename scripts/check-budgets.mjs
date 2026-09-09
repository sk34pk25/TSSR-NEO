#!/usr/bin/env node
/**
 * Controle des budgets de performance sur la construction de production.
 * Un depassement fait echouer la publication : le Core doit rester leger.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = join(root, 'apps/web/dist');

/** Budgets exprimes en kilo-octets compresses (gzip). */
const BUDGETS = {
  initialJsKb: 320,
  initialCssKb: 60,
  firstLoadKb: 1200,
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
const js = shipped.filter((file) => file.endsWith('.js'));
const css = shipped.filter((file) => file.endsWith('.css'));

const jsKb = js.reduce((sum, file) => sum + gzipKb(file), 0);
const cssKb = css.reduce((sum, file) => sum + gzipKb(file), 0);
const totalKb = shipped.reduce((sum, file) => sum + gzipKb(file), 0);

const rows = [
  { label: 'JavaScript (gzip)', value: jsKb, budget: BUDGETS.initialJsKb },
  { label: 'CSS (gzip)', value: cssKb, budget: BUDGETS.initialCssKb },
  { label: 'Premiere visite, total (gzip)', value: totalKb, budget: BUDGETS.firstLoadKb },
];

let failed = false;
console.log('\nBudgets de performance\n');
for (const row of rows) {
  const ratio = (row.value / row.budget) * 100;
  const status = row.value > row.budget ? 'DEPASSE' : 'ok';
  if (row.value > row.budget) failed = true;
  console.log(
    `  ${row.label.padEnd(32)} ${row.value.toFixed(1).padStart(8)} Ko / ${String(row.budget).padStart(5)} Ko  (${ratio.toFixed(0)} %)  ${status}`,
  );
}
console.log('');

if (failed) {
  console.error('Budget de performance depasse : la publication est bloquee.');
  process.exit(1);
}
