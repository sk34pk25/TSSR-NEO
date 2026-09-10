import { expect, test } from '@playwright/test';

/**
 * Appareils sans clavier ni souris.
 *
 * La plateforme demande les deux : le campus se parcourt en Z Q S D, les
 * terminaux se tapent, les baies s inspectent au pointeur. Plutot que de livrer
 * une version degradee qui donnerait une fausse idee du produit, on le dit, et
 * l on ne telecharge rien de lourd.
 */

test('un ecran tactile recoit une explication, pas une version amputee', async ({ page }) => {
  await page.goto('./#/accueil');
  await expect(
    page.getByRole('heading', { name: /necessite actuellement un ordinateur/ }),
  ).toBeVisible();
  await expect(page.getByText(/clavier et d une souris/)).toBeVisible();
});

test('aucun moteur graphique ni modele n est telecharge', async ({ page }) => {
  const lourds: string[] = [];
  page.on('request', (requete) => {
    const url = requete.url();
    if (/\.glb$/.test(url) || /moteur-3d/.test(url) || /three-renderer/.test(url)) {
      lourds.push(url);
    }
  });
  await page.goto('./#/campus');
  await page.waitForTimeout(2500);
  expect(lourds, 'ressources lourdes telechargees').toEqual([]);
});

test('le message reste lisible et sans debordement', async ({ page }) => {
  await page.goto('./#/accueil');
  const debordement = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(debordement).toBe(false);
});
