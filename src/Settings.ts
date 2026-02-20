import type { IndexedDBStore } from './save/IndexedDBStore';
import { IDB_SETTINGS_KEY } from './save/SaveTypes';

const SETTINGS_KEY = 'exiled_settings';

export interface SettingsData {
  cameraPanSpeed: number; // pixels per second (default 400)
  edgePanEnabled: boolean; // pan camera when mouse near screen edges
  zoomSpeed: number; // scroll zoom multiplier (default 0.1)
  uiScale: number; // UI scale factor (default 1.0)
}

const DEFAULTS: SettingsData = {
  cameraPanSpeed: 400,
  edgePanEnabled: false,
  zoomSpeed: 0.1,
  uiScale: 1.0,
};

class SettingsStore {
  private data: SettingsData;
  private idb: IndexedDBStore | null = null;

  constructor() {
    this.data = { ...DEFAULTS };
    this.loadSync();
  }

  /**
   * Late-bind an IndexedDB store for async persistence.
   * Loads settings from IDB (if present) and merges into in-memory data.
   * After this call, every `set()` also writes to IDB.
   */
  async initFromIDB(idb: IndexedDBStore): Promise<void> {
    this.idb = idb;
    try {
      const stored = await idb.getItem(IDB_SETTINGS_KEY);
      if (stored && typeof stored === 'object') {
        this.mergeInto(stored);
        // Sync localStorage with IDB values
        this.saveSync();
      } else {
        // No IDB settings yet — seed from current in-memory data
        await idb.putItem(IDB_SETTINGS_KEY, { ...this.data });
      }
    } catch { /* ignore — localStorage fallback still works */ }
  }

  get<K extends keyof SettingsData>(key: K): SettingsData[K] {
    return this.data[key];
  }

  set<K extends keyof SettingsData>(key: K, value: SettingsData[K]): void {
    this.data[key] = value;
    this.saveSync();
    // Fire-and-forget IDB write
    this.idb?.putItem(IDB_SETTINGS_KEY, { ...this.data });
  }

  getAll(): Readonly<SettingsData> {
    return this.data;
  }

  /** Sync load from localStorage (used at construction time). */
  private loadSync(): void {
    try {
      const json = localStorage.getItem(SETTINGS_KEY);
      if (json) {
        this.mergeInto(JSON.parse(json));
      }
    } catch { /* ignore corrupt data */ }
  }

  /** Sync write to localStorage. */
  private saveSync(): void {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.data));
    } catch { /* ignore quota errors */ }
  }

  /** Merge a partial object into this.data, validating types against DEFAULTS. */
  private mergeInto(parsed: any): void {
    for (const key of Object.keys(DEFAULTS) as (keyof SettingsData)[]) {
      if (key in parsed && typeof parsed[key] === typeof DEFAULTS[key]) {
        (this.data as any)[key] = parsed[key];
      }
    }
  }
}

/** Global singleton — import and use anywhere */
export const Settings = new SettingsStore();
