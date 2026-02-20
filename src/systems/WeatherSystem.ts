import type { Game } from '../Game';
import {
  WEATHER_CHECK_INTERVAL, STORM_CHANCE, DROUGHT_CHANCE, HARSH_WINTER_CHANCE,
  STORM_DURATION_TICKS, STORM_BUILDING_DAMAGE, STORM_CROP_DAMAGE,
  DROUGHT_DURATION_TICKS, DROUGHT_CROP_MULT, BuildingType,
  STORM_WARMTH_DRAIN, HARSH_WINTER_WARMTH_DRAIN, STORM_CROP_WEATHER_MULT,
} from '../constants';
import { SEASON_DATA } from '../data/SeasonDefs';

export type WeatherEvent = 'clear' | 'storm' | 'drought' | 'harsh_winter';

export class WeatherSystem {
  private game: Game;
  private tickCounter = 0;

  currentWeather: WeatherEvent = 'clear';
  weatherTimer = 0;

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    this.tickCounter++;

    // Active weather event
    if (this.currentWeather !== 'clear') {
      this.weatherTimer--;
      this.applyWeatherEffects();

      if (this.weatherTimer <= 0) {
        const prev = this.currentWeather;
        this.currentWeather = 'clear';
        this.game.eventBus.emit('weather_cleared', { previous: prev });
      }
      return;
    }

    // Check for new weather events
    if (this.tickCounter % WEATHER_CHECK_INTERVAL !== 0) return;

    const seasonData = SEASON_DATA[this.game.state.subSeason];
    const subSeason = this.game.state.subSeason;

    // Storms can happen any season
    if (this.game.rng.chance(STORM_CHANCE)) {
      this.currentWeather = 'storm';
      this.weatherTimer = STORM_DURATION_TICKS;
      this.game.eventBus.emit('weather_started', { type: 'storm' });
      return;
    }

    // Drought only in summer (sub-seasons 3-5)
    if (subSeason >= 3 && subSeason <= 5 && this.game.rng.chance(DROUGHT_CHANCE)) {
      this.currentWeather = 'drought';
      this.weatherTimer = DROUGHT_DURATION_TICKS;
      this.game.eventBus.emit('weather_started', { type: 'drought' });
      return;
    }

    // Harsh winter snap (sub-seasons 9-11)
    if (subSeason >= 9 && subSeason <= 11 && this.game.rng.chance(HARSH_WINTER_CHANCE)) {
      this.currentWeather = 'harsh_winter';
      this.weatherTimer = STORM_DURATION_TICKS;
      this.game.eventBus.emit('weather_started', { type: 'harsh_winter' });
      return;
    }
  }

  private applyWeatherEffects(): void {
    const world = this.game.world;

    if (this.currentWeather === 'storm') {
      // Damage buildings slightly
      const buildings = world.getComponentStore<any>('building');
      if (buildings) {
        for (const [, bld] of buildings) {
          if (!bld.completed) continue;
          if (bld.durability === undefined) bld.durability = 100;
          bld.durability = Math.max(0, bld.durability - STORM_BUILDING_DAMAGE);
        }
      }

      // Damage crops
      const producers = world.getComponentStore<any>('producer');
      if (producers && buildings) {
        for (const [id, producer] of producers) {
          const bld = buildings.get(id);
          if (bld?.type === BuildingType.CROP_FIELD) {
            producer.timer = Math.max(0, producer.timer - STORM_CROP_DAMAGE);
          }
        }
      }

      // Citizens outside lose warmth faster
      const entities = world.query('citizen', 'needs');
      for (const id of entities) {
        const needs = world.getComponent<any>(id, 'needs')!;
        const citizen = world.getComponent<any>(id, 'citizen');
        if (!citizen?.isSleeping) { // Only if not sheltered
          needs.warmth = Math.max(0, needs.warmth - STORM_WARMTH_DRAIN);
        }
      }
    }

    if (this.currentWeather === 'harsh_winter') {
      // Extra warmth drain for everyone
      const entities = world.query('citizen', 'needs');
      for (const id of entities) {
        const needs = world.getComponent<any>(id, 'needs')!;
        needs.warmth = Math.max(0, needs.warmth - HARSH_WINTER_WARMTH_DRAIN);
      }
    }

    // Drought effect is handled by ProductionSystem checking weatherSystem.currentWeather
  }

  getInternalState(): { tickCounter: number; currentWeather: string; weatherTimer: number } {
    return { tickCounter: this.tickCounter, currentWeather: this.currentWeather, weatherTimer: this.weatherTimer };
  }

  setInternalState(s: { tickCounter: number; currentWeather: string; weatherTimer: number }): void {
    this.tickCounter = s.tickCounter;
    this.currentWeather = s.currentWeather as WeatherEvent;
    this.weatherTimer = s.weatherTimer;
  }

  /** Get crop growth multiplier from current weather */
  getCropWeatherMult(): number {
    if (this.currentWeather === 'drought') return DROUGHT_CROP_MULT;
    if (this.currentWeather === 'storm') return STORM_CROP_WEATHER_MULT;
    return 1.0;
  }
}
