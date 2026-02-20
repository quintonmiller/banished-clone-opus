import { TileType, ResourceType, BuildingType, BuildingCategory, Profession, Season } from './constants';

export type EntityId = number;

export interface TileData {
  type: TileType;
  trees: number;           // 0-5 tree density for forest tiles
  fertility: number;       // 0-1 soil fertility
  elevation: number;       // 0-1 height value
  occupied: boolean;       // is a building placed here
  buildingId: EntityId | null;
  stoneAmount: number;     // 0-50+ resource remaining in stone deposit
  ironAmount: number;      // 0-30+ resource remaining in iron deposit
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  category: BuildingCategory;
  width: number;
  height: number;
  costLog: number;
  costStone: number;
  costIron: number;
  maxWorkers: number;
  workRadius: number;
  constructionWork: number; // total work units to build
  description: string;
  requiresWater?: boolean;
  requiresForest?: boolean;
  isStorage?: boolean;
  storageCapacity?: number;
  residents?: number; // max residents for houses
}

export interface RecipeDef {
  buildingType: BuildingType;
  inputs: Partial<Record<ResourceType, number>>;
  outputs: Partial<Record<ResourceType, number>>;
  cooldownTicks: number;
  seasonalMultiplier?: boolean;
  gatherFromRadius?: boolean;
}

export interface SeasonData {
  name: string;
  temperature: number;
  cropGrowth: number;
  gatheringRate: number;
  snow: boolean;
  dayLength: number; // 0-1 multiplier
}

export interface ProfessionDef {
  type: Profession;
  name: string;
  tool: boolean; // requires a tool
}

export interface Inventory {
  items: Map<ResourceType, number>;
  capacity: number;
}

export interface GameState {
  tick: number;
  year: number;
  subSeason: Season;
  tickInSubSeason: number;
  speed: number;
  paused: boolean;
  population: number;
  totalDeaths: number;
  totalBirths: number;
  selectedEntity: EntityId | null;
  placingBuilding: BuildingType | null;
  gameOver: boolean;
  // Day/night cycle
  dayProgress: number;  // 0..1 within a single day
  isNight: boolean;
  isDusk: boolean;
  isDawn: boolean;
  nightAlpha: number;   // 0..1 darkness level for rendering
  // Worker assignment mode
  assigningWorker: EntityId | null;
  // Festival state
  festival: FestivalState | null;
}

export type FestivalType = 'planting_day' | 'midsummer' | 'harvest_festival' | 'frost_fair';

export interface FestivalState {
  type: FestivalType;
  ticksRemaining: number;
  townHallId: EntityId;
  /** Active buff applied for the rest of the season after the festival */
  activeEffect: FestivalType | null;
}

export interface EventLogEntry {
  id: number;
  tick: number;
  year: number;
  subSeason: number;
  category: string;
  text: string;
  color: string;
  entityId?: number;
  tileX?: number;
  tileY?: number;
}
