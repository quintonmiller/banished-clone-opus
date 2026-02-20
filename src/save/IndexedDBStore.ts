import { SaveData, IDB_NAME, IDB_VERSION, IDB_STORE, IDB_SAVE_KEY } from './SaveTypes';

/**
 * Low-level IndexedDB wrapper. All methods resolve (never reject) —
 * callers check return values to detect failure.
 */
export class IndexedDBStore {
  private db: IDBDatabase | null = null;

  /** Open (or create) the database. Idempotent — safe to call multiple times. */
  init(): Promise<boolean> {
    if (this.db) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      try {
        const request = indexedDB.open(IDB_NAME, IDB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
          }
        };

        request.onsuccess = () => {
          this.db = request.result;
          resolve(true);
        };

        request.onerror = () => {
          console.warn('IndexedDB open failed:', request.error);
          resolve(false);
        };
      } catch (e) {
        console.warn('IndexedDB not available:', e);
        resolve(false);
      }
    });
  }

  /** Store save data (structured clone — no JSON.stringify needed). */
  save(data: SaveData): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (!this.db) { resolve(false); return; }
      try {
        const tx = this.db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const request = store.put(data, IDB_SAVE_KEY);
        request.onsuccess = () => resolve(true);
        request.onerror = () => {
          console.warn('IndexedDB save failed:', request.error);
          resolve(false);
        };
      } catch (e) {
        console.warn('IndexedDB save error:', e);
        resolve(false);
      }
    });
  }

  /** Load save data, or null if not found / on error. */
  load(): Promise<SaveData | null> {
    return new Promise<SaveData | null>((resolve) => {
      if (!this.db) { resolve(null); return; }
      try {
        const tx = this.db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const request = store.get(IDB_SAVE_KEY);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => {
          console.warn('IndexedDB load failed:', request.error);
          resolve(null);
        };
      } catch (e) {
        console.warn('IndexedDB load error:', e);
        resolve(null);
      }
    });
  }

  /** Generic put — store any structured-cloneable value under a string key. */
  putItem(key: string, data: any): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (!this.db) { resolve(false); return; }
      try {
        const tx = this.db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const request = store.put(data, key);
        request.onsuccess = () => resolve(true);
        request.onerror = () => {
          console.warn('IndexedDB putItem failed:', request.error);
          resolve(false);
        };
      } catch (e) {
        console.warn('IndexedDB putItem error:', e);
        resolve(false);
      }
    });
  }

  /** Generic get — retrieve a value by key, or null if missing. */
  getItem(key: string): Promise<any | null> {
    return new Promise<any | null>((resolve) => {
      if (!this.db) { resolve(null); return; }
      try {
        const tx = this.db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => {
          console.warn('IndexedDB getItem failed:', request.error);
          resolve(null);
        };
      } catch (e) {
        console.warn('IndexedDB getItem error:', e);
        resolve(null);
      }
    });
  }

  /** Delete the save slot. */
  delete(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (!this.db) { resolve(false); return; }
      try {
        const tx = this.db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const request = store.delete(IDB_SAVE_KEY);
        request.onsuccess = () => resolve(true);
        request.onerror = () => {
          console.warn('IndexedDB delete failed:', request.error);
          resolve(false);
        };
      } catch (e) {
        console.warn('IndexedDB delete error:', e);
        resolve(false);
      }
    });
  }
}
