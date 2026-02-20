# Banished Clone

A 2D browser-playable clone of [Banished](https://www.shiningrocksoftware.com/), the city-building survival game by Shining Rock Software. Guide a group of exiled travelers as they build a new settlement, manage resources, and survive harsh seasons.

Built with TypeScript and HTML5 Canvas. No frameworks, no dependencies beyond Vite.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for production

```bash
npm run build
npm run preview
```

## How to Play

You start with 5 adults, 2 children, and a modest stockpile of resources (150 logs, 50 stone, 300 food, and basic supplies). Place buildings, assign workers, and manage food and firewood to keep your settlement alive through the seasons.

There is no win condition — it's a sandbox survival game. The challenge is avoiding the **death spiral**: resource shortages lead to deaths, which mean fewer workers, which deepens the shortage.

### Controls

| Input | Action |
|-------|--------|
| WASD / Arrow keys | Pan camera |
| Mouse wheel | Zoom in/out |
| Left click | Select citizen or building |
| Right click / Escape | Cancel placement / deselect |
| B | Toggle build menu |
| Space | Pause / unpause |
| 1-5 | Game speed (pause, 1x, 2x, 5x, 10x) |
| F3 | Debug overlay |
| R | Restart (game over screen) |

### Tips

- Build a **Gathering Hut** near forest first — it's your most reliable early food source and works year-round (unlike farms).
- Construction takes real time — a Gathering Hut takes about half a day with your full crew, a house takes almost a full day. Plan accordingly.
- Build a **Wood Cutter** early — firewood keeps houses warm in winter and citizens will freeze without it.
- Don't overbuild. Each building takes workers away from food production, and construction ties up laborers for hours or days.
- Watch food reserves heading into winter. Crops don't grow in cold months, and you'll need stockpiled food to survive.
- Build a **Forester Lodge** to sustain nearby forest tiles that gathering huts depend on. Trees take time to regrow.

## Features

### Citizen Simulation
- Citizens have needs: food, warmth, health, happiness, and energy
- Day/night cycle — citizens sleep at night and when exhausted
- Discrete meals (2-3 per day) with diet variety tracking
- Family formation, housing, children, aging, and natural death
- Education system — schooled citizens produce 50% more
- Social interactions — citizens chat when near each other; loneliness causes unhappiness

### 15 Building Types

| Category | Buildings |
|----------|-----------|
| Housing | Wooden House |
| Storage | Storage Barn, Stockpile |
| Food | Crop Field, Gathering Hut, Hunting Cabin, Fishing Dock |
| Resource | Forester Lodge, Wood Cutter, Blacksmith, Tailor |
| Services | Herbalist, Market, School, Trading Post |
| Infrastructure | Road |

### 16 Resource Types
- **Raw:** Log, Stone, Iron
- **Food:** Berries, Mushrooms, Roots, Venison, Fish, Wheat, Cabbage, Potato
- **Processed:** Firewood, Tool, Coat, Herbs, Leather

### Seasonal Cycle
- 12 sub-seasons per year (Early/Mid/Late Spring, Summer, Autumn, Winter)
- Crops grow in spring-summer, harvest in autumn, nothing in winter
- Temperature affects warmth decay — citizens freeze without firewood and coats
- Visual changes: snow in winter, colored leaves in autumn

### Survival Mechanics
- **Food spoilage** — food decays over time; Storage Barns reduce spoilage by 80%
- **Resource depletion** — forests thin out when gathered; stone and iron deposits deplete
- **Tool & coat wear** — tools and coats degrade with use
- **Building decay** — buildings lose durability over time and can collapse
- **Disease** — malnourished citizens get sick; illness spreads; Herbalists cure nearby sick citizens
- **Weather events** — storms damage buildings and crops, droughts halt crop growth, cold snaps increase warmth drain

### Game Balance
All gameplay values are centralized in config files for easy tuning:
- `src/constants.ts` — core tuning values (timing, needs, construction, AI, etc.)
- `src/data/BuildingDefs.ts` — per-building costs, sizes, and construction times
- `src/data/RecipeDefs.ts` — production recipes, cooldowns, and yields
- `src/data/SeasonDefs.ts` — seasonal temperature, crop growth, and gathering rates

### Other Systems
- Nomad arrivals bring new citizens (and sometimes disease)
- Merchant traders visit the Trading Post for resource bartering
- Particle effects: chimney smoke, snowfall, falling leaves
- Minimap with camera indicator
- Detailed info panels for selected citizens and buildings

## Architecture

Lightweight Entity Component System (ECS) with 13 game systems, all rendered on a single HTML5 Canvas. Fixed-timestep simulation at 10 ticks/sec with variable-rate rendering. All gameplay values are data-driven through centralized config files. See [CLAUDE.md](CLAUDE.md) for technical details.

## License

This is a fan project for educational purposes. Banished is a trademark of Shining Rock Software.
