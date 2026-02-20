import type { Game } from '../Game';
import { SEASON_DATA } from '../data/SeasonDefs';
import {
  FOOD_DECAY_PER_TICK, WARMTH_DECAY_PER_TICK,
  STARVATION_HEALTH_DAMAGE, FREEZING_HEALTH_DAMAGE,
  HEALTH_DECAY_PER_TICK, NO_COAT_WARMTH_MULT, COAT_WEAR_PER_TICK,
  ENERGY_DECAY_PER_TICK, ENERGY_RECOVERY_PER_TICK,
  DIET_VARIETY_THRESHOLD, DIET_VARIETY_HAPPINESS, DIET_MONOTONY_HAPPINESS,
  ResourceType, OLD_AGE,
  SLEEP_FOOD_DECAY_MULT, WARM_WEATHER_TEMP, WARM_WEATHER_RECOVERY,
  COLD_WARMTH_DIVISOR, HOUSE_WARMTH_THRESHOLD, HOUSE_WARMTH_DECAY_MULT,
  HOUSE_WARMTH_RECOVERY, FREEZING_TEMP_THRESHOLD,
  HEALTH_REGEN_FOOD_MIN, HEALTH_REGEN_WARMTH_MIN, HEALTH_REGEN_ENERGY_MIN,
  HEALTH_REGEN_RATE, HERB_USE_HEALTH_THRESHOLD, HERB_USE_CHANCE,
  HERB_HEALTH_RESTORE, OLD_AGE_HEALTH_DIVISOR,
  UNHAPPY_FOOD_THRESHOLD, UNHAPPY_WARMTH_THRESHOLD, UNHAPPY_HEALTH_THRESHOLD,
  UNHAPPY_ENERGY_THRESHOLD, UNHAPPINESS_RATE,
  HAPPY_NEEDS_THRESHOLD, HAPPY_ENERGY_THRESHOLD, HAPPINESS_GAIN_RATE,
  TRIMESTER_1_END, TRIMESTER_2_END,
  T1_FOOD_DECAY_MULT, T1_ENERGY_DECAY_MULT, T1_SPEED_MULT,
  T2_FOOD_DECAY_MULT, T2_ENERGY_DECAY_MULT, T2_SPEED_MULT,
  T3_FOOD_DECAY_MULT, T3_ENERGY_DECAY_MULT, T3_SPEED_MULT,
  MIDSUMMER_HAPPINESS_MULT,
  WELL_HAPPINESS_RADIUS, WELL_HAPPINESS_PER_TICK,
  CHAPEL_COMMUNITY_HAPPINESS, BuildingType,
} from '../constants';

export class NeedsSystem {
  private game: Game;
  private hasChapel = false;
  private wellPositions: Array<{ x: number; y: number; radius: number }> = [];
  private socialBuildingCacheAge = 0;

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    // Periodically cache social building positions (every 100 ticks)
    if (this.game.state.tick - this.socialBuildingCacheAge > 100) {
      this.refreshSocialBuildingCache();
    }

    const world = this.game.world;
    const entities = world.query('citizen', 'needs', 'position');
    const seasonData = SEASON_DATA[this.game.state.subSeason];

    for (const id of entities) {
      const needs = world.getComponent<any>(id, 'needs')!;
      const citizen = world.getComponent<any>(id, 'citizen')!;

      // Initialize energy if missing (for citizens spawned before this system existed)
      if (needs.energy === undefined) needs.energy = 100;
      if (citizen.isSleeping === undefined) citizen.isSleeping = false;

      // --- Pregnancy modifiers ---
      const family = world.getComponent<any>(id, 'family');
      let pregnancyFoodMult = 1.0;
      let pregnancyEnergyMult = 1.0;
      let pregnancySpeedMult = 1.0;

      if (family?.isPregnant && family.pregnancyTicks != null) {
        if (family.pregnancyTicks < TRIMESTER_1_END) {
          pregnancyFoodMult = T1_FOOD_DECAY_MULT;
          pregnancyEnergyMult = T1_ENERGY_DECAY_MULT;
          pregnancySpeedMult = T1_SPEED_MULT;
        } else if (family.pregnancyTicks < TRIMESTER_2_END) {
          pregnancyFoodMult = T2_FOOD_DECAY_MULT;
          pregnancyEnergyMult = T2_ENERGY_DECAY_MULT;
          pregnancySpeedMult = T2_SPEED_MULT;
        } else {
          pregnancyFoodMult = T3_FOOD_DECAY_MULT;
          pregnancyEnergyMult = T3_ENERGY_DECAY_MULT;
          pregnancySpeedMult = T3_SPEED_MULT;
        }
      }

      // Set speed modifier on movement component
      const movement = world.getComponent<any>(id, 'movement');
      if (movement) {
        movement.speedModifier = pregnancySpeedMult;
      }

      // --- Energy ---
      if (citizen.isSleeping) {
        // Recover energy while sleeping
        needs.energy = Math.min(100, needs.energy + ENERGY_RECOVERY_PER_TICK);
        // Food decays at reduced rate while sleeping (metabolism slows)
        needs.food -= FOOD_DECAY_PER_TICK * SLEEP_FOOD_DECAY_MULT * pregnancyFoodMult;
      } else {
        // Drain energy while awake
        needs.energy = Math.max(0, needs.energy - ENERGY_DECAY_PER_TICK * pregnancyEnergyMult);
        // Normal food decay
        needs.food -= FOOD_DECAY_PER_TICK * pregnancyFoodMult;
      }
      needs.food = Math.max(0, needs.food);

      // --- Warmth ---
      let warmthDecay = WARMTH_DECAY_PER_TICK;
      if (seasonData.temperature < 0) {
        warmthDecay *= 1 + Math.abs(seasonData.temperature) / COLD_WARMTH_DIVISOR;
      } else if (seasonData.temperature > WARM_WEATHER_TEMP) {
        // Warm weather restores warmth
        needs.warmth = Math.min(100, needs.warmth + WARM_WEATHER_RECOVERY);
        warmthDecay = 0;
      }

      // Coat check: citizens without coats lose warmth faster
      const hasCoat = this.game.getResource(ResourceType.COAT) > 0;
      if (!hasCoat) {
        warmthDecay *= NO_COAT_WARMTH_MULT;
      } else {
        this.game.removeResource(ResourceType.COAT, COAT_WEAR_PER_TICK);
      }

      // Sleeping indoors greatly reduces warmth loss
      const isAtHome = family?.homeId != null && this.isNearHome(id, family.homeId);
      if (isAtHome) {
        const house = world.getComponent<any>(family.homeId, 'house');
        if (house && house.warmthLevel > HOUSE_WARMTH_THRESHOLD) {
          warmthDecay *= HOUSE_WARMTH_DECAY_MULT;
          needs.warmth = Math.min(100, needs.warmth + HOUSE_WARMTH_RECOVERY);
        }
      }

      needs.warmth -= warmthDecay;
      needs.warmth = Math.max(0, needs.warmth);

      // --- Health ---
      if (needs.food <= 0) {
        needs.health -= STARVATION_HEALTH_DAMAGE;
      }
      if (needs.warmth <= 0 && seasonData.temperature < FREEZING_TEMP_THRESHOLD) {
        needs.health -= FREEZING_HEALTH_DAMAGE;
      }

      // Natural health regeneration (when well-fed, warm, and rested)
      if (needs.food > HEALTH_REGEN_FOOD_MIN && needs.warmth > HEALTH_REGEN_WARMTH_MIN && needs.energy > HEALTH_REGEN_ENERGY_MIN && needs.health < 100) {
        needs.health += HEALTH_REGEN_RATE;
      }

      // Herbs boost health
      if (needs.health < HERB_USE_HEALTH_THRESHOLD && this.game.getResource('herbs') > 0) {
        if (this.game.rng.chance(HERB_USE_CHANCE)) {
          this.game.removeResource('herbs', 1);
          needs.health = Math.min(100, needs.health + HERB_HEALTH_RESTORE);
        }
      }

      // Old age health decay
      if (citizen.age > OLD_AGE) {
        needs.health -= HEALTH_DECAY_PER_TICK * (citizen.age - OLD_AGE) / OLD_AGE_HEALTH_DIVISOR;
      }

      needs.health = Math.max(0, Math.min(100, needs.health));

      // --- Happiness ---
      // Low energy makes citizens unhappy
      if (needs.food < UNHAPPY_FOOD_THRESHOLD || needs.warmth < UNHAPPY_WARMTH_THRESHOLD || needs.health < UNHAPPY_HEALTH_THRESHOLD || needs.energy < UNHAPPY_ENERGY_THRESHOLD) {
        needs.happiness = Math.max(0, needs.happiness - UNHAPPINESS_RATE);
      } else if (needs.food > HAPPY_NEEDS_THRESHOLD && needs.warmth > HAPPY_NEEDS_THRESHOLD && needs.health > HAPPY_NEEDS_THRESHOLD && needs.energy > HAPPY_ENERGY_THRESHOLD) {
        let happinessGain = HAPPINESS_GAIN_RATE;
        // Midsummer festival effect — boosted happiness gain
        if (this.game.festivalSystem.hasActiveEffect('midsummer')) {
          happinessGain *= MIDSUMMER_HAPPINESS_MULT;
        }
        needs.happiness = Math.min(100, needs.happiness + happinessGain);
      }

      // Well proximity happiness
      if (this.isNearWell(id)) {
        needs.happiness = Math.min(100, needs.happiness + WELL_HAPPINESS_PER_TICK);
      }

      // Chapel community happiness
      if (this.hasChapel) {
        needs.happiness = Math.min(100, needs.happiness + CHAPEL_COMMUNITY_HAPPINESS);
      }

      // Diet variety bonus/penalty
      if (needs.recentDiet && needs.recentDiet.length >= 3) {
        const uniqueTypes = new Set(needs.recentDiet).size;
        if (uniqueTypes >= DIET_VARIETY_THRESHOLD) {
          needs.happiness = Math.min(100, needs.happiness + DIET_VARIETY_HAPPINESS);
        } else if (uniqueTypes <= 1) {
          needs.happiness = Math.max(0, needs.happiness + DIET_MONOTONY_HAPPINESS);
        }
      }

      // --- Death ---
      if (needs.health <= 0) {
        this.killCitizen(id);
      }
    }
  }

  /** Check if citizen is physically near their home building */
  private isNearHome(citizenId: number, homeId: number): boolean {
    const pos = this.game.world.getComponent<any>(citizenId, 'position');
    const bPos = this.game.world.getComponent<any>(homeId, 'position');
    if (!pos || !bPos) return false;

    const bld = this.game.world.getComponent<any>(homeId, 'building');
    const bw = bld?.width || 1;
    const bh = bld?.height || 1;

    const dx = pos.tileX - bPos.tileX;
    const dy = pos.tileY - bPos.tileY;
    return dx >= -2 && dx <= bw + 1 && dy >= -2 && dy <= bh + 1;
  }

  /** Refresh the cache of social building positions */
  private refreshSocialBuildingCache(): void {
    this.socialBuildingCacheAge = this.game.state.tick;
    this.wellPositions = [];
    this.hasChapel = false;

    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return;

    for (const [id, bld] of buildings) {
      if (!bld.completed) continue;
      if (bld.type === BuildingType.WELL) {
        const pos = this.game.world.getComponent<any>(id, 'position');
        if (pos) {
          this.wellPositions.push({ x: pos.tileX + 1, y: pos.tileY + 1, radius: WELL_HAPPINESS_RADIUS });
        }
      } else if (bld.type === BuildingType.CHAPEL) {
        this.hasChapel = true;
      }
    }
  }

  /** Check if a citizen is near any well */
  private isNearWell(citizenId: number): boolean {
    if (this.wellPositions.length === 0) return false;
    const pos = this.game.world.getComponent<any>(citizenId, 'position');
    if (!pos) return false;

    for (const well of this.wellPositions) {
      const dx = pos.tileX - well.x;
      const dy = pos.tileY - well.y;
      if (dx * dx + dy * dy <= well.radius * well.radius) return true;
    }
    return false;
  }

  private killCitizen(id: number): void {
    const citizen = this.game.world.getComponent<any>(id, 'citizen');
    const name = citizen?.name || 'Unknown';

    // Remove from family
    const family = this.game.world.getComponent<any>(id, 'family');
    if (family?.partnerId) {
      const partnerFamily = this.game.world.getComponent<any>(family.partnerId, 'family');
      if (partnerFamily) partnerFamily.partnerId = null;
    }

    // Remove from workplace
    const worker = this.game.world.getComponent<any>(id, 'worker');
    if (worker?.workplaceId) {
      const bld = this.game.world.getComponent<any>(worker.workplaceId, 'building');
      if (bld?.assignedWorkers) {
        bld.assignedWorkers = bld.assignedWorkers.filter((w: number) => w !== id);
      }
    }

    // Remove from house
    if (family?.homeId) {
      const house = this.game.world.getComponent<any>(family.homeId, 'house');
      if (house?.residents) {
        house.residents = house.residents.filter((r: number) => r !== id);
      }
    }

    this.game.world.destroyEntity(id);
    this.game.state.totalDeaths++;

    this.game.eventBus.emit('citizen_died', { id, name });
  }
}
