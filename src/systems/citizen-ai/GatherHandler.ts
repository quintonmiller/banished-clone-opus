import type { Game } from '../../Game';
import type { NavigationHelpers } from './NavigationHelpers';
import { EntityId } from '../../types';
import { logger } from '../../utils/Logger';
import { SEASON_DATA } from '../../data/SeasonDefs';
import {
  Profession, BuildingType, TileType, ResourceType,
  AI_TICK_INTERVAL, EDUCATION_BONUS,
  SKILL_EFFICIENCY_PER_LEVEL, SKILL_MAX_LEVEL, SKILL_MASTERY_BONUS_CHANCE,
  GATHER_TICKS_BASE, GATHER_CARRY_CAPACITY,
  GATHER_DEPLETION_PER_HARVEST, GATHER_ROOTS_CHANCE,
  GATHER_CARRY_SKILL_BONUS, GATHER_TOOL_WEAR_PER_TRIP,
  NO_TOOL_PRODUCTION_MULT,
  FORESTER_CHOP_TICKS, FORESTER_CARRY_CAPACITY,
  QUARRY_SURFACE_STONE_PER_HARVEST, MINE_SURFACE_IRON_PER_HARVEST,
  QUARRY_CYCLE_TICKS, MINE_CYCLE_TICKS,
  QUARRY_STONE_PER_CYCLE, MINE_IRON_PER_CYCLE,
  MINE_VEIN_DEPLETION_FAST, MINE_VEIN_DEPLETION_SLOW, MINE_VEIN_EXHAUSTED_THRESHOLD,
  MINE_CARRY_BONUS_PER_SKILL,
} from '../../constants';
import { BUILDING_ACTIVITY_LABELS, grantSkillXP, getWorkerSkillLevel, getCitizenTraitBonus } from './CitizenUtils';

/** Map building type to the tile resource field(s) workers should seek */
const BUILDING_RESOURCE_TARGETS: Record<string, Array<'berries' | 'mushrooms' | 'herbs' | 'fish' | 'wildlife'>> = {
  [BuildingType.GATHERING_HUT]: ['berries', 'mushrooms'],
  [BuildingType.GATHERING_LODGE]: ['berries', 'mushrooms'],
  [BuildingType.HUNTING_CABIN]: ['wildlife'],
  [BuildingType.HUNTING_LODGE]: ['wildlife'],
  [BuildingType.FISHING_DOCK]: ['fish'],
  [BuildingType.HERBALIST]: ['herbs'],
};

export class GatherHandler {
  constructor(private game: Game, private nav: NavigationHelpers) {}

  /** Unassign a worker from their workplace */
  unassignWorker(id: EntityId, worker: any): void {
    if (worker.workplaceId === null) return;

    const bld = this.game.world.getComponent<any>(worker.workplaceId, 'building');
    if (bld?.assignedWorkers) {
      bld.assignedWorkers = bld.assignedWorkers.filter((w: number) => w !== id);
    }

    worker.workplaceId = null;
    worker.profession = Profession.LABORER;
    worker.manuallyAssigned = false;

    // Clear gather-carry-deposit state
    worker.gatherState = undefined;
    worker.gatherTimer = 0;
    worker.gatherTargetTile = null;
    worker.carrying = null;
    worker.carryAmount = 0;
    worker.pendingResource = null;
    worker.depositTargetId = null;
    worker.demolitionCarryQueue = undefined;
    worker.task = null;
  }

  /** Main gather-carry-deposit state machine */
  handleGatherCycle(
    id: EntityId, worker: any, citizen: any, movement: any,
    needs: any, buildingId: EntityId, bld: any,
  ): void {
    // Initialize gather state if needed
    if (!worker.gatherState) {
      // If returning from an interrupt while carrying, go deposit
      if (worker.carrying) {
        worker.gatherState = 'returning';
      } else {
        worker.gatherState = 'seeking';
      }
    }

    const seasonalRate = this.getSeasonalGatherRate(bld.type);
    const resourceTypes = this.getGatherResourceTypes(bld.type);

    // -- SEEKING --
    if (worker.gatherState === 'seeking') {
      citizen.activity = BUILDING_ACTIVITY_LABELS[bld.type] || 'gathering';
      movement.stuckTicks = 0;

      // Season blocks gathering (rate = 0) -> idle at building
      if (seasonalRate <= 0) {
        citizen.activity = 'idle';
        if (!this.nav.isNearBuilding(id, buildingId)) {
          this.nav.goToBuilding(id, buildingId);
        }
        return;
      }

      // Storage full -> idle at building
      if (this.game.isStorageFull()) {
        citizen.activity = 'idle';
        if (!this.nav.isNearBuilding(id, buildingId)) {
          this.nav.goToBuilding(id, buildingId);
        }
        return;
      }

      // If we have a target tile, check if we've arrived
      if (worker.gatherTargetTile) {
        const target = worker.gatherTargetTile;

        // Check if resource is still there
        const tile = this.game.tileMap.get(target.x, target.y);
        let hasResource = false;
        if (tile) {
          if (bld.type === BuildingType.FORESTER_LODGE) {
            hasResource = tile.type === TileType.FOREST && tile.trees > 0;
          } else {
            for (const res of resourceTypes) {
              // For fishing, the target tile is the walkable shore tile;
              // check adjacent water tiles for fish
              if (bld.type === BuildingType.FISHING_DOCK) {
                if (this.hasAdjacentResource(target.x, target.y, 'fish')) {
                  hasResource = true;
                  break;
                }
              } else if (tile[res] > 0) {
                hasResource = true;
                break;
              }
            }
          }
        }

        if (!hasResource) {
          // Resource depleted while walking — re-seek
          worker.gatherTargetTile = null;
          // Fall through to seek below
        } else if (this.isAtTile(id, target.x, target.y)) {
          // Arrived at resource tile — transition to gathering
          worker.gatherState = 'gathering';
          worker.gatherTimer = 0;
          return;
        } else if (!movement.path || movement.path.length === 0) {
          // Path is empty but not at target — re-path
          const pos = this.game.world.getComponent<any>(id, 'position')!;
          const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, target.x, target.y);
          if (result.found && result.path.length > 0) {
            movement.path = result.path;
            movement.targetEntity = buildingId;
          } else {
            // Can't reach target — clear and re-seek
            worker.gatherTargetTile = null;
          }
          return;
        } else {
          // Still walking to target
          return;
        }
      }

      // No target — find a new resource tile
      const isForester = bld.type === BuildingType.FORESTER_LODGE;
      const found = isForester
        ? this.findForestTile(id, buildingId, bld)
        : this.findResourceTile(id, buildingId, bld, resourceTypes);
      if (found) {
        worker.gatherTargetTile = { x: found.x, y: found.y };
        const pos = this.game.world.getComponent<any>(id, 'position')!;
        const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, found.x, found.y);
        if (result.found && result.path.length > 0) {
          movement.path = result.path;
          movement.targetEntity = buildingId;
          movement.stuckTicks = 0;
        }
      } else {
        // No resources in radius — idle at building
        citizen.activity = 'idle';
        if (!this.nav.isNearBuilding(id, buildingId)) {
          this.nav.goToBuilding(id, buildingId);
        }
      }
      return;
    }

    // -- GATHERING --
    if (worker.gatherState === 'gathering') {
      citizen.activity = BUILDING_ACTIVITY_LABELS[bld.type] || 'gathering';
      movement.stuckTicks = 0;

      // Compute effective gather time
      const isForester = bld.type === BuildingType.FORESTER_LODGE;
      const baseTime = isForester ? FORESTER_CHOP_TICKS : GATHER_TICKS_BASE;
      const skillLevel = getWorkerSkillLevel(worker);
      const skillBonus = skillLevel * SKILL_EFFICIENCY_PER_LEVEL;
      const traitBonus = getCitizenTraitBonus(citizen);
      const educationBonus = citizen.isEducated ? (EDUCATION_BONUS - 1) : 0;
      const milestoneBonus = this.game.achievementSystem.getBonus('gathering_speed');
      const effectiveTime = baseTime / (seasonalRate * (1 + skillBonus + traitBonus + educationBonus + milestoneBonus));

      // Grant skill XP while gathering
      grantSkillXP(worker);

      worker.gatherTimer = (worker.gatherTimer || 0) + AI_TICK_INTERVAL;

      if (worker.gatherTimer >= effectiveTime) {
        // Verify resource still exists at target tile
        const target = worker.gatherTargetTile;
        if (!target) {
          worker.gatherState = 'seeking';
          return;
        }

        // Determine which specific resource to harvest
        let harvestedResource: string | null = null;
        const tile = this.game.tileMap.get(target.x, target.y);

        if (isForester) {
          // Forester: decrement tree count, convert to grass if depleted
          if (tile && tile.type === TileType.FOREST && tile.trees > 0) {
            tile.trees = Math.max(0, tile.trees - 1);
            if (tile.trees <= 0) {
              tile.type = TileType.GRASS;
            }
            harvestedResource = 'trees';
          }
        } else if (bld.type === BuildingType.FISHING_DOCK) {
          // Fish are on adjacent water tiles
          const fishTile = this.findAdjacentResourceTile(target.x, target.y, 'fish');
          if (fishTile) {
            harvestedResource = 'fish';
            const ft = this.game.tileMap.get(fishTile.x, fishTile.y);
            if (ft) ft.fish = Math.max(0, ft.fish - GATHER_DEPLETION_PER_HARVEST);
          }
        } else if (tile) {
          for (const res of resourceTypes) {
            if (tile[res] > 0) {
              harvestedResource = res;
              (tile as any)[res] = Math.max(0, (tile as any)[res] - GATHER_DEPLETION_PER_HARVEST);
              break;
            }
          }
        }

        if (!harvestedResource) {
          // Resource depleted during gather — re-seek
          worker.gatherState = 'seeking';
          worker.gatherTargetTile = null;
          worker.gatherTimer = 0;
          return;
        }

        // Compute carry amount
        let carryAmount = (isForester ? FORESTER_CARRY_CAPACITY : GATHER_CARRY_CAPACITY)
          + skillLevel * GATHER_CARRY_SKILL_BONUS;

        // Tool check for tool-requiring buildings
        const needsTool = bld.type === BuildingType.HUNTING_CABIN
          || bld.type === BuildingType.FISHING_DOCK
          || bld.type === BuildingType.FORESTER_LODGE;
        if (needsTool) {
          const hasTools = this.game.getResource(ResourceType.TOOL) > 0;
          if (!hasTools) {
            carryAmount = Math.floor(carryAmount * NO_TOOL_PRODUCTION_MULT);
          } else {
            this.game.removeResource(ResourceType.TOOL, GATHER_TOOL_WEAR_PER_TRIP);
          }
        }

        // Mastery bonus: skill level 5 -> chance of +1
        if (skillLevel >= SKILL_MAX_LEVEL && Math.random() < SKILL_MASTERY_BONUS_CHANCE) {
          carryAmount += 1;
        }

        carryAmount = Math.max(1, carryAmount);

        // Set carrying based on building type
        switch (bld.type) {
          case BuildingType.GATHERING_HUT:
            if (harvestedResource === 'berries') {
            worker.carrying = ResourceType.BERRIES;
          } else {
            worker.carrying = ResourceType.MUSHROOMS;
          }
          worker.carryAmount = carryAmount;
          // Bonus: chance of roots
          if (Math.random() < GATHER_ROOTS_CHANCE) {
            // Add roots directly to stockpile (small bonus, not carried)
            this.game.addResourceRespectingLimit(ResourceType.ROOTS, 1);
          }
          break;

          case BuildingType.HUNTING_CABIN:
            worker.carrying = ResourceType.VENISON;
            worker.carryAmount = carryAmount;
            // Leather as pending second trip
            const leatherAmount = Math.max(1, Math.floor(carryAmount * 0.3));
            worker.pendingResource = {
              type: ResourceType.LEATHER,
              amount: leatherAmount,
              tile: { x: target.x, y: target.y },
            };
            break;

          case BuildingType.FISHING_DOCK:
            worker.carrying = ResourceType.FISH;
            worker.carryAmount = carryAmount;
            break;

          case BuildingType.HERBALIST:
            worker.carrying = ResourceType.HERBS;
            worker.carryAmount = carryAmount;
            break;

          case BuildingType.FORESTER_LODGE:
            worker.carrying = ResourceType.LOG;
            worker.carryAmount = carryAmount;
            break;
        }

        // Transition to returning — pick nearest storage building to deposit at
        worker.gatherState = 'returning';
        worker.gatherTimer = 0;
        worker.gatherTargetTile = null;
        worker.depositTargetId = this.findNearestStorageBuilding(id);

        logger.debug('AI', `${citizen.name} (${id}) gathered ${worker.carryAmount} ${worker.carrying}, returning to building`);
      }
      return;
    }

    // -- RETURNING --
    if (worker.gatherState === 'returning') {
      citizen.activity = 'returning';
      movement.stuckTicks = 0;

      // Re-seek deposit target if it's missing or its storage is full
      if (worker.depositTargetId) {
        const depStorage = this.game.world.getComponent<any>(worker.depositTargetId, 'storage');
        if (depStorage) {
          const inv = depStorage.inventory as Record<string, number>;
          const used = Object.values(inv).reduce((a, b) => a + b, 0);
          if (used >= depStorage.capacity) {
            worker.depositTargetId = this.findNearestStorageBuilding(id);
          }
        } else {
          worker.depositTargetId = null;
        }
      }

      // Walk to deposit target (storage building) or fall back to work building
      const depositId: EntityId = (worker.depositTargetId != null) ? worker.depositTargetId : buildingId;

      if (this.nav.isNearBuilding(id, depositId)) {
        // At deposit location — deposit
        if (worker.carrying) {
          // Check storage full — wait if so
          if (this.game.isStorageFull()) {
            citizen.activity = 'idle';
            return;
          }

          this.game.addResourceRespectingLimit(worker.carrying, worker.carryAmount);
          logger.debug('AI', `${citizen.name} (${id}) deposited ${worker.carryAmount} ${worker.carrying}`);
          worker.carrying = null;
          worker.carryAmount = 0;
        }

        // Check for pending resource (hunter leather second trip)
        if (worker.pendingResource) {
          const pending = worker.pendingResource;
          worker.carrying = pending.type;
          worker.carryAmount = pending.amount;
          worker.pendingResource = null;
          // Pick a fresh deposit target for the leather trip
          worker.depositTargetId = this.findNearestStorageBuilding(id);
          // Path back to the kill site to pick up leather
          const pos = this.game.world.getComponent<any>(id, 'position')!;
          const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, pending.tile.x, pending.tile.y);
          if (result.found && result.path.length > 0) {
            movement.path = result.path;
            movement.targetEntity = buildingId;
          }
          // gatherState stays 'returning' — when they arrive at tile, they'll
          // walk back. We need a special sub-state: set gatherTargetTile for the pickup
          worker.gatherTargetTile = { x: pending.tile.x, y: pending.tile.y };
          worker.gatherState = 'seeking_pickup';
          return;
        }

        // Back to seeking
        worker.depositTargetId = null;
        worker.gatherState = 'seeking';
        worker.gatherTargetTile = null;
        return;
      }

      // Not at deposit location — path there
      if (!movement.path || movement.path.length === 0) {
        this.nav.goToBuilding(id, depositId);
      }
      return;
    }

    // -- SEEKING_PICKUP (hunter leather second trip) --
    if (worker.gatherState === 'seeking_pickup') {
      citizen.activity = BUILDING_ACTIVITY_LABELS[bld.type] || 'hunting game';
      movement.stuckTicks = 0;

      const target = worker.gatherTargetTile;
      if (!target) {
        // Lost target — just deposit what we have
        worker.gatherState = 'returning';
        return;
      }

      if (this.isAtTile(id, target.x, target.y)) {
        // Arrived at kill site — already loaded carrying from pending, now return
        worker.gatherState = 'returning';
        worker.gatherTargetTile = null;
        logger.debug('AI', `${citizen.name} (${id}) picked up ${worker.carryAmount} ${worker.carrying} from kill site`);
        return;
      }

      // Still walking to pickup site
      if (!movement.path || movement.path.length === 0) {
        const pos = this.game.world.getComponent<any>(id, 'position')!;
        const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, target.x, target.y);
        if (result.found && result.path.length > 0) {
          movement.path = result.path;
          movement.targetEntity = buildingId;
        } else {
          // Can't reach — drop the pickup, go back to seeking
          worker.carrying = null;
          worker.carryAmount = 0;
          worker.gatherState = 'seeking';
          worker.gatherTargetTile = null;
        }
      }
      return;
    }

    // Fallback — shouldn't reach here
    worker.gatherState = 'seeking';
  }

  // -- Private helpers --

  /** Get the seasonal rate for a gathering building type */
  private getSeasonalGatherRate(bldType: string): number {
    const seasonData = SEASON_DATA[this.game.state.subSeason];
    switch (bldType) {
      case BuildingType.GATHERING_HUT: return seasonData.gatheringRate;
      case BuildingType.HUNTING_CABIN: return seasonData.huntingRate;
      case BuildingType.FISHING_DOCK:  return seasonData.fishingRate;
      case BuildingType.HERBALIST:     return seasonData.herbRate;
      case BuildingType.FORESTER_LODGE: return 1.0;  // trees are year-round
      default: return 0;
    }
  }

  /** Get the resource type(s) a gathering building targets on tiles */
  private getGatherResourceTypes(bldType: string): Array<'berries' | 'mushrooms' | 'herbs' | 'fish' | 'wildlife'> {
    return BUILDING_RESOURCE_TARGETS[bldType] || [];
  }

  /** Find the closest tile with a target resource within work radius of a building */
  private findResourceTile(
    citizenId: EntityId, buildingId: EntityId, bld: any,
    resourceTypes: Array<'berries' | 'mushrooms' | 'herbs' | 'fish' | 'wildlife'>,
  ): { x: number; y: number; resource: string } | null {
    const bPos = this.game.world.getComponent<any>(buildingId, 'position');
    if (!bPos) return null;

    const radius = bld.workRadius || 15;
    const cx = bPos.tileX + Math.floor((bld.width || 1) / 2);
    const cy = bPos.tileY + Math.floor((bld.height || 1) / 2);
    const pos = this.game.world.getComponent<any>(citizenId, 'position')!;
    const r2 = radius * radius;
    const candidates: { x: number; y: number; dist: number; resource: string }[] = [];

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        const tile = this.game.tileMap.get(tx, ty);
        if (!tile) continue;

        // Check if this tile has any of the target resources
        let foundResource: string | null = null;
        for (const res of resourceTypes) {
          if (tile[res] > 0) { foundResource = res; break; }
        }
        if (!foundResource) continue;

        // Fish are on water tiles — find an adjacent walkable tile to stand on
        if (bld.type === BuildingType.FISHING_DOCK) {
          const adj = this.findAdjacentWalkable(tx, ty);
          if (adj) {
            const d = (adj.x - pos.tileX) ** 2 + (adj.y - pos.tileY) ** 2;
            candidates.push({ x: adj.x, y: adj.y, dist: d, resource: foundResource });
          }
        } else {
          if (!this.game.tileMap.isWalkable(tx, ty)) continue;
          const d = (tx - pos.tileX) ** 2 + (ty - pos.tileY) ** 2;
          candidates.push({ x: tx, y: ty, dist: d, resource: foundResource });
        }
      }
    }

    if (candidates.length === 0) return null;

    // Sort by distance (closest first) and try pathfinding to closest few
    candidates.sort((a, b) => a.dist - b.dist);
    const tryCount = Math.min(candidates.length, 5);
    for (let i = 0; i < tryCount; i++) {
      const target = candidates[i];
      const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, target.x, target.y);
      if (result.found && result.path.length > 0) {
        return { x: target.x, y: target.y, resource: target.resource };
      }
    }
    return null;
  }

  /** Find the closest forest tile with trees within work radius of a building */
  private findForestTile(
    citizenId: EntityId, buildingId: EntityId, bld: any,
  ): { x: number; y: number } | null {
    const bPos = this.game.world.getComponent<any>(buildingId, 'position');
    if (!bPos) return null;

    const radius = bld.workRadius || 15;
    const cx = bPos.tileX + Math.floor((bld.width || 1) / 2);
    const cy = bPos.tileY + Math.floor((bld.height || 1) / 2);
    const pos = this.game.world.getComponent<any>(citizenId, 'position')!;
    const r2 = radius * radius;
    const candidates: { x: number; y: number; dist: number }[] = [];

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        const tile = this.game.tileMap.get(tx, ty);
        if (!tile) continue;
        if (tile.type !== TileType.FOREST || tile.trees <= 0) continue;
        if (!this.game.tileMap.isWalkable(tx, ty)) continue;
        const d = (tx - pos.tileX) ** 2 + (ty - pos.tileY) ** 2;
        candidates.push({ x: tx, y: ty, dist: d });
      }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.dist - b.dist);
    const tryCount = Math.min(candidates.length, 5);
    for (let i = 0; i < tryCount; i++) {
      const target = candidates[i];
      const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, target.x, target.y);
      if (result.found && result.path.length > 0) {
        return { x: target.x, y: target.y };
      }
    }
    return null;
  }

  /** Check if citizen is at or adjacent to a specific tile */
  private isAtTile(citizenId: EntityId, tx: number, ty: number): boolean {
    const pos = this.game.world.getComponent<any>(citizenId, 'position');
    if (!pos) return false;
    const dx = Math.abs(pos.tileX - tx);
    const dy = Math.abs(pos.tileY - ty);
    return dx <= 1 && dy <= 1;
  }

  /** Check if any tile adjacent to (tx,ty) has the given resource > 0 */
  private hasAdjacentResource(tx: number, ty: number, resource: string): boolean {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tile = this.game.tileMap.get(tx + dx, ty + dy);
        if (tile && (tile as any)[resource] > 0) return true;
      }
    }
    return false;
  }

  /** Find an adjacent tile that has a specific resource > 0 */
  private findAdjacentResourceTile(tx: number, ty: number, resource: string): { x: number; y: number } | null {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tile = this.game.tileMap.get(tx + dx, ty + dy);
        if (tile && (tile as any)[resource] > 0) {
          return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return null;
  }

  /** Find an adjacent walkable tile to a non-walkable tile (for fishing from shore) */
  private findAdjacentWalkable(tx: number, ty: number): { x: number; y: number } | null {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        if (this.game.tileMap.isWalkable(tx + dx, ty + dy)) {
          return { x: tx + dx, y: ty + dy };
        }
      }
    }
    return null;
  }

  /** Hybrid surface+underground mine cycle for QUARRY and MINE buildings */
  handleMineCycle(
    id: EntityId, worker: any, citizen: any, movement: any,
    buildingId: EntityId, bld: any,
  ): void {
    const isQuarry = bld.type === BuildingType.QUARRY;

    if (!worker.gatherState) {
      worker.gatherState = worker.carrying ? 'returning' : 'seeking';
    }

    // -- SEEKING --
    if (worker.gatherState === 'seeking') {
      citizen.activity = isQuarry ? 'quarrying stone' : 'mining iron';
      movement.stuckTicks = 0;

      if (this.game.isStorageFull()) {
        citizen.activity = 'idle';
        if (!this.nav.isNearBuilding(id, buildingId)) this.nav.goToBuilding(id, buildingId);
        return;
      }

      // Handle existing gatherTargetTile (walking to surface tile)
      if (worker.gatherTargetTile) {
        const target = worker.gatherTargetTile;
        const tile = this.game.tileMap.get(target.x, target.y);
        const hasResource = isQuarry
          ? (tile?.type === TileType.STONE && (tile?.stoneAmount ?? 0) > 0)
          : (tile?.type === TileType.IRON && (tile?.ironAmount ?? 0) > 0);

        if (!hasResource) {
          worker.gatherTargetTile = null; // depleted while walking, re-seek
        } else if (this.isAtTile(id, target.x, target.y)) {
          worker.gatherState = 'gathering';
          worker.gatherTimer = 0;
          return;
        } else if (!movement.path || movement.path.length === 0) {
          const pos = this.game.world.getComponent<any>(id, 'position')!;
          const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, target.x, target.y);
          if (result.found && result.path.length > 0) {
            movement.path = result.path;
            movement.targetEntity = buildingId;
          } else {
            worker.gatherTargetTile = null;
          }
          return;
        } else {
          return; // still walking to surface tile
        }
      }

      // No target — scan for surface tiles
      const surfaceTile = this.findSurfaceTile(id, buildingId, bld);
      if (surfaceTile) {
        worker.gatherTargetTile = { x: surfaceTile.x, y: surfaceTile.y };
        const pos = this.game.world.getComponent<any>(id, 'position')!;
        const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, surfaceTile.x, surfaceTile.y);
        if (result.found && result.path.length > 0) {
          movement.path = result.path;
          movement.targetEntity = buildingId;
        }
        return;
      }

      // No surface tiles — check underground reserve
      const producer = this.game.world.getComponent<any>(buildingId, 'producer');
      const remaining = isQuarry ? (producer?.undergroundStone ?? 0) : (producer?.undergroundIron ?? 0);

      if (remaining <= MINE_VEIN_EXHAUSTED_THRESHOLD) {
        if (this.game.isMineOrQuarryDepleted(buildingId)) {
          this.game.releaseWorkersFromBuilding(buildingId);
        }
        citizen.activity = 'idle';
        if (!this.nav.isNearBuilding(id, buildingId)) this.nav.goToBuilding(id, buildingId);
        return;
      }

      // Head to building entrance, then enter underground
      if (this.nav.isNearBuilding(id, buildingId)) {
        this.nav.enterBuilding(id, buildingId);
        worker.gatherState = 'gathering';
        worker.gatherTargetTile = null; // null = underground mode
        worker.gatherTimer = 0;
      } else {
        this.nav.goToBuilding(id, buildingId);
      }
      return;
    }

    // -- GATHERING (surface mode: gatherTargetTile !== null) --
    if (worker.gatherState === 'gathering' && worker.gatherTargetTile !== null) {
      citizen.activity = isQuarry ? 'quarrying stone' : 'mining iron';
      movement.stuckTicks = 0;

      const target = worker.gatherTargetTile;
      const tile = this.game.tileMap.get(target.x, target.y);
      const hasResource = isQuarry
        ? (tile?.type === TileType.STONE && (tile?.stoneAmount ?? 0) > 0)
        : (tile?.type === TileType.IRON && (tile?.ironAmount ?? 0) > 0);

      if (!hasResource) {
        worker.gatherTargetTile = null;
        worker.gatherState = 'seeking';
        worker.gatherTimer = 0;
        return;
      }

      grantSkillXP(worker);
      worker.gatherTimer = (worker.gatherTimer || 0) + AI_TICK_INTERVAL;

      const skillLevel = getWorkerSkillLevel(worker);
      const skillBonus = skillLevel * SKILL_EFFICIENCY_PER_LEVEL;
      const milestoneBonus = this.game.achievementSystem.getBonus('gathering_speed');
      const effectiveTime = GATHER_TICKS_BASE / (1 + skillBonus + milestoneBonus);

      if (worker.gatherTimer >= effectiveTime) {
        const harvestAmount = isQuarry ? QUARRY_SURFACE_STONE_PER_HARVEST : MINE_SURFACE_IRON_PER_HARVEST;
        if (isQuarry) {
          this.game.tileMap.consumeStone(target.x, target.y, harvestAmount);
        } else {
          this.game.tileMap.consumeIron(target.x, target.y, harvestAmount);
        }
        const carryBonus = skillLevel * MINE_CARRY_BONUS_PER_SKILL;
        worker.carrying = isQuarry ? ResourceType.STONE : ResourceType.IRON;
        worker.carryAmount = Math.max(1, harvestAmount + carryBonus);
        worker.gatherState = 'returning';
        worker.gatherTargetTile = null;
        worker.gatherTimer = 0;
        worker.depositTargetId = this.findNearestStorageBuilding(id);
      }
      return;
    }

    // -- GATHERING (underground mode: gatherTargetTile === null) --
    if (worker.gatherState === 'gathering' && worker.gatherTargetTile === null) {
      citizen.activity = isQuarry ? 'quarrying stone' : 'mining iron';
      this.nav.enterBuilding(id, buildingId); // re-establish inside-building state each tick
      movement.stuckTicks = 0;

      const producer = this.game.world.getComponent<any>(buildingId, 'producer');
      if (!producer) { worker.gatherState = 'seeking'; return; }

      const remaining = isQuarry ? (producer.undergroundStone ?? 0) : (producer.undergroundIron ?? 0);
      if (remaining <= MINE_VEIN_EXHAUSTED_THRESHOLD) {
        if (this.game.isMineOrQuarryDepleted(buildingId)) {
          this.game.releaseWorkersFromBuilding(buildingId);
        }
        worker.gatherState = 'seeking';
        return;
      }

      grantSkillXP(worker);
      worker.gatherTimer = (worker.gatherTimer || 0) + AI_TICK_INTERVAL;

      const skillLevel = getWorkerSkillLevel(worker);
      const skillBonus = skillLevel * SKILL_EFFICIENCY_PER_LEVEL;
      const milestoneBonus = this.game.achievementSystem.getBonus('gathering_speed');
      const cycleTicks = isQuarry ? QUARRY_CYCLE_TICKS : MINE_CYCLE_TICKS;
      const effectiveTime = cycleTicks / (1 + skillBonus + milestoneBonus);

      if (worker.gatherTimer >= effectiveTime) {
        const maxUnderground = producer.maxUnderground ?? 1;
        const ratio = remaining / maxUnderground;
        let extractionRate: number;
        if (ratio > MINE_VEIN_DEPLETION_FAST) extractionRate = 1.0;
        else if (ratio > MINE_VEIN_DEPLETION_SLOW) extractionRate = 0.75;
        else extractionRate = 0.4;

        const baseAmount = isQuarry ? QUARRY_STONE_PER_CYCLE : MINE_IRON_PER_CYCLE;
        const carryBonus = skillLevel * MINE_CARRY_BONUS_PER_SKILL;
        const rawAmount = Math.ceil((baseAmount + carryBonus) * extractionRate);
        const actualAmount = Math.min(rawAmount, Math.max(0, remaining - MINE_VEIN_EXHAUSTED_THRESHOLD + 1));

        if (isQuarry) {
          producer.undergroundStone = Math.max(0, remaining - actualAmount);
        } else {
          producer.undergroundIron = Math.max(0, remaining - actualAmount);
        }
        this.game.updateMineVeinStateFromBuilding(buildingId);

        worker.carrying = isQuarry ? ResourceType.STONE : ResourceType.IRON;
        worker.carryAmount = Math.max(1, actualAmount);
        worker.gatherState = 'returning';
        worker.gatherTimer = 0;
        worker.depositTargetId = this.findNearestStorageBuilding(id);
      }
      return;
    }

    // -- RETURNING --
    if (worker.gatherState === 'returning') {
      citizen.activity = 'returning';
      movement.stuckTicks = 0;

      // Re-seek deposit target if full or missing
      if (worker.depositTargetId) {
        const depStorage = this.game.world.getComponent<any>(worker.depositTargetId, 'storage');
        if (depStorage) {
          const inv = depStorage.inventory as Record<string, number>;
          const used = Object.values(inv).reduce((a, b) => a + b, 0);
          if (used >= depStorage.capacity) {
            worker.depositTargetId = this.findNearestStorageBuilding(id);
          }
        } else {
          worker.depositTargetId = null;
        }
      }

      const depositId: EntityId = (worker.depositTargetId != null) ? worker.depositTargetId : buildingId;

      if (this.nav.isNearBuilding(id, depositId)) {
        if (worker.carrying) {
          if (this.game.isStorageFull()) { citizen.activity = 'idle'; return; }
          this.game.addResourceRespectingLimit(worker.carrying, worker.carryAmount);
          worker.carrying = null;
          worker.carryAmount = 0;
        }
        worker.depositTargetId = null;
        worker.gatherState = 'seeking';
        worker.gatherTargetTile = null;
        return;
      }

      if (!movement.path || movement.path.length === 0) {
        this.nav.goToBuilding(id, depositId);
      }
      return;
    }

    // Fallback
    worker.gatherState = 'seeking';
  }

  /** Find nearest completed storage building with available space */
  private findNearestStorageBuilding(citizenId: EntityId): EntityId | null {
    const pos = this.game.world.getComponent<any>(citizenId, 'position');
    if (!pos) return null;
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return null;
    let best: EntityId | null = null;
    let bestDist = Infinity;
    for (const [id, bld] of buildings) {
      if (!bld.completed || !bld.isStorage) continue;
      const storage = this.game.world.getComponent<any>(id, 'storage');
      if (!storage) continue;
      const inv = storage.inventory as Record<string, number>;
      const used = Object.values(inv).reduce((a, b) => a + b, 0);
      if (used >= storage.capacity) continue;
      const bPos = this.game.world.getComponent<any>(id, 'position');
      if (!bPos) continue;
      const d = (bPos.tileX - pos.tileX) ** 2 + (bPos.tileY - pos.tileY) ** 2;
      if (d < bestDist) { bestDist = d; best = id; }
    }
    return best;
  }

  /** Find the nearest walkable surface stone/iron tile within the building's work radius */
  private findSurfaceTile(
    citizenId: EntityId, buildingId: EntityId, bld: any,
  ): { x: number; y: number } | null {
    const bPos = this.game.world.getComponent<any>(buildingId, 'position');
    if (!bPos) return null;

    const isQuarry = bld.type === BuildingType.QUARRY;
    const radius = bld.workRadius || 20;
    const cx = bPos.tileX + Math.floor((bld.width || 1) / 2);
    const cy = bPos.tileY + Math.floor((bld.height || 1) / 2);
    const pos = this.game.world.getComponent<any>(citizenId, 'position')!;
    const r2 = radius * radius;
    const candidates: { x: number; y: number; dist: number }[] = [];

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        const tile = this.game.tileMap.get(tx, ty);
        if (!tile) continue;
        if (isQuarry) {
          if (tile.type !== TileType.STONE || (tile.stoneAmount ?? 0) <= 0) continue;
        } else {
          if (tile.type !== TileType.IRON || (tile.ironAmount ?? 0) <= 0) continue;
        }
        if (!this.game.tileMap.isWalkable(tx, ty)) continue;
        const d = (tx - pos.tileX) ** 2 + (ty - pos.tileY) ** 2;
        candidates.push({ x: tx, y: ty, dist: d });
      }
    }

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => a.dist - b.dist);
    const tryCount = Math.min(candidates.length, 5);
    for (let i = 0; i < tryCount; i++) {
      const target = candidates[i];
      const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, target.x, target.y);
      if (result.found && result.path.length > 0) {
        return { x: target.x, y: target.y };
      }
    }
    return null;
  }
}
