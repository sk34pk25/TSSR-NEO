import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { workspaceAliases } from '../../config/aliases.ts';

// Chemin de base : compatible avec un sous-repertoire GitHub Pages
// (defini par la variable TSSR_BASE_PATH lors de la construction).
const base = process.env.TSSR_BASE_PATH ?? '/';

export default defineConfig({
  base,
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
          // Le coeur reste leger : la simulation et les modules sont charges a part.
          if (id.includes('/simulation/') || id.includes('/core/')) return 'simulation';
          if (id.includes('/modules/')) return 'modules';
          if (id.includes('node_modules/react')) return 'react';
          if (id.includes('node_modules/zod')) return 'contracts';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, strictPort: false },
});
