/**
 * Capture de reference pour l audit V0.3.
 *
 * Ce script n est pas un test : il produit les artefacts visuels qui servent de
 * base de comparaison avant / apres la refonte de l experience.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.TSSR_TEST_URL ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? 'docs/audit/captures';

const ECRANS = [
  'accueil',
  'campus',
  'mission',
  'laboratoire',
  'connaissances',
  'revision',
  'progression',
  'reglages',
  'diagnostics',
];

/** La prise en main recouvre la page au premier passage : on la ferme d abord. */
async function passerLaPriseEnMain(page) {
  const dialogue = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
  if (await dialogue.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Passer' }).click();
    await dialogue.waitFor({ state: 'hidden' });
  }
}

async function attendre(page, route) {
  await page.goto(`${BASE}#/${route}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor({ timeout: 20000 });
  await passerLaPriseEnMain(page);
  if (route === 'campus') {
    await page
      .locator('.campus3d__hud, .campus3d__veil')
      .first()
      .waitFor({ state: 'visible', timeout: 30000 })
      .catch(() => undefined);
    await page.waitForTimeout(4000);
  }
  await page.waitForTimeout(800);
}

const CIBLES = [
  { nom: 'bureau', viewport: { width: 1440, height: 900 } },
  { nom: 'mobile', viewport: { width: 390, height: 844 } },
];

const navigateur = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});
for (const cible of CIBLES) {
  await mkdir(`${OUT}/${cible.nom}`, { recursive: true });
  const contexte = await navigateur.newContext({
    viewport: cible.viewport,
    deviceScaleFactor: 1,
  });
  const page = await contexte.newPage();
  for (const route of ECRANS) {
    try {
      await attendre(page, route);
      await page.screenshot({ path: `${OUT}/${cible.nom}/${route}.png`, fullPage: true });
      process.stdout.write(`${cible.nom}/${route} ok\n`);
    } catch (erreur) {
      process.stdout.write(`${cible.nom}/${route} ECHEC ${String(erreur).slice(0, 120)}\n`);
    }
  }
  await contexte.close();
}
await navigateur.close();
