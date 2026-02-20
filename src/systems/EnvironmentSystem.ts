import type { Game } from '../Game';
import {
  TileType, NATURAL_REGROWTH_CHANCE, MAP_WIDTH, MAP_HEIGHT,
  BUILDING_DECAY_PER_TICK, BUILDING_MAX_DURABILITY,
  ENVIRONMENT_TILES_PER_TICK, MAX_TREE_DENSITY, FOREST_GROWTH_CHANCE,
  BUILDING_DECAY_CHECK_INTERVAL, Profession,
} from '../constants';

/**
 * Handles natural environment processes:
 * - Slow tree regrowth near existing forests
 * - Tree density growth over time
 * - Building decay over time
 */
export class EnvironmentSystem {
  private game: Game;
  private scanIndex = 0;
  private buildingDecayCounter = 0;

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    const tileMap = this.game.tileMap;
    const totalTiles = MAP_WIDTH * MAP_HEIGHT;

    // Scan a portion of the map each tick
    for (let i = 0; i < ENVIRONMENT_TILES_PER_TICK; i++) {
      const idx = this.scanIndex;
      this.scanIndex = (this.scanIndex + 1) % totalTiles;

      const tile = tileMap.tiles[idx];

      // Natural regrowth: grass tiles adjacent to forest may sprout a tree
      if (tile.type === TileType.GRASS && !tile.occupied) {
        if (Math.random() < NATURAL_REGROWTH_CHANCE) {
          const x = idx % MAP_WIDTH;
          const y = Math.floor(idx / MAP_WIDTH);
          if (this.hasAdjacentForest(x, y)) {
            tile.type = TileType.FOREST;
            tile.trees = 1;
          }
        }
      }

      // Existing forests slowly grow denser
      if (tile.type === TileType.FOREST && tile.trees < MAX_TREE_DENSITY) {
        if (Math.random() < FOREST_GROWTH_CHANCE) {
          tile.trees = Math.min(MAX_TREE_DENSITY, tile.trees + 1);
        }
      }
    }

    // Building decay — check every 10 ticks
    this.buildingDecayCounter++;
    if (this.buildingDecayCounter >= BUILDING_DECAY_CHECK_INTERVAL) {
      this.buildingDecayCounter = 0;
      this.decayBuildings();
    }
  }

  private decayBuildings(): void {
    const world = this.game.world;
    const buildings = world.getComponentStore<any>('building');
    if (!buildings) return;

    for (const [id, bld] of buildings) {
      if (!bld.completed) continue;

      // Initialize durability
      if (bld.durability === undefined) bld.durability = BUILDING_MAX_DURABILITY;

      // Decay
      bld.durability -= BUILDING_DECAY_PER_TICK * BUILDING_DECAY_CHECK_INTERVAL;

      // Buildings at 0 durability collapse
      if (bld.durability <= 0) {
        this.collapseBuilding(id, bld);
      }
    }
  }

  private collapseBuilding(id: number, bld: any): void {
    const world = this.game.world;

    // Remove workers
    if (bld.assignedWorkers) {
      for (const wId of bld.assignedWorkers) {
        const worker = world.getComponent<any>(wId, 'worker');
        if (worker) {
          worker.workplaceId = null;
          worker.profession = Profession.LABORER;
        }
      }
    }

    // Remove residents
    const house = world.getComponent<any>(id, 'house');
    if (house?.residents) {
      for (const rId of house.residents) {
        const fam = world.getComponent<any>(rId, 'family');
        if (fam) fam.homeId = null;
      }
    }

    // Free tiles
    const pos = world.getComponent<any>(id, 'position');
    if (pos) {
      for (let dy = 0; dy < (bld.height || 1); dy++) {
        for (let dx = 0; dx < (bld.width || 1); dx++) {
          this.game.tileMap.set(pos.tileX + dx, pos.tileY + dy, {
            occupied: false,
            buildingId: null,
          });
        }
      }
    }

    world.destroyEntity(id);
    this.game.eventBus.emit('building_collapsed', { name: bld.name, tileX: pos?.tileX, tileY: pos?.tileY });
  }

  getInternalState(): { scanIndex: number; buildingDecayCounter: number } {
    return { scanIndex: this.scanIndex, buildingDecayCounter: this.buildingDecayCounter };
  }

  setInternalState(s: { scanIndex: number; buildingDecayCounter: number }): void {
    this.scanIndex = s.scanIndex;
    this.buildingDecayCounter = s.buildingDecayCounter;
  }

  private hasAdjacentForest(x: number, y: number): boolean {
    const tileMap = this.game.tileMap;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tile = tileMap.get(x + dx, y + dy);
        if (tile && tile.type === TileType.FOREST) return true;
      }
    }
    return false;
  }
}
