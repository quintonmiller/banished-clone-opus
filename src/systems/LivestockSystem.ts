import type { Game } from '../Game';
import {
  BuildingType, ResourceType, Season,
  CHICKEN_CAPACITY, CATTLE_CAPACITY,
  ANIMAL_FEED_PER_TICK, ANIMAL_STARVE_HEALTH_DAMAGE, ANIMAL_COLD_HEALTH_DAMAGE,
  CHICKEN_EGG_TICKS, CHICKEN_FEATHER_TICKS,
  CATTLE_MILK_TICKS, CATTLE_WOOL_TICKS,
  ANIMAL_BREED_CHANCE,
} from '../constants';

export interface LivestockData {
  animalCount: number;
  health: number;        // 0-100
  eggTimer: number;
  featherTimer: number;
  milkTimer: number;
  woolTimer: number;
}

export class LivestockSystem {
  private game: Game;
  private livestockData = new Map<number, LivestockData>();

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    const world = this.game.world;
    const buildings = world.getComponentStore<any>('building');
    const producers = world.getComponentStore<any>('producer');
    if (!buildings || !producers) return;

    // Don't tend animals at night
    if (this.game.state.isNight) return;

    for (const [id, bld] of buildings) {
      if (!bld.completed) continue;

      if (bld.type === BuildingType.CHICKEN_COOP) {
        this.updateAnimalBuilding(id, bld, CHICKEN_CAPACITY, 'chicken');
      } else if (bld.type === BuildingType.PASTURE) {
        this.updateAnimalBuilding(id, bld, CATTLE_CAPACITY, 'cattle');
      }
    }
  }

  private updateAnimalBuilding(id: number, bld: any, capacity: number, animalType: 'chicken' | 'cattle'): void {
    // Initialize livestock data
    if (!this.livestockData.has(id)) {
      this.livestockData.set(id, {
        animalCount: animalType === 'chicken' ? 3 : 2, // start with some animals
        health: 100,
        eggTimer: 0,
        featherTimer: 0,
        milkTimer: 0,
        woolTimer: 0,
      });
    }

    const data = this.livestockData.get(id)!;
    if (data.animalCount <= 0) return;

    // Check if herder is assigned
    const workerCount = this.countWorkersAtBuilding(id);

    // Feed animals — consume hay
    const hayNeeded = ANIMAL_FEED_PER_TICK * data.animalCount;
    const hayAvail = this.game.getResource(ResourceType.HAY);

    if (hayAvail >= hayNeeded) {
      this.game.removeResource(ResourceType.HAY, hayNeeded);
    } else {
      // Animals starving
      data.health = Math.max(0, data.health - ANIMAL_STARVE_HEALTH_DAMAGE);
    }

    // Winter cold check — animals without an enclosed building lose health
    const subSeason = this.game.state.subSeason;
    const isWinter = subSeason >= Season.EARLY_WINTER && subSeason <= Season.LATE_WINTER;
    if (isWinter && animalType === 'cattle') {
      // Cattle in open pasture suffer in winter
      data.health = Math.max(0, data.health - ANIMAL_COLD_HEALTH_DAMAGE);
    }

    // Health recovery when fed and warm
    if (hayAvail >= hayNeeded && !isWinter) {
      data.health = Math.min(100, data.health + 0.01);
    }

    // Animals die if health reaches 0
    if (data.health <= 0) {
      const died = Math.max(1, Math.floor(data.animalCount * 0.3));
      data.animalCount = Math.max(0, data.animalCount - died);
      data.health = 30; // surviving animals are weakened
      if (animalType === 'cattle') {
        // Dead cattle produce some leather
        this.game.addResource(ResourceType.LEATHER, died * 2);
      }
      return;
    }

    // No production without a herder
    if (workerCount === 0) return;

    // Production
    if (animalType === 'chicken') {
      data.eggTimer += data.animalCount;
      if (data.eggTimer >= CHICKEN_EGG_TICKS) {
        data.eggTimer = 0;
        this.game.addResource(ResourceType.EGGS, Math.ceil(data.animalCount * 0.5));
      }
      data.featherTimer += data.animalCount;
      if (data.featherTimer >= CHICKEN_FEATHER_TICKS) {
        data.featherTimer = 0;
        this.game.addResource(ResourceType.FEATHERS, Math.ceil(data.animalCount * 0.3));
      }
    } else {
      data.milkTimer += data.animalCount;
      if (data.milkTimer >= CATTLE_MILK_TICKS) {
        data.milkTimer = 0;
        this.game.addResource(ResourceType.MILK, data.animalCount);
      }
      data.woolTimer += data.animalCount;
      if (data.woolTimer >= CATTLE_WOOL_TICKS) {
        data.woolTimer = 0;
        this.game.addResource(ResourceType.WOOL, Math.ceil(data.animalCount * 0.5));
      }
    }

    // Breeding — chance to gain a new animal if below capacity and healthy
    if (data.animalCount < capacity && data.health > 50 && data.animalCount >= 2) {
      if (Math.random() < ANIMAL_BREED_CHANCE * data.animalCount) {
        data.animalCount++;
      }
    }
  }

  /** Get livestock data for info panel display */
  getLivestockData(buildingId: number): LivestockData | undefined {
    return this.livestockData.get(buildingId);
  }

  getInternalState(): { livestock: [number, LivestockData][] } {
    return { livestock: [...this.livestockData] };
  }

  setInternalState(s: { livestock: [number, LivestockData][] }): void {
    this.livestockData = new Map(s.livestock);
  }

  private countWorkersAtBuilding(buildingId: number): number {
    const workers = this.game.world.getComponentStore<any>('worker');
    if (!workers) return 0;
    let count = 0;
    for (const [, worker] of workers) {
      if (worker.workplaceId === buildingId) count++;
    }
    return count;
  }
}
