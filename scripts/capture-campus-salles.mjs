/**
 * Vue d inspection de chaque salle.
 *
 * Ce que voit un visiteur qui s arrete devant une porte : c est la que se juge
 * l amenagement, pas depuis le couloir.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.TSSR_TEST_URL ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? 'docs/audit/captures/campus-salles';
await mkdir(OUT, { recursive: true });


/**
 * La prise en main s affiche au premier passage, une fois l application prete.
 * Cliquer avant qu elle soit rendue la laissait apparaitre en pleine capture.
 */
async function passerLaPriseEnMain(page) {
  await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor({ timeout: 20000 });
  const dialogue = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
  if (await dialogue.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Passer' }).click();
    await dialogue.waitFor({ state: 'hidden' });
  }
}

const navigateur = await chromium.launch();
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
const page = await contexte.newPage();

await page.goto(`${BASE}#/campus`, { waitUntil: 'domcontentloaded' });
await passerLaPriseEnMain(page);
await page.locator('.campus3d__hud').waitFor({ timeout: 30000 });
await page.waitForTimeout(4000);

const zones = await page.locator('.campus3d__zone strong').allTextContents();
for (const [index, nom] of zones.entries()) {
  await page.locator('.campus3d__zone').nth(index).focus();
  await page.waitForTimeout(1400);
  const fichier = nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  await page.locator('canvas').first().screenshot({ path: `${OUT}/${index + 1}-${fichier}.png` });
  process.stdout.write(`${fichier} ok\n`);
}
await navigateur.close();
