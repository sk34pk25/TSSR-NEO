import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';

/**
 * Injecte dans le service worker la liste reelle des fichiers construits.
 *
 * Sans cela, les ressources ne sont mises en cache qu au second chargement :
 * un tout premier lancement hors ligne echouerait. La version de cache est
 * derivee du contenu, de sorte qu une nouvelle construction invalide
 * automatiquement l ancienne et declenche le parcours de mise a jour.
 */
export function serviceWorkerPrecache(options: { base: string }): Plugin {
  return {
    name: 'tssr-sw-precache',
    apply: 'build',
    closeBundle() {
      const distDir = join(process.cwd(), 'dist');
      const swPath = join(distDir, 'sw.js');

      let source: string;
      try {
        source = readFileSync(swPath, 'utf8');
      } catch {
        this.warn('sw.js absent de la construction : precache non injecte.');
        return;
      }

      const files: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
          const full = join(dir, entry);
          if (statSync(full).isDirectory()) walk(full);
          else files.push(full);
        }
      };
      walk(distDir);

      const base = options.base.endsWith('/') ? options.base : `${options.base}/`;

      /*
       * Seules les ressources du chargement initial sont precachees.
       * Les blocs charges paresseusement (le moteur graphique en particulier)
       * seraient sinon telecharges des la premiere visite, ce qui annulerait
       * l interet du decoupage. Ils sont mis en cache a leur premier usage.
       */
      let referenced = new Set<string>();
      try {
        const html = readFileSync(join(distDir, 'index.html'), 'utf8');
        for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
          const value = match[1];
          if (value !== undefined) referenced.add(value.replace(base, '').replace(/^\.?\//, ''));
        }
      } catch {
        referenced = new Set<string>();
      }

      const isInitial = (relative: string): boolean => {
        if (relative === 'index.html' || relative === 'manifest.webmanifest') return true;
        if (relative.startsWith('icons/') || relative === 'favicon.svg') return true;
        return referenced.has(relative);
      };

      // Les sources de deboguage et le service worker lui-meme ne sont jamais precaches.
      const shipped = files
        .filter((file) => !file.endsWith('.map'))
        .filter((file) => relative(distDir, file) !== 'sw.js');

      const urls = shipped
        .filter((file) => isInitial(relative(distDir, file).split(sep).join('/')))
        .map((file) => `${base}${relative(distDir, file).split(sep).join('/')}`)
        .sort();

      // Empreinte du contenu reellement livre : elle pilote la version du cache.
      const digest = createHash('sha256');
      for (const file of shipped.sort()) digest.update(readFileSync(file));
      const version = digest.digest('hex').slice(0, 12);

      const precache = [base, ...urls].filter((value, index, all) => all.indexOf(value) === index);

      const injected = source
        .replace(/const CACHE_VERSION = .*;/, `const CACHE_VERSION = 'tssr-neo-${version}';`)
        .replace(
          /const PRECACHE = \[[\s\S]*?\];/,
          `const PRECACHE = ${JSON.stringify(precache, null, 2)};`,
        );

      writeFileSync(swPath, injected, 'utf8');
      this.info?.(`service worker : ${precache.length} ressources precachees, version ${version}`);
    },
  };
}
