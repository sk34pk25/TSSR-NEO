import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const ici = dirname(fileURLToPath(import.meta.url));
const RACINE_ASSETS = resolve(ici, '../../../assets/3d');

/**
 * Mise a disposition des modeles tridimensionnels.
 *
 * Les fichiers vivent a la racine du depot, hors de l application, parce qu ils
 * ne sont pas propres a l interface web : ils sont sous licence, verifies, et
 * partages. Ce greffon les sert en developpement et les copie a la
 * construction, sans les faire entrer dans le graphe de modules : ils doivent
 * rester telecharges a la demande, jamais empaquetes.
 */
export function assets3d(): Plugin {
  return {
    name: 'tssr-assets-3d',
    configureServer(server) {
      server.middlewares.use(async (requete, reponse, suivant) => {
        const url = requete.url ?? '';
        const marqueur = '/assets/3d/';
        const position = url.indexOf(marqueur);
        if (position === -1) {
          suivant();
          return;
        }
        const relatif = decodeURIComponent(url.slice(position + marqueur.length).split('?')[0] ?? '');
        // Aucune remontee hors du repertoire d assets.
        const chemin = resolve(RACINE_ASSETS, relatif);
        if (!chemin.startsWith(RACINE_ASSETS)) {
          reponse.statusCode = 403;
          reponse.end();
          return;
        }
        try {
          const infos = await stat(chemin);
          if (!infos.isFile()) throw new Error('pas un fichier');
          const { createReadStream } = await import('node:fs');
          const type = chemin.endsWith('.png')
            ? 'image/png'
            : chemin.endsWith('.jpg') || chemin.endsWith('.jpeg')
              ? 'image/jpeg'
              : 'model/gltf-binary';
          reponse.setHeader('Content-Type', type);
          reponse.setHeader('Content-Length', String(infos.size));
          createReadStream(chemin).pipe(reponse);
        } catch {
          suivant();
        }
      });
    },
    async closeBundle() {
      const destination = resolve(ici, '../dist/assets/3d');
      await mkdir(destination, { recursive: true });
      await cp(RACINE_ASSETS, destination, { recursive: true });
      const total = await compter(destination);
      this.info?.(`modeles 3D copies : ${total.fichiers} fichiers, ${Math.round(total.octets / 1024)} Ko`);
    },
  };
}

async function compter(repertoire: string): Promise<{ fichiers: number; octets: number }> {
  let fichiers = 0;
  let octets = 0;
  for (const entree of await readdir(repertoire, { withFileTypes: true })) {
    const chemin = join(repertoire, entree.name);
    if (entree.isDirectory()) {
      const enfant = await compter(chemin);
      fichiers += enfant.fichiers;
      octets += enfant.octets;
    } else {
      fichiers += 1;
      octets += (await stat(chemin)).size;
    }
  }
  return { fichiers, octets };
}
