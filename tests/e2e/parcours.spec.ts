import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Verifications de bout en bout sur l application reellement construite.
 *
 * Aucune de ces verifications ne connait l implementation : elles passent par
 * ce que voit un utilisateur, donc elles cassent si le produit casse.
 */

const ECRANS = [
  { route: 'accueil', titre: /Apprendre le metier/ },
  { route: 'campus', titre: /Campus NEO Systems/ },
  { route: 'connaissances', titre: /NEO Knowledge/ },
  { route: 'revision', titre: /NEO Review/ },
  { route: 'progression', titre: /Progression/ },
  { route: 'reglages', titre: /Reglages/ },
  { route: 'diagnostics', titre: /NEO Diagnostics/ },
] as const;

/** Fige ce qui varie d une execution a l autre, sinon aucune capture ne serait stable. */
async function stabiliser(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
      /* Les mesures de performance et l horodatage changent a chaque passage. */
      .campus3d__stats, .neo-panel__head > .neo-dim { visibility: hidden !important; }
    `,
  });
  await page.waitForLoadState('networkidle').catch(() => undefined);
}

async function ouvrir(page: Page, route: string): Promise<void> {
  await page.goto(`./#/${route}`);
  // L application est prete quand sa navigation est rendue : analyser un DOM
  // en cours d hydratation produirait des resultats differents a chaque passage.
  await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor();
  if (route === 'campus') await attendreCampus(page);
  await stabiliser(page);
}

/**
 * Le campus charge son moteur graphique de facon asynchrone.
 * On attend qu il ait abouti ou echoue : dans les deux cas l ecran est stable.
 */
async function attendreCampus(page: Page): Promise<void> {
  await page
    .locator('.campus3d__hud, .campus3d__veil')
    .first()
    .waitFor({ state: 'visible', timeout: 20_000 })
    .catch(() => undefined);
  await page
    .locator('.campus3d__veil', { hasText: 'Chargement du moteur' })
    .waitFor({ state: 'hidden', timeout: 20_000 })
    .catch(() => undefined);
}

test.describe('fumee', () => {
  test('la page se charge et se declare prete', async ({ page }) => {
    const erreurs: string[] = [];
    page.on('pageerror', (error) => erreurs.push(String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') erreurs.push(message.text());
    });

    await ouvrir(page, 'accueil');
    await expect(page).toHaveTitle('TSSR NEO');
    await expect(page.getByRole('heading', { name: /Apprendre le metier/ })).toBeVisible();
    expect(erreurs, 'erreurs de console').toEqual([]);
  });

  test('chaque ecran principal se rend sans erreur', async ({ page }) => {
    for (const ecran of ECRANS) {
      await ouvrir(page, ecran.route);
      await expect(page.getByRole('heading', { name: ecran.titre }).first()).toBeVisible();
      await expect(page.getByText('Une erreur est survenue')).toHaveCount(0);
    }
  });

  test('le manifeste et le service worker sont servis', async ({ page, request, baseURL }) => {
    await ouvrir(page, 'accueil');
    const manifeste = await request.get(new URL('manifest.webmanifest', baseURL).toString());
    expect(manifeste.ok()).toBe(true);
    const contenu = (await manifeste.json()) as { name: string; display: string; icons: unknown[] };
    expect(contenu.name).toBe('TSSR NEO');
    expect(contenu.display).toBe('standalone');
    expect(contenu.icons.length).toBeGreaterThan(0);

    const worker = await request.get(new URL('sw.js', baseURL).toString());
    expect(worker.ok()).toBe(true);
    expect(await worker.text()).toContain('PRECACHE');
  });

  test('aucun debordement horizontal, quelle que soit la largeur', async ({ page }) => {
    for (const ecran of ECRANS) {
      await ouvrir(page, ecran.route);
      const debordement = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(debordement, `debordement sur ${ecran.route}`).toBe(false);
    }
  });
});

test.describe('parcours de mission', () => {
  test('diagnostiquer, corriger et documenter de bout en bout', async ({ page }) => {
    test.slow();
    await ouvrir(page, 'accueil');

    await page
      .getByRole('button', { name: /Entrer dans NEO Systems|Reprendre la session/ })
      .click();
    await page.waitForURL(/#\/mission/);
    await stabiliser(page);

    // La console de l equipement revele l ecart de configuration.
    await page.getByRole('tab', { name: 'Console equipement' }).click();
    const saisie = page.getByLabel(/Saisie de commande/);
    const executer = page.getByRole('button', { name: /Executer la commande/ });

    await saisie.fill('show vlan brief');
    await executer.click();
    await expect(page.getByRole('log')).toContainText('QUARANTAINE');

    for (const commande of [
      'configure terminal',
      'interface Gi0/2',
      'switchport access vlan 10',
      'end',
    ]) {
      await saisie.fill(commande);
      await executer.click();
    }
    await saisie.fill('show vlan brief');
    await executer.click();
    await expect(page.getByRole('log')).toContainText(/BUREAUX\s+Gi0\/1, Gi0\/2/);

    // Le poste retrouve un bail, puis joint le serveur.
    await page.getByRole('tab', { name: 'Terminal' }).click();
    await page.getByLabel('Machine cible du terminal').selectOption('sys-pc-camille');
    await page.getByLabel(/Saisie de commande/).fill('ipconfig /renew');
    await page.getByRole('button', { name: /Executer la commande/ }).click();
    await expect(page.getByRole('log')).toContainText('10.20.10.');

    await page.getByLabel(/Saisie de commande/).fill('ping srv-neo.neo.lan');
    await page.getByRole('button', { name: /Executer la commande/ }).click();
    await expect(page.getByRole('log')).toContainText('perte 0%');

    // Les objectifs techniques sont valides par l etat, pas par un clic.
    await expect(page.getByText(/[45]\/6/)).toBeVisible();
  });
});

test.describe('accessibilite', () => {
  for (const ecran of ECRANS) {
    test(`aucune violation serieuse sur ${ecran.route}`, async ({ page }) => {
      await ouvrir(page, ecran.route);
      const resultats = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const serieuses = resultats.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(
        serieuses.map(
          (violation) => `${violation.id} (${violation.nodes.length}) : ${violation.help}`,
        ),
      ).toEqual([]);
    });
  }

  test('la navigation au clavier atteint le contenu puis les onglets', async ({ page }) => {
    await ouvrir(page, 'accueil');
    await page.keyboard.press('Tab');
    // Le tout premier arret est le lien d evitement.
    await expect(page.locator('a.neo-skip-link')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#contenu')).toBeVisible();
  });

  test('le focus reste visible sur les controles', async ({ page }) => {
    await ouvrir(page, 'reglages');
    const premier = page.getByLabel('Qualite graphique');
    await premier.focus();
    const contour = await premier.evaluate((element) => getComputedStyle(element).outlineStyle);
    expect(contour).not.toBe('none');
  });
});

test.describe('visuel', () => {
  test('captures des ecrans principaux', async ({ page }, info) => {
    for (const ecran of ECRANS) {
      await ouvrir(page, ecran.route);
      await expect(page).toHaveScreenshot(`${info.project.name}-${ecran.route}.png`, {
        fullPage: false,
        mask: [page.locator('.campus3d__canvas'), page.locator('.campus3d__labels')],
      });
    }
  });

  test('texte agrandi : la mise en page tient', async ({ page }, info) => {
    test.skip(info.project.name !== 'texte-agrandi', 'configuration dediee');
    await ouvrir(page, 'reglages');
    await page.getByLabel('Taille du texte').selectOption('xl');
    await page.waitForTimeout(300);

    const debordement = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(debordement).toBe(false);
    await expect(page).toHaveScreenshot('texte-agrandi-reglages.png');
  });
});
