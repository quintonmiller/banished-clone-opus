import type { Game } from '../Game';
import { FestivalType, FestivalPhase, FairActivity, FairSeasonStats, FairGroupActivity, FairGroupType, EntityId } from '../types';
import { FAIR_REWARD_DEFS, FAIR_REWARD_MAP, KNOWLEDGE_BONUS_CONFIG } from '../data/FairRewardDefs';
import {
  BuildingType, Season, ResourceType, Profession, SkillType,
  FESTIVAL_DURATION_TICKS, FESTIVAL_HAPPINESS_BOOST,
  FESTIVAL_HAPPINESS_PER_TICK, FESTIVAL_GATHER_RADIUS,
  FESTIVAL_CHECK_TICKS, TILE_SIZE, MAP_WIDTH, MAP_HEIGHT,
  FAIR_MAIN_PHASE_RATIO, FAIR_GATHERING_PHASE_RATIO,
  FAIR_FLOURISH_TICKS, FAIR_CAMERA_ZOOM_DURATION_MS,
  FAIR_CAMERA_TARGET_ZOOM, FAIR_GATHER_DISPERSE_RADIUS,
  FAIR_VISITOR_COUNT_MIN, FAIR_VISITOR_COUNT_MAX,
  FAIR_VISITOR_SPAWN_MARGIN, FAIR_ACTIVITY_CHANGE_INTERVAL,
  FAIR_HAPPINESS_PER_ACTIVITY_TICK, PersonalityTrait, CITIZEN_SPEED,
  IMMIGRATION_FOOD_PER_PERSON_PER_MONTH, IMMIGRATION_FOOD_MONTHS_TARGET,
  IMMIGRATION_HOUSING_TARGET_FREE_SLOTS, IMMIGRATION_OPEN_JOBS_TARGET,
  FAIR_GROUP_FORMATION_INTERVAL, FAIR_GROUP_MIN_SIZE, FAIR_GROUP_MAX_SIZE,
  FAIR_GROUP_MAX_CONCURRENT, FAIR_GROUP_ASSEMBLE_TIMEOUT,
  FAIR_RACE_DURATION, FAIR_DANCE_DURATION, FAIR_SCAVENGER_DURATION,
  FAIR_TUG_DURATION, FAIR_PARADE_DURATION, FAIR_FEAST_DURATION,
  FAIR_DANCE_CIRCLE_RADIUS, FAIR_SCAVENGER_WAYPOINT_COUNT,
} from '../constants';

/** Generic + seasonal fair activity pools */
const GENERIC_ACTIVITIES: FairActivity[] = [
  'dancing', 'arm_wrestling', 'storytelling', 'juggling',
  'singing', 'feasting', 'games', 'drinking',
];
const SEASONAL_ACTIVITIES: Record<string, FairActivity[]> = {
  planting_day:      ['seed_trading', 'flower_crowns'],
  midsummer:         ['bonfire_dancing', 'foot_race'],
  harvest_festival:  ['pie_contest', 'apple_bobbing'],
  frost_fair:        ['ice_carving', 'snowball_fight'],
};

function emptySeasonStats(): FairSeasonStats {
  return {
    babiesBorn: 0, couplesMet: 0, couplesMarried: 0,
    newCitizens: 0, buildingsCompleted: 0, buildingsUpgraded: 0,
    citizensDied: 0, resourcesGathered: 0,
  };
}

/**
 * FestivalSystem — triggers seasonal fairs when a Town Hall exists.
 *
 * Fairs have 4 phases:
 *  1. main     — citizens do fair activities, happiness per tick
 *  2. gathering — everyone paths to dispersed tiles near TH
 *  3. flourish  — particle burst, hold position
 *  4. summary   — game pauses, summary UI with reward choice
 */
export class FestivalSystem {
  private game: Game;
  /** Set of sub-seasons that already had a festival this year */
  private celebratedThisYear = new Set<number>();
  /** Running tally of season statistics */
  seasonStats: FairSeasonStats = emptySeasonStats();

  constructor(game: Game) {
    this.game = game;

    // Reset on new year
    this.game.eventBus.on('new_year', () => {
      this.celebratedThisYear.clear();
      if (this.game.state.festival) {
        this.game.state.festival.activeEffect = null;
      }
    });

    // Clear festival effect at major season boundaries
    this.game.eventBus.on('season_changed', (data: any) => {
      const fest = this.game.state.festival;
      if (fest?.activeEffect && data.subSeason % 3 === 0) {
        fest.activeEffect = null;
      }
      // Reset season stats at major season boundary
      if (data.subSeason % 3 === 0) {
        this.seasonStats = emptySeasonStats();
      }
    });

    // ── Season stat tracking ──────────────────────────────────
    this.game.eventBus.on('citizen_born', () => { this.seasonStats.babiesBorn++; });
    this.game.eventBus.on('partnership', () => { this.seasonStats.couplesMet++; });
    this.game.eventBus.on('wedding', () => { this.seasonStats.couplesMarried++; });
    this.game.eventBus.on('nomads_arrived', (d: any) => { this.seasonStats.newCitizens += d?.count || 1; });
    this.game.eventBus.on('building_completed', () => { this.seasonStats.buildingsCompleted++; });
    this.game.eventBus.on('building_upgrade_completed', () => { this.seasonStats.buildingsUpgraded++; });
    this.game.eventBus.on('citizen_died', () => { this.seasonStats.citizensDied++; });
    this.game.eventBus.on('resource_gathered', (d: any) => { this.seasonStats.resourcesGathered += d?.amount || 1; });
  }

  update(): void {
    const state = this.game.state;

    // Clean expired fair bonuses
    this.cleanExpiredBonuses();

    // If a festival is active, run the phase state machine
    if (state.festival && state.festival.ticksRemaining > 0) {
      this.updateFairPhases();
      return;
    }

    // Check if we should start a festival
    if (state.tickInSubSeason !== FESTIVAL_CHECK_TICKS) return;
    if (this.celebratedThisYear.has(state.subSeason)) return;

    const festivalType = this.getFestivalForSeason(state.subSeason);
    if (!festivalType) return;

    const townHallId = this.findTownHall();
    if (townHallId === null) return;

    // Start the festival!
    this.celebratedThisYear.add(state.subSeason);
    this.startFestival(festivalType, townHallId);
  }

  /** Start a new fair */
  private startFestival(type: FestivalType, townHallId: EntityId): void {
    const state = this.game.state;
    const totalTicks = FESTIVAL_DURATION_TICKS;

    const prosperity = this.computeVillageProsperity();

    state.festival = {
      type,
      ticksRemaining: totalTicks,
      townHallId,
      activeEffect: null,
      phase: 'main',
      totalTicks,
      seasonStatsAtStart: { ...this.seasonStats },
      fairVisitorIds: [],
      chosenReward: null,
      rewardOptions: [],
      fairActivities: {},
      prosperity,
      fairGroups: [],
      fairGroupNextId: 0,
    };

    // Max out survival needs and boost happiness for the fair
    const needsStore = this.game.world.getComponentStore<any>('needs');
    if (needsStore) {
      for (const [, needs] of needsStore) {
        needs.food = 100;
        needs.energy = 100;
        needs.warmth = 100;
        needs.health = 100;
        needs.happiness = Math.min(100, needs.happiness + FESTIVAL_HAPPINESS_BOOST);
      }
    }

    // Force speed to 1x
    state.speed = 1;
    state.paused = false;
    this.game.loop.setSpeed(1);

    // Animate camera to town hall
    const thPos = this.game.world.getComponent<any>(townHallId, 'position');
    const thBld = this.game.world.getComponent<any>(townHallId, 'building');
    if (thPos && thBld) {
      const cx = thPos.tileX + Math.floor(thBld.width / 2);
      const cy = thPos.tileY + Math.floor(thBld.height / 2);
      this.game.camera.animateTo(cx, cy, FAIR_CAMERA_TARGET_ZOOM, FAIR_CAMERA_ZOOM_DURATION_MS);
    }

    // Spawn fair visitors
    this.spawnFairVisitors(state.festival);

    // Assign initial fair activities
    this.assignFairActivities(state.festival);

    // Generate reward options
    state.festival.rewardOptions = this.generateRewardOptions(state.festival);

    this.game.eventBus.emit('festival_started', { type });
  }

  /** Phase state machine */
  private updateFairPhases(): void {
    const fest = this.game.state.festival!;
    fest.ticksRemaining--;

    const elapsed = fest.totalTicks - fest.ticksRemaining;
    const mainEnd = Math.floor(fest.totalTicks * FAIR_MAIN_PHASE_RATIO);
    const gatherEnd = mainEnd + Math.floor(fest.totalTicks * FAIR_GATHERING_PHASE_RATIO);
    const flourishEnd = gatherEnd + FAIR_FLOURISH_TICKS;

    if (elapsed < mainEnd) {
      // ── Main phase ──
      if (fest.phase !== 'main') fest.phase = 'main';
      this.applyFestivalHappiness();
      this.updateFairGroups();

      // Periodic activity reassignment (skip citizens in active groups)
      if (elapsed % FAIR_ACTIVITY_CHANGE_INTERVAL === 0 && elapsed > 0) {
        this.assignFairActivities(fest);
      }
    } else if (elapsed < gatherEnd) {
      // ── Gathering phase ──
      if (fest.phase !== 'gathering') fest.phase = 'gathering';
      this.applyFestivalHappiness();
    } else if (elapsed < flourishEnd) {
      // ── Flourish phase ──
      if (fest.phase !== 'flourish') {
        fest.phase = 'flourish';
        // Trigger particle burst
        this.game.particleSystem.spawnFlourishBurst(fest.townHallId);
      }
      this.applyFestivalHappiness();
    } else {
      // ── Summary phase ──
      if (fest.phase !== 'summary') {
        fest.phase = 'summary';
        // Pause the game
        this.game.state.paused = true;
        this.game.loop.setSpeed(0);

        // Compute delta stats
        const deltaStats = this.computeDeltaStats(fest.seasonStatsAtStart);

        // Emit summary event for UI
        this.game.eventBus.emit('fair_summary_show', {
          type: fest.type,
          stats: deltaStats,
          rewardOptions: fest.rewardOptions,
          year: this.game.state.year,
          prosperity: fest.prosperity,
        });
      }
      // Summary phase holds — waiting for player to choose reward
      return;
    }
  }

  /** Apply per-tick happiness to citizens near the Town Hall */
  private applyFestivalHappiness(): void {
    const fest = this.game.state.festival;
    if (!fest) return;

    const thPos = this.game.world.getComponent<any>(fest.townHallId, 'position');
    if (!thPos) return;

    const thBld = this.game.world.getComponent<any>(fest.townHallId, 'building');
    const cx = thPos.tileX + Math.floor((thBld?.width || 5) / 2);
    const cy = thPos.tileY + Math.floor((thBld?.height || 5) / 2);

    const citizens = this.game.world.getComponentStore<any>('citizen');
    const positions = this.game.world.getComponentStore<any>('position');
    const needsStore = this.game.world.getComponentStore<any>('needs');
    if (!citizens || !positions || !needsStore) return;

    // Use fair-specific rate during main phase, normal rate otherwise
    const hpRate = fest.phase === 'main' ? FAIR_HAPPINESS_PER_ACTIVITY_TICK : FESTIVAL_HAPPINESS_PER_TICK;

    for (const [id] of citizens) {
      const pos = positions.get(id);
      const needs = needsStore.get(id);
      if (!pos || !needs) continue;

      const dx = Math.abs(pos.tileX - cx);
      const dy = Math.abs(pos.tileY - cy);
      if (dx <= FESTIVAL_GATHER_RADIUS && dy <= FESTIVAL_GATHER_RADIUS) {
        needs.happiness = Math.min(100, needs.happiness + hpRate);
      }
    }
  }

  /** Get a random walkable tile dispersed around the town hall */
  getDispersedFairTile(townHallId: EntityId): { x: number; y: number } | null {
    const thPos = this.game.world.getComponent<any>(townHallId, 'position');
    const thBld = this.game.world.getComponent<any>(townHallId, 'building');
    if (!thPos || !thBld) return null;

    const cx = thPos.tileX + Math.floor(thBld.width / 2);
    const cy = thPos.tileY + Math.floor(thBld.height / 2);

    for (let attempt = 0; attempt < 10; attempt++) {
      const dx = Math.floor((Math.random() - 0.5) * 2 * FAIR_GATHER_DISPERSE_RADIUS);
      const dy = Math.floor((Math.random() - 0.5) * 2 * FAIR_GATHER_DISPERSE_RADIUS);
      const tx = cx + dx;
      const ty = cy + dy;
      const tile = this.game.tileMap.get(tx, ty);
      if (tile && !tile.blocksMovement && !tile.occupied) {
        return { x: tx, y: ty };
      }
      // Also allow tiles that are walkable (road, grass) even if occupied by a building
      if (tile && !tile.blocksMovement) {
        return { x: tx, y: ty };
      }
    }
    // Fallback: just return center-adjacent tile
    return { x: cx + 1, y: cy + 1 };
  }

  /** Assign fair activities to all citizens (skips citizens in active groups) */
  private assignFairActivities(fest: { type: FestivalType; fairActivities: Record<number, FairActivity>; fairGroups?: FairGroupActivity[] }): void {
    const citizens = this.game.world.getComponentStore<any>('citizen');
    if (!citizens) return;

    // Build set of citizens currently in non-finished groups
    const grouped = new Set<EntityId>();
    if (fest.fairGroups) {
      for (const g of fest.fairGroups) {
        if (g.phase !== 'finished') {
          for (const mid of g.memberIds) grouped.add(mid);
        }
      }
    }

    const seasonal = SEASONAL_ACTIVITIES[fest.type] || [];
    const pool: { activity: FairActivity; weight: number }[] = [];

    for (const a of GENERIC_ACTIVITIES) {
      pool.push({ activity: a, weight: 1 });
    }
    for (const a of seasonal) {
      pool.push({ activity: a, weight: 2 }); // seasonal activities get 2x weight
    }

    const totalWeight = pool.reduce((s, p) => s + p.weight, 0);

    for (const [id] of citizens) {
      if (grouped.has(id)) continue; // skip grouped citizens
      let roll = Math.random() * totalWeight;
      for (const p of pool) {
        roll -= p.weight;
        if (roll <= 0) {
          fest.fairActivities[id] = p.activity;
          break;
        }
      }
    }
  }

  // ── Group fair activities ─────────────────────────────────────

  private static readonly GROUP_TYPE_DURATIONS: Record<FairGroupType, number> = {
    race: FAIR_RACE_DURATION,
    group_dance: FAIR_DANCE_DURATION,
    feast_circle: FAIR_FEAST_DURATION,
    tug_of_war: FAIR_TUG_DURATION,
    parade: FAIR_PARADE_DURATION,
    scavenger_hunt: FAIR_SCAVENGER_DURATION,
  };

  private static readonly GROUP_TYPE_ACTIVITY: Record<FairGroupType, FairActivity> = {
    race: 'group_race',
    group_dance: 'group_dance',
    feast_circle: 'feasting',
    tug_of_war: 'tug_of_war',
    parade: 'parade',
    scavenger_hunt: 'scavenger_hunt',
  };

  private static readonly GROUP_TYPES: FairGroupType[] = [
    'race', 'group_dance', 'feast_circle', 'tug_of_war', 'parade', 'scavenger_hunt',
  ];

  /** Update all active group activities — called every tick during main phase */
  private updateFairGroups(): void {
    const fest = this.game.state.festival;
    if (!fest) return;
    if (!fest.fairGroups) fest.fairGroups = [];

    const tick = this.game.state.tick;

    // Update existing groups
    for (const group of fest.fairGroups) {
      if (group.phase === 'finished') continue;
      group.phaseTick++;

      if (group.phase === 'assembling') {
        if (group.phaseTick >= FAIR_GROUP_ASSEMBLE_TIMEOUT || this.areGroupMembersAssembled(group)) {
          this.activateGroup(group);
        }
      } else if (group.phase === 'active') {
        if (group.phaseTick >= group.durationTicks) {
          group.phase = 'finished';
        }
      }
    }

    // Clean up finished groups
    const before = fest.fairGroups.length;
    for (let i = fest.fairGroups.length - 1; i >= 0; i--) {
      if (fest.fairGroups[i].phase === 'finished') {
        this.dissolveGroup(fest.fairGroups[i], fest);
        fest.fairGroups.splice(i, 1);
      }
    }

    // Periodically form new groups
    const activeCount = fest.fairGroups.length;
    const elapsed = fest.totalTicks - fest.ticksRemaining;
    if (activeCount < FAIR_GROUP_MAX_CONCURRENT && elapsed % FAIR_GROUP_FORMATION_INTERVAL === 0) {
      this.tryFormGroup(fest);
    }
  }

  /** Try to form a new group activity */
  private tryFormGroup(fest: NonNullable<typeof this.game.state.festival>): void {
    const available = this.getAvailableFairCitizens(fest);
    if (available.length < FAIR_GROUP_MIN_SIZE) return;

    // Pick a random group type
    const type = FestivalSystem.GROUP_TYPES[Math.floor(Math.random() * FestivalSystem.GROUP_TYPES.length)];

    // Scavenger hunts prefer children
    let candidates: EntityId[];
    if (type === 'scavenger_hunt') {
      const children = available.filter(id => {
        const cit = this.game.world.getComponent<any>(id, 'citizen');
        return cit?.isChild;
      });
      candidates = children.length >= FAIR_GROUP_MIN_SIZE ? children : available;
    } else {
      // Other activities use adults preferentially
      const adults = available.filter(id => {
        const cit = this.game.world.getComponent<any>(id, 'citizen');
        return cit && !cit.isChild;
      });
      candidates = adults.length >= FAIR_GROUP_MIN_SIZE ? adults : available;
    }

    if (candidates.length < FAIR_GROUP_MIN_SIZE) return;

    // Select members (random subset, capped)
    const count = Math.min(
      FAIR_GROUP_MAX_SIZE,
      FAIR_GROUP_MIN_SIZE + Math.floor(Math.random() * (candidates.length - FAIR_GROUP_MIN_SIZE + 1)),
    );
    // Shuffle and take first N
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const members = candidates.slice(0, count);

    // Generate waypoints
    const waypoints = this.generateGroupWaypoints(type, fest.townHallId, members.length);
    if (!waypoints || waypoints.length === 0) return;

    // Build initial waypoint index (each member → their start waypoint)
    const waypointIndex: Record<number, number> = {};
    for (let i = 0; i < members.length; i++) {
      waypointIndex[members[i]] = i % waypoints.length;
    }

    const group: FairGroupActivity = {
      id: fest.fairGroupNextId++,
      type,
      memberIds: members,
      phase: 'assembling',
      phaseTick: 0,
      waypoints,
      waypointIndex,
      startTick: this.game.state.tick,
      durationTicks: FestivalSystem.GROUP_TYPE_DURATIONS[type],
    };

    fest.fairGroups.push(group);

    // Set activity labels for group members
    const actLabel = FestivalSystem.GROUP_TYPE_ACTIVITY[type];
    for (const mid of members) {
      fest.fairActivities[mid] = actLabel;
    }
  }

  /** Generate spatial waypoints for a group activity type */
  private generateGroupWaypoints(
    type: FairGroupType,
    townHallId: EntityId,
    memberCount: number,
  ): { x: number; y: number }[] {
    const thPos = this.game.world.getComponent<any>(townHallId, 'position');
    const thBld = this.game.world.getComponent<any>(townHallId, 'building');
    if (!thPos || !thBld) return [];

    const cx = thPos.tileX + Math.floor(thBld.width / 2);
    const cy = thPos.tileY + Math.floor(thBld.height / 2);
    const results: { x: number; y: number }[] = [];

    switch (type) {
      case 'race': {
        // Start line + finish line, ~10 tiles apart
        const horizontal = Math.random() < 0.5;
        const startOffset = -5;
        const finishOffset = 5;
        // First memberCount waypoints = start positions, next memberCount = finish positions
        for (let i = 0; i < memberCount; i++) {
          const spread = i - Math.floor(memberCount / 2);
          if (horizontal) {
            results.push(this.validateWaypoint(cx + startOffset, cy + spread, cx, cy));
          } else {
            results.push(this.validateWaypoint(cx + spread, cy + startOffset, cx, cy));
          }
        }
        for (let i = 0; i < memberCount; i++) {
          const spread = i - Math.floor(memberCount / 2);
          if (horizontal) {
            results.push(this.validateWaypoint(cx + finishOffset, cy + spread, cx, cy));
          } else {
            results.push(this.validateWaypoint(cx + spread, cy + finishOffset, cx, cy));
          }
        }
        break;
      }

      case 'group_dance': {
        // Circle of 8 evenly-spaced points
        const r = FAIR_DANCE_CIRCLE_RADIUS;
        const pointCount = 8;
        for (let i = 0; i < pointCount; i++) {
          const angle = (i / pointCount) * Math.PI * 2;
          const dx = Math.round(Math.cos(angle) * r);
          const dy = Math.round(Math.sin(angle) * r);
          results.push(this.validateWaypoint(cx + dx, cy + dy, cx, cy));
        }
        break;
      }

      case 'feast_circle': {
        // Small cluster of positions around a center point
        const offsets = [
          { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
          { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
        ];
        // Pick a spot offset from TH center
        const fx = cx + Math.floor((Math.random() - 0.5) * 6);
        const fy = cy + Math.floor((Math.random() - 0.5) * 6);
        for (let i = 0; i < Math.min(memberCount, offsets.length); i++) {
          results.push(this.validateWaypoint(fx + offsets[i].x, fy + offsets[i].y, cx, cy));
        }
        break;
      }

      case 'tug_of_war': {
        // Two teams facing each other, 4 tiles apart
        const teamSize = Math.ceil(memberCount / 2);
        const leftX = cx - 2;
        const rightX = cx + 2;
        for (let i = 0; i < teamSize; i++) {
          results.push(this.validateWaypoint(leftX, cy - Math.floor(teamSize / 2) + i, cx, cy));
        }
        for (let i = 0; i < memberCount - teamSize; i++) {
          results.push(this.validateWaypoint(rightX, cy - Math.floor((memberCount - teamSize) / 2) + i, cx, cy));
        }
        break;
      }

      case 'parade': {
        // 4 corner waypoints forming a rectangle around the TH
        const r = 4;
        results.push(this.validateWaypoint(cx - r, cy - r, cx, cy));
        results.push(this.validateWaypoint(cx + r, cy - r, cx, cy));
        results.push(this.validateWaypoint(cx + r, cy + r, cx, cy));
        results.push(this.validateWaypoint(cx - r, cy + r, cx, cy));
        break;
      }

      case 'scavenger_hunt': {
        // Random waypoints spread across the fair area
        for (let i = 0; i < FAIR_SCAVENGER_WAYPOINT_COUNT; i++) {
          const dx = Math.floor((Math.random() - 0.5) * 2 * FAIR_GATHER_DISPERSE_RADIUS);
          const dy = Math.floor((Math.random() - 0.5) * 2 * FAIR_GATHER_DISPERSE_RADIUS);
          results.push(this.validateWaypoint(cx + dx, cy + dy, cx, cy));
        }
        break;
      }
    }

    return results;
  }

  /** Clamp a waypoint to fair area and ensure walkability, falling back to adjacent tiles */
  private validateWaypoint(x: number, y: number, cx: number, cy: number): { x: number; y: number } {
    // Clamp within fair area
    const clampedX = Math.max(cx - FAIR_GATHER_DISPERSE_RADIUS, Math.min(cx + FAIR_GATHER_DISPERSE_RADIUS, x));
    const clampedY = Math.max(cy - FAIR_GATHER_DISPERSE_RADIUS, Math.min(cy + FAIR_GATHER_DISPERSE_RADIUS, y));

    const tile = this.game.tileMap.get(clampedX, clampedY);
    if (tile && !tile.blocksMovement) return { x: clampedX, y: clampedY };

    // Try adjacent tiles
    const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
    for (const [dx, dy] of offsets) {
      const nx = clampedX + dx;
      const ny = clampedY + dy;
      const adj = this.game.tileMap.get(nx, ny);
      if (adj && !adj.blocksMovement) return { x: nx, y: ny };
    }

    // Last resort: return center-adjacent
    return { x: cx + 1, y: cy + 1 };
  }

  /** Check if >=60% of group members are within 1 tile of their start waypoint */
  private areGroupMembersAssembled(group: FairGroupActivity): boolean {
    let near = 0;
    for (const mid of group.memberIds) {
      const pos = this.game.world.getComponent<any>(mid, 'position');
      if (!pos) continue;
      const wpIdx = group.waypointIndex[mid];
      if (wpIdx === undefined) continue;
      const wp = group.waypoints[wpIdx];
      if (!wp) continue;
      if (Math.abs(pos.tileX - wp.x) <= 1 && Math.abs(pos.tileY - wp.y) <= 1) {
        near++;
      }
    }
    return near >= group.memberIds.length * 0.6;
  }

  /** Transition group from assembling to active */
  private activateGroup(group: FairGroupActivity): void {
    group.phase = 'active';
    group.phaseTick = 0;

    if (group.type === 'race') {
      // Set each member's waypointIndex to their finish waypoint (second half of waypoints array)
      const half = group.memberIds.length;
      for (let i = 0; i < group.memberIds.length; i++) {
        group.waypointIndex[group.memberIds[i]] = half + i;
      }
    } else if (group.type === 'group_dance') {
      // Assign each member to an evenly-spaced starting point on the circle
      for (let i = 0; i < group.memberIds.length; i++) {
        group.waypointIndex[group.memberIds[i]] = i % group.waypoints.length;
      }
    } else if (group.type === 'parade') {
      // Stagger members along the route
      for (let i = 0; i < group.memberIds.length; i++) {
        group.waypointIndex[group.memberIds[i]] = i % group.waypoints.length;
      }
    }
  }

  /** Dissolve a finished group — reassign members to random individual activities */
  private dissolveGroup(group: FairGroupActivity, fest: NonNullable<typeof this.game.state.festival>): void {
    const seasonal = SEASONAL_ACTIVITIES[fest.type] || [];
    const pool = [...GENERIC_ACTIVITIES, ...seasonal];
    for (const mid of group.memberIds) {
      fest.fairActivities[mid] = pool[Math.floor(Math.random() * pool.length)];
    }
  }

  /** Get citizens in the fair area who are not in any active group */
  getAvailableFairCitizens(fest: NonNullable<typeof this.game.state.festival>): EntityId[] {
    const grouped = new Set<EntityId>();
    if (fest.fairGroups) {
      for (const g of fest.fairGroups) {
        if (g.phase !== 'finished') {
          for (const mid of g.memberIds) grouped.add(mid);
        }
      }
    }

    const result: EntityId[] = [];
    const citizens = this.game.world.getComponentStore<any>('citizen');
    const positions = this.game.world.getComponentStore<any>('position');
    if (!citizens || !positions) return result;

    const thPos = this.game.world.getComponent<any>(fest.townHallId, 'position');
    const thBld = this.game.world.getComponent<any>(fest.townHallId, 'building');
    if (!thPos || !thBld) return result;

    const cx = thPos.tileX + Math.floor(thBld.width / 2);
    const cy = thPos.tileY + Math.floor(thBld.height / 2);

    for (const [id] of citizens) {
      if (grouped.has(id)) continue;
      const pos = positions.get(id);
      if (!pos) continue;
      if (Math.abs(pos.tileX - cx) <= FAIR_GATHER_DISPERSE_RADIUS
       && Math.abs(pos.tileY - cy) <= FAIR_GATHER_DISPERSE_RADIUS) {
        result.push(id);
      }
    }
    return result;
  }

  /**
   * Compute village prosperity score (0–1), reusing the same formula as the
   * immigration system in PopulationSystem:
   *   housing (35%) + food (35%) + jobs (20%) + stability (10%)
   *
   * Also incorporates seasonal performance: the more the village accomplished
   * this season, the higher the score.
   */
  computeVillageProsperity(): number {
    const game = this.game;

    // ── Citizen health / happiness averages ──
    const needsStore = game.world.getComponentStore<any>('needs');
    let avgHealth = 50, avgHappiness = 50;
    if (needsStore && needsStore.size > 0) {
      let hSum = 0, haSum = 0, n = 0;
      for (const [, needs] of needsStore) {
        hSum += needs.health ?? 50;
        haSum += needs.happiness ?? 50;
        n++;
      }
      if (n > 0) { avgHealth = hSum / n; avgHappiness = haSum / n; }
    }

    // ── Housing free slots ──
    const houses = game.world.getComponentStore<any>('house');
    let freeSlots = 0;
    if (houses) {
      for (const [houseId, house] of houses) {
        const bld = game.world.getComponent<any>(houseId, 'building');
        if (!bld?.completed) continue;
        const maxRes = house.maxResidents || 0;
        const occ = house.residents?.length || 0;
        freeSlots += Math.max(0, maxRes - occ);
      }
    }

    // ── Food supply ──
    const totalFood = game.getTotalFood();
    const pop = Math.max(1, game.state.population);
    const foodMonths = totalFood / (pop * IMMIGRATION_FOOD_PER_PERSON_PER_MONTH);

    // ── Open jobs ──
    const buildings = game.world.getComponentStore<any>('building');
    let openJobs = 0;
    if (buildings) {
      for (const [bldId, bld] of buildings) {
        if (!bld?.completed || (bld.maxWorkers || 0) <= 0) continue;
        if (game.isMineOrQuarryDepleted(bldId)) continue;
        const assigned = bld.assignedWorkers?.length || 0;
        openJobs += Math.max(0, (bld.maxWorkers || 0) - assigned);
      }
    }

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

    const housingScore    = clamp01(freeSlots / IMMIGRATION_HOUSING_TARGET_FREE_SLOTS);
    const foodScore       = clamp01(foodMonths / IMMIGRATION_FOOD_MONTHS_TARGET);
    const jobsScore       = clamp01(openJobs / IMMIGRATION_OPEN_JOBS_TARGET);
    const stabilityScore  = clamp01((avgHealth + avgHappiness) / 200);

    // Base structural prosperity (same weights as immigration system)
    const structuralScore = (
      housingScore    * 0.35 +
      foodScore       * 0.35 +
      jobsScore       * 0.20 +
      stabilityScore  * 0.10
    );

    // Season performance bonus (0–0.15 extra): reward active villages
    const ss = this.seasonStats;
    const activityEvents = ss.buildingsCompleted + ss.buildingsUpgraded
      + ss.babiesBorn + ss.couplesMarried + ss.newCitizens;
    const seasonBonus = clamp01(activityEvents / 10) * 0.15;

    return clamp01(structuralScore + seasonBonus);
  }

  /** Generate 3 reward options for the summary UI, weighted by village prosperity */
  private generateRewardOptions(fest: { type: FestivalType; prosperity: number }): string[] {
    const eligible = FAIR_REWARD_DEFS.filter(r => {
      // Check festival type restriction
      if (r.festivalTypes && !r.festivalTypes.includes(fest.type)) return false;
      // Check condition
      if (r.condition && !r.condition(this.game)) return false;
      // Don't offer knowledge rewards that are already active
      const cfg = KNOWLEDGE_BONUS_CONFIG[r.applyFn];
      if (cfg && this.game.state.fairBonuses[cfg.key]) return false;
      return true;
    });

    if (eligible.length <= 3) return eligible.map(r => r.id);

    // Prosperity-adjusted weights:
    //   - Premium rewards (building, traveler, knowledge) get boosted by prosperity
    //   - Basic rewards (resources) get boosted by low prosperity
    //   This way thriving villages see rarer/better options, while
    //   struggling villages get more survival-oriented resource bundles.
    const p = fest.prosperity;
    const adjustedWeights = eligible.map(r => {
      let w = r.weight;
      if (r.category === 'resources') {
        w *= 1.0 + (1 - p) * 0.8;  // up to 1.8x for struggling villages
      } else {
        w *= 0.6 + p * 1.0;         // 0.6x to 1.6x based on prosperity
      }
      return w;
    });

    // Weighted random pick 3 without replacement
    const picked: string[] = [];
    const remaining = eligible.map((r, i) => ({ id: r.id, weight: adjustedWeights[i] }));

    for (let i = 0; i < 3 && remaining.length > 0; i++) {
      const totalWeight = remaining.reduce((s, r) => s + r.weight, 0);
      let roll = Math.random() * totalWeight;
      for (let j = 0; j < remaining.length; j++) {
        roll -= remaining[j].weight;
        if (roll <= 0) {
          picked.push(remaining[j].id);
          remaining.splice(j, 1);
          break;
        }
      }
    }

    return picked;
  }

  /** Apply a chosen reward */
  applyReward(rewardId: string): void {
    const def = FAIR_REWARD_MAP.get(rewardId);
    if (!def) return;

    const fest = this.game.state.festival;
    if (fest) fest.chosenReward = rewardId;

    switch (def.applyFn) {
      // ── Buildings ──
      case 'building_statue':
      case 'building_herb_garden':
      case 'building_pavilion':
        // These are purely flavor — grant a happiness boost or mark a flag
        // (No actual building entity needed — just a permanent bonus)
        if (def.applyFn === 'building_statue') {
          this.game.state.fairBonuses['statueOfFounders'] = { value: 0.002, expiryTick: Infinity };
        } else if (def.applyFn === 'building_herb_garden') {
          this.game.state.fairBonuses['herbGarden'] = { value: 1, expiryTick: Infinity };
        } else if (def.applyFn === 'building_pavilion') {
          this.game.state.fairBonuses['festivalPavilion'] = { value: 2.0, expiryTick: Infinity };
        }
        break;

      // ── Travelers ──
      case 'traveler_farmer':
        this.recruitVisitor({ farming: 3 });
        break;
      case 'traveler_blacksmith':
        this.recruitVisitor({ mining: 3 });
        this.game.addResource(ResourceType.TOOL, 10);
        break;
      case 'traveler_herbalist':
        this.recruitVisitor({ gathering: 2 }, undefined, true);
        break;
      case 'traveler_soldier':
        this.recruitVisitor({}, [PersonalityTrait.HARDWORKING]);
        break;
      case 'traveler_family':
        this.recruitFamily();
        break;

      // ── Knowledge ──
      case 'knowledge_crop_rotation':
      case 'knowledge_preservation':
      case 'knowledge_insulation':
      case 'knowledge_herbal_remedy':
      case 'knowledge_fishing_nets':
      case 'knowledge_masonry':
      case 'knowledge_animal_husbandry': {
        const cfg = KNOWLEDGE_BONUS_CONFIG[def.applyFn];
        if (cfg) {
          this.game.state.fairBonuses[cfg.key] = {
            value: cfg.value,
            expiryTick: this.game.state.tick + cfg.duration,
          };
        }
        break;
      }

      // ── Resources (scaled by prosperity: 0.7x to 1.5x) ──
      case 'resources_merchants_surplus':
      case 'resources_winter_provisions':
      case 'resources_tool_shipment':
      case 'resources_rare_seeds':
      case 'resources_firewood_stockpile':
      case 'resources_feast_supplies': {
        const p = fest?.prosperity ?? 0.5;
        const mult = 0.7 + p * 0.8; // 0.7x at 0 prosperity, 1.5x at 1.0
        const s = (base: number) => Math.round(base * mult);
        switch (def.applyFn) {
          case 'resources_merchants_surplus':
            this.game.addResource(ResourceType.LOG, s(50));
            this.game.addResource(ResourceType.STONE, s(30));
            this.game.addResource(ResourceType.IRON, s(10));
            break;
          case 'resources_winter_provisions':
            this.game.addResource(ResourceType.BERRIES, s(30));
            this.game.addResource(ResourceType.VENISON, s(20));
            this.game.addResource(ResourceType.FISH, s(15));
            this.game.addResource(ResourceType.BREAD, s(15));
            break;
          case 'resources_tool_shipment':
            this.game.addResource(ResourceType.TOOL, s(8));
            this.game.addResource(ResourceType.COAT, s(5));
            break;
          case 'resources_rare_seeds':
            this.game.addResource(ResourceType.WHEAT, s(40));
            this.game.addResource(ResourceType.CABBAGE, s(30));
            this.game.addResource(ResourceType.POTATO, s(20));
            break;
          case 'resources_firewood_stockpile':
            this.game.addResource(ResourceType.FIREWOOD, s(60));
            break;
          case 'resources_feast_supplies':
            this.game.addResource(ResourceType.BREAD, s(15));
            this.game.addResource(ResourceType.FISH_STEW, s(10));
            this.game.addResource(ResourceType.BERRY_PIE, s(10));
            this.game.addResource(ResourceType.VEGETABLE_SOUP, s(10));
            break;
        }
        break;
      }
    }
  }

  /** Re-emit summary event if festival was saved in summary phase (for load recovery) */
  restoreSummaryIfNeeded(): void {
    const fest = this.game.state.festival;
    if (!fest || fest.phase !== 'summary' || fest.ticksRemaining <= 0) return;

    const deltaStats = this.computeDeltaStats(fest.seasonStatsAtStart);
    this.game.eventBus.emit('fair_summary_show', {
      type: fest.type,
      stats: deltaStats,
      rewardOptions: fest.rewardOptions,
      year: this.game.state.year,
      prosperity: fest.prosperity,
    });
  }

  /** Finalize the fair: apply lingering effect, clean up visitors, resume game */
  finalizeFair(): void {
    const fest = this.game.state.festival;
    if (!fest) return;

    // Apply lingering seasonal effect
    fest.activeEffect = fest.type;

    // Despawn un-recruited visitors
    for (const visitorId of fest.fairVisitorIds) {
      const visitor = this.game.world.getComponent<any>(visitorId, 'fairVisitor');
      if (visitor && !visitor.recruited) {
        this.game.world.destroyEntity(visitorId);
      }
    }

    // Clear fair state but keep lingering effect
    fest.ticksRemaining = 0;
    fest.fairActivities = {};
    fest.fairVisitorIds = [];
    fest.fairGroups = [];

    // Resume game at 1x
    this.game.state.paused = false;
    this.game.state.speed = 1;
    this.game.loop.setSpeed(1);

    this.game.eventBus.emit('festival_ended', { type: fest.type });
  }

  /** Spawn 2-5 fair visitors at map edges */
  private spawnFairVisitors(fest: { townHallId: EntityId; fairVisitorIds: EntityId[] }): void {
    const count = FAIR_VISITOR_COUNT_MIN + Math.floor(Math.random() * (FAIR_VISITOR_COUNT_MAX - FAIR_VISITOR_COUNT_MIN + 1));

    for (let i = 0; i < count; i++) {
      const id = this.spawnFairVisitor();
      if (id !== null) {
        fest.fairVisitorIds.push(id);
        // Path visitor toward town hall
        const tile = this.getDispersedFairTile(fest.townHallId);
        if (tile) {
          const movement = this.game.world.getComponent<any>(id, 'movement');
          if (movement) {
            const result = this.game.pathfinder.findPath(
              this.game.world.getComponent<any>(id, 'position')!.tileX,
              this.game.world.getComponent<any>(id, 'position')!.tileY,
              tile.x, tile.y,
            );
            if (result.found) movement.path = result.path;
          }
        }
      }
    }
  }

  /** Spawn a single fair visitor at map edge */
  private spawnFairVisitor(): EntityId | null {
    const world = this.game.world;
    const id = world.createEntity();
    const isMale = Math.random() < 0.5;
    const generatedName = this.game.generateCitizenName(isMale);

    // Pick a random edge tile
    const edge = this.findEdgeSpawnTile();
    if (!edge) { world.destroyEntity(id); return null; }

    world.addComponent(id, 'position', {
      tileX: edge.x, tileY: edge.y,
      pixelX: edge.x * TILE_SIZE + TILE_SIZE / 2,
      pixelY: edge.y * TILE_SIZE + TILE_SIZE / 2,
    });

    world.addComponent(id, 'citizen', {
      firstName: generatedName.firstName,
      lastName: generatedName.lastName,
      name: generatedName.name,
      age: 18 + Math.floor(Math.random() * 20),
      isMale,
      isChild: false,
      isEducated: Math.random() < 0.3,
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
      food: 80, warmth: 100, health: 100,
      happiness: 90, energy: 90, recentDiet: [],
    });

    world.addComponent(id, 'family', {
      relationshipStatus: 'single',
      partnerId: null, childrenIds: [], homeId: null,
      isPregnant: false, pregnancyTicks: 0, pregnancyPartnerId: null,
    });

    world.addComponent(id, 'renderable', {
      sprite: null, layer: 10, animFrame: 0, visible: true,
    });

    // Tag as fair visitor (no worker component — excluded from job assignment)
    world.addComponent(id, 'fairVisitor', { isFairVisitor: true, recruited: false });

    return id;
  }

  /** Find a walkable tile near the map edge for visitor spawning */
  private findEdgeSpawnTile(): { x: number; y: number } | null {
    for (let attempt = 0; attempt < 20; attempt++) {
      const side = Math.floor(Math.random() * 4);
      let x: number, y: number;
      switch (side) {
        case 0: x = FAIR_VISITOR_SPAWN_MARGIN; y = FAIR_VISITOR_SPAWN_MARGIN + Math.floor(Math.random() * (MAP_HEIGHT - 2 * FAIR_VISITOR_SPAWN_MARGIN)); break;
        case 1: x = MAP_WIDTH - FAIR_VISITOR_SPAWN_MARGIN; y = FAIR_VISITOR_SPAWN_MARGIN + Math.floor(Math.random() * (MAP_HEIGHT - 2 * FAIR_VISITOR_SPAWN_MARGIN)); break;
        case 2: x = FAIR_VISITOR_SPAWN_MARGIN + Math.floor(Math.random() * (MAP_WIDTH - 2 * FAIR_VISITOR_SPAWN_MARGIN)); y = FAIR_VISITOR_SPAWN_MARGIN; break;
        default: x = FAIR_VISITOR_SPAWN_MARGIN + Math.floor(Math.random() * (MAP_WIDTH - 2 * FAIR_VISITOR_SPAWN_MARGIN)); y = MAP_HEIGHT - FAIR_VISITOR_SPAWN_MARGIN; break;
      }
      const tile = this.game.tileMap.get(x, y);
      if (tile && !tile.blocksMovement) {
        return { x, y };
      }
    }
    return null;
  }

  /** Recruit a fair visitor as a permanent citizen */
  private recruitVisitor(
    skills?: Record<string, number>,
    traits?: string[],
    diseaseImmune?: boolean,
  ): void {
    const fest = this.game.state.festival;
    if (!fest || fest.fairVisitorIds.length === 0) return;

    // Pick first un-recruited visitor
    let visitorId: EntityId | null = null;
    for (const id of fest.fairVisitorIds) {
      const v = this.game.world.getComponent<any>(id, 'fairVisitor');
      if (v && !v.recruited) {
        visitorId = id;
        v.recruited = true;
        break;
      }
    }

    if (visitorId === null) return;

    // Remove fairVisitor tag, add worker component
    this.game.world.removeComponent(visitorId, 'fairVisitor');
    const workerData: any = {
      profession: Profession.LABORER,
      workplaceId: null,
      carrying: null, carryAmount: 0,
      task: null, manuallyAssigned: false,
    };

    // Apply skills
    if (skills) {
      workerData.skills = {};
      for (const [skill, level] of Object.entries(skills)) {
        workerData.skills[skill] = { xp: level * 500, level };
      }
    }

    this.game.world.addComponent(visitorId, 'worker', workerData);

    // Override traits if specified
    if (traits) {
      const citizen = this.game.world.getComponent<any>(visitorId, 'citizen');
      if (citizen) citizen.traits = traits;
    }

    // Disease immunity (simplified: high health, set immunity tick)
    if (diseaseImmune) {
      const needs = this.game.world.getComponent<any>(visitorId, 'needs');
      if (needs) needs.health = 100;
    }
  }

  /** Recruit a family (couple + child) from visitors */
  private recruitFamily(): void {
    const fest = this.game.state.festival;
    if (!fest) return;

    // Recruit up to 2 visitors as the couple
    const recruited: EntityId[] = [];
    for (const id of fest.fairVisitorIds) {
      if (recruited.length >= 2) break;
      const v = this.game.world.getComponent<any>(id, 'fairVisitor');
      if (v && !v.recruited) {
        v.recruited = true;
        this.game.world.removeComponent(id, 'fairVisitor');
        this.game.world.addComponent(id, 'worker', {
          profession: Profession.LABORER,
          workplaceId: null, carrying: null, carryAmount: 0,
          task: null, manuallyAssigned: false,
        });
        recruited.push(id);
      }
    }

    // Set up partnership if we got a couple
    if (recruited.length >= 2) {
      const fam0 = this.game.world.getComponent<any>(recruited[0], 'family');
      const fam1 = this.game.world.getComponent<any>(recruited[1], 'family');
      if (fam0 && fam1) {
        fam0.relationshipStatus = 'married';
        fam0.partnerId = recruited[1];
        fam1.relationshipStatus = 'married';
        fam1.partnerId = recruited[0];
      }
    }

    // Spawn a child near the first recruited visitor
    if (recruited.length > 0) {
      const pos = this.game.world.getComponent<any>(recruited[0], 'position');
      if (pos) {
        const childId = this.game.world.createEntity();
        const childIsMale = Math.random() < 0.5;
        const childName = this.game.generateCitizenName(childIsMale);

        this.game.world.addComponent(childId, 'position', {
          tileX: pos.tileX, tileY: pos.tileY,
          pixelX: pos.pixelX, pixelY: pos.pixelY,
        });
        this.game.world.addComponent(childId, 'citizen', {
          firstName: childName.firstName, lastName: childName.lastName, name: childName.name,
          age: 3 + Math.floor(Math.random() * 5),
          isMale: childIsMale, isChild: true, isEducated: false,
          isSleeping: false, traits: this.game.generateTraits(),
          partnerPreference: this.game.generatePartnerPreference(),
        });
        this.game.world.addComponent(childId, 'movement', {
          path: [], speed: CITIZEN_SPEED, targetEntity: null, moving: false,
        });
        this.game.world.addComponent(childId, 'needs', {
          food: 80, warmth: 100, health: 100,
          happiness: 90, energy: 90, recentDiet: [],
        });
        this.game.world.addComponent(childId, 'family', {
          relationshipStatus: 'single', partnerId: null,
          childrenIds: [], homeId: null,
          isPregnant: false, pregnancyTicks: 0, pregnancyPartnerId: null,
        });
        this.game.world.addComponent(childId, 'renderable', {
          sprite: null, layer: 10, animFrame: 0, visible: true,
        });
      }
    }
  }

  /** Compute delta stats (current - snapshot at fair start) */
  private computeDeltaStats(atStart: FairSeasonStats): FairSeasonStats {
    return {
      babiesBorn: this.seasonStats.babiesBorn - atStart.babiesBorn,
      couplesMet: this.seasonStats.couplesMet - atStart.couplesMet,
      couplesMarried: this.seasonStats.couplesMarried - atStart.couplesMarried,
      newCitizens: this.seasonStats.newCitizens - atStart.newCitizens,
      buildingsCompleted: this.seasonStats.buildingsCompleted - atStart.buildingsCompleted,
      buildingsUpgraded: this.seasonStats.buildingsUpgraded - atStart.buildingsUpgraded,
      citizensDied: this.seasonStats.citizensDied - atStart.citizensDied,
      resourcesGathered: this.seasonStats.resourcesGathered - atStart.resourcesGathered,
    };
  }

  /** Clean expired fair bonuses */
  private cleanExpiredBonuses(): void {
    const bonuses = this.game.state.fairBonuses;
    const tick = this.game.state.tick;
    for (const key of Object.keys(bonuses)) {
      if (bonuses[key].expiryTick !== Infinity && tick >= bonuses[key].expiryTick) {
        delete bonuses[key];
      }
    }
  }

  /** Which festival corresponds to which sub-season */
  private getFestivalForSeason(subSeason: number): FestivalType | null {
    switch (subSeason) {
      case Season.EARLY_SPRING: return 'planting_day';
      case Season.MID_SUMMER: return 'midsummer';
      case Season.EARLY_AUTUMN: return 'harvest_festival';
      case Season.EARLY_WINTER: return 'frost_fair';
      default: return null;
    }
  }

  /** Find a completed Town Hall */
  private findTownHall(): number | null {
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return null;

    for (const [id, bld] of buildings) {
      if (bld.type === BuildingType.TOWN_HALL && bld.completed) return id;
    }
    return null;
  }

  /** Check if a festival is currently active */
  isFestivalActive(): boolean {
    const fest = this.game.state.festival;
    return fest !== null && fest.ticksRemaining > 0;
  }

  /** Get the current fair phase (null if no active fair) */
  getFairPhase(): FestivalPhase | null {
    const fest = this.game.state.festival;
    if (!fest || fest.ticksRemaining <= 0) return null;
    return fest.phase;
  }

  /** Check if a specific festival effect is active (lingering bonus) */
  hasActiveEffect(type: FestivalType): boolean {
    return this.game.state.festival?.activeEffect === type;
  }

  /** Get fair bonus value (0 if not active) */
  getFairBonus(key: string): number {
    const bonus = this.game.state.fairBonuses[key];
    if (!bonus) return 0;
    if (bonus.expiryTick !== Infinity && this.game.state.tick >= bonus.expiryTick) return 0;
    return bonus.value;
  }

  getInternalState(): { celebrated: number[]; seasonStats: FairSeasonStats } {
    return {
      celebrated: [...this.celebratedThisYear],
      seasonStats: { ...this.seasonStats },
    };
  }

  setInternalState(s: { celebrated: number[]; seasonStats?: FairSeasonStats }): void {
    this.celebratedThisYear = new Set(s.celebrated);
    if (s.seasonStats) {
      this.seasonStats = { ...s.seasonStats };
    }
  }
}
