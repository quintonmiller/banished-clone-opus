import type { Game } from '../Game';
import {
  ACHIEVEMENT_CHECK_INTERVAL, NARRATIVE_EVENT_CHANCE, NARRATIVE_EVENT_INTERVAL,
  AchievementId, BuildingType, Season, ResourceType, ALL_FOOD_TYPES, COOKED_FOOD_TYPES,
  SKILL_MAX_LEVEL, TileType, ALL_TRAITS, DAWN_START,
} from '../constants';
import { ACHIEVEMENT_MAP, NON_SECRET_COUNT } from '../data/AchievementDefs';
import { AchievementStore } from '../save/AchievementStore';

interface NarrativeEventDef {
  text: (citizenName: string) => string;
  effect: 'happiness' | 'food' | 'resource' | 'skill';
  value: number;
  resourceType?: string;
}

const NARRATIVE_EVENTS: NarrativeEventDef[] = [
  { text: (n) => `${n} found wild berries while wandering`, effect: 'food', value: 15 },
  { text: (n) => `${n} discovered an old map near the river`, effect: 'happiness', value: 5 },
  { text: (n) => `${n} spotted a deer trail in the forest`, effect: 'food', value: 10 },
  { text: (n) => `${n} found useful stones while clearing land`, effect: 'resource', value: 8, resourceType: 'stone' },
  { text: (n) => `${n} told a wonderful story by the fire`, effect: 'happiness', value: 8 },
  { text: (n) => `${n} found iron scraps near the riverbed`, effect: 'resource', value: 3, resourceType: 'iron' },
  { text: (n) => `${n} caught extra fish on a lucky day`, effect: 'resource', value: 6, resourceType: 'fish' },
  { text: (n) => `${n} helped a neighbor repair their roof`, effect: 'happiness', value: 4 },
  { text: (n) => `${n} found a patch of medicinal herbs`, effect: 'resource', value: 4, resourceType: 'herbs' },
  { text: (n) => `${n} taught the children a new game`, effect: 'happiness', value: 6 },
];

// Base building types (excluding tier-2/upgraded and infrastructure)
const BASE_BUILDING_TYPES = new Set([
  BuildingType.WOODEN_HOUSE, BuildingType.STORAGE_BARN, BuildingType.CROP_FIELD,
  BuildingType.GATHERING_HUT, BuildingType.HUNTING_CABIN, BuildingType.FISHING_DOCK,
  BuildingType.FORESTER_LODGE, BuildingType.WOOD_CUTTER, BuildingType.BLACKSMITH,
  BuildingType.TAILOR, BuildingType.HERBALIST, BuildingType.MARKET, BuildingType.SCHOOL,
  BuildingType.TRADING_POST, BuildingType.TOWN_HALL, BuildingType.BAKERY,
  BuildingType.TAVERN, BuildingType.WELL, BuildingType.CHAPEL,
  BuildingType.CHICKEN_COOP, BuildingType.PASTURE, BuildingType.DAIRY,
  BuildingType.QUARRY, BuildingType.MINE,
]);

const UPGRADEABLE_TYPES = new Set([
  BuildingType.WOODEN_HOUSE, BuildingType.STORAGE_BARN, BuildingType.GATHERING_HUT,
  BuildingType.HUNTING_CABIN, BuildingType.FORESTER_LODGE, BuildingType.WOOD_CUTTER,
  BuildingType.BLACKSMITH, BuildingType.WELL, BuildingType.SCHOOL, BuildingType.ROAD,
]);

const STONE_TIER_TYPES = new Set([
  BuildingType.STONE_HOUSE, BuildingType.STONE_BARN, BuildingType.GATHERING_LODGE,
  BuildingType.HUNTING_LODGE, BuildingType.FORESTRY_HALL, BuildingType.SAWMILL,
  BuildingType.IRON_WORKS, BuildingType.STONE_WELL, BuildingType.ACADEMY,
]);

export class AchievementSystem {
  private game: Game;
  private tickCounter = 0;
  private bonuses = new Map<string, number>();
  private earnedThisGame = new Set<string>();
  private lastNarrativeTick = 0;
  private narrativeCount = 0;

  // Legacy milestone tracking state
  private deathsBeforeFirstWinter = 0;
  private passedFirstWinter = false;

  // Per-game counters / flags for achievement tracking
  private totalBuildingsCompleted = 0;
  private totalUpgrades = 0;
  private totalTradesCompleted = 0;
  private birthsThisYear = 0;
  private deathsThisYear = 0;
  private totalDeathsAllTime = 0;
  private currentYear = 1;
  private minPopulation = 999;
  private recoveredFromSpiral = false;
  private everBuiltTavern = false;
  private everAcceptedNomads = false;
  private everHuntedOrRaisedCattle = false;
  private everTraded = false;
  private festivalTypesHosted = new Set<string>();
  private uniqueFairRewardsThisGame = new Set<string>();
  private buildingTypesBuilt = new Set<string>();
  private upgradedTypes = new Set<string>();
  private weatherSurvived = new Set<string>();
  private stormCollapsesDuringWeather = 0;
  private droughtDeathsDuringWeather = 0;
  private currentWeather: string | null = null;

  constructor(game: Game) {
    this.game = game;
    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    const bus = this.game.eventBus;

    bus.on('citizen_born', () => {
      this.birthsThisYear++;
      this.tryUnlock(AchievementId.FIRST_BIRTH);
    });

    bus.on('citizen_died', () => {
      this.totalDeathsAllTime++;
      this.deathsThisYear++;
      if (!this.passedFirstWinter) this.deathsBeforeFirstWinter++;
      if (this.currentWeather === 'drought') this.droughtDeathsDuringWeather++;
    });

    bus.on('trade_completed', () => {
      this.totalTradesCompleted++;
      this.everTraded = true;
      this.tryUnlock(AchievementId.FIRST_TRADE);
      if (this.totalTradesCompleted >= 10) this.tryUnlock(AchievementId.TRADE_10);
      if (this.totalTradesCompleted >= 25) this.tryUnlock(AchievementId.TRADE_25);
    });

    bus.on('building_completed', (data: any) => {
      this.totalBuildingsCompleted++;
      if (data.type) this.buildingTypesBuilt.add(data.type);
      this.tryUnlock(AchievementId.FIRST_BUILDING);
      if (this.totalBuildingsCompleted >= 10) this.tryUnlock(AchievementId.BUILD_10);
      if (this.totalBuildingsCompleted >= 25) this.tryUnlock(AchievementId.BUILD_25);
      if (this.totalBuildingsCompleted >= 50) this.tryUnlock(AchievementId.BUILD_50);
      if (this.totalBuildingsCompleted >= 100) this.tryUnlock(AchievementId.BUILD_100);
      if (data.type === BuildingType.TOWN_HALL) this.tryUnlock(AchievementId.TOWN_HALL_BUILT);
      if (data.type === BuildingType.BRIDGE) this.tryUnlock(AchievementId.BRIDGE_BUILDER);
      if (data.type === BuildingType.TAVERN) this.everBuiltTavern = true;
      if (data.type === BuildingType.CHICKEN_COOP || data.type === BuildingType.PASTURE) {
        this.tryUnlock(AchievementId.FIRST_LIVESTOCK);
      }
    });

    bus.on('building_upgraded', (data: any) => {
      this.totalUpgrades++;
      if (data.type) this.upgradedTypes.add(data.fromType || data.type);
      this.tryUnlock(AchievementId.FIRST_UPGRADE);
      if (this.totalUpgrades >= 5) this.tryUnlock(AchievementId.UPGRADE_5);
    });

    bus.on('wedding', () => {
      this.tryUnlock(AchievementId.FIRST_WEDDING);
      // Check for midnight wedding
      const dayProgress = this.game.state.dayProgress;
      if (dayProgress < 0.1 || dayProgress > 0.9) {
        this.tryUnlock(AchievementId.MIDNIGHT_WEDDING);
      }
    });

    bus.on('nomads_arrived', () => {
      this.everAcceptedNomads = true;
    });

    bus.on('festival_started', (data: any) => {
      if (data.type) this.festivalTypesHosted.add(data.type);
      this.tryUnlock(AchievementId.FIRST_FESTIVAL);
      if (this.festivalTypesHosted.size >= 4) this.tryUnlock(AchievementId.ALL_FESTIVALS);
      // Secret: frost fair during harsh winter
      if (data.type === 'frost_fair' && this.currentWeather === 'harsh_winter') {
        this.tryUnlock(AchievementId.SNOWBALL_FIGHT);
      }
    });

    bus.on('fair_reward_chosen', (data: any) => {
      if (data.rewardId) {
        this.uniqueFairRewardsThisGame.add(data.rewardId);
        AchievementStore.addFairReward(data.rewardId);
        if (this.uniqueFairRewardsThisGame.size >= 10) {
          this.tryUnlock(AchievementId.FESTIVAL_ALL_REWARDS);
        }
      }
    });

    bus.on('narrative_event', () => {
      this.narrativeCount++;
      if (this.narrativeCount >= 10) this.tryUnlock(AchievementId.NARRATIVE_10);
      if (this.narrativeCount >= 25) this.tryUnlock(AchievementId.NARRATIVE_25);
    });

    bus.on('weather_started', (data: any) => {
      this.currentWeather = data.type;
      this.stormCollapsesDuringWeather = 0;
      this.droughtDeathsDuringWeather = 0;
    });

    bus.on('weather_cleared', () => {
      if (this.currentWeather === 'harsh_winter') {
        this.tryUnlock(AchievementId.SURVIVE_HARSH_WINTER);
      }
      if (this.currentWeather === 'storm' && this.stormCollapsesDuringWeather === 0) {
        this.tryUnlock(AchievementId.SURVIVE_STORM);
      }
      if (this.currentWeather === 'drought' && this.droughtDeathsDuringWeather === 0) {
        this.tryUnlock(AchievementId.SURVIVE_DROUGHT);
      }
      this.weatherSurvived.add(this.currentWeather!);
      this.currentWeather = null;
    });

    bus.on('building_collapsed', () => {
      if (this.currentWeather === 'storm') this.stormCollapsesDuringWeather++;
    });

    bus.on('new_year', (data: any) => {
      const completedYear = data.year - 1;
      this.currentYear = data.year;

      // Year survival achievements
      if (completedYear >= 1) this.tryUnlock(AchievementId.SURVIVE_1_YEAR);
      if (completedYear >= 3) this.tryUnlock(AchievementId.SURVIVE_3_YEARS);
      if (completedYear >= 5) this.tryUnlock(AchievementId.SURVIVE_5_YEARS);
      if (completedYear >= 10) this.tryUnlock(AchievementId.SURVIVE_10_YEARS);
      if (completedYear >= 25) this.tryUnlock(AchievementId.SURVIVE_25_YEARS);
      if (completedYear >= 50) this.tryUnlock(AchievementId.SURVIVE_50_YEARS);

      // No-death year achievements
      if (this.deathsThisYear === 0) {
        if (completedYear >= 1) this.tryUnlock(AchievementId.NO_DEATHS_YEAR_1);
      }
      if (this.totalDeathsAllTime === 0) {
        if (completedYear >= 3) this.tryUnlock(AchievementId.NO_DEATHS_YEAR_3);
        if (completedYear >= 5) this.tryUnlock(AchievementId.NO_DEATHS_YEAR_5);
        if (completedYear >= 10) this.tryUnlock(AchievementId.NO_DEATHS_YEAR_10);
      }

      // Challenge: no traders for 5 years
      if (completedYear >= 5 && !this.everTraded) {
        this.tryUnlock(AchievementId.NO_TRADERS_YEAR_5);
      }

      // Baby boom (5+ births this year)
      if (this.birthsThisYear >= 5) this.tryUnlock(AchievementId.BABY_BOOM);

      // Secret: double digits (10 deaths in a year)
      if (this.deathsThisYear >= 10) this.tryUnlock(AchievementId.DOUBLE_DIGITS);

      // Reset yearly counters
      this.birthsThisYear = 0;
      this.deathsThisYear = 0;
    });

    bus.on('season_changed', (data: any) => {
      // First winter survived (check at end of late winter going into spring)
      if (!this.passedFirstWinter && this.game.state.year >= 2 && data.subSeason === Season.EARLY_SPRING) {
        this.passedFirstWinter = true;
        if (this.deathsBeforeFirstWinter === 0) {
          this.tryUnlock(AchievementId.SURVIVE_FIRST_WINTER);
        }
      }
    });
  }

  update(): void {
    this.tickCounter++;

    // Narrative events (same logic as MilestoneSystem)
    if (this.game.state.tick - this.lastNarrativeTick > NARRATIVE_EVENT_INTERVAL) {
      if (this.game.rng.chance(NARRATIVE_EVENT_CHANCE)) {
        this.triggerNarrativeEvent();
      }
    }

    if (this.tickCounter % ACHIEVEMENT_CHECK_INTERVAL !== 0) return;

    const pop = this.game.state.population;

    // Track minimum population for spiral detection
    if (pop < this.minPopulation) this.minPopulation = pop;
    if (!this.recoveredFromSpiral && this.minPopulation < 5 && pop >= 10) {
      this.recoveredFromSpiral = true;
      this.tryUnlock(AchievementId.RECOVER_FROM_SPIRAL);
    }

    // Population milestones (start at 30 since game begins with 22)
    if (pop >= 30) this.tryUnlock(AchievementId.POP_30);
    if (pop >= 50) this.tryUnlock(AchievementId.POP_50);
    if (pop >= 75) this.tryUnlock(AchievementId.POP_75);
    if (pop >= 100) this.tryUnlock(AchievementId.POP_100);
    if (pop >= 150) this.tryUnlock(AchievementId.POP_150);
    if (pop >= 200) this.tryUnlock(AchievementId.POP_200);

    // Building checks
    const buildings = this.game.world.getComponentStore<any>('building');
    if (buildings) {
      let completedCount = 0;
      let houseCount = 0;
      let occupiedHouseCount = 0;
      const builtTypes = new Set<string>();
      let stoneTierCount = 0;
      let hasCompletedMine = false;
      let hasCompletedBlacksmith = false;

      for (const [, bld] of buildings) {
        if (!bld.completed) continue;
        completedCount++;
        builtTypes.add(bld.type);
        if (bld.type === BuildingType.WOODEN_HOUSE || bld.type === BuildingType.STONE_HOUSE) {
          houseCount++;
          // Check if house has occupants
          const occupants = this.game.world.getComponentStore<any>('citizen');
          if (occupants) {
            for (const [, cit] of occupants) {
              if (cit.homeId === bld.entityId) {
                occupiedHouseCount++;
                break;
              }
            }
          }
        }
        if (STONE_TIER_TYPES.has(bld.type)) {
          stoneTierCount++;
          this.upgradedTypes.add(bld.type);
        }
        if (bld.type === BuildingType.MINE) hasCompletedMine = true;
        if (bld.type === BuildingType.BLACKSMITH) hasCompletedBlacksmith = true;
      }

      if (completedCount > 0) this.tryUnlock(AchievementId.FIRST_BUILDING);
      if (completedCount >= 10) this.tryUnlock(AchievementId.BUILD_10);
      if (completedCount >= 25) this.tryUnlock(AchievementId.BUILD_25);
      if (completedCount >= 50) this.tryUnlock(AchievementId.BUILD_50);
      if (completedCount >= 100) this.tryUnlock(AchievementId.BUILD_100);

      // Build all base types check
      let hasAllBase = true;
      for (const t of BASE_BUILDING_TYPES) {
        if (!builtTypes.has(t)) { hasAllBase = false; break; }
      }
      if (hasAllBase) this.tryUnlock(AchievementId.BUILD_ALL_TYPES);

      // Upgrade all types
      let hasAllUpgrades = true;
      for (const t of UPGRADEABLE_TYPES) {
        if (!this.upgradedTypes.has(t)) { hasAllUpgrades = false; break; }
      }
      if (hasAllUpgrades) this.tryUnlock(AchievementId.UPGRADE_ALL);

      // Stone age
      if (stoneTierCount >= 3) this.tryUnlock(AchievementId.STONE_AGE);

      // Full house (require minimum 8 houses to prevent trivial start-game trigger)
      if (houseCount >= 8 && occupiedHouseCount >= houseCount) {
        this.tryUnlock(AchievementId.FULL_HOUSE);
      }

      // Ghost town
      if (houseCount >= 10 && occupiedHouseCount === 0) {
        this.tryUnlock(AchievementId.GHOST_TOWN);
      }

      // Town Hall speed build
      if (builtTypes.has(BuildingType.TOWN_HALL) && this.game.state.year <= 2) {
        this.tryUnlock(AchievementId.SPEED_BUILD_TOWN_HALL);
      }

      // Speed year 1
      if (completedCount >= 5 && this.game.state.year <= 1) {
        this.tryUnlock(AchievementId.SPEED_YEAR_1);
      }

      // Minimal housing (require 30+ pop — not trivially true at start)
      if (pop >= 30 && houseCount <= 5) {
        this.tryUnlock(AchievementId.MINIMAL_HOUSING);
      }

      // No tavern pop 30
      if (pop >= 30 && !this.everBuiltTavern) {
        this.tryUnlock(AchievementId.NO_TAVERN_POP_30);
      }

      // No nomads pop 30
      if (pop >= 30 && !this.everAcceptedNomads) {
        this.tryUnlock(AchievementId.NO_NOMADS_POP_30);
      }

      // One of each (exactly one of every base type)
      let hasOneOfEach = true;
      for (const t of BASE_BUILDING_TYPES) {
        let count = 0;
        for (const [, b] of buildings) {
          if (b.completed && b.type === t) count++;
        }
        if (count !== 1) { hasOneOfEach = false; break; }
      }
      if (hasOneOfEach && builtTypes.size >= BASE_BUILDING_TYPES.size) {
        this.tryUnlock(AchievementId.ONE_OF_EACH);
      }

      // Road network (raised to 100)
      let roadCount = 0;
      for (let i = 0; i < this.game.tileMap.tiles.length; i++) {
        const tile = this.game.tileMap.tiles[i];
        if (tile.type === TileType.ROAD || tile.type === TileType.STONE_ROAD) roadCount++;
      }
      if (roadCount >= 100) this.tryUnlock(AchievementId.ROAD_NETWORK_100);

      // Iron age — require a completed mine (not just starting stockpile)
      if (hasCompletedMine && this.game.getResource(ResourceType.IRON) > 0) {
        this.tryUnlock(AchievementId.IRON_AGE);
      }

      // Tool maker — require a completed blacksmith (not just starting stockpile)
      if (hasCompletedBlacksmith && this.game.getResource(ResourceType.TOOL) > 0) {
        this.tryUnlock(AchievementId.TOOL_MAKER);
      }
    }

    // Economy checks
    const totalFood = this.game.getTotalFood();
    if (totalFood >= 500) this.tryUnlock(AchievementId.FOOD_STOCKPILE_500);
    if (totalFood >= 2000) this.tryUnlock(AchievementId.FOOD_STOCKPILE_2000);
    if (totalFood >= 5000) this.tryUnlock(AchievementId.FOOD_STOCKPILE_5000);

    // Resource hoarder
    if (this.game.getResource(ResourceType.LOG) >= 500 &&
        this.game.getResource(ResourceType.STONE) >= 500 &&
        this.game.getResource(ResourceType.IRON) >= 500) {
      this.tryUnlock(AchievementId.RESOURCE_HOARDER);
    }

    // Self-sufficient check (legacy milestone)
    const hasFoodTypes = this.game.getResource('berries') > 0 &&
      this.game.getResource('venison') > 0 &&
      this.game.getResource('fish') > 0;
    const hasGoods = this.game.getResource('tool') > 0 &&
      this.game.getResource('coat') > 0 &&
      this.game.getResource('firewood') > 0;
    if (hasFoodTypes && hasGoods) {
      this.tryUnlock(AchievementId.SELF_SUFFICIENT);
    }

    // All food types
    let hasAllFood = true;
    for (const ft of ALL_FOOD_TYPES) {
      if (this.game.getResource(ft) <= 0) { hasAllFood = false; break; }
    }
    if (hasAllFood) this.tryUnlock(AchievementId.ALL_FOOD_TYPES);

    // Master chef
    let hasAllCooked = true;
    for (const ct of COOKED_FOOD_TYPES) {
      if (this.game.getResource(ct) <= 0) { hasAllCooked = false; break; }
    }
    if (hasAllCooked) this.tryUnlock(AchievementId.MASTER_CHEF);

    // Zero food secret
    if (totalFood === 0 && pop >= 20) {
      this.tryUnlock(AchievementId.ZERO_FOOD);
    }

    // Lone survivor
    if (pop === 1) {
      this.tryUnlock(AchievementId.LONE_SURVIVOR);
    }

    // Animal farm (both chickens and cattle)
    if (this.game.livestockSystem) {
      const livestockStore = this.game.world.getComponentStore<any>('building');
      let hasChickens = false;
      let hasCattle = false;
      if (livestockStore) {
        for (const [id, bld] of livestockStore) {
          if (!bld.completed) continue;
          if (bld.type === BuildingType.CHICKEN_COOP) {
            const data = this.game.livestockSystem.getLivestockData(id);
            if (data && data.animalCount > 0) hasChickens = true;
          }
          if (bld.type === BuildingType.PASTURE) {
            const data = this.game.livestockSystem.getLivestockData(id);
            if (data && data.animalCount > 0) hasCattle = true;
          }
        }
      }
      if (hasChickens && hasCattle) this.tryUnlock(AchievementId.ANIMAL_FARM);
    }

    // Citizen-based checks
    const citizens = this.game.world.getComponentStore<any>('citizen');
    const workers = this.game.world.getComponentStore<any>('worker');
    const needs = this.game.world.getComponentStore<any>('needs');

    if (citizens) {
      let maxAge = 0;
      let adultCount = 0;
      let assignedCount = 0;
      let awakeAtNight = 0;
      let workingAtDawn = 0;
      let educatedCount = 0;
      let totalHappiness = 0;
      let happinessCount = 0;
      const traitsFound = new Set<string>();
      const familySizes = new Map<number, number>(); // motherId -> childCount

      for (const [id, cit] of citizens) {
        if (cit.age > maxAge) maxAge = cit.age;

        // Track traits
        if (cit.traits) {
          for (const t of cit.traits) traitsFound.add(t);
        }

        if (!cit.isChild) {
          adultCount++;
          // Check education
          if (cit.isEducated) educatedCount++;
        }

        // Worker assignment check
        const worker = workers?.get(id);
        if (worker?.workplaceId !== null && worker?.workplaceId !== undefined) {
          assignedCount++;
        }

        // Night owl / early bird
        const dayProgress = this.game.state.dayProgress;
        if (this.game.state.isNight && !cit.isSleeping) awakeAtNight++;
        if (dayProgress >= DAWN_START && dayProgress < DAWN_START + 0.05 && worker?.workplaceId) {
          workingAtDawn++;
        }

        // Happiness tracking
        const need = needs?.get(id);
        if (need) {
          totalHappiness += need.happiness;
          happinessCount++;
        }

        // Family tracking
        if (cit.motherId) {
          familySizes.set(cit.motherId, (familySizes.get(cit.motherId) || 0) + 1);
        }

        // Master skill
        if (worker?.skills) {
          for (const skillKey of Object.keys(worker.skills)) {
            if (worker.skills[skillKey].level >= SKILL_MAX_LEVEL) {
              this.tryUnlock(AchievementId.MASTER_SKILL);
            }
          }
        }
      }

      // Elder 70 / 80
      if (maxAge >= 70) this.tryUnlock(AchievementId.ELDER_70);
      if (maxAge >= 80) this.tryUnlock(AchievementId.ELDER_80);

      // Centenarian
      if (maxAge >= 100) this.tryUnlock(AchievementId.CENTENARIAN);

      // Night owl (raised to 10+ to prevent trivial trigger with 22 starting citizens)
      if (awakeAtNight >= 10) this.tryUnlock(AchievementId.NIGHT_OWL);

      // Early bird
      if (workingAtDawn >= 5) this.tryUnlock(AchievementId.EARLY_BIRD);

      // Educated village
      if (educatedCount >= 5) this.tryUnlock(AchievementId.EDUCATED_VILLAGE);

      // All traits (require 30+ population to prevent trivial start-game trigger)
      if (pop >= 30 && traitsFound.size >= ALL_TRAITS.length) {
        this.tryUnlock(AchievementId.ALL_TRAITS);
      }

      // Cheerful village (raised thresholds: 85+ happiness, 20+ citizens)
      if (happinessCount >= 20 && totalHappiness / happinessCount > 85) {
        this.tryUnlock(AchievementId.CHEERFUL_VILLAGE);
      }

      // Full employment
      if (adultCount > 0 && assignedCount >= adultCount) {
        this.tryUnlock(AchievementId.FULL_EMPLOYMENT);
      }

      // Family of five (3+ children from same mother)
      for (const [, count] of familySizes) {
        if (count >= 3) {
          this.tryUnlock(AchievementId.FAMILY_OF_FIVE);
          break;
        }
      }
    }

    // Vegetarian village (3 years, no hunting/cattle)
    if (this.game.state.year >= 4 && !this.everHuntedOrRaisedCattle) {
      this.tryUnlock(AchievementId.VEGETARIAN_VILLAGE);
    }

    // Seed 42
    if (this.game.seed === 42) {
      this.tryUnlock(AchievementId.SEED_42);
    }

    // Overachiever (all non-secret achievements)
    const nonSecretUnlocked = [...this.earnedThisGame].filter(id => {
      const def = ACHIEVEMENT_MAP.get(id);
      return def && !def.secret;
    }).length;
    if (nonSecretUnlocked >= NON_SECRET_COUNT) {
      this.tryUnlock(AchievementId.ALL_MILESTONES);
    }
  }

  private tryUnlock(id: string): void {
    if (this.earnedThisGame.has(id)) return;

    const def = ACHIEVEMENT_MAP.get(id);
    if (!def) return;

    this.earnedThisGame.add(id);

    // Apply per-game bonus if defined
    if (def.bonusType && def.bonusValue) {
      const current = this.bonuses.get(def.bonusType) || 0;
      this.bonuses.set(def.bonusType, current + def.bonusValue);
    }

    // Persist to cross-game store
    const isFirstEver = AchievementStore.unlock(id);

    // Emit event for UI
    this.game.eventBus.emit('achievement_unlocked', {
      id: def.id,
      name: def.name,
      description: def.description,
      bonusDescription: def.bonusDescription,
      isFirstEver,
    });
  }

  private triggerNarrativeEvent(): void {
    this.lastNarrativeTick = this.game.state.tick;

    const citizens = this.game.world.getComponentStore<any>('citizen');
    if (!citizens || citizens.size === 0) return;

    const citizenEntries = [...citizens.entries()];
    const [citizenId, citizen] = this.game.rng.pick(citizenEntries);
    if (!citizen || citizen.isChild) return;

    const event = this.game.rng.pick(NARRATIVE_EVENTS);
    const text = event.text(citizen.name);

    switch (event.effect) {
      case 'happiness': {
        const needs = this.game.world.getComponent<any>(citizenId, 'needs');
        if (needs) needs.happiness = Math.min(100, needs.happiness + event.value);
        break;
      }
      case 'food': {
        this.game.addResource('berries', event.value);
        break;
      }
      case 'resource': {
        if (event.resourceType) {
          this.game.addResource(event.resourceType, event.value);
        }
        break;
      }
    }

    this.game.eventBus.emit('narrative_event', { text, citizenId });
  }

  /** Get accumulated bonus value for a bonus type (same API as MilestoneSystem.getBonus) */
  getBonus(bonusType: string): number {
    return this.bonuses.get(bonusType) || 0;
  }

  /** Called at game end to flush cross-game stats */
  onGameEnd(): void {
    AchievementStore.incrementStat('totalGamesPlayed', 1);
    AchievementStore.incrementStat('totalYearsSurvived', this.game.state.year - 1);
    AchievementStore.incrementStat('totalCitizensBorn', this.game.state.totalBirths);
    AchievementStore.incrementStat('totalCitizensDied', this.game.state.totalDeaths);
    AchievementStore.incrementStat('totalBuildingsBuilt', this.totalBuildingsCompleted);
    AchievementStore.incrementStat('totalTradesCompleted', this.totalTradesCompleted);
    AchievementStore.incrementStat('narrativeEventCount', this.narrativeCount);
    AchievementStore.flushStats();
  }

  /** Scan existing world state (for loaded games) */
  scanExistingState(): void {
    const buildings = this.game.world.getComponentStore<any>('building');
    if (buildings) {
      for (const [, bld] of buildings) {
        if (!bld.completed) continue;
        this.buildingTypesBuilt.add(bld.type);
        this.totalBuildingsCompleted++;
        if (bld.type === BuildingType.TAVERN) this.everBuiltTavern = true;
        if (STONE_TIER_TYPES.has(bld.type)) this.upgradedTypes.add(bld.type);
      }
    }
  }

  getInternalState(): any {
    return {
      earned: [...this.earnedThisGame],
      bonuses: [...this.bonuses],
      lastNarrativeTick: this.lastNarrativeTick,
      narrativeCount: this.narrativeCount,
      deathsBeforeFirstWinter: this.deathsBeforeFirstWinter,
      passedFirstWinter: this.passedFirstWinter,
      totalBuildingsCompleted: this.totalBuildingsCompleted,
      totalUpgrades: this.totalUpgrades,
      totalTradesCompleted: this.totalTradesCompleted,
      birthsThisYear: this.birthsThisYear,
      deathsThisYear: this.deathsThisYear,
      totalDeathsAllTime: this.totalDeathsAllTime,
      currentYear: this.currentYear,
      minPopulation: this.minPopulation,
      recoveredFromSpiral: this.recoveredFromSpiral,
      everBuiltTavern: this.everBuiltTavern,
      everAcceptedNomads: this.everAcceptedNomads,
      everHuntedOrRaisedCattle: this.everHuntedOrRaisedCattle,
      everTraded: this.everTraded,
      festivalTypesHosted: [...this.festivalTypesHosted],
      uniqueFairRewardsThisGame: [...this.uniqueFairRewardsThisGame],
      buildingTypesBuilt: [...this.buildingTypesBuilt],
      upgradedTypes: [...this.upgradedTypes],
      weatherSurvived: [...this.weatherSurvived],
    };
  }

  setInternalState(s: any): void {
    // Support old milestone format (check for `achieved` field from MilestoneSystem)
    if (s.achieved && !s.earned) {
      // Old milestone format — convert
      this.earnedThisGame = new Set(s.achieved);
      this.bonuses = new Map(s.bonuses || []);
      this.lastNarrativeTick = s.lastNarrativeTick || 0;
      this.deathsBeforeFirstWinter = s.deathsBeforeFirstWinter || 0;
      this.passedFirstWinter = s.passedFirstWinter || false;
      // Re-apply bonuses from earned achievements
      for (const id of this.earnedThisGame) {
        const def = ACHIEVEMENT_MAP.get(id);
        if (def?.bonusType && def.bonusValue) {
          const current = this.bonuses.get(def.bonusType) || 0;
          this.bonuses.set(def.bonusType, current + def.bonusValue);
        }
      }
      this.scanExistingState();
      return;
    }

    // New achievement format
    this.earnedThisGame = new Set(s.earned || []);
    this.bonuses = new Map(s.bonuses || []);
    this.lastNarrativeTick = s.lastNarrativeTick || 0;
    this.narrativeCount = s.narrativeCount || 0;
    this.deathsBeforeFirstWinter = s.deathsBeforeFirstWinter || 0;
    this.passedFirstWinter = s.passedFirstWinter ?? false;
    this.totalBuildingsCompleted = s.totalBuildingsCompleted || 0;
    this.totalUpgrades = s.totalUpgrades || 0;
    this.totalTradesCompleted = s.totalTradesCompleted || 0;
    this.birthsThisYear = s.birthsThisYear || 0;
    this.deathsThisYear = s.deathsThisYear || 0;
    this.totalDeathsAllTime = s.totalDeathsAllTime || 0;
    this.currentYear = s.currentYear || 1;
    this.minPopulation = s.minPopulation ?? 999;
    this.recoveredFromSpiral = s.recoveredFromSpiral || false;
    this.everBuiltTavern = s.everBuiltTavern || false;
    this.everAcceptedNomads = s.everAcceptedNomads || false;
    this.everHuntedOrRaisedCattle = s.everHuntedOrRaisedCattle || false;
    this.everTraded = s.everTraded || false;
    this.festivalTypesHosted = new Set(s.festivalTypesHosted || []);
    this.uniqueFairRewardsThisGame = new Set(s.uniqueFairRewardsThisGame || []);
    this.buildingTypesBuilt = new Set(s.buildingTypesBuilt || []);
    this.upgradedTypes = new Set(s.upgradedTypes || []);
    this.weatherSurvived = new Set(s.weatherSurvived || []);
  }
}
