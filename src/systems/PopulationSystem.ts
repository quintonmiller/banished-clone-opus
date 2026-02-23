import type { Game } from '../Game';
import { logger } from '../utils/Logger';
import {
  TICKS_PER_YEAR, TICKS_PER_DAY, CHILD_AGE, OLD_AGE, TILE_SIZE, Profession, CITIZEN_SPEED,
  BuildingType, MAP_WIDTH, MAP_HEIGHT, TileType, MONTH, PersonalityTrait,
  NOMAD_DISEASE_CHANCE,
  NOMAD_SCATTER_RANGE, MARRIAGE_MIN_AGE, FERTILITY_MAX_AGE, MAX_CHILDREN_PER_COUPLE,
  OLD_AGE_DEATH_CHANCE_PER_YEAR, NEWBORN_NEEDS, ADULT_SPAWN_AGE_MIN,
  ADULT_SPAWN_AGE_MAX, FAMILY_CHECK_INTERVAL,
  INITIAL_RELATIONSHIP_SINGLE_SHARE, INITIAL_RELATIONSHIP_PARTNERED_SHARE, INITIAL_RELATIONSHIP_MARRIED_SHARE,
  PREGNANCY_DURATION_TICKS,
  CHAPEL_WEDDING_HAPPINESS,
  IMMIGRATION_ROAD_SETTLEMENT_RADIUS, IMMIGRATION_SPAWN_SEARCH_RADIUS,
  IMMIGRATION_FOOD_PER_PERSON_PER_MONTH, IMMIGRATION_FOOD_MONTHS_TARGET,
  IMMIGRATION_HOUSING_TARGET_FREE_SLOTS, IMMIGRATION_OPEN_JOBS_TARGET,
  IMMIGRATION_MIN_JOIN_CHANCE, IMMIGRATION_MAX_JOIN_CHANCE, IMMIGRATION_JOB_BUFFER,
  ROAD_TRAVEL_CHECK_INTERVAL, ROAD_TRAVEL_PROBABILITY,
  ROAD_TRAVEL_PASS_THROUGH_WEIGHT, ROAD_TRAVEL_WORK_SEEKER_WEIGHT, ROAD_TRAVEL_SETTLER_FAMILY_WEIGHT,
  ROAD_TRAVEL_PASS_THROUGH_MIN, ROAD_TRAVEL_PASS_THROUGH_MAX,
  ROAD_TRAVEL_WORK_SEEKER_MIN, ROAD_TRAVEL_WORK_SEEKER_MAX,
  ROAD_TRAVEL_SETTLER_FAMILY_MIN, ROAD_TRAVEL_SETTLER_FAMILY_MAX,
  ROAD_SETTLEMENT_MIN_TOTAL_FOOD, ROAD_SETTLEMENT_MIN_FOOD_MONTHS,
  ROAD_JOIN_BASE_PASS_THROUGH, ROAD_JOIN_BASE_WORK_SEEKER, ROAD_JOIN_BASE_SETTLER_FAMILY,
  ROAD_TRAVELER_MAX_ACTIVE, ROAD_TRAVELER_SPEED_MULT, ROAD_TRAVELER_MAX_LIFETIME,
  LEISURE_CONCEPTION_BOOST_MULT,
  EDUCATION_PROGRESS_NEEDED,
  PARTNERSHIP_MIN_REL_SCORE, PARTNERSHIP_BASE_CHANCE, PARTNERSHIP_AGE_BONUS_PER_YEAR,
  PARTNERSHIP_TRAIT_COMPAT_BONUS, PARTNERSHIP_EDUCATION_MATCH_BONUS, PARTNERSHIP_REL_SCORE_MULT,
  BREAKUP_CHECK_INTERVAL, BREAKUP_BASE_CHANCE_PARTNER, BREAKUP_BASE_CHANCE_MARRIED,
  BREAKUP_COMPAT_PENALTY, BREAKUP_TIME_REDUCTION_PER_MONTH, BREAKUP_MIN_CHANCE,
  BREAKUP_HAPPINESS_PENALTY, BREAKUP_REL_SCORE_DROP,
  MARRIAGE_MIN_PARTNERSHIP_TICKS, MARRIAGE_REQUIRES_CHAPEL,
  MARRIAGE_BASE_CHANCE, MARRIAGE_COMPAT_BONUS, MARRIAGE_REL_SCORE_BONUS,
  CONCEPTION_BASE_NON_PARTNER, CONCEPTION_BASE_PARTNER, CONCEPTION_BASE_MARRIED,
  CONCEPTION_COMPAT_MULT_MAX, CONCEPTION_DURATION_BONUS_PER_MONTH, CONCEPTION_DURATION_MAX_MONTHS,
} from '../constants';
import type { PartnerPreference } from '../components/Citizen';
import type { RelationshipStatus } from '../components/Family';
import { formatCitizenName } from '../utils/NameGenerator';

type ArrivalVia = 'road';
type RoadTravelType = 'pass_through' | 'work_seekers' | 'settler_family';
interface TilePoint { x: number; y: number }
type EdgeSide = 'top' | 'right' | 'bottom' | 'left';
interface EdgeRoadPoint extends TilePoint { side: EdgeSide }
interface HousingSnapshot { freeSlots: number; anchorTiles: TilePoint[] }

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

    // Family formation + marriage + conception: check periodically
    if (this.tickCounter % FAMILY_CHECK_INTERVAL === 0) {
      this.formFamilies();
      this.advancePartneredCouplesToMarriage();
      this.checkConception();
      this.assignHomes();
      this.autoAssignWorkers();
      this.educateChildren();
    }

    // Couple cohabitation: check daily
    if (this.tickCounter % TICKS_PER_DAY === 0) {
      this.consolidateCoupleHousing();
    }

    // Breakup / divorce checks (monthly)
    if (this.tickCounter % BREAKUP_CHECK_INTERVAL === 0) {
      this.checkBreakups();
    }

    // Pregnancy progression runs every tick
    this.advancePregnancies();

    // Despawn transient road travelers that finished their trip.
    this.updateRoadTravelers();

    // Road traffic + settlement arrivals
    if (this.tickCounter % ROAD_TRAVEL_CHECK_INTERVAL === 0) {
      this.checkRoadTravel();
    }
  }

  getInternalState(): { tickCounter: number } {
    return { tickCounter: this.tickCounter };
  }

  setInternalState(s: { tickCounter: number }): void {
    this.tickCounter = s.tickCounter;
  }

  initializeStartingRelationships(): void {
    const world = this.game.world;
    const citizens = world.query('citizen', 'family');
    const eligibleSingles: number[] = [];

    for (const id of citizens) {
      const citizen = world.getComponent<any>(id, 'citizen');
      const family = world.getComponent<any>(id, 'family');
      if (!citizen || !family) continue;
      if (citizen.isChild || citizen.age < MARRIAGE_MIN_AGE) continue;
      if (family.partnerId !== null) continue;
      family.relationshipStatus = 'single';
      eligibleSingles.push(id);
    }

    const shuffled = this.game.rng.shuffle([...eligibleSingles]);
    const available = new Set<number>(shuffled);

    for (const firstId of shuffled) {
      if (!available.has(firstId)) continue;

      const startingStatus = this.rollInitialRelationshipStatus();
      if (startingStatus === 'single') continue;

      let secondId: number | null = null;
      for (const candidateId of shuffled) {
        if (candidateId === firstId) continue;
        if (!available.has(candidateId)) continue;
        if (!this.canFormPartnership(firstId, candidateId)) continue;
        secondId = candidateId;
        break;
      }

      if (secondId === null) continue;
      this.linkPartners(firstId, secondId, startingStatus);
      if (startingStatus === 'married') {
        this.applyMarriageSurnameRules(firstId, secondId);
      }
      available.delete(firstId);
      available.delete(secondId);
    }
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

    const singles: number[] = [];

    for (const id of citizens) {
      const cit = world.getComponent<any>(id, 'citizen')!;
      const fam = world.getComponent<any>(id, 'family')!;

      if (!cit.isChild
        && cit.age >= MARRIAGE_MIN_AGE
        && fam.partnerId === null
        && fam.relationshipStatus === 'single') {
        singles.push(id);
      }
    }

    const paired = new Set<number>();

    for (const firstId of singles) {
      if (paired.has(firstId)) continue;
      const firstFam = world.getComponent<any>(firstId, 'family');
      const firstCit = world.getComponent<any>(firstId, 'citizen');
      if (!firstFam || !firstCit) continue;
      const rels = firstFam.relationships as Record<number, number> | undefined;
      if (!rels) continue;

      for (const otherIdStr of Object.keys(rels)) {
        const otherId = Number(otherIdStr);
        if (paired.has(otherId)) continue;
        const relScore = rels[otherId] ?? 0;
        if (relScore < PARTNERSHIP_MIN_REL_SCORE) continue;

        const otherFam = world.getComponent<any>(otherId, 'family');
        const otherCit = world.getComponent<any>(otherId, 'citizen');
        if (!otherFam || !otherCit) continue;
        if (otherFam.relationshipStatus !== 'single' || otherFam.partnerId !== null) continue;
        if (otherCit.isChild || otherCit.age < MARRIAGE_MIN_AGE) continue;
        if (!this.canFormPartnership(firstId, otherId)) continue;

        // Compute weighted partnership chance
        const ageDiff = Math.abs(firstCit.age - otherCit.age);
        const ageBonus = PARTNERSHIP_AGE_BONUS_PER_YEAR * Math.max(0, 10 - ageDiff);
        const traitBonus = this.countCompatibleTraitPairs(firstCit, otherCit) * PARTNERSHIP_TRAIT_COMPAT_BONUS;
        const eduBonus = (firstCit.isEducated === otherCit.isEducated) ? PARTNERSHIP_EDUCATION_MATCH_BONUS : 0;
        const chance = PARTNERSHIP_BASE_CHANCE + ageBonus + traitBonus + eduBonus + relScore * PARTNERSHIP_REL_SCORE_MULT;

        if (this.game.rng.chance(chance)) {
          this.linkPartners(firstId, otherId, 'partnered');
          this.game.eventBus.emit('partnership', { partnerAId: firstId, partnerBId: otherId });
          paired.add(firstId);
          paired.add(otherId);
          break; // stop after first successful pairing for this citizen
        }
      }
    }
  }

  private countCompatibleTraitPairs(citA: any, citB: any): number {
    const traitsA: string[] = citA.traits || [];
    const traitsB: string[] = citB.traits || [];
    let count = 0;
    for (const t of traitsA) {
      if (traitsB.includes(t)) count++;
    }
    return count;
  }

  private advancePartneredCouplesToMarriage(): void {
    const families = this.game.world.getComponentStore<any>('family');
    if (!families) return;

    const visited = new Set<number>();
    for (const [id, family] of families) {
      if (visited.has(id)) continue;
      if (family.relationshipStatus !== 'partnered') continue;

      const partnerId = family.partnerId as number | null;
      if (partnerId === null) {
        family.relationshipStatus = 'single';
        continue;
      }

      const partnerFamily = this.game.world.getComponent<any>(partnerId, 'family');
      if (!partnerFamily || partnerFamily.partnerId !== id) {
        family.partnerId = null;
        family.relationshipStatus = 'single';
        continue;
      }

      visited.add(id);
      visited.add(partnerId);

      if (partnerFamily.relationshipStatus !== 'partnered') continue;

      // Chapel check
      if (MARRIAGE_REQUIRES_CHAPEL && !this.hasBuildingType(BuildingType.CHAPEL)) continue;

      // Minimum partnership duration
      const tick = this.game.state.tick;
      if (family.partnershipStartTick != null && (tick - family.partnershipStartTick) < MARRIAGE_MIN_PARTNERSHIP_TICKS) continue;

      // Weighted marriage chance
      const compat = family.compatibility ?? 0.5;
      const relScore = family.relationships?.[partnerId] ?? 0;
      const marriageChance = MARRIAGE_BASE_CHANCE + MARRIAGE_COMPAT_BONUS * compat + MARRIAGE_REL_SCORE_BONUS * relScore;
      if (!this.game.rng.chance(marriageChance)) continue;

      this.marryCouple(id, partnerId);
    }
  }

  private checkBreakups(): void {
    const families = this.game.world.getComponentStore<any>('family');
    if (!families) return;

    const visited = new Set<number>();
    const tick = this.game.state.tick;

    for (const [id, family] of families) {
      if (visited.has(id)) continue;
      if (family.relationshipStatus !== 'partnered' && family.relationshipStatus !== 'married') continue;

      const partnerId = family.partnerId as number | null;
      if (partnerId === null) continue;

      const partnerFamily = this.game.world.getComponent<any>(partnerId, 'family');
      if (!partnerFamily || partnerFamily.partnerId !== id) continue;

      visited.add(id);
      visited.add(partnerId);

      const isMarried = family.relationshipStatus === 'married';
      const compat = family.compatibility ?? 0.5;
      const monthsTogether = (family.partnershipStartTick != null)
        ? (tick - family.partnershipStartTick) / MONTH
        : 0;

      let chance = isMarried ? BREAKUP_BASE_CHANCE_MARRIED : BREAKUP_BASE_CHANCE_PARTNER;
      if (compat < 0.5) {
        chance += BREAKUP_COMPAT_PENALTY * Math.ceil((0.5 - compat) / 0.1);
      }
      chance -= BREAKUP_TIME_REDUCTION_PER_MONTH * monthsTogether;
      chance = Math.max(BREAKUP_MIN_CHANCE, chance);

      if (!this.game.rng.chance(chance)) continue;

      // Break up
      family.relationshipStatus = 'single';
      family.partnerId = null;
      family.partnershipStartTick = undefined;
      family.compatibility = undefined;

      partnerFamily.relationshipStatus = 'single';
      partnerFamily.partnerId = null;
      partnerFamily.partnershipStartTick = undefined;
      partnerFamily.compatibility = undefined;

      // Happiness penalty
      const needsA = this.game.world.getComponent<any>(id, 'needs');
      const needsB = this.game.world.getComponent<any>(partnerId, 'needs');
      if (needsA) needsA.happiness = Math.max(0, needsA.happiness - BREAKUP_HAPPINESS_PENALTY);
      if (needsB) needsB.happiness = Math.max(0, needsB.happiness - BREAKUP_HAPPINESS_PENALTY);

      // Reduce relationship score
      if (family.relationships) {
        family.relationships[partnerId] = Math.max(0, (family.relationships[partnerId] ?? 0) - BREAKUP_REL_SCORE_DROP);
      }
      if (partnerFamily.relationships) {
        partnerFamily.relationships[id] = Math.max(0, (partnerFamily.relationships[id] ?? 0) - BREAKUP_REL_SCORE_DROP);
      }

      const eventType = isMarried ? 'divorce' : 'breakup';
      this.game.eventBus.emit(eventType, { partnerAId: id, partnerBId: partnerId });
    }
  }

  private rollInitialRelationshipStatus(): RelationshipStatus {
    const totalWeight = INITIAL_RELATIONSHIP_SINGLE_SHARE
      + INITIAL_RELATIONSHIP_PARTNERED_SHARE
      + INITIAL_RELATIONSHIP_MARRIED_SHARE;

    if (totalWeight <= 0) return 'single';

    const roll = this.game.rng.next() * totalWeight;
    if (roll < INITIAL_RELATIONSHIP_SINGLE_SHARE) return 'single';
    if (roll < INITIAL_RELATIONSHIP_SINGLE_SHARE + INITIAL_RELATIONSHIP_PARTNERED_SHARE) return 'partnered';
    return 'married';
  }

  linkPartners(idA: number, idB: number, status: 'partnered' | 'married'): void {
    const world = this.game.world;
    const familyA = world.getComponent<any>(idA, 'family');
    const familyB = world.getComponent<any>(idB, 'family');
    if (!familyA || !familyB) return;

    familyA.partnerId = idB;
    familyB.partnerId = idA;
    familyA.relationshipStatus = status;
    familyB.relationshipStatus = status;

    const tick = this.game.state.tick;
    familyA.partnershipStartTick = tick;
    familyB.partnershipStartTick = tick;

    const compat = this.computeCompatibility(idA, idB);
    familyA.compatibility = compat;
    familyB.compatibility = compat;
  }

  private computeCompatibility(idA: number, idB: number): number {
    const world = this.game.world;
    const citA = world.getComponent<any>(idA, 'citizen');
    const citB = world.getComponent<any>(idB, 'citizen');
    if (!citA || !citB) return 0.5;

    let compat = 0.5;

    // Age proximity: +0.1 for same age, -0.01 per year of difference
    const ageDiff = Math.abs(citA.age - citB.age);
    compat += 0.1 - ageDiff * 0.01;

    // Shared traits
    const traitsA: string[] = citA.traits || [];
    const traitsB: string[] = citB.traits || [];
    for (const t of traitsA) {
      if (traitsB.includes(t)) compat += 0.05;
    }

    // Opposing traits
    const opposingPairs: [string, string][] = [
      [PersonalityTrait.HARDWORKING, PersonalityTrait.LAZY],
      [PersonalityTrait.SHY, PersonalityTrait.ADVENTUROUS],
    ];
    for (const [a, b] of opposingPairs) {
      if ((traitsA.includes(a) && traitsB.includes(b)) || (traitsA.includes(b) && traitsB.includes(a))) {
        compat -= 0.1;
      }
    }

    // Complementary traits
    if ((traitsA.includes(PersonalityTrait.CHEERFUL) && traitsB.includes(PersonalityTrait.ADVENTUROUS))
      || (traitsA.includes(PersonalityTrait.ADVENTUROUS) && traitsB.includes(PersonalityTrait.CHEERFUL))) {
      compat += 0.05;
    }

    // Education match
    if (citA.isEducated === citB.isEducated) compat += 0.05;

    return Math.max(0, Math.min(1, compat));
  }

  private marryCouple(idA: number, idB: number): void {
    this.linkPartners(idA, idB, 'married');
    this.applyMarriageSurnameRules(idA, idB);

    if (this.hasBuildingType(BuildingType.CHAPEL)) {
      const firstNeeds = this.game.world.getComponent<any>(idA, 'needs');
      const secondNeeds = this.game.world.getComponent<any>(idB, 'needs');
      if (firstNeeds) firstNeeds.happiness = Math.min(100, firstNeeds.happiness + CHAPEL_WEDDING_HAPPINESS);
      if (secondNeeds) secondNeeds.happiness = Math.min(100, secondNeeds.happiness + CHAPEL_WEDDING_HAPPINESS);
    }

    this.assignNewlywedsHousing(idA, idB);
    this.game.eventBus.emit('wedding', { partnerAId: idA, partnerBId: idB });
  }

  private assignNewlywedsHousing(idA: number, idB: number): void {
    const world = this.game.world;
    const famA = world.getComponent<any>(idA, 'family');
    const famB = world.getComponent<any>(idB, 'family');
    if (!famA || !famB) return;

    // Already sharing a house
    if (famA.homeId !== null && famA.homeId === famB.homeId) return;

    const houses = world.getComponentStore<any>('house');
    if (!houses) return;

    // Try finding an empty house or a house with 2+ free slots
    for (const [houseId, house] of houses) {
      const bld = world.getComponent<any>(houseId, 'building');
      if (!bld?.completed) continue;
      const maxResidents = house.maxResidents || 5;
      const freeSlots = maxResidents - (house.residents?.length || 0);
      if (freeSlots < 2) continue;

      // Move both in
      this.moveToHouse(idA, famA, houseId, house);
      this.moveToHouse(idB, famB, houseId, house);
      return;
    }

    // If one has a house with a free slot, move the other in
    if (famA.homeId !== null) {
      const house = world.getComponent<any>(famA.homeId, 'house');
      if (house) {
        const maxResidents = house.maxResidents || 5;
        if ((house.residents?.length || 0) < maxResidents) {
          this.moveToHouse(idB, famB, famA.homeId, house);
          return;
        }
      }
    }
    if (famB.homeId !== null) {
      const house = world.getComponent<any>(famB.homeId, 'house');
      if (house) {
        const maxResidents = house.maxResidents || 5;
        if ((house.residents?.length || 0) < maxResidents) {
          this.moveToHouse(idA, famA, famB.homeId, house);
          return;
        }
      }
    }
    // Fallback: leave as-is, normal assignHomes() handles it
  }

  /** Periodically try to move couples into their own home or at least the same home. */
  private consolidateCoupleHousing(): void {
    const world = this.game.world;
    const families = world.getComponentStore<any>('family');
    const houses = world.getComponentStore<any>('house');
    if (!families || !houses) return;

    const visited = new Set<number>();

    for (const [id, fam] of families) {
      if (visited.has(id)) continue;
      if (fam.relationshipStatus !== 'partnered' && fam.relationshipStatus !== 'married') continue;
      const partnerId = fam.partnerId as number | null;
      if (partnerId === null) continue;

      const partnerFam = world.getComponent<any>(partnerId, 'family');
      if (!partnerFam || partnerFam.partnerId !== id) continue;

      visited.add(id);
      visited.add(partnerId);

      // Already sharing a home
      if (fam.homeId !== null && fam.homeId === partnerFam.homeId) continue;

      // Priority 1: move both into an empty home
      let moved = false;
      for (const [houseId, house] of houses) {
        const bld = world.getComponent<any>(houseId, 'building');
        if (!bld?.completed) continue;
        if (!Array.isArray(house.residents)) house.residents = [];
        if (house.residents.length !== 0) continue;
        const maxRes = house.maxResidents || 5;
        if (maxRes < 2) continue;

        this.moveToHouse(id, fam, houseId, house);
        this.moveToHouse(partnerId, partnerFam, houseId, house);
        moved = true;
        break;
      }
      if (moved) continue;

      // Priority 2: move one into the other's home if there's a free slot
      if (fam.homeId !== null) {
        const house = world.getComponent<any>(fam.homeId, 'house');
        if (house) {
          const maxRes = house.maxResidents || 5;
          if ((house.residents?.length || 0) < maxRes) {
            this.moveToHouse(partnerId, partnerFam, fam.homeId, house);
            continue;
          }
        }
      }
      if (partnerFam.homeId !== null) {
        const house = world.getComponent<any>(partnerFam.homeId, 'house');
        if (house) {
          const maxRes = house.maxResidents || 5;
          if ((house.residents?.length || 0) < maxRes) {
            this.moveToHouse(id, fam, partnerFam.homeId, house);
            continue;
          }
        }
      }
    }
  }

  private moveToHouse(citizenId: number, family: any, houseId: number, house: any): void {
    // Remove from old house
    if (family.homeId !== null && family.homeId !== houseId) {
      const oldHouse = this.game.world.getComponent<any>(family.homeId, 'house');
      if (oldHouse?.residents) {
        oldHouse.residents = oldHouse.residents.filter((r: number) => r !== citizenId);
      }
    }
    family.homeId = houseId;
    if (!house.residents) house.residents = [];
    if (!house.residents.includes(citizenId)) {
      house.residents.push(citizenId);
    }
  }

  private applyMarriageSurnameRules(idA: number, idB: number): void {
    const world = this.game.world;
    const citizenA = world.getComponent<any>(idA, 'citizen');
    const citizenB = world.getComponent<any>(idB, 'citizen');
    if (!citizenA || !citizenB) return;

    if (citizenA.isMale !== citizenB.isMale) {
      const femaleCitizen = citizenA.isMale ? citizenB : citizenA;
      const maleCitizen = citizenA.isMale ? citizenA : citizenB;
      femaleCitizen.lastName = maleCitizen.lastName;
    } else {
      const firstTakesSecond = this.game.rng.chance(0.5);
      if (firstTakesSecond) {
        citizenA.lastName = citizenB.lastName;
      } else {
        citizenB.lastName = citizenA.lastName;
      }
    }

    citizenA.name = formatCitizenName(citizenA.firstName, citizenA.lastName);
    citizenB.name = formatCitizenName(citizenB.firstName, citizenB.lastName);
  }

  canFormPartnership(idA: number, idB: number): boolean {
    const world = this.game.world;
    const citizenA = world.getComponent<any>(idA, 'citizen');
    const citizenB = world.getComponent<any>(idB, 'citizen');
    if (!citizenA || !citizenB) return false;
    if (this.areRelated(idA, idB)) return false;

    const prefA = this.getPartnerPreference(citizenA);
    const prefB = this.getPartnerPreference(citizenB);
    return this.preferenceAcceptsGender(citizenA.isMale, prefA, citizenB.isMale)
      && this.preferenceAcceptsGender(citizenB.isMale, prefB, citizenA.isMale);
  }

  private getPartnerPreference(citizen: any): PartnerPreference {
    if (citizen.partnerPreference === 'same') return 'same';
    if (citizen.partnerPreference === 'both') return 'both';
    return 'opposite';
  }

  private preferenceAcceptsGender(selfIsMale: boolean, preference: PartnerPreference, otherIsMale: boolean): boolean {
    if (preference === 'both') return true;
    if (preference === 'same') return selfIsMale === otherIsMale;
    return selfIsMale !== otherIsMale;
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
    const tick = this.game.state.tick;

    for (const femaleId of citizens) {
      const female = world.getComponent<any>(femaleId, 'citizen')!;
      const fam = world.getComponent<any>(femaleId, 'family')!;
      const femalePreference = this.getPartnerPreference(female);

      // Only non-pregnant adult females of fertile age
      if (female.isMale || female.isChild) continue;
      if (female.age < MARRIAGE_MIN_AGE || female.age > FERTILITY_MAX_AGE) continue;
      if (fam.isPregnant) continue;
      if (fam.childrenIds.length >= MAX_CHILDREN_PER_COUPLE) continue;
      if (fam.homeId === null) continue;
      // Only women with opposite/both preference can conceive with men
      if (!this.preferenceAcceptsGender(false, femalePreference, true)) continue;

      // Female must be sleeping
      if (!female.isSleeping) continue;

      const candidateMaleIds = this.findEligibleMaleConceptionCandidates(femaleId, fam.homeId);
      if (candidateMaleIds.length === 0) continue;

      // Crowded house penalty: more residents = less privacy
      const house = world.getComponent<any>(fam.homeId, 'house');
      const residentCount = house?.residents?.length || 1;
      const crowdedDiv = Math.max(1, residentCount - 1); // 2 residents = /1, 3 = /2, 4 = /3, etc.

      // Leisure boost: couples who spent leisure time together get a conception boost
      const femaleLeisure = female.hadLeisureWithPartner === true;

      let conceived = false;
      for (const maleId of candidateMaleIds) {
        if (conceived) break;

        const isPartner = fam.partnerId === maleId;
        const isMarried = isPartner && fam.relationshipStatus === 'married';

        let chance: number;
        if (isPartner) {
          const base = isMarried ? CONCEPTION_BASE_MARRIED : CONCEPTION_BASE_PARTNER;
          const compat = fam.compatibility ?? 0.5;
          const compatMult = 1 + compat * (CONCEPTION_COMPAT_MULT_MAX - 1);
          const monthsTogether = (fam.partnershipStartTick != null)
            ? (tick - fam.partnershipStartTick) / MONTH : 0;
          const durationBonus = CONCEPTION_DURATION_BONUS_PER_MONTH
            * Math.min(monthsTogether, CONCEPTION_DURATION_MAX_MONTHS);
          const maleCit = world.getComponent<any>(maleId, 'citizen');
          const leisureMult = (femaleLeisure && maleCit?.hadLeisureWithPartner === true)
            ? LEISURE_CONCEPTION_BOOST_MULT : 1.0;
          chance = (base * compatMult + durationBonus) * leisureMult;
        } else {
          chance = CONCEPTION_BASE_NON_PARTNER;
        }

        // Divide by crowdedness (couple alone = no penalty)
        chance /= crowdedDiv;

        if (this.game.rng.chance(chance)) {
          this.beginPregnancy(femaleId, fam, maleId);
          conceived = true;
        }
      }
    }
  }

  private findEligibleMaleConceptionCandidates(
    femaleId: number,
    homeId: number,
  ): number[] {
    const world = this.game.world;
    const house = world.getComponent<any>(homeId, 'house');
    if (!house?.residents) return [];

    const maleIds: number[] = [];

    for (const residentId of house.residents) {
      if (residentId === femaleId) continue;
      const male = world.getComponent<any>(residentId, 'citizen');
      if (!male || !male.isMale || male.isChild) continue;
      if (!male.isSleeping) continue;
      // Must be of valid age and not related
      if (male.age < MARRIAGE_MIN_AGE || male.age > FERTILITY_MAX_AGE) continue;
      if (this.areRelated(femaleId, residentId)) continue;
      const malePreference = this.getPartnerPreference(male);
      if (!this.preferenceAcceptsGender(true, malePreference, false)) continue;
      maleIds.push(residentId);
    }

    return maleIds;
  }

  private beginPregnancy(femaleId: number, family: any, maleId: number): void {
    family.isPregnant = true;
    family.pregnancyTicks = 0;
    family.pregnancyPartnerId = maleId;
    this.game.eventBus.emit('citizen_pregnant', { id: femaleId, fatherId: maleId });
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

    // Baby takes mother's last name
    const mother = world.getComponent<any>(femaleId, 'citizen');
    const babyCit = world.getComponent<any>(baby, 'citizen');
    if (mother && babyCit) {
      babyCit.lastName = mother.lastName;
      babyCit.name = formatCitizenName(babyCit.firstName, babyCit.lastName);
    }

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
    const generatedName = this.game.generateCitizenName(isMale);

    world.addComponent(id, 'position', {
      tileX, tileY,
      pixelX: tileX * TILE_SIZE + TILE_SIZE / 2,
      pixelY: tileY * TILE_SIZE + TILE_SIZE / 2,
    });

    world.addComponent(id, 'citizen', {
      firstName: generatedName.firstName,
      lastName: generatedName.lastName,
      name: generatedName.name,
      age: isChild ? 1 : this.game.rng.int(ADULT_SPAWN_AGE_MIN, ADULT_SPAWN_AGE_MAX),
      isMale,
      isChild,
      isEducated: false,
      isSleeping: false,
      traits: this.game.generateTraits(),
      partnerPreference: this.game.generatePartnerPreference(),
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
      relationshipStatus: 'single',
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

        if (!Array.isArray(house.residents)) house.residents = [];
        const maxResidents = house.maxResidents || bld.residents || 5;
        const partnerFam = fam.partnerId !== null
          ? world.getComponent<any>(fam.partnerId, 'family')
          : null;
        const needsPartnerSlot = !!(partnerFam && partnerFam.homeId === null);
        const requiredSlots = needsPartnerSlot ? 2 : 1;
        if (house.residents.length + requiredSlots > maxResidents) continue;

        // Assign to this house
        fam.homeId = houseId;
        house.residents.push(id);
        const citName = world.getComponent<any>(id, 'citizen')?.name;
        logger.info('POPULATION', `${citName} (${id}) assigned to house (${houseId}), residents=${house.residents.length}/${maxResidents}`);

        // Also assign partner
        if (needsPartnerSlot && fam.partnerId !== null && partnerFam) {
          partnerFam.homeId = houseId;
          house.residents.push(fam.partnerId);
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

    // Count construction sites — reserve laborers for building
    let constructionSites = 0;
    for (const [, bld] of buildings) {
      if (!bld.completed && bld.constructionProgress < 1) constructionSites++;
    }

    // Count idle laborers
    let idleLaborers = 0;
    for (const [, worker] of workers) {
      if (worker.workplaceId === null && worker.profession === Profession.LABORER && !worker.manuallyAssigned) {
        idleLaborers++;
      }
    }

    // Reserve at least 2 laborers per construction site (they'll go build via AI step 7)
    const reserveForConstruction = Math.min(idleLaborers, constructionSites * 2);
    let assignableLaborers = idleLaborers - reserveForConstruction;

    if (assignableLaborers <= 0) return;

    // Find buildings needing workers
    for (const [bldId, bld] of buildings) {
      if (!bld.completed || bld.maxWorkers === 0) continue;
      if (this.game.isMineOrQuarryDepleted(bldId)) continue;
      if (assignableLaborers <= 0) break;

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
        if (assignableLaborers <= 0) break;

        // Quick reachability check: verify pathfinding can find a route
        const wPos = world.getComponent<any>(candidate.id, 'position');
        const targetX = bPos.tileX + Math.floor((bld.width || 1) / 2);
        const targetY = bPos.tileY + (bld.height || 1);
        const pathResult = this.game.pathfinder.findPath(wPos.tileX, wPos.tileY, targetX, targetY);
        if (!pathResult.found) continue; // Skip unreachable buildings

        const worker = workers.get(candidate.id)!;
        const cit = world.getComponent<any>(candidate.id, 'citizen');
        worker.workplaceId = bldId;
        worker.profession = this.getProfessionForBuilding(bld.type);
        if (!bld.assignedWorkers) bld.assignedWorkers = [];
        bld.assignedWorkers.push(candidate.id);
        assignableLaborers--;
        logger.info('POPULATION', `Auto-assigned ${cit?.name} (${candidate.id}) to ${bld.type} as ${worker.profession}`);
      }
    }
  }

  private educateChildren(): void {
    const world = this.game.world;
    const buildings = world.getComponentStore<any>('building');
    if (!buildings) return;

    // Check if school (or academy) exists and has a teacher
    let hasSchool = false;
    for (const [, bld] of buildings) {
      if ((bld.type === BuildingType.SCHOOL || bld.type === BuildingType.ACADEMY) && bld.completed) {
        const workerCount = bld.assignedWorkers?.length || 0;
        if (workerCount > 0) {
          hasSchool = true;
          break;
        }
      }
    }

    if (!hasSchool) return;

    // Educate children who are old enough or who have accumulated enough education progress
    const citizens = world.getComponentStore<any>('citizen');
    if (!citizens) return;

    for (const [, cit] of citizens) {
      if (cit.isChild && !cit.isEducated) {
        const progressReady = (cit.educationProgress ?? 0) >= EDUCATION_PROGRESS_NEEDED;
        if (cit.age >= CHILD_AGE - 1 || progressReady) {
          cit.isEducated = true;
        }
      }
    }
  }

  private checkRoadTravel(): void {
    const edgeRoads = this.getEdgeRoadTilesWithSide();
    if (edgeRoads.length < 2) return;
    if (!this.game.rng.chance(ROAD_TRAVEL_PROBABILITY)) return;

    const travelType = this.pickRoadTravelType();
    const desiredPartySize = this.rollRoadTravelPartySize(travelType);

    // Spawn visible pass-through traffic on the corridor in either direction.
    const spawnedTravelers = this.spawnTravelersAlongRoad(travelType, desiredPartySize, edgeRoads);

    const housing = this.getHousingSnapshot();
    const roadEntry = this.findRoadArrivalEntry(housing.anchorTiles);
    const openJobs = this.countOpenJobs();

    if (spawnedTravelers > 0) {
      this.game.eventBus.emit('road_travelers_passed', {
        count: spawnedTravelers,
        travelType,
        connected: roadEntry !== null,
      });
    }

    if (!roadEntry) return; // travelers pass by, but cannot settle without a connected road.

    const capByJobs = Math.max(1, openJobs + IMMIGRATION_JOB_BUFFER);
    const count = Math.min(desiredPartySize, housing.freeSlots, capByJobs);
    if (count <= 0) return;

    if (!this.isTownEligibleForSettlement(count, housing.freeSlots)) return;

    const joinChance = this.computeRoadJoinChance(travelType, count, housing.freeSlots, openJobs);
    if (!this.game.rng.chance(joinChance)) return;

    const newcomerIds: number[] = [];
    for (let i = 0; i < count; i++) {
      const ox = this.game.rng.int(-NOMAD_SCATTER_RANGE, NOMAD_SCATTER_RANGE);
      const oy = this.game.rng.int(-NOMAD_SCATTER_RANGE, NOMAD_SCATTER_RANGE);
      const nx = roadEntry.x + ox;
      const ny = roadEntry.y + oy;
      const tile = this.findWalkableSpawnTile(nx, ny, IMMIGRATION_SPAWN_SEARCH_RADIUS, true);
      if (!tile) continue;

      // Settler families are more likely to include children.
      const childChance = travelType === 'settler_family' ? 0.45 : travelType === 'work_seekers' ? 0.12 : 0.04;
      const isChild = count >= 3 && i === count - 1 && this.game.rng.chance(childChance);
      const newcomerId = this.spawnCitizen(tile.x, tile.y, isChild);
      newcomerIds.push(newcomerId);
    }

    if (newcomerIds.length === 0) return;

    // Assign homes/jobs right away so arrivals don't linger homeless unnecessarily.
    this.assignHomes();
    this.autoAssignWorkers();

    logger.info('POPULATION', `Newcomers arrived: count=${newcomerIds.length}, via=road, type=${travelType}, join=${joinChance.toFixed(2)}`);

    // Small chance newcomers bring disease
    if (this.game.rng.chance(NOMAD_DISEASE_CHANCE)) {
      const sickId = this.game.rng.pick(newcomerIds);
      const needs = this.game.world.getComponent<any>(sickId, 'needs');
      if (needs) {
        needs.isSick = true;
        needs.diseaseTicks = 0;
      }
    }

    this.game.eventBus.emit('nomads_arrived', {
      count: newcomerIds.length,
      via: 'road' as ArrivalVia,
      joinChance,
      travelType,
    });
  }

  private pickRoadTravelType(): RoadTravelType {
    const total = ROAD_TRAVEL_PASS_THROUGH_WEIGHT + ROAD_TRAVEL_WORK_SEEKER_WEIGHT + ROAD_TRAVEL_SETTLER_FAMILY_WEIGHT;
    const r = this.game.rng.next() * total;
    if (r < ROAD_TRAVEL_PASS_THROUGH_WEIGHT) return 'pass_through';
    if (r < ROAD_TRAVEL_PASS_THROUGH_WEIGHT + ROAD_TRAVEL_WORK_SEEKER_WEIGHT) return 'work_seekers';
    return 'settler_family';
  }

  private rollRoadTravelPartySize(type: RoadTravelType): number {
    switch (type) {
      case 'pass_through':
        return this.game.rng.int(ROAD_TRAVEL_PASS_THROUGH_MIN, ROAD_TRAVEL_PASS_THROUGH_MAX);
      case 'work_seekers':
        return this.game.rng.int(ROAD_TRAVEL_WORK_SEEKER_MIN, ROAD_TRAVEL_WORK_SEEKER_MAX);
      case 'settler_family':
        return this.game.rng.int(ROAD_TRAVEL_SETTLER_FAMILY_MIN, ROAD_TRAVEL_SETTLER_FAMILY_MAX);
    }
  }

  private spawnTravelersAlongRoad(
    travelType: RoadTravelType,
    desiredPartySize: number,
    edgeRoads: EdgeRoadPoint[],
  ): number {
    const activeTravelers = this.game.world.getComponentStore<any>('traveler')?.size || 0;
    const available = Math.max(0, ROAD_TRAVELER_MAX_ACTIVE - activeTravelers);
    if (available <= 0) return 0;

    const route = this.pickTransitRoute(edgeRoads);
    if (!route) return 0;

    const spawnCount = Math.min(desiredPartySize, available);
    for (let i = 0; i < spawnCount; i++) {
      this.spawnRoadTraveler(route.path, route.end, travelType);
    }
    return spawnCount;
  }

  private pickTransitRoute(edgeRoads: EdgeRoadPoint[]): { path: TilePoint[]; end: TilePoint } | null {
    for (let attempt = 0; attempt < 16; attempt++) {
      const start = this.game.rng.pick(edgeRoads);
      const candidates = edgeRoads.filter(e => e.side !== start.side);
      if (candidates.length === 0) return null;
      const end = this.game.rng.pick(candidates);
      const path = this.findRoadOnlyPath(start, end);
      if (path && path.length >= 24) {
        return { path, end };
      }
    }
    return null;
  }

  private findRoadOnlyPath(start: TilePoint, end: TilePoint): TilePoint[] | null {
    const map = this.game.tileMap;
    const startKey = `${start.x},${start.y}`;
    const goalKey = `${end.x},${end.y}`;
    const queue: TilePoint[] = [{ x: start.x, y: start.y }];
    const visited = new Set<string>([startKey]);
    const prev = new Map<string, string>();
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      const curKey = `${cur.x},${cur.y}`;
      if (curKey === goalKey) {
        const path: TilePoint[] = [];
        let k = goalKey;
        while (k !== startKey) {
          const [xs, ys] = k.split(',');
          path.push({ x: parseInt(xs, 10), y: parseInt(ys, 10) });
          const p = prev.get(k);
          if (!p) return null;
          k = p;
        }
        path.push({ x: start.x, y: start.y });
        path.reverse();
        return path;
      }

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!map.inBounds(nx, ny)) continue;
        const tile = map.get(nx, ny);
        if (!tile || tile.type !== TileType.ROAD) continue;
        const nk = `${nx},${ny}`;
        if (visited.has(nk)) continue;
        visited.add(nk);
        prev.set(nk, curKey);
        queue.push({ x: nx, y: ny });
      }
    }

    return null;
  }

  private spawnRoadTraveler(path: TilePoint[], destination: TilePoint, travelType: RoadTravelType): void {
    if (path.length < 2) return;

    const start = path[0];
    const id = this.game.world.createEntity();
    this.game.world.addComponent(id, 'position', {
      tileX: start.x,
      tileY: start.y,
      pixelX: start.x * TILE_SIZE + TILE_SIZE / 2,
      pixelY: start.y * TILE_SIZE + TILE_SIZE / 2,
    });

    this.game.world.addComponent(id, 'movement', {
      path: path.slice(1),
      speed: CITIZEN_SPEED * ROAD_TRAVELER_SPEED_MULT,
      targetEntity: null,
      moving: true,
    });

    this.game.world.addComponent(id, 'renderable', {
      sprite: null,
      layer: 10,
      animFrame: 0,
      visible: true,
    });

    this.game.world.addComponent(id, 'traveler', {
      travelType,
      destinationX: destination.x,
      destinationY: destination.y,
      lifetimeTicks: 0,
      maxLifetime: ROAD_TRAVELER_MAX_LIFETIME,
    });
  }

  private updateRoadTravelers(): void {
    const travelers = this.game.world.getComponentStore<any>('traveler');
    if (!travelers || travelers.size === 0) return;

    const positions = this.game.world.getComponentStore<any>('position');
    const movements = this.game.world.getComponentStore<any>('movement');
    if (!positions || !movements) return;

    const toRemove: number[] = [];
    for (const [id, traveler] of travelers) {
      const pos = positions.get(id);
      const mov = movements.get(id);
      if (!pos || !mov) {
        toRemove.push(id);
        continue;
      }

      traveler.lifetimeTicks = (traveler.lifetimeTicks || 0) + 1;
      const reachedDest = pos.tileX === traveler.destinationX && pos.tileY === traveler.destinationY && (!mov.path || mov.path.length === 0);
      const expired = traveler.lifetimeTicks > (traveler.maxLifetime || ROAD_TRAVELER_MAX_LIFETIME);
      if (reachedDest || expired) {
        toRemove.push(id);
      }
    }

    for (const id of toRemove) {
      this.game.world.destroyEntity(id);
    }
  }

  private getHousingSnapshot(): HousingSnapshot {
    const houses = this.game.world.getComponentStore<any>('house');
    const world = this.game.world;
    if (!houses) return { freeSlots: 0, anchorTiles: this.getPopulationAnchors() };

    let freeSlots = 0;
    const anchorTiles: TilePoint[] = [];

    for (const [houseId, house] of houses) {
      const bld = world.getComponent<any>(houseId, 'building');
      if (!bld?.completed) continue;

      const maxResidents = house.maxResidents || 0;
      const occupied = house.residents?.length || 0;
      freeSlots += Math.max(0, maxResidents - occupied);

      const pos = world.getComponent<any>(houseId, 'position');
      if (pos) {
        anchorTiles.push({
          x: pos.tileX + Math.floor((bld.width || 1) / 2),
          y: pos.tileY + Math.floor((bld.height || 1) / 2),
        });
      }
    }

    if (anchorTiles.length === 0) {
      return { freeSlots, anchorTiles: this.getPopulationAnchors() };
    }

    return { freeSlots, anchorTiles };
  }

  private getPopulationAnchors(): TilePoint[] {
    const positions = this.game.world.getComponentStore<any>('position');
    const citizens = this.game.world.getComponentStore<any>('citizen');
    if (!positions || !citizens || citizens.size === 0) return [];

    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const [id] of citizens) {
      const pos = positions.get(id);
      if (!pos) continue;
      sx += pos.tileX;
      sy += pos.tileY;
      n++;
    }

    if (n === 0) return [];
    return [{ x: Math.round(sx / n), y: Math.round(sy / n) }];
  }

  private countOpenJobs(): number {
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return 0;

    let openJobs = 0;
    for (const [bldId, bld] of buildings) {
      if (!bld?.completed || (bld.maxWorkers || 0) <= 0) continue;
      if (this.game.isMineOrQuarryDepleted(bldId)) continue;
      const assigned = bld.assignedWorkers?.length || 0;
      openJobs += Math.max(0, (bld.maxWorkers || 0) - assigned);
    }
    return openJobs;
  }

  private isTownEligibleForSettlement(incomingCount: number, freeSlots: number): boolean {
    if (freeSlots <= 0) return false;
    const totalFood = this.game.getTotalFood();
    if (totalFood < ROAD_SETTLEMENT_MIN_TOTAL_FOOD) return false;

    const projectedPop = Math.max(1, this.game.state.population + incomingCount);
    const foodMonths = totalFood / (projectedPop * IMMIGRATION_FOOD_PER_PERSON_PER_MONTH);
    if (foodMonths < ROAD_SETTLEMENT_MIN_FOOD_MONTHS) return false;

    return true;
  }

  private computeRoadJoinChance(travelType: RoadTravelType, incomingCount: number, freeSlots: number, openJobs: number): number {
    let base = ROAD_JOIN_BASE_PASS_THROUGH;
    if (travelType === 'work_seekers') base = ROAD_JOIN_BASE_WORK_SEEKER;
    if (travelType === 'settler_family') base = ROAD_JOIN_BASE_SETTLER_FAMILY;

    let chance = this.computeSettlementJoinChance(incomingCount, freeSlots, openJobs) * base;

    if (travelType === 'work_seekers' && openJobs <= 0) chance *= 0.5;
    if (travelType === 'settler_family' && freeSlots < 2) chance *= 0.7;

    return Math.max(0, Math.min(0.95, chance));
  }

  private computeSettlementJoinChance(incomingCount: number, freeSlots: number, openJobs: number): number {
    const needsStore = this.game.world.getComponentStore<any>('needs');
    let avgHealth = 50;
    let avgHappiness = 50;

    if (needsStore && needsStore.size > 0) {
      let healthSum = 0;
      let happySum = 0;
      let n = 0;
      for (const [, needs] of needsStore) {
        healthSum += needs.health ?? 50;
        happySum += needs.happiness ?? 50;
        n++;
      }
      if (n > 0) {
        avgHealth = healthSum / n;
        avgHappiness = happySum / n;
      }
    }

    const projectedPop = Math.max(1, this.game.state.population + incomingCount);
    const totalFood = this.game.getTotalFood();
    const foodMonths = totalFood / (projectedPop * IMMIGRATION_FOOD_PER_PERSON_PER_MONTH);

    const housingScore = this.clamp01(freeSlots / IMMIGRATION_HOUSING_TARGET_FREE_SLOTS);
    const foodScore = this.clamp01(foodMonths / IMMIGRATION_FOOD_MONTHS_TARGET);
    const jobsScore = this.clamp01(openJobs / IMMIGRATION_OPEN_JOBS_TARGET);
    const stabilityScore = this.clamp01((avgHealth + avgHappiness) / 200);

    const settlementScore = (
      housingScore * 0.35 +
      foodScore * 0.35 +
      jobsScore * 0.20 +
      stabilityScore * 0.10
    );

    return IMMIGRATION_MIN_JOIN_CHANCE +
      settlementScore * (IMMIGRATION_MAX_JOIN_CHANCE - IMMIGRATION_MIN_JOIN_CHANCE);
  }

  private findRoadArrivalEntry(anchors: TilePoint[]): TilePoint | null {
    if (anchors.length === 0) return null;

    const edgeRoads = this.getEdgeRoadTiles();
    if (edgeRoads.length === 0) return null;

    const map = this.game.tileMap;
    const visited = new Int32Array(map.width * map.height);
    visited.fill(-1);
    const queue: Array<{ x: number; y: number; entryIdx: number }> = [];

    for (let i = 0; i < edgeRoads.length; i++) {
      const entry = edgeRoads[i];
      const idx = map.idx(entry.x, entry.y);
      if (visited[idx] !== -1) continue;
      visited[idx] = i;
      queue.push({ x: entry.x, y: entry.y, entryIdx: i });
    }

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let qi = 0;
    while (qi < queue.length) {
      const cur = queue[qi++];
      if (this.isNearAnchor(cur.x, cur.y, anchors, IMMIGRATION_ROAD_SETTLEMENT_RADIUS)) {
        return edgeRoads[cur.entryIdx];
      }

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!map.inBounds(nx, ny)) continue;
        const tile = map.get(nx, ny);
        if (!tile || tile.type !== TileType.ROAD) continue;

        const nIdx = map.idx(nx, ny);
        if (visited[nIdx] !== -1) continue;
        visited[nIdx] = cur.entryIdx;
        queue.push({ x: nx, y: ny, entryIdx: cur.entryIdx });
      }
    }

    return null;
  }

  private getEdgeRoadTiles(): TilePoint[] {
    return this.getEdgeRoadTilesWithSide().map(p => ({ x: p.x, y: p.y }));
  }

  private getEdgeRoadTilesWithSide(): EdgeRoadPoint[] {
    const map = this.game.tileMap;
    const points: EdgeRoadPoint[] = [];

    for (let x = 0; x < map.width; x++) {
      if (map.get(x, 0)?.type === TileType.ROAD) points.push({ x, y: 0, side: 'top' });
      if (map.get(x, map.height - 1)?.type === TileType.ROAD) points.push({ x, y: map.height - 1, side: 'bottom' });
    }
    for (let y = 1; y < map.height - 1; y++) {
      if (map.get(0, y)?.type === TileType.ROAD) points.push({ x: 0, y, side: 'left' });
      if (map.get(map.width - 1, y)?.type === TileType.ROAD) points.push({ x: map.width - 1, y, side: 'right' });
    }

    return points;
  }

  private isNearAnchor(x: number, y: number, anchors: TilePoint[], radius: number): boolean {
    for (const anchor of anchors) {
      const dist = Math.abs(anchor.x - x) + Math.abs(anchor.y - y);
      if (dist <= radius) return true;
    }
    return false;
  }

  private findWalkableSpawnTile(sx: number, sy: number, radius: number, preferRoad: boolean): TilePoint | null {
    const map = this.game.tileMap;
    const cx = Math.max(1, Math.min(MAP_WIDTH - 2, sx));
    const cy = Math.max(1, Math.min(MAP_HEIGHT - 2, sy));

    for (let pass = 0; pass < (preferRoad ? 2 : 1); pass++) {
      const roadOnly = preferRoad && pass === 0;
      for (let r = 0; r <= radius; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const tx = cx + dx;
            const ty = cy + dy;
            if (!map.inBounds(tx, ty)) continue;
            if (!map.isWalkable(tx, ty)) continue;
            if (roadOnly && map.get(tx, ty)?.type !== TileType.ROAD) continue;
            return { x: tx, y: ty };
          }
        }
      }
    }

    return null;
  }

  private clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
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
      [BuildingType.QUARRY]: Profession.MINER,
      [BuildingType.MINE]: Profession.MINER,
      // ── Tier-2 buildings ──────────────────────────────────────────
      [BuildingType.GATHERING_LODGE]: Profession.GATHERER,
      [BuildingType.HUNTING_LODGE]: Profession.HUNTER,
      [BuildingType.FORESTRY_HALL]: Profession.FORESTER,
      [BuildingType.SAWMILL]: Profession.WOOD_CUTTER,
      [BuildingType.IRON_WORKS]: Profession.BLACKSMITH,
      [BuildingType.ACADEMY]: Profession.TEACHER,
    };
    return map[type] || Profession.LABORER;
  }
}
