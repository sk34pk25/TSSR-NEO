import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours simules d un joueur.
 *
 * Ces verifications ne testent pas des composants : elles mesurent ce qu il en
 * coute a quelqu un qui decouvre la plateforme. Le nombre d interactions est
 * l unite qui compte, parce que c est lui qui traduit « dispersé » ou
 * « evident ».
 */

async function entrer(page: Page): Promise<void> {
  await page.goto('./#/accueil');
  await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor();
  const dialogue = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
  if (await dialogue.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Passer' }).click();
    await dialogue.waitFor({ state: 'hidden' });
  }
}

test.describe('agent joueur debutant', () => {
  test('la prise en main dit ou l on est et ce que l on va faire', async ({ page }) => {
    await page.goto('./#/accueil');
    await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor();
    const dialogue = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
    await expect(dialogue).toBeVisible();
    // Les quatre questions de l arrivee, repondues avant toute action.
    await expect(dialogue).toContainText(/technicien systemes et reseaux/);
    await expect(dialogue.getByRole('button', { name: 'Suivant' })).toBeVisible();
  });

  test('trois destinations, pas onze produits a comprendre', async ({ page }) => {
    await entrer(page);
    const nav = page.getByRole('navigation', { name: 'Navigation principale' });
    await expect(nav.getByRole('link')).toHaveText(['Accueil', 'Parcours', 'NEO Systems']);
  });

  test('une seule action dominante, et la raison qui la justifie', async ({ page }) => {
    await entrer(page);
    // Ce qu on doit faire maintenant doit se lire sans chercher.
    const action = page.locator('.ui-primary');
    await expect(action).toBeVisible();
    await expect(action.getByRole('button')).toHaveCount(2);
    await expect(action.locator('.accueil__raison, .ui-primary__raison')).toBeVisible();
  });

  test('commencer son parcours en moins de trois interactions', async ({ page }) => {
    await entrer(page);
    let interactions = 0;

    // Interaction 1 : l action dominante de l accueil.
    await page.getByRole('button', { name: /^(Commencer|Reprendre)$/ }).click();
    interactions += 1;
    await page.waitForURL(/#\/mission/);

    // L objectif courant doit etre lisible sans autre clic.
    await expect(page.getByText(/Objectifs/)).toBeVisible();
    expect(interactions, 'interactions avant de travailler').toBeLessThanOrEqual(3);
  });

  test('atteindre les locaux et en revenir sans se perdre', async ({ page }) => {
    await entrer(page);
    await page.getByRole('link', { name: 'NEO Systems', exact: true }).click();
    await page.waitForURL(/#\/campus/);
    await expect(page.locator('.campus3d__wayfinding')).toBeVisible();
    // Le retour est toujours a la meme place.
    await page.getByRole('link', { name: 'Accueil', exact: true }).click();
    await page.waitForURL(/#\/accueil/);
    await expect(page.locator('.ui-primary')).toBeVisible();
  });

  test('aucune destination principale ne montre son propre vide', async ({ page }) => {
    for (const route of ['accueil', 'parcours', 'campus']) {
      await page.goto(`./#/${route}`);
      await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor();
      const dialogue = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
      if (await dialogue.isVisible().catch(() => false)) {
        await page.getByRole('button', { name: 'Passer' }).click();
      }
      await page.waitForTimeout(500);
      await expect(
        page.getByText(/Aucune mission en cours|Aucune competence suivie|Aucun parcours installe/),
        route,
      ).toHaveCount(0);
    }
  });
});

test.describe('agent joueur : intervention complete', () => {
  test('du parcours au debrief, sans changer d application', async ({ page }) => {
    test.slow();
    await entrer(page);

    // 1. Le parcours propose l intervention, avec son etat et ses competences.
    await page.getByRole('link', { name: 'Parcours', exact: true }).click();
    // On vise la nature de l etape, pas son texte : le libelle « intervention »
    // apparait aussi dans l explication de l etape de revision.
    const etape = page
      .locator('.parcours__etape')
      .filter({ has: page.locator('.parcours__nature', { hasText: /^Intervention$/ }) });
    await expect(etape).toBeVisible();
    await etape.getByRole('button', { name: /Commencer|Reprendre/ }).click();
    await page.waitForURL(/#\/mission/);

    // 2. L objectif courant est lisible immediatement.
    await expect(page.getByText(/Objectifs/)).toBeVisible();
    await expect(page.getByText(/1\/6/)).toBeVisible();

    // 3. La console revele l ecart de configuration.
    await page.getByRole('tab', { name: 'Console equipement' }).click();
    const saisie = page.getByLabel(/Saisie de commande/);
    const executer = page.getByRole('button', { name: /Executer la commande/ });
    await saisie.fill('show vlan brief');
    await executer.click();
    await expect(page.getByRole('log')).toContainText('QUARANTAINE');

    // 4. La correction agit sur l infrastructure reelle.
    for (const commande of [
      'configure terminal',
      'interface Gi0/2',
      'switchport access vlan 10',
      'end',
    ]) {
      await saisie.fill(commande);
      await executer.click();
    }

    // 5. Verification depuis le poste de l utilisatrice.
    await page.getByRole('tab', { name: 'Terminal' }).click();
    await page.getByLabel('Machine cible du terminal').selectOption('sys-pc-camille');
    await page.getByLabel(/Saisie de commande/).fill('ipconfig /renew');
    await page.getByRole('button', { name: /Executer la commande/ }).click();
    await expect(page.getByRole('log')).toContainText('10.20.10.');

    // 6. Les objectifs se valident sur l etat, pas sur un clic.
    await expect(page.getByText(/[45]\/6/)).toBeVisible();

    // 7. Le retour ramene au parcours, pas dans un ecran inconnu.
    await page.getByRole('link', { name: 'Parcours', exact: true }).click();
    await expect(page.getByRole('heading', { name: /^Parcours$/, level: 1 })).toBeVisible();
  });
});
