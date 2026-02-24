import type { Game } from '../Game';
import { RECIPE_DEFS } from '../data/RecipeDefs';
import { SEASON_DATA } from '../data/SeasonDefs';
import { logger } from '../utils/Logger';
import {
  EDUCATION_BONUS, ACADEMY_EDUCATION_BONUS, BuildingType, ResourceType,
  NO_TOOL_PRODUCTION_MULT, TOOL_WEAR_PER_TICK,
  FORESTER_REPLANT_TICKS, TREE_GROWTH_TICKS,
  PLANTING_DAY_CROP_MULT,
  TRAIT_WORK_SPEED_BONUS, PersonalityTrait,
  CropStage, CROP_STAGE_TICKS, CROP_HARVEST_YIELD_MULT, Season,
  SKILL_EFFICIENCY_PER_LEVEL, SKILL_MASTERY_BONUS_CHANCE,
  SKILL_MAX_LEVEL, PROFESSION_SKILL_MAP,
  HAY_FROM_WHEAT,
  STORAGE_FULL_LOG_INTERVAL,
  BERRY_MUSHROOM_EFFICIENCY_DIVISOR, WILDLIFE_EFFICIENCY_DIVISOR,
  FISH_EFFICIENCY_DIVISOR, HERB_EFFICIENCY_DIVISOR,
  BERRY_DEPLETION, MUSHROOM_DEPLETION, HERB_DEPLETION,
  FISH_DEPLETION, WILDLIFE_DEPLETION,
} from '../constants';

export class ProductionSystem {
  private game: Game;
  private foresterTimers = new Map<number, { replant: number; grow: number }>();
  private lastStorageFullLog = 0;

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    const world = this.game.world;
    const buildings = world.getComponentStore<any>('building');
    const producers = world.getComponentStore<any>('producer');
    if (!buildings || !producers) return;

    // Don't produce at night — workers are sleeping
    if (this.game.state.isNight) {
      for (const [, producer] of producers) {
        producer.active = false;
      }
      return;
    }

    const seasonData = SEASON_DATA[this.game.state.subSeason];

    for (const [id, producer] of producers) {
      const bld = buildings.get(id);
      if (!bld || !bld.completed) continue;

      // Crop fields use growth stage system instead of normal production
      if (bld.type === BuildingType.CROP_FIELD) {
        this.updateCropField(id, bld, producer, seasonData);
        continue;
      }

      // Gathering buildings use physical gather-carry-deposit (driven by CitizenAISystem)
      // They still get workerCount/active updates for UI, but skip timer/recipe logic
      if (bld.type === BuildingType.GATHERING_HUT ||
          bld.type === BuildingType.GATHERING_LODGE ||
          bld.type === BuildingType.HUNTING_CABIN ||
          bld.type === BuildingType.HUNTING_LODGE ||
          bld.type === BuildingType.FISHING_DOCK ||
          bld.type === BuildingType.HERBALIST ||
          bld.type === BuildingType.FORESTER_LODGE ||
          bld.type === BuildingType.FORESTRY_HALL) {
        const workerCount = this.countWorkersAtBuilding(id);
        producer.workerCount = workerCount;
        producer.active = workerCount > 0;
        // Forester/Forestry Hall special behavior: replant and grow trees
        if (bld.type === BuildingType.FORESTER_LODGE || bld.type === BuildingType.FORESTRY_HALL) {
          const pos = this.game.world.getComponent<any>(id, 'position');
          if (pos) this.updateForester(id, pos, bld, workerCount);
        }
        continue;
      }

      // Find all matching recipes — buildings with multiple recipes cycle through them
      const matchingRecipes = RECIPE_DEFS.filter(r => r.buildingType === bld.type);
      if (matchingRecipes.length === 0) continue;

      // Pick recipe: for single-recipe buildings use that one; for multi-recipe, pick the
      // first one whose inputs are available (round-robin via recipeIndex on the producer)
      let recipe;
      if (matchingRecipes.length === 1) {
        recipe = matchingRecipes[0];
      } else {
        if (producer.recipeIndex === undefined) producer.recipeIndex = 0;
        recipe = matchingRecipes[producer.recipeIndex % matchingRecipes.length];
      }

      const workerCount = this.countWorkersAtBuilding(id);
      producer.workerCount = workerCount;

      if (workerCount === 0) {
        producer.active = false;
        continue;
      }

      producer.active = true;

      let efficiency = workerCount / (bld.maxWorkers || 1);
      efficiency = Math.min(1, efficiency);

      // Educated worker bonus (Academy gives a stronger bonus than School)
      const educatedCount = this.countEducatedWorkers(id);
      if (educatedCount > 0) {
        const eduBonus = this.getEducationBonus();
        efficiency *= 1 + (educatedCount / workerCount) * (eduBonus - 1);
      }

      // Personality trait work speed bonus/penalty
      const traitBonus = this.getTraitWorkBonus(id);
      efficiency *= (1 + traitBonus);

      // Skill level efficiency bonus
      const skillBonus = this.getSkillBonus(id, bld.type);
      efficiency *= (1 + skillBonus);

      // Milestone bonuses
      const milestones = this.game.milestoneSystem;
      efficiency *= (1 + milestones.getBonus('work_speed') + milestones.getBonus('all_production'));

      // Tool check
      const needsTools = this.buildingNeedsTools(bld.type);
      if (needsTools) {
        const hasTools = this.game.getResource(ResourceType.TOOL) > 0;
        if (!hasTools) {
          efficiency *= NO_TOOL_PRODUCTION_MULT;
        } else {
          this.game.removeResource(ResourceType.TOOL, TOOL_WEAR_PER_TICK * workerCount);
        }
      }

      // Seasonal modifier — each building type reads its own seasonal curve
      if (recipe.seasonalMultiplier) {
        if (bld.type === BuildingType.CROP_FIELD) {
          efficiency *= seasonData.cropGrowth;
          // Weather affects crops
          efficiency *= this.game.weatherSystem.getCropWeatherMult();
          // Planting Day festival effect — boost crop growth
          if (this.game.festivalSystem.hasActiveEffect('planting_day')) {
            efficiency *= PLANTING_DAY_CROP_MULT;
          }
          // Fair knowledge bonus: crop rotation
          const cropRotationBonus = this.game.festivalSystem.getFairBonus('cropRotation');
          if (cropRotationBonus > 0) efficiency *= (1 + cropRotationBonus);
          // Milestone crop growth bonus
          efficiency *= (1 + milestones.getBonus('crop_growth'));
        } else if (bld.type === BuildingType.HUNTING_CABIN) {
          efficiency *= seasonData.huntingRate;
          efficiency *= (1 + milestones.getBonus('gathering_speed'));
        } else if (bld.type === BuildingType.FISHING_DOCK) {
          efficiency *= seasonData.fishingRate;
          const fishingBonus = this.game.festivalSystem.getFairBonus('fishingNets');
          if (fishingBonus > 0) efficiency *= (1 + fishingBonus);
          efficiency *= (1 + milestones.getBonus('gathering_speed'));
        } else if (bld.type === BuildingType.HERBALIST) {
          efficiency *= seasonData.herbRate;
          efficiency *= (1 + milestones.getBonus('gathering_speed'));
        } else {
          efficiency *= seasonData.gatheringRate;
          // Milestone gathering speed bonus
          efficiency *= (1 + milestones.getBonus('gathering_speed'));
        }
      }

      // Gathering from radius — use real tile resources for efficiency
      const pos = world.getComponent<any>(id, 'position');
      if (pos) {
        const cx = pos.tileX + Math.floor(bld.width / 2);
        const cy = pos.tileY + Math.floor(bld.height / 2);
        const radius = bld.workRadius || 30;

        if (bld.type === BuildingType.GATHERING_HUT) {
          const berryCount = this.game.tileMap.countResourceInRadius(cx, cy, radius, 'berries');
          const mushroomCount = this.game.tileMap.countResourceInRadius(cx, cy, radius, 'mushrooms');
          efficiency *= Math.min(1, (berryCount + mushroomCount) / BERRY_MUSHROOM_EFFICIENCY_DIVISOR);
        } else if (bld.type === BuildingType.HUNTING_CABIN) {
          const wildlifeCount = this.game.tileMap.countResourceInRadius(cx, cy, radius, 'wildlife');
          efficiency *= Math.min(1, wildlifeCount / WILDLIFE_EFFICIENCY_DIVISOR);
        } else if (bld.type === BuildingType.FISHING_DOCK) {
          const fishCount = this.game.tileMap.countResourceInRadius(cx, cy, radius, 'fish');
          efficiency *= Math.min(1, fishCount / FISH_EFFICIENCY_DIVISOR);
        } else if (bld.type === BuildingType.HERBALIST) {
          const herbCount = this.game.tileMap.countResourceInRadius(cx, cy, radius, 'herbs');
          efficiency *= Math.min(1, herbCount / HERB_EFFICIENCY_DIVISOR);
        }
      }

      if (efficiency <= 0) continue;

      producer.timer += efficiency;

      if (producer.timer >= recipe.cooldownTicks) {
        // Pause production if storage is full
        if (this.game.isStorageFull()) {
          this.logStorageFull();
          continue;
        }

        // Pause production when all outputs for this recipe are at their limits.
        if (this.areAllOutputsAtLimit(recipe.outputs)) {
          continue;
        }

        producer.timer = 0;

        // Check inputs
        let hasInputs = true;
        for (const [res, amount] of Object.entries(recipe.inputs)) {
          if (this.game.getResource(res) < (amount as number)) {
            hasInputs = false;
            break;
          }
        }

        if (!hasInputs) {
          // For multi-recipe buildings, try next recipe
          if (matchingRecipes.length > 1) {
            producer.recipeIndex = ((producer.recipeIndex || 0) + 1) % matchingRecipes.length;
            producer.timer = recipe.cooldownTicks * 0.9; // Try again soon
          }
          continue;
        }

        // --- Resource depletion: consume real tile resources on production ---
        if (pos) {
          const cx = pos.tileX + Math.floor(bld.width / 2);
          const cy = pos.tileY + Math.floor(bld.height / 2);
          const radius = bld.workRadius || 30;

          if (bld.type === BuildingType.GATHERING_HUT) {
            this.game.tileMap.consumeResourceInRadius(cx, cy, radius, 'berries', BERRY_DEPLETION);
            this.game.tileMap.consumeResourceInRadius(cx, cy, radius, 'mushrooms', MUSHROOM_DEPLETION);
          } else if (bld.type === BuildingType.HUNTING_CABIN) {
            this.game.tileMap.consumeResourceInRadius(cx, cy, radius, 'wildlife', WILDLIFE_DEPLETION);
          } else if (bld.type === BuildingType.FISHING_DOCK) {
            this.game.tileMap.consumeResourceInRadius(cx, cy, radius, 'fish', FISH_DEPLETION);
          } else if (bld.type === BuildingType.HERBALIST) {
            this.game.tileMap.consumeResourceInRadius(cx, cy, radius, 'herbs', HERB_DEPLETION);
          }
        }

        // Consume inputs
        for (const [res, amount] of Object.entries(recipe.inputs)) {
          this.game.removeResource(res, amount as number);
        }

        // Produce outputs
        const hasMaster = this.hasSkillMaster(id, bld.type);
        for (const [res, amount] of Object.entries(recipe.outputs)) {
          let produced = amount as number;
          if (educatedCount > 0 && (bld.type === BuildingType.WOOD_CUTTER || bld.type === BuildingType.BLACKSMITH ||
              bld.type === BuildingType.SAWMILL || bld.type === BuildingType.IRON_WORKS)) {
            produced = Math.ceil(produced * this.getEducationBonus());
          }
          // Mastery bonus: chance of extra output
          if (hasMaster && Math.random() < SKILL_MASTERY_BONUS_CHANCE) {
            produced += 1;
          }
          const added = this.game.addResourceRespectingLimit(res, produced);
          if (added > 0) {
            logger.debug('PRODUCTION', `${bld.type} produced ${added} ${res} (workers=${workerCount}, efficiency=${efficiency.toFixed(2)})`);
          }
        }

        // Cycle recipe index for multi-recipe buildings
        if (matchingRecipes.length > 1) {
          producer.recipeIndex = ((producer.recipeIndex || 0) + 1) % matchingRecipes.length;
        }
      }

    }
  }

  /** Handle crop field growth stages */
  private updateCropField(id: number, bld: any, producer: any, seasonData: any): void {
    const workerCount = this.countWorkersAtBuilding(id);
    producer.workerCount = workerCount;

    // Initialize crop stage
    if (producer.cropStage === undefined) producer.cropStage = CropStage.FALLOW;
    if (producer.cropGrowthTimer === undefined) producer.cropGrowthTimer = 0;

    // Winter kills crops that aren't harvested
    const subSeason = this.game.state.subSeason;
    if (subSeason >= Season.EARLY_WINTER && subSeason <= Season.LATE_WINTER) {
      if (producer.cropStage > CropStage.FALLOW && producer.cropStage < CropStage.READY) {
        producer.cropStage = CropStage.FALLOW;
        producer.cropGrowthTimer = 0;
        producer.active = false;
      }
      return; // No crop activity in winter
    }

    if (workerCount === 0) {
      producer.active = false;
      return;
    }

    producer.active = true;

    // Fallow → Planted (workers plant seeds in spring)
    if (producer.cropStage === CropStage.FALLOW) {
      if (seasonData.cropGrowth > 0) {
        producer.cropStage = CropStage.PLANTED;
        producer.cropGrowthTimer = 0;
      }
      return;
    }

    // Ready → Harvest
    if (producer.cropStage === CropStage.READY) {
      // Pause harvest if storage is full
      if (this.game.isStorageFull()) {
        this.logStorageFull();
        return;
      }
      // Harvest the crops
      const recipe = RECIPE_DEFS.find(r => r.buildingType === BuildingType.CROP_FIELD);
      const cropOutputs = recipe ? Object.keys(recipe.outputs) : [];
      if (cropOutputs.length > 0) {
        const allCropAtLimit = cropOutputs.every(res => this.game.isResourceLimitMet(res));
        const hayAtLimit = this.game.isResourceLimitMet(ResourceType.HAY);
        if (allCropAtLimit && hayAtLimit) return;
      }
      if (recipe) {
        const educatedCount = this.countEducatedWorkers(id);
        for (const [res, amount] of Object.entries(recipe.outputs)) {
          let produced = Math.ceil((amount as number) * CROP_HARVEST_YIELD_MULT);
          // Educated bonus
          if (educatedCount > 0) {
            produced = Math.ceil(produced * this.getEducationBonus());
          }
          this.game.addResourceRespectingLimit(res, produced);
        }
      }
      // Harvest also produces hay (straw from wheat stalks)
      this.game.addResourceRespectingLimit(ResourceType.HAY, HAY_FROM_WHEAT * workerCount);
      logger.info('PRODUCTION', `Crop field harvested — workers=${workerCount}`);
      // Reset to fallow after harvest
      producer.cropStage = CropStage.FALLOW;
      producer.cropGrowthTimer = 0;
      return;
    }

    // Growth: advance timer based on season, weather, workers, and festival effects
    let growthRate = seasonData.cropGrowth;
    growthRate *= this.game.weatherSystem.getCropWeatherMult();
    growthRate *= (workerCount / (bld.maxWorkers || 1));

    // Planting Day festival effect
    if (this.game.festivalSystem.hasActiveEffect('planting_day')) {
      growthRate *= PLANTING_DAY_CROP_MULT;
    }

    // Fair knowledge bonus: crop rotation
    const cropRotBonus = this.game.festivalSystem.getFairBonus('cropRotation');
    if (cropRotBonus > 0) growthRate *= (1 + cropRotBonus);

    // Trait bonus
    const traitBonus = this.getTraitWorkBonus(id);
    growthRate *= (1 + traitBonus);

    if (growthRate <= 0) return;

    producer.cropGrowthTimer += growthRate;

    // Advance stage when timer reaches threshold
    if (producer.cropGrowthTimer >= CROP_STAGE_TICKS) {
      producer.cropGrowthTimer = 0;
      producer.cropStage = Math.min(CropStage.READY, producer.cropStage + 1);
    }
  }

  /** Foresters actively replant and grow trees in their radius */
  private updateForester(id: number, pos: any, bld: any, workerCount: number): void {
    if (!this.foresterTimers.has(id)) {
      this.foresterTimers.set(id, { replant: 0, grow: 0 });
    }
    const timers = this.foresterTimers.get(id)!;

    const cx = pos.tileX + Math.floor(bld.width / 2);
    const cy = pos.tileY + Math.floor(bld.height / 2);
    const radius = bld.workRadius || 30;

    // Replant: plant saplings on empty grass tiles
    timers.replant += workerCount;
    if (timers.replant >= FORESTER_REPLANT_TICKS) {
      timers.replant = 0;
      this.game.tileMap.plantTreeInRadius(cx, cy, radius);
    }

    // Grow: existing saplings grow denser over time
    timers.grow += workerCount;
    if (timers.grow >= TREE_GROWTH_TICKS) {
      timers.grow = 0;
      this.game.tileMap.growTreesInRadius(cx, cy, radius);
    }
  }

  getInternalState(): { foresterTimers: [number, { replant: number; grow: number }][] } {
    return { foresterTimers: [...this.foresterTimers] };
  }

  setInternalState(s: { foresterTimers: [number, { replant: number; grow: number }][] }): void {
    this.foresterTimers = new Map(s.foresterTimers);
  }

  private areAllOutputsAtLimit(outputs: Partial<Record<ResourceType, number>>): boolean {
    const outputTypes = Object.keys(outputs);
    if (outputTypes.length === 0) return false;
    return outputTypes.every(type => this.game.isResourceLimitMet(type));
  }

  private buildingNeedsTools(type: string): boolean {
    return [
      BuildingType.HUNTING_CABIN,
      BuildingType.HUNTING_LODGE,
      BuildingType.FISHING_DOCK,
      BuildingType.WOOD_CUTTER,
      BuildingType.SAWMILL,
      BuildingType.BLACKSMITH,
      BuildingType.IRON_WORKS,
      BuildingType.CROP_FIELD,
    ].includes(type as any);
  }

  private countWorkersAtBuilding(buildingId: number): number {
    const world = this.game.world;
    const workers = world.getComponentStore<any>('worker');
    if (!workers) return 0;

    let count = 0;
    for (const [, worker] of workers) {
      if (worker.workplaceId === buildingId) count++;
    }
    return count;
  }

  /** Get average skill level bonus for workers at a building */
  private getSkillBonus(buildingId: number, buildingType: string): number {
    const world = this.game.world;
    const workers = world.getComponentStore<any>('worker');
    if (!workers) return 0;

    // Determine which skill this building uses via profession mapping
    let totalBonus = 0;
    let count = 0;

    for (const [, worker] of workers) {
      if (worker.workplaceId !== buildingId) continue;
      count++;
      const skillType = PROFESSION_SKILL_MAP[worker.profession];
      if (!skillType || !worker.skills?.[skillType]) continue;
      totalBonus += worker.skills[skillType].level * SKILL_EFFICIENCY_PER_LEVEL;
    }

    return count > 0 ? totalBonus / count : 0;
  }

  /** Check if any worker at the building has mastery (level 5) in the relevant skill */
  private hasSkillMaster(buildingId: number, buildingType: string): boolean {
    const world = this.game.world;
    const workers = world.getComponentStore<any>('worker');
    if (!workers) return false;

    for (const [, worker] of workers) {
      if (worker.workplaceId !== buildingId) continue;
      const skillType = PROFESSION_SKILL_MAP[worker.profession];
      if (!skillType || !worker.skills?.[skillType]) continue;
      if (worker.skills[skillType].level >= SKILL_MAX_LEVEL) return true;
    }
    return false;
  }

  /** Average work speed trait bonus for all workers at a building */
  private getTraitWorkBonus(buildingId: number): number {
    const world = this.game.world;
    const workers = world.getComponentStore<any>('worker');
    const citizens = world.getComponentStore<any>('citizen');
    if (!workers || !citizens) return 0;

    let totalBonus = 0;
    let count = 0;
    for (const [id, worker] of workers) {
      if (worker.workplaceId !== buildingId) continue;
      const cit = citizens.get(id);
      if (!cit?.traits) continue;
      count++;
      for (const trait of cit.traits) {
        const bonus = TRAIT_WORK_SPEED_BONUS[trait as PersonalityTrait];
        if (bonus !== undefined) totalBonus += bonus;
      }
    }
    return count > 0 ? totalBonus / count : 0;
  }

  private logStorageFull(): void {
    const tick = this.game.state.tick;
    if (tick - this.lastStorageFullLog >= STORAGE_FULL_LOG_INTERVAL) {
      this.lastStorageFullLog = tick;
      logger.info('PRODUCTION', 'Storage full — production paused');
    }
  }

  private countEducatedWorkers(buildingId: number): number {
    const world = this.game.world;
    const workers = world.getComponentStore<any>('worker');
    const citizens = world.getComponentStore<any>('citizen');
    if (!workers || !citizens) return 0;

    let count = 0;
    for (const [id, worker] of workers) {
      if (worker.workplaceId === buildingId) {
        const cit = citizens.get(id);
        if (cit?.isEducated) count++;
      }
    }
    return count;
  }

  /** Return the education bonus multiplier. Academy gives a higher bonus than School. */
  private getEducationBonus(): number {
    const buildings = this.game.world.getComponentStore<any>('building');
    if (buildings) {
      for (const [, bld] of buildings) {
        if (bld.type === BuildingType.ACADEMY && bld.completed) {
          const workerCount = bld.assignedWorkers?.length || 0;
          if (workerCount > 0) return ACADEMY_EDUCATION_BONUS;
        }
      }
    }
    return EDUCATION_BONUS;
  }
}
