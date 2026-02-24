import { FairRewardDef } from '../types';
import {
  BuildingType, ResourceType, YEAR,
  ROAD_SETTLEMENT_MIN_TOTAL_FOOD, ROAD_SETTLEMENT_MIN_FOOD_MONTHS,
  IMMIGRATION_FOOD_PER_PERSON_PER_MONTH,
} from '../constants';

/**
 * Check if the town can support new settlers — same gates as the immigration
 * system: free housing, minimum food, and food-month supply.
 */
function canSupportSettlers(game: any, count: number): boolean {
  // Free housing slots
  const houses = game.world.getComponentStore('house');
  let freeSlots = 0;
  if (houses) {
    for (const [houseId, house] of houses) {
      const bld = game.world.getComponent(houseId, 'building');
      if (!bld?.completed) continue;
      const max = (house as any).maxResidents || 0;
      const occ = (house as any).residents?.length || 0;
      freeSlots += Math.max(0, max - occ);
    }
  }
  if (freeSlots < count) return false;

  // Minimum food
  const totalFood = game.getTotalFood();
  if (totalFood < ROAD_SETTLEMENT_MIN_TOTAL_FOOD) return false;

  // Food months
  const projectedPop = Math.max(1, game.state.population + count);
  const foodMonths = totalFood / (projectedPop * IMMIGRATION_FOOD_PER_PERSON_PER_MONTH);
  if (foodMonths < ROAD_SETTLEMENT_MIN_FOOD_MONTHS) return false;

  return true;
}

/**
 * Fair reward pool (~25 entries).
 *
 * Categories:
 *  - building:   Special buildings placed near town hall
 *  - traveler:   Skilled visitors that can be recruited as citizens
 *  - knowledge:  Timed bonuses lasting ~1 year
 *  - resources:  Immediate resource bundles
 *
 * `applyFn` keys are dispatched by FestivalSystem.applyReward().
 * `condition` functions receive the Game instance — return false to exclude the reward.
 * `weight` controls selection probability (higher = more common).
 * `flavorText` provides narrative context for how the reward was obtained.
 */
export const FAIR_REWARD_DEFS: FairRewardDef[] = [
  // ── Special Buildings ──────────────────────────────────────────
  {
    id: 'statue_of_founders',
    name: 'Statue of the Founders',
    description: 'A monument that inspires citizens. +2 happiness/tick for nearby residents.',
    flavorText: 'The village elders pooled their savings to commission a stone carving of the original settlers who first braved these wilds.',
    category: 'building',
    weight: 3,
    applyFn: 'building_statue',
    icon: '\u2694',
  },
  {
    id: 'herb_garden',
    name: 'Herb Garden',
    description: 'A cultivated garden that produces 1 herb per day passively.',
    flavorText: 'A visiting herbalist was so impressed by the fair that she planted a collection of rare medicinal seeds before departing.',
    category: 'building',
    weight: 3,
    applyFn: 'building_herb_garden',
    icon: '\u2698',
  },
  {
    id: 'festival_pavilion',
    name: 'Festival Pavilion',
    description: 'Doubles happiness gained at future fairs.',
    flavorText: 'Inspired by the festivities, the village carpenters have drawn up plans for a permanent gathering place with a roof of woven branches.',
    category: 'building',
    weight: 2,
    applyFn: 'building_pavilion',
    icon: '\u2302',
  },

  // ── Skilled Travelers ──────────────────────────────────────────
  {
    id: 'traveling_farmer',
    name: 'Traveling Farmer',
    description: 'An experienced farmer (Level 3 farming) joins your settlement.',
    flavorText: 'A weathered farmer passing through was drawn in by the smell of fresh bread and the sound of laughter. He offers his expertise in exchange for a place to call home.',
    category: 'traveler',
    weight: 4,
    applyFn: 'traveler_farmer',
    icon: 'F',
    condition: (game: any) => game.state.population >= 5 && canSupportSettlers(game, 1),
  },
  {
    id: 'wandering_blacksmith',
    name: 'Wandering Blacksmith',
    description: 'A skilled blacksmith (Level 3 mining) joins, bringing 10 tools.',
    flavorText: 'A blacksmith whose forge was lost to a wildfire heard tales of your growing settlement. She arrives with her best tools and a lifetime of skill.',
    category: 'traveler',
    weight: 3,
    applyFn: 'traveler_blacksmith',
    icon: 'S',
    condition: (game: any) => game.state.population >= 8 && canSupportSettlers(game, 1),
  },
  {
    id: 'herbalist_apprentice',
    name: "Herbalist's Apprentice",
    description: 'A disease-immune herbalist (Level 2 gathering) joins your village.',
    flavorText: 'A young apprentice, trained in the old remedies and hardened by years of tending the sick, has been searching for a community that values her knowledge.',
    category: 'traveler',
    weight: 3,
    applyFn: 'traveler_herbalist',
    icon: '+',
    condition: (game: any) => game.state.population >= 5 && canSupportSettlers(game, 1),
  },
  {
    id: 'retired_soldier',
    name: 'Retired Soldier',
    description: 'A hardworking laborer with high health and the Hardworking trait.',
    flavorText: 'An old campaigner, tired of marching and fighting, watched your people celebrate and saw something worth staying for. His strong back is yours.',
    category: 'traveler',
    weight: 4,
    applyFn: 'traveler_soldier',
    icon: 'R',
    condition: (game: any) => game.state.population >= 5 && canSupportSettlers(game, 1),
  },
  {
    id: 'traveling_family',
    name: 'Traveling Family',
    description: 'A married couple and their child seek a new home.',
    flavorText: 'A small family, displaced by drought in the south, arrived just as the fair began. The child tugged at their parents\' sleeves and said, "Can we stay here?"',
    category: 'traveler',
    weight: 3,
    applyFn: 'traveler_family',
    icon: '\u2665',
    condition: (game: any) => game.state.population >= 5 && canSupportSettlers(game, 3),
  },

  // ── Knowledge Unlocks ──────────────────────────────────────────
  {
    id: 'crop_rotation',
    name: 'Crop Rotation',
    description: '+20% crop yield for 1 year.',
    flavorText: 'An elderly visitor shared a farming technique passed down through generations: alternating crops between fields to keep the soil rich.',
    category: 'knowledge',
    weight: 5,
    applyFn: 'knowledge_crop_rotation',
    icon: '\u2618',
    festivalTypes: ['planting_day', 'harvest_festival'],
    condition: (game: any) => {
      const buildings = game.world.getComponentStore('building');
      if (!buildings) return false;
      for (const [, bld] of buildings) {
        if ((bld as any).type === BuildingType.CROP_FIELD && (bld as any).completed) return true;
      }
      return false;
    },
  },
  {
    id: 'preservation_methods',
    name: 'Preservation Methods',
    description: '-50% food spoilage for 1 year.',
    flavorText: 'A merchant demonstrated a salt-curing technique over the bonfire, and by morning half the village had learned the trick.',
    category: 'knowledge',
    weight: 5,
    applyFn: 'knowledge_preservation',
    icon: '\u2744',
    festivalTypes: ['harvest_festival', 'frost_fair'],
  },
  {
    id: 'winter_insulation',
    name: 'Winter Insulation',
    description: '-30% firewood consumption for 1 year.',
    flavorText: 'A traveler from the northern reaches showed how packing moss and clay between wall timbers keeps the cold at bay.',
    category: 'knowledge',
    weight: 5,
    applyFn: 'knowledge_insulation',
    icon: '\u2302',
    festivalTypes: ['frost_fair', 'harvest_festival'],
  },
  {
    id: 'herbal_remedy',
    name: 'Herbal Remedy',
    description: '2x disease cure rate for 1 year.',
    flavorText: 'A wandering healer shared recipes for poultices that draw out fever and soothe aching joints. Your herbalist copied them eagerly.',
    category: 'knowledge',
    weight: 4,
    applyFn: 'knowledge_herbal_remedy',
    icon: '+',
    condition: (game: any) => {
      const buildings = game.world.getComponentStore('building');
      if (!buildings) return false;
      for (const [, bld] of buildings) {
        if ((bld as any).type === BuildingType.HERBALIST && (bld as any).completed) return true;
      }
      return false;
    },
  },
  {
    id: 'fishing_nets',
    name: 'Fishing Nets',
    description: '+50% fish production for 1 year.',
    flavorText: 'A coastal fisherman, stranded inland by a broken cart wheel, repaid the village\'s hospitality by weaving fine-mesh nets from river reeds.',
    category: 'knowledge',
    weight: 4,
    applyFn: 'knowledge_fishing_nets',
    icon: '~',
    festivalTypes: ['midsummer', 'planting_day'],
    condition: (game: any) => {
      const buildings = game.world.getComponentStore('building');
      if (!buildings) return false;
      for (const [, bld] of buildings) {
        if ((bld as any).type === BuildingType.FISHING_DOCK && (bld as any).completed) return true;
      }
      return false;
    },
  },
  {
    id: 'masonry_techniques',
    name: 'Masonry Techniques',
    description: '+25% construction speed for 1 year.',
    flavorText: 'During the fair, two stonemasons debated the merits of dry-stacking versus mortar. The village builders, listening intently, learned from both.',
    category: 'knowledge',
    weight: 5,
    applyFn: 'knowledge_masonry',
    icon: 'B',
  },

  // ── Resource Bundles ───────────────────────────────────────────
  {
    id: 'merchants_surplus',
    name: "Merchant's Surplus",
    description: 'Receive 50 logs, 30 stone, and 10 iron.',
    flavorText: 'A merchant caravan, unable to sell their heavy goods at the next town over, offered the village a generous deal on surplus materials.',
    category: 'resources',
    weight: 8,
    applyFn: 'resources_merchants_surplus',
    icon: '\u2692',
  },
  {
    id: 'winter_provisions',
    name: 'Winter Provisions',
    description: 'Receive 30 berries, 20 venison, 15 fish, and 15 bread.',
    flavorText: 'The fair drew hunters and foragers from the surrounding woods, who bartered their surplus catch for the warmth of company and hot cider.',
    category: 'resources',
    weight: 8,
    applyFn: 'resources_winter_provisions',
    icon: 'W',
    festivalTypes: ['harvest_festival', 'frost_fair'],
  },
  {
    id: 'tool_shipment',
    name: 'Tool Shipment',
    description: 'Receive 8 tools and 5 coats.',
    flavorText: 'A peddler, grateful for the village\'s warm welcome, offered his finest wares at cost: sturdy iron tools and thick woolen coats.',
    category: 'resources',
    weight: 7,
    applyFn: 'resources_tool_shipment',
    icon: 'T',
  },
  {
    id: 'rare_seeds',
    name: 'Rare Seeds',
    description: 'Receive 40 wheat, 30 cabbage, and 20 potatoes.',
    flavorText: 'A seed trader spread her wares on a blanket and swapped stories with the farmers. By evening, she had traded away half her stock for promises of future harvests.',
    category: 'resources',
    weight: 7,
    applyFn: 'resources_rare_seeds',
    icon: '\u2618',
    festivalTypes: ['planting_day', 'midsummer'],
  },
  {
    id: 'firewood_stockpile',
    name: 'Firewood Stockpile',
    description: 'Receive 60 firewood.',
    flavorText: 'A woodcutter from the hills brought three cartloads of seasoned oak, saying he\'d rather see it burned in hearths than rot in his yard.',
    category: 'resources',
    weight: 8,
    applyFn: 'resources_firewood_stockpile',
    icon: '\u2668',
    festivalTypes: ['frost_fair', 'harvest_festival'],
  },
  {
    id: 'feast_supplies',
    name: 'Feast Supplies',
    description: 'Receive 15 bread, 10 fish stew, 10 berry pie, and 10 vegetable soup.',
    flavorText: 'The fair cooks outdid themselves, and the surplus from the feast day was carefully stored away for the weeks ahead.',
    category: 'resources',
    weight: 7,
    applyFn: 'resources_feast_supplies',
    icon: 'F',
  },

  // ── Additional Knowledge ───────────────────────────────────────
  {
    id: 'animal_husbandry',
    name: 'Animal Husbandry',
    description: '+30% livestock production for 1 year.',
    flavorText: 'A shepherd passing through shared breeding secrets that have kept his flock thriving for decades. Your herdsmen took careful notes.',
    category: 'knowledge',
    weight: 4,
    applyFn: 'knowledge_animal_husbandry',
    icon: 'A',
    condition: (game: any) => {
      const buildings = game.world.getComponentStore('building');
      if (!buildings) return false;
      for (const [, bld] of buildings) {
        const t = (bld as any).type;
        if ((t === BuildingType.CHICKEN_COOP || t === BuildingType.PASTURE) && (bld as any).completed) return true;
      }
      return false;
    },
  },
];

/** Lookup map for quick access by id */
export const FAIR_REWARD_MAP = new Map<string, FairRewardDef>(
  FAIR_REWARD_DEFS.map(r => [r.id, r]),
);

/** Knowledge reward bonus keys and their default values/durations */
export const KNOWLEDGE_BONUS_CONFIG: Record<string, { key: string; value: number; duration: number }> = {
  knowledge_crop_rotation:    { key: 'cropRotation',     value: 0.20, duration: YEAR },
  knowledge_preservation:     { key: 'preservation',     value: 0.50, duration: YEAR },
  knowledge_insulation:       { key: 'insulation',       value: 0.30, duration: YEAR },
  knowledge_herbal_remedy:    { key: 'herbalRemedy',     value: 2.0,  duration: YEAR },
  knowledge_fishing_nets:     { key: 'fishingNets',      value: 0.50, duration: YEAR },
  knowledge_masonry:          { key: 'masonry',           value: 0.25, duration: YEAR },
  knowledge_animal_husbandry: { key: 'animalHusbandry',  value: 0.30, duration: YEAR },
};
