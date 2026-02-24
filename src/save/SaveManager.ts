import type { Game } from '../Game';
import { SaveData, SaveMetadata, SAVE_VERSION, SAVE_KEY } from './SaveTypes';
import { IndexedDBStore } from './IndexedDBStore';
import { Settings } from '../Settings';

export class SaveManager {
  private idb = new IndexedDBStore();
  private idbReady = false;
  private metadataCache: SaveMetadata = { exists: false };

  /** Open IDB, migrate any localStorage save, warm metadata cache. */
  async init(): Promise<void> {
    this.idbReady = await this.idb.init();

    // Reconcile: always prefer the most recent save between IDB and localStorage.
    // This handles the common case where beforeunload wrote a newer save to
    // localStorage (sync) after the last async IDB save.
    if (this.idbReady) {
      const idbData = await this.idb.load();
      const lsData = this.loadFromLocalStorage();

      if (lsData) {
        if (!idbData || lsData.savedAt > idbData.savedAt) {
          // localStorage is newer (or IDB is empty) — promote to IDB
          const ok = await this.idb.save(lsData);
          if (ok) {
            localStorage.removeItem(SAVE_KEY);
          }
        } else {
          // IDB is already up-to-date — discard stale localStorage copy
          localStorage.removeItem(SAVE_KEY);
        }
      }
    }

    // Also migrate settings to IDB
    if (this.idbReady) {
      await Settings.initFromIDB(this.idb);
    }

    await this.refreshMetadataCache();
  }

  // --------------- Serialization (unchanged logic) ---------------

  serialize(game: Game): SaveData {
    const s = game.state;

    return {
      version: SAVE_VERSION,
      savedAt: Date.now(),
      seed: game.seed,

      gameState: {
        tick: s.tick,
        year: s.year,
        subSeason: s.subSeason,
        tickInSubSeason: s.tickInSubSeason,
        speed: s.speed,
        paused: s.paused,
        population: s.population,
        totalDeaths: s.totalDeaths,
        totalBirths: s.totalBirths,
        gameOver: s.gameOver,
        dayProgress: s.dayProgress,
        isNight: s.isNight,
        isDusk: s.isDusk,
        isDawn: s.isDawn,
        nightAlpha: s.nightAlpha,
        resourceLimits: { ...s.resourceLimits },
        fairBonuses: { ...s.fairBonuses },
      },

      globalResources: [...game.resources.globalResources],
      mineVeinState: game.getMineVeinStateSnapshot(),
      rngState: game.rng.getState(),

      tiles: game.tileMap.tiles.map(t => [
        t.type,
        t.trees,
        Math.round(t.fertility * 100) / 100,
        Math.round(t.elevation * 100) / 100,
        t.occupied ? 1 : 0,
        t.buildingId,
        t.stoneAmount,
        t.ironAmount,
        t.blocksMovement ? 1 : 0,
        t.berries,
        t.mushrooms,
        t.herbs,
        t.fish,
        t.wildlife,
      ] as [number, number, number, number, number, number | null, number, number, number, number, number, number, number, number]),

      world: game.world.serialize(),

      eventLog: game.uiManager.getEventLog().getEntries(),

      camera: {
        x: game.camera.x,
        y: game.camera.y,
        zoom: game.camera.zoom,
      },

      systems: {
        weather: game.weatherSystem.getInternalState(),
        trade: game.tradeSystem.getInternalState(),
        environment: game.environmentSystem.getInternalState(),
        production: game.productionSystem.getInternalState(),
        citizenAI: game.citizenAI.getInternalState(),
        disease: game.diseaseSystem.getInternalState(),
        population: game.populationSystem.getInternalState(),
        storage: game.storageSystem.getInternalState(),
        particle: game.particleSystem.getInternalState(),
        festival: game.festivalSystem.getInternalState(),
        livestock: game.livestockSystem.getInternalState(),
        milestone: game.milestoneSystem.getInternalState(),
      },
    };
  }

  // --------------- Async save (IDB primary, localStorage fallback) ---------------

  async saveGame(game: Game): Promise<boolean> {
    try {
      const data = this.serialize(game);

      if (this.idbReady) {
        const ok = await this.idb.save(data);
        if (ok) {
          this.updateMetadataFromData(data);
          return true;
        }
      }

      // Fallback to localStorage
      return this.saveToLocalStorage(data);
    } catch (e) {
      console.error('Failed to save game:', e);
      return false;
    }
  }

  // --------------- Sync save (localStorage only — for beforeunload) ---------------

  saveSync(game: Game): boolean {
    try {
      const data = this.serialize(game);
      return this.saveToLocalStorage(data);
    } catch (e) {
      console.error('Failed to sync-save game:', e);
      return false;
    }
  }

  // --------------- Load (try IDB first, fall back to localStorage) ---------------

  async loadGame(): Promise<SaveData | null> {
    try {
      if (this.idbReady) {
        const data = await this.idb.load();
        if (data) {
          if (data.version !== SAVE_VERSION) {
            console.warn('Save version mismatch:', data.version, '!=', SAVE_VERSION);
            return null;
          }
          return data;
        }
      }

      // Fallback to localStorage
      return this.loadFromLocalStorage();
    } catch (e) {
      console.error('Failed to load save:', e);
      return null;
    }
  }

  // --------------- Delete (both stores) ---------------

  async deleteSave(): Promise<void> {
    if (this.idbReady) {
      await this.idb.delete();
    }
    localStorage.removeItem(SAVE_KEY);
    this.metadataCache = { exists: false };
  }

  // --------------- Metadata (sync, from cache) ---------------

  getSaveMetadata(): SaveMetadata {
    return this.metadataCache;
  }

  async refreshMetadataCache(): Promise<void> {
    // Try IDB first
    if (this.idbReady) {
      const data = await this.idb.load();
      if (data) {
        this.updateMetadataFromData(data);
        return;
      }
    }

    // Fall back to localStorage
    const lsData = this.loadFromLocalStorage();
    if (lsData) {
      this.updateMetadataFromData(lsData);
    } else {
      this.metadataCache = { exists: false };
    }
  }

  // --------------- Private helpers ---------------

  private updateMetadataFromData(data: SaveData): void {
    this.metadataCache = {
      exists: true,
      year: data.gameState.year,
      population: data.gameState.population,
      savedAt: data.savedAt,
    };
  }

  private saveToLocalStorage(data: SaveData): boolean {
    try {
      const json = JSON.stringify(data);
      localStorage.setItem(SAVE_KEY, json);
      this.updateMetadataFromData(data);
      return true;
    } catch (e) {
      console.error('localStorage save failed:', e);
      return false;
    }
  }

  private loadFromLocalStorage(): SaveData | null {
    try {
      const json = localStorage.getItem(SAVE_KEY);
      if (!json) return null;
      const data = JSON.parse(json) as SaveData;
      if (data.version !== SAVE_VERSION) {
        console.warn('Save version mismatch:', data.version, '!=', SAVE_VERSION);
        return null;
      }
      return data;
    } catch (e) {
      console.error('localStorage load failed:', e);
      return null;
    }
  }
}
