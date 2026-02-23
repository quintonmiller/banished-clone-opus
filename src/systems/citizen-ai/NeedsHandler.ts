import type { Game } from '../../Game';
import type { NavigationHelpers } from './NavigationHelpers';
import { EntityId } from '../../types';
import { logger } from '../../utils/Logger';
import {
  ResourceType,
  MEAL_FOOD_THRESHOLD, MEAL_RESTORE, MEAL_COST,
  STARVING_THRESHOLD,
  DIET_HISTORY_SIZE,
  EMERGENCY_SLEEP_ENERGY, HOME_WARMTH_GAIN,
  COOKED_MEAL_RESTORE, COOKED_MEAL_COST,
  COOKED_MEAL_WARMTH_BOOST, COOKED_MEAL_HAPPINESS_BOOST,
  COOKED_MEAL_ENERGY_BOOST,
  HOUSE_WARMTH_THRESHOLD,
  HEATED_BUILDING_TYPES, HEATED_BUILDING_WARMTH_THRESHOLD,
} from '../../constants';
import { isCooked } from './CitizenUtils';

export class NeedsHandler {
  constructor(private game: Game, private nav: NavigationHelpers) {}

  /** Eat a discrete meal from global food supply, tracking diet variety */
  eatMeal(id: EntityId): void {
    const totalFood = this.game.getTotalFood();
    if (totalFood >= COOKED_MEAL_COST) {
      const needs = this.game.world.getComponent<any>(id, 'needs')!;
      if (!needs.recentDiet) needs.recentDiet = [];

      // Try cooked food first (costs less, restores more)
      const cookedCost = COOKED_MEAL_COST;
      const result = this.game.removeFoodPreferVariety(cookedCost, needs.recentDiet);
      if (result.eaten > 0) {
        const cooked = isCooked(result.type);
        const restore = cooked ? COOKED_MEAL_RESTORE : MEAL_RESTORE;
        const citizen = this.game.world.getComponent<any>(id, 'citizen');
        logger.debug('AI', `${citizen?.name} (${id}) ate ${result.type} (${cooked ? 'cooked' : 'raw'}): food ${needs.food.toFixed(1)} -> ${Math.min(100, needs.food + restore).toFixed(1)}, totalFood remaining=${(totalFood - result.eaten).toFixed(0)}`);
        needs.food = Math.min(100, needs.food + restore);

        // Cooked food buffs
        if (cooked) {
          needs.happiness = Math.min(100, needs.happiness + COOKED_MEAL_HAPPINESS_BOOST);
          // Stew and soup give warmth
          if (result.type === ResourceType.FISH_STEW || result.type === ResourceType.VEGETABLE_SOUP) {
            needs.warmth = Math.min(100, needs.warmth + COOKED_MEAL_WARMTH_BOOST);
          }
          // Pie gives energy
          if (result.type === ResourceType.BERRY_PIE) {
            needs.energy = Math.min(100, (needs.energy ?? 100) + COOKED_MEAL_ENERGY_BOOST);
          }
        }

        // Track diet history
        needs.recentDiet.push(result.type);
        if (needs.recentDiet.length > DIET_HISTORY_SIZE) {
          needs.recentDiet.shift();
        }
        return;
      }
    }

    // No food available — walk toward nearest storage
    const citizen = this.game.world.getComponent<any>(id, 'citizen');
    logger.warn('AI', `${citizen?.name} (${id}) tried to eat but no food available (total=${totalFood.toFixed(1)})`);
    const storage = this.nav.findNearestStorage(id);
    if (storage !== null) {
      if (!this.nav.isNearBuilding(id, storage)) {
        this.nav.goToBuilding(id, storage);
      }
    } else {
      logger.warn('AI', `${citizen?.name} (${id}) no storage building found — wandering`);
      this.nav.wander(id);
    }
  }

  /** Urgent food seeking when starving */
  seekFood(id: EntityId): void {
    const totalFood = this.game.getTotalFood();
    if (totalFood > 0) {
      const needs = this.game.world.getComponent<any>(id, 'needs')!;
      if (!needs.recentDiet) needs.recentDiet = [];

      const result = this.game.removeFoodPreferVariety(MEAL_COST, needs.recentDiet);
      if (result.eaten > 0) {
        const cooked = isCooked(result.type);
        const citizen = this.game.world.getComponent<any>(id, 'citizen');
        logger.info('AI', `${citizen?.name} (${id}) emergency ate ${result.type}: food ${needs.food.toFixed(1)} -> ${Math.min(100, needs.food + (cooked ? COOKED_MEAL_RESTORE : MEAL_RESTORE)).toFixed(1)}`);
        needs.food = Math.min(100, needs.food + (cooked ? COOKED_MEAL_RESTORE : MEAL_RESTORE));
        if (cooked) {
          needs.happiness = Math.min(100, needs.happiness + COOKED_MEAL_HAPPINESS_BOOST);
        }
        needs.recentDiet.push(result.type);
        if (needs.recentDiet.length > DIET_HISTORY_SIZE) {
          needs.recentDiet.shift();
        }
        return;
      }
    }

    const citizen = this.game.world.getComponent<any>(id, 'citizen');
    logger.error('AI', `${citizen?.name} (${id}) STARVING and NO FOOD in stockpile (total=${totalFood.toFixed(1)})`);
    const storage = this.nav.findNearestStorage(id);
    if (storage !== null) {
      if (!this.nav.isNearBuilding(id, storage)) {
        this.nav.goToBuilding(id, storage);
      }
    } else {
      this.nav.wander(id);
    }
  }

  /**
   * Try to seek a genuinely warm shelter.
   * Returns true when a shelter target was found (entered or path set).
   */
  seekWarmth(id: EntityId): boolean {
    const shelterTargets = this.findWarmShelterTargets(id);
    if (shelterTargets.length === 0) return false;

    for (const buildingId of shelterTargets) {
      if (this.nav.isNearBuilding(id, buildingId)) {
        if (!this.nav.enterBuilding(id, buildingId)) continue;
        const movement = this.game.world.getComponent<any>(id, 'movement');
        if (movement) {
          movement.path = [];
          movement.targetEntity = buildingId;
          movement.moving = false;
          movement.stuckTicks = 0;
        }
        return true;
      }
      if (this.nav.goToBuilding(id, buildingId)) return true;
    }

    return false;
  }

  /** Warm shelter candidates sorted by Manhattan distance from citizen. */
  private findWarmShelterTargets(id: EntityId): EntityId[] {
    const pos = this.game.world.getComponent<any>(id, 'position');
    if (!pos) return [];
    const family = this.game.world.getComponent<any>(id, 'family');

    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return [];
    const world = this.game.world;
    const candidates: Array<{ id: EntityId; dist: number }> = [];

    for (const [bldId, bld] of buildings) {
      if (!bld?.completed) continue;

      const bldPos = world.getComponent<any>(bldId, 'position');
      if (!bldPos) continue;

      const house = world.getComponent<any>(bldId, 'house');
      const isResident = family?.homeId === bldId;

      let capacity = 0;
      if (house) {
        capacity = house.maxResidents || 5;
      } else if (bld.maxWorkers) {
        capacity = bld.maxWorkers + 3;
      } else {
        capacity = Math.max(4, Math.floor(((bld.width || 2) * (bld.height || 2)) / 2));
      }
      if (this.nav.getBuildingOccupantCount(bldId) >= capacity) continue;

      if (house && !isResident) {
        const residentCount = house.residents?.length || 0;
        if (residentCount >= capacity) continue;
      }

      const isWarmPublic = HEATED_BUILDING_TYPES.has(bld.type)
        && (bld.warmthLevel ?? 0) > HEATED_BUILDING_WARMTH_THRESHOLD;
      const isWarmHouse = !!house && (house.warmthLevel ?? 0) > HOUSE_WARMTH_THRESHOLD;
      if (!isWarmPublic && !isWarmHouse) continue;

      const dist = Math.abs(pos.tileX - bldPos.tileX) + Math.abs(pos.tileY - bldPos.tileY);
      candidates.push({ id: bldId, dist });
    }

    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.map(c => c.id);
  }

  /** Go home and start sleeping */
  goSleep(id: EntityId, citizen: any): void {
    const family = this.game.world.getComponent<any>(id, 'family');
    if (family?.homeId != null) {
      if (this.nav.isNearBuilding(id, family.homeId)) {
        // At home — fall asleep inside building
        if (this.nav.enterBuilding(id, family.homeId)) {
          citizen.isSleeping = true;
          const needs = this.game.world.getComponent<any>(id, 'needs');
          if (needs) {
            needs.warmth = Math.min(100, needs.warmth + HOME_WARMTH_GAIN);
          }
          const movement = this.game.world.getComponent<any>(id, 'movement')!;
          movement.stuckTicks = 0;
          return;
        }
      } else if (this.nav.goToBuilding(id, family.homeId)) {
        return;
      }
    }

    // No home — find a house with room to sleep in
    const house = this.nav.findAvailableHouse(id);
    if (house !== null) {
      if (this.nav.isNearBuilding(id, house)) {
        // Sleep inside a house even if not assigned
        if (this.nav.enterBuilding(id, house)) {
          citizen.isSleeping = true;
          return;
        }
      } else if (this.nav.goToBuilding(id, house)) {
        return;
      }
    }

    // Truly homeless — sleep where you are if exhausted
    if (this.game.world.getComponent<any>(id, 'needs')!.energy < EMERGENCY_SLEEP_ENERGY) {
      logger.warn('AI', `${citizen.name} (${id}) homeless and exhausted — sleeping outside`);
      citizen.isSleeping = true;
      return;
    }

    logger.debug('AI', `${citizen.name} (${id}) has no home, wandering`);
    this.nav.wander(id);
  }

}
