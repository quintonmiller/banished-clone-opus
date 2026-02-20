import type { Game } from '../Game';
import {
  TICKS_PER_YEAR, CHILD_AGE, OLD_AGE, TILE_SIZE, Profession, CITIZEN_SPEED,
  BuildingType, MAP_WIDTH, MAP_HEIGHT,
  NOMAD_CHECK_INTERVAL, NOMAD_BASE_CHANCE, NOMAD_DISEASE_CHANCE,
  NOMAD_MIN_COUNT, NOMAD_MAX_COUNT, NOMAD_EDGE_MARGIN, NOMAD_SPAWN_SEARCH_RADIUS,
  NOMAD_SCATTER_RANGE, MARRIAGE_MIN_AGE, FERTILITY_MAX_AGE, MAX_CHILDREN_PER_COUPLE,
  OLD_AGE_DEATH_CHANCE_PER_YEAR, NEWBORN_NEEDS, ADULT_SPAWN_AGE_MIN,
  ADULT_SPAWN_AGE_MAX, FAMILY_CHECK_INTERVAL,
  PREGNANCY_DURATION_TICKS, CONCEPTION_CHANCE_PARTNER, CONCEPTION_CHANCE_NON_PARTNER,
  CHAPEL_WEDDING_HAPPINESS,
} from '../constants';

export class PopulationSystem {
  private game: Game;
  private tickCounter = 0;

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    this.tickCounter++;

    // Aging: every TICKS_PER_YEAR ticks, age everyone
    if (this.tickCounter % TICKS_PER_YEAR === 0) {
      this.ageCitizens();
    }

    // Family formation + conception: check periodically
    if (this.tickCounter % FAMILY_CHECK_INTERVAL === 0) {
      this.formFamilies();
      this.checkConception();
      this.assignHomes();
      this.autoAssignWorkers();
      this.educateChildren();
    }

    // Pregnancy progression runs every tick
    this.advancePregnancies();

    // Nomad arrivals
    if (this.tickCounter % NOMAD_CHECK_INTERVAL === 0 && this.tickCounter > TICKS_PER_YEAR) {
      this.checkNomadArrival();
    }
  }

  getInternalState(): { tickCounter: number } {
    return { tickCounter: this.tickCounter };
  }

  setInternalState(s: { tickCounter: number }): void {
    this.tickCounter = s.tickCounter;
  }

  private ageCitizens(): void {
    const world = this.game.world;
    const citizens = world.getComponentStore<any>('citizen');
    if (!citizens) return;

    for (const [id, cit] of citizens) {
      cit.age++;

      // Child → adult
      if (cit.age >= CHILD_AGE && cit.isChild) {
        cit.isChild = false;
        // Give them a worker component if they don't have one
        if (!world.hasComponent(id, 'worker')) {
          world.addComponent(id, 'worker', {
            profession: Profession.LABORER,
            workplaceId: null,
            carrying: null,
            carryAmount: 0,
            task: null,
            manuallyAssigned: false,
          });
        }
      }

      // Old age death chance
      if (cit.age > OLD_AGE) {
        const deathChance = (cit.age - OLD_AGE) * OLD_AGE_DEATH_CHANCE_PER_YEAR;
        if (this.game.rng.chance(deathChance)) {
          const needs = world.getComponent<any>(id, 'needs');
          if (needs) needs.health = 0; // Will be cleaned up by NeedsSystem
        }
      }
    }
  }

  private formFamilies(): void {
    const world = this.game.world;
    const citizens = world.query('citizen', 'family');

    const singles: { id: number; isMale: boolean }[] = [];

    for (const id of citizens) {
      const cit = world.getComponent<any>(id, 'citizen')!;
      const fam = world.getComponent<any>(id, 'family')!;

      if (!cit.isChild && cit.age >= MARRIAGE_MIN_AGE && fam.partnerId === null) {
        singles.push({ id, isMale: cit.isMale });
      }
    }

    const males = singles.filter(s => s.isMale);
    const females = singles.filter(s => !s.isMale);

    // Try to pair each male with a non-related female
    const pairedFemales = new Set<number>();
    for (const male of males) {
      for (const female of females) {
        if (pairedFemales.has(female.id)) continue;
        if (this.areRelated(male.id, female.id)) continue;

        const maleFam = world.getComponent<any>(male.id, 'family')!;
        const femaleFam = world.getComponent<any>(female.id, 'family')!;

        maleFam.partnerId = female.id;
        femaleFam.partnerId = male.id;
        pairedFemales.add(female.id);

        // Chapel wedding happiness boost
        if (this.hasBuildingType(BuildingType.CHAPEL)) {
          const maleNeeds = world.getComponent<any>(male.id, 'needs');
          const femaleNeeds = world.getComponent<any>(female.id, 'needs');
          if (maleNeeds) maleNeeds.happiness = Math.min(100, maleNeeds.happiness + CHAPEL_WEDDING_HAPPINESS);
          if (femaleNeeds) femaleNeeds.happiness = Math.min(100, femaleNeeds.happiness + CHAPEL_WEDDING_HAPPINESS);
          this.game.eventBus.emit('wedding', { maleId: male.id, femaleId: female.id });
        }
        break;
      }
    }
  }

  /** Check if two citizens are related (parent-child or siblings) */
  private areRelated(idA: number, idB: number): boolean {
    const world = this.game.world;
    const famA = world.getComponent<any>(idA, 'family');
    const famB = world.getComponent<any>(idB, 'family');
    if (!famA || !famB) return false;

    // Parent-child: A is parent of B
    if (famA.childrenIds.includes(idB)) return true;
    // Parent-child: B is parent of A
    if (famB.childrenIds.includes(idA)) return true;

    // Siblings: share a parent (either is listed as child of the same parent)
    const families = world.getComponentStore<any>('family');
    if (families) {
      for (const [, fam] of families) {
        if (fam.childrenIds.includes(idA) && fam.childrenIds.includes(idB)) {
          return true;
        }
      }
    }

    return false;
  }

  private checkConception(): void {
    const world = this.game.world;
    const citizens = world.query('citizen', 'family');

    for (const femaleId of citizens) {
      const cit = world.getComponent<any>(femaleId, 'citizen')!;
      const fam = world.getComponent<any>(femaleId, 'family')!;

      // Only non-pregnant adult females of fertile age
      if (cit.isMale || cit.isChild) continue;
      if (cit.age < MARRIAGE_MIN_AGE || cit.age > FERTILITY_MAX_AGE) continue;
      if (fam.isPregnant) continue;
      if (fam.childrenIds.length >= MAX_CHILDREN_PER_COUPLE) continue;
      if (fam.homeId === null) continue;

      // Female must be sleeping
      if (!cit.isSleeping) continue;

      // Find a male sleeping in the same building (valid age, not related)
      const maleId = this.findMaleSleepingInSameHome(femaleId, fam.homeId);
      if (maleId === null) continue;

      // Determine conception chance based on partnership
      const isPartner = fam.partnerId === maleId;
      const chance = isPartner ? CONCEPTION_CHANCE_PARTNER : CONCEPTION_CHANCE_NON_PARTNER;

      if (this.game.rng.chance(chance)) {
        fam.isPregnant = true;
        fam.pregnancyTicks = 0;
        fam.pregnancyPartnerId = maleId;
        this.game.eventBus.emit('citizen_pregnant', { id: femaleId, fatherId: maleId });
      }
    }
  }

  private findMaleSleepingInSameHome(femaleId: number, homeId: number): number | null {
    const world = this.game.world;
    const house = world.getComponent<any>(homeId, 'house');
    if (!house?.residents) return null;

    for (const residentId of house.residents) {
      if (residentId === femaleId) continue;
      const cit = world.getComponent<any>(residentId, 'citizen');
      if (!cit || !cit.isMale || cit.isChild) continue;
      if (!cit.isSleeping) continue;
      // Must be of valid age and not related
      if (cit.age < MARRIAGE_MIN_AGE || cit.age > FERTILITY_MAX_AGE) continue;
      if (this.areRelated(femaleId, residentId)) continue;
      return residentId;
    }
    return null;
  }

  private advancePregnancies(): void {
    const world = this.game.world;
    const families = world.getComponentStore<any>('family');
    if (!families) return;

    for (const [femaleId, fam] of families) {
      if (!fam.isPregnant) continue;

      fam.pregnancyTicks = (fam.pregnancyTicks || 0) + 1;

      if (fam.pregnancyTicks >= PREGNANCY_DURATION_TICKS) {
        this.giveBirth(femaleId, fam);
      }
    }
  }

  private giveBirth(femaleId: number, fam: any): void {
    const world = this.game.world;
    const pos = world.getComponent<any>(femaleId, 'position');
    if (!pos) return;

    const baby = this.spawnCitizen(pos.tileX, pos.tileY, true);
    fam.childrenIds.push(baby);

    // Add baby to house if there's room
    if (fam.homeId !== null) {
      const house = world.getComponent<any>(fam.homeId, 'house');
      if (house && house.residents.length < house.maxResidents) {
        house.residents.push(baby);
        const babyFam = world.getComponent<any>(baby, 'family');
        if (babyFam) babyFam.homeId = fam.homeId;
      }
    }

    // Reset pregnancy state
    fam.isPregnant = false;
    fam.pregnancyTicks = 0;
    fam.pregnancyPartnerId = null;

    this.game.state.totalBirths++;
    this.game.eventBus.emit('citizen_born', { id: baby, motherId: femaleId });
  }

  private spawnCitizen(tileX: number, tileY: number, isChild: boolean): number {
    const world = this.game.world;
    const id = world.createEntity();
    const isMale = this.game.rng.chance(0.5);

    world.addComponent(id, 'position', {
      tileX, tileY,
      pixelX: tileX * TILE_SIZE + TILE_SIZE / 2,
      pixelY: tileY * TILE_SIZE + TILE_SIZE / 2,
    });

    const maleNames = ['John', 'William', 'Thomas', 'Richard', 'Henry', 'Robert', 'Edward', 'George', 'James', 'Arthur'];
    const femaleNames = ['Mary', 'Elizabeth', 'Anne', 'Margaret', 'Catherine', 'Jane', 'Alice', 'Eleanor', 'Rose', 'Sarah'];

    world.addComponent(id, 'citizen', {
      name: isMale ? this.game.rng.pick(maleNames) : this.game.rng.pick(femaleNames),
      age: isChild ? 1 : this.game.rng.int(ADULT_SPAWN_AGE_MIN, ADULT_SPAWN_AGE_MAX),
      isMale,
      isChild,
      isEducated: false,
      isSleeping: false,
      traits: this.game.generateTraits(),
    });

    world.addComponent(id, 'movement', {
      path: [],
      speed: CITIZEN_SPEED,
      targetEntity: null,
      moving: false,
    });

    world.addComponent(id, 'needs', {
      food: NEWBORN_NEEDS,
      warmth: 100,
      health: 100,
      happiness: NEWBORN_NEEDS,
      energy: NEWBORN_NEEDS,
      recentDiet: [],
    });

    world.addComponent(id, 'family', {
      partnerId: null,
      childrenIds: [],
      homeId: null,
      isPregnant: false,
      pregnancyTicks: 0,
      pregnancyPartnerId: null,
    });

    world.addComponent(id, 'renderable', {
      sprite: null,
      layer: 10,
      animFrame: 0,
      visible: true,
    });

    if (!isChild) {
      world.addComponent(id, 'worker', {
        profession: Profession.LABORER,
        workplaceId: null,
        carrying: null,
        carryAmount: 0,
        task: null,
        manuallyAssigned: false,
      });
    }

    return id;
  }

  private assignHomes(): void {
    const world = this.game.world;
    const houses = world.getComponentStore<any>('house');
    const families = world.getComponentStore<any>('family');
    if (!houses || !families) return;

    // Find homeless citizens with partners
    for (const [id, fam] of families) {
      if (fam.homeId !== null) continue;
      const cit = world.getComponent<any>(id, 'citizen');
      if (!cit || cit.isChild) continue;

      // Find house with space
      for (const [houseId, house] of houses) {
        const bld = world.getComponent<any>(houseId, 'building');
        if (!bld?.completed) continue;
        if (house.residents.length >= house.maxResidents) continue;

        // Assign to this house
        fam.homeId = houseId;
        house.residents.push(id);

        // Also assign partner
        if (fam.partnerId !== null) {
          const partnerFam = world.getComponent<any>(fam.partnerId, 'family');
          if (partnerFam && partnerFam.homeId === null) {
            partnerFam.homeId = houseId;
            house.residents.push(fam.partnerId);
          }
        }
        break;
      }
    }
  }

  /** Auto-assign idle laborers to buildings that need workers */
  private autoAssignWorkers(): void {
    const world = this.game.world;
    const buildings = world.getComponentStore<any>('building');
    const workers = world.getComponentStore<any>('worker');
    if (!buildings || !workers) return;

    // Find buildings needing workers
    for (const [bldId, bld] of buildings) {
      if (!bld.completed || bld.maxWorkers === 0) continue;

      const currentWorkers = bld.assignedWorkers?.length || 0;
      if (currentWorkers >= bld.maxWorkers) continue;

      const bPos = world.getComponent<any>(bldId, 'position');
      if (!bPos) continue;

      // Find idle laborers, prefer nearest
      const candidates: Array<{ id: number; dist: number }> = [];
      for (const [wId, worker] of workers) {
        if (worker.workplaceId !== null) continue;
        if (worker.profession !== Profession.LABORER) continue;
        if (worker.manuallyAssigned) continue;

        const cit = world.getComponent<any>(wId, 'citizen');
        if (!cit || cit.isChild) continue;

        const wPos = world.getComponent<any>(wId, 'position');
        if (!wPos) continue;

        const d = Math.abs(wPos.tileX - bPos.tileX) + Math.abs(wPos.tileY - bPos.tileY);
        candidates.push({ id: wId, dist: d });
      }

      // Sort by distance, assign nearest first
      candidates.sort((a, b) => a.dist - b.dist);

      for (const candidate of candidates) {
        if ((bld.assignedWorkers?.length || 0) >= bld.maxWorkers) break;

        // Quick reachability check: verify pathfinding can find a route
        const wPos = world.getComponent<any>(candidate.id, 'position');
        const targetX = bPos.tileX + Math.floor((bld.width || 1) / 2);
        const targetY = bPos.tileY + (bld.height || 1);
        const pathResult = this.game.pathfinder.findPath(wPos.tileX, wPos.tileY, targetX, targetY);
        if (!pathResult.found) continue; // Skip unreachable buildings

        const worker = workers.get(candidate.id)!;
        worker.workplaceId = bldId;
        worker.profession = this.getProfessionForBuilding(bld.type);
        if (!bld.assignedWorkers) bld.assignedWorkers = [];
        bld.assignedWorkers.push(candidate.id);
      }
    }
  }

  private educateChildren(): void {
    const world = this.game.world;
    const buildings = world.getComponentStore<any>('building');
    if (!buildings) return;

    // Check if school exists and has a teacher
    let hasSchool = false;
    for (const [, bld] of buildings) {
      if (bld.type === BuildingType.SCHOOL && bld.completed) {
        const workerCount = bld.assignedWorkers?.length || 0;
        if (workerCount > 0) {
          hasSchool = true;
          break;
        }
      }
    }

    if (!hasSchool) return;

    // Educate children who are old enough
    const citizens = world.getComponentStore<any>('citizen');
    if (!citizens) return;

    for (const [, cit] of citizens) {
      if (cit.isChild && cit.age >= CHILD_AGE - 1 && !cit.isEducated) {
        cit.isEducated = true;
      }
    }
  }

  private checkNomadArrival(): void {
    // Only arrive if there's a trading post
    const hasPost = this.hasBuildingType(BuildingType.TRADING_POST);
    const chance = hasPost ? NOMAD_BASE_CHANCE * 2 : NOMAD_BASE_CHANCE;

    if (!this.game.rng.chance(chance)) return;

    // Spawn nomads near map edge
    const count = this.game.rng.int(NOMAD_MIN_COUNT, NOMAD_MAX_COUNT);
    const edge = this.game.rng.int(0, 3); // 0=top, 1=right, 2=bottom, 3=left
    let sx: number, sy: number;

    switch (edge) {
      case 0: sx = this.game.rng.int(NOMAD_EDGE_MARGIN, MAP_WIDTH - NOMAD_EDGE_MARGIN); sy = 5; break;
      case 1: sx = MAP_WIDTH - 5; sy = this.game.rng.int(NOMAD_EDGE_MARGIN, MAP_HEIGHT - NOMAD_EDGE_MARGIN); break;
      case 2: sx = this.game.rng.int(NOMAD_EDGE_MARGIN, MAP_WIDTH - NOMAD_EDGE_MARGIN); sy = MAP_HEIGHT - 5; break;
      default: sx = 5; sy = this.game.rng.int(NOMAD_EDGE_MARGIN, MAP_HEIGHT - NOMAD_EDGE_MARGIN); break;
    }

    // Find walkable tile near the edge point
    for (let r = 0; r < NOMAD_SPAWN_SEARCH_RADIUS; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (this.game.tileMap.isWalkable(sx + dx, sy + dy)) {
            sx = sx + dx;
            sy = sy + dy;
            r = 10; dy = r; dx = r; // break all loops
          }
        }
      }
    }

    const nomadIds: number[] = [];
    for (let i = 0; i < count; i++) {
      const ox = this.game.rng.int(-NOMAD_SCATTER_RANGE, NOMAD_SCATTER_RANGE);
      const oy = this.game.rng.int(-NOMAD_SCATTER_RANGE, NOMAD_SCATTER_RANGE);
      const nx = Math.max(1, Math.min(MAP_WIDTH - 2, sx + ox));
      const ny = Math.max(1, Math.min(MAP_HEIGHT - 2, sy + oy));
      const nomadId = this.spawnCitizen(nx, ny, false);
      nomadIds.push(nomadId);
    }

    // Small chance nomads bring disease
    if (this.game.rng.chance(NOMAD_DISEASE_CHANCE)) {
      const sickId = this.game.rng.pick(nomadIds);
      const needs = this.game.world.getComponent<any>(sickId, 'needs');
      if (needs) {
        needs.isSick = true;
        needs.diseaseTicks = 0;
      }
    }

    this.game.eventBus.emit('nomads_arrived', { count });
  }

  private hasBuildingType(type: string): boolean {
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return false;
    for (const [, bld] of buildings) {
      if (bld.type === type && bld.completed) return true;
    }
    return false;
  }

  getProfessionForBuilding(type: string): string {
    const map: Record<string, string> = {
      [BuildingType.CROP_FIELD]: Profession.FARMER,
      [BuildingType.GATHERING_HUT]: Profession.GATHERER,
      [BuildingType.HUNTING_CABIN]: Profession.HUNTER,
      [BuildingType.FISHING_DOCK]: Profession.FISHERMAN,
      [BuildingType.FORESTER_LODGE]: Profession.FORESTER,
      [BuildingType.WOOD_CUTTER]: Profession.WOOD_CUTTER,
      [BuildingType.BLACKSMITH]: Profession.BLACKSMITH,
      [BuildingType.TAILOR]: Profession.TAILOR,
      [BuildingType.HERBALIST]: Profession.HERBALIST,
      [BuildingType.MARKET]: Profession.VENDOR,
      [BuildingType.SCHOOL]: Profession.TEACHER,
      [BuildingType.TRADING_POST]: Profession.TRADER,
      [BuildingType.BAKERY]: Profession.BAKER,
      [BuildingType.TAVERN]: Profession.BARKEEP,
      [BuildingType.CHICKEN_COOP]: Profession.HERDER,
      [BuildingType.PASTURE]: Profession.HERDER,
      [BuildingType.DAIRY]: Profession.DAIRYMAID,
    };
    return map[type] || Profession.LABORER;
  }
}
