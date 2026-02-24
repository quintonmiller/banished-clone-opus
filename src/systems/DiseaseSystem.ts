import type { Game } from '../Game';
import {
  DISEASE_BASE_CHANCE, DISEASE_SPREAD_RADIUS, DISEASE_SPREAD_CHANCE,
  DISEASE_HEALTH_DAMAGE, DISEASE_DURATION_TICKS,
  HERBALIST_CURE_RADIUS, HERBALIST_CURE_CHANCE, DISEASE_IMMUNITY_TICKS,
  BuildingType, ResourceType,
  DISEASE_TICK_INTERVAL, DISEASE_ENERGY_DRAIN,
  DISEASE_MALNUTRITION_THRESHOLD, DISEASE_MALNUTRITION_MULT,
  DISEASE_COLD_THRESHOLD, DISEASE_COLD_MULT,
  DISEASE_WEAK_THRESHOLD, DISEASE_WEAK_MULT,
  FROST_FAIR_DISEASE_MULT,
  BATHE_DISEASE_SPREAD_MULT, BATHE_CLEAN_DURATION_TICKS,
} from '../constants';
import { distance } from '../utils/MathUtils';

export class DiseaseSystem {
  private game: Game;
  private tickCounter = 0;

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    this.tickCounter++;
    // Run every N ticks for performance
    if (this.tickCounter % DISEASE_TICK_INTERVAL !== 0) return;

    const world = this.game.world;
    const entities = world.query('citizen', 'needs', 'position');

    for (const id of entities) {
      const needs = world.getComponent<any>(id, 'needs')!;
      const citizen = world.getComponent<any>(id, 'citizen')!;

      // Initialize disease fields
      if (needs.isSick === undefined) needs.isSick = false;
      if (needs.diseaseTicks === undefined) needs.diseaseTicks = 0;
      if (needs.immunityTicks === undefined) needs.immunityTicks = 0;

      // Count down immunity
      if (needs.immunityTicks > 0) {
        needs.immunityTicks -= DISEASE_TICK_INTERVAL;
      }

      if (needs.isSick) {
        // Disease progression
        needs.diseaseTicks += DISEASE_TICK_INTERVAL;
        needs.health -= DISEASE_HEALTH_DAMAGE * DISEASE_TICK_INTERVAL;

        // Disease reduces energy faster
        if (needs.energy !== undefined) {
          needs.energy = Math.max(0, needs.energy - DISEASE_ENERGY_DRAIN * DISEASE_TICK_INTERVAL);
        }

        // Natural recovery after duration
        if (needs.diseaseTicks >= DISEASE_DURATION_TICKS) {
          this.cureCitizen(needs);
        }

        // Spread to nearby citizens
        this.trySpreadDisease(id);
      } else {
        // Chance to get sick — higher when malnourished or cold
        if (needs.immunityTicks <= 0) {
          let sickChance = DISEASE_BASE_CHANCE * DISEASE_TICK_INTERVAL;
          if (needs.food < DISEASE_MALNUTRITION_THRESHOLD) sickChance *= DISEASE_MALNUTRITION_MULT;
          if (needs.warmth < DISEASE_COLD_THRESHOLD) sickChance *= DISEASE_COLD_MULT;
          if (needs.health < DISEASE_WEAK_THRESHOLD) sickChance *= DISEASE_WEAK_MULT;

          // Frost Fair festival effect — reduce disease chance
          if (this.game.festivalSystem.hasActiveEffect('frost_fair')) {
            sickChance *= FROST_FAIR_DISEASE_MULT;
          }

          if (Math.random() < sickChance) {
            needs.isSick = true;
            needs.diseaseTicks = 0;
            this.game.eventBus.emit('citizen_sick', {
              id,
              name: citizen.name,
            });
          }
        }
      }
    }

    // Herbalist treatment
    this.applyHerbalistCures();
  }

  getInternalState(): { tickCounter: number } {
    return { tickCounter: this.tickCounter };
  }

  setInternalState(s: { tickCounter: number }): void {
    this.tickCounter = s.tickCounter;
  }

  private trySpreadDisease(sickId: number): void {
    const world = this.game.world;
    const sickPos = world.getComponent<any>(sickId, 'position')!;
    const entities = world.query('citizen', 'needs', 'position');

    for (const id of entities) {
      if (id === sickId) continue;
      const needs = world.getComponent<any>(id, 'needs')!;
      if (needs.isSick || needs.immunityTicks > 0) continue;

      const pos = world.getComponent<any>(id, 'position')!;
      const d = distance(sickPos.tileX, sickPos.tileY, pos.tileX, pos.tileY);
      if (d <= DISEASE_SPREAD_RADIUS) {
        const citizen = world.getComponent<any>(id, 'citizen');
        const isClean = citizen?.lastBatheTick !== undefined
          && (this.game.state.tick - citizen.lastBatheTick) < BATHE_CLEAN_DURATION_TICKS;
        const spreadChance = DISEASE_SPREAD_CHANCE * DISEASE_TICK_INTERVAL
          * (isClean ? BATHE_DISEASE_SPREAD_MULT : 1.0);
        if (Math.random() < spreadChance) {
          needs.isSick = true;
          needs.diseaseTicks = 0;
          this.game.eventBus.emit('citizen_sick', {
            id,
            name: citizen?.name || 'Unknown',
          });
        }
      }
    }
  }

  private applyHerbalistCures(): void {
    const world = this.game.world;
    const buildings = world.getComponentStore<any>('building');
    if (!buildings) return;

    for (const [bldId, bld] of buildings) {
      if (bld.type !== BuildingType.HERBALIST || !bld.completed) continue;
      if (this.game.getResource(ResourceType.HERBS) <= 0) continue;

      // Check if herbalist has workers
      const hasWorkers = bld.assignedWorkers && bld.assignedWorkers.length > 0;
      if (!hasWorkers) continue;

      const bPos = world.getComponent<any>(bldId, 'position');
      if (!bPos) continue;

      const cx = bPos.tileX + Math.floor(bld.width / 2);
      const cy = bPos.tileY + Math.floor(bld.height / 2);

      const entities = world.query('citizen', 'needs', 'position');
      for (const id of entities) {
        const needs = world.getComponent<any>(id, 'needs')!;
        if (!needs.isSick) continue;

        const pos = world.getComponent<any>(id, 'position')!;
        const d = distance(cx, cy, pos.tileX, pos.tileY);
        if (d <= HERBALIST_CURE_RADIUS) {
          let cureRate = HERBALIST_CURE_CHANCE * DISEASE_TICK_INTERVAL;
          const herbalBonus = this.game.festivalSystem.getFairBonus('herbalRemedy');
          if (herbalBonus > 0) cureRate *= herbalBonus;
          if (Math.random() < cureRate) {
            this.game.removeResource(ResourceType.HERBS, 1);
            this.cureCitizen(needs);
            const citizen = world.getComponent<any>(id, 'citizen');
            this.game.eventBus.emit('citizen_cured', {
              id,
              name: citizen?.name || 'Unknown',
            });
          }
        }
      }
    }
  }

  private cureCitizen(needs: any): void {
    needs.isSick = false;
    needs.diseaseTicks = 0;
    needs.immunityTicks = DISEASE_IMMUNITY_TICKS;
  }
}
