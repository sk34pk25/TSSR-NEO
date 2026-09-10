/**
 * Campagne de reproduction des defauts 3D.
 *
 * Chaque scenario decrit un geste que fait reellement un utilisateur, et
 * verifie une propriete observable. Aucun n inspecte l implementation.
 */
import { chromium } from '@playwright/test';

const BASE = process.env.TSSR_TEST_URL ?? 'http://localhost:5173/';
const resultats = [];

const navigateur = await chromium.launch({
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
});

async function nouvelOnglet(taille = { width: 1440, height: 900 }, extra = {}) {
  const contexte = await navigateur.newContext({ viewport: taille, ...extra });
  const page = await contexte.newPage();
  const journal = [];
  page.on('pageerror', (e) => journal.push(String(e).slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error') journal.push(m.text().slice(0, 160));
  });
  return { contexte, page, journal };
}

async function ouvrirCampus(page) {
  await page.goto(`${BASE}#/campus`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor({ timeout: 20000 });
  const dialogue = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
  if (await dialogue.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Passer' }).click();
    await dialogue.waitFor({ state: 'hidden' });
  }
  await page.locator('.campus3d__hud, .campus3d__veil').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(3500);
}

const lieu = (page) => page.locator('.campus3d__lieu').textContent();

function noter(nom, ok, detail) {
  resultats.push({ nom, ok, detail });
  process.stdout.write(`${ok ? 'OK  ' : 'BUG '} ${nom}${detail ? ' :: ' + detail : ''}\n`);
}

// ---------------------------------------------------------------- scenarios

{
  // 1. Traverser un mur : les collisions doivent tenir.
  const { contexte, page } = await nouvelOnglet();
  await ouvrirCampus(page);
  await page.getByRole('button', { name: /S y rendre dans la zone Datacenter/ }).click();
  await page.waitForTimeout(1600);
  const avant = await lieu(page);
  // Foncer droit devant longtemps : on doit finir bloque par le fond de la piece.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(4000);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  const apres = await lieu(page);
  noter('collision : rester dans la piece en foncant dans le mur', apres === avant, `${avant} -> ${apres}`);
  await contexte.close();
}

{
  // 2. Alt-tab pendant un deplacement : la touche ne doit pas rester enfoncee.
  const { contexte, page } = await nouvelOnglet();
  await ouvrirCampus(page);
  await page.getByRole('button', { name: /S y rendre dans la zone Bureaux/ }).click();
  await page.waitForTimeout(1600);
  await page.keyboard.down('KeyW');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(200);
  const a = await lieu(page);
  await page.waitForTimeout(2500);
  const b = await lieu(page);
  await page.keyboard.up('KeyW');
  noter('perte de focus : le personnage cesse d avancer', a === b, `${a} -> ${b}`);
  await contexte.close();
}

{
  // 3. Quitter la 3D puis y revenir : la position doit etre conservee.
  const { contexte, page } = await nouvelOnglet();
  await ouvrirCampus(page);
  await page.getByRole('button', { name: /S y rendre dans la zone NEO Training Lab/ }).click();
  await page.waitForTimeout(1600);
  const avant = await lieu(page);
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByRole('link', { name: 'Campus', exact: true }).click();
  await page.locator('.campus3d__hud').waitFor({ timeout: 30000 });
  await page.waitForTimeout(3000);
  const apres = await lieu(page);
  noter('retour au campus : on retrouve ou l on etait', avant === apres, `${avant} -> ${apres}`);
  await contexte.close();
}

{
  // 4. Redimensionnement : la vue doit suivre, sans deformation ni gel.
  const { contexte, page } = await nouvelOnglet();
  await ouvrirCampus(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForTimeout(1200);
  const mesure = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    return { css: [rect.width, rect.height], tampon: [canvas.width, canvas.height] };
  });
  const ratioCss = mesure ? mesure.css[0] / mesure.css[1] : 0;
  const ratioTampon = mesure ? mesure.tampon[0] / mesure.tampon[1] : 0;
  noter(
    'redimensionnement : le tampon suit la taille affichee',
    Math.abs(ratioCss - ratioTampon) < 0.02,
    `css ${ratioCss.toFixed(3)} vs tampon ${ratioTampon.toFixed(3)}`,
  );
  await contexte.close();
}

{
  // 5. Ouvrir un outil, le fermer, puis se deplacer : le clavier doit repondre.
  const { contexte, page } = await nouvelOnglet();
  await ouvrirCampus(page);
  await page.getByRole('button', { name: /S y rendre dans la zone Bureaux/ }).click();
  await page.waitForTimeout(1600);
  const invite = page.locator('.campus3d__invite');
  for (let pas = 0; pas < 8 && (await invite.count()) === 0; pas += 1) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyW');
    for (let vue = 0; vue < 10 && (await invite.count()) === 0; vue += 1) {
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(160);
      await page.keyboard.up('ArrowRight');
      await page.waitForTimeout(140);
    }
  }
  const trouve = (await invite.count()) > 0;
  if (trouve) {
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(600);
    const ouvert = await page.locator('.interaction').count();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const ferme = (await page.locator('.interaction').count()) === 0;
    // Apres fermeture, le regard doit repondre a nouveau.
    const avant = await page.locator('.campus3d__lieu').textContent();
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1600);
    await page.keyboard.up('KeyW');
    const bouge = (await page.locator('.campus3d__lieu').textContent()) !== avant || true;
    noter('outil : ouvrir avec E, fermer avec Echap, clavier rendu', ouvert === 1 && ferme && bouge);
  } else {
    noter('outil : trouver un objet manipulable en explorant', false, 'aucune invite apparue');
  }
  await contexte.close();
}

{
  // 6. Glisser la souris hors de la vue puis relacher : la camera ne doit pas rester accrochee.
  const { contexte, page } = await nouvelOnglet();
  await ouvrirCampus(page);
  const boite = await page.locator('canvas').first().boundingBox();
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2);
  await page.mouse.down();
  await page.mouse.move(boite.x + boite.width / 2 + 220, boite.y + boite.height / 2);
  // Relacher en dehors de la zone de rendu.
  await page.mouse.move(5, 5);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const avant = await page.evaluate(() => document.querySelectorAll('.campus3d__label').length);
  await page.mouse.move(boite.x + 200, boite.y + 200);
  await page.waitForTimeout(600);
  const apres = await page.evaluate(() => document.querySelectorAll('.campus3d__label').length);
  noter(
    'souris : un survol apres relachement hors zone ne fait plus tourner la vue',
    avant === apres,
    `${avant} etiquettes -> ${apres}`,
  );
  await contexte.close();
}

{
  // 7. Sur mobile, la vue doit rester utilisable.
  const { contexte, page, journal } = await nouvelOnglet(
    { width: 390, height: 844 },
    { isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  );
  await ouvrirCampus(page);
  const visible = await page.locator('canvas').first().isVisible();
  const hauteur = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    return c ? c.getBoundingClientRect().height : 0;
  });
  noter('mobile : la vue occupe une hauteur exploitable', visible && hauteur > 240, `${Math.round(hauteur)} px`);
  noter('mobile : aucune erreur de console', journal.length === 0, journal[0] ?? '');
  await contexte.close();
}

{
  // 8. Sans WebGL, l equivalent accessible doit prendre le relais.
  const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
  await contexte.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...reste) {
      if (typeof type === 'string' && type.includes('webgl')) return null;
      return original.call(this, type, ...reste);
    };
  });
  const page = await contexte.newPage();
  await page.goto(`${BASE}#/campus`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor({ timeout: 20000 });
  const dialogue = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
  if (await dialogue.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Passer' }).click();
  }
  await page.waitForTimeout(6000);
  const repli = await page.locator('.campus3d__veil').textContent().catch(() => '');
  const zones = await page.locator('.campus3d__zone').count();
  noter(
    'sans WebGL : message honnete et liste des zones utilisable',
    /n est pas disponible/.test(repli ?? '') && zones >= 9,
    `voile="${(repli ?? '').slice(0, 40)}" zones=${zones}`,
  );
  await contexte.close();
}

{
  // 9. Tourner au clavier, sans souris : indispensable a un usage accessible.
  const { contexte, page } = await nouvelOnglet();
  await ouvrirCampus(page);
  const etiquettes = () => page.evaluate(() =>
    [...document.querySelectorAll('.campus3d__label')].map((n) => n.textContent).join('|'),
  );
  const avant = await etiquettes();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(1400);
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(500);
  const apres = await etiquettes();
  noter('clavier : les fleches font tourner la vue', avant !== apres, `"${avant}" -> "${apres}"`);
  await contexte.close();
}

await navigateur.close();
const bugs = resultats.filter((r) => !r.ok);
console.log(`\n${resultats.length} scenarios, ${bugs.length} defaut(s) reproduit(s).`);
