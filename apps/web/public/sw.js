/*
 * Service worker TSSR NEO.
 *
 * La version de cache et la liste de precache sont reecrites a la construction
 * par le greffon `plugins/sw-precache.ts` : elles refletent le contenu reellement
 * livre, ce qui garantit un premier lancement hors ligne et une invalidation
 * automatique a chaque nouvelle version.
 */
const CACHE_VERSION = 'tssr-neo-dev';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];

const SHELL = new URL('./index.html', self.registration.scope).pathname;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // Chaque ressource est ajoutee individuellement : une seule absente
      // ne doit pas faire echouer toute l installation.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'reload' });
            if (response.ok) await cache.put(url, response);
          } catch {
            /* ressource indisponible : le cache d execution la reprendra */
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('tssr-neo-') && key !== CACHE_VERSION)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting();
  if (event.data === 'purge-caches') {
    // Recuperation d un cache corrompu : tout est supprime, le prochain
    // chargement repart du reseau.
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
    );
  }
});

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      const cache = await caches.open(CACHE_VERSION);
      await cache.put(request, copy);
    }
    return response;
  } catch (error) {
    const cached = (await caches.match(request)) ?? (await caches.match(SHELL));
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const copy = response.clone();
    const cache = await caches.open(CACHE_VERSION);
    await cache.put(request, copy);
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // La coquille passe par le reseau d abord : on ne sert jamais une version
  // obsolete de l application tant que le reseau repond.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    cacheFirst(request).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      return Response.error();
    }),
  );
});
