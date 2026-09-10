/**
 * Sonde d audit produit.
 *
 * Parcourt toutes les destinations atteignables et releve, pour chacune, ce
 * qu un nouvel utilisateur y trouve : comment il y arrive, ce qu on lui montre,
 * et si l ecran a quelque chose a dire ou seulement son propre vide.
 */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

const BASE = process.env.TSSR_TEST_URL ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? 'docs/audit/v0.4';

const ROUTES = [
  'accueil',
  'a-propos',
  'apprendre',
  'apprendre/cours',
  'apprendre/fiches',
  'apprendre/reviser',
  'apprendre/progression',
  'campus',
  'mission',
  'laboratoire',
  'connaissances',
  'revision',
  'progression',
  'supervision',
  'tickets',
  'formateur',
  'reglages',
  'diagnostics',
];

/** Formulations qui signalent un ecran sans contenu utile. */
const VIDE = /Aucun|Aucune|Rien a|n est charge|pas encore|indisponible/i;

await mkdir(`${OUT}/captures`, { recursive: true });
const navigateur = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
const page = await contexte.newPage();

const erreurs = [];
page.on('pageerror', (e) => erreurs.push(`${page.url()} :: ${String(e).slice(0, 200)}`));
page.on('console', (m) => {
  if (m.type() === 'error') erreurs.push(`${page.url()} :: ${m.text().slice(0, 200)}`);
});

async function passerLaPriseEnMain() {
  const dialogue = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
  if (await dialogue.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Passer' }).click();
    await dialogue.waitFor({ state: 'hidden' });
  }
}

const releve = [];
for (const route of ROUTES) {
  await page.goto(`${BASE}#/${route}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor({ timeout: 20000 });
  await passerLaPriseEnMain();
  await page.waitForTimeout(route.startsWith('campus') ? 4500 : 900);

  const mesure = await page.evaluate((motifVide) => {
    const vide = new RegExp(motifVide, 'i');
    const contenu = document.getElementById('contenu');
    const texte = contenu?.innerText ?? '';
    const titres = [...(contenu?.querySelectorAll('h1, h2') ?? [])].map((n) =>
      (n.textContent ?? '').trim(),
    );
    return {
      titre: (contenu?.querySelector('h1')?.textContent ?? '').trim(),
      titres,
      cartes: contenu?.querySelectorAll('.neo-card, .course-card, .neo-panel').length ?? 0,
      onglets: contenu?.querySelectorAll('[role="tab"]').length ?? 0,
      boutons: contenu?.querySelectorAll('button, a.neo-btn').length ?? 0,
      champs: contenu?.querySelectorAll('input, select, textarea').length ?? 0,
      tableaux: contenu?.querySelectorAll('table').length ?? 0,
      motsTexte: texte.split(/\s+/).filter(Boolean).length,
      paraitVide: vide.test(texte) && texte.split(/\s+/).length < 120,
      stylesEnLigne: contenu?.querySelectorAll('[style]').length ?? 0,
    };
  }, VIDE.source);

  const liensNav = await page
    .getByRole('navigation', { name: 'Navigation principale' })
    .getByRole('link')
    .allTextContents();
  const racine = route.split('/')[0];
  mesure.route = route;
  mesure.dansLaBarre = liensNav.some((l) => l.toLowerCase().includes(racine.slice(0, 6)));
  releve.push(mesure);

  await page.screenshot({
    path: `${OUT}/captures/${route.replace(/\//g, '-')}.png`,
    fullPage: true,
  });
  process.stdout.write(
    `${route.padEnd(24)} titre=${(mesure.titre || '(aucun)').slice(0, 30).padEnd(31)} cartes=${String(mesure.cartes).padStart(2)} styles=${String(mesure.stylesEnLigne).padStart(3)} vide=${mesure.paraitVide ? 'OUI' : 'non'} barre=${mesure.dansLaBarre ? 'oui' : 'NON'}\n`,
  );
}

await writeFile(`${OUT}/releve.json`, JSON.stringify({ releve, erreurs }, null, 2));
console.log('\nerreurs de console :', erreurs.length);
for (const e of erreurs.slice(0, 10)) console.log('  ', e);
await navigateur.close();
