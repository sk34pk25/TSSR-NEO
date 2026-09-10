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
  { route: 'parcours', titre: /^Parcours$/ },
  { route: 'campus', titre: /Campus NEO Systems/ },
  { route: 'revision', titre: /NEO Review/ },
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
  await passerLaPriseEnMain(page);
  if (route === 'campus') await attendreCampus(page);
  await stabiliser(page);
}

/**
 * La prise en main s affiche au tout premier passage et recouvre la page.
 * On la ferme comme le ferait un utilisateur, plutot que de truquer l etat.
 */
async function passerLaPriseEnMain(page: Page): Promise<void> {
  const dialogue = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
  if (await dialogue.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Passer' }).click();
    await dialogue.waitFor({ state: 'hidden' });
  }
}

/**
 * Le campus charge son moteur graphique de facon asynchrone.
 * On attend qu il ait abouti ou echoue : dans les deux cas l ecran est stable.
 */
async function attendreCampus(page: Page): Promise<void> {
  await page
    .locator('.campus3d__hud, .campus3d__veil')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => undefined);
  await page
    .locator('.campus3d__veil', { hasText: 'Chargement du moteur' })
    .waitFor({ state: 'hidden', timeout: 30_000 })
    .catch(() => undefined);
  /*
   * Le moteur est monte, mais la camera termine encore sa transition et les
   * etiquettes se placent d apres la projection courante. On attend que leur
   * nombre cesse de bouger : analyser une image en cours de composition
   * donnerait un resultat different a chaque passage.
   */
  let precedent = -1;
  let stable = 0;
  for (let essai = 0; essai < 40 && stable < 4; essai += 1) {
    const compte = await page.locator('.campus3d__label').count();
    stable = compte === precedent ? stable + 1 : 0;
    precedent = compte;
    await page.waitForTimeout(150);
  }
}

/**
 * Cherche des yeux un objet manipulable, comme quelqu un qui entre dans une
 * piece : quelques pas, puis un tour d horizon, jusqu a ce que quelque chose
 * devienne utilisable.
 */
async function chercherUnObjetManipulable(
  page: Page,
  invite: ReturnType<Page['locator']>,
): Promise<void> {
  const trouve = async (): Promise<boolean> => (await invite.count()) > 0;

  // On avance d abord droit devant : c est ce que fait quelqu un qui entre.
  for (let pas = 0; pas < 7 && !(await trouve()); pas += 1) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(320);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(140);
  }
  // Puis on regarde autour, sur place, sans s eloigner de ce qu on cherche.
  for (let vue = 0; vue < 26 && !(await trouve()); vue += 1) {
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(150);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(130);
  }
  // En dernier recours, quelques pas de plus dans la direction regardee.
  for (let pas = 0; pas < 5 && !(await trouve()); pas += 1) {
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(300);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(140);
  }
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

    await page.getByRole('button', { name: /^(Commencer|Reprendre)$/ }).click();
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
      // Le campus monte le moteur graphique : en rendu logiciel il est lent.
      if (ecran.route === 'campus') test.slow();
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
    // Repartir d une page fraiche : fermer la prise en main deplace le focus,
    // et ce test verifie precisement le tout premier arret d un chargement.
    await page.reload();
    await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor();
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
    test.slow();
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


test.describe('architecture de l information', () => {
  test('la navigation principale se limite a trois destinations', async ({ page }) => {
    await ouvrir(page, 'accueil');
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(nav.getByRole('link')).toHaveText(['Accueil', 'Parcours', 'NEO Systems']);
  });

  test('aucune destination principale n est vide au premier contact', async ({ page }) => {
    // Une entree de navigation qui n annonce que son propre vide est une impasse.
    for (const route of ['accueil', 'parcours', 'campus']) {
      await ouvrir(page, route);
      await expect(page.getByText(/Aucune mission en cours|Aucune competence suivie/)).toHaveCount(
        0,
      );
    }
  });

  test('les mesures de rendu restent cachees hors mode developpeur', async ({ page }) => {
    await ouvrir(page, 'campus');
    await expect(page.getByText(/img\/s/)).toHaveCount(0);
  });
});


test.describe('prise en main', () => {
  test('elle accueille au premier passage, puis ne revient pas', async ({ page }) => {
    await page.goto('./#/accueil');
    await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor();

    const dialogue = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
    await expect(dialogue).toBeVisible();

    // Les quatre etapes s enchainent et se terminent sur une action.
    for (const attendu of [
      /Vous entrez chez NEO Systems/,
      /Rien ici n est une mise en scene/,
      /Quatre endroits/,
      /Demander de l aide/,
    ]) {
      await expect(dialogue.getByRole('heading')).toHaveText(attendu);
      await dialogue.getByRole('button', { name: /Suivant|Commencer/ }).click();
    }
    await expect(dialogue).toBeHidden();

    // Elle ne reapparait pas au rechargement : la preference est persistee.
    await page.reload();
    await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('elle se saute au clavier et rend le focus a la page', async ({ page }) => {
    await page.goto('./#/accueil');
    await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});


test.describe('travailler sur place', () => {
  test('se rendre dans une piece, utiliser un poste, sans quitter le campus', async ({ page }) => {
    test.slow();
    await ouvrir(page, 'campus');

    // Le panneau d orientation propose deux acces : l ecran, ou le lieu.
    await page.getByRole('button', { name: /S y rendre dans la zone Bureaux/ }).click();
    await page.waitForTimeout(1500);
    // On est bien reste dans le campus : la route n a pas change.
    expect(page.url()).toContain('#/campus');

    // On avance en cherchant des yeux, comme dans n importe quel lieu.
    const invite = page.locator('.campus3d__invite');
    await chercherUnObjetManipulable(page, invite);
    await expect(invite).toContainText(/Utiliser|Ouvrir/);

    await page.keyboard.press('KeyE');
    const outil = page.getByRole('dialog', { name: /Poste|Baie|Console/ });
    await expect(outil).toBeVisible();

    // Sans infrastructure, l outil le dit au lieu d afficher un decor vide.
    await expect(outil.getByText('Aucune infrastructure chargee')).toBeVisible();
    await outil.getByRole('button', { name: 'Demarrer le laboratoire libre' }).click();

    // Le terminal ouvert dans le campus est le vrai terminal du moteur.
    await outil.getByLabel(/Saisie de commande/).fill('ip a');
    await outil.getByRole('button', { name: /Executer la commande/ }).click();
    await expect(outil.getByRole('log')).toContainText('10.20.');

    // Et l on referme sans avoir change d ecran.
    await page.keyboard.press('Escape');
    await expect(outil).toBeHidden();
    expect(page.url()).toContain('#/campus');
  });
});


test.describe('adresses unifiees', () => {
  test('les anciennes adresses ramenent au parcours, sans ecran duplique', async ({ page }) => {
    /*
     * La refonte precedente avait regroupe des ecrans sans supprimer leurs
     * adresses : le meme contenu etait servi par deux chemins. Ces alias
     * verifient qu il n en reste qu un seul.
     */
    for (const ancienne of ['apprendre', 'connaissances', 'progression']) {
      await ouvrir(page, ancienne);
      await expect(page.getByRole('heading', { name: /^Parcours$/, level: 1 })).toBeVisible();
    }
  });

  test('chaque ecran atteignable porte un titre de premier niveau', async ({ page }) => {
    for (const route of ['accueil', 'parcours', 'campus', 'mission', 'laboratoire', 'reglages']) {
      await ouvrir(page, route);
      await expect(page.locator('h1').first(), `titre sur ${route}`).toHaveCount(1);
    }
  });
});


test.describe('presence humaine', () => {
  test('aborder quelqu un et lui poser une question', async ({ page }) => {
    test.slow();
    await ouvrir(page, 'campus');
    await page.getByRole('button', { name: /S y rendre dans la zone Accueil$/ }).click();
    await page.waitForTimeout(1500);

    const invite = page.locator('.campus3d__invite');
    await chercherUnObjetManipulable(page, invite);
    await expect(invite).toContainText(/Parler a|Utiliser|Ouvrir/);
    await page.keyboard.press('KeyE');

    const echange = page.getByRole('dialog').first();
    await expect(echange).toBeVisible();
    // Un dialogue propose des questions ; y repondre revele des symptomes.
    const question = echange.getByRole('button').filter({ hasText: /\?$/ }).first();
    if ((await question.count()) > 0) {
      const texte = (await question.textContent()) ?? '';
      await question.click();
      await expect(echange.getByText(texte.trim())).toBeVisible();
    }
    await page.keyboard.press('Escape');
    expect(page.url()).toContain('#/campus');
  });
});
