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

// ── Time / Seasons ─────────────────────────────────────────────
export const TICKS_PER_DAY = 600;  // 60 seconds real time at 1x
export const DAYS_PER_YEAR = 365;
export const SUB_SEASONS_PER_YEAR = 12;
export const TICKS_PER_SUB_SEASON = Math.round(DAYS_PER_YEAR * TICKS_PER_DAY / SUB_SEASONS_PER_YEAR); // ~30.4 days per sub-season
export const TICKS_PER_YEAR = TICKS_PER_SUB_SEASON * SUB_SEASONS_PER_YEAR; // 219,000 = 365 days
export const DAWN_START = 0.2;
export const DUSK_START = 0.75;
export const NIGHT_DARKNESS = 0.55;

// ── Semantic time units ────────────────────────────────────────
export const HOUR   = TICKS_PER_DAY / 24;          // 25 ticks
export const DAY    = TICKS_PER_DAY;               // 600 ticks
export const MONTH  = TICKS_PER_SUB_SEASON;        // ~18,250 ticks (~30.4 days)
export const SEASON = 3 * MONTH;                   // ~54,750 ticks
export const YEAR   = TICKS_PER_YEAR;              // 219,000 ticks

// ── Citizens ───────────────────────────────────────────────────
export const STARTING_ADULTS = 20;
export const STARTING_CHILDREN = 2;
export const CITIZEN_SPEED = 12; // tiles per second
export const CHILD_AGE = 10;
export const OLD_AGE = 60;
export const YEARS_PER_REAL_YEAR = 5;

// Movement speed modifiers
export const ROAD_SPEED_MULT = 2.0;
export const BRIDGE_SPEED_MULT = 1.0;
export const FOREST_SPEED_MULT = 0.35;
export const DEFAULT_SPEED_MULT = 1.0;

// ── Needs (0..100) ─────────────────────────────────────────────
export const FOOD_DECAY_PER_TICK    = 100 / (7 * DAY);       // fully depletes in 2 days → ~2 meals/day
export const WARMTH_DECAY_PER_TICK  = 0.03;                   // modified by temperature in winter
export const HEALTH_DECAY_PER_TICK  = 0.005;
export const HAPPINESS_DECAY_PER_TICK = 0.003;
export const STARVATION_HEALTH_DAMAGE = 0.08;
export const FREEZING_HEALTH_DAMAGE   = 0.06;

// Energy (0..100) — drains while awake, recovers while sleeping
export const ENERGY_DECAY_PER_TICK    = 80 / (16 * HOUR);    // 16 waking hours drains 80 pts
export const ENERGY_RECOVERY_PER_TICK = 100 / (8 * HOUR);    // 8 hours of sleep for full recovery
export const TIRED_THRESHOLD = 20;

// Meals
export const MEAL_FOOD_THRESHOLD = 65;
export const MEAL_RESTORE = 30;
export const MEAL_COST = 3;
export const STARVING_THRESHOLD = 15;

// Tool / Coat wear
export const TOOL_WEAR_PER_TICK = 1 / (8 * MONTH);           // a tool wears out in ~8 months
export const COAT_WEAR_PER_TICK = 1 / (2 * YEAR);            // a coat wears out in ~2 years
export const NO_TOOL_PRODUCTION_MULT = 0.5;
export const NO_COAT_WARMTH_MULT = 2.0;

// Starting resources
export const STARTING_RESOURCES = {
  log: 150,
  stone: 50,
  iron: 20,
  tool: 8,
  coat: 7,
  firewood: 80,
  // Actual edible food types so getTotalFood() counts them and citizens can eat them
  berries: 200,
  roots: 100,
  venison: 50,
};

// ── Population ─────────────────────────────────────────────────
export const MARRIAGE_MIN_AGE = 18;
export const FERTILITY_MAX_AGE = 55;
export const MAX_CHILDREN_PER_COUPLE = 3;
export const BIRTH_CHANCE = 0.03;
export const OLD_AGE_DEATH_CHANCE_PER_YEAR = 0.02;
export const NEWBORN_NEEDS = 80;
export const ADULT_SPAWN_AGE_MIN = 18;
export const ADULT_SPAWN_AGE_MAX = 30;
export const FAMILY_CHECK_INTERVAL = 100;                      // ticks between family/birth/worker checks
export const PARTNER_PREFERENCE_OPPOSITE_SHARE = 0.8;
export const PARTNER_PREFERENCE_BOTH_SHARE = 0.1;
export const PARTNER_PREFERENCE_SAME_SHARE = 0.1;
export const INITIAL_RELATIONSHIP_SINGLE_SHARE = 0.8;
export const INITIAL_RELATIONSHIP_PARTNERED_SHARE = 0.15;
export const INITIAL_RELATIONSHIP_MARRIED_SHARE = 0.05;
// Pregnancy
export const PREGNANCY_DURATION_TICKS = 9 * MONTH;            // 9 months
export const TRIMESTER_1_END = 3 * MONTH;
export const TRIMESTER_2_END = 6 * MONTH;
// Trimester 1 modifiers (months 1-3)
export const T1_FOOD_DECAY_MULT = 1.15;
export const T1_ENERGY_DECAY_MULT = 1.0;
export const T1_SPEED_MULT = 1.0;
// Trimester 2 modifiers (months 4-6)
export const T2_FOOD_DECAY_MULT = 1.3;
export const T2_ENERGY_DECAY_MULT = 1.15;
export const T2_SPEED_MULT = 0.85;
// Trimester 3 modifiers (months 7-9)
export const T3_FOOD_DECAY_MULT = 1.5;
export const T3_ENERGY_DECAY_MULT = 1.3;
export const T3_SPEED_MULT = 0.65;
export const PREGNANT_MEAL_THRESHOLD_BOOST = 10;

// Nomads
export const NOMAD_CHECK_INTERVAL = 500;
export const NOMAD_BASE_CHANCE = 0.01;
export const NOMAD_DISEASE_CHANCE = 0.15;
export const NOMAD_MIN_COUNT = 2;
export const NOMAD_MAX_COUNT = 5;
export const NOMAD_EDGE_MARGIN = 20;
export const NOMAD_SPAWN_SEARCH_RADIUS = 10;
export const NOMAD_SCATTER_RANGE = 2;

// Immigration funnel tuning (awareness -> contact -> settlement)
export const IMMIGRATION_MAX_ARRIVAL_CHANCE = 0.08;
export const IMMIGRATION_ROAD_AWARENESS_BONUS = 0.02;
export const IMMIGRATION_RIVER_AWARENESS_BONUS = 0.015;
export const IMMIGRATION_OUTREACH_BONUS = 0.01;
export const IMMIGRATION_JOB_AWARENESS_PER_OPEN_SLOT = 0.002;
export const IMMIGRATION_MAX_JOB_AWARENESS_BONUS = 0.02;
export const IMMIGRATION_ROAD_SETTLEMENT_RADIUS = 6;
export const IMMIGRATION_SPAWN_SEARCH_RADIUS = 12;
export const IMMIGRATION_FOOD_PER_PERSON_PER_MONTH = 12;
export const IMMIGRATION_FOOD_MONTHS_TARGET = 6;
export const IMMIGRATION_HOUSING_TARGET_FREE_SLOTS = 6;
export const IMMIGRATION_OPEN_JOBS_TARGET = 6;
export const IMMIGRATION_MIN_JOIN_CHANCE = 0.15;
export const IMMIGRATION_MAX_JOIN_CHANCE = 0.9;
export const IMMIGRATION_JOB_BUFFER = 2;

// Road travel model (trip roll -> travel type -> settlement roll)
export const ROAD_TRAVEL_CHECK_INTERVAL = DAY;
export const ROAD_TRAVEL_PROBABILITY = 0.35; // chance per check interval that a travel party appears
export const ROAD_TRAVEL_PASS_THROUGH_WEIGHT = 0.55;
export const ROAD_TRAVEL_WORK_SEEKER_WEIGHT = 0.30;
export const ROAD_TRAVEL_SETTLER_FAMILY_WEIGHT = 0.15;
export const ROAD_TRAVEL_PASS_THROUGH_MIN = 2;
export const ROAD_TRAVEL_PASS_THROUGH_MAX = 6;
export const ROAD_TRAVEL_WORK_SEEKER_MIN = 1;
export const ROAD_TRAVEL_WORK_SEEKER_MAX = 3;
export const ROAD_TRAVEL_SETTLER_FAMILY_MIN = 2;
export const ROAD_TRAVEL_SETTLER_FAMILY_MAX = 5;
export const ROAD_SETTLEMENT_MIN_TOTAL_FOOD = 120;
export const ROAD_SETTLEMENT_MIN_FOOD_MONTHS = 2;
export const ROAD_JOIN_BASE_PASS_THROUGH = 0.05;
export const ROAD_JOIN_BASE_WORK_SEEKER = 0.45;
export const ROAD_JOIN_BASE_SETTLER_FAMILY = 0.65;
export const ROAD_TRAVELER_MAX_ACTIVE = 24;
export const ROAD_TRAVELER_SPEED_MULT = 1.15;
export const ROAD_TRAVELER_MAX_LIFETIME = 3 * DAY;

// Citizen AI
export const AI_TICK_INTERVAL = 5;
// Roads are deprioritized when selecting construction targets so
// unfinished buildings are generally built first.
export const ROAD_CONSTRUCTION_SITE_DISTANCE_PENALTY = 3.5;
export const STUCK_THRESHOLD = 50;
export const FREEZING_WARMTH_THRESHOLD = 25;
export const COLD_RELEASE_WARMTH_THRESHOLD = 45;
export const COLD_CRITICAL_WARMTH_THRESHOLD = 15;
export const EMERGENCY_SLEEP_ENERGY = 5;
export const CHAT_HAPPINESS_GAIN = 0.5;
export const HOME_WARMTH_GAIN = 0.1;

// Wander behavior
export const WANDER_ATTEMPTS = 3;
export const WANDER_RANGE = 6;
export const FORCE_WANDER_ATTEMPTS = 8;
export const FORCE_WANDER_RANGE = 15;
export const FORCE_WANDER_MIN_DIST = 3;
export const CITIZEN_SPAWN_OFFSET = 3;

// ── Construction ───────────────────────────────────────────────
// Formula: ticks = constructionWork / (numWorkers * CONSTRUCTION_WORK_RATE)
// House (250 work) + 3 workers → 2778 ticks ≈ 4.6 days
export const CONSTRUCTION_WORK_RATE = 0.03;
export const EDUCATED_CONSTRUCTION_BONUS = 0.015;
export const DEMOLITION_WORK_MULT = 0.4; // teardown work cost as a fraction of build work (faster)
export const DEMOLITION_RECLAIM_RATIO = 0.4; // fraction of build materials returned on teardown
export const INITIAL_HOUSE_WARMTH = 50;
export const ROAD_CONSTRUCTION_WORK = 20;    // ~0.14 days per tile with 1 worker
export const BRIDGE_CONSTRUCTION_WORK = 50;  // ~0.37 days per tile with 1 worker

// Production
export const EDUCATION_BONUS = 1.5;
export const FOREST_EFFICIENCY_DIVISOR = 50;

// ── Needs thresholds ───────────────────────────────────────────
export const SLEEP_FOOD_DECAY_MULT = 0.5;
export const WARM_WEATHER_TEMP = 15;
export const WARM_WEATHER_RECOVERY = 0.02;
export const COLD_WARMTH_DIVISOR = 10;
export const HOUSE_WARMTH_THRESHOLD = 30;
export const HOUSE_WARMTH_DECAY_MULT = 0.2;
export const HOUSE_WARMTH_RECOVERY = 0.05;
export const FREEZING_TEMP_THRESHOLD = 5;
export const HEALTH_REGEN_FOOD_MIN = 50;
export const HEALTH_REGEN_WARMTH_MIN = 50;
export const HEALTH_REGEN_ENERGY_MIN = 30;
export const HEALTH_REGEN_RATE = 0.005;
export const HERB_USE_HEALTH_THRESHOLD = 80;
export const HERB_USE_CHANCE = 0.001;
export const HERB_HEALTH_RESTORE = 10;
export const OLD_AGE_HEALTH_DIVISOR = 20;
export const UNHAPPY_FOOD_THRESHOLD = 30;
export const UNHAPPY_WARMTH_THRESHOLD = 30;
export const UNHAPPY_HEALTH_THRESHOLD = 50;
export const UNHAPPY_ENERGY_THRESHOLD = 15;
export const UNHAPPINESS_RATE = 0.01;
export const HAPPY_NEEDS_THRESHOLD = 70;
export const HAPPY_ENERGY_THRESHOLD = 50;
export const HAPPINESS_GAIN_RATE = 0.005;

// Storage / Houses
export const BASE_STORAGE_CAPACITY = 500;
export const STORAGE_FULL_LOG_INTERVAL = 300;
export const STORAGE_CHECK_INTERVAL = 30;
export const HOUSE_FIREWOOD_MIN = 10;
export const HOUSE_FIREWOOD_TARGET = 20;
export const HOUSE_WARMTH_GAIN_FROM_FIRE = 2;
export const HOUSE_FIREWOOD_CONSUMPTION = 0.05;
export const HOUSE_WARMTH_LOSS_NO_FIRE = 5;
export const MARKET_HAPPINESS_GAIN = 0.5;

// ── Heated public buildings (Tavern, Bakery, Chapel, Town Hall) ─
// HEATED_BUILDING_TYPES is declared after BuildingType enum below.
// Firewood management
export const HEATED_BUILDING_FIREWOOD_MIN = 5;            // restock trigger
export const HEATED_BUILDING_FIREWOOD_TARGET = 10;        // restock to this level
export const HEATED_BUILDING_FIREWOOD_CONSUMPTION = 0.08; // per STORAGE_CHECK_INTERVAL
export const HEATED_BUILDING_FIREWOOD_RESERVE_DAYS = 5;   // homes get priority for N days
// Warmth mechanics
export const HEATED_BUILDING_WARMTH_GAIN = 2;             // warmthLevel +N per check when firewood present
export const HEATED_BUILDING_WARMTH_LOSS = 4;             // warmthLevel -N per check when no firewood
export const HEATED_BUILDING_WARMTH_THRESHOLD = 30;       // min warmthLevel for citizen benefit
export const HEATED_BUILDING_DECAY_MULT = 0.4;            // warmth decay mult inside (vs house 0.2×)
export const HEATED_BUILDING_WARMTH_RECOVERY = 0.02;      // warmth/tick gained when inside
// Leisure preference boost when cold
export const COLD_PREFER_WARM_BUILDING_THRESHOLD = 40;    // warmth below this boosts heated-building leisure
export const COLD_WARM_BUILDING_WEIGHT_MULT = 2.5;        // weight multiplier for heated leisure when cold

// ── Trade ──────────────────────────────────────────────────────
export const MERCHANT_VISIT_INTERVAL_MULT = 0.8;
export const MERCHANT_ARRIVAL_CHANCE = 0.002;
export const MERCHANT_WARES_COUNT = 3;
export const MERCHANT_WARES_MIN = 20;
export const MERCHANT_WARES_MAX = 80;
export const MERCHANT_WANTS_COUNT = 2;
export const MERCHANT_WANTS_MIN = 30;
export const MERCHANT_WANTS_MAX = 100;
export const MERCHANT_STAY_DURATION = 1 * DAY;                // merchant stays 1 day

// ── Environment ────────────────────────────────────────────────
export const ENVIRONMENT_TILES_PER_TICK = 200;
export const MAX_TREE_DENSITY = 10;
export const FOREST_GROWTH_CHANCE = 0.0002;
export const BUILDING_DECAY_CHECK_INTERVAL = 10;

// ── Disease (system tuning) ────────────────────────────────────
export const DISEASE_TICK_INTERVAL = 5;
export const DISEASE_ENERGY_DRAIN = 0.02;
export const DISEASE_MALNUTRITION_THRESHOLD = 30;
export const DISEASE_MALNUTRITION_MULT = 1.5;
export const DISEASE_COLD_THRESHOLD = 30;
export const DISEASE_COLD_MULT = 1.5;
export const DISEASE_WEAK_THRESHOLD = 50;
export const DISEASE_WEAK_MULT = 1.5;

// ── Weather (system tuning) ────────────────────────────────────
export const STORM_WARMTH_DRAIN = 0.05;
export const HARSH_WINTER_WARMTH_DRAIN = 0.03;
export const STORM_CROP_WEATHER_MULT = 0.5;

// ── Map generation ─────────────────────────────────────────────
export const FOREST_DENSITY = 0.35;
export const STONE_DEPOSIT_CHANCE = 0.02;
export const IRON_DEPOSIT_CHANCE = 0.01;
export const RIVER_MIN_WIDTH = 2;
export const RIVER_MAX_WIDTH = 8;
export const ELEVATION_NOISE_SCALE = 60;
export const MOISTURE_NOISE_SCALE = 40;
export const FOREST_NOISE_SCALE = 30;
export const WATER_ELEVATION_THRESHOLD = 0.25;
export const FOREST_ELEVATION_MIN = 0.3;
export const FERTILE_MOISTURE_THRESHOLD = 0.55;
export const STONE_ELEVATION_THRESHOLD = 0.6;
export const START_AREA_RADIUS = 10;
export const START_LOCATION_SEARCH_RADIUS = 20;

// Particles
export const MAX_PARTICLES = 300;
export const PARTICLE_SPAWN_INTERVAL = 3;
export const SMOKE_SPAWN_CHANCE = 0.3;
export const SMOKE_MIN_WARMTH = 20;
export const SNOW_PARTICLES_PER_SPAWN = 3;
export const LEAF_SPAWN_CHANCE = 0.3;

// Pathfinding
export const PATH_CACHE_SIZE = 64;
export const MAX_PATHS_PER_TICK = 20;
export const ROAD_PATH_COST = 0.5;
export const BRIDGE_PATH_COST = 0.8;
export const FOREST_PATH_COST = 2.8;
export const DEFAULT_PATH_COST = 1.0;

// ── Social ─────────────────────────────────────────────────────
export const SOCIAL_CHAT_RADIUS = 3;
export const SOCIAL_CHAT_CHANCE = 0.02;
export const SOCIAL_CHAT_DURATION = 1 * HOUR;                 // ~1 in-game hour of chatting
export const LONELINESS_THRESHOLD = 3 * DAY;                  // lonely after 3 days without contact
export const LONELINESS_HAPPINESS_PENALTY = -0.003;

// ── Weather events ─────────────────────────────────────────────
export const WEATHER_CHECK_INTERVAL = 12 * HOUR;              // check every 12 hours
export const STORM_CHANCE = 0.01;
export const DROUGHT_CHANCE = 0.005;
export const HARSH_WINTER_CHANCE = 0.02;
export const STORM_DURATION_TICKS = 8 * HOUR;                 // storms last ~8 hours
export const STORM_BUILDING_DAMAGE = 0.05;
export const STORM_CROP_DAMAGE = 0.1;
export const DROUGHT_DURATION_TICKS = 1 * MONTH;              // droughts last 1 month
export const DROUGHT_CROP_MULT = 0.1;

// ── Building decay ─────────────────────────────────────────────
export const BUILDING_DECAY_PER_TICK = 100 / (28 * YEAR);     // full decay over ~28 years
export const BUILDING_MAX_DURABILITY = 100;
export const BUILDING_REPAIR_THRESHOLD = 50;
export const BUILDING_COLLAPSE_THRESHOLD = 0;
export const BUILDING_REPAIR_PER_TICK = 0.5;

// ── Disease ────────────────────────────────────────────────────
export const DISEASE_BASE_CHANCE = 0.00001;                    // 5x rarer spontaneous disease
export const DISEASE_SPREAD_RADIUS = 3;                        // tighter spread radius
export const DISEASE_SPREAD_CHANCE = 0.0001;                   // 3x harder to spread
export const DISEASE_HEALTH_DAMAGE = 0.015;                    // much less lethal (~2.5x less)
export const DISEASE_DURATION_TICKS = 3 * DAY;                 // disease lasts ~3 days (shorter)
export const HERBALIST_CURE_RADIUS = 30;
export const HERBALIST_CURE_CHANCE = 0.005;
export const DISEASE_IMMUNITY_TICKS = 1 * YEAR;               // immune for 1 year after recovery

// Food spoilage & diet variety
export const FOOD_SPOILAGE_RATE = 0.001;
export const BARN_SPOILAGE_MULT = 0.2;
export const DIET_HISTORY_SIZE = 10;
export const DIET_VARIETY_THRESHOLD = 3;
export const DIET_VARIETY_HAPPINESS = 0.01;
export const DIET_MONOTONY_HAPPINESS = -0.005;

// Resource depletion & regrowth
export const TREE_CONSUME_AMOUNT = 1;
export const FORESTER_REPLANT_TICKS = 1 * MONTH;              // 1 month between replanting
export const NATURAL_REGROWTH_CHANCE = 0.00002;
export const TREE_GROWTH_TICKS = 5 * MONTH;                   // 5 months per density level
export const STONE_DEPOSIT_AMOUNT = 200;
export const IRON_DEPOSIT_AMOUNT = 100;

// ── Map Resources ─────────────────────────────────────────────
// Max amounts per tile
export const MAX_BERRIES = 8;
export const MAX_MUSHROOMS = 5;
export const MAX_HERBS = 3;
export const MAX_FISH = 8;
export const MAX_WILDLIFE = 3;

// Generation chances per eligible tile type
export const BERRY_FOREST_CHANCE = 0.40;
export const BERRY_FERTILE_CHANCE = 0.20;
export const MUSHROOM_FOREST_CHANCE = 0.30;
export const HERB_CHANCE = 0.15;
export const HERB_MIN_MOISTURE = 0.4;
export const FISH_WATER_CHANCE = 0.80;
export const WILDLIFE_FOREST_CHANCE = 0.25;
export const WILDLIFE_GRASS_CHANCE = 0.10;

// ── Resource Lifecycle ────────────────────────────────────────
// Each resource type has a seasonal calendar: grows, peaks, then dies back.
// Sub-season values are 0.0–11.999 (0=Early Spring, 11.999=Late Winter).
export interface ResourceLifecycle {
  bloomStart: number;    // sub-season float when it starts growing
  peakStart: number;     // sub-season float when it reaches max
  declineStart: number;  // sub-season float when it starts declining
  dormantStart: number;  // sub-season float when it reaches min (stays there until next bloomStart)
  minFraction: number;   // 0-1 min level as fraction of MAX (0 = fully dormant in winter)
  phaseVariance: number; // ±sub-seasons of per-tile timing randomness
  growthProb: number;    // per-scan probability of +1 when below target
  decayProb: number;     // per-scan probability of -1 when above target
}

// Probability targets: ~2 sub-seasons (30 scans) to go 0→max or max→0.
// growthProb ≈ MAX / (2 × 15 scans); decayProb slightly higher for sharp die-back.
// Hash-based tileEligible limits coverage to ~40% of eligible tile types, so
// high per-tile probabilities don't fill the whole map.
export const BERRY_LIFECYCLE: ResourceLifecycle = {
  bloomStart: 0.0, peakStart: 2.0, declineStart: 5.5, dormantStart: 8.5,
  minFraction: 0, phaseVariance: 1.0, growthProb: 0.25, decayProb: 0.30,
};
export const MUSHROOM_LIFECYCLE: ResourceLifecycle = {
  // Short autumn season — steeper ramp so they appear and vanish noticeably
  bloomStart: 5.5, peakStart: 7.0, declineStart: 8.0, dormantStart: 9.5,
  minFraction: 0, phaseVariance: 0.75, growthProb: 0.28, decayProb: 0.35,
};
export const HERB_LIFECYCLE: ResourceLifecycle = {
  bloomStart: 1.0, peakStart: 3.0, declineStart: 5.0, dormantStart: 7.5,
  minFraction: 0, phaseVariance: 0.75, growthProb: 0.22, decayProb: 0.28,
};
export const FISH_LIFECYCLE: ResourceLifecycle = {
  // Fish populations change slowly; minFraction keeps a winter baseline
  bloomStart: 1.0, peakStart: 3.0, declineStart: 6.0, dormantStart: 10.0,
  minFraction: 0.30, phaseVariance: 0.5, growthProb: 0.10, decayProb: 0.15,
};
export const WILDLIFE_LIFECYCLE: ResourceLifecycle = {
  // Wildlife is the most stable; minFraction keeps herds alive year-round
  bloomStart: 0.0, peakStart: 2.0, declineStart: 7.0, dormantStart: 10.0,
  minFraction: 0.35, phaseVariance: 0.5, growthProb: 0.08, decayProb: 0.12,
};

// ── Gather Limit ──────────────────────────────────────────────
export const GATHER_LIMIT_STEP = 25; // step size for UI +/- buttons (see also BUILDING_LIMIT_RESOURCES near bottom)

// ── Gather-Carry-Deposit ─────────────────────────────────────
export const GATHER_TICKS_BASE = 30;             // ticks at resource tile before harvest (~3 sec at 1x)
export const GATHER_CARRY_CAPACITY = 15;         // units per trip; 1 gatherer ≈ 105 food/day (~15× daily consumption of 7 people)
export const GATHER_DEPLETION_PER_HARVEST = 1;   // tile resource lost per gather action
export const GATHER_ROOTS_CHANCE = 0.4;          // Gathering Hut: chance of bonus root per trip
export const GATHER_CARRY_SKILL_BONUS = 1;       // +N carry capacity per skill level
export const GATHER_TOOL_WEAR_PER_TRIP = 0.05;   // tool durability per completed trip

// Forester gather-carry-deposit
export const FORESTER_CHOP_TICKS = 150;     // ticks to fell one tree (~6 in-game hours)
export const FORESTER_CARRY_CAPACITY = 3;   // logs per trip

// Efficiency divisors for gathering buildings (resource count / divisor = efficiency 0-1)
export const BERRY_MUSHROOM_EFFICIENCY_DIVISOR = 40;
export const WILDLIFE_EFFICIENCY_DIVISOR = 20;
export const FISH_EFFICIENCY_DIVISOR = 40;
export const HERB_EFFICIENCY_DIVISOR = 15;

// Depletion amounts per harvest cycle
export const BERRY_DEPLETION = 1;
export const MUSHROOM_DEPLETION = 1;
export const HERB_DEPLETION = 1;
export const FISH_DEPLETION = 1;
export const WILDLIFE_DEPLETION = 1;

// ── Personality Traits ─────────────────────────────────────────
export const PersonalityTrait = {
  HARDWORKING: 'hardworking',
  LAZY: 'lazy',
  CHEERFUL: 'cheerful',
  SHY: 'shy',
  ADVENTUROUS: 'adventurous',
} as const;
export type PersonalityTrait = (typeof PersonalityTrait)[keyof typeof PersonalityTrait];

export const TRAIT_WORK_SPEED_BONUS: Partial<Record<PersonalityTrait, number>> = {
  [PersonalityTrait.HARDWORKING]: 0.15,
  [PersonalityTrait.LAZY]: -0.15,
};
export const TRAIT_SOCIAL_CHANCE_MULT: Partial<Record<PersonalityTrait, number>> = {
  [PersonalityTrait.SHY]: 0.3,
  [PersonalityTrait.CHEERFUL]: 2.0,
};
export const TRAIT_HAPPINESS_GAIN_MULT: Partial<Record<PersonalityTrait, number>> = {
  [PersonalityTrait.CHEERFUL]: 1.5,
};
export const TRAIT_WANDER_HAPPINESS: Partial<Record<PersonalityTrait, number>> = {
  [PersonalityTrait.ADVENTUROUS]: 0.003,
};
export const MAX_TRAITS_PER_CITIZEN = 2;
export const ALL_TRAITS: PersonalityTrait[] = Object.values(PersonalityTrait);

// ── Citizen Skills ─────────────────────────────────────────────
export const SkillType = {
  FARMING: 'farming',
  FORESTRY: 'forestry',
  MINING: 'mining',
  COOKING: 'cooking',
  BUILDING: 'building',
  GATHERING: 'gathering',
  FISHING: 'fishing',
  HUNTING: 'hunting',
  HERDING: 'herding',
} as const;
export type SkillType = (typeof SkillType)[keyof typeof SkillType];

export const SKILL_MAX_LEVEL = 5;
export const SKILL_XP_PER_LEVEL = 500;
export const SKILL_XP_PER_WORK_TICK = 0.1;
export const SKILL_EFFICIENCY_PER_LEVEL = 0.05;
export const SKILL_MASTERY_BONUS_CHANCE = 0.1;

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
  herder: SkillType.HERDING,
  dairymaid: SkillType.COOKING,
  miner: SkillType.MINING,
};

// ── Crop Growth Stages ─────────────────────────────────────────
export const CropStage = {
  FALLOW: 0,
  PLANTED: 1,
  SPROUTING: 2,
  GROWING: 3,
  FLOWERING: 4,
  READY: 5,
} as const;
export type CropStage = (typeof CropStage)[keyof typeof CropStage];

export const CROP_STAGE_TICKS = SEASON / 5;                   // full crop cycle = 1 season (5 stages)
export const CROP_WINTER_KILL = true;
export const CROP_HARVEST_YIELD_MULT = 1.2;

// ── Cooking / Meal quality ─────────────────────────────────────
export const COOKED_MEAL_RESTORE = 45;
export const COOKED_MEAL_COST = 2;
export const COOKED_MEAL_WARMTH_BOOST = 5;
export const COOKED_MEAL_HAPPINESS_BOOST = 2;
export const COOKED_MEAL_ENERGY_BOOST = 5;

// ── Festivals / Fairs ─────────────────────────────────────────
export const FESTIVAL_DURATION_TICKS = Math.round(0.5 * DAY);  // a festival lasts half a day (morning to evening)
export const FESTIVAL_HAPPINESS_BOOST = 15;
export const FESTIVAL_HAPPINESS_PER_TICK = 0.02;
export const FESTIVAL_GATHER_RADIUS = 8;
export const FESTIVAL_LANTERN_COUNT = 12;
export const FESTIVAL_CHECK_TICKS = 4 * HOUR;                 // triggers 4 hours into the month
// Festival effects (multipliers active for the rest of the season)
export const HARVEST_FESTIVAL_SPOILAGE_MULT = 0.5;
export const FROST_FAIR_DISEASE_MULT = 0.5;
export const PLANTING_DAY_CROP_MULT = 1.2;
export const MIDSUMMER_HAPPINESS_MULT = 1.5;
// ── Fair phases & timing ──────────────────────────────────────
export const FAIR_MAIN_PHASE_RATIO = 0.70;                    // 70% of duration
export const FAIR_GATHERING_PHASE_RATIO = 0.20;               // 20% of duration
export const FAIR_FLOURISH_TICKS = 30;                         // ~3 seconds at 1x
export const FAIR_CAMERA_ZOOM_DURATION_MS = 1500;
export const FAIR_CAMERA_TARGET_ZOOM = 1.8;
export const FAIR_GATHER_DISPERSE_RADIUS = 6;                 // tiles from TH center
export const FAIR_VISITOR_COUNT_MIN = 2;
export const FAIR_VISITOR_COUNT_MAX = 5;
export const FAIR_VISITOR_SPAWN_MARGIN = 15;                   // tiles from map edge
export const FAIR_FLOURISH_PARTICLE_BURST = 40;
export const FAIR_ACTIVITY_CHANGE_INTERVAL = 60;               // ticks between activity reassignment
export const FAIR_HAPPINESS_PER_ACTIVITY_TICK = 0.03;
// ── Fair activity movement (individual) ──────────────────────
export const FAIR_ROAM_MOVE_INTERVAL = 15;                     // ticks between moves for roaming activities
export const FAIR_ROAM_RADIUS = 3;                             // tiles from current position
export const FAIR_RACE_MOVE_INTERVAL = 25;                     // ticks between racing re-targets
export const FAIR_RACE_DISTANCE = 5;                           // tiles for race legs
export const FAIR_SOCIAL_MOVE_INTERVAL = 20;                   // ticks between social clustering moves
export const FAIR_SOCIAL_PROXIMITY = 4;                        // tiles to search for same-activity partner
export const FAIR_IDLE_MOVE_INTERVAL = 25;                     // ticks between slight shifts for stationary activities
export const FAIR_IDLE_SHIFT = 2;                              // tiles to shift for stationary activities
// ── Fair group activities ────────────────────────────────────
export const FAIR_GROUP_FORMATION_INTERVAL = 30;               // ticks between group formation attempts
export const FAIR_GROUP_MIN_SIZE = 3;
export const FAIR_GROUP_MAX_SIZE = 8;
export const FAIR_GROUP_MAX_CONCURRENT = 3;                    // max simultaneous groups
export const FAIR_GROUP_ASSEMBLE_TIMEOUT = 25;                 // ticks to assemble before activating
// Per-type durations (active phase ticks)
export const FAIR_RACE_DURATION = 50;
export const FAIR_DANCE_DURATION = 70;
export const FAIR_SCAVENGER_DURATION = 80;
export const FAIR_TUG_DURATION = 40;
export const FAIR_PARADE_DURATION = 60;
export const FAIR_FEAST_DURATION = 60;
// Spatial
export const FAIR_DANCE_CIRCLE_RADIUS = 3;                    // tiles
export const FAIR_SCAVENGER_WAYPOINT_COUNT = 6;

// ── Milestones & Narrative Events ──────────────────────────────
export const MILESTONE_CHECK_INTERVAL = 8 * HOUR;             // check every 8 hours
export const NARRATIVE_EVENT_CHANCE = 0.003;
export const NARRATIVE_EVENT_INTERVAL = 1 * DAY;              // min 1 day between events

export const MilestoneId = {
  FIRST_HOUSE: 'first_house',
  FIRST_WINTER: 'first_winter',
  POP_10: 'pop_10',
  POP_20: 'pop_20',
  POP_50: 'pop_50',
  FIRST_TRADE: 'first_trade',
  FIRST_HARVEST: 'first_harvest',
  FIRST_BIRTH: 'first_birth',
  FIRST_SCHOOL: 'first_school',
  SELF_SUFFICIENT: 'self_sufficient',
} as const;
export type MilestoneId = (typeof MilestoneId)[keyof typeof MilestoneId];

// ── Animals & Livestock ────────────────────────────────────────
export const CHICKEN_CAPACITY = 8;
export const CATTLE_CAPACITY = 4;
export const ANIMAL_FEED_PER_TICK = 0.005;
export const ANIMAL_STARVE_HEALTH_DAMAGE = 0.02;
export const ANIMAL_COLD_HEALTH_DAMAGE = 0.01;
export const CHICKEN_EGG_TICKS = 12 * HOUR;                    // eggs twice per day — good laying hens
export const CHICKEN_FEATHER_TICKS = 1 * MONTH;               // feathers collected monthly
export const CATTLE_MILK_TICKS = 12 * HOUR;                   // milked twice daily
export const CATTLE_WOOL_TICKS = 1 * SEASON;                  // sheared once per season
export const ANIMAL_BREED_CHANCE = 0.002;
export const HAY_FROM_WHEAT = 2;

// ── Tavern & Social Buildings ──────────────────────────────────
export const TAVERN_HAPPINESS_PER_TICK = 0.03;
export const TAVERN_VISIT_CHANCE = 0.15;
export const TAVERN_EVENING_START = 0.6;
export const TAVERN_SOCIAL_RADIUS = 4;
export const TAVERN_STAY_DURATION = 3 * HOUR;  // 75 ticks — time spent drinking once arrived
export const WELL_HAPPINESS_RADIUS = 15;
export const WELL_HAPPINESS_PER_TICK = 0.002;
export const CHAPEL_WEDDING_HAPPINESS = 10;
export const CHAPEL_COMMUNITY_HAPPINESS = 0.001;

// ── Building Upgrades ─────────────────────────────────────────
export const STONE_ROAD_SPEED_MULT = 3.0;           // 3× speed vs dirt road's 2×
export const STONE_ROAD_PATH_COST = 0.3;            // cheaper path cost vs ROAD_PATH_COST = 0.5
export const STONE_WELL_HAPPINESS_RADIUS = 25;      // wider than Well's 15
export const STONE_WELL_HAPPINESS_PER_TICK = 0.004; // double Well's 0.002
export const ACADEMY_EDUCATION_BONUS = 1.75;        // vs EDUCATION_BONUS = 1.5
export const STONE_BARN_SPOILAGE_MULT = 0.1;        // half of BARN_SPOILAGE_MULT = 0.2

// ── Drag Placement ────────────────────────────────────────────
export const ROAD_DRAG_MAX_PATH = 80;
export const BRIDGE_DRAG_MAX_PATH = 40;
export const FLEXIBLE_MIN_SIZE = 3;
export const FLEXIBLE_MAX_SIZE = 20;

// Spatial hash
export const SPATIAL_CELL_SIZE = 8;

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

// ── Enums ──────────────────────────────────────────────────────
export const TileType = {
  GRASS: 0,
  FOREST: 1,
  WATER: 2,
  STONE: 3,
  IRON: 4,
  RIVER: 5,
  FERTILE: 6,
  ROAD: 7,
  BRIDGE: 8,
  STONE_ROAD: 9,
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
  // Animal products
  EGGS: 'eggs',
  MILK: 'milk',
  CHEESE: 'cheese',
  FEATHERS: 'feathers',
  HAY: 'hay',
  WOOL: 'wool',
  CLOTH: 'cloth',
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
  ResourceType.CHEESE,
];

export const ANIMAL_FOOD_TYPES: ResourceType[] = [
  ResourceType.EGGS,
  ResourceType.MILK,
];

export const ALL_FOOD_TYPES: ResourceType[] = [...FOOD_TYPES, ...COOKED_FOOD_TYPES, ...ANIMAL_FOOD_TYPES];

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
  BRIDGE: 'bridge',
  TOWN_HALL: 'town_hall',
  BAKERY: 'bakery',
  TAVERN: 'tavern',
  WELL: 'well',
  CHAPEL: 'chapel',
  CHICKEN_COOP: 'chicken_coop',
  PASTURE: 'pasture',
  DAIRY: 'dairy',
  QUARRY: 'quarry',
  MINE: 'mine',
  // ── Tier-2 upgraded buildings ──────────────────────────────
  STONE_HOUSE: 'stone_house',
  STONE_BARN: 'stone_barn',
  GATHERING_LODGE: 'gathering_lodge',
  HUNTING_LODGE: 'hunting_lodge',
  FORESTRY_HALL: 'forestry_hall',
  SAWMILL: 'sawmill',
  IRON_WORKS: 'iron_works',
  STONE_WELL: 'stone_well',
  ACADEMY: 'academy',
  STONE_ROAD: 'stone_road',
} as const;
export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType];

/** Buildings that consume firewood and provide warmth to occupants (indoors, has hearth/oven). */
export const HEATED_BUILDING_TYPES = new Set<string>([
  BuildingType.TAVERN,
  BuildingType.BAKERY,
  BuildingType.CHAPEL,
  BuildingType.TOWN_HALL,
]);

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
  HERDER: 'herder',
  DAIRYMAID: 'dairymaid',
  MINER: 'miner',
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

// Maps gather/mine buildings to their output resources for stock-limit checks.
export const BUILDING_LIMIT_RESOURCES: Partial<Record<string, string[]>> = {
  gathering_hut:   ['berries', 'mushrooms', 'roots'],
  hunting_cabin:   ['venison', 'leather'],
  fishing_dock:    ['fish'],
  herbalist:       ['herbs'],
  forester_lodge:  ['log'],
  // Tier-2 variants inherit same limits
  gathering_lodge: ['berries', 'mushrooms', 'roots'],
  hunting_lodge:   ['venison', 'leather'],
  forestry_hall:   ['log'],
  // Mine/quarry limits
  quarry:          ['stone'],
  mine:            ['iron'],
};

// ── Mine & Quarry ──────────────────────────────────────────────
export const QUARRY_UNDERGROUND_STONE_MIN = 800;
export const QUARRY_UNDERGROUND_STONE_MAX = 2000;
export const MINE_UNDERGROUND_IRON_MIN = 400;
export const MINE_UNDERGROUND_IRON_MAX = 1200;
export const MINE_ELEVATION_BONUS = 400;          // max bonus from high-elevation placement
export const MINE_SURFACE_BONUS_PER_TILE = 80;    // bonus per nearby surface deposit tile
export const MINE_SURFACE_SCAN_RADIUS = 15;       // radius to scan for surface deposits at build time
export const QUARRY_WORK_RADIUS = 20;
export const MINE_WORK_RADIUS = 20;
export const QUARRY_SURFACE_STONE_PER_HARVEST = 8;
export const MINE_SURFACE_IRON_PER_HARVEST = 5;
export const QUARRY_CYCLE_TICKS = 280;            // underground cycle (~9 game hours)
export const MINE_CYCLE_TICKS = 420;              // underground cycle (~14 game hours)
export const QUARRY_STONE_PER_CYCLE = 15;         // base underground extraction per cycle
export const MINE_IRON_PER_CYCLE = 10;
export const MINE_VEIN_DEPLETION_FAST = 0.7;      // >70% remaining: full extraction rate
export const MINE_VEIN_DEPLETION_SLOW = 0.3;      // <30% remaining: 40% rate
export const MINE_VEIN_EXHAUSTED_THRESHOLD = 5;   // units below which vein is "exhausted"
export const MINE_CARRY_BONUS_PER_SKILL = 1;      // extra units carried per skill level

export const BuildingCategory = {
  HOUSING: 'Housing',
  STORAGE: 'Storage',
  FOOD: 'Food',
  RESOURCE: 'Resource',
  SERVICES: 'Services',
  INFRASTRUCTURE: 'Infrastructure',
} as const;
export type BuildingCategory = (typeof BuildingCategory)[keyof typeof BuildingCategory];

// ── Work Hours & Leisure ───────────────────────────────────────
export const URGENT_RESOURCE_PER_VILLAGER = 10;
export const URGENT_FOOD_PER_VILLAGER = 14;
export const LEISURE_WEIGHT_READING = 15;
export const LEISURE_WEIGHT_TAVERN = 20;
export const LEISURE_WEIGHT_EXPLORING = 10;
export const LEISURE_WEIGHT_PARTNER = 25;
export const LEISURE_WEIGHT_PRACTICING = 10;
export const LEISURE_EXPLORE_ADVENTUROUS_MULT = 2.5;
export const LEISURE_PRACTICE_MIN_SKILL = 3;
export const LEISURE_READ_XP_RATE = 0.03;            // multiplier on SKILL_XP_PER_WORK_TICK
export const LEISURE_READ_HAPPINESS = 0.005;
export const LEISURE_EXPLORE_GATHER_XP = 0.02;
export const LEISURE_PARTNER_HAPPINESS = 0.008;
export const LEISURE_SOCIALIZE_HAPPINESS = 0.006;    // happiness on successful chat
export const LEISURE_PRACTICE_XP_MULT = 0.5;
export const LEISURE_PRACTICE_HAPPINESS = 0.003;
// ── Relationship System ───────────────────────────────────────
// Relationship score gains
export const REL_GAIN_SOCIAL_CHAT = 3;
export const REL_GAIN_WORK_TOGETHER = 0.1;
export const REL_GAIN_SAME_BUILDING = 0.05;
export const REL_GAIN_TAVERN = 2;
export const REL_GAIN_VISIT = 2;
export const REL_GAIN_LEISURE_PARTNER = 0.5;
export const REL_GAIN_RANDOM_RANGE = 0.5;
export const REL_MAX = 100;
// Partnership formation
export const PARTNERSHIP_MIN_REL_SCORE = 15;
export const PARTNERSHIP_BASE_CHANCE = 0.02;
export const PARTNERSHIP_AGE_BONUS_PER_YEAR = 0.002;
export const PARTNERSHIP_TRAIT_COMPAT_BONUS = 0.01;
export const PARTNERSHIP_EDUCATION_MATCH_BONUS = 0.01;
export const PARTNERSHIP_REL_SCORE_MULT = 0.001;
// Breakup / divorce
export const BREAKUP_CHECK_INTERVAL = 1 * MONTH;
export const BREAKUP_BASE_CHANCE_PARTNER = 0.03;
export const BREAKUP_BASE_CHANCE_MARRIED = 0.005;
export const BREAKUP_COMPAT_PENALTY = 0.04;
export const BREAKUP_TIME_REDUCTION_PER_MONTH = 0.002;
export const BREAKUP_MIN_CHANCE = 0.001;
export const BREAKUP_HAPPINESS_PENALTY = 15;
export const BREAKUP_REL_SCORE_DROP = 30;
// Marriage requirements
export const MARRIAGE_MIN_PARTNERSHIP_TICKS = 3 * MONTH;
export const MARRIAGE_REQUIRES_CHAPEL = true;
export const MARRIAGE_BASE_CHANCE = 0.04;
export const MARRIAGE_COMPAT_BONUS = 0.03;
export const MARRIAGE_REL_SCORE_BONUS = 0.0005;
// Conception (relationship-weighted)
export const CONCEPTION_BASE_NON_PARTNER = 0.0004;
export const CONCEPTION_BASE_PARTNER = 0.01;
export const CONCEPTION_BASE_MARRIED = 0.02;
export const CONCEPTION_COMPAT_MULT_MAX = 1.5;
export const CONCEPTION_DURATION_BONUS_PER_MONTH = 0.002;
export const CONCEPTION_DURATION_MAX_MONTHS = 12;
export const LEISURE_CONCEPTION_BOOST_MULT = 2.5;
export const LEISURE_PARTNER_WAIT_TICKS = 25;        // 1 in-game hour
// Proximity-based opportunistic socializing
export const LEISURE_SOCIAL_SCAN_RADIUS = 8;         // tile radius to look for social encounters
export const LEISURE_SOCIAL_INITIATE_CHANCE = 0.20;  // per-AI-tick probability A scans for a partner
export const LEISURE_SOCIAL_RESPOND_CHANCE = 0.50;   // B's acceptance chance when off-duty
export const LEISURE_SOCIAL_RESPOND_CHANCE_WORKING = 0.15; // B's acceptance chance when on-duty
// Recreational fishing
export const LEISURE_WEIGHT_FISHING = 12;
export const LEISURE_FISHING_SCAN_RADIUS = 12;       // tile radius to search for water-adjacent tile
export const LEISURE_FISHING_HAPPINESS = 0.004;      // per AI tick while at the water
export const LEISURE_FISHING_XP_RATE = 0.08;         // multiplier on SKILL_XP_PER_WORK_TICK
export const LEISURE_FISHING_YIELD = 1;              // fish added to global stores per session
// Visiting neighbors
export const LEISURE_WEIGHT_VISITING = 12;
export const LEISURE_VISIT_SCAN_RADIUS = 20;         // tile radius to search for a neighbor's house
export const LEISURE_VISIT_HAPPINESS = 0.006;        // per AI tick for the visitor
export const LEISURE_VISIT_HOST_HAPPINESS = 0.003;   // per AI tick for each resident
// Napping
export const LEISURE_WEIGHT_NAPPING = 20;
export const LEISURE_NAP_ENERGY_THRESHOLD = 60;      // only nap when energy is below this
export const LEISURE_NAP_DURATION = 2 * HOUR;        // 50 ticks = 2 in-game hours
// Mentoring
export const LEISURE_WEIGHT_MENTORING = 8;
export const LEISURE_MENTOR_MIN_SKILL = 4;           // minimum skill level to offer mentoring
export const LEISURE_MENTOR_XP_BONUS = 2.0;         // XP rate multiplier applied to each mentee
export const LEISURE_MENTOR_HAPPINESS = 0.004;       // per AI tick for the mentor
// Chapel leisure visit
export const LEISURE_WEIGHT_CHAPEL = 15;
export const LEISURE_CHAPEL_HAPPINESS_PER_TICK = 0.015;
export const LEISURE_CHAPEL_HEALTH_PER_TICK = 0.008;
// Foraging walk
export const LEISURE_WEIGHT_FORAGING = 12;
export const LEISURE_FORAGING_SCAN_RADIUS = 10;     // tile radius to search for berry/mushroom tile
export const LEISURE_FORAGING_HAPPINESS = 0.003;    // per AI tick while at the forage spot
export const LEISURE_FORAGING_GATHER_XP = 0.06;    // XP rate multiplier while foraging
export const LEISURE_FORAGING_YIELD = 2;            // resources collected per foraging session
// Teaching children informally
export const LEISURE_WEIGHT_TEACHING = 10;
export const LEISURE_TEACH_SCAN_RADIUS = 6;         // tile radius to search for uneducated child
export const LEISURE_TEACH_HAPPINESS = 0.005;       // per AI tick while teaching
export const LEISURE_TEACH_CHILD_PROGRESS = 0.08;  // education progress per AI tick while being taught
export const EDUCATION_PROGRESS_NEEDED = 100;       // total progress to graduate early
export const SCHOOL_EDUCATION_RATE = 0.5;           // progress per AI tick while attending school
// Bathing
export const LEISURE_WEIGHT_BATHING = 12;
export const LEISURE_BATHING_HEALTH = 0.015;        // health gained per AI tick while bathing
export const LEISURE_BATHING_HAPPINESS = 0.005;     // happiness gained per AI tick while bathing
export const BATHE_DISEASE_SPREAD_MULT = 0.3;       // disease spread chance multiplier for clean citizens
export const BATHE_CLEAN_DURATION_TICKS = 1 * DAY; // how long a bathe keeps the citizen "clean"
// Market browsing
export const LEISURE_WEIGHT_MARKET = 14;
export const LEISURE_MARKET_HAPPINESS = 0.008;      // happiness per AI tick while browsing market
// Stargazing
export const LEISURE_WEIGHT_STARGAZING = 10;
export const LEISURE_STARGAZING_MIN_DAYPROGRESS = 0.65; // only available after dusk
export const LEISURE_STARGAZING_HAPPINESS = 0.005;      // per AI tick while stargazing
export const LEISURE_STARGAZING_ADVENTUROUS_MULT = 2.0; // happiness multiplier for ADVENTUROUS trait
// Campfire storytelling
export const LEISURE_WEIGHT_CAMPFIRE = 18;
export const LEISURE_CAMPFIRE_SCAN_RADIUS = 12;         // tile radius to look for GRASS or existing fire
export const LEISURE_CAMPFIRE_DURATION = 4 * HOUR;      // 100 ticks sitting at the campfire
export const LEISURE_CAMPFIRE_HAPPINESS = 0.010;        // per AI tick while at the campfire
export const LEISURE_CAMPFIRE_JOIN_RADIUS = 8;          // radius to spot a neighbour's active campfire
export const LEISURE_CAMPFIRE_MIN_DAYPROGRESS = 0.60;  // only available from mid-evening onward
export const LEISURE_CAMPFIRE_FIREWOOD = 1;             // firewood consumed per new campfire started
// Recreational hunting
export const LEISURE_WEIGHT_HUNTING = 11;
export const LEISURE_HUNTING_SCAN_RADIUS = 15;          // tile radius to search for wildlife tile
export const LEISURE_HUNTING_HAPPINESS = 0.004;         // per AI tick while hunting
export const LEISURE_HUNTING_XP_RATE = 0.08;            // XP rate multiplier for hunting skill
export const LEISURE_HUNTING_YIELD = 1;                 // venison added per successful hunt
// Swimming
export const LEISURE_WEIGHT_SWIMMING = 13;
export const LEISURE_SWIMMING_HAPPINESS = 0.008;        // per AI tick while swimming (more fun than bathing)
export const LEISURE_SWIMMING_HEALTH = 0.005;           // per AI tick while swimming
export const LEISURE_SWIMMING_ENERGY = 0.02;            // energy recovered per AI tick while swimming
// Garden tending
export const LEISURE_WEIGHT_GARDENING = 11;
export const LEISURE_GARDENING_RADIUS = 8;              // tile radius from home to look for fertile tile
export const LEISURE_GARDENING_HAPPINESS = 0.006;       // per AI tick while gardening
export const LEISURE_GARDENING_YIELD = 2;               // resources collected per gardening session
// Visiting the sick
export const LEISURE_WEIGHT_COMFORTING = 12;
export const LEISURE_COMFORT_SCAN_RADIUS = 20;          // tile radius to search for sick neighbours
export const LEISURE_COMFORT_HAPPINESS_SELF = 0.005;   // per AI tick for the comforter
export const LEISURE_COMFORT_HAPPINESS_SICK = 0.012;   // per AI tick for the sick citizen
export const LEISURE_COMFORT_HEALTH_SICK = 0.004;      // health per AI tick for the sick citizen
