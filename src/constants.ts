// Map
export const MAP_WIDTH = 200;
export const MAP_HEIGHT = 200;
export const TILE_SIZE = 32;

// Rendering
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3.0;
export const DEFAULT_ZOOM = 1.0;

// Camera
export const CAMERA_PAN_SPEED = 400; // pixels per second
export const EDGE_PAN_MARGIN = 20; // pixels from edge
export const ZOOM_SPEED = 0.1;

// Game loop
export const TICK_RATE = 10; // simulation ticks per second
export const TICK_DURATION = 1000 / TICK_RATE; // ms per tick

// Time / Seasons
export const TICKS_PER_SUB_SEASON = 600; // 60 game-seconds × 10 ticks/sec
export const SUB_SEASONS_PER_YEAR = 12;
export const TICKS_PER_YEAR = TICKS_PER_SUB_SEASON * SUB_SEASONS_PER_YEAR;
export const DAYS_PER_YEAR = 120; // calendar days per year (30 per season)

// Day/night cycle
export const TICKS_PER_DAY = 1800; // 180 seconds = 3 minutes per full day/night cycle at 1x
export const DAWN_START = 0.2;   // fraction of day when dawn begins
export const DUSK_START = 0.75;  // fraction of day when dusk begins
export const NIGHT_DARKNESS = 0.55; // max darkness alpha at midnight

// Citizens
export const STARTING_ADULTS = 5;
export const STARTING_CHILDREN = 2;
export const CITIZEN_SPEED = 1.5; // tiles per second
export const CHILD_AGE = 10; // game-years
export const OLD_AGE = 60;
export const YEARS_PER_REAL_YEAR = 5;

// Movement speed modifiers
export const ROAD_SPEED_MULT = 2.0;
export const FOREST_SPEED_MULT = 0.6;
export const DEFAULT_SPEED_MULT = 1.0;

// Needs (0..100)
export const FOOD_DECAY_PER_TICK = 0.045; // citizen eats ~2-3 meals per day
export const WARMTH_DECAY_PER_TICK = 0.03; // faster in winter (multiplied by temp factor)
export const HEALTH_DECAY_PER_TICK = 0.005;
export const HAPPINESS_DECAY_PER_TICK = 0.003;
export const STARVATION_HEALTH_DAMAGE = 0.08;
export const FREEZING_HEALTH_DAMAGE = 0.06;

// Energy (0..100) — drains while awake, recovers while sleeping
export const ENERGY_DECAY_PER_TICK = 0.06;    // ~97 drained over a long summer day (1620 ticks)
export const ENERGY_RECOVERY_PER_TICK = 0.55;  // ~99 recovered in a short summer night (180 ticks)
export const TIRED_THRESHOLD = 20;             // go sleep even during daytime if below this

// Meals
export const MEAL_FOOD_THRESHOLD = 65;  // citizen seeks food when food level drops below this
export const MEAL_RESTORE = 30;         // food points restored per meal
export const MEAL_COST = 3;             // food units consumed from global supply per meal
export const STARVING_THRESHOLD = 15;   // urgent food seeking overrides everything

// Tool/Coat wear
export const TOOL_WEAR_PER_TICK = 0.0002;   // ~1 tool consumed per ~5000 ticks (~7 min real at 1x)
export const COAT_WEAR_PER_TICK = 0.00008;   // ~1 coat consumed per ~12500 ticks
export const NO_TOOL_PRODUCTION_MULT = 0.5;  // 50% production without tools
export const NO_COAT_WARMTH_MULT = 2.0;      // 2x warmth decay without coat

// Starting resources
export const STARTING_RESOURCES = {
  log: 150,
  stone: 50,
  iron: 20,
  tool: 8,
  coat: 7,
  firewood: 80,
  food: 300, // enough for ~7 days while first food buildings go up
};

// Population
export const MARRIAGE_MIN_AGE = 18;            // minimum age for marriage
export const FERTILITY_MAX_AGE = 55;           // maximum age for conception
export const MAX_CHILDREN_PER_COUPLE = 3;      // max children per family
export const BIRTH_CHANCE = 0.03;              // birth chance per 100-tick check
export const OLD_AGE_DEATH_CHANCE_PER_YEAR = 0.02; // death chance multiplier per year over OLD_AGE
export const NEWBORN_NEEDS = 80;               // starting needs values for newborns
export const ADULT_SPAWN_AGE_MIN = 18;         // min age for spawned adults
export const ADULT_SPAWN_AGE_MAX = 30;         // max age for spawned adults
export const FAMILY_CHECK_INTERVAL = 100;      // ticks between family/birth/worker checks

// Pregnancy
export const PREGNANCY_DURATION_TICKS = 5400;           // 9 sub-seasons (game months) at 600 ticks each
export const TRIMESTER_1_END = 1800;                     // end of first trimester (ticks)
export const TRIMESTER_2_END = 3600;                     // end of second trimester (ticks)
export const CONCEPTION_CHANCE_PARTNER = 0.03;           // conception chance per check for partnered couples
export const CONCEPTION_CHANCE_NON_PARTNER = 0.005;      // conception chance for non-partnered male+female in same house
// Trimester 1 modifiers (months 1-3)
export const T1_FOOD_DECAY_MULT = 1.15;                 // 15% more food consumption
export const T1_ENERGY_DECAY_MULT = 1.0;                // no energy change
export const T1_SPEED_MULT = 1.0;                       // no speed change
// Trimester 2 modifiers (months 4-6)
export const T2_FOOD_DECAY_MULT = 1.3;                  // 30% more food consumption
export const T2_ENERGY_DECAY_MULT = 1.15;               // 15% faster energy drain
export const T2_SPEED_MULT = 0.85;                      // 15% speed reduction
// Trimester 3 modifiers (months 7-9)
export const T3_FOOD_DECAY_MULT = 1.5;                  // 50% more food consumption
export const T3_ENERGY_DECAY_MULT = 1.3;                // 30% faster energy drain
export const T3_SPEED_MULT = 0.65;                      // 35% speed reduction
export const PREGNANT_MEAL_THRESHOLD_BOOST = 10;         // pregnant women seek food 10 points earlier

// Nomads
export const NOMAD_CHECK_INTERVAL = 500;       // ticks between nomad arrival checks
export const NOMAD_BASE_CHANCE = 0.01;         // chance per check (~once every ~1-2 years)
export const NOMAD_DISEASE_CHANCE = 0.15;      // 15% chance nomads bring disease
export const NOMAD_MIN_COUNT = 2;              // min nomads per arrival
export const NOMAD_MAX_COUNT = 5;              // max nomads per arrival
export const NOMAD_EDGE_MARGIN = 20;           // min distance from map corners for spawn
export const NOMAD_SPAWN_SEARCH_RADIUS = 10;   // search radius for walkable spawn tile
export const NOMAD_SCATTER_RANGE = 2;          // random offset between individual nomads

// Citizen AI
export const AI_TICK_INTERVAL = 5;             // AI runs every N ticks
export const STUCK_THRESHOLD = 50;             // AI cycles before forced wander
export const FREEZING_WARMTH_THRESHOLD = 25;   // warmth level that triggers "freezing"
export const EMERGENCY_SLEEP_ENERGY = 5;       // energy below which homeless citizens sleep anywhere
export const CHAT_HAPPINESS_GAIN = 0.5;        // happiness gained from chatting
export const HOME_WARMTH_GAIN = 0.1;           // warmth restored per tick at home

// Wander behavior
export const WANDER_ATTEMPTS = 3;              // pathfinding attempts for normal wander
export const WANDER_RANGE = 6;                 // max tile offset for normal wander
export const FORCE_WANDER_ATTEMPTS = 8;        // pathfinding attempts for forced wander
export const FORCE_WANDER_RANGE = 15;          // max tile offset for forced wander
export const FORCE_WANDER_MIN_DIST = 3;        // minimum wander distance for forced wander
export const CITIZEN_SPAWN_OFFSET = 3;         // random offset when spawning starting citizens

// Construction
// Formula: ticks = constructionWork / (numWorkers * CONSTRUCTION_WORK_RATE)
// At 1800 ticks/day: a house (250 work) with 3 workers = 2778 ticks ≈ 1.5 days
export const CONSTRUCTION_WORK_RATE = 0.03;    // base work per tick per worker
export const EDUCATED_CONSTRUCTION_BONUS = 0.015; // extra work rate per educated worker
export const INITIAL_HOUSE_WARMTH = 50;        // warmth level when house is first built

// Production
export const EDUCATION_BONUS = 1.5;
export const FOREST_EFFICIENCY_DIVISOR = 50;   // forestCount / this = efficiency (max 1)

// Needs thresholds
export const SLEEP_FOOD_DECAY_MULT = 0.5;      // food decays at half rate while sleeping
export const WARM_WEATHER_TEMP = 15;            // temperature above which warmth recovers
export const WARM_WEATHER_RECOVERY = 0.02;      // warmth recovery per tick in warm weather
export const COLD_WARMTH_DIVISOR = 10;          // temperature divisor for cold warmth multiplier
export const HOUSE_WARMTH_THRESHOLD = 30;       // min house warmth to reduce citizen warmth decay
export const HOUSE_WARMTH_DECAY_MULT = 0.2;     // warmth decay multiplier when in warm house
export const HOUSE_WARMTH_RECOVERY = 0.05;      // warmth recovery per tick in warm house
export const FREEZING_TEMP_THRESHOLD = 5;       // temperature below which freezing damages health
export const HEALTH_REGEN_FOOD_MIN = 50;        // min food for natural health regen
export const HEALTH_REGEN_WARMTH_MIN = 50;      // min warmth for natural health regen
export const HEALTH_REGEN_ENERGY_MIN = 30;      // min energy for natural health regen
export const HEALTH_REGEN_RATE = 0.005;         // natural health recovery rate per tick
export const HERB_USE_HEALTH_THRESHOLD = 80;    // health below which herbs are used
export const HERB_USE_CHANCE = 0.001;           // chance per tick to use an herb
export const HERB_HEALTH_RESTORE = 10;          // health restored per herb
export const OLD_AGE_HEALTH_DIVISOR = 20;       // health decay divisor for old age
export const UNHAPPY_FOOD_THRESHOLD = 30;       // food below this causes unhappiness
export const UNHAPPY_WARMTH_THRESHOLD = 30;     // warmth below this causes unhappiness
export const UNHAPPY_HEALTH_THRESHOLD = 50;     // health below this causes unhappiness
export const UNHAPPY_ENERGY_THRESHOLD = 15;     // energy below this causes unhappiness
export const UNHAPPINESS_RATE = 0.01;           // happiness lost per tick when conditions are bad
export const HAPPY_NEEDS_THRESHOLD = 70;        // food/warmth/health above this gains happiness
export const HAPPY_ENERGY_THRESHOLD = 50;       // energy above this gains happiness
export const HAPPINESS_GAIN_RATE = 0.005;       // happiness gained per tick when conditions are good

// Storage / Houses
export const STORAGE_CHECK_INTERVAL = 30;       // ticks between storage system checks
export const HOUSE_FIREWOOD_MIN = 10;           // firewood below this triggers restock
export const HOUSE_FIREWOOD_TARGET = 20;        // target firewood after restock
export const HOUSE_WARMTH_GAIN_FROM_FIRE = 2;   // warmth gained per storage tick when burning
export const HOUSE_FIREWOOD_CONSUMPTION = 0.05;  // firewood consumed per storage tick
export const HOUSE_WARMTH_LOSS_NO_FIRE = 5;     // warmth lost per storage tick without firewood
export const MARKET_HAPPINESS_GAIN = 0.5;        // happiness gained per storage tick from market

// Trade
export const MERCHANT_VISIT_INTERVAL_MULT = 0.8; // fraction of TICKS_PER_YEAR between visits
export const MERCHANT_ARRIVAL_CHANCE = 0.002;     // chance per tick once interval passed
export const MERCHANT_WARES_COUNT = 3;            // number of different wares merchant brings
export const MERCHANT_WARES_MIN = 20;             // min quantity per ware type
export const MERCHANT_WARES_MAX = 80;             // max quantity per ware type
export const MERCHANT_WANTS_COUNT = 2;            // number of resource types merchant wants
export const MERCHANT_WANTS_MIN = 30;             // min quantity merchant wants
export const MERCHANT_WANTS_MAX = 100;            // max quantity merchant wants
export const MERCHANT_STAY_DURATION = 600;        // ticks merchant stays (~60 seconds)

// Environment
export const ENVIRONMENT_TILES_PER_TICK = 200;    // tiles scanned per tick for regrowth
export const MAX_TREE_DENSITY = 5;                // maximum tree density level
export const FOREST_GROWTH_CHANCE = 0.0002;       // chance per tile per tick for density increase
export const BUILDING_DECAY_CHECK_INTERVAL = 10;  // ticks between building decay checks

// Disease (additional)
export const DISEASE_TICK_INTERVAL = 5;           // disease system runs every N ticks
export const DISEASE_ENERGY_DRAIN = 0.02;         // energy drained per tick while sick
export const DISEASE_MALNUTRITION_THRESHOLD = 30; // food below this multiplies disease chance
export const DISEASE_MALNUTRITION_MULT = 3;       // disease chance multiplier when malnourished
export const DISEASE_COLD_THRESHOLD = 30;         // warmth below this multiplies disease chance
export const DISEASE_COLD_MULT = 2;               // disease chance multiplier when cold
export const DISEASE_WEAK_THRESHOLD = 50;         // health below this multiplies disease chance
export const DISEASE_WEAK_MULT = 2;               // disease chance multiplier when unhealthy

// Weather (additional)
export const STORM_WARMTH_DRAIN = 0.05;           // extra warmth drain per tick during storm (outdoor)
export const HARSH_WINTER_WARMTH_DRAIN = 0.03;    // extra warmth drain per tick during harsh winter
export const STORM_CROP_WEATHER_MULT = 0.5;       // crop growth multiplier during storm

// Map generation
export const FOREST_DENSITY = 0.35;
export const STONE_DEPOSIT_CHANCE = 0.02;
export const IRON_DEPOSIT_CHANCE = 0.01;
export const RIVER_WIDTH = 3;
export const ELEVATION_NOISE_SCALE = 60;           // noise scale for elevation
export const MOISTURE_NOISE_SCALE = 40;            // noise scale for moisture
export const FOREST_NOISE_SCALE = 30;              // noise scale for forest distribution
export const WATER_ELEVATION_THRESHOLD = 0.25;     // elevation below this is water
export const FOREST_ELEVATION_MIN = 0.3;           // min elevation for forest
export const FERTILE_MOISTURE_THRESHOLD = 0.55;    // moisture above this is fertile ground
export const STONE_ELEVATION_THRESHOLD = 0.6;      // min elevation for stone/iron deposits
export const START_AREA_RADIUS = 10;               // tiles to clear around starting position
export const RIVER_START_POSITION = 0.3;           // fraction of map width for river X
export const RIVER_START_OFFSET = 20;              // random offset range for river start
export const START_LOCATION_SEARCH_RADIUS = 20;    // max search radius for starting location

// Particles
export const MAX_PARTICLES = 300;
export const PARTICLE_SPAWN_INTERVAL = 3;          // spawn new particles every N ticks
export const SMOKE_SPAWN_CHANCE = 0.3;             // chance per house per spawn interval
export const SMOKE_MIN_WARMTH = 20;                // min house warmth to produce smoke
export const SNOW_PARTICLES_PER_SPAWN = 3;         // snow particles spawned per interval
export const LEAF_SPAWN_CHANCE = 0.3;              // chance per spawn interval for falling leaves

// Pathfinding
export const PATH_CACHE_SIZE = 64;
export const MAX_PATHS_PER_TICK = 20;

// Road pathfinding cost (lower = preferred)
export const ROAD_PATH_COST = 0.5;
export const FOREST_PATH_COST = 1.8;
export const DEFAULT_PATH_COST = 1.0;

// Social
export const SOCIAL_CHAT_RADIUS = 3;           // tiles for citizens to notice each other
export const SOCIAL_CHAT_CHANCE = 0.02;        // chance per AI tick to start chatting
export const SOCIAL_CHAT_DURATION = 30;        // ticks spent chatting (3 seconds)
export const LONELINESS_THRESHOLD = 2000;      // ticks without social contact before loneliness
export const LONELINESS_HAPPINESS_PENALTY = -0.003; // per tick when lonely

// Weather events
export const WEATHER_CHECK_INTERVAL = 300;      // ticks between weather checks
export const STORM_CHANCE = 0.01;               // chance per check
export const DROUGHT_CHANCE = 0.005;            // chance per check (only summer)
export const HARSH_WINTER_CHANCE = 0.02;        // chance per check (only winter)
export const STORM_DURATION_TICKS = 200;        // how long a storm lasts
export const STORM_BUILDING_DAMAGE = 0.05;      // durability lost per tick during storm
export const STORM_CROP_DAMAGE = 0.1;           // crop progress lost per tick
export const DROUGHT_DURATION_TICKS = 500;      // how long a drought lasts
export const DROUGHT_CROP_MULT = 0.1;           // crop growth multiplier during drought

// Building decay
export const BUILDING_DECAY_PER_TICK = 0.0005;  // durability lost per tick
export const BUILDING_MAX_DURABILITY = 100;
export const BUILDING_REPAIR_THRESHOLD = 50;    // laborers auto-repair below this
export const BUILDING_COLLAPSE_THRESHOLD = 0;   // building destroyed at 0
export const BUILDING_REPAIR_PER_TICK = 0.5;    // durability restored per tick while being repaired

// Disease
export const DISEASE_BASE_CHANCE = 0.00005;    // base chance per tick for malnourished citizen to get sick
export const DISEASE_SPREAD_RADIUS = 5;         // tiles radius for contagion
export const DISEASE_SPREAD_CHANCE = 0.0003;    // chance per tick to spread to nearby citizen
export const DISEASE_HEALTH_DAMAGE = 0.04;      // health lost per tick while sick
export const DISEASE_DURATION_TICKS = 3000;     // how long disease lasts without treatment (~5 min)
export const HERBALIST_CURE_RADIUS = 30;        // herbalist treatment radius
export const HERBALIST_CURE_CHANCE = 0.005;     // chance per tick to cure a sick citizen in radius
export const DISEASE_IMMUNITY_TICKS = 5000;     // ticks of immunity after recovery

// Food spoilage & diet variety
export const FOOD_SPOILAGE_RATE = 0.001;        // fraction of food lost per spoilage tick (every 30 ticks)
export const BARN_SPOILAGE_MULT = 0.2;          // barns reduce spoilage to 20%
export const DIET_HISTORY_SIZE = 10;            // number of recent meals to track
export const DIET_VARIETY_THRESHOLD = 3;        // unique food types needed for bonus
export const DIET_VARIETY_HAPPINESS = 0.01;     // happiness gain per tick with varied diet
export const DIET_MONOTONY_HAPPINESS = -0.005;  // happiness change per tick with monotonous diet

// Resource depletion & regrowth
export const TREE_CONSUME_AMOUNT = 1;          // trees consumed from tile per production cycle
export const FORESTER_REPLANT_TICKS = 600;     // worker-ticks between replanting (~2h game time with 4 workers)
export const NATURAL_REGROWTH_CHANCE = 0.00002; // chance per tick per grass tile near forest to sprout
export const TREE_GROWTH_TICKS = 3000;         // worker-ticks per density level (~half a year with 4 workers)
export const STONE_DEPOSIT_AMOUNT = 50;        // starting amount in each stone deposit tile
export const IRON_DEPOSIT_AMOUNT = 30;         // starting amount in each iron deposit tile

// Personality Traits
export const PersonalityTrait = {
  HARDWORKING: 'hardworking',
  LAZY: 'lazy',
  CHEERFUL: 'cheerful',
  SHY: 'shy',
  ADVENTUROUS: 'adventurous',
} as const;
export type PersonalityTrait = (typeof PersonalityTrait)[keyof typeof PersonalityTrait];

export const TRAIT_WORK_SPEED_BONUS: Partial<Record<PersonalityTrait, number>> = {
  [PersonalityTrait.HARDWORKING]: 0.15,   // +15% work speed
  [PersonalityTrait.LAZY]: -0.15,          // -15% work speed
};
export const TRAIT_SOCIAL_CHANCE_MULT: Partial<Record<PersonalityTrait, number>> = {
  [PersonalityTrait.SHY]: 0.3,            // 70% less likely to chat
  [PersonalityTrait.CHEERFUL]: 2.0,        // 2x more likely to chat
};
export const TRAIT_HAPPINESS_GAIN_MULT: Partial<Record<PersonalityTrait, number>> = {
  [PersonalityTrait.CHEERFUL]: 1.5,        // 50% more happiness from socializing
};
export const TRAIT_WANDER_HAPPINESS: Partial<Record<PersonalityTrait, number>> = {
  [PersonalityTrait.ADVENTUROUS]: 0.003,   // gains happiness from wandering
};
export const MAX_TRAITS_PER_CITIZEN = 2;
export const ALL_TRAITS: PersonalityTrait[] = Object.values(PersonalityTrait);

// Citizen Skills
export const SkillType = {
  FARMING: 'farming',
  FORESTRY: 'forestry',
  MINING: 'mining',
  COOKING: 'cooking',
  BUILDING: 'building',
  GATHERING: 'gathering',
  FISHING: 'fishing',
  HUNTING: 'hunting',
} as const;
export type SkillType = (typeof SkillType)[keyof typeof SkillType];

export const SKILL_MAX_LEVEL = 5;
export const SKILL_XP_PER_LEVEL = 500;             // XP needed per level
export const SKILL_XP_PER_WORK_TICK = 0.1;          // XP gained per tick while working
export const SKILL_EFFICIENCY_PER_LEVEL = 0.05;     // +5% efficiency per skill level
export const SKILL_MASTERY_BONUS_CHANCE = 0.1;       // 10% chance of bonus output at level 5

// Mapping from profession to skill type
export const PROFESSION_SKILL_MAP: Partial<Record<string, SkillType>> = {
  farmer: SkillType.FARMING,
  forester: SkillType.FORESTRY,
  wood_cutter: SkillType.FORESTRY,
  gatherer: SkillType.GATHERING,
  hunter: SkillType.HUNTING,
  fisherman: SkillType.FISHING,
  blacksmith: SkillType.MINING,
  baker: SkillType.COOKING,
  builder: SkillType.BUILDING,
  laborer: SkillType.BUILDING,
};

// Crop Growth Stages
export const CropStage = {
  FALLOW: 0,      // nothing planted
  PLANTED: 1,     // seeds in ground
  SPROUTING: 2,   // small green shoots
  GROWING: 3,     // mid-height plants
  FLOWERING: 4,   // near-mature with flowers
  READY: 5,       // ready to harvest
} as const;
export type CropStage = (typeof CropStage)[keyof typeof CropStage];

export const CROP_STAGE_TICKS = 120;              // base ticks per growth stage (modified by season/weather)
export const CROP_WINTER_KILL = true;              // crops die if not harvested before winter
export const CROP_HARVEST_YIELD_MULT = 1.2;        // bonus yield for fully grown crops vs old flat rate

// Cooking / Meal quality
export const COOKED_MEAL_RESTORE = 45;          // cooked food restores 45 food (vs 30 raw)
export const COOKED_MEAL_COST = 2;              // cooked meals cost 2 units (vs 3 raw)
export const COOKED_MEAL_WARMTH_BOOST = 5;      // warmth gained from eating hot food (stew/soup)
export const COOKED_MEAL_HAPPINESS_BOOST = 2;   // happiness gained from eating cooked food
export const COOKED_MEAL_ENERGY_BOOST = 5;      // energy boost from hearty meals (pie)

// Festivals
export const FESTIVAL_DURATION_TICKS = 600;           // how long a festival lasts (~1 minute real at 1x)
export const FESTIVAL_HAPPINESS_BOOST = 15;           // happiness added when festival starts
export const FESTIVAL_HAPPINESS_PER_TICK = 0.02;      // happiness gained per tick for attending citizens
export const FESTIVAL_GATHER_RADIUS = 8;              // tiles from Town Hall citizens will gather
export const FESTIVAL_LANTERN_COUNT = 12;             // lantern particles to spawn per interval
export const FESTIVAL_CHECK_TICKS = 100;              // ticks into a sub-season when festival triggers
// Festival effects (multipliers active for the rest of the season after the festival)
export const HARVEST_FESTIVAL_SPOILAGE_MULT = 0.5;   // 50% less food spoilage
export const FROST_FAIR_DISEASE_MULT = 0.5;           // 50% less disease chance
export const PLANTING_DAY_CROP_MULT = 1.2;            // 20% crop growth boost
export const MIDSUMMER_HAPPINESS_MULT = 1.5;          // 50% more happiness gain

// Tavern & Social Buildings
export const TAVERN_HAPPINESS_PER_TICK = 0.03;    // happiness gained per tick while at tavern
export const TAVERN_VISIT_CHANCE = 0.15;           // chance per AI tick to visit tavern in evening
export const TAVERN_EVENING_START = 0.6;           // fraction of day when evening begins (before dusk)
export const TAVERN_SOCIAL_RADIUS = 4;             // social interaction radius near tavern
export const WELL_HAPPINESS_RADIUS = 15;           // tiles from well that get happiness boost
export const WELL_HAPPINESS_PER_TICK = 0.002;      // passive happiness per tick for citizens near well
export const CHAPEL_WEDDING_HAPPINESS = 10;        // happiness boost for newlyweds if chapel exists
export const CHAPEL_COMMUNITY_HAPPINESS = 0.001;   // passive per-tick happiness for all citizens if chapel exists

// Spatial hash
export const SPATIAL_CELL_SIZE = 8; // tiles

// UI
export const HUD_HEIGHT = 40;
export const BUILD_MENU_HEIGHT = 180;
export const INFO_PANEL_WIDTH = 250;
export const MINIMAP_SIZE = 160;

// Event Log
export const EVENT_LOG_WIDTH = 300;
export const EVENT_LOG_MAX_ENTRIES = 200;
export const EVENT_LOG_VISIBLE_ROWS = 12;
export const EVENT_LOG_ROW_HEIGHT = 18;
export const EVENT_LOG_HEADER_HEIGHT = 24;

// Speed multipliers
export const SPEED_OPTIONS = [0, 1, 2, 5, 10];

// Enums as const objects for better tree-shaking
export const TileType = {
  GRASS: 0,
  FOREST: 1,
  WATER: 2,
  STONE: 3,
  IRON: 4,
  RIVER: 5,
  FERTILE: 6,
  ROAD: 7,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

export const ResourceType = {
  LOG: 'log',
  STONE: 'stone',
  IRON: 'iron',
  FIREWOOD: 'firewood',
  TOOL: 'tool',
  COAT: 'coat',
  HERBS: 'herbs',
  LEATHER: 'leather',
  BERRIES: 'berries',
  MUSHROOMS: 'mushrooms',
  ROOTS: 'roots',
  VENISON: 'venison',
  FISH: 'fish',
  WHEAT: 'wheat',
  CABBAGE: 'cabbage',
  POTATO: 'potato',
  // Cooked meals
  BREAD: 'bread',
  FISH_STEW: 'fish_stew',
  BERRY_PIE: 'berry_pie',
  VEGETABLE_SOUP: 'vegetable_soup',
} as const;
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

export const FOOD_TYPES: ResourceType[] = [
  ResourceType.BERRIES,
  ResourceType.MUSHROOMS,
  ResourceType.ROOTS,
  ResourceType.VENISON,
  ResourceType.FISH,
  ResourceType.WHEAT,
  ResourceType.CABBAGE,
  ResourceType.POTATO,
];

export const COOKED_FOOD_TYPES: ResourceType[] = [
  ResourceType.BREAD,
  ResourceType.FISH_STEW,
  ResourceType.BERRY_PIE,
  ResourceType.VEGETABLE_SOUP,
];

export const ALL_FOOD_TYPES: ResourceType[] = [...FOOD_TYPES, ...COOKED_FOOD_TYPES];

export const BuildingType = {
  WOODEN_HOUSE: 'wooden_house',
  STORAGE_BARN: 'storage_barn',
  STOCKPILE: 'stockpile',
  CROP_FIELD: 'crop_field',
  GATHERING_HUT: 'gathering_hut',
  HUNTING_CABIN: 'hunting_cabin',
  FISHING_DOCK: 'fishing_dock',
  FORESTER_LODGE: 'forester_lodge',
  WOOD_CUTTER: 'wood_cutter',
  BLACKSMITH: 'blacksmith',
  TAILOR: 'tailor',
  HERBALIST: 'herbalist',
  MARKET: 'market',
  SCHOOL: 'school',
  TRADING_POST: 'trading_post',
  ROAD: 'road',
  TOWN_HALL: 'town_hall',
  BAKERY: 'bakery',
  TAVERN: 'tavern',
  WELL: 'well',
  CHAPEL: 'chapel',
} as const;
export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType];

export const Profession = {
  LABORER: 'laborer',
  FARMER: 'farmer',
  GATHERER: 'gatherer',
  HUNTER: 'hunter',
  FISHERMAN: 'fisherman',
  FORESTER: 'forester',
  WOOD_CUTTER: 'wood_cutter',
  BLACKSMITH: 'blacksmith',
  TAILOR: 'tailor',
  HERBALIST: 'herbalist',
  VENDOR: 'vendor',
  TEACHER: 'teacher',
  TRADER: 'trader',
  BUILDER: 'builder',
  BAKER: 'baker',
  BARKEEP: 'barkeep',
} as const;
export type Profession = (typeof Profession)[keyof typeof Profession];

export const Season = {
  EARLY_SPRING: 0,
  MID_SPRING: 1,
  LATE_SPRING: 2,
  EARLY_SUMMER: 3,
  MID_SUMMER: 4,
  LATE_SUMMER: 5,
  EARLY_AUTUMN: 6,
  MID_AUTUMN: 7,
  LATE_AUTUMN: 8,
  EARLY_WINTER: 9,
  MID_WINTER: 10,
  LATE_WINTER: 11,
} as const;
export type Season = (typeof Season)[keyof typeof Season];

export const BuildingCategory = {
  HOUSING: 'Housing',
  STORAGE: 'Storage',
  FOOD: 'Food',
  RESOURCE: 'Resource',
  SERVICES: 'Services',
  INFRASTRUCTURE: 'Infrastructure',
} as const;
export type BuildingCategory = (typeof BuildingCategory)[keyof typeof BuildingCategory];
