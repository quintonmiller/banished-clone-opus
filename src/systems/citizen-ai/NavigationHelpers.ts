import type { Game } from '../../Game';
import { EntityId, DoorDef } from '../../types';
import { getDoorEntryTile } from '../../utils/DoorUtils';
import { BUILDING_DEFS } from '../../data/BuildingDefs';
import {
  BuildingType, TILE_SIZE,
  WANDER_ATTEMPTS, WANDER_RANGE,
  FORCE_WANDER_ATTEMPTS, FORCE_WANDER_RANGE, FORCE_WANDER_MIN_DIST,
  ROAD_CONSTRUCTION_SITE_DISTANCE_PENALTY,
} from '../../constants';
import { distance } from '../../utils/MathUtils';

export class NavigationHelpers {
  private static readonly MAX_BUILDING_ENTRY_ATTEMPTS = 32;

  constructor(private game: Game) {}

  /** Try to path to a building. Returns true if a path was set. */
  goToBuilding(id: EntityId, targetId: EntityId): boolean {
    const pos = this.game.world.getComponent<any>(id, 'position')!;
    const targetPos = this.game.world.getComponent<any>(targetId, 'position');
    if (!targetPos) return false;

    const bld = this.game.world.getComponent<any>(targetId, 'building');
    const bw = bld?.width || 1;
    const bh = bld?.height || 1;

    const doorDef: DoorDef | undefined = bld?.doorDef;
    const doorEntry = doorDef ? getDoorEntryTile(targetPos.tileX, targetPos.tileY, doorDef) : null;
    const candidates = this.getBuildingEntryCandidates(
      pos.tileX,
      pos.tileY,
      targetPos.tileX,
      targetPos.tileY,
      bw,
      bh,
      doorEntry,
    );

    // Prefer door entry tile if available and walkable
    if (doorDef && doorEntry && this.game.tileMap.isWalkable(doorEntry.x, doorEntry.y)) {
      const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, doorEntry.x, doorEntry.y);
      if (result.found && result.path.length > 0) {
        const movement = this.game.world.getComponent<any>(id, 'movement')!;
        movement.path = result.path;
        movement.targetEntity = targetId;
        movement.stuckTicks = 0;
        return true;
      }
    }

    let attempts = 0;
    for (const target of candidates) {
      if (attempts >= NavigationHelpers.MAX_BUILDING_ENTRY_ATTEMPTS) break;
      const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, target.x, target.y);
      attempts++;
      if (result.found && result.path.length > 0) {
        const movement = this.game.world.getComponent<any>(id, 'movement')!;
        movement.path = result.path;
        movement.targetEntity = targetId;
        movement.stuckTicks = 0;
        return true;
      }
    }

    return false;
  }

  /** Build deduped, walkable perimeter-adjacent entry tiles ordered by proximity. */
  private getBuildingEntryCandidates(
    fromX: number,
    fromY: number,
    buildX: number,
    buildY: number,
    width: number,
    height: number,
    doorEntry: { x: number; y: number } | null,
  ): Array<{ x: number; y: number }> {
    const seen = new Set<string>();
    const candidates: Array<{ x: number; y: number }> = [];

    const pushCandidate = (x: number, y: number): void => {
      const key = `${x},${y}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (!this.game.tileMap.isWalkable(x, y)) return;
      candidates.push({ x, y });
    };

    // Top and bottom edges including outside corners.
    for (let x = buildX - 1; x <= buildX + width; x++) {
      pushCandidate(x, buildY - 1);
      pushCandidate(x, buildY + height);
    }

    // Left and right edges.
    for (let y = buildY; y <= buildY + height - 1; y++) {
      pushCandidate(buildX - 1, y);
      pushCandidate(buildX + width, y);
    }

    // Keep any door-adjacent tile near the front.
    candidates.sort((a, b) => {
      const aDoorBias = doorEntry && a.x === doorEntry.x && a.y === doorEntry.y ? -1 : 0;
      const bDoorBias = doorEntry && b.x === doorEntry.x && b.y === doorEntry.y ? -1 : 0;
      if (aDoorBias !== bDoorBias) return aDoorBias - bDoorBias;
      const da = Math.abs(a.x - fromX) + Math.abs(a.y - fromY);
      const db = Math.abs(b.x - fromX) + Math.abs(b.y - fromY);
      return da - db;
    });

    return candidates;
  }

  /** Check if a building type represents an indoor (movement-blocking) structure */
  isIndoorBuilding(type: string): boolean {
    const def = BUILDING_DEFS[type];
    return def ? def.blocksMovement !== false : true;
  }

  /**
   * Try to place a citizen inside a building. Returns true if accepted.
   * Enforces capacity limits with resident priority in houses.
   */
  enterBuilding(citizenId: EntityId, buildingId: EntityId): boolean {
    const citizen = this.game.world.getComponent<any>(citizenId, 'citizen');
    if (!citizen) return false;

    // Already inside this building
    if (citizen.insideBuildingId === buildingId) return true;

    // Determine capacity
    const bld = this.game.world.getComponent<any>(buildingId, 'building');
    const house = this.game.world.getComponent<any>(buildingId, 'house');
    let capacity: number;
    if (house) {
      capacity = house.maxResidents || 5;
    } else if (bld?.maxWorkers) {
      // Workplaces: workers + a few visitor slots
      capacity = bld.maxWorkers + 3;
    } else {
      // Fallback based on building area (1 per 2 tiles, minimum 4)
      capacity = Math.max(4, Math.floor(((bld?.width || 2) * (bld?.height || 2)) / 2));
    }

    // Check if citizen has a right to enter (resident or assigned worker)
    const family = this.game.world.getComponent<any>(citizenId, 'family');
    const isResident = family?.homeId === buildingId;
    const currentOccupants = this.getBuildingOccupantCount(buildingId);

    // Hard occupant cap for everyone.
    if (currentOccupants >= capacity) return false;

    // In houses, non-residents can only use truly free beds.
    if (house && !isResident) {
      const residentCount = house.residents?.length || 0;
      if (residentCount >= capacity) return false;
    }

    // Exit previous building if entering a different one
    if (citizen.insideBuildingId != null && citizen.insideBuildingId !== buildingId) {
      citizen.insideBuildingId = null;
    }

    citizen.insideBuildingId = buildingId;
    return true;
  }

  /** Remove a citizen from whatever building they are inside */
  exitBuilding(citizenId: EntityId): void {
    const citizen = this.game.world.getComponent<any>(citizenId, 'citizen');
    if (citizen) citizen.insideBuildingId = null;
  }

  /** Count citizens currently inside a building */
  getBuildingOccupantCount(buildingId: EntityId): number {
    const citizens = this.game.world.getComponentStore<any>('citizen');
    if (!citizens) return 0;
    let count = 0;
    for (const [, cit] of citizens) {
      if (cit.insideBuildingId === buildingId) count++;
    }
    return count;
  }

  /** Check if citizen is already near a building (within 2 tiles of any edge) */
  isNearBuilding(citizenId: EntityId, buildingId: EntityId): boolean {
    const pos = this.game.world.getComponent<any>(citizenId, 'position');
    const bPos = this.game.world.getComponent<any>(buildingId, 'position');
    if (!pos || !bPos) return false;

    const bld = this.game.world.getComponent<any>(buildingId, 'building');
    const bw = bld?.width || 1;
    const bh = bld?.height || 1;

    const dx = pos.tileX - bPos.tileX;
    const dy = pos.tileY - bPos.tileY;

    return dx >= -2 && dx <= bw + 1 && dy >= -2 && dy <= bh + 1;
  }

  findBuilding(type: string): EntityId | null {
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return null;

    for (const [id, bld] of buildings) {
      if (bld.type === type && bld.completed) return id;
    }
    return null;
  }

  /** Find nearest house with available occupant capacity */
  findAvailableHouse(citizenId: EntityId): EntityId | null {
    const pos = this.game.world.getComponent<any>(citizenId, 'position')!;
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return null;

    let nearest: EntityId | null = null;
    let nearestDist = Infinity;

    for (const [id, bld] of buildings) {
      if (bld.type !== BuildingType.WOODEN_HOUSE || !bld.completed) continue;
      const house = this.game.world.getComponent<any>(id, 'house');
      const maxOccupants = house?.maxResidents || bld.residents || 5;
      const residentCount = house?.residents?.length || 0;
      if (residentCount >= maxOccupants) continue;
      if (this.getBuildingOccupantCount(id) >= maxOccupants) continue;

      const bPos = this.game.world.getComponent<any>(id, 'position');
      if (!bPos) continue;
      const d = distance(pos.tileX, pos.tileY, bPos.tileX, bPos.tileY);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = id;
      }
    }
    return nearest;
  }

  findNearestStorage(citizenId: EntityId): EntityId | null {
    const pos = this.game.world.getComponent<any>(citizenId, 'position')!;
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return null;

    let nearest: EntityId | null = null;
    let nearestDist = Infinity;

    for (const [id, bld] of buildings) {
      if (!bld.completed) continue;
      if (bld.type !== BuildingType.STORAGE_BARN &&
          bld.type !== BuildingType.STOCKPILE &&
          bld.type !== BuildingType.MARKET) continue;

      const bPos = this.game.world.getComponent<any>(id, 'position')!;
      const d = distance(pos.tileX, pos.tileY, bPos.tileX, bPos.tileY);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = id;
      }
    }
    return nearest;
  }

  findNearestConstructionSite(citizenId: EntityId): EntityId | null {
    const pos = this.game.world.getComponent<any>(citizenId, 'position')!;
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return null;

    let nearest: EntityId | null = null;
    let bestScore = Infinity;
    let bestRawDist = Infinity;
    let bestIsRoadLike = false;

    for (const [id, bld] of buildings) {
      if (bld.completed || bld.constructionProgress >= 1) continue;

      const bPos = this.game.world.getComponent<any>(id, 'position');
      if (!bPos) continue;
      const d = distance(pos.tileX, pos.tileY, bPos.tileX, bPos.tileY);
      const isRoadLike = this.isRoadLikeConstructionType(bld.type);
      const score = isRoadLike ? d * ROAD_CONSTRUCTION_SITE_DISTANCE_PENALTY : d;

      const isBetterScore = score < bestScore;
      const isTieButPreferBuilding = score === bestScore && bestIsRoadLike && !isRoadLike;
      const isTieSameTypeButCloser = score === bestScore && isRoadLike === bestIsRoadLike && d < bestRawDist;

      if (isBetterScore || isTieButPreferBuilding || isTieSameTypeButCloser) {
        bestScore = score;
        bestRawDist = d;
        bestIsRoadLike = isRoadLike;
        nearest = id;
      }
    }
    return nearest;
  }

  private isRoadLikeConstructionType(type: string): boolean {
    return type === BuildingType.ROAD ||
      type === BuildingType.STONE_ROAD ||
      type === BuildingType.BRIDGE;
  }

  /**
   * If the citizen is on a non-walkable tile (e.g. walked into a building that was
   * placed while they were moving), snap them to the nearest walkable tile.
   * Returns true if a snap occurred so the caller can skip further AI this tick.
   */
  snapToWalkable(id: EntityId): boolean {
    const pos = this.game.world.getComponent<any>(id, 'position');
    if (!pos || this.game.tileMap.isWalkable(pos.tileX, pos.tileY)) return false;

    for (let r = 1; r <= 10; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = pos.tileX + dx;
          const ny = pos.tileY + dy;
          if (this.game.tileMap.isWalkable(nx, ny)) {
            pos.tileX = nx;
            pos.tileY = ny;
            pos.pixelX = nx * TILE_SIZE + TILE_SIZE / 2;
            pos.pixelY = ny * TILE_SIZE + TILE_SIZE / 2;
            const movement = this.game.world.getComponent<any>(id, 'movement');
            if (movement) {
              movement.path = [];
              movement.stuckTicks = 0;
            }
            return true;
          }
        }
      }
    }
    return false;
  }

  wander(id: EntityId): void {
    const pos = this.game.world.getComponent<any>(id, 'position')!;

    for (let attempt = 0; attempt < WANDER_ATTEMPTS; attempt++) {
      const ox = this.game.rng.int(-WANDER_RANGE, WANDER_RANGE);
      const oy = this.game.rng.int(-WANDER_RANGE, WANDER_RANGE);
      if (ox === 0 && oy === 0) continue;

      const tx = Math.max(1, Math.min(this.game.tileMap.width - 2, pos.tileX + ox));
      const ty = Math.max(1, Math.min(this.game.tileMap.height - 2, pos.tileY + oy));

      if (!this.game.tileMap.isWalkable(tx, ty)) continue;

      const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, tx, ty);
      if (result.found && result.path.length > 1) {
        const movement = this.game.world.getComponent<any>(id, 'movement')!;
        movement.path = result.path;
        movement.targetEntity = null;
        movement.stuckTicks = 0;
        return;
      }
    }
  }

  /** Force wander with larger radius */
  forceWander(id: EntityId): void {
    const pos = this.game.world.getComponent<any>(id, 'position')!;

    for (let attempt = 0; attempt < FORCE_WANDER_ATTEMPTS; attempt++) {
      const ox = this.game.rng.int(-FORCE_WANDER_RANGE, FORCE_WANDER_RANGE);
      const oy = this.game.rng.int(-FORCE_WANDER_RANGE, FORCE_WANDER_RANGE);
      if (Math.abs(ox) < FORCE_WANDER_MIN_DIST && Math.abs(oy) < FORCE_WANDER_MIN_DIST) continue;

      const tx = Math.max(1, Math.min(this.game.tileMap.width - 2, pos.tileX + ox));
      const ty = Math.max(1, Math.min(this.game.tileMap.height - 2, pos.tileY + oy));

      if (!this.game.tileMap.isWalkable(tx, ty)) continue;

      const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, tx, ty);
      if (result.found && result.path.length > 1) {
        const movement = this.game.world.getComponent<any>(id, 'movement')!;
        movement.path = result.path;
        movement.targetEntity = null;
        return;
      }
    }
  }
}
