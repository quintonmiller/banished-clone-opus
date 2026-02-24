import { EventLogEntry } from '../types';

export const SAVE_VERSION = 4;
export const SAVE_KEY = 'exiled_game_save';

// IndexedDB constants
export const IDB_NAME = 'exiled_game_db';
export const IDB_VERSION = 1;
export const IDB_STORE = 'saves';
export const IDB_SAVE_KEY = 'current'; // single-slot key within the object store
export const IDB_SETTINGS_KEY = 'settings'; // settings slot within the same store

export interface SaveMetadata {
  exists: boolean;
  year?: number;
  population?: number;
  savedAt?: number;
}

export interface SerializedWorld {
  nextId: number;
  entities: number[];
  components: Record<string, [number, any][]>;
}

export interface SaveData {
  version: number;
  savedAt: number;
  seed: number;

  // Game state (minus transient UI fields)
  gameState: {
    tick: number;
    year: number;
    subSeason: number;
    tickInSubSeason: number;
    speed: number;
    paused: boolean;
    population: number;
    totalDeaths: number;
    totalBirths: number;
    gameOver: boolean;
    dayProgress: number;
    isNight: boolean;
    isDusk: boolean;
    isDawn: boolean;
    nightAlpha: number;
    resourceLimits: Record<string, number>;
    fairBonuses: Record<string, { value: number; expiryTick: number }>;
  };

  globalResources: [string, number][];
  mineVeinState?: [string, { remaining: number; max: number }][];
  rngState: number;

  // Map tiles — compact tuple: [type, trees, fertility, elevation, occupied(0|1), buildingId, stone, iron, blocksMovement?(0|1), berries?, mushrooms?, herbs?, fish?, wildlife?]
  tiles: Array<[number, number, number, number, number, number | null, number, number, ...number[]]>;

  // ECS world
  world: SerializedWorld;

  // Camera position
  camera: { x: number; y: number; zoom: number };

  // Event log
  eventLog?: EventLogEntry[];

  // System internal state
  systems: {
    weather: { tickCounter: number; currentWeather: string; weatherTimer: number };
    trade: { merchant: any; lastVisit: number };
    environment: { scanIndex: number; buildingDecayCounter: number };
    production: { foresterTimers: [number, { replant: number; grow: number }][] };
    citizenAI: { tickCounter: number };
    disease: { tickCounter: number };
    population: { tickCounter: number };
    storage: { tickCounter: number };
    particle: { tickCounter: number };
    festival: { celebrated: number[]; seasonStats?: any };
    livestock?: { livestock: [number, any][] };
    milestone?: { achieved: string[]; bonuses: [string, number][]; lastNarrativeTick: number; deathsBeforeFirstWinter: number; passedFirstWinter: boolean };
  };
}
