import type { Game } from '../Game';
import { FestivalType } from '../types';
import {
  BuildingType, Season,
  FESTIVAL_DURATION_TICKS, FESTIVAL_HAPPINESS_BOOST,
  FESTIVAL_HAPPINESS_PER_TICK, FESTIVAL_GATHER_RADIUS,
  FESTIVAL_CHECK_TICKS,
} from '../constants';

/**
 * FestivalSystem — triggers seasonal festivals when a Town Hall exists.
 *
 * Festivals:
 *  - Planting Day (Early Spring)     → crop growth bonus for spring
 *  - Midsummer Celebration (Mid Summer) → happiness gain multiplier
 *  - Harvest Festival (Early Autumn) → reduced food spoilage
 *  - Frost Fair (Early Winter)       → reduced disease chance
 *
 * During a festival, citizens gather at the Town Hall, work stops, and
 * happiness ticks up for nearby citizens. Particle effects (lanterns) are
 * spawned by ParticleSystem when it detects an active festival.
 */
export class FestivalSystem {
  private game: Game;
  /** Set of sub-seasons that already had a festival this year (reset on new year) */
  private celebratedThisYear = new Set<number>();

  constructor(game: Game) {
    this.game = game;

    // Reset on new year
    this.game.eventBus.on('new_year', () => {
      this.celebratedThisYear.clear();
      // Clear any lingering festival effect
      if (this.game.state.festival) {
        this.game.state.festival.activeEffect = null;
      }
    });

    // Clear festival effect when season changes (effects last until end of the season group)
    this.game.eventBus.on('season_changed', (data: any) => {
      const fest = this.game.state.festival;
      if (fest?.activeEffect && data.subSeason % 3 === 0) {
        // Major season boundary — clear effect
        fest.activeEffect = null;
      }
    });
  }

  update(): void {
    const state = this.game.state;

    // If a festival is active, tick it down
    if (state.festival && state.festival.ticksRemaining > 0) {
      state.festival.ticksRemaining--;
      this.applyFestivalHappiness();

      if (state.festival.ticksRemaining <= 0) {
        // Festival ends — apply the lingering effect
        state.festival.activeEffect = state.festival.type;
        this.game.eventBus.emit('festival_ended', { type: state.festival.type });
      }
      return;
    }

    // Check if we should start a festival
    if (state.tickInSubSeason !== FESTIVAL_CHECK_TICKS) return;
    if (this.celebratedThisYear.has(state.subSeason)) return;

    const festivalType = this.getFestivalForSeason(state.subSeason);
    if (!festivalType) return;

    // Need a completed Town Hall
    const townHallId = this.findTownHall();
    if (townHallId === null) return;

    // Start the festival!
    this.celebratedThisYear.add(state.subSeason);
    state.festival = {
      type: festivalType,
      ticksRemaining: FESTIVAL_DURATION_TICKS,
      townHallId,
      activeEffect: null,
    };

    // Initial happiness boost to all citizens
    const needsStore = this.game.world.getComponentStore<any>('needs');
    if (needsStore) {
      for (const [, needs] of needsStore) {
        needs.happiness = Math.min(100, needs.happiness + FESTIVAL_HAPPINESS_BOOST);
      }
    }

    this.game.eventBus.emit('festival_started', { type: festivalType });
  }

  /** Apply per-tick happiness to citizens near the Town Hall */
  private applyFestivalHappiness(): void {
    const fest = this.game.state.festival;
    if (!fest) return;

    const thPos = this.game.world.getComponent<any>(fest.townHallId, 'position');
    if (!thPos) return;

    const cx = thPos.tileX + 2; // center of 5x5 building
    const cy = thPos.tileY + 2;

    const citizens = this.game.world.getComponentStore<any>('citizen');
    const positions = this.game.world.getComponentStore<any>('position');
    const needsStore = this.game.world.getComponentStore<any>('needs');
    if (!citizens || !positions || !needsStore) return;

    for (const [id] of citizens) {
      const pos = positions.get(id);
      const needs = needsStore.get(id);
      if (!pos || !needs) continue;

      const dx = Math.abs(pos.tileX - cx);
      const dy = Math.abs(pos.tileY - cy);
      if (dx <= FESTIVAL_GATHER_RADIUS && dy <= FESTIVAL_GATHER_RADIUS) {
        needs.happiness = Math.min(100, needs.happiness + FESTIVAL_HAPPINESS_PER_TICK);
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

  /** Check if a festival is currently active (used by other systems) */
  isFestivalActive(): boolean {
    const fest = this.game.state.festival;
    return fest !== null && fest.ticksRemaining > 0;
  }

  /** Check if a specific festival effect is active (lingering bonus) */
  hasActiveEffect(type: FestivalType): boolean {
    return this.game.state.festival?.activeEffect === type;
  }

  getInternalState(): { celebrated: number[] } {
    return { celebrated: [...this.celebratedThisYear] };
  }

  setInternalState(s: { celebrated: number[] }): void {
    this.celebratedThisYear = new Set(s.celebrated);
  }
}
