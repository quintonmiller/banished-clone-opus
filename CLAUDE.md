# Exiled - Claude Code Project Guide

## Project Overview
A 2D browser-playable city-building survival sandbox — Exiled — with deeper citizen personalities, skill progression, festivals, livestock, and narrative events. No win state; the central challenge is avoiding the **death spiral** (resource shortage -> deaths -> fewer workers -> more shortage).

## Tech Stack
- **Language:** TypeScript (strict mode)
- **Build:** Vite 5, no framework
- **Rendering:** HTML5 Canvas 2D (single canvas, no DOM UI)
- **Architecture:** Lightweight ECS (entities = numeric IDs, components in `Map<EntityId, T>`)

## Commands
- `npm run dev` — Start Vite dev server (hot reload)
- `npm run build` — TypeScript check + Vite production build
- `npx tsc --noEmit` — Type check only (no output)
- `npx vite build` — Build only (skip type check)

## Project Structure
```
src/
  main.ts              # Entry point
  Game.ts              # Master class: owns ECS world, all systems, game loop, state
  constants.ts         # ALL tuning values, enums, magic numbers (single source of truth)
  types.ts             # Shared interfaces (TileData, GameState, BuildingDef, etc.)
  core/                # GameLoop (fixed-timestep), EventBus (pub/sub), Random (seeded xorshift)
  ecs/                 # World (entity/component store), System (base class)
  components/          # Component type definitions (Position, Citizen, Needs, etc.)
  systems/             # All game systems (16 total — see below)
  map/                 # TileMap, MapGenerator, Pathfinder (A* + LRU cache), Camera
  data/                # Data-driven definitions (BuildingDefs, RecipeDefs, SeasonDefs, etc.)
  ui/                  # UIManager, BuildMenu, HUD, InfoPanel, Minimap, Tooltip, EventLog, PauseMenu, StartScreen, SettingsPanel
  input/               # InputManager, CameraController, PlacementController
  save/                # SaveManager (IDB + localStorage), SaveTypes, IndexedDBStore
  utils/               # MathUtils, SpatialHash, SpriteLoader
```

## Key Architecture Patterns

### ECS
- Components are plain objects stored in `Map<EntityId, T>` per component type
- Use `world.getComponent<any>(id, 'componentName')` — always pass `<any>` to avoid TS errors
- Use `world.getComponentStore<any>('componentName')` to iterate all components of a type
- Use `world.query('comp1', 'comp2', ...)` to find entities with all listed components

### Systems (update order in Game.ts)
1. SeasonSystem — calendar + day/night cycle
2. CitizenAISystem — priority-based decision tree (+ skill XP, tavern visits)
3. MovementSystem — A* path following
4. ConstructionSystem — builder material delivery (+ skill/trait bonuses)
5. ProductionSystem — building recipes + resource output (+ multi-recipe, crop stages, skill/achievement bonuses)
6. NeedsSystem — food/warmth/health/energy decay (+ well/chapel happiness, achievement bonuses)
7. StorageSystem — house restocking, food spoilage, market
8. PopulationSystem — aging, births, families, nomads, worker assignment (+ chapel weddings)
9. TradeSystem — merchant visits
10. EnvironmentSystem — natural tree regrowth, building decay
11. DiseaseSystem — sickness spread and herbalist cures
12. ParticleSystem — smoke, snow, leaves, festival lanterns
13. WeatherSystem — storms, droughts, cold snaps
14. FestivalSystem — seasonal festivals at Town Hall with lingering effects
15. LivestockSystem — chicken/cattle production, feeding, breeding, winter exposure
16. AchievementSystem — 65 cross-game achievements, per-game bonuses, random narrative events (replaces MilestoneSystem)

### Data-driven design — all tuning in config files
- **`constants.ts`** — single source of truth for ALL gameplay values. Organized into sections:
  - Timing (tick rate, day/season length)
  - Citizens (starting count, speed, aging)
  - Needs (decay rates, thresholds for hunger/cold/tiredness)
  - Construction (work rate, education bonus)
  - Population (marriage, births, nomads)
  - AI behavior (tick intervals, wander distances, stuck recovery)
  - Storage/housing (firewood, warmth mechanics)
  - Trade (merchant timing, wares)
  - Environment (tree growth, building decay)
  - Disease (spread, cure, immunity)
  - Weather (storm/drought chances, damage)
  - Map generation (noise scales, elevation thresholds)
  - Particles (spawn rates, visual params)
  - Personality traits (work speed, social, happiness effects)
  - Citizen skills (XP rates, efficiency per level, mastery bonus)
  - Crop growth stages (stage ticks, harvest yield)
  - Cooking/meal quality (restore amounts, warmth/happiness/energy boosts)
  - Festivals (duration, happiness, effect multipliers)
  - Animals/livestock (capacity, feed rates, production timers, breeding)
  - Achievements/narrative events (check intervals, event chances)
  - Tavern/well/chapel (happiness values, radii)
- **`data/BuildingDefs.ts`** — per-building stats (cost, size, constructionWork, maxWorkers)
- **`data/RecipeDefs.ts`** — production recipes (inputs, outputs, cooldownTicks)
- **`data/SeasonDefs.ts`** — per-season temperature, crop growth, gathering rates
- **Rule:** change numbers in config files, not in system code

### Gameplay manual sync (required)
- Manual pages are served from `public/manual/`:
  - `public/manual/index.html`
  - `public/manual/buildings.html`
  - `public/manual/resources.html`
  - `public/manual/mechanics.html`
- Pause menu has a **Gameplay Manual** button that opens this site in a new tab.
- When gameplay/data changes, update relevant manual pages in the same PR.
- Always review manual accuracy after edits to:
  - `src/constants.ts`
  - `src/data/BuildingDefs.ts`
  - `src/data/ResourceDefs.ts`
  - `src/data/RecipeDefs.ts`
  - `src/data/SeasonDefs.ts`
  - `src/systems/*` (if formulas/behavior changed)

### Citizen AI Priority Order
1. Already sleeping -> stay asleep (wake if energy full + daytime, or if starving)
2. Starving (food < `STARVING_THRESHOLD`) -> urgent food
3. Freezing (warmth < `FREEZING_WARMTH_THRESHOLD`) -> go home
4. Exhausted (energy < `TIRED_THRESHOLD`) -> go home and sleep
5. Night time -> go home and sleep
6. Hungry (food < `MEAL_FOOD_THRESHOLD`) -> eat a meal (prefers cooked food)
5b. Festival active -> go to Town Hall and celebrate
7. Assigned to workplace -> go work (grants skill XP)
8. Laborer -> find construction site (grants building skill XP)
9. Evening hours -> visit Tavern if available
10. Social interaction -> chat with nearby citizen
11. Wander randomly (adventurous trait gains happiness)

### Day/Night & Construction Timing
- `TICKS_PER_DAY = 600` (60 seconds real time at 1x)
- Day/night cycle uses `state.tick % TICKS_PER_DAY` (decoupled from season progression)
- Season length: `TICKS_PER_SUB_SEASON = 3000` (5 in-game days), 12 sub-seasons per year
- Working hours: ~55% of day (dawn 0.2 to dusk 0.75)
- Construction formula: `ticks = constructionWork / (numWorkers * CONSTRUCTION_WORK_RATE)`
- Example: House (250 work) with 3 workers → 2778 ticks ≈ 4.6 days
- Production formula: `cooldownTicks / efficiency` per cycle (efficiency = workers/maxWorkers × seasonal × education)

## Common Pitfalls
- `getComponentStore` returns `Map<EntityId, {}>` by default — always use `<any>` type parameter
- `movement.stuckTicks` must be checked with `=== undefined`, not `!movement.stuckTicks` (0 is falsy)
- `goToBuilding` tries 6 entry points around buildings — if all fail, returns false
- New citizens spawned by PopulationSystem must include `energy`, `isSleeping`, `recentDiet`, `traits` fields
- Food is stored as multiple types (berries, venison, cooked foods, etc.) — use `game.getTotalFood()` and `game.removeFood()` for aggregates; `ALL_FOOD_TYPES` includes raw + cooked + animal foods
- **Never hardcode gameplay numbers in system files** — always add a named constant in `constants.ts` and import it
- Building and recipe defs have their own data files — don't duplicate values in constants.ts
- Multi-recipe buildings (Bakery, Tailor) cycle through recipes via `producer.recipeIndex` — all matching recipes are found by `RECIPE_DEFS.filter(r => r.buildingType === bld.type)`
- Crop fields use growth stages (`producer.cropStage`) instead of normal timer-based production — handled by `updateCropField()` in ProductionSystem
- Livestock data lives in LivestockSystem's internal map (not as ECS components) — use `game.livestockSystem.getLivestockData(buildingId)` to access
- Festival effects checked via `game.festivalSystem.hasActiveEffect('type')` — lingering effects last the rest of the season
- Achievement bonuses accessed via `game.achievementSystem.getBonus('bonusType')` — returns accumulated value from achievements with bonus fields
- `AchievementStore` is a persistent cross-game singleton (localStorage + IDB) — import from `src/save/AchievementStore.ts`
- Achievement definitions in `src/data/AchievementDefs.ts` — `ACHIEVEMENT_MAP` for lookup by ID
- Personality traits stored as `string[]` on citizen component; skill XP stored on worker component as `worker.skills[skillType] = { xp, level }`

## Versioning & Changelog
- **`GAME_VERSION`** in `src/version.ts` — display version shown in the Start Screen, Pause Menu, and manual footer
- **`SAVE_VERSION`** in `src/save/SaveTypes.ts` — save format version; only bump when the save data structure changes
- When bumping `GAME_VERSION`: update `src/version.ts`, `package.json` version field, manual footer in all `public/manual/*.html` files, and add an entry to `public/manual/changelog.html`
- When bumping `SAVE_VERSION`: only needed when adding/removing/restructuring fields in `SaveData`
- Always add a changelog entry for new game versions

## Keyboard Shortcuts
- **Space** — Pause/unpause
- **1-5** — Speed (0x, 1x, 2x, 5x, 10x)
- **B** — Toggle build menu
- **G** — Toggle gather limits panel
- **L** — Toggle event log
- **Escape** — Cancel placement / deselect
- **F3** — Debug overlay
- **R** — Restart (game over screen only)
