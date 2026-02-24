import { TileType, ResourceType, BuildingType, BuildingCategory, Profession, Season } from './constants';

export type EntityId = number;

export type DoorSide = 'north' | 'south' | 'east' | 'west';
export interface DoorDef { dx: number; dy: number; side: DoorSide; }
export type Rotation = 0 | 1 | 2 | 3;

export interface TileData {
  type: TileType;
  trees: number;           // 0-5 tree density for forest tiles
  fertility: number;       // 0-1 soil fertility
  elevation: number;       // 0-1 height value
  occupied: boolean;       // is a building placed here
  buildingId: EntityId | null;
  stoneAmount: number;     // 0-50+ resource remaining in stone deposit
  ironAmount: number;      // 0-30+ resource remaining in iron deposit
  blocksMovement: boolean; // does the building on this tile block NPC pathfinding
  // Harvestable map resources (depletable, regrowing)
  berries: number;         // 0-8 berry bushes
  mushrooms: number;       // 0-5 mushroom patches
  herbs: number;           // 0-3 herb plants
  fish: number;            // 0-8 fish population
  wildlife: number;        // 0-3 wildlife density
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
  blocksMovement?: boolean; // defaults to true; false for open-area buildings (fields, stockpiles)
  doorDef?: DoorDef;
  flexible?: boolean;       // enables drag-to-resize placement
  minWidth?: number;        // minimum drag dimension (default FLEXIBLE_MIN_SIZE)
  minHeight?: number;
  maxWidth?: number;        // maximum drag dimension (default FLEXIBLE_MAX_SIZE)
  maxHeight?: number;
  // ── Upgrade system ───────────────────────────────────────────
  upgradesTo?: BuildingType;     // this building can be upgraded to that type
  upgradeFrom?: BuildingType;    // this is a tier-2 building upgraded from that base
  upgradeCostLog?: number;
  upgradeCostStone?: number;
  upgradeCostIron?: number;
  upgradeWork?: number;          // total work units required
  upgradeSizeW?: number;         // new width if the footprint expands
  upgradeSizeH?: number;         // new height if the footprint expands
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
  huntingRate: number;
  fishingRate: number;
  herbRate: number;
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
  placingRotation: Rotation;
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
  // Fair knowledge bonuses (timed buffs from fair rewards)
  fairBonuses: Record<string, { value: number; expiryTick: number }>;
  // Global resource limits: keyed by building type or resource name, value = max stock
  resourceLimits: Record<string, number>;
}

export type FestivalType = 'planting_day' | 'midsummer' | 'harvest_festival' | 'frost_fair';
export type FestivalPhase = 'main' | 'gathering' | 'flourish' | 'summary';

export type FairActivity =
  // Generic activities
  | 'dancing' | 'arm_wrestling' | 'storytelling' | 'juggling'
  | 'singing' | 'feasting' | 'games' | 'drinking'
  // Spring-specific
  | 'seed_trading' | 'flower_crowns'
  // Summer-specific
  | 'bonfire_dancing' | 'foot_race'
  // Autumn-specific
  | 'pie_contest' | 'apple_bobbing'
  // Winter-specific
  | 'ice_carving' | 'snowball_fight'
  // Group activities
  | 'group_race' | 'group_dance' | 'scavenger_hunt' | 'tug_of_war' | 'parade';

export type FairGroupType = 'race' | 'group_dance' | 'feast_circle' | 'tug_of_war' | 'parade' | 'scavenger_hunt';

export interface FairGroupActivity {
  id: number;
  type: FairGroupType;
  memberIds: EntityId[];
  phase: 'assembling' | 'active' | 'finished';
  phaseTick: number;
  waypoints: { x: number; y: number }[];
  waypointIndex: Record<number, number>;
  startTick: number;
  durationTicks: number;
}

export interface FairSeasonStats {
  babiesBorn: number;
  couplesMet: number;
  couplesMarried: number;
  newCitizens: number;
  buildingsCompleted: number;
  buildingsUpgraded: number;
  citizensDied: number;
  resourcesGathered: number;
}

export type FairRewardCategory = 'building' | 'traveler' | 'knowledge' | 'resources';

export interface FairRewardDef {
  id: string;
  name: string;
  description: string;
  flavorText: string;
  category: FairRewardCategory;
  weight: number;
  condition?: (game: any) => boolean;
  applyFn: string;
  festivalTypes?: FestivalType[];
  icon: string;
}

export interface FestivalState {
  type: FestivalType;
  ticksRemaining: number;
  townHallId: EntityId;
  /** Active buff applied for the rest of the season after the festival */
  activeEffect: FestivalType | null;
  /** Fair phase state machine */
  phase: FestivalPhase;
  /** Total ticks for the fair (used for phase timing) */
  totalTicks: number;
  /** Season stats snapshot at fair start (for delta display) */
  seasonStatsAtStart: FairSeasonStats;
  /** Entity IDs of temporary fair visitors */
  fairVisitorIds: EntityId[];
  /** Chosen reward ID (set when player picks) */
  chosenReward: string | null;
  /** 3 reward options presented to the player */
  rewardOptions: string[];
  /** Per-citizen activity assignments during the fair */
  fairActivities: Record<number, FairActivity>;
  /** Village prosperity score (0-1) at time of fair, used for reward scaling */
  prosperity: number;
  /** Active group activities during the fair */
  fairGroups: FairGroupActivity[];
  /** Next group ID counter */
  fairGroupNextId: number;
}

export interface EventLogEntry {
  id: number;
  tick: number;
  year: number;
  subSeason: number;
  category: string;
  text: string;
  repeatCount?: number;
  color: string;
  entityId?: number;
  tileX?: number;
  tileY?: number;
}

export interface CitizenRenderData {
  id: EntityId; x: number; y: number; isMale: boolean;
  isChild: boolean; health: number; isSleeping: boolean; isSick: boolean;
  isChatting: boolean; activity: string; isPregnant: boolean;
}

export interface TravelerRenderData {
  id: EntityId;
  x: number;
  y: number;
  travelType: 'pass_through' | 'work_seekers' | 'settler_family';
}

export interface BuildingRenderData {
  id: EntityId; x: number; y: number; w: number; h: number;
  category: string; completed: boolean; progress: number; name: string;
  type: string; isValidTarget?: boolean; isFullOrInvalid?: boolean;
  cropStage?: number; doorDef?: DoorDef;
  storageVisual?: {
    usesGlobalEstimate: boolean;
    fillRatio: number;
    unitsPerIcon: number;
    icons: Array<{ resource: string; label: string; color: string }>;
  };
  occupants?: Array<{ isMale: boolean; isChild: boolean }>;
  mineVeinRatio?: number; // 0-1 remaining vein ratio for QUARRY/MINE
  isUpgrading?: boolean;
  upgradeProgress?: number; // 0-1
  warmthLevel?: number; // for heated buildings — drives night glow
}
