import type { Game } from '../../Game';
import { EntityId } from '../../types';
import { logger } from '../../utils/Logger';
import {
  Profession, BuildingType, PersonalityTrait,
  MEAL_FOOD_THRESHOLD, STARVING_THRESHOLD, TIRED_THRESHOLD,
  FREEZING_WARMTH_THRESHOLD,
  COLD_RELEASE_WARMTH_THRESHOLD, COLD_CRITICAL_WARMTH_THRESHOLD,
  LONELINESS_THRESHOLD, LONELINESS_HAPPINESS_PENALTY,
  AI_TICK_INTERVAL, STUCK_THRESHOLD,
  PREGNANT_MEAL_THRESHOLD_BOOST,
  TRAIT_WANDER_HAPPINESS,
  TICKS_PER_DAY,
  BUILDING_LIMIT_RESOURCES,
  ENERGY_RECOVERY_PER_TICK,
  SCHOOL_EDUCATION_RATE,
  LEISURE_CAMPFIRE_HAPPINESS,
  TAVERN_HAPPINESS_PER_TICK,
  HEATED_BUILDING_TYPES, HEATED_BUILDING_WARMTH_THRESHOLD,
} from '../../constants';
import { NavigationHelpers } from './NavigationHelpers';
import { GatherHandler } from './GatherHandler';
import { NeedsHandler } from './NeedsHandler';
import { SocialHandler } from './SocialHandler';
import { LeisureHandler } from './LeisureHandler';
import { isOffDuty, isUrgent } from './WorkHoursHelper';
import {
  GATHER_BUILDING_TYPES, MINE_BUILDING_TYPES, BUILDING_ACTIVITY_LABELS,
  grantSkillXP, hasTrait, professionActivity,
} from './CitizenUtils';

export class CitizenAISystem {
  private game: Game;
  private tickCounter = 0;
  private lastResetDay = -1;
  private static readonly CONSTRUCTION_TASK_PREFIX = 'construct:';
  private static readonly DEMOLITION_CARRY_TASK = 'demolish_carry';

  // Handlers
  private nav: NavigationHelpers;
  private gather: GatherHandler;
  private needs: NeedsHandler;
  private social: SocialHandler;
  private leisure: LeisureHandler;

  constructor(game: Game) {
    this.game = game;
    this.nav = new NavigationHelpers(game);
    this.gather = new GatherHandler(game, this.nav);
    this.needs = new NeedsHandler(game, this.nav);
    this.social = new SocialHandler(game, this.nav);
    this.leisure = new LeisureHandler(game, this.nav, this.social);
  }

  update(): void {
    this.tickCounter++;
    // Only run AI decisions every N ticks for performance
    if (this.tickCounter % AI_TICK_INTERVAL !== 0) return;

    const world = this.game.world;
    this.releaseWorkersFromDepletedMines();

    // Daily reset of hadLeisureWithPartner flag
    const currentDay = Math.floor(this.game.state.tick / TICKS_PER_DAY);
    if (currentDay !== this.lastResetDay) {
      this.lastResetDay = currentDay;
      const citizenStore = world.getComponentStore<any>('citizen');
      if (citizenStore) {
        for (const [, cit] of citizenStore) {
          cit.hadLeisureWithPartner = false;
        }
      }
    }

    const entities = world.query('citizen', 'position', 'needs', 'movement');

    for (const id of entities) {
      const citizen = world.getComponent<any>(id, 'citizen')!;
      const needs = world.getComponent<any>(id, 'needs')!;
      const movement = world.getComponent<any>(id, 'movement')!;
      const worker = world.getComponent<any>(id, 'worker');
      const family = world.getComponent<any>(id, 'family');

      // Safety: if NPC ended up on a non-walkable tile (e.g. building placed mid-path),
      // snap them to the nearest walkable tile before any other AI runs.
      if (this.nav.snapToWalkable(id)) continue;

      // Initialize fields
      if (movement.stuckTicks === undefined) movement.stuckTicks = 0;
      if (citizen.isSleeping === undefined) citizen.isSleeping = false;
      if (needs.energy === undefined) needs.energy = 100;

      // Initialize social fields
      if (needs.lastSocialTick === undefined) needs.lastSocialTick = 0;
      if (citizen.chatTimer === undefined) citizen.chatTimer = 0;

      // --- Chatting: brief social pause ---
      if (citizen.chatTimer > 0) {
        citizen.chatTimer -= AI_TICK_INTERVAL;
        movement.stuckTicks = 0;
        needs.lastSocialTick = this.game.state.tick;
        if (citizen.chatTimer > 0) { citizen.activity = 'chatting'; continue; }
      }

      // --- Napping: brief energy recovery at home ---
      if ((citizen.napTimer ?? 0) > 0) {
        // Wake on emergency; otherwise rest
        if (needs.food < STARVING_THRESHOLD || needs.warmth < FREEZING_WARMTH_THRESHOLD) {
          citizen.napTimer = 0; // emergency wake — fall through to main AI
        } else {
          citizen.napTimer -= AI_TICK_INTERVAL;
          needs.energy = Math.min(100, needs.energy + ENERGY_RECOVERY_PER_TICK * AI_TICK_INTERVAL);
          movement.stuckTicks = 0;
          if (citizen.napTimer > 0) { citizen.activity = 'napping'; continue; }
        }
      }

      // --- Campfire storytelling: stay at fire until timer expires ---
      if ((citizen.campfireTimer ?? 0) > 0) {
        if (needs.food < STARVING_THRESHOLD || needs.warmth < FREEZING_WARMTH_THRESHOLD) {
          citizen.campfireTimer = 0;
          citizen.leisureCampfireSpot = undefined;
          citizen.campfireTimerSet = undefined;
        } else {
          citizen.campfireTimer -= AI_TICK_INTERVAL;
          needs.happiness = Math.min(100, needs.happiness + LEISURE_CAMPFIRE_HAPPINESS * AI_TICK_INTERVAL);
          movement.stuckTicks = 0;
          if (citizen.campfireTimer > 0) { citizen.activity = 'storytelling'; continue; }
          // Timer expired — clean up
          citizen.leisureCampfireSpot = undefined;
          citizen.campfireTimerSet = undefined;
        }
      }

      // --- Tavern visit: stay drinking until timer expires ---
      if ((citizen.tavernTimer ?? 0) > 0) {
        if (needs.food < STARVING_THRESHOLD || needs.warmth < FREEZING_WARMTH_THRESHOLD) {
          citizen.tavernTimer = 0;
        } else {
          citizen.tavernTimer -= AI_TICK_INTERVAL;
          needs.happiness = Math.min(100, needs.happiness + TAVERN_HAPPINESS_PER_TICK * AI_TICK_INTERVAL);
          needs.lastSocialTick = this.game.state.tick;
          movement.stuckTicks = 0;
          if (citizen.tavernTimer > 0) { citizen.activity = 'drinking'; continue; }
        }
      }

      // Loneliness: if no social contact for a long time, happiness drops
      if (this.game.state.tick - needs.lastSocialTick > LONELINESS_THRESHOLD) {
        needs.happiness = Math.max(0, needs.happiness + LONELINESS_HAPPINESS_PENALTY);
      }

      // --- Sleeping citizens: stay put, check wake conditions ---
      if (citizen.isSleeping) {
        movement.stuckTicks = 0;
        // Wake up when energy is full AND it's daytime
        if (needs.energy >= 100 && !this.game.state.isNight) {
          citizen.isSleeping = false;
          this.nav.exitBuilding(id);
        }
        // Also wake if starving — survival overrides sleep
        else if (needs.food < STARVING_THRESHOLD) {
          citizen.isSleeping = false;
          this.nav.exitBuilding(id);
        }
        else {
          continue; // Stay asleep, skip all other AI
        }
      }

      // Personal starvation always interrupts the current plan.
      if (needs.food < STARVING_THRESHOLD) {
        citizen.activity = 'starving';
        this.abortCurrentMovement(movement);
        this.nav.exitBuilding(id);
        logger.warn('AI', `${citizen.name} (${id}) STARVING — food=${needs.food.toFixed(1)}, seeking food urgently`);
        this.needs.seekFood(id);
        continue;
      }

      const workplace = worker?.workplaceId != null
        ? world.getComponent<any>(worker.workplaceId, 'building')
        : null;
      const urgentWorkNeed = !!worker && isUrgent(this.game, worker, workplace);
      const offDutyNow = !!worker && isOffDuty(worker.profession, this.game.state.dayProgress, urgentWorkNeed);

      // Freezing uses hysteresis: once sheltering starts, remain home until safely warmed.
      const isColdSheltering = this.updateColdShelterState(needs);
      const canLeaveShelterForUrgentWork =
        !!worker
        && isColdSheltering
        && urgentWorkNeed
        && !offDutyNow
        && needs.warmth >= COLD_CRITICAL_WARMTH_THRESHOLD;

      if (isColdSheltering && !canLeaveShelterForUrgentWork) {
        // If they were inside a non-home building, exit unless it's a warm heated building.
        if (citizen.insideBuildingId != null && citizen.insideBuildingId !== family?.homeId) {
          const shelterBld = this.game.world.getComponent<any>(citizen.insideBuildingId, 'building');
          const isWarmShelter = shelterBld && HEATED_BUILDING_TYPES.has(shelterBld.type)
            && (shelterBld.warmthLevel ?? 0) > HEATED_BUILDING_WARMTH_THRESHOLD;
          if (!isWarmShelter) this.nav.exitBuilding(id);
        }

        if (needs.warmth < FREEZING_WARMTH_THRESHOLD) {
          logger.info('AI', `${citizen.name} (${id}) freezing — warmth=${needs.warmth.toFixed(1)}, seeking warmth`);
        }

        // Only shelter-lock when a reachable warm place actually exists.
        // If none exists, allow normal work logic (especially construction) to proceed.
        if (this.needs.seekWarmth(id)) {
          citizen.activity = 'freezing';
          continue;
        }
      }

      // Skip if actively moving along a path (retain last activity)
      if (movement.path && movement.path.length > 0) {
        movement.stuckTicks = 0;
        continue;
      }

      // Default activity — overridden by decision branches below
      citizen.activity = 'idle';

      // Clear inside-building flag; decision branches re-set it when appropriate
      this.nav.exitBuilding(id);

      movement.stuckTicks++;

      // Stuck recovery: if stuck for too many AI cycles, force wander
      if (movement.stuckTicks > STUCK_THRESHOLD) {
        // Never unassign manually-assigned workers — they chose this job
        if (worker?.workplaceId !== null && worker?.workplaceId !== undefined && !worker.manuallyAssigned) {
          logger.warn('AI', `${citizen.name} (${id}) STUCK for ${movement.stuckTicks} ticks — unassigning from auto-assigned work`);
          this.gather.unassignWorker(id, worker);
        } else {
          logger.debug('AI', `${citizen.name} (${id}) STUCK for ${movement.stuckTicks} ticks — force wandering (keeping assignment)`);
        }
        this.nav.forceWander(id);
        movement.stuckTicks = 0;
        continue;
      }

      // Children have simpler AI
      if (citizen.isChild) {
        this.handleChildAI(id, citizen, needs, movement);
        continue;
      }

      if (!worker) continue;
      if (this.handleDemolitionCarryTask(id, worker, citizen, movement)) continue;
      this.clearConstructionTask(worker);

      // ---- Priority-based decision tree ----

      // 1. Exhausted during day -> go home and sleep
      if (needs.energy < TIRED_THRESHOLD) {
        logger.debug('AI', `${citizen.name} (${id}) exhausted — energy=${needs.energy.toFixed(1)}, going to sleep`);
        this.needs.goSleep(id, citizen);
        continue;
      }

      // 2. Night time -> go home and sleep
      if (this.game.state.isNight) {
        this.needs.goSleep(id, citizen);
        continue;
      }

      // 3. Hungry (meal time) -> eat a meal
      const mealThreshold = family?.isPregnant
        ? MEAL_FOOD_THRESHOLD + PREGNANT_MEAL_THRESHOLD_BOOST
        : MEAL_FOOD_THRESHOLD;
      if (needs.food < mealThreshold) {
        citizen.activity = 'eating';
        logger.debug('AI', `${citizen.name} (${id}) hungry — food=${needs.food.toFixed(1)} < ${mealThreshold}, eating meal`);
        this.needs.eatMeal(id);
        continue;
      }

      // 3b. Festival — go to Town Hall gathering instead of working
      if (this.game.festivalSystem.isFestivalActive()) {
        const fest = this.game.state.festival;
        if (fest) {
          citizen.activity = 'celebrating';
          if (this.nav.isNearBuilding(id, fest.townHallId)) {
            movement.stuckTicks = 0;
            continue;
          }
          if (this.nav.goToBuilding(id, fest.townHallId)) continue;
        }
      }

      // 3c. Off-duty check — if outside work hours and not urgently needed, do leisure.
      // Don't interrupt a gather worker who is mid-trip (actively harvesting or carrying items back).
      {
        const inMidCycle = worker.gatherState === 'gathering'
          || worker.gatherState === 'returning'
          || (worker.carryAmount ?? 0) > 0;
        if (offDutyNow && !inMidCycle && this.leisure.handleLeisure(id, citizen, needs, worker, family, movement)) continue;
      }

      // 4. If assigned to a workplace, go work
      let quotaMet = false;

      if (worker.workplaceId !== null) {
        const bld = this.game.world.getComponent<any>(worker.workplaceId, 'building');
        const isConstructionSite = bld && !bld.completed;
        const storageFull = this.game.isStorageFull();

        // Mine/Quarry buildings use hybrid surface+underground cycle
        if (bld && bld.completed && MINE_BUILDING_TYPES.has(bld.type)) {
          const limitMet = this.isGatherLimitMet(worker.workplaceId, bld);
          if (limitMet || storageFull) {
            this.pauseGatherWork(worker, !storageFull);
            quotaMet = true; // fall through to helper logic below
          } else {
            worker.helperWorkplaceId = undefined;
            this.gather.handleMineCycle(id, worker, citizen, movement, worker.workplaceId, bld);
            continue;
          }
        }

        // Gathering buildings use physical gather-carry-deposit cycle
        else if (bld && bld.completed && GATHER_BUILDING_TYPES.has(bld.type)) {
          const limitMet = this.isGatherLimitMet(worker.workplaceId, bld);
          if (limitMet || storageFull) {
            this.pauseGatherWork(worker, !storageFull);
            quotaMet = true; // fall through to helper logic below
          } else {
            // Limit not met: clear any stale helper assignment and gather normally
            worker.helperWorkplaceId = undefined;
            this.gather.handleGatherCycle(id, worker, citizen, movement, needs, worker.workplaceId, bld);
            continue;
          }
        } else {
          // If building is being upgraded, workers help with the upgrade
          const isUpgradingSite = bld?.completed && bld?.isUpgrading;
          citizen.activity = isConstructionSite ? 'building'
            : isUpgradingSite ? 'upgrading'
            : (BUILDING_ACTIVITY_LABELS[bld?.type] || professionActivity(worker.profession));
          if (isConstructionSite) {
            this.setConstructionTask(worker, worker.workplaceId);
          } else if (isUpgradingSite) {
            worker.task = `upgrade:${worker.workplaceId}`;
          }
          if (this.nav.isNearBuilding(id, worker.workplaceId)) {
            movement.stuckTicks = 0; // Working, not stuck
            // Grant skill XP while working
            grantSkillXP(worker);
            // Under construction or upgrading: just stay near the site
            if (!isConstructionSite && !isUpgradingSite) {
              if (bld && this.nav.isIndoorBuilding(bld.type)) {
                this.nav.enterBuilding(id, worker.workplaceId);
              }
            }
            continue;
          }
          // Try to path to workplace — if blocked, just wait and retry next tick
          // (don't unassign on temporary pathfinding failures)
          if (!this.nav.goToBuilding(id, worker.workplaceId)) {
            if (isConstructionSite) this.clearConstructionTask(worker);
            if (isUpgradingSite) worker.task = null;
            // Wander toward the building area instead of standing still
            this.nav.wander(id);
          }
          continue;
        }
      }

      // 4.5. Quota-met helper logic (gatherer whose stock target is reached)
      if (quotaMet) {
        // Priority 1: Help with construction
        const site = this.nav.findNearestConstructionSite(id);
        if (site !== null) {
          worker.helperWorkplaceId = undefined;
          citizen.activity = 'building';
          this.setConstructionTask(worker, site);
          if (this.nav.isNearBuilding(id, site)) {
            movement.stuckTicks = 0;
            grantSkillXP(worker);
            continue;
          }
          if (this.nav.goToBuilding(id, site)) continue;
          this.clearConstructionTask(worker);
        }

        // Priority 2: Volunteer at an understaffed non-gathering building
        if (!worker.helperWorkplaceId || !this.isBuildingUnderstaffed(worker.helperWorkplaceId)) {
          worker.helperWorkplaceId = this.findUnderstaffedBuilding(id, worker.workplaceId) ?? undefined;
        }
        if (worker.helperWorkplaceId !== undefined) {
          const helperBld = this.game.world.getComponent<any>(worker.helperWorkplaceId, 'building');
          citizen.activity = BUILDING_ACTIVITY_LABELS[helperBld?.type] || 'helping';
          if (this.nav.isNearBuilding(id, worker.helperWorkplaceId)) {
            movement.stuckTicks = 0;
            if (helperBld && this.nav.isIndoorBuilding(helperBld.type)) {
              this.nav.enterBuilding(id, worker.helperWorkplaceId);
            }
            grantSkillXP(worker);
            continue;
          }
          if (!this.nav.goToBuilding(id, worker.helperWorkplaceId)) this.nav.wander(id);
          continue;
        }
        // No site and no understaffed building — fall through to tavern/social/wander
      }

      // 5. Laborers look for construction sites and upgrade sites
      if (worker.profession === Profession.LABORER) {
        const site = this.nav.findNearestConstructionSite(id);
        if (site !== null) {
          citizen.activity = 'building';
          this.setConstructionTask(worker, site);
          if (this.nav.isNearBuilding(id, site)) {
            movement.stuckTicks = 0;
            grantSkillXP(worker);
            continue;
          }
          if (this.nav.goToBuilding(id, site)) continue;
          this.clearConstructionTask(worker);
        }
        // Also help with upgrade sites if no construction site found
        if (site === null) {
          const upgradeSite = this.findNearestUpgradeSite(id);
          if (upgradeSite !== null) {
            citizen.activity = 'upgrading';
            worker.task = `upgrade:${upgradeSite}`;
            if (this.nav.isNearBuilding(id, upgradeSite)) {
              movement.stuckTicks = 0;
              grantSkillXP(worker);
              continue;
            }
            if (this.nav.goToBuilding(id, upgradeSite)) continue;
            worker.task = null;
          }
        }
      }

      // 6. Social interaction — chat with nearby on-duty citizens
      if (this.social.trySocialize(id, citizen, needs)) continue;

      // 7. Wander randomly
      // Adventurous trait — gain happiness from wandering
      if (hasTrait(citizen, PersonalityTrait.ADVENTUROUS)) {
        const wanderHappy = TRAIT_WANDER_HAPPINESS[PersonalityTrait.ADVENTUROUS] || 0;
        needs.happiness = Math.min(100, needs.happiness + wanderHappy);
      }
      this.nav.wander(id);
    }
  }

  getInternalState(): { tickCounter: number } {
    return { tickCounter: this.tickCounter };
  }

  setInternalState(s: { tickCounter: number }): void {
    this.tickCounter = s.tickCounter;
  }

  private isGatherLimitMet(_buildingId: EntityId, bld: any): boolean {
    const resources = BUILDING_LIMIT_RESOURCES[bld.type as string];
    if (!resources || resources.length === 0) return false;

    // Backward compatibility: old saves stored gather limits by building type.
    const legacyLimit = this.game.state.resourceLimits[bld.type as string];
    if (legacyLimit !== undefined) {
      const total = resources.reduce((sum: number, r: string) => sum + this.game.getResource(r), 0);
      return total >= legacyLimit;
    }

    let hasAtLeastOneLimit = false;
    for (const resource of resources) {
      const limit = this.game.getResourceLimit(resource);
      if (limit === undefined) return false;
      hasAtLeastOneLimit = true;
      if (this.game.getResource(resource) < limit) return false;
    }
    return hasAtLeastOneLimit;
  }

  /** Reset gather/mine transient state when work is paused by limits/capacity. */
  private pauseGatherWork(worker: any, tryDepositCarry: boolean): void {
    if (tryDepositCarry && worker.carrying && worker.carryAmount > 0) {
      this.game.addResourceRespectingLimit(worker.carrying, worker.carryAmount);
    }

    worker.gatherState = undefined;
    worker.gatherTimer = 0;
    worker.gatherTargetTile = null;
    worker.pendingResource = null;
    worker.depositTargetId = null;
    worker.carrying = null;
    worker.carryAmount = 0;
  }

  private isBuildingUnderstaffed(buildingId: EntityId): boolean {
    const bld = this.game.world.getComponent<any>(buildingId, 'building');
    if (this.game.isMineOrQuarryDepleted(buildingId)) return false;
    return bld && bld.completed && bld.maxWorkers > 0
      && bld.assignedWorkers.length < bld.maxWorkers;
  }

  private findNearestUpgradeSite(citizenId: EntityId): EntityId | null {
    const pos = this.game.world.getComponent<any>(citizenId, 'position');
    if (!pos) return null;
    let nearest: EntityId | null = null;
    let bestDist = Infinity;
    const buildingStore = this.game.world.getComponentStore<any>('building');
    if (!buildingStore) return null;
    for (const [buildingId, bld] of buildingStore) {
      if (!bld.completed || !bld.isUpgrading) continue;
      const bldPos = this.game.world.getComponent<any>(buildingId, 'position');
      if (!bldPos) continue;
      const dist = Math.abs(bldPos.tileX - pos.tileX) + Math.abs(bldPos.tileY - pos.tileY);
      if (dist < bestDist) { bestDist = dist; nearest = buildingId; }
    }
    return nearest;
  }

  private findUnderstaffedBuilding(citizenId: EntityId, excludeId: EntityId | null): EntityId | null {
    const pos = this.game.world.getComponent<any>(citizenId, 'position');
    if (!pos) return null;
    let nearest: EntityId | null = null;
    let bestDist = Infinity;
    const buildingStore = this.game.world.getComponentStore<any>('building');
    if (!buildingStore) return null;
    for (const [buildingId, bld] of buildingStore) {
      if (buildingId === excludeId) continue;
      if (!bld.completed || bld.maxWorkers === 0) continue;
      if (this.game.isMineOrQuarryDepleted(buildingId)) continue;
      if (GATHER_BUILDING_TYPES.has(bld.type)) continue; // skip other gatherers
      if (bld.assignedWorkers.length >= bld.maxWorkers) continue;
      const bldPos = this.game.world.getComponent<any>(buildingId, 'position');
      if (!bldPos) continue;
      const dist = Math.abs(bldPos.tileX - pos.tileX) + Math.abs(bldPos.tileY - pos.tileY);
      if (dist < bestDist) { bestDist = dist; nearest = buildingId; }
    }
    return nearest;
  }

  private releaseWorkersFromDepletedMines(): void {
    const buildingStore = this.game.world.getComponentStore<any>('building');
    if (!buildingStore) return;

    for (const [buildingId, bld] of buildingStore) {
      if (!bld?.completed || !MINE_BUILDING_TYPES.has(bld.type)) continue;
      if (!this.game.isMineOrQuarryDepleted(buildingId)) continue;

      const released = this.game.releaseWorkersFromBuilding(buildingId);
      if (released > 0) {
        logger.info('AI', `Released ${released} worker(s) from depleted ${bld.type} (${buildingId})`);
      }
    }
  }

  private handleChildAI(id: EntityId, citizen: any, needs: any, movement: any): void {
    // Sleeping
    if (citizen.isSleeping) return; // Already handled above

    if (needs.food < STARVING_THRESHOLD) {
      this.needs.seekFood(id);
      return;
    }

    // Night or tired — go sleep
    if (this.game.state.isNight || needs.energy < TIRED_THRESHOLD) {
      this.needs.goSleep(id, citizen);
      return;
    }

    // Hungry — eat
    if (needs.food < MEAL_FOOD_THRESHOLD) {
      this.needs.eatMeal(id);
      return;
    }

    // Festival — children attend too
    if (this.game.festivalSystem.isFestivalActive()) {
      const fest = this.game.state.festival;
      if (fest) {
        citizen.activity = 'celebrating';
        if (this.nav.isNearBuilding(id, fest.townHallId)) {
          movement.stuckTicks = 0;
          return;
        }
        if (this.nav.goToBuilding(id, fest.townHallId)) return;
      }
    }

    // School (or Academy)
    if (!citizen.isEducated) {
      const school = this.nav.findBuilding(BuildingType.SCHOOL) ?? this.nav.findBuilding(BuildingType.ACADEMY);
      if (school !== null) {
        citizen.activity = 'school';
        if (this.nav.isNearBuilding(id, school)) {
          this.nav.enterBuilding(id, school);
          citizen.educationProgress = (citizen.educationProgress ?? 0) + SCHOOL_EDUCATION_RATE * AI_TICK_INTERVAL;
          movement.stuckTicks = 0;
          return;
        }
        if (this.nav.goToBuilding(id, school)) return;
      }
    }

    citizen.activity = 'idle';
    this.nav.wander(id);
  }

  private setConstructionTask(worker: any, siteId: EntityId): void {
    worker.task = `${CitizenAISystem.CONSTRUCTION_TASK_PREFIX}${siteId}`;
  }

  private clearConstructionTask(worker: any): void {
    if (typeof worker.task === 'string'
        && worker.task.startsWith(CitizenAISystem.CONSTRUCTION_TASK_PREFIX)) {
      worker.task = null;
    }
  }

  private updateColdShelterState(needs: any): boolean {
    if (needs.isColdSheltering === undefined) needs.isColdSheltering = false;

    if (needs.isColdSheltering) {
      if (needs.warmth >= COLD_RELEASE_WARMTH_THRESHOLD) {
        needs.isColdSheltering = false;
      }
    } else if (needs.warmth < FREEZING_WARMTH_THRESHOLD) {
      needs.isColdSheltering = true;
    }

    return !!needs.isColdSheltering;
  }

  private abortCurrentMovement(movement: any): void {
    if (movement.path && movement.path.length > 0) {
      movement.path = [];
    }
    movement.targetEntity = null;
    movement.moving = false;
    movement.stuckTicks = 0;
  }

  private handleDemolitionCarryTask(
    id: EntityId,
    worker: any,
    citizen: any,
    movement: any,
  ): boolean {
    if (worker.task !== CitizenAISystem.DEMOLITION_CARRY_TASK) return false;

    if ((!worker.carrying || worker.carryAmount <= 0) && Array.isArray(worker.demolitionCarryQueue) && worker.demolitionCarryQueue.length > 0) {
      const next = worker.demolitionCarryQueue.shift();
      if (next) {
        worker.carrying = next.type;
        worker.carryAmount = next.amount;
      }
    }

    if (!worker.carrying || worker.carryAmount <= 0) {
      worker.task = null;
      worker.depositTargetId = null;
      worker.demolitionCarryQueue = undefined;
      return false;
    }

    citizen.activity = 'returning';
    movement.stuckTicks = 0;

    let depositId: EntityId | null = worker.depositTargetId ?? null;
    if (depositId !== null && !this.game.world.entityExists(depositId)) {
      depositId = null;
    }
    if (depositId === null) {
      depositId = this.nav.findNearestStorage(id);
      worker.depositTargetId = depositId;
    }

    if (depositId !== null) {
      if (this.nav.isNearBuilding(id, depositId)) {
        this.game.addResource(worker.carrying, worker.carryAmount);
        worker.carrying = null;
        worker.carryAmount = 0;
        worker.depositTargetId = null;
        return true;
      }
      if (this.nav.goToBuilding(id, depositId)) return true;
    }

    // Fallback when no reachable storage exists
    this.game.addResource(worker.carrying, worker.carryAmount);
    worker.carrying = null;
    worker.carryAmount = 0;
    worker.depositTargetId = null;
    return true;
  }
}
