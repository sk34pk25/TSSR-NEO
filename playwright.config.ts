import { defineConfig, devices } from '@playwright/test';

/**
 * Assurance qualite de bout en bout.
 *
 * Trois familles de verifications, volontairement separees :
 *  - `fumee` : l application publiee repond et fonctionne ;
 *  - `visuel` : captures comparees sur plusieurs tailles et reglages ;
 *  - `accessibilite` : analyse automatisee sur les ecrans reels.
 *
 * L URL cible est configurable : par defaut la construction locale servie en
 * apercu, et en integration continue l URL de production reelle.
 */
const baseURL = process.env.TSSR_TEST_URL ?? 'http://localhost:4173/';
const isExternal = process.env.TSSR_TEST_URL !== undefined;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './reports/e2e',
  // Les captures sont propres a la plateforme : un rendu Linux et un rendu
  // macOS different toujours legerement.
  snapshotPathTemplate: '{testDir}/__captures__/{platform}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Le campus monte un moteur graphique par travailleur : au-dela de deux,
  // ils se disputent le meme rendu logiciel.
  workers: 2,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'reports/e2e-html' }]]
    : 'list',
  // Au premier passage, les references manquantes sont creees sans faire
  // echouer la campagne ; les executions suivantes detectent les ecarts.
  updateSnapshots: 'missing',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', scale: 'css' },
  },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    /*
     * Sans ces options, le navigateur sans interface retombe sur un rendu
     * purement logiciel : le campus y tourne a six images par seconde, et les
     * verifications qui l ouvrent deviennent instables des que plusieurs
     * travailleurs s executent en parallele. Ce n est pas la 3D qui est lente,
     * c est l environnement de test qui n a pas de pilote graphique.
     */
    launchOptions: { args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    {
      name: 'bureau',
      testIgnore: /appareil\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Fenetre etroite sur un ordinateur : elle reste un ordinateur.
      name: 'fenetre-etroite',
      testIgnore: /appareil\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 834, height: 1112 } },
    },
    /*
     * La plateforme est desormais reservee a l ordinateur : le projet mobile ne
     * verifie plus les ecrans, il verifie que le blocage est propre et qu aucun
     * asset lourd n est telecharge.
     */
    {
      name: 'mobile',
      testMatch: /appareil\.spec\.ts/,
      use: { ...devices['Pixel 7'] },
    },
    {
      // Tablette large et tactile : le cas ou la seule largeur ne suffit pas
      // a decider, et ou c est bien l absence de pointeur fin qui tranche.
      name: 'tablette-tactile',
      testMatch: /appareil\.spec\.ts/,
      use: { ...devices['Galaxy Tab S4 landscape'] },
    },
    {
      name: 'mouvement-reduit',
      testIgnore: /appareil\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce',
      },
    },
    {
      name: 'texte-agrandi',
      testIgnore: /appareil\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  // Un serveur local n est demarre que si aucune URL externe n est fournie.
  ...(isExternal
    ? {}
    : {
        webServer: {
          command: 'npm run preview -w @tssr/web',
          url: 'http://localhost:4173/',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }),
});
