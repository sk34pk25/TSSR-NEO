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
  workers: process.env.CI ? 2 : undefined,
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
  },
  projects: [
    {
      name: 'bureau',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablette',
      use: { ...devices['Desktop Chrome'], viewport: { width: 834, height: 1112 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    {
      name: 'mouvement-reduit',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        reducedMotion: 'reduce',
      },
    },
    {
      name: 'texte-agrandi',
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
