import type { Game } from '../Game';
import { EntityId } from '../types';
import {
  Profession, TILE_SIZE, BuildingType,
  MEAL_FOOD_THRESHOLD, MEAL_RESTORE, MEAL_COST,
  STARVING_THRESHOLD, TIRED_THRESHOLD, DIET_HISTORY_SIZE,
  SOCIAL_CHAT_RADIUS, SOCIAL_CHAT_CHANCE, SOCIAL_CHAT_DURATION,
  LONELINESS_THRESHOLD, LONELINESS_HAPPINESS_PENALTY,
  AI_TICK_INTERVAL, STUCK_THRESHOLD, FREEZING_WARMTH_THRESHOLD,
  EMERGENCY_SLEEP_ENERGY, CHAT_HAPPINESS_GAIN, HOME_WARMTH_GAIN,
  WANDER_ATTEMPTS, WANDER_RANGE, FORCE_WANDER_ATTEMPTS,
  FORCE_WANDER_RANGE, FORCE_WANDER_MIN_DIST,
  PREGNANT_MEAL_THRESHOLD_BOOST,
  COOKED_FOOD_TYPES, COOKED_MEAL_RESTORE, COOKED_MEAL_COST,
  COOKED_MEAL_WARMTH_BOOST, COOKED_MEAL_HAPPINESS_BOOST,
  COOKED_MEAL_ENERGY_BOOST, ResourceType,
  TRAIT_SOCIAL_CHANCE_MULT, TRAIT_HAPPINESS_GAIN_MULT,
  TRAIT_WANDER_HAPPINESS, PersonalityTrait,
  PROFESSION_SKILL_MAP, SKILL_XP_PER_WORK_TICK,
  SKILL_XP_PER_LEVEL, SKILL_MAX_LEVEL,
  TAVERN_HAPPINESS_PER_TICK, TAVERN_VISIT_CHANCE, TAVERN_EVENING_START,
} from '../constants';
import { distance } from '../utils/MathUtils';

export class CitizenAISystem {
  private game: Game;
  private tickCounter = 0;

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    this.tickCounter++;
    // Only run AI decisions every N ticks for performance
    if (this.tickCounter % AI_TICK_INTERVAL !== 0) return;

    const world = this.game.world;
    const entities = world.query('citizen', 'position', 'needs', 'movement');

    for (const id of entities) {
      const citizen = world.getComponent<any>(id, 'citizen')!;
      const needs = world.getComponent<any>(id, 'needs')!;
      const movement = world.getComponent<any>(id, 'movement')!;
      const worker = world.getComponent<any>(id, 'worker');

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
        }
        // Also wake if starving — survival overrides sleep
        else if (needs.food < STARVING_THRESHOLD) {
          citizen.isSleeping = false;
        }
        else {
          continue; // Stay asleep, skip all other AI
        }
      }

      // Skip if actively moving along a path (retain last activity)
      if (movement.path && movement.path.length > 0) {
        movement.stuckTicks = 0;
        continue;
      }

      // Default activity — overridden by decision branches below
      citizen.activity = 'idle';

      movement.stuckTicks++;

      // Stuck recovery: if stuck for too many AI cycles, force wander
      if (movement.stuckTicks > STUCK_THRESHOLD) {
        if (worker?.workplaceId !== null && worker?.workplaceId !== undefined) {
          this.unassignWorker(id, worker);
        }
        this.forceWander(id);
        movement.stuckTicks = 0;
        continue;
      }

      // Children have simpler AI
      if (citizen.isChild) {
        this.handleChildAI(id, citizen, needs, movement);
        continue;
      }

      if (!worker) continue;

      // ---- Priority-based decision tree ----

      // 1. Starving -> seek food urgently (overrides everything)
      if (needs.food < STARVING_THRESHOLD) {
        citizen.activity = 'starving';
        this.seekFood(id);
        continue;
      }

      // 2. Freezing -> seek warmth (go home)
      if (needs.warmth < FREEZING_WARMTH_THRESHOLD) {
        citizen.activity = 'freezing';
        this.seekWarmth(id);
        continue;
      }

      // 3. Exhausted during day -> go home and sleep
      if (needs.energy < TIRED_THRESHOLD) {
        this.goSleep(id, citizen);
        continue;
      }

      // 4. Night time -> go home and sleep
      if (this.game.state.isNight) {
        this.goSleep(id, citizen);
        continue;
      }

      // 5. Hungry (meal time) -> eat a meal
      const family = this.game.world.getComponent<any>(id, 'family');
      const mealThreshold = family?.isPregnant
        ? MEAL_FOOD_THRESHOLD + PREGNANT_MEAL_THRESHOLD_BOOST
        : MEAL_FOOD_THRESHOLD;
      if (needs.food < mealThreshold) {
        citizen.activity = 'eating';
        this.eatMeal(id);
        continue;
      }

      // 5b. Festival — go to Town Hall gathering instead of working
      if (this.game.festivalSystem.isFestivalActive()) {
        const fest = this.game.state.festival;
        if (fest) {
          citizen.activity = 'celebrating';
          if (this.isNearBuilding(id, fest.townHallId)) {
            movement.stuckTicks = 0;
            continue;
          }
          if (this.goToBuilding(id, fest.townHallId)) continue;
        }
      }

      // 6. If assigned to a workplace, go work
      if (worker.workplaceId !== null) {
        citizen.activity = this.professionActivity(worker.profession);
        if (this.isNearBuilding(id, worker.workplaceId)) {
          movement.stuckTicks = 0; // Working, not stuck
          // Grant skill XP while working
          this.grantSkillXP(worker);
          continue;
        }
        if (!this.goToBuilding(id, worker.workplaceId)) {
          this.unassignWorker(id, worker);
          citizen.activity = 'idle';
        }
        continue;
      }

      // 7. Laborers look for construction sites
      if (worker.profession === Profession.LABORER) {
        const site = this.findNearestConstructionSite(id);
        if (site !== null) {
          citizen.activity = 'building';
          if (this.isNearBuilding(id, site)) {
            movement.stuckTicks = 0;
            this.grantSkillXP(worker);
            continue;
          }
          if (this.goToBuilding(id, site)) continue;
        }
      }

      // 8. Evening tavern visit — after work, before bed
      if (this.game.state.dayProgress >= TAVERN_EVENING_START && !this.game.state.isNight) {
        if (this.tryVisitTavern(id, citizen, needs, movement)) continue;
      }

      // 9. Social interaction — chat with nearby citizens
      if (this.trySocialize(id, citizen, needs)) continue;

      // 10. Wander randomly
      // Adventurous trait — gain happiness from wandering
      if (this.hasTrait(citizen, PersonalityTrait.ADVENTUROUS)) {
        const wanderHappy = TRAIT_WANDER_HAPPINESS[PersonalityTrait.ADVENTUROUS] || 0;
        needs.happiness = Math.min(100, needs.happiness + wanderHappy);
      }
      this.wander(id);
    }
  }

  getInternalState(): { tickCounter: number } {
    return { tickCounter: this.tickCounter };
  }

  setInternalState(s: { tickCounter: number }): void {
    this.tickCounter = s.tickCounter;
  }

  private handleChildAI(id: EntityId, citizen: any, needs: any, movement: any): void {
    // Sleeping
    if (citizen.isSleeping) return; // Already handled above

    if (needs.food < STARVING_THRESHOLD) {
      this.seekFood(id);
      return;
    }

    // Night or tired — go sleep
    if (this.game.state.isNight || needs.energy < TIRED_THRESHOLD) {
      this.goSleep(id, citizen);
      return;
    }

    // Hungry — eat
    if (needs.food < MEAL_FOOD_THRESHOLD) {
      this.eatMeal(id);
      return;
    }

    // Festival — children attend too
    if (this.game.festivalSystem.isFestivalActive()) {
      const fest = this.game.state.festival;
      if (fest) {
        citizen.activity = 'celebrating';
        if (this.isNearBuilding(id, fest.townHallId)) {
          movement.stuckTicks = 0;
          return;
        }
        if (this.goToBuilding(id, fest.townHallId)) return;
      }
    }

    // School
    if (!citizen.isEducated) {
      const school = this.findBuilding(BuildingType.SCHOOL);
      if (school !== null) {
        citizen.activity = 'school';
        if (this.isNearBuilding(id, school)) {
          movement.stuckTicks = 0;
          return;
        }
        if (this.goToBuilding(id, school)) return;
      }
    }

    citizen.activity = 'idle';
    this.wander(id);
  }

  /** Check if a food type is cooked */
  private isCooked(type: string): boolean {
    return (COOKED_FOOD_TYPES as readonly string[]).includes(type);
  }

  /** Eat a discrete meal from global food supply, tracking diet variety */
  private eatMeal(id: EntityId): void {
    const totalFood = this.game.getTotalFood();
    if (totalFood >= COOKED_MEAL_COST) {
      const needs = this.game.world.getComponent<any>(id, 'needs')!;
      if (!needs.recentDiet) needs.recentDiet = [];

      // Try cooked food first (costs less, restores more)
      const cookedCost = COOKED_MEAL_COST;
      const result = this.game.removeFoodPreferVariety(cookedCost, needs.recentDiet);
      if (result.eaten > 0) {
        const cooked = this.isCooked(result.type);
        const restore = cooked ? COOKED_MEAL_RESTORE : MEAL_RESTORE;
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
    const storage = this.findNearestStorage(id);
    if (storage !== null) {
      if (!this.isNearBuilding(id, storage)) {
        this.goToBuilding(id, storage);
      }
    } else {
      this.wander(id);
    }
  }

  /** Urgent food seeking when starving */
  private seekFood(id: EntityId): void {
    const totalFood = this.game.getTotalFood();
    if (totalFood > 0) {
      const needs = this.game.world.getComponent<any>(id, 'needs')!;
      if (!needs.recentDiet) needs.recentDiet = [];

      const result = this.game.removeFoodPreferVariety(MEAL_COST, needs.recentDiet);
      if (result.eaten > 0) {
        const cooked = this.isCooked(result.type);
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

    const storage = this.findNearestStorage(id);
    if (storage !== null) {
      if (!this.isNearBuilding(id, storage)) {
        this.goToBuilding(id, storage);
      }
    } else {
      this.wander(id);
    }
  }

  private seekWarmth(id: EntityId): void {
    this.goHome(id);
  }

  /** Grant skill XP to a worker based on their current profession */
  private grantSkillXP(worker: any): void {
    const skillType = PROFESSION_SKILL_MAP[worker.profession];
    if (!skillType) return;

    if (!worker.skills) worker.skills = {};
    if (!worker.skills[skillType]) worker.skills[skillType] = { xp: 0, level: 0 };

    const skill = worker.skills[skillType];
    if (skill.level >= SKILL_MAX_LEVEL) return;

    skill.xp += SKILL_XP_PER_WORK_TICK * AI_TICK_INTERVAL;
    if (skill.xp >= SKILL_XP_PER_LEVEL) {
      skill.xp -= SKILL_XP_PER_LEVEL;
      skill.level = Math.min(SKILL_MAX_LEVEL, skill.level + 1);
    }
  }

  /** Get trait multiplier for a given trait map */
  private getTraitMult(citizen: any, traitMap: Partial<Record<PersonalityTrait, number>>): number {
    const traits: string[] = citizen.traits || [];
    let mult = 1;
    for (const t of traits) {
      const v = traitMap[t as PersonalityTrait];
      if (v !== undefined) mult *= v;
    }
    return mult;
  }

  /** Check if citizen has a specific trait */
  private hasTrait(citizen: any, trait: PersonalityTrait): boolean {
    return (citizen.traits || []).includes(trait);
  }

  /** Try to visit a completed tavern with a barkeep for evening relaxation */
  private tryVisitTavern(id: EntityId, citizen: any, needs: any, movement: any): boolean {
    if (Math.random() > TAVERN_VISIT_CHANCE) return false;

    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return false;

    for (const [bldId, bld] of buildings) {
      if (bld.type !== BuildingType.TAVERN || !bld.completed) continue;
      // Tavern needs a barkeep to be active
      const workerCount = bld.assignedWorkers?.length || 0;
      if (workerCount === 0) continue;

      if (this.isNearBuilding(id, bldId)) {
        // At tavern — gain happiness
        citizen.activity = 'drinking';
        needs.happiness = Math.min(100, needs.happiness + TAVERN_HAPPINESS_PER_TICK * AI_TICK_INTERVAL);
        needs.lastSocialTick = this.game.state.tick;
        movement.stuckTicks = 0;
        return true;
      }

      // Go to tavern
      citizen.activity = 'drinking';
      if (this.goToBuilding(id, bldId)) return true;
    }
    return false;
  }

  /** Try to chat with a nearby citizen */
  private trySocialize(id: EntityId, citizen: any, needs: any): boolean {
    // Trait affects social chance
    const socialMult = this.getTraitMult(citizen, TRAIT_SOCIAL_CHANCE_MULT);
    if (Math.random() > SOCIAL_CHAT_CHANCE * socialMult) return false;

    const pos = this.game.world.getComponent<any>(id, 'position')!;
    const citizens = this.game.world.getComponentStore<any>('citizen');
    const positions = this.game.world.getComponentStore<any>('position');
    if (!citizens || !positions) return false;

    for (const [otherId] of citizens) {
      if (otherId === id) continue;
      const otherPos = positions.get(otherId);
      if (!otherPos) continue;

      const dx = Math.abs(pos.tileX - otherPos.tileX);
      const dy = Math.abs(pos.tileY - otherPos.tileY);
      if (dx <= SOCIAL_CHAT_RADIUS && dy <= SOCIAL_CHAT_RADIUS) {
        // Start chatting
        citizen.chatTimer = SOCIAL_CHAT_DURATION;
        needs.lastSocialTick = this.game.state.tick;
        const happyMult = this.getTraitMult(citizen, TRAIT_HAPPINESS_GAIN_MULT);
        needs.happiness = Math.min(100, needs.happiness + CHAT_HAPPINESS_GAIN * happyMult);
        return true;
      }
    }
    return false;
  }

  /** Go home and start sleeping */
  private goSleep(id: EntityId, citizen: any): void {
    const family = this.game.world.getComponent<any>(id, 'family');
    if (family?.homeId != null) {
      if (this.isNearBuilding(id, family.homeId)) {
        // At home — fall asleep
        citizen.isSleeping = true;
        const needs = this.game.world.getComponent<any>(id, 'needs');
        if (needs) {
          needs.warmth = Math.min(100, needs.warmth + HOME_WARMTH_GAIN);
        }
        const movement = this.game.world.getComponent<any>(id, 'movement')!;
        movement.stuckTicks = 0;
        return;
      }
      if (this.goToBuilding(id, family.homeId)) return;
    }

    // No home — find any house to sleep near
    const house = this.findBuilding(BuildingType.WOODEN_HOUSE);
    if (house !== null) {
      if (this.isNearBuilding(id, house)) {
        // Sleep near a house even if not assigned
        citizen.isSleeping = true;
        return;
      }
      if (this.goToBuilding(id, house)) return;
    }

    // Truly homeless — sleep where you are if exhausted
    if (this.game.world.getComponent<any>(id, 'needs')!.energy < EMERGENCY_SLEEP_ENERGY) {
      citizen.isSleeping = true;
      return;
    }

    this.wander(id);
  }

  /** Go home (for warmth). Doesn't trigger sleep. */
  private goHome(id: EntityId): void {
    const family = this.game.world.getComponent<any>(id, 'family');
    if (family?.homeId != null) {
      if (this.isNearBuilding(id, family.homeId)) {
        const needs = this.game.world.getComponent<any>(id, 'needs');
        if (needs) {
          needs.warmth = Math.min(100, needs.warmth + HOME_WARMTH_GAIN);
        }
        const movement = this.game.world.getComponent<any>(id, 'movement')!;
        movement.stuckTicks = 0;
        return;
      }
      if (this.goToBuilding(id, family.homeId)) return;
    }

    const house = this.findBuilding(BuildingType.WOODEN_HOUSE);
    if (house !== null) {
      if (this.isNearBuilding(id, house)) return;
      if (this.goToBuilding(id, house)) return;
    }

    this.wander(id);
  }

  /** Try to path to a building. Returns true if a path was set. */
  private goToBuilding(id: EntityId, targetId: EntityId): boolean {
    const pos = this.game.world.getComponent<any>(id, 'position')!;
    const targetPos = this.game.world.getComponent<any>(targetId, 'position');
    if (!targetPos) return false;

    const bld = this.game.world.getComponent<any>(targetId, 'building');
    const bw = bld?.width || 1;
    const bh = bld?.height || 1;

    const candidates = [
      { x: targetPos.tileX + Math.floor(bw / 2), y: targetPos.tileY + bh },
      { x: targetPos.tileX + Math.floor(bw / 2), y: targetPos.tileY - 1 },
      { x: targetPos.tileX - 1, y: targetPos.tileY + Math.floor(bh / 2) },
      { x: targetPos.tileX + bw, y: targetPos.tileY + Math.floor(bh / 2) },
      { x: targetPos.tileX, y: targetPos.tileY + bh },
      { x: targetPos.tileX + bw - 1, y: targetPos.tileY + bh },
    ];

    for (const target of candidates) {
      if (!this.game.tileMap.isWalkable(target.x, target.y)) continue;

      const result = this.game.pathfinder.findPath(pos.tileX, pos.tileY, target.x, target.y);
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

  /** Check if citizen is already near a building (within 2 tiles of any edge) */
  private isNearBuilding(citizenId: EntityId, buildingId: EntityId): boolean {
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

  /** Unassign a worker from their workplace */
  private unassignWorker(id: EntityId, worker: any): void {
    if (worker.workplaceId === null) return;

    const bld = this.game.world.getComponent<any>(worker.workplaceId, 'building');
    if (bld?.assignedWorkers) {
      bld.assignedWorkers = bld.assignedWorkers.filter((w: number) => w !== id);
    }

    worker.workplaceId = null;
    worker.profession = Profession.LABORER;
    worker.manuallyAssigned = false;
  }

  private wander(id: EntityId): void {
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
  private forceWander(id: EntityId): void {
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

  private findNearestConstructionSite(citizenId: EntityId): EntityId | null {
    const pos = this.game.world.getComponent<any>(citizenId, 'position')!;
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return null;

    let nearest: EntityId | null = null;
    let nearestDist = Infinity;

    for (const [id, bld] of buildings) {
      if (bld.completed || bld.constructionProgress >= 1) continue;

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

  private findBuilding(type: string): EntityId | null {
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return null;

    for (const [id, bld] of buildings) {
      if (bld.type === type && bld.completed) return id;
    }
    return null;
  }

  private professionActivity(profession: string): string {
    switch (profession) {
      case Profession.FARMER: return 'farming';
      case Profession.GATHERER: return 'gathering';
      case Profession.HUNTER: return 'hunting';
      case Profession.FISHERMAN: return 'fishing';
      case Profession.FORESTER: return 'forestry';
      case Profession.WOOD_CUTTER: return 'woodcutting';
      case Profession.BLACKSMITH: return 'smithing';
      case Profession.TAILOR: return 'tailoring';
      case Profession.HERBALIST: return 'healing';
      case Profession.VENDOR: return 'vending';
      case Profession.TEACHER: return 'teaching';
      case Profession.TRADER: return 'trading';
      case Profession.BUILDER: return 'building';
      case Profession.BAKER: return 'baking';
      case Profession.BARKEEP: return 'serving';
      default: return 'working';
    }
  }

  private findNearestStorage(citizenId: EntityId): EntityId | null {
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
}
