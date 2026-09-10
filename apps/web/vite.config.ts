import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { workspaceAliases } from '../../config/aliases.ts';
import { assets3d } from './plugins/assets-3d.ts';
import { serviceWorkerPrecache } from './plugins/sw-precache.ts';

// Chemin de base : compatible avec un sous-repertoire GitHub Pages
// (defini par la variable TSSR_BASE_PATH lors de la construction).
const base = process.env.TSSR_BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [react(), assets3d(), serviceWorkerPrecache({ base })],
  resolve: { alias: workspaceAliases },
  define: {
    __TSSR_BASE_PATH__: JSON.stringify(base),
    __TSSR_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
    __TSSR_BUILD__: JSON.stringify(process.env.TSSR_BUILD_ID ?? 'dev'),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Le moteur graphique a son propre bloc : il n est telecharge
          // qu au moment ou le campus tridimensionnel est ouvert.
          if (id.includes('node_modules/three')) return 'moteur-3d';
          // Le pont vers le moteur doit rester dans le bloc paresseux que
          // Rollup cree pour l import dynamique : on ne le nomme donc pas.
          if (id.includes('three-renderer')) return undefined;
          // Le coeur reste leger : la simulation et les modules sont charges a part.
          if (id.includes('/simulation/') || id.includes('/core/')) return 'simulation';
          if (id.includes('node_modules/react')) return 'react';
          if (id.includes('node_modules/zod')) return 'contracts';
          return undefined;
        },
      },
    },
  },
  server: {
    // Le port peut etre impose par l environnement : rien ici n exige un port
    // fixe, ni rappel d authentification, ni webhook, ni origine declaree.
    port: Number(process.env.PORT) || 5173,
    strictPort: false,
  },
});
