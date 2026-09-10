/**
 * Captures d assurance qualite visuelle.
 *
 * Points de vue fixes et deterministes : c est ce qui permet de comparer deux
 * versions sans se raconter d histoires. Chaque entree correspond a un endroit
 * ou a un ecran que la refonte devait ameliorer.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.TSSR_TEST_URL ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? 'docs/audit/v0.4/qa';
await mkdir(OUT, { recursive: true });

const ZONES = [
  ['hall', 'Accueil'],
  ['open-space', 'Bureaux'],
  ['noc', 'Centre de commandement'],
  ['documentation', 'NEO Knowledge'],
  ['salle-reseau', 'Salle reseau'],
  ['datacenter', 'Datacenter'],
  ['training-lab', 'NEO Training Lab'],
  ['lab-builder', 'NEO Lab Builder'],
  ['espace-personnel', 'Espace personnel'],
];

const navigateur = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
const page = await contexte.newPage();

async function priseEnMain() {
  await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor({ timeout: 20000 });
  const dialogue = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
  if (await dialogue.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Passer' }).click();
    await dialogue.waitFor({ state: 'hidden' });
  }
}

async function ecran(nom, route, attente = 1200) {
  await page.goto(`${BASE}#/${route}`, { waitUntil: 'domcontentloaded' });
  await priseEnMain();
  await page.waitForTimeout(attente);
  await page.screenshot({ path: `${OUT}/${nom}.png`, fullPage: true });
  process.stdout.write(`${nom} ok\n`);
}

// --------------------------------------------------------------- interfaces
await ecran('ui-accueil', 'accueil');
await ecran('ui-parcours', 'parcours');
await ecran('ui-mission', 'mission');

// ------------------------------------------------------------------- lieux
await page.goto(`${BASE}#/campus`, { waitUntil: 'domcontentloaded' });
await priseEnMain();
await page.locator('.campus3d__hud').waitFor({ timeout: 40000 });
await page.waitForTimeout(5000);
// L aide du premier passage recouvrirait chaque capture de lieu.
await page
  .locator('.campus3d__tutoriel button')
  .click({ timeout: 5000 })
  .catch(() => undefined);
await page.waitForTimeout(400);
await page.locator('canvas').first().screenshot({ path: `${OUT}/lieu-couloir.png` });
process.stdout.write('lieu-couloir ok\n');

for (const [fichier, zone] of ZONES) {
  await page.getByRole('button', { name: new RegExp(`S y rendre dans la zone ${zone}$`) }).click();
  await page.waitForTimeout(2600);
  await page.locator('canvas').first().screenshot({ path: `${OUT}/lieu-${fichier}.png` });
  process.stdout.write(`lieu-${fichier} ok\n`);
}

// ------------------------------------------------- interaction et dialogue
async function chercher() {
  const invite = page.locator('.campus3d__invite');
  for (let pas = 0; pas < 7 && (await invite.count()) === 0; pas += 1) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(320);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(140);
  }
  for (let vue = 0; vue < 26 && (await invite.count()) === 0; vue += 1) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(150);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(130);
  }
  return (await invite.count()) > 0;
}

await page.getByRole('button', { name: /S y rendre dans la zone Accueil$/ }).click();
await page.waitForTimeout(2000);
if (await chercher()) {
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(900);
  const question = page.getByRole('dialog').first().getByRole('button').filter({ hasText: /\?$/ }).first();
  if ((await question.count()) > 0) {
    await question.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: `${OUT}/interaction-dialogue.png` });
  process.stdout.write('interaction-dialogue ok\n');
  await page.keyboard.press('Escape');
}

await page.getByRole('button', { name: /S y rendre dans la zone Bureaux$/ }).click();
await page.waitForTimeout(2000);
if (await chercher()) {
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: 'Demarrer le laboratoire libre' }).click().catch(() => undefined);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/interaction-poste.png` });
  process.stdout.write('interaction-poste ok\n');
  await page.keyboard.press('Escape');
}

// Panneau des commandes.
await page.getByRole('button', { name: '? Commandes' }).click().catch(() => undefined);
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/menu-commandes.png` });
process.stdout.write('menu-commandes ok\n');
await page.getByRole('button', { name: 'Fermer' }).click().catch(() => undefined);

// Exterieur, vu depuis le bout du couloir.
await page.getByRole('button', { name: /S y rendre dans la zone Accueil$/ }).click();
await page.waitForTimeout(2200);
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(900);
await page.keyboard.up('ArrowRight');
await page.waitForTimeout(700);
await page.locator('canvas').first().screenshot({ path: `${OUT}/lieu-exterieur.png` });
process.stdout.write('lieu-exterieur ok\n');

await navigateur.close();
