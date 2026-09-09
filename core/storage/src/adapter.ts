/** Contrat de stockage cle-valeur, independant du support (memoire, IndexedDB). */
export interface StorageAdapter {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  put<T>(store: StoreName, key: string, value: T): Promise<void>;
  delete(store: StoreName, key: string): Promise<void>;
  keys(store: StoreName): Promise<string[]>;
  clear(store: StoreName): Promise<void>;
  /** Taille approximative utilisee, en octets, par magasin. */
  usage(): Promise<Record<StoreName, number>>;
}

/**
 * Magasins separes par criticite.
 * La progression est prioritaire : les caches reconstructibles sont purges en premier.
 */
export const STORE_NAMES = ['saves', 'snapshots', 'labs', 'progress', 'modules', 'cache'] as const;
export type StoreName = (typeof STORE_NAMES)[number];

/** Ordre de purge quand le stockage est sature : du plus reconstructible au plus precieux. */
export const EVICTION_ORDER: StoreName[] = ['cache', 'modules', 'labs', 'snapshots', 'saves', 'progress'];

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly stores = new Map<StoreName, Map<string, unknown>>();

  private store(name: StoreName): Map<string, unknown> {
    let store = this.stores.get(name);
    if (!store) {
      store = new Map<string, unknown>();
      this.stores.set(name, store);
    }
    return store;
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this.store(store).get(key) as T | undefined;
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    this.store(store).set(key, structuredClone(value));
  }

  async delete(store: StoreName, key: string): Promise<void> {
    this.store(store).delete(key);
  }

  async keys(store: StoreName): Promise<string[]> {
    return [...this.store(store).keys()].sort();
  }

  async clear(store: StoreName): Promise<void> {
    this.store(store).clear();
  }

  async usage(): Promise<Record<StoreName, number>> {
    const result = {} as Record<StoreName, number>;
    for (const name of STORE_NAMES) {
      let size = 0;
      for (const value of this.store(name).values()) size += JSON.stringify(value).length;
      result[name] = size;
    }
    return result;
  }
}
