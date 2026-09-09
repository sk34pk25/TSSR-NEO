/**
 * Cycle de vie de l application installable.
 *
 * Trois responsabilites : enregistrer le service worker, prevenir l utilisateur
 * qu une nouvelle version attend, et permettre de repartir proprement d un cache
 * corrompu sans perdre la progression, qui vit dans IndexedDB et non dans le cache.
 */

export type UpdateListener = (available: boolean) => void;

const listeners = new Set<UpdateListener>();
let waitingWorker: ServiceWorker | undefined;
let registration: ServiceWorkerRegistration | undefined;

export function onUpdateAvailable(listener: UpdateListener): () => void {
  listeners.add(listener);
  listener(waitingWorker !== undefined);
  return () => listeners.delete(listener);
}

function announce(): void {
  for (const listener of listeners) listener(waitingWorker !== undefined);
}

function track(candidate: ServiceWorker | null): void {
  if (!candidate) return;
  const check = (): void => {
    // Un worker installe alors qu un autre controle deja la page est une mise a jour.
    if (candidate.state === 'installed' && navigator.serviceWorker.controller !== null) {
      waitingWorker = candidate;
      announce();
    }
  };
  check();
  candidate.addEventListener('statechange', check);
}

export async function registerServiceWorker(base: string): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    registration = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
    track(registration.waiting);
    registration.addEventListener('updatefound', () => track(registration?.installing ?? null));

    // Un rechargement unique apres bascule evite la boucle de rechargement.
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  } catch (error) {
    console.warn('Mode hors ligne indisponible :', error);
  }
}

/** Applique la mise a jour en attente : le rechargement suit la bascule de controle. */
export function applyUpdate(): void {
  waitingWorker?.postMessage('skip-waiting');
  waitingWorker = undefined;
  announce();
}

/**
 * Reprise apres cache corrompu.
 * Les caches sont vides et le service worker desinscrit ; la progression,
 * stockee dans IndexedDB, n est pas touchee.
 */
export async function recoverFromCorruptedCache(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    const registrations = await navigator.serviceWorker?.getRegistrations?.();
    for (const entry of registrations ?? []) await entry.unregister();
  } catch (error) {
    console.warn('Nettoyage du cache impossible :', error);
  }
  window.location.reload();
}

export async function serviceWorkerStatus(): Promise<{
  state: string;
  scope: string | undefined;
  caches: string[];
  precached: number;
}> {
  if (!('serviceWorker' in navigator)) {
    return { state: 'non supporte par ce navigateur', scope: undefined, caches: [], precached: 0 };
  }
  const current = registration ?? (await navigator.serviceWorker.getRegistration());
  let keys: string[] = [];
  let precached = 0;
  try {
    keys = 'caches' in window ? await caches.keys() : [];
    const active = keys.find((key) => key.startsWith('tssr-neo-'));
    if (active !== undefined) precached = (await (await caches.open(active)).keys()).length;
  } catch {
    keys = [];
  }
  return {
    state:
      current === undefined ? 'non enregistre' : (current.active?.state ?? 'installation en cours'),
    scope: current?.scope,
    caches: keys,
    precached,
  };
}
