import { expect, test, type Page } from '@playwright/test';

/**
 * Parcours complet d un nouvel utilisateur.
 *
 * Un seul test, deliberement long : il suit la sequence entiere d une premiere
 * visite, du tout premier clic au retour dans le campus. Le decouper en dix
 * petits tests masquerait justement ce que l on cherche a verifier, c est-a-dire
 * qu on peut enchainer sans jamais se perdre ni rien casser.
 */

async function chercherUnObjet(
  page: Page,
  invite: ReturnType<Page['locator']>,
  attendu: RegExp = /./,
): Promise<void> {
  /*
   * On arrive desormais face a ce que la piece sert a faire : quelques pas
   * droit devant suffisent. Le balayage ne sert plus qu au repli, pour les
   * personnes qui, elles, se deplacent.
   */
  const trouve = async (): Promise<boolean> => {
    if ((await invite.count()) === 0) return false;
    return attendu.test((await invite.textContent()) ?? '');
  };

  const pivoter = async (touche: 'ArrowRight' | 'ArrowLeft'): Promise<void> => {
    await page.keyboard.down(touche);
    await page.waitForTimeout(150);
    await page.keyboard.up(touche);
    await page.waitForTimeout(110);
  };

  for (let pas = 0; pas < 8 && !(await trouve()); pas += 1) {
    await page.keyboard.down('KeyZ');
    await page.waitForTimeout(260);
    await page.keyboard.up('KeyZ');
    await page.waitForTimeout(130);
  }
  // Repli : un tour d horizon, puis retour au cap de depart.
  let tours = 0;
  for (; tours < 26 && !(await trouve()); tours += 1) await pivoter('ArrowRight');
  if (!(await trouve())) {
    for (let retour = 0; retour < tours; retour += 1) await pivoter('ArrowLeft');
    for (let pas = 0; pas < 6 && !(await trouve()); pas += 1) {
      await page.keyboard.down('KeyZ');
      await page.waitForTimeout(280);
      await page.keyboard.up('KeyZ');
      await page.waitForTimeout(130);
      for (let vue = 0; vue < 12 && !(await trouve()); vue += 1) await pivoter('ArrowRight');
    }
  }
}

test('un nouvel arrivant traverse toute la plateforme sans une erreur', async ({ page }, info) => {
  /*
   * Une seule configuration suffit : ce parcours verifie un enchainement, pas
   * une mise en page. Le rejouer a cinq tailles d ecran couterait dix minutes
   * pour la meme information.
   */
  test.skip(info.project.name !== 'bureau', 'parcours joue une seule fois');
  // Il traverse reellement le batiment a pied : il lui faut du temps, surtout
  // sur une machine d integration sans pilote graphique.
  test.setTimeout(300_000);
  const erreurs: string[] = [];
  page.on('pageerror', (erreur) => erreurs.push(String(erreur).slice(0, 200)));
  page.on('console', (message) => {
    if (message.type() === 'error') erreurs.push(message.text().slice(0, 200));
  });

  // 1. Premiere visite : la prise en main accueille.
  await page.goto('./#/accueil');
  await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor();
  const priseEnMain = page.getByRole('dialog', { name: 'Prise en main de TSSR NEO' });
  await expect(priseEnMain).toBeVisible();
  // Ce premier clic est aussi le geste qui autorise le son.
  await page.getByRole('button', { name: 'Passer' }).click();
  await expect(priseEnMain).toBeHidden();

  // 2. Le son est actif par defaut.
  await page.goto('./#/reglages');
  await page.getByRole('navigation', { name: 'Navigation principale' }).waitFor();
  await expect(page.getByLabel('Son actif')).toBeChecked();

  // 3. L accueil propose une seule suite.
  await page.getByRole('link', { name: 'Accueil', exact: true }).click();
  await expect(page.locator('.ui-primary')).toBeVisible();

  // 4. Entrer dans les locaux, et y trouver l aide aux commandes.
  await page.getByRole('link', { name: 'NEO Systems', exact: true }).click();
  await page.locator('.campus3d__hud').waitFor({ timeout: 40_000 });
  const aide = page.locator('.campus3d__tutoriel');
  await expect(aide).toBeVisible();
  await expect(aide).toContainText('Z');
  await aide.getByRole('button', { name: 'J ai compris' }).click();

  // 5. Se rendre a l accueil du batiment, marcher, et parler a quelqu un.
  await page.getByRole('button', { name: /S y rendre dans la zone Accueil$/ }).click();
  await page.waitForTimeout(1800);
  const invite = page.locator('.campus3d__invite');
  await chercherUnObjet(page, invite, /Parler a/);
  await expect(invite).toContainText(/Parler a/);
  await page.keyboard.press('KeyE');
  const echange = page.getByRole('dialog').first();
  await expect(echange).toBeVisible();
  await page.keyboard.press('Escape');

  // 6. Aller aux bureaux et utiliser un poste : le vrai terminal du moteur.
  await page.getByRole('button', { name: /S y rendre dans la zone Bureaux$/ }).click();
  await page.waitForTimeout(1800);
  await chercherUnObjet(page, invite, /Utiliser/);
  await page.keyboard.press('KeyE');
  const outil = page.getByRole('dialog').first();
  await expect(outil).toBeVisible();
  await outil
    .getByRole('button', { name: 'Demarrer le laboratoire libre' })
    .click()
    .catch(() => undefined);
  await outil.getByLabel(/Saisie de commande/).fill('ip a');
  await outil.getByRole('button', { name: /Executer la commande/ }).click();
  await expect(outil.getByRole('log')).toContainText('10.20.');
  await page.keyboard.press('Escape');

  // 7. Aller en salle reseau et inspecter une baie.
  await page.getByRole('button', { name: /S y rendre dans la zone Salle reseau$/ }).click();
  await page.waitForTimeout(1800);
  await chercherUnObjet(page, invite, /Ouvrir/);
  await page.keyboard.press('KeyE');
  await expect(page.getByRole('dialog').first()).toBeVisible();
  await page.keyboard.press('Escape');

  // 8. Ouvrir les commandes et remapper une touche.
  await page.getByRole('button', { name: '? Commandes' }).click();
  const commandes = page.getByRole('dialog', { name: 'Commandes' });
  await expect(commandes).toBeVisible();
  await commandes.getByRole('button', { name: 'Changer la touche de Avancer' }).click();
  await page.keyboard.press('KeyT');
  await expect(commandes.getByRole('button', { name: 'Changer la touche de Avancer' })).toHaveText(
    'T',
  );
  await commandes.getByRole('button', { name: 'Reinitialiser les commandes' }).click();
  await commandes.getByRole('button', { name: 'Fermer' }).click();

  // 9. Revenir au campus : on n a jamais quitte la route.
  expect(page.url()).toContain('#/campus');
  expect(erreurs, 'erreurs de console pendant le parcours').toEqual([]);
});
