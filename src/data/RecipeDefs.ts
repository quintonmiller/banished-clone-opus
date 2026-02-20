import { BuildingType, ResourceType } from '../constants';
import { RecipeDef } from '../types';

// cooldownTicks = time for one production cycle at full efficiency
// At 10 ticks/sec and 1800 ticks/day: 180 ticks = 2.4 game-hours
export const RECIPE_DEFS: RecipeDef[] = [
  // Gathering Hut: foraging trip into surrounding forest
  {
    buildingType: BuildingType.GATHERING_HUT,
    inputs: {},
    outputs: { [ResourceType.BERRIES]: 3, [ResourceType.MUSHROOMS]: 2, [ResourceType.ROOTS]: 2 },
    cooldownTicks: 180,  // ~2.4h per trip (was 120)
    seasonalMultiplier: true,
    gatherFromRadius: true,
  },
  // Hunting Cabin: hunting expedition for deer
  {
    buildingType: BuildingType.HUNTING_CABIN,
    inputs: {},
    outputs: { [ResourceType.VENISON]: 5, [ResourceType.LEATHER]: 2 },
    cooldownTicks: 250,  // ~3.3h per expedition (was 150)
    seasonalMultiplier: true,
    gatherFromRadius: true,
  },
  // Fishing Dock: fishing trip
  {
    buildingType: BuildingType.FISHING_DOCK,
    inputs: {},
    outputs: { [ResourceType.FISH]: 5 },
    cooldownTicks: 150,  // ~2h per fishing trip (was 100)
  },
  // Forester Lodge: fell and haul trees
  {
    buildingType: BuildingType.FORESTER_LODGE,
    inputs: {},
    outputs: { [ResourceType.LOG]: 4 },
    cooldownTicks: 180,  // ~2.4h per cycle (was 120), +1 log output
    gatherFromRadius: true,
  },
  // Wood Cutter: split logs into firewood
  {
    buildingType: BuildingType.WOOD_CUTTER,
    inputs: { [ResourceType.LOG]: 1 },
    outputs: { [ResourceType.FIREWOOD]: 3 },
    cooldownTicks: 100,  // ~1.3h per batch (was 80)
  },
  // Blacksmith: forge tools from iron and logs
  {
    buildingType: BuildingType.BLACKSMITH,
    inputs: { [ResourceType.IRON]: 1, [ResourceType.LOG]: 1 },
    outputs: { [ResourceType.TOOL]: 1 },
    cooldownTicks: 350,  // ~4.7h per tool (was 200)
  },
  // Tailor: sew coats from leather
  {
    buildingType: BuildingType.TAILOR,
    inputs: { [ResourceType.LEATHER]: 2 },
    outputs: { [ResourceType.COAT]: 1 },
    cooldownTicks: 300,  // ~4h per coat (was 200)
  },
  // Herbalist: gather medicinal herbs
  {
    buildingType: BuildingType.HERBALIST,
    inputs: {},
    outputs: { [ResourceType.HERBS]: 2 },
    cooldownTicks: 200,  // ~2.7h per gathering (was 150)
    gatherFromRadius: true,
  },
  // Crop Field: tend and harvest crops (heavily seasonal)
  {
    buildingType: BuildingType.CROP_FIELD,
    inputs: {},
    outputs: { [ResourceType.WHEAT]: 10, [ResourceType.CABBAGE]: 6, [ResourceType.POTATO]: 6 },
    cooldownTicks: 300,  // ~4h per harvest cycle (was 200), bigger yield
    seasonalMultiplier: true,
  },
];
