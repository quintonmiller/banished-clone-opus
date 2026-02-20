import type { Game } from '../Game';
import {
  MILESTONE_CHECK_INTERVAL, NARRATIVE_EVENT_CHANCE, NARRATIVE_EVENT_INTERVAL,
  MilestoneId, BuildingType, Season,
} from '../constants';

interface MilestoneDef {
  id: MilestoneId;
  name: string;
  description: string;
  bonus: string;           // human-readable bonus description
  bonusType: string;       // machine key for applying effect
  bonusValue: number;
}

const MILESTONES: MilestoneDef[] = [
  {
    id: MilestoneId.FIRST_HOUSE,
    name: 'First Shelter',
    description: 'Built the first house.',
    bonus: '+2% gathering speed',
    bonusType: 'gathering_speed',
    bonusValue: 0.02,
  },
  {
    id: MilestoneId.FIRST_WINTER,
    name: 'Winter Survivors',
    description: 'Survived the first winter with no deaths.',
    bonus: '+1 baseline happiness',
    bonusType: 'happiness_baseline',
    bonusValue: 1,
  },
  {
    id: MilestoneId.POP_10,
    name: 'Growing Village',
    description: 'Population reached 10.',
    bonus: '+2% work speed',
    bonusType: 'work_speed',
    bonusValue: 0.02,
  },
  {
    id: MilestoneId.POP_20,
    name: 'Thriving Settlement',
    description: 'Population reached 20.',
    bonus: '+3% work speed',
    bonusType: 'work_speed',
    bonusValue: 0.03,
  },
  {
    id: MilestoneId.POP_50,
    name: 'Bustling Town',
    description: 'Population reached 50.',
    bonus: '+5% work speed',
    bonusType: 'work_speed',
    bonusValue: 0.05,
  },
  {
    id: MilestoneId.FIRST_TRADE,
    name: 'Open for Business',
    description: 'Completed the first trade.',
    bonus: '+10% trade value',
    bonusType: 'trade_value',
    bonusValue: 0.1,
  },
  {
    id: MilestoneId.FIRST_HARVEST,
    name: 'Reaping Rewards',
    description: 'Harvested the first crop.',
    bonus: '+5% crop growth',
    bonusType: 'crop_growth',
    bonusValue: 0.05,
  },
  {
    id: MilestoneId.FIRST_BIRTH,
    name: 'New Generation',
    description: 'A child was born in the village.',
    bonus: '+1 baseline happiness',
    bonusType: 'happiness_baseline',
    bonusValue: 1,
  },
  {
    id: MilestoneId.FIRST_SCHOOL,
    name: 'Pursuit of Knowledge',
    description: 'Built a school and educated citizens.',
    bonus: '+3% education bonus',
    bonusType: 'education',
    bonusValue: 0.03,
  },
  {
    id: MilestoneId.SELF_SUFFICIENT,
    name: 'Self-Sufficient',
    description: 'Have all food types, tools, coats, and firewood.',
    bonus: '+5% all production',
    bonusType: 'all_production',
    bonusValue: 0.05,
  },
];

interface NarrativeEventDef {
  text: (citizenName: string) => string;
  effect: 'happiness' | 'food' | 'resource' | 'skill';
  value: number;
  resourceType?: string;
}

const NARRATIVE_EVENTS: NarrativeEventDef[] = [
  { text: (n) => `${n} found wild berries while wandering`, effect: 'food', value: 15 },
  { text: (n) => `${n} discovered an old map near the river`, effect: 'happiness', value: 5 },
  { text: (n) => `${n} spotted a deer trail in the forest`, effect: 'food', value: 10 },
  { text: (n) => `${n} found useful stones while clearing land`, effect: 'resource', value: 8, resourceType: 'stone' },
  { text: (n) => `${n} told a wonderful story by the fire`, effect: 'happiness', value: 8 },
  { text: (n) => `${n} found iron scraps near the riverbed`, effect: 'resource', value: 3, resourceType: 'iron' },
  { text: (n) => `${n} caught extra fish on a lucky day`, effect: 'resource', value: 6, resourceType: 'fish' },
  { text: (n) => `${n} helped a neighbor repair their roof`, effect: 'happiness', value: 4 },
  { text: (n) => `${n} found a patch of medicinal herbs`, effect: 'resource', value: 4, resourceType: 'herbs' },
  { text: (n) => `${n} taught the children a new game`, effect: 'happiness', value: 6 },
];

export class MilestoneSystem {
  private game: Game;
  private tickCounter = 0;
  private achieved = new Set<string>();
  private bonuses = new Map<string, number>();  // bonusType -> accumulated value
  private lastNarrativeTick = 0;
  private deathsBeforeFirstWinter = 0;
  private passedFirstWinter = false;

  constructor(game: Game) {
    this.game = game;

    // Listen for events that trigger milestones
    this.game.eventBus.on('citizen_born', () => this.checkMilestone(MilestoneId.FIRST_BIRTH));
    this.game.eventBus.on('trade_completed', () => this.checkMilestone(MilestoneId.FIRST_TRADE));
    this.game.eventBus.on('citizen_died', () => {
      if (!this.passedFirstWinter) this.deathsBeforeFirstWinter++;
    });
  }

  update(): void {
    this.tickCounter++;
    if (this.tickCounter % MILESTONE_CHECK_INTERVAL !== 0) return;

    // Check population milestones
    if (this.game.state.population >= 10) this.checkMilestone(MilestoneId.POP_10);
    if (this.game.state.population >= 20) this.checkMilestone(MilestoneId.POP_20);
    if (this.game.state.population >= 50) this.checkMilestone(MilestoneId.POP_50);

    // First house
    if (this.hasCompletedBuilding(BuildingType.WOODEN_HOUSE)) {
      this.checkMilestone(MilestoneId.FIRST_HOUSE);
    }

    // First school with educated citizen
    if (this.hasCompletedBuilding(BuildingType.SCHOOL)) {
      const citizens = this.game.world.getComponentStore<any>('citizen');
      if (citizens) {
        for (const [, cit] of citizens) {
          if (cit.isEducated) {
            this.checkMilestone(MilestoneId.FIRST_SCHOOL);
            break;
          }
        }
      }
    }

    // First harvest (check if any wheat was ever produced)
    if (this.game.getResource('wheat') > 0 || this.game.getResource('cabbage') > 0) {
      this.checkMilestone(MilestoneId.FIRST_HARVEST);
    }

    // First winter survived (check at end of late winter)
    if (!this.passedFirstWinter && this.game.state.year >= 2 && this.game.state.subSeason === Season.EARLY_SPRING) {
      this.passedFirstWinter = true;
      if (this.deathsBeforeFirstWinter === 0) {
        this.checkMilestone(MilestoneId.FIRST_WINTER);
      }
    }

    // Self-sufficient check
    const hasFoodTypes = this.game.getResource('berries') > 0 &&
      this.game.getResource('venison') > 0 &&
      this.game.getResource('fish') > 0;
    const hasGoods = this.game.getResource('tool') > 0 &&
      this.game.getResource('coat') > 0 &&
      this.game.getResource('firewood') > 0;
    if (hasFoodTypes && hasGoods) {
      this.checkMilestone(MilestoneId.SELF_SUFFICIENT);
    }

    // Random narrative events
    if (this.game.state.tick - this.lastNarrativeTick > NARRATIVE_EVENT_INTERVAL) {
      if (this.game.rng.chance(NARRATIVE_EVENT_CHANCE)) {
        this.triggerNarrativeEvent();
      }
    }
  }

  private checkMilestone(id: MilestoneId): void {
    if (this.achieved.has(id)) return;
    this.achieved.add(id);

    const def = MILESTONES.find(m => m.id === id);
    if (!def) return;

    // Accumulate bonus
    const current = this.bonuses.get(def.bonusType) || 0;
    this.bonuses.set(def.bonusType, current + def.bonusValue);

    // Emit event for UI
    this.game.eventBus.emit('milestone_achieved', {
      id: def.id,
      name: def.name,
      description: def.description,
      bonus: def.bonus,
    });
  }

  private triggerNarrativeEvent(): void {
    this.lastNarrativeTick = this.game.state.tick;

    // Pick a random living citizen
    const citizens = this.game.world.getComponentStore<any>('citizen');
    if (!citizens || citizens.size === 0) return;

    const citizenEntries = [...citizens.entries()];
    const [citizenId, citizen] = this.game.rng.pick(citizenEntries);
    if (!citizen || citizen.isChild) return;

    const event = this.game.rng.pick(NARRATIVE_EVENTS);
    const text = event.text(citizen.name);

    // Apply effect
    switch (event.effect) {
      case 'happiness': {
        const needs = this.game.world.getComponent<any>(citizenId, 'needs');
        if (needs) needs.happiness = Math.min(100, needs.happiness + event.value);
        break;
      }
      case 'food': {
        this.game.addResource('berries', event.value);
        break;
      }
      case 'resource': {
        if (event.resourceType) {
          this.game.addResource(event.resourceType, event.value);
        }
        break;
      }
    }

    this.game.eventBus.emit('narrative_event', { text, citizenId });
  }

  /** Get accumulated bonus value for a bonus type */
  getBonus(bonusType: string): number {
    return this.bonuses.get(bonusType) || 0;
  }

  /** Get all achieved milestones for display */
  getAchievedMilestones(): Array<{ id: string; name: string; description: string; bonus: string }> {
    return MILESTONES
      .filter(m => this.achieved.has(m.id))
      .map(m => ({ id: m.id, name: m.name, description: m.description, bonus: m.bonus }));
  }

  getInternalState(): { achieved: string[]; bonuses: [string, number][]; lastNarrativeTick: number; deathsBeforeFirstWinter: number; passedFirstWinter: boolean } {
    return {
      achieved: [...this.achieved],
      bonuses: [...this.bonuses],
      lastNarrativeTick: this.lastNarrativeTick,
      deathsBeforeFirstWinter: this.deathsBeforeFirstWinter,
      passedFirstWinter: this.passedFirstWinter,
    };
  }

  setInternalState(s: { achieved: string[]; bonuses: [string, number][]; lastNarrativeTick: number; deathsBeforeFirstWinter: number; passedFirstWinter: boolean }): void {
    this.achieved = new Set(s.achieved);
    this.bonuses = new Map(s.bonuses);
    this.lastNarrativeTick = s.lastNarrativeTick;
    this.deathsBeforeFirstWinter = s.deathsBeforeFirstWinter;
    this.passedFirstWinter = s.passedFirstWinter;
  }

  private hasCompletedBuilding(type: string): boolean {
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return false;
    for (const [, bld] of buildings) {
      if (bld.type === type && bld.completed) return true;
    }
    return false;
  }
}
