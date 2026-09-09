import {
  MemoryStorageAdapter,
  STORE_NAMES,
  type StorageAdapter,
  type StoreName,
} from './adapter.ts';

const DB_NAME = 'tssr-neo';
const DB_VERSION = 1;

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('erreur IndexedDB'));
  });
}

/** Stockage local principal. Toute ecriture est transactionnelle. */
export class IndexedDbStorageAdapter implements StorageAdapter {
  private db: IDBDatabase | undefined;

  static isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const name of STORE_NAMES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('ouverture IndexedDB impossible'));
    });
    return this.db;
  }

  private async transaction<T>(
    store: StoreName,
    mode: IDBTransactionMode,
    run: (objectStore: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const request = run(tx.objectStore(store));
      let value: T;
      request.onsuccess = () => {
        value = request.result;
      };
      // On attend la fin de la transaction : une ecriture partielle ne doit jamais etre visible.
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error ?? new Error('transaction IndexedDB echouee'));
      tx.onabort = () => reject(tx.error ?? new Error('transaction IndexedDB annulee'));
    });
  }

  async get<T>(store: StoreName, key: string): Promise<T | undefined> {
    return this.transaction<T | undefined>(
      store,
      'readonly',
      (objectStore) => objectStore.get(key) as IDBRequest<T | undefined>,
    );
  }

  async put<T>(store: StoreName, key: string, value: T): Promise<void> {
    await this.transaction(store, 'readwrite', (objectStore) => objectStore.put(value, key));
  }

  async delete(store: StoreName, key: string): Promise<void> {
    await this.transaction(store, 'readwrite', (objectStore) => objectStore.delete(key));
  }

  async keys(store: StoreName): Promise<string[]> {
    const db = await this.open();
    const request = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
    const keys = await requestToPromise(request);
    return keys.map((k) => String(k)).sort();
  }

  async clear(store: StoreName): Promise<void> {
    await this.transaction(store, 'readwrite', (objectStore) => objectStore.clear());
  }

  async usage(): Promise<Record<StoreName, number>> {
    const result = {} as Record<StoreName, number>;
    const db = await this.open();
    for (const name of STORE_NAMES) {
      const values = await requestToPromise(
        db.transaction(name, 'readonly').objectStore(name).getAll(),
      );
      result[name] = values.reduce(
        (sum: number, value: unknown) => sum + JSON.stringify(value).length,
        0,
      );
    }
    return result;
  }
}

/** Choisit le meilleur support disponible sans jamais faire echouer le demarrage. */
export async function createStorage(): Promise<StorageAdapter> {
  if (!IndexedDbStorageAdapter.isAvailable()) return new MemoryStorageAdapter();
  try {
    const adapter = new IndexedDbStorageAdapter();
    await adapter.keys('progress');
    return adapter;
  } catch {
    // Navigation privee ou stockage bloque : on continue en memoire plutot que d echouer.
    return new MemoryStorageAdapter();
  }
}
