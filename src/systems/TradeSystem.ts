import type { Game } from '../Game';
import {
  BuildingType, ResourceType, TICKS_PER_YEAR,
  MERCHANT_VISIT_INTERVAL_MULT, MERCHANT_ARRIVAL_CHANCE,
  MERCHANT_WARES_COUNT, MERCHANT_WARES_MIN, MERCHANT_WARES_MAX,
  MERCHANT_WANTS_COUNT, MERCHANT_WANTS_MIN, MERCHANT_WANTS_MAX,
  MERCHANT_STAY_DURATION,
} from '../constants';
import { RESOURCE_DEFS } from '../data/ResourceDefs';

interface Merchant {
  arriving: number; // tick when merchant arrives
  departing: number; // tick when merchant leaves
  wares: Map<string, number>;
  wants: Map<string, number>;
  active: boolean;
}

export class TradeSystem {
  private game: Game;
  private merchant: Merchant | null = null;
  private lastVisit = 0;

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    const tick = this.game.state.tick;

    // Check for trading post
    const hasTradingPost = this.hasBuildingType(BuildingType.TRADING_POST);
    if (!hasTradingPost) return;

    // Merchant visits once per year (roughly)
    if (!this.merchant && tick - this.lastVisit > TICKS_PER_YEAR * MERCHANT_VISIT_INTERVAL_MULT) {
      if (this.game.rng.chance(MERCHANT_ARRIVAL_CHANCE)) {
        this.spawnMerchant(tick);
      }
    }

    // Handle active merchant
    if (this.merchant?.active) {
      if (tick >= this.merchant.departing) {
        this.merchant.active = false;
        this.merchant = null;
        this.game.eventBus.emit('merchant_departed', {});
      }
    }
  }

  private spawnMerchant(tick: number): void {
    const rng = this.game.rng;
    const wares = new Map<string, number>();
    const wants = new Map<string, number>();

    // Merchant brings random goods
    const possibleWares = [
      ResourceType.LOG, ResourceType.STONE, ResourceType.IRON,
      ResourceType.TOOL, ResourceType.COAT, ResourceType.FIREWOOD,
    ];

    for (let i = 0; i < MERCHANT_WARES_COUNT; i++) {
      const type = rng.pick(possibleWares);
      wares.set(type, rng.int(MERCHANT_WARES_MIN, MERCHANT_WARES_MAX));
    }

    // Merchant wants food or resources
    const possibleWants = [
      ResourceType.BERRIES, ResourceType.VENISON, ResourceType.FISH,
      ResourceType.LOG, ResourceType.LEATHER,
    ];

    for (let i = 0; i < MERCHANT_WANTS_COUNT; i++) {
      const type = rng.pick(possibleWants);
      wants.set(type, rng.int(MERCHANT_WANTS_MIN, MERCHANT_WANTS_MAX));
    }

    this.merchant = {
      arriving: tick,
      departing: tick + MERCHANT_STAY_DURATION,
      wares,
      wants,
      active: true,
    };

    this.lastVisit = tick;
    this.game.eventBus.emit('merchant_arrived', { wares, wants });
  }

  getMerchant(): Merchant | null {
    return this.merchant;
  }

  getInternalState(): { merchant: any; lastVisit: number } {
    let m: any = null;
    if (this.merchant) {
      m = {
        arriving: this.merchant.arriving,
        departing: this.merchant.departing,
        wares: [...this.merchant.wares],
        wants: [...this.merchant.wants],
        active: this.merchant.active,
      };
    }
    return { merchant: m, lastVisit: this.lastVisit };
  }

  setInternalState(s: { merchant: any; lastVisit: number }): void {
    this.lastVisit = s.lastVisit;
    if (s.merchant) {
      this.merchant = {
        arriving: s.merchant.arriving,
        departing: s.merchant.departing,
        wares: new Map(s.merchant.wares),
        wants: new Map(s.merchant.wants),
        active: s.merchant.active,
      };
    } else {
      this.merchant = null;
    }
  }

  /** Execute a trade: give `give` resources, receive `receive` resources */
  executeTrade(giveType: string, giveAmount: number, receiveType: string, receiveAmount: number): boolean {
    if (!this.merchant?.active) return false;

    // Check player has resources
    if (this.game.getResource(giveType) < giveAmount) return false;

    // Check merchant has resources
    const merchantHas = this.merchant.wares.get(receiveType) || 0;
    if (merchantHas < receiveAmount) return false;

    // Execute trade
    this.game.removeResource(giveType, giveAmount);
    this.game.addResource(receiveType, receiveAmount);
    this.merchant.wares.set(receiveType, merchantHas - receiveAmount);

    return true;
  }

  private hasBuildingType(type: string): boolean {
    const buildings = this.game.world.getComponentStore<any>('building');
    if (!buildings) return false;
    for (const [, bld] of buildings) {
      if (bld.type === type && bld.completed) return true;
    }
    return false;
  }
}
