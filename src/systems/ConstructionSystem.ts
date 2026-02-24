import type { Game } from '../Game';
import {
  EDUCATION_BONUS, CONSTRUCTION_WORK_RATE, EDUCATED_CONSTRUCTION_BONUS,
  INITIAL_HOUSE_WARMTH, TRAIT_WORK_SPEED_BONUS, PersonalityTrait,
  PROFESSION_SKILL_MAP, SKILL_EFFICIENCY_PER_LEVEL, SkillType,
  BuildingType, TileType,
  QUARRY_UNDERGROUND_STONE_MIN, QUARRY_UNDERGROUND_STONE_MAX,
  MINE_UNDERGROUND_IRON_MIN, MINE_UNDERGROUND_IRON_MAX,
  MINE_ELEVATION_BONUS, MINE_SURFACE_BONUS_PER_TILE, MINE_SURFACE_SCAN_RADIUS,
  HEATED_BUILDING_TYPES,
} from '../constants';
import { BUILDING_DEFS } from '../data/BuildingDefs';

export class ConstructionSystem {
  private game: Game;
  private static readonly CONSTRUCTION_TASK_PREFIX = 'construct:';
  private static readonly UPGRADE_TASK_PREFIX = 'upgrade:';

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    const world = this.game.world;
    const buildings = world.getComponentStore<any>('building');
    if (!buildings) return;

    // Collect road/bridge completions to process after the main loop
    const toConvert: Array<{ id: number; bld: any; bPos: any }> = [];

    for (const [id, bld] of buildings) {
      if (bld.completed) continue;

      // Only workers explicitly constructing this site can contribute.
      const bPos = world.getComponent<any>(id, 'position')!;
      const workers = this.findActiveBuildersForSite(
        id,
        bPos.tileX,
        bPos.tileY,
        bld.width,
        bld.height,
      );

      if (workers.length === 0) continue;

      if (bld.isDemolishing) {
        const workRate = this.computeBuilderWorkRate(workers);
        const totalWork = Math.max(1, bld.demolitionWork || bld.constructionWork || 100);

        bld.constructionProgress -= workRate / totalWork;
        bld.constructionProgress = Math.max(0, bld.constructionProgress);
        bld.demolitionProgress = 1 - bld.constructionProgress;

        if (bld.constructionProgress <= 0) {
          bld.constructionProgress = 0;
          bld.demolitionProgress = 1;
          this.finalizeDemolition(id);
        }
        continue;
      }

      // Check if construction materials are available
      if (bld.constructionProgress === 0 && !bld.materialsDelivered) {
        // Deduct materials on first work
        const def = bld;
        const hasLog = this.game.getResource('log') >= (def.costLog || 0);
        const hasStone = this.game.getResource('stone') >= (def.costStone || 0);
        const hasIron = this.game.getResource('iron') >= (def.costIron || 0);

        if (hasLog && hasStone && hasIron) {
          this.game.removeResource('log', def.costLog || 0);
          this.game.removeResource('stone', def.costStone || 0);
          this.game.removeResource('iron', def.costIron || 0);
          bld.materialsDelivered = true;
        } else {
          continue; // Can't build without materials
        }
      }

      if (!bld.materialsDelivered && bld.constructionProgress === 0) continue;

      // Advance construction
      const workRate = this.computeBuilderWorkRate(workers);

      bld.constructionProgress += workRate / (bld.constructionWork || 100);

      if (bld.constructionProgress >= 1) {
        bld.constructionProgress = 1;
        bld.completed = true;

        // Roads and bridges convert to tile type instead of becoming a permanent entity
        if (bld.type === BuildingType.ROAD || bld.type === BuildingType.BRIDGE || bld.type === BuildingType.STONE_ROAD) {
          toConvert.push({ id, bld, bPos });
          continue;
        }

        this.game.eventBus.emit('building_completed', {
          id, name: bld.name, tileX: bPos.tileX, tileY: bPos.tileY,
        });

        // Transition construction workers: keep up to maxWorkers, unassign the rest
        if (bld.assignedWorkers && bld.assignedWorkers.length > 0) {
          const keep = bld.assignedWorkers.slice(0, bld.maxWorkers || 0);
          const excess = bld.assignedWorkers.slice(bld.maxWorkers || 0);
          bld.assignedWorkers = keep;
          for (const wId of keep) {
            const worker = this.game.world.getComponent<any>(wId, 'worker');
            if (worker) {
              worker.profession = this.game.populationSystem.getProfessionForBuilding(bld.type);
            }
          }
          for (const wId of excess) {
            this.game.unassignWorker(wId);
          }
        }

        // Add producer component if this building produces resources
        this.initCompletedBuilding(id, bld);
      }
    }

    // Convert completed road/bridge/stone-road entities into tile types and destroy the entity
    for (const { id, bld, bPos } of toConvert) {
      const { tileX: x, tileY: y } = bPos;

      // Clear construction workers' tasks so they re-evaluate on next AI tick
      const workerStore = world.getComponentStore<any>('worker');
      if (workerStore) {
        const requiredTask = `${ConstructionSystem.CONSTRUCTION_TASK_PREFIX}${id}`;
        for (const [, w] of workerStore) {
          if (w.task === requiredTask) w.task = null;
        }
      }

      // Remove entity occupation so the tile can accept a new type
      this.game.tileMap.clearOccupied(x, y);

      // Stamp the finished tile type
      if (bld.type === BuildingType.STONE_ROAD) {
        this.game.tileMap.placeStoneRoad(x, y);
      } else if (bld.type === BuildingType.ROAD) {
        this.game.tileMap.placeRoad(x, y);
      } else {
        this.game.tileMap.placeBridge(x, y);
      }

      this.game.world.destroyEntity(id);
      this.game.pathfinder.clearCache();
      this.game.eventBus.emit('building_completed', {
        id, name: bld.name, tileX: x, tileY: y,
      });
    }

    // ── Upgrade progress loop ─────────────────────────────────────────────
    for (const [id, bld] of buildings) {
      if (!bld.completed || !bld.isUpgrading) continue;

      const bPos = world.getComponent<any>(id, 'position')!;
      const upgraders = this.findActiveUpgradersForSite(
        id,
        bPos.tileX,
        bPos.tileY,
        bld.width,
        bld.height,
      );

      if (upgraders.length === 0) continue;

      const workRate = this.computeBuilderWorkRate(upgraders);

      bld.upgradeProgress = (bld.upgradeProgress ?? 0) + workRate / (bld.upgradeTotalWork ?? 200);

      if (bld.upgradeProgress >= 1) {
        bld.upgradeProgress = 1;
        bld.isUpgrading = false;
        this.finalizeUpgrade(id, bld);

        // Clear upgrade tasks from all workers
        const workerStore2 = world.getComponentStore<any>('worker');
        const upgradeTask = `${ConstructionSystem.UPGRADE_TASK_PREFIX}${id}`;
        if (workerStore2) {
          for (const [, w] of workerStore2) {
            if (w.task === upgradeTask) w.task = null;
          }
        }
      }
    }
  }

  private findActiveBuildersForSite(
    buildingId: number,
    bx: number,
    by: number,
    bw: number,
    bh: number,
  ): number[] {
    const world = this.game.world;
    const result: number[] = [];
    const positions = world.getComponentStore<any>('position');
    const workers = world.getComponentStore<any>('worker');
    const citizens = world.getComponentStore<any>('citizen');
    if (!positions || !workers || !citizens) return result;

    const requiredTask = `${ConstructionSystem.CONSTRUCTION_TASK_PREFIX}${buildingId}`;

    for (const [id, worker] of workers) {
      if (worker.task !== requiredTask) continue;

      const citizen = citizens.get(id);
      if (!citizen || citizen.isSleeping || citizen.activity !== 'building') continue;

      const pos = positions.get(id);
      if (!pos) continue;

      // Check if within 2 tiles of building
      const dx = pos.tileX - bx;
      const dy = pos.tileY - by;
      if (dx >= -2 && dx <= bw + 1 && dy >= -2 && dy <= bh + 1) {
        result.push(id);
      }
    }
    return result;
  }

  private findActiveUpgradersForSite(
    buildingId: number,
    bx: number,
    by: number,
    bw: number,
    bh: number,
  ): number[] {
    const world = this.game.world;
    const result: number[] = [];
    const positions = world.getComponentStore<any>('position');
    const workers = world.getComponentStore<any>('worker');
    const citizens = world.getComponentStore<any>('citizen');
    if (!positions || !workers || !citizens) return result;

    const requiredTask = `${ConstructionSystem.UPGRADE_TASK_PREFIX}${buildingId}`;

    for (const [id, worker] of workers) {
      if (worker.task !== requiredTask) continue;

      const citizen = citizens.get(id);
      if (!citizen || citizen.isSleeping || citizen.activity !== 'upgrading') continue;

      const pos = positions.get(id);
      if (!pos) continue;

      const dx = pos.tileX - bx;
      const dy = pos.tileY - by;
      if (dx >= -2 && dx <= bw + 1 && dy >= -2 && dy <= bh + 1) {
        result.push(id);
      }
    }
    return result;
  }

  private computeBuilderWorkRate(workerIds: number[]): number {
    const world = this.game.world;
    let workRate = workerIds.length * CONSTRUCTION_WORK_RATE;

    for (const wId of workerIds) {
      const cit = world.getComponent<any>(wId, 'citizen');
      if (cit?.isEducated) workRate += EDUCATED_CONSTRUCTION_BONUS;
      if (cit?.traits) {
        for (const trait of cit.traits) {
          const bonus = TRAIT_WORK_SPEED_BONUS[trait as PersonalityTrait];
          if (bonus) workRate += CONSTRUCTION_WORK_RATE * bonus;
        }
      }
      const workerComp = world.getComponent<any>(wId, 'worker');
      if (workerComp?.skills) {
        const buildSkill = workerComp.skills[SkillType.BUILDING];
        if (buildSkill) {
          workRate += CONSTRUCTION_WORK_RATE * buildSkill.level * SKILL_EFFICIENCY_PER_LEVEL;
        }
      }
    }

    // Fair knowledge bonus: masonry techniques
    const masonryBonus = this.game.festivalSystem.getFairBonus('masonry');
    if (masonryBonus > 0) workRate *= (1 + masonryBonus);

    return workRate;
  }

  private finalizeDemolition(id: number): void {
    const world = this.game.world;
    const workerStore = world.getComponentStore<any>('worker');
    const requiredTask = `${ConstructionSystem.CONSTRUCTION_TASK_PREFIX}${id}`;
    if (workerStore) {
      for (const [, w] of workerStore) {
        if (w.task === requiredTask) w.task = null;
      }
    }

    this.game.completeDemolition(id);
  }

  /** Apply the upgrade: overwrite building fields in-place. */
  private finalizeUpgrade(id: number, bld: any): void {
    const targetType = bld.upgradeTargetType as BuildingType;
    if (!targetType) return;

    const targetDef = BUILDING_DEFS[targetType];
    if (!targetDef) return;

    const world = this.game.world;
    const bPos = world.getComponent<any>(id, 'position')!;

    // For size-expanding upgrades, claim extra tiles
    const oldW = bld.width as number;
    const oldH = bld.height as number;
    const newW = targetDef.upgradeSizeW ?? oldW;
    const newH = targetDef.upgradeSizeH ?? oldH;

    if (newW > oldW || newH > oldH) {
      // Re-check that extra tiles are still clear before claiming them
      if (!this.checkExtraUpgradeTilesInternal(bPos.tileX, bPos.tileY, oldW, oldH, newW, newH)) {
        // Expansion blocked — refund resources and cancel
        this.game.addResource('log', targetDef.upgradeCostLog ?? 0);
        this.game.addResource('stone', targetDef.upgradeCostStone ?? 0);
        this.game.addResource('iron', targetDef.upgradeCostIron ?? 0);
        bld.upgradeTargetType = undefined;
        this.game.eventBus.emit('notification', {
          text: 'Upgrade cancelled: expansion area is now blocked!',
          color: '#ff8844',
        });
        return;
      }

      // Mark extra tiles as occupied
      this.game.tileMap.markOccupied(bPos.tileX, bPos.tileY, newW, newH, id, targetDef.blocksMovement !== false);
      bld.width = newW;
      bld.height = newH;
      this.game.pathfinder.clearCache();
    }

    // Overwrite building fields
    bld.type = targetDef.type;
    bld.name = targetDef.name;
    bld.maxWorkers = targetDef.maxWorkers;
    bld.workRadius = targetDef.workRadius;
    bld.tier = 2;
    bld.durability = 100; // rebuilt

    // Update storage capacity
    if (targetDef.storageCapacity) {
      bld.isStorage = true;
      bld.storageCapacity = targetDef.storageCapacity;
      const storage = world.getComponent<any>(id, 'storage');
      if (storage) {
        storage.capacity = targetDef.storageCapacity;
      } else {
        world.addComponent(id, 'storage', {
          inventory: {} as Record<string, number>,
          capacity: targetDef.storageCapacity,
        });
      }
    }

    // Update house capacity
    if (targetDef.residents !== undefined) {
      bld.residents = targetDef.residents;
      const house = world.getComponent<any>(id, 'house');
      if (house) {
        house.maxResidents = targetDef.residents;
      }
    }

    // Update door def
    if (targetDef.doorDef !== undefined) {
      bld.doorDef = targetDef.doorDef;
    }

    // Reset producer timer and recipe index
    const producer = world.getComponent<any>(id, 'producer');
    if (producer) {
      producer.timer = 0;
      producer.recipeIndex = 0;
      producer.active = false;
    }

    // Trim assigned workers to new maxWorkers
    if (bld.assignedWorkers && bld.maxWorkers >= 0) {
      const excess = bld.assignedWorkers.splice(bld.maxWorkers);
      for (const wId of excess) {
        this.game.unassignWorker(wId);
      }
      // Update profession for retained workers
      for (const wId of bld.assignedWorkers) {
        const worker = world.getComponent<any>(wId, 'worker');
        if (worker) {
          worker.profession = this.game.populationSystem.getProfessionForBuilding(bld.type);
        }
      }
    }

    // Clean up upgrade fields
    delete bld.upgradeTargetType;
    delete bld.upgradeTotalWork;
    delete bld.upgradeProgress;

    this.game.eventBus.emit('building_upgraded', {
      id, name: bld.name, tileX: bPos.tileX, tileY: bPos.tileY,
    });
  }

  /** Check that extra tiles (for expanding upgrade) are all clear */
  checkExtraUpgradeTilesInternal(
    bx: number,
    by: number,
    oldW: number,
    oldH: number,
    newW: number,
    newH: number,
  ): boolean {
    // Check right columns (oldW..newW-1 for all rows)
    for (let dy = 0; dy < newH; dy++) {
      for (let dx = oldW; dx < newW; dx++) {
        if (!this.game.tileMap.isBuildable(bx + dx, by + dy)) return false;
      }
    }
    // Check bottom rows (0..oldW-1 for rows oldH..newH-1)
    for (let dy = oldH; dy < newH; dy++) {
      for (let dx = 0; dx < oldW; dx++) {
        if (!this.game.tileMap.isBuildable(bx + dx, by + dy)) return false;
      }
    }
    return true;
  }

  private initCompletedBuilding(id: number, bld: any): void {
    const world = this.game.world;

    // Add storage component for storage buildings
    if (bld.isStorage || bld.storageCapacity) {
      if (!world.hasComponent(id, 'storage')) {
        world.addComponent(id, 'storage', {
          inventory: {} as Record<string, number>,
          capacity: bld.storageCapacity || 5000,
        });
      }
    }

    // Add producer component for production buildings
    world.addComponent(id, 'producer', {
      timer: 0,
      active: false,
      workerCount: 0,
    });

    // Seed underground reserve for mine/quarry buildings
    if (bld.type === BuildingType.QUARRY || bld.type === BuildingType.MINE) {
      const bPos = this.game.world.getComponent<any>(id, 'position')!;
      const centerTile = this.game.tileMap.get(bPos.tileX, bPos.tileY);
      const elevation = centerTile?.elevation ?? 0.5;

      let surfaceCount = 0;
      const r = MINE_SURFACE_SCAN_RADIUS;
      const r2 = r * r;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          const t = this.game.tileMap.get(bPos.tileX + dx, bPos.tileY + dy);
          if (!t) continue;
          if (bld.type === BuildingType.QUARRY && t.type === TileType.STONE) surfaceCount++;
          if (bld.type === BuildingType.MINE && t.type === TileType.IRON) surfaceCount++;
        }
      }

      const isQuarry = bld.type === BuildingType.QUARRY;
      const [min, max] = isQuarry
        ? [QUARRY_UNDERGROUND_STONE_MIN, QUARRY_UNDERGROUND_STONE_MAX]
        : [MINE_UNDERGROUND_IRON_MIN, MINE_UNDERGROUND_IRON_MAX];
      const reserve = Math.floor(
        min + Math.random() * (max - min)
        + elevation * MINE_ELEVATION_BONUS
        + surfaceCount * MINE_SURFACE_BONUS_PER_TILE,
      );
      const vein = this.game.getOrCreateMineVeinReserve(
        bld.type,
        bPos.tileX,
        bPos.tileY,
        reserve,
      );

      const producer = this.game.world.getComponent<any>(id, 'producer')!;
      if (isQuarry) producer.undergroundStone = vein.remaining;
      else producer.undergroundIron = vein.remaining;
      producer.maxUnderground = vein.max;
    }

    // Add house component for houses
    if (bld.type === BuildingType.WOODEN_HOUSE || bld.type === BuildingType.STONE_HOUSE) {
      if (!world.hasComponent(id, 'house')) {
        world.addComponent(id, 'house', {
          residents: [],
          firewood: 0,
          warmthLevel: INITIAL_HOUSE_WARMTH,
          maxResidents: bld.residents || 5,
        });
      }
    }

    // Init warmth fields for heated public buildings
    if (HEATED_BUILDING_TYPES.has(bld.type)) {
      if (bld.warmthLevel === undefined) bld.warmthLevel = 0;
      if (bld.firewood === undefined) bld.firewood = 0;
    }
  }
}
