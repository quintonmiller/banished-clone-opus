import type { Game } from '../Game';
import { logger } from '../utils/Logger';
import {
  BuildingType, ResourceType, ALL_FOOD_TYPES, FOOD_SPOILAGE_RATE, BARN_SPOILAGE_MULT, STONE_BARN_SPOILAGE_MULT,
  STORAGE_CHECK_INTERVAL, HOUSE_FIREWOOD_MIN, HOUSE_FIREWOOD_TARGET,
  HOUSE_WARMTH_GAIN_FROM_FIRE, HOUSE_FIREWOOD_CONSUMPTION, HOUSE_WARMTH_LOSS_NO_FIRE,
  MARKET_HAPPINESS_GAIN, HARVEST_FESTIVAL_SPOILAGE_MULT,
  HEATED_BUILDING_TYPES,
  HEATED_BUILDING_FIREWOOD_MIN, HEATED_BUILDING_FIREWOOD_TARGET,
  HEATED_BUILDING_FIREWOOD_CONSUMPTION, HEATED_BUILDING_FIREWOOD_RESERVE_DAYS,
  HEATED_BUILDING_WARMTH_GAIN, HEATED_BUILDING_WARMTH_LOSS,
  TICKS_PER_DAY, WARM_WEATHER_TEMP,
} from '../constants';
import { SEASON_DATA } from '../data/SeasonDefs';

export class StorageSystem {
  private game: Game;
  private tickCounter = 0;

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    this.tickCounter++;
    if (this.tickCounter % STORAGE_CHECK_INTERVAL !== 0) return;

    this.restockHouses();
    this.restockHeatedBuildings();
    this.distributeFromMarket();
    this.spoilFood();
  }

  getInternalState(): { tickCounter: number } {
    return { tickCounter: this.tickCounter };
  }

  setInternalState(s: { tickCounter: number }): void {
    this.tickCounter = s.tickCounter;
  }

  /** Restock houses with firewood from global supply */
  private restockHouses(): void {
    const world = this.game.world;
    const houses = world.getComponentStore<any>('house');
    if (!houses) return;

    const seasonTemp = SEASON_DATA[this.game.state.subSeason].temperature;
    const needsHeating = seasonTemp <= WARM_WEATHER_TEMP;

    for (const [id, house] of houses) {
      // Skip empty houses — no residents means no heating needed
      if (!house.residents?.length) continue;

      // In warm seasons homes don't need fires — let warmth decay and preserve firewood for winter
      if (!needsHeating) {
        house.warmthLevel = Math.max(0, house.warmthLevel - HOUSE_WARMTH_LOSS_NO_FIRE);
        continue;
      }

      // Restock firewood
      if (house.firewood < HOUSE_FIREWOOD_MIN) {
        const needed = HOUSE_FIREWOOD_TARGET - house.firewood;
        const delivered = this.game.removeResource(ResourceType.FIREWOOD, needed);
        house.firewood += delivered;
      }

      // Update warmth level based on firewood
      if (house.firewood > 0) {
        house.warmthLevel = Math.min(100, house.warmthLevel + HOUSE_WARMTH_GAIN_FROM_FIRE);
        let fwConsumption = HOUSE_FIREWOOD_CONSUMPTION;
        const insulationBonus = this.game.festivalSystem.getFairBonus('insulation');
        if (insulationBonus > 0) fwConsumption *= (1 - insulationBonus);
        house.firewood -= fwConsumption;
        if (house.firewood < 0) house.firewood = 0;
      } else {
        logger.debug('STORAGE', `House (${id}) out of firewood — warmth dropping (${house.warmthLevel.toFixed(1)} → ${Math.max(0, house.warmthLevel - HOUSE_WARMTH_LOSS_NO_FIRE).toFixed(1)})`);
        house.warmthLevel = Math.max(0, house.warmthLevel - HOUSE_WARMTH_LOSS_NO_FIRE);
      }
    }
  }

  /** Restock heated public buildings with firewood, but only when homes have enough reserve */
  private restockHeatedBuildings(): void {
    const world = this.game.world;

    // Calculate how much firewood homes will need for the reserve period
    const houses = world.getComponentStore<any>('house');
    const houseCount = houses?.size ?? 0;
    const firewoodPerCheckPerHouse = HOUSE_FIREWOOD_CONSUMPTION; // consumed per STORAGE_CHECK_INTERVAL
    const checksPerDay = TICKS_PER_DAY / STORAGE_CHECK_INTERVAL;
    const reserveNeeded = houseCount * firewoodPerCheckPerHouse * checksPerDay * HEATED_BUILDING_FIREWOOD_RESERVE_DAYS;
    const availableFirewood = this.game.getResource(ResourceType.FIREWOOD);
    const canHeatBuildings = availableFirewood > reserveNeeded;

    const buildings = world.getComponentStore<any>('building');
    if (!buildings) return;

    for (const [, bld] of buildings) {
      if (!bld.completed || !HEATED_BUILDING_TYPES.has(bld.type)) continue;

      // Init fields on old/uninitialized buildings
      if (bld.warmthLevel === undefined) bld.warmthLevel = 0;
      if (bld.firewood === undefined) bld.firewood = 0;

      // Restock if surplus allows and building is low
      if (canHeatBuildings && bld.firewood < HEATED_BUILDING_FIREWOOD_MIN) {
        const needed = HEATED_BUILDING_FIREWOOD_TARGET - bld.firewood;
        const delivered = this.game.removeResource(ResourceType.FIREWOOD, needed);
        bld.firewood += delivered;
      }

      // Update warmth level
      if (bld.firewood > 0) {
        bld.warmthLevel = Math.min(100, bld.warmthLevel + HEATED_BUILDING_WARMTH_GAIN);
        bld.firewood -= HEATED_BUILDING_FIREWOOD_CONSUMPTION;
        if (bld.firewood < 0) bld.firewood = 0;
      } else {
        bld.warmthLevel = Math.max(0, bld.warmthLevel - HEATED_BUILDING_WARMTH_LOSS);
      }
    }
  }

  /** Markets distribute goods to nearby citizens */
  private distributeFromMarket(): void {
    const world = this.game.world;
    const buildings = world.getComponentStore<any>('building');
    if (!buildings) return;

    for (const [id, bld] of buildings) {
      if (bld.type !== BuildingType.MARKET || !bld.completed) continue;

      const pos = world.getComponent<any>(id, 'position');
      if (!pos) continue;

      const citizens = world.query('citizen', 'position', 'needs');
      for (const cId of citizens) {
        const cPos = world.getComponent<any>(cId, 'position')!;
        const dx = cPos.tileX - pos.tileX;
        const dy = cPos.tileY - pos.tileY;
        if (Math.abs(dx) <= (bld.workRadius || 40) && Math.abs(dy) <= (bld.workRadius || 40)) {
          const needs = world.getComponent<any>(cId, 'needs')!;
          needs.happiness = Math.min(100, needs.happiness + MARKET_HAPPINESS_GAIN);
        }
      }
    }
  }

  /** Food spoils per-building — barns get the spoilage reduction for food stored in them */
  private spoilFood(): void {
    const world = this.game.world;
    let festivalMult = this.game.festivalSystem.hasActiveEffect('harvest_festival')
      ? HARVEST_FESTIVAL_SPOILAGE_MULT : 1.0;
    // Fair knowledge bonus: preservation methods
    const preservationBonus = this.game.festivalSystem.getFairBonus('preservation');
    if (preservationBonus > 0) festivalMult *= (1 - preservationBonus);
    const allFoodTypes = ['food', ...ALL_FOOD_TYPES];
    let totalSpoiled = 0;

    // Spoil food in each storage building independently
    const buildings = world.getComponentStore<any>('building');
    if (buildings) {
      for (const [id, bld] of buildings) {
        if (!bld.completed || !bld.isStorage) continue;
        const storage = world.getComponent<any>(id, 'storage');
        if (!storage) continue;

        const isBarn = bld.type === BuildingType.STORAGE_BARN || bld.type === BuildingType.STONE_BARN;
        const barnMult = bld.type === BuildingType.STONE_BARN ? STONE_BARN_SPOILAGE_MULT : BARN_SPOILAGE_MULT;
        const spoilageMult = isBarn
          ? barnMult * festivalMult
          : 1.0 * festivalMult;

        const inv = storage.inventory as Record<string, number>;
        for (const type of allFoodTypes) {
          const current = inv[type] || 0;
          if (current > 0) {
            const spoiled = Math.max(0.1, current * FOOD_SPOILAGE_RATE * spoilageMult);
            inv[type] = Math.max(0, current - spoiled);
            totalSpoiled += spoiled;
          }
        }
      }
    }

    // Also spoil food in the global buffer (edge-case overflow)
    for (const type of allFoodTypes) {
      const current = this.game.resources.globalResources.get(type) || 0;
      if (current > 0) {
        const spoiled = Math.max(0.1, current * FOOD_SPOILAGE_RATE * festivalMult);
        this.game.resources.globalResources.set(type, Math.max(0, current - spoiled));
        totalSpoiled += spoiled;
      }
    }

    if (totalSpoiled > 0.5) {
      logger.debug('STORAGE', `Food spoilage: ${totalSpoiled.toFixed(1)} units lost`);
    }
  }
}
