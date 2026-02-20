import { BuildingType, BuildingCategory } from '../constants';
import { BuildingDef } from '../types';

// constructionWork determines build time: ticks = constructionWork / (workers * 0.03)
// At 1800 ticks/day, with 3 workers: work 150 → 1667t ≈ 22h, work 250 → 2778t ≈ 1.5d
export const BUILDING_DEFS: Record<string, BuildingDef> = {
  [BuildingType.WOODEN_HOUSE]: {
    type: BuildingType.WOODEN_HOUSE,
    name: 'Wooden House',
    category: BuildingCategory.HOUSING,
    width: 3, height: 3,
    costLog: 24, costStone: 12, costIron: 0,
    maxWorkers: 0, workRadius: 0,
    constructionWork: 250,       // 5 workers → 22h, 2 workers → 2.3d
    residents: 5,
    description: 'A warm wooden house. Shelters up to 5 residents.',
  },
  [BuildingType.STORAGE_BARN]: {
    type: BuildingType.STORAGE_BARN,
    name: 'Storage Barn',
    category: BuildingCategory.STORAGE,
    width: 4, height: 4,
    costLog: 40, costStone: 16, costIron: 0,
    maxWorkers: 0, workRadius: 0,
    constructionWork: 300,       // 5 workers → 1.1d, 2 workers → 2.8d
    isStorage: true, storageCapacity: 6000,
    description: 'Stores food and goods. Reduces spoilage. Capacity: 6000.',
  },
  [BuildingType.STOCKPILE]: {
    type: BuildingType.STOCKPILE,
    name: 'Stockpile',
    category: BuildingCategory.STORAGE,
    width: 4, height: 4,
    costLog: 0, costStone: 0, costIron: 0,
    maxWorkers: 0, workRadius: 0,
    constructionWork: 15,        // 5 workers → 1.3h (quick to set up)
    isStorage: true, storageCapacity: 5000,
    description: 'Open-air storage for raw materials. Capacity: 5000.',
  },
  [BuildingType.CROP_FIELD]: {
    type: BuildingType.CROP_FIELD,
    name: 'Crop Field',
    category: BuildingCategory.FOOD,
    width: 8, height: 8,
    costLog: 0, costStone: 0, costIron: 0,
    maxWorkers: 4, workRadius: 0,
    constructionWork: 60,        // 5 workers → 5.3h (plowing large area)
    description: 'Grow crops. Plant in spring, harvest in autumn. 4 workers.',
  },
  [BuildingType.GATHERING_HUT]: {
    type: BuildingType.GATHERING_HUT,
    name: 'Gathering Hut',
    category: BuildingCategory.FOOD,
    width: 3, height: 3,
    costLog: 30, costStone: 12, costIron: 0,
    maxWorkers: 4, workRadius: 30,
    constructionWork: 150,       // 5 workers → 13h, 2 workers → 1.4d
    requiresForest: true,
    description: 'Gathers berries, mushrooms, and roots from nearby forest. 4 workers.',
  },
  [BuildingType.HUNTING_CABIN]: {
    type: BuildingType.HUNTING_CABIN,
    name: 'Hunting Cabin',
    category: BuildingCategory.FOOD,
    width: 3, height: 3,
    costLog: 38, costStone: 10, costIron: 0,
    maxWorkers: 3, workRadius: 30,
    constructionWork: 150,       // 5 workers → 13h, 2 workers → 1.4d
    description: 'Hunts deer for venison and leather. 3 workers.',
  },
  [BuildingType.FISHING_DOCK]: {
    type: BuildingType.FISHING_DOCK,
    name: 'Fishing Dock',
    category: BuildingCategory.FOOD,
    width: 3, height: 4,
    costLog: 30, costStone: 16, costIron: 0,
    maxWorkers: 4, workRadius: 0,
    constructionWork: 180,       // 5 workers → 16h (waterside construction)
    requiresWater: true,
    description: 'Catches fish from nearby water. Must be placed adjacent to water. 4 workers.',
  },
  [BuildingType.FORESTER_LODGE]: {
    type: BuildingType.FORESTER_LODGE,
    name: 'Forester Lodge',
    category: BuildingCategory.RESOURCE,
    width: 3, height: 3,
    costLog: 28, costStone: 12, costIron: 0,
    maxWorkers: 4, workRadius: 30,
    constructionWork: 150,       // 5 workers → 13h
    description: 'Plants and harvests trees for logs. 4 workers.',
  },
  [BuildingType.WOOD_CUTTER]: {
    type: BuildingType.WOOD_CUTTER,
    name: 'Wood Cutter',
    category: BuildingCategory.RESOURCE,
    width: 2, height: 2,
    costLog: 24, costStone: 8, costIron: 0,
    maxWorkers: 1, workRadius: 0,
    constructionWork: 100,       // 5 workers → 9h, 1 worker → 1.9d
    description: 'Converts logs into firewood. 1 worker.',
  },
  [BuildingType.BLACKSMITH]: {
    type: BuildingType.BLACKSMITH,
    name: 'Blacksmith',
    category: BuildingCategory.RESOURCE,
    width: 3, height: 3,
    costLog: 55, costStone: 32, costIron: 32,
    maxWorkers: 1, workRadius: 0,
    constructionWork: 350,       // 5 workers → 1.3d, 2 workers → 3.2d
    description: 'Forges tools from iron and logs. 1 worker.',
  },
  [BuildingType.TAILOR]: {
    type: BuildingType.TAILOR,
    name: 'Tailor',
    category: BuildingCategory.RESOURCE,
    width: 3, height: 3,
    costLog: 32, costStone: 48, costIron: 18,
    maxWorkers: 1, workRadius: 0,
    constructionWork: 250,       // 5 workers → 22h, 2 workers → 2.3d
    description: 'Makes coats from leather. 1 worker.',
  },
  [BuildingType.HERBALIST]: {
    type: BuildingType.HERBALIST,
    name: 'Herbalist',
    category: BuildingCategory.SERVICES,
    width: 3, height: 3,
    costLog: 26, costStone: 10, costIron: 0,
    maxWorkers: 1, workRadius: 30,
    constructionWork: 150,       // 5 workers → 13h
    description: 'Gathers herbs to improve citizen health. 1 worker.',
  },
  [BuildingType.MARKET]: {
    type: BuildingType.MARKET,
    name: 'Market',
    category: BuildingCategory.SERVICES,
    width: 5, height: 5,
    costLog: 60, costStone: 40, costIron: 16,
    maxWorkers: 3, workRadius: 40,
    constructionWork: 500,       // 5 workers → 1.9d, 2 workers → 4.6d
    description: 'Distributes goods to nearby houses. 3 vendors.',
  },
  [BuildingType.SCHOOL]: {
    type: BuildingType.SCHOOL,
    name: 'School',
    category: BuildingCategory.SERVICES,
    width: 4, height: 4,
    costLog: 82, costStone: 80, costIron: 40,
    maxWorkers: 1, workRadius: 0,
    constructionWork: 600,       // 5 workers → 2.2d, 2 workers → 5.6d
    description: 'Educates children. Educated workers produce +50%. 1 teacher.',
  },
  [BuildingType.TRADING_POST]: {
    type: BuildingType.TRADING_POST,
    name: 'Trading Post',
    category: BuildingCategory.SERVICES,
    width: 5, height: 5,
    costLog: 58, costStone: 62, costIron: 40,
    maxWorkers: 2, workRadius: 0,
    constructionWork: 600,       // 5 workers → 2.2d, 2 workers → 5.6d
    requiresWater: true,
    description: 'Trade with merchants. Must be placed near water. 2 workers.',
  },
  [BuildingType.ROAD]: {
    type: BuildingType.ROAD,
    name: 'Dirt Road',
    category: BuildingCategory.INFRASTRUCTURE,
    width: 1, height: 1,
    costLog: 1, costStone: 0, costIron: 0,
    maxWorkers: 0, workRadius: 0,
    constructionWork: 5,         // nearly instant
    description: 'Citizens walk 2x faster on roads. Cheap to build.',
  },
  [BuildingType.TOWN_HALL]: {
    type: BuildingType.TOWN_HALL,
    name: 'Town Hall',
    category: BuildingCategory.SERVICES,
    width: 5, height: 5,
    costLog: 80, costStone: 60, costIron: 20,
    maxWorkers: 0, workRadius: 0,
    constructionWork: 800,       // 5 workers → 3d (major community building)
    description: 'The heart of the village. Unlocks seasonal festivals that boost morale and grant bonuses.',
  },
};
