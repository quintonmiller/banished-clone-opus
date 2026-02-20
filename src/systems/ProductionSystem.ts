import type { Game } from '../Game';
import { RECIPE_DEFS } from '../data/RecipeDefs';
import { SEASON_DATA } from '../data/SeasonDefs';
import {
  EDUCATION_BONUS, BuildingType, ResourceType,
  NO_TOOL_PRODUCTION_MULT, TOOL_WEAR_PER_TICK,
  FORESTER_REPLANT_TICKS, TREE_GROWTH_TICKS,
  FOREST_EFFICIENCY_DIVISOR,
} from '../constants';

export class ProductionSystem {
  private game: Game;
  private foresterTimers = new Map<number, { replant: number; grow: number }>();

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

      const recipe = RECIPE_DEFS.find(r => r.buildingType === bld.type);
      if (!recipe) continue;

      const workerCount = this.countWorkersAtBuilding(id);
      producer.workerCount = workerCount;

      if (workerCount === 0) {
        producer.active = false;
        continue;
      }

      producer.active = true;

      let efficiency = workerCount / (bld.maxWorkers || 1);
      efficiency = Math.min(1, efficiency);

      // Educated worker bonus
      const educatedCount = this.countEducatedWorkers(id);
      if (educatedCount > 0) {
        efficiency *= 1 + (educatedCount / workerCount) * (EDUCATION_BONUS - 1);
      }

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

      // Seasonal modifier
      if (recipe.seasonalMultiplier) {
        if (bld.type === BuildingType.CROP_FIELD) {
          efficiency *= seasonData.cropGrowth;
          // Weather affects crops
          efficiency *= this.game.weatherSystem.getCropWeatherMult();
        } else {
          efficiency *= seasonData.gatheringRate;
        }
      }

      // Gathering from radius needs forest
      const pos = world.getComponent<any>(id, 'position');
      if (recipe.gatherFromRadius && pos) {
        const cx = pos.tileX + Math.floor(bld.width / 2);
        const cy = pos.tileY + Math.floor(bld.height / 2);
        const radius = bld.workRadius || 30;

        const forestCount = this.game.tileMap.countForestInRadius(cx, cy, radius);
        efficiency *= Math.min(1, forestCount / FOREST_EFFICIENCY_DIVISOR);
      }

      if (efficiency <= 0) continue;

      producer.timer += efficiency;

      if (producer.timer >= recipe.cooldownTicks) {
        producer.timer = 0;

        // Check inputs
        let hasInputs = true;
        for (const [res, amount] of Object.entries(recipe.inputs)) {
          if (this.game.getResource(res) < (amount as number)) {
            hasInputs = false;
            break;
          }
        }

        if (!hasInputs) continue;

        // --- Resource depletion: consume trees when gathering ---
        if (recipe.gatherFromRadius && pos) {
          const cx = pos.tileX + Math.floor(bld.width / 2);
          const cy = pos.tileY + Math.floor(bld.height / 2);
          const radius = bld.workRadius || 30;
          this.game.tileMap.consumeTreesInRadius(cx, cy, radius);
        }

        // Consume inputs
        for (const [res, amount] of Object.entries(recipe.inputs)) {
          this.game.removeResource(res, amount as number);
        }

        // Produce outputs
        for (const [res, amount] of Object.entries(recipe.outputs)) {
          let produced = amount as number;
          if (educatedCount > 0 && (bld.type === BuildingType.WOOD_CUTTER || bld.type === BuildingType.BLACKSMITH)) {
            produced = Math.ceil(produced * EDUCATION_BONUS);
          }
          this.game.addResource(res, produced);
        }
      }

      // --- Forester special behavior: replant and grow trees ---
      if (bld.type === BuildingType.FORESTER_LODGE && pos) {
        this.updateForester(id, pos, bld, workerCount);
      }
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

  private buildingNeedsTools(type: string): boolean {
    return [
      BuildingType.HUNTING_CABIN,
      BuildingType.FISHING_DOCK,
      BuildingType.FORESTER_LODGE,
      BuildingType.WOOD_CUTTER,
      BuildingType.BLACKSMITH,
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
}
