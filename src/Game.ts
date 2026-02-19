import { GameLoop } from './core/GameLoop';
import { EventBus } from './core/EventBus';
import { Random } from './core/Random';
import { TileMap } from './map/TileMap';
import { MapGenerator } from './map/MapGenerator';
import { Camera } from './map/Camera';
import { InputManager } from './input/InputManager';
import { CameraController } from './input/CameraController';
import { RenderSystem } from './systems/RenderSystem';
import { World } from './ecs/World';
import { Pathfinder } from './map/Pathfinder';
import { MovementSystem } from './systems/MovementSystem';
import { CitizenAISystem } from './systems/CitizenAISystem';
import { ConstructionSystem } from './systems/ConstructionSystem';
import { ProductionSystem } from './systems/ProductionSystem';
import { NeedsSystem } from './systems/NeedsSystem';
import { StorageSystem } from './systems/StorageSystem';
import { PopulationSystem } from './systems/PopulationSystem';
import { SeasonSystem } from './systems/SeasonSystem';
import { TradeSystem } from './systems/TradeSystem';
import { EnvironmentSystem } from './systems/EnvironmentSystem';
import { DiseaseSystem } from './systems/DiseaseSystem';
import { ParticleSystem } from './systems/ParticleSystem';
import { WeatherSystem } from './systems/WeatherSystem';
import { UIManager } from './ui/UIManager';
import { PlacementController } from './input/PlacementController';
import { GameState, EntityId } from './types';
import {
  TILE_SIZE, STARTING_ADULTS, STARTING_CHILDREN, CITIZEN_SPEED,
  STARTING_RESOURCES, ResourceType, TileType, Profession, FOOD_TYPES,
  SPEED_OPTIONS, BuildingType,
} from './constants';

export class Game {
  // Core
  readonly canvas: HTMLCanvasElement;
  readonly eventBus = new EventBus();
  readonly rng: Random;
  readonly tileMap: TileMap;
  readonly camera: Camera;
  readonly input: InputManager;
  readonly world: World;
  readonly pathfinder: Pathfinder;

  /** Logical (CSS) pixel dimensions — use these for layout, not canvas.width/height */
  logicalWidth = window.innerWidth;
  logicalHeight = window.innerHeight;

  // Controllers
  private cameraController: CameraController;
  private placementController: PlacementController;

  // Systems
  private renderSystem: RenderSystem;
  private movementSystem: MovementSystem;
  private citizenAI: CitizenAISystem;
  private constructionSystem: ConstructionSystem;
  private productionSystem: ProductionSystem;
  private needsSystem: NeedsSystem;
  private storageSystem: StorageSystem;
  private populationSystem: PopulationSystem;
  private seasonSystem: SeasonSystem;
  private tradeSystem: TradeSystem;
  private environmentSystem: EnvironmentSystem;
  private diseaseSystem: DiseaseSystem;
  particleSystem: ParticleSystem;
  weatherSystem: WeatherSystem;
  private uiManager: UIManager;
  private loop: GameLoop;

  // State
  state: GameState;

  // Global resource storage (simplified: single pool tracked globally)
  globalResources = new Map<string, number>();

  constructor(canvas: HTMLCanvasElement, seed?: number) {
    this.canvas = canvas;
    this.rng = new Random(seed ?? Date.now());

    // Resize canvas to fill window
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());

    // Create map
    this.tileMap = new TileMap();
    const mapGen = new MapGenerator();
    mapGen.generate(this.tileMap, this.rng.int(0, 999999));

    // Camera and input
    this.camera = new Camera(this.logicalWidth, this.logicalHeight);
    const startPos = mapGen.findStartLocation(this.tileMap);
    this.camera.centerOn(startPos.x, startPos.y);

    this.input = new InputManager(canvas);
    this.cameraController = new CameraController(this.camera, this.input);

    // ECS
    this.world = new World();
    this.pathfinder = new Pathfinder(this.tileMap);

    // State
    this.state = {
      tick: 0,
      year: 1,
      subSeason: 0,
      tickInSubSeason: 0,
      speed: 1,
      paused: false,
      population: 0,
      totalDeaths: 0,
      totalBirths: 0,
      selectedEntity: null,
      placingBuilding: null,
      gameOver: false,
      dayProgress: 0.3,
      isNight: false,
      isDusk: false,
      isDawn: false,
      nightAlpha: 0,
    };

    // Initialize resources
    for (const [key, val] of Object.entries(STARTING_RESOURCES)) {
      this.globalResources.set(key, val);
    }

    // Systems
    this.renderSystem = new RenderSystem(canvas, this.camera, this.tileMap);
    this.movementSystem = new MovementSystem(this.world, this.tileMap);
    this.citizenAI = new CitizenAISystem(this);
    this.constructionSystem = new ConstructionSystem(this);
    this.productionSystem = new ProductionSystem(this);
    this.needsSystem = new NeedsSystem(this);
    this.storageSystem = new StorageSystem(this);
    this.populationSystem = new PopulationSystem(this);
    this.seasonSystem = new SeasonSystem(this);
    this.tradeSystem = new TradeSystem(this);
    this.environmentSystem = new EnvironmentSystem(this);
    this.diseaseSystem = new DiseaseSystem(this);
    this.particleSystem = new ParticleSystem(this);
    this.weatherSystem = new WeatherSystem(this);

    // UI
    this.uiManager = new UIManager(this);
    this.placementController = new PlacementController(this);

    // Input handling
    this.input.onClick((x, y, button) => {
      if (button === 2) {
        // Right click cancels placement
        if (this.state.placingBuilding) {
          this.state.placingBuilding = null;
          return;
        }
      }
      if (button === 0) {
        // Check UI first
        if (this.uiManager.handleClick(x, y)) return;

        // Placement
        if (this.state.placingBuilding) {
          this.placementController.tryPlace(x, y);
          return;
        }

        // Select entity
        this.selectEntityAt(x, y);
      }
    });

    // Spawn starting citizens
    this.spawnStartingCitizens(startPos.x, startPos.y);

    // Create initial stockpile at start location
    this.createStartingStockpile(startPos.x, startPos.y);

    // Game loop
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      (interp) => this.render(interp),
    );
  }

  start(): void {
    this.loop.start();
  }

  private resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    this.logicalWidth = window.innerWidth;
    this.logicalHeight = window.innerHeight;
    this.canvas.width = this.logicalWidth * dpr;
    this.canvas.height = this.logicalHeight * dpr;
    this.canvas.style.width = this.logicalWidth + 'px';
    this.canvas.style.height = this.logicalHeight + 'px';
    this.camera?.resize(this.logicalWidth, this.logicalHeight);
    this.renderSystem?.setDPR(dpr);
  }

  private update(_dt: number): void {
    if (this.state.gameOver) return;

    this.state.tick++;

    // Update systems in order
    this.seasonSystem.update();
    this.citizenAI.update();
    this.movementSystem.update();
    this.constructionSystem.update();
    this.productionSystem.update();
    this.needsSystem.update();
    this.storageSystem.update();
    this.populationSystem.update();
    this.tradeSystem.update();
    this.environmentSystem.update();
    this.diseaseSystem.update();
    this.particleSystem.update();
    this.weatherSystem.update();

    // Update population count
    const citizens = this.world.getComponentStore('citizen');
    this.state.population = citizens ? citizens.size : 0;

    // Check game over
    if (this.state.tick > 100 && this.state.population === 0) {
      this.state.gameOver = true;
    }
  }

  private render(interp: number): void {
    // Update camera
    this.cameraController.update(1 / 60);

    // Handle keyboard shortcuts
    this.handleKeyboardShortcuts();

    // Gather entity data for rendering
    const citizens = this.getCitizenRenderData();
    const buildings = this.getBuildingRenderData();
    const ghosts = this.placementController.getGhostData();

    const drawParticles = (ctx: CanvasRenderingContext2D) => this.particleSystem.draw(ctx);
    this.renderSystem.render(interp, this.state, { citizens, buildings, ghosts, drawParticles });

    // Draw UI on top
    this.uiManager.draw(this.canvas.getContext('2d')!);
    this.renderSystem.drawHUD(this.state, this.globalResources, this.weatherSystem.currentWeather);
  }

  private handleKeyboardShortcuts(): void {
    if (this.input.isKeyDown(' ')) {
      this.state.paused = !this.state.paused;
      this.loop.setSpeed(this.state.paused ? 0 : this.state.speed);
      this.input.keys.delete(' ');
    }
    if (this.input.isKeyDown('b')) {
      this.uiManager.toggleBuildMenu();
      this.input.keys.delete('b');
    }
    if (this.input.isKeyDown('escape')) {
      this.state.placingBuilding = null;
      this.state.selectedEntity = null;
      this.uiManager.closePanels();
      this.input.keys.delete('escape');
    }
    if (this.input.isKeyDown('r') && this.state.gameOver) {
      this.restart();
      this.input.keys.delete('r');
    }
    if (this.input.isKeyDown('f3')) {
      this.uiManager.debugOverlay = !this.uiManager.debugOverlay;
      this.input.keys.delete('f3');
    }

    // Speed controls: 1-5
    for (let i = 0; i < SPEED_OPTIONS.length; i++) {
      if (this.input.isKeyDown(String(i + 1))) {
        this.state.speed = SPEED_OPTIONS[i];
        this.state.paused = this.state.speed === 0;
        this.loop.setSpeed(this.state.speed);
        this.input.keys.delete(String(i + 1));
      }
    }
  }

  private restart(): void {
    // Simple restart by reloading
    window.location.reload();
  }

  private spawnStartingCitizens(cx: number, cy: number): void {
    for (let i = 0; i < STARTING_ADULTS + STARTING_CHILDREN; i++) {
      const isChild = i >= STARTING_ADULTS;
      const isMale = i % 2 === 0;
      const age = isChild ? this.rng.int(1, 8) : this.rng.int(18, 35);

      const ox = this.rng.int(-3, 3);
      const oy = this.rng.int(-3, 3);
      const tx = cx + ox;
      const ty = cy + oy;

      const id = this.world.createEntity();

      this.world.addComponent(id, 'position', {
        tileX: tx, tileY: ty,
        pixelX: tx * TILE_SIZE + TILE_SIZE / 2,
        pixelY: ty * TILE_SIZE + TILE_SIZE / 2,
      });

      this.world.addComponent(id, 'citizen', {
        name: this.generateName(isMale),
        age,
        isMale,
        isChild,
        isEducated: false,
        isSleeping: false,
      });

      this.world.addComponent(id, 'movement', {
        path: [],
        speed: CITIZEN_SPEED,
        targetEntity: null,
        moving: false,
      });

      this.world.addComponent(id, 'worker', {
        profession: Profession.LABORER,
        workplaceId: null,
        carrying: null,
        carryAmount: 0,
        task: null,
      });

      this.world.addComponent(id, 'needs', {
        food: 80 + this.rng.int(0, 20),
        warmth: 100,
        health: 100,
        happiness: 80 + this.rng.int(0, 20),
        energy: 80 + this.rng.int(0, 20),
      });

      this.world.addComponent(id, 'family', {
        partnerId: null,
        childrenIds: [],
        homeId: null,
      });

      this.world.addComponent(id, 'renderable', {
        sprite: null,
        layer: 10,
        animFrame: 0,
        visible: true,
      });
    }
  }

  private createStartingStockpile(cx: number, cy: number): void {
    // Place a stockpile near the center
    const sx = cx + 3;
    const sy = cy + 3;

    if (this.tileMap.isAreaBuildable(sx, sy, 4, 4)) {
      const id = this.world.createEntity();
      this.world.addComponent(id, 'position', {
        tileX: sx, tileY: sy,
        pixelX: sx * TILE_SIZE, pixelY: sy * TILE_SIZE,
      });
      this.world.addComponent(id, 'building', {
        type: BuildingType.STOCKPILE,
        completed: true,
        constructionProgress: 1,
        width: 4,
        height: 4,
        category: 'Storage',
        name: 'Stockpile',
        maxWorkers: 0,
        workRadius: 0,
        assignedWorkers: [],
      });
      this.world.addComponent(id, 'storage', {
        inventory: new Map<string, number>(),
        capacity: 5000,
      });
      this.world.addComponent(id, 'renderable', {
        sprite: null,
        layer: 5,
        animFrame: 0,
        visible: true,
      });
      this.tileMap.markOccupied(sx, sy, 4, 4, id);
    }
  }

  private generateName(isMale: boolean): string {
    const maleNames = ['John', 'William', 'Thomas', 'Richard', 'Henry', 'Robert', 'Edward', 'George', 'James', 'Arthur'];
    const femaleNames = ['Mary', 'Elizabeth', 'Anne', 'Margaret', 'Catherine', 'Jane', 'Alice', 'Eleanor', 'Rose', 'Sarah'];
    return isMale ? this.rng.pick(maleNames) : this.rng.pick(femaleNames);
  }

  private selectEntityAt(screenX: number, screenY: number): void {
    const tile = this.camera.screenToTile(screenX, screenY);

    // Check citizens first
    const positions = this.world.getComponentStore<any>('position');
    const citizens = this.world.getComponentStore<any>('citizen');
    if (positions && citizens) {
      let closest: EntityId | null = null;
      let closestDist = 2; // max 2 tiles away

      for (const [id] of citizens) {
        const pos = positions.get(id);
        if (!pos) continue;
        const dx = pos.tileX - tile.x;
        const dy = pos.tileY - tile.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closest = id;
        }
      }

      if (closest !== null) {
        this.state.selectedEntity = closest;
        return;
      }
    }

    // Check buildings
    const tileData = this.tileMap.get(tile.x, tile.y);
    if (tileData?.buildingId) {
      this.state.selectedEntity = tileData.buildingId;
      return;
    }

    this.state.selectedEntity = null;
  }

  getCitizenRenderData() {
    const result: Array<{
      id: EntityId; x: number; y: number; isMale: boolean;
      isChild: boolean; health: number; isSleeping: boolean; isSick: boolean; isChatting: boolean;
    }> = [];
    const positions = this.world.getComponentStore<any>('position');
    const citizens = this.world.getComponentStore<any>('citizen');
    const needs = this.world.getComponentStore<any>('needs');

    if (!positions || !citizens) return result;

    for (const [id, cit] of citizens) {
      const pos = positions.get(id);
      if (!pos) continue;
      const need = needs?.get(id);
      result.push({
        id,
        x: pos.tileX,
        y: pos.tileY,
        isMale: cit.isMale,
        isChild: cit.isChild,
        health: need?.health ?? 100,
        isSleeping: cit.isSleeping ?? false,
        isSick: need?.isSick ?? false,
        isChatting: (cit.chatTimer ?? 0) > 0,
      });
    }
    return result;
  }

  getBuildingRenderData() {
    const result: Array<{
      id: EntityId; x: number; y: number; w: number; h: number;
      category: string; completed: boolean; progress: number; name: string;
      type: string;
    }> = [];
    const positions = this.world.getComponentStore<any>('position');
    const buildings = this.world.getComponentStore<any>('building');

    if (!positions || !buildings) return result;

    for (const [id, bld] of buildings) {
      const pos = positions.get(id);
      if (!pos) continue;
      result.push({
        id,
        x: pos.tileX,
        y: pos.tileY,
        w: bld.width,
        h: bld.height,
        category: bld.category,
        completed: bld.completed,
        progress: bld.constructionProgress,
        name: bld.name,
        type: bld.type,
      });
    }
    return result;
  }

  /** Get total of a resource across all storage buildings + global pool */
  getResource(type: string): number {
    return this.globalResources.get(type) || 0;
  }

  /** Add resource to global pool */
  addResource(type: string, amount: number): void {
    this.globalResources.set(type, (this.globalResources.get(type) || 0) + amount);
  }

  /** Remove resource from global pool, returns actual amount removed */
  removeResource(type: string, amount: number): number {
    const current = this.globalResources.get(type) || 0;
    const removed = Math.min(current, amount);
    this.globalResources.set(type, current - removed);
    return removed;
  }

  /** Get total food across all food types */
  getTotalFood(): number {
    let total = 0;
    for (const ft of FOOD_TYPES) {
      total += this.getResource(ft);
    }
    total += this.getResource('food'); // generic starting food
    return total;
  }

  /** Remove food (picks from available types) */
  removeFood(amount: number): number {
    let remaining = amount;
    // Try generic food first
    remaining -= this.removeResource('food', remaining);
    // Then specific types
    for (const ft of FOOD_TYPES) {
      if (remaining <= 0) break;
      remaining -= this.removeResource(ft, remaining);
    }
    return amount - remaining;
  }

  /** Remove food and return the type consumed (prefers types not in avoidList) */
  removeFoodPreferVariety(amount: number, recentDiet: string[]): { eaten: number; type: string } {
    // Count how often each type appears in recent diet
    const dietCounts = new Map<string, number>();
    for (const t of recentDiet) {
      dietCounts.set(t, (dietCounts.get(t) || 0) + 1);
    }

    // Sort food types by: least-recently-eaten first
    const available: { type: string; count: number }[] = [];
    if (this.getResource('food') >= amount) {
      available.push({ type: 'food', count: dietCounts.get('food') || 0 });
    }
    for (const ft of FOOD_TYPES) {
      if (this.getResource(ft) >= amount) {
        available.push({ type: ft, count: dietCounts.get(ft) || 0 });
      }
    }

    if (available.length === 0) {
      // Fall back to partial removal
      const eaten = this.removeFood(amount);
      return { eaten, type: 'food' };
    }

    // Pick the least-recently-eaten type
    available.sort((a, b) => a.count - b.count);
    const chosen = available[0];
    const eaten = this.removeResource(chosen.type, amount);
    return { eaten, type: chosen.type };
  }
}
