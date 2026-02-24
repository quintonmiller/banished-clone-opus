import { AchievementId } from '../constants';

export type AchievementCategory = 'survival' | 'population' | 'building' | 'economy' | 'challenge' | 'discovery' | 'secret';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  icon: string;
  secret: boolean;
  // Optional per-game bonus (replaces MilestoneSystem bonuses)
  bonusType?: string;
  bonusValue?: number;
  bonusDescription?: string;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [
  // ── Survival (13) ─────────────────────────────────────────────
  {
    id: AchievementId.SURVIVE_1_YEAR, name: 'First Anniversary',
    description: 'Survive for 1 year.', category: 'survival', icon: '🗓', secret: false,
  },
  {
    id: AchievementId.SURVIVE_3_YEARS, name: 'Established',
    description: 'Survive for 3 years.', category: 'survival', icon: '🏕', secret: false,
  },
  {
    id: AchievementId.SURVIVE_5_YEARS, name: 'Enduring Legacy',
    description: 'Survive for 5 years.', category: 'survival', icon: '🏛', secret: false,
  },
  {
    id: AchievementId.SURVIVE_10_YEARS, name: 'A Decade of Survival',
    description: 'Survive for 10 years.', category: 'survival', icon: '⭐', secret: false,
  },
  {
    id: AchievementId.SURVIVE_25_YEARS, name: 'Timeless Settlement',
    description: 'Survive for 25 years.', category: 'survival', icon: '👑', secret: false,
  },
  {
    id: AchievementId.SURVIVE_50_YEARS, name: 'Eternal Village',
    description: 'Survive for 50 years.', category: 'survival', icon: '🌟', secret: false,
  },
  {
    id: AchievementId.NO_DEATHS_YEAR_1, name: 'Careful Steward',
    description: 'Complete Year 1 with no deaths.', category: 'survival', icon: '🛡', secret: false,
  },
  {
    id: AchievementId.NO_DEATHS_YEAR_3, name: 'Guardian of the People',
    description: 'Complete 3 years with no deaths.', category: 'survival', icon: '🛡', secret: false,
  },
  {
    id: AchievementId.SURVIVE_FIRST_WINTER, name: 'Winter Survivors',
    description: 'Survived the first winter with no deaths.', category: 'survival', icon: '❄', secret: false,
    bonusType: 'happiness_baseline', bonusValue: 1, bonusDescription: '+1 baseline happiness',
  },
  {
    id: AchievementId.SURVIVE_HARSH_WINTER, name: 'Blizzard Tested',
    description: 'Survive a harsh winter weather event.', category: 'survival', icon: '🌨', secret: false,
  },
  {
    id: AchievementId.SURVIVE_STORM, name: 'Storm Weathered',
    description: 'Survive a storm with no building collapses.', category: 'survival', icon: '⛈', secret: false,
  },
  {
    id: AchievementId.SURVIVE_DROUGHT, name: 'Drought Resilience',
    description: 'Survive a drought with no deaths.', category: 'survival', icon: '☀', secret: false,
  },
  {
    id: AchievementId.RECOVER_FROM_SPIRAL, name: 'Back from the Brink',
    description: 'Recover to 10+ population after dropping below 5.', category: 'survival', icon: '🔄', secret: false,
  },

  // ── Population (13) ──────────────────────────────────────────
  {
    id: AchievementId.POP_30, name: 'Growing Village',
    description: 'Population reached 30.', category: 'population', icon: '👥', secret: false,
    bonusType: 'work_speed', bonusValue: 0.02, bonusDescription: '+2% work speed',
  },
  {
    id: AchievementId.POP_50, name: 'Bustling Town',
    description: 'Population reached 50.', category: 'population', icon: '🏘', secret: false,
    bonusType: 'work_speed', bonusValue: 0.03, bonusDescription: '+3% work speed',
  },
  {
    id: AchievementId.POP_75, name: 'Prosperous Community',
    description: 'Population reached 75.', category: 'population', icon: '🏙', secret: false,
    bonusType: 'work_speed', bonusValue: 0.05, bonusDescription: '+5% work speed',
  },
  {
    id: AchievementId.POP_100, name: 'Century of Souls',
    description: 'Population reached 100.', category: 'population', icon: '💯', secret: false,
  },
  {
    id: AchievementId.POP_150, name: 'Great City',
    description: 'Population reached 150.', category: 'population', icon: '🌆', secret: false,
  },
  {
    id: AchievementId.POP_200, name: 'Metropolis',
    description: 'Population reached 200.', category: 'population', icon: '🌃', secret: false,
  },
  {
    id: AchievementId.FIRST_BIRTH, name: 'New Generation',
    description: 'A child was born in the village.', category: 'population', icon: '👶', secret: false,
    bonusType: 'happiness_baseline', bonusValue: 1, bonusDescription: '+1 baseline happiness',
  },
  {
    id: AchievementId.FIRST_WEDDING, name: 'First Wedding',
    description: 'A couple got married.', category: 'population', icon: '💒', secret: false,
  },
  {
    id: AchievementId.BABY_BOOM, name: 'Baby Boom',
    description: '5 or more births in a single year.', category: 'population', icon: '🍼', secret: false,
  },
  {
    id: AchievementId.FAMILY_OF_FIVE, name: 'Big Family',
    description: 'A family has 3 or more children.', category: 'population', icon: '👨‍👩‍👧‍👦', secret: false,
  },
  {
    id: AchievementId.ELDER_70, name: 'Respected Elder',
    description: 'A citizen reached age 70.', category: 'population', icon: '🧓', secret: false,
  },
  {
    id: AchievementId.ELDER_80, name: 'Venerable Sage',
    description: 'A citizen reached age 80.', category: 'population', icon: '🧙', secret: false,
  },
  {
    id: AchievementId.FULL_HOUSE, name: 'Full House',
    description: 'Every house is occupied (minimum 8 houses).', category: 'population', icon: '🏠', secret: false,
  },

  // ── Building (13) ────────────────────────────────────────────
  {
    id: AchievementId.FIRST_BUILDING, name: 'Foundation',
    description: 'Completed the first building.', category: 'building', icon: '🔨', secret: false,
    bonusType: 'gathering_speed', bonusValue: 0.02, bonusDescription: '+2% gathering speed',
  },
  {
    id: AchievementId.BUILD_10, name: 'Builder',
    description: 'Completed 10 buildings.', category: 'building', icon: '🏗', secret: false,
  },
  {
    id: AchievementId.BUILD_25, name: 'Architect',
    description: 'Completed 25 buildings.', category: 'building', icon: '📐', secret: false,
  },
  {
    id: AchievementId.BUILD_50, name: 'City Planner',
    description: 'Completed 50 buildings.', category: 'building', icon: '🗺', secret: false,
  },
  {
    id: AchievementId.BUILD_100, name: 'Master Builder',
    description: 'Completed 100 buildings.', category: 'building', icon: '🏰', secret: false,
  },
  {
    id: AchievementId.BUILD_ALL_TYPES, name: 'Master Planner',
    description: 'Built at least one of every base building type.', category: 'building', icon: '📋', secret: false,
  },
  {
    id: AchievementId.FIRST_UPGRADE, name: 'Renovation',
    description: 'Upgraded a building for the first time.', category: 'building', icon: '⬆', secret: false,
  },
  {
    id: AchievementId.UPGRADE_5, name: 'Modernizer',
    description: 'Upgraded 5 buildings.', category: 'building', icon: '🔧', secret: false,
  },
  {
    id: AchievementId.UPGRADE_ALL, name: 'Fully Upgraded',
    description: 'Upgraded at least one of every upgradeable type.', category: 'building', icon: '✨', secret: false,
  },
  {
    id: AchievementId.TOWN_HALL_BUILT, name: 'Seat of Power',
    description: 'Built a Town Hall.', category: 'building', icon: '🏛', secret: false,
  },
  {
    id: AchievementId.ROAD_NETWORK_100, name: 'Road Builder',
    description: 'Placed 100 or more road tiles.', category: 'building', icon: '🛤', secret: false,
  },
  {
    id: AchievementId.BRIDGE_BUILDER, name: 'Bridge Builder',
    description: 'Built a bridge.', category: 'building', icon: '🌉', secret: false,
  },
  {
    id: AchievementId.STONE_AGE, name: 'Stone Age',
    description: 'Upgraded 3 buildings to stone tier.', category: 'building', icon: '🪨', secret: false,
  },

  // ── Economy (14) ─────────────────────────────────────────────
  {
    id: AchievementId.FOOD_STOCKPILE_500, name: 'Well Fed',
    description: 'Accumulate 500 total food.', category: 'economy', icon: '🍎', secret: false,
  },
  {
    id: AchievementId.FOOD_STOCKPILE_2000, name: 'Feast for All',
    description: 'Accumulate 2,000 total food.', category: 'economy', icon: '🍖', secret: false,
  },
  {
    id: AchievementId.FOOD_STOCKPILE_5000, name: 'Overflowing Granary',
    description: 'Accumulate 5,000 total food.', category: 'economy', icon: '🏺', secret: false,
  },
  {
    id: AchievementId.RESOURCE_HOARDER, name: 'Resource Hoarder',
    description: 'Have 500+ of logs, stone, and iron simultaneously.', category: 'economy', icon: '📦', secret: false,
  },
  {
    id: AchievementId.FIRST_TRADE, name: 'Open for Business',
    description: 'Completed the first trade.', category: 'economy', icon: '🤝', secret: false,
    bonusType: 'trade_value', bonusValue: 0.1, bonusDescription: '+10% trade value',
  },
  {
    id: AchievementId.TRADE_10, name: 'Merchant Republic',
    description: 'Completed 10 trades.', category: 'economy', icon: '💰', secret: false,
  },
  {
    id: AchievementId.TRADE_25, name: 'Trade Empire',
    description: 'Completed 25 trades.', category: 'economy', icon: '👑', secret: false,
  },
  {
    id: AchievementId.SELF_SUFFICIENT, name: 'Self-Sufficient',
    description: 'Have all food types, tools, coats, and firewood.', category: 'economy', icon: '🏆', secret: false,
    bonusType: 'all_production', bonusValue: 0.05, bonusDescription: '+5% all production',
  },
  {
    id: AchievementId.MASTER_CHEF, name: 'Master Chef',
    description: 'Produce all types of cooked food.', category: 'economy', icon: '👨‍🍳', secret: false,
  },
  {
    id: AchievementId.ALL_FOOD_TYPES, name: 'Diverse Diet',
    description: 'Have every food type in storage simultaneously.', category: 'economy', icon: '🥗', secret: false,
  },
  {
    id: AchievementId.FIRST_LIVESTOCK, name: 'Animal Keeper',
    description: 'Built a chicken coop or pasture.', category: 'economy', icon: '🐔', secret: false,
  },
  {
    id: AchievementId.ANIMAL_FARM, name: 'Animal Farm',
    description: 'Have both chickens and cattle.', category: 'economy', icon: '🐄', secret: false,
  },
  {
    id: AchievementId.IRON_AGE, name: 'Iron Age',
    description: 'Smelt iron ore from a mine.', category: 'economy', icon: '⛏', secret: false,
  },
  {
    id: AchievementId.TOOL_MAKER, name: 'Tool Maker',
    description: 'Forge tools at a blacksmith.', category: 'economy', icon: '🔧', secret: false,
  },

  // ── Challenge (9) ────────────────────────────────────────────
  {
    id: AchievementId.NO_TAVERN_POP_30, name: 'Sober Village',
    description: 'Reach population 30 without building a tavern.', category: 'challenge', icon: '🚫', secret: false,
  },
  {
    id: AchievementId.NO_TRADERS_YEAR_5, name: 'Isolationist',
    description: 'Survive 5 years without completing any trades.', category: 'challenge', icon: '🏝', secret: false,
  },
  {
    id: AchievementId.NO_NOMADS_POP_30, name: 'Homegrown',
    description: 'Reach population 30 with only births (no nomads accepted).', category: 'challenge', icon: '🌱', secret: false,
  },
  {
    id: AchievementId.VEGETARIAN_VILLAGE, name: 'Vegetarian Village',
    description: 'Survive 3 years without hunting wildlife or raising cattle.', category: 'challenge', icon: '🥬', secret: false,
  },
  {
    id: AchievementId.NO_DEATHS_YEAR_5, name: 'Deathless',
    description: 'Complete 5 years with no deaths.', category: 'challenge', icon: '💎', secret: false,
  },
  {
    id: AchievementId.NO_DEATHS_YEAR_10, name: 'Immortal Guardian',
    description: 'Complete 10 years with no deaths.', category: 'challenge', icon: '🌀', secret: false,
  },
  {
    id: AchievementId.SPEED_BUILD_TOWN_HALL, name: 'Rush Job',
    description: 'Build a Town Hall before the end of Year 2.', category: 'challenge', icon: '⚡', secret: false,
  },
  {
    id: AchievementId.MINIMAL_HOUSING, name: 'Packed In',
    description: 'Have 30+ population with 5 or fewer houses.', category: 'challenge', icon: '🏚', secret: false,
  },
  {
    id: AchievementId.ONE_OF_EACH, name: 'One of Each',
    description: 'Build exactly one of every base building type.', category: 'challenge', icon: '🎯', secret: false,
  },

  // ── Discovery (12) ──────────────────────────────────────────
  {
    id: AchievementId.FIRST_FESTIVAL, name: 'Let the Fair Begin!',
    description: 'Hosted the first seasonal fair.', category: 'discovery', icon: '🎪', secret: false,
  },
  {
    id: AchievementId.ALL_FESTIVALS, name: 'Year-Round Celebration',
    description: 'Hosted all 4 seasonal fairs.', category: 'discovery', icon: '🎉', secret: false,
  },
  {
    id: AchievementId.FESTIVAL_ALL_REWARDS, name: 'Reward Collector',
    description: 'Received 10 different fair rewards.', category: 'discovery', icon: '🎁', secret: false,
  },
  {
    id: AchievementId.NIGHT_OWL, name: 'Night Owl',
    description: 'Have 10+ citizens awake at midnight.', category: 'discovery', icon: '🦉', secret: false,
  },
  {
    id: AchievementId.EARLY_BIRD, name: 'Early Bird',
    description: 'Have 5+ citizens working at dawn.', category: 'discovery', icon: '🐦', secret: false,
  },
  {
    id: AchievementId.MASTER_SKILL, name: 'Master Craftsman',
    description: 'A citizen reached max skill level.', category: 'discovery', icon: '🎓', secret: false,
  },
  {
    id: AchievementId.EDUCATED_VILLAGE, name: 'Pursuit of Knowledge',
    description: 'Have 5+ educated citizens.', category: 'discovery', icon: '📚', secret: false,
    bonusType: 'education', bonusValue: 0.03, bonusDescription: '+3% education bonus',
  },
  {
    id: AchievementId.ALL_TRAITS, name: 'Diverse Community',
    description: 'Have citizens representing all personality traits (30+ population).', category: 'discovery', icon: '🎭', secret: false,
  },
  {
    id: AchievementId.CHEERFUL_VILLAGE, name: 'Cheerful Village',
    description: 'Average happiness above 85 with 20+ citizens.', category: 'discovery', icon: '😊', secret: false,
  },
  {
    id: AchievementId.NARRATIVE_10, name: 'Storyteller',
    description: '10 narrative events occurred.', category: 'discovery', icon: '📖', secret: false,
  },
  {
    id: AchievementId.NARRATIVE_25, name: 'Living Legend',
    description: '25 narrative events occurred.', category: 'discovery', icon: '📜', secret: false,
  },
  {
    id: AchievementId.FULL_EMPLOYMENT, name: 'Full Employment',
    description: 'Every adult citizen has a workplace assigned.', category: 'discovery', icon: '💼', secret: false,
  },

  // ── Secret (10) ─────────────────────────────────────────────
  {
    id: AchievementId.LONE_SURVIVOR, name: 'Lone Survivor',
    description: 'Have exactly 1 citizen remaining.', category: 'secret', icon: '🕯', secret: true,
  },
  {
    id: AchievementId.GHOST_TOWN, name: 'Ghost Town',
    description: 'Have 10+ empty houses.', category: 'secret', icon: '👻', secret: true,
  },
  {
    id: AchievementId.CENTENARIAN, name: 'Centenarian',
    description: 'A citizen lived to age 100.', category: 'secret', icon: '🎂', secret: true,
  },
  {
    id: AchievementId.ALL_MILESTONES, name: 'Overachiever',
    description: 'Earn all non-secret achievements.', category: 'secret', icon: '🏅', secret: true,
  },
  {
    id: AchievementId.SPEED_YEAR_1, name: 'Speedrunner',
    description: 'Build 5 buildings before the end of Year 1.', category: 'secret', icon: '🏃', secret: true,
  },
  {
    id: AchievementId.DOUBLE_DIGITS, name: 'Double Digits',
    description: '10 deaths in a single year.', category: 'secret', icon: '💀', secret: true,
  },
  {
    id: AchievementId.SEED_42, name: 'The Answer',
    description: 'Start a game with seed 42.', category: 'secret', icon: '🌌', secret: true,
  },
  {
    id: AchievementId.ZERO_FOOD, name: 'Famine',
    description: 'Have exactly 0 food with 20+ population.', category: 'secret', icon: '💀', secret: true,
  },
  {
    id: AchievementId.MIDNIGHT_WEDDING, name: 'Midnight Vows',
    description: 'A wedding happened during the night.', category: 'secret', icon: '🌙', secret: true,
  },
  {
    id: AchievementId.SNOWBALL_FIGHT, name: 'Snowball Fight',
    description: 'A Frost Fair occurred during a harsh winter.', category: 'secret', icon: '☃', secret: true,
  },
];

export const ACHIEVEMENT_MAP = new Map<string, AchievementDef>(
  ACHIEVEMENT_DEFS.map(a => [a.id, a]),
);

export const TOTAL_ACHIEVEMENTS = ACHIEVEMENT_DEFS.length;
export const NON_SECRET_COUNT = ACHIEVEMENT_DEFS.filter(a => !a.secret).length;
