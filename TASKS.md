# Stardew Valley Hybrid — Feature Tasks

## Priority Order

### 1. Festivals & Town Hall
- Add a Town Hall building definition (unlocks festivals, shows village stats)
- Implement seasonal festivals: Harvest Festival (autumn), Frost Fair (winter), Planting Day (spring), Midsummer Celebration (summer)
- During festivals: citizens gather at Town Hall, work stops for the day, happiness boost, particle effects (lanterns, decorations)
- Festival gameplay effects: Harvest Festival boosts food preservation, Frost Fair reduces disease, Planting Day boosts spring crop growth, Midsummer boosts happiness duration

### 2. Cooking & Bakery
- Add Bakery building definition (3x3, 1 worker)
- Add cooking recipes: Fish Stew (fish + potato → meal with warmth boost), Berry Pie (berries + wheat → high food value), Bread (wheat → steady food), Vegetable Soup (cabbage + potato + roots → balanced meal)
- Cooked meals restore more food than raw ingredients and give temporary buffs (warmth, happiness, energy)
- Add "meal quality" concept — raw food restores base amount, cooked food restores more

### 3. Citizen Personality Traits
- Add personality traits to Citizen component: shy, cheerful, hardworking, lazy, adventurous (each citizen gets 1-2 traits)
- Traits affect: work speed (hardworking +15%, lazy -15%), social behavior (shy chats less often, cheerful gets more happiness from socializing), happiness triggers (adventurous gets happiness from wandering, etc.)
- Display traits in the info panel
- Assign random traits at citizen creation (birth + nomad arrival)

### 4. Crop Growth Stages
- Replace flat-rate crop production with visible growth stages: Planted → Sprouting → Growing → Flowering → Ready to Harvest
- Each stage lasts a portion of the season, affected by temperature and weather
- Render different visuals per growth stage on crop field tiles
- Crops that don't finish growing before winter are lost (adds seasonal pressure)
- Drought and storms can damage crops mid-growth (already partially supported)

### 5. Citizen Skill Progression
- Add per-citizen skill experience tracking (farming, forestry, mining, cooking, building, gathering, fishing)
- Citizens gain XP by working at relevant buildings
- Skill levels (0-5) provide efficiency bonuses (+5% per level)
- Mastery (level 5): occasional bonus output (e.g. master farmer yields +1 extra crop)
- Show skill levels on the info panel with small progress bars

### 6. Tavern & Social Buildings
- Add Tavern building (4x4, 1 worker, serves ale if brewery exists or just provides social space)
- Citizens visit Tavern during evening hours for happiness boost
- Add Well/Fountain (2x2, decorative, happiness radius boost to nearby buildings)
- Add Chapel (3x3, weddings happen here with ceremony event, happiness boost)
- Social buildings create "gathering zones" where citizens prefer to socialize

### 7. Animals & Livestock
- Add Chicken Coop (3x3, 1 worker) → produces eggs (food) and feathers (trade good)
- Add Pasture (6x6, fenced area) + Barn (4x4, 1 worker) → cattle produce milk and leather
- Animals need feeding (hay from crop fields in summer, stored hay in winter)
- Animals need shelter in winter (barn) or they get sick/die
- Herder profession for assigned workers
- New resource chain: milk → cheese (at a Dairy), wool → cloth (at a Loom)

### 8. Narrative Events & Milestones
- Add milestone system: First House, First Winter Survived, Population 20, First Trade, etc.
- Each milestone grants a small permanent bonus (e.g. +2% gathering, +1 happiness baseline)
- Add random narrative events tied to citizens ("found old map while foraging", "discovered berry patch")
- Add community goals displayed at Town Hall ("Village needs 100 stone for a monument")
- Show milestone/event notifications prominently in the event log
