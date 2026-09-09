/**
 * Traversee du campus en vue subjective.
 *
 * Reproduit ce que fait reellement un visiteur : il entre, il avance dans le
 * couloir, il regarde autour de lui. Les captures servent a juger l ambiance,
 * pas la conformite du DOM.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.TSSR_TEST_URL ?? 'http://localhost:5173/';
const OUT = process.env.OUT ?? 'docs/audit/captures/campus-subjectif';

await mkdir(OUT, { recursive: true });
const navigateur = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
const page = await contexte.newPage();

await page.goto(`${BASE}#/campus`, { waitUntil: 'domcontentloaded' });
await page.locator('.campus3d__hud').waitFor({ timeout: 30000 });
await page.waitForTimeout(4000);

const vue = page.locator('.campus3d__stage, .campus3d, canvas').first();
await vue.scrollIntoViewIfNeeded();
await page.getByRole('tab', { name: 'Subjective' }).click();
await page.waitForTimeout(1500);

async function capturer(nom) {
  await page.waitForTimeout(700);
  await page.locator('canvas').first().screenshot({ path: `${OUT}/${nom}.png` });
  process.stdout.write(`${nom} ok\n`);
}

async function avancer(ms) {
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(ms);
  await page.keyboard.up('KeyW');
}

async function tourner(touche, ms) {
  await page.keyboard.down(touche);
  await page.waitForTimeout(ms);
  await page.keyboard.up(touche);
}

await capturer('01-apparition');
await tourner('ArrowLeft', 500);
await capturer('02-regard-gauche');
await tourner('ArrowRight', 1000);
await capturer('03-regard-droite');
await tourner('ArrowLeft', 500);
await avancer(1500);
await capturer('04-couloir');
await avancer(2000);
await capturer('05-couloir-milieu');
await tourner('ArrowLeft', 700);
await capturer('06-face-a-une-porte');
await tourner('ArrowRight', 1400);
await capturer('07-face-porte-opposee');
await tourner('ArrowLeft', 700);
await avancer(2500);
await capturer('08-fond-du-couloir');

await contexte.close();
await navigateur.close();
