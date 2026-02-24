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
import { CitizenAISystem } from './systems/citizen-ai/CitizenAISystem';
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
import { FestivalSystem } from './systems/FestivalSystem';
import { LivestockSystem } from './systems/LivestockSystem';
import { MilestoneSystem } from './systems/MilestoneSystem';
import { UIManager } from './ui/UIManager';
import { PlacementController } from './input/PlacementController';
import { GameState, EntityId } from './types';
import { SaveData } from './save/SaveTypes';
import { logger } from './utils/Logger';
import { ResourceManager } from './ResourceManager';
import { EntityFactory } from './EntityFactory';
import { getCitizenRenderData, getBuildingRenderData, getTravelerRenderData } from './RenderDataGatherer';
import type { PartnerPreference } from './components/Citizen';
import type { GeneratedCitizenName } from './utils/NameGenerator';
import {
  STARTING_RESOURCES, ResourceType, TileType, Profession,
  SPEED_OPTIONS, TILE_SIZE,
  PARTNER_PREFERENCE_OPPOSITE_SHARE, PARTNER_PREFERENCE_BOTH_SHARE, PARTNER_PREFERENCE_SAME_SHARE,
  MINE_VEIN_EXHAUSTED_THRESHOLD, BuildingType,
  DEMOLITION_WORK_MULT, DEMOLITION_RECLAIM_RATIO,
} from './constants';
import { BUILDING_DEFS } from './data/BuildingDefs';

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

  /** The seed used to generate this game */
  readonly seed: number;

  /** Logical (CSS) pixel dimensions — use these for layout, not canvas.width/height */
  logicalWidth = window.innerWidth;
  logicalHeight = window.innerHeight;

  // Controllers
  private cameraController: CameraController;
  private placementController: PlacementController;

  // Systems (public for save/load access)
  private renderSystem: RenderSystem;
  private movementSystem: MovementSystem;
  citizenAI: CitizenAISystem;
  constructionSystem: ConstructionSystem;
  productionSystem: ProductionSystem;
  private needsSystem: NeedsSystem;
  storageSystem: StorageSystem;
  populationSystem: PopulationSystem;
  private seasonSystem: SeasonSystem;
  tradeSystem: TradeSystem;
  environmentSystem: EnvironmentSystem;
  diseaseSystem: DiseaseSystem;
  particleSystem: ParticleSystem;
  weatherSystem: WeatherSystem;
  festivalSystem: FestivalSystem;
  livestockSystem: LivestockSystem;
  milestoneSystem: MilestoneSystem;
  uiManager: UIManager;
  loop: GameLoop;

  // State
  state: GameState;

  // Resource management (public for save/load direct access)
  resources: ResourceManager;
  private entityFactory: EntityFactory;

  /** Hook called at end of render() — used for pause menu overlay */
  postRenderHook: ((ctx: CanvasRenderingContext2D) => void) | null = null;
  private mineVeinState = new Map<string, { remaining: number; max: number }>();

  private resizeHandler = () => this.resizeCanvas();

  constructor(canvas: HTMLCanvasElement, seed?: number, skipInit = false) {
    this.canvas = canvas;
    this.seed = seed ?? Date.now();
    this.rng = new Random(this.seed);

    // Resize canvas to fill window
    this.resizeCanvas();
    window.addEventListener('resize', this.resizeHandler);

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
      placingRotation: 0,
      gameOver: false,
      dayProgress: 0.3,
      isNight: false,
      isDusk: false,
      isDawn: false,
      nightAlpha: 0,
      assigningWorker: null,
      festival: null,
      resourceLimits: {},
    };

    // Resource manager
    this.resources = new ResourceManager(this.world);
    for (const [key, val] of Object.entries(STARTING_RESOURCES)) {
      this.resources.globalResources.set(key, val);
    }

    // Entity factory
    this.entityFactory = new EntityFactory(this.world, this.tileMap, this.rng, this.eventBus);

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
    this.festivalSystem = new FestivalSystem(this);
    this.livestockSystem = new LivestockSystem(this);
    this.milestoneSystem = new MilestoneSystem(this);

    // UI
    this.uiManager = new UIManager(this);
    this.placementController = new PlacementController(this);

    // Input handling — mousedown for drag start
    this.input.onMouseDown((x, y, button) => {
      if (button === 0 && this.state.placingBuilding) {
        // Don't start drag if clicking on UI elements (build menu, HUD, minimap, etc.)
        if (this.uiManager.isPointOverUI(x, y)) return;
        this.placementController.startDrag(x, y);
      }
    });

    // Input handling — mouseup (click) for placement/selection
    this.input.onClick((x, y, button) => {
      if (button === 2) {
        // Right click cancels drag first
        if (this.placementController.isDragging()) {
          this.placementController.cancelDrag();
          return;
        }
        // Right click cancels assignment mode
        if (this.state.assigningWorker !== null) {
          this.state.assigningWorker = null;
          return;
        }
        // Right click cancels placement
        if (this.state.placingBuilding) {
          this.state.placingBuilding = null;
          this.state.placingRotation = 0;
          return;
        }
      }
      if (button === 0) {
        // Check UI first
        if (this.uiManager.handleClick(x, y)) return;

        // If dragging, end drag instead of normal placement
        if (this.placementController.isDragging()) {
          this.placementController.endDrag(x, y);
          return;
        }

        // If drag was cancelled (e.g. right-click mid-drag), swallow this mouseup
        if (this.placementController.consumeDragCancelled()) return;

        // Assignment mode: click a building to assign worker
        if (this.state.assigningWorker !== null) {
          this.tryAssignAtClick(x, y);
          return;
        }

        // Placement
        if (this.state.placingBuilding) {
          this.placementController.tryPlace(x, y);
          return;
        }

        // Select entity
        this.selectEntityAt(x, y);
      }
    });

    if (!skipInit) {
      // Spawn starting citizens
      this.entityFactory.spawnStartingCitizens(startPos.x, startPos.y);
      this.populationSystem.initializeStartingRelationships();

      // Create initial stockpile at start location
      this.entityFactory.createStartingStockpile(startPos.x, startPos.y);

      // Create starting buildings (house + gathering hut)
      this.entityFactory.createStartingBuildings(startPos.x, startPos.y);
    }

    // Game loop
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      (interp) => this.render(interp),
    );
  }

  /** Create a Game instance from saved data */
  static fromSaveData(canvas: HTMLCanvasElement, data: SaveData): Game {
    const game = new Game(canvas, data.seed, true);
    game.restoreFromSave(data);
    return game;
  }

  /** Restore all game state from save data */
  restoreFromSave(data: SaveData): void {
    // Restore game state (minus transient UI fields)
    Object.assign(this.state, data.gameState);
    this.state.selectedEntity = null;
    this.state.placingBuilding = null;
    this.state.assigningWorker = null;
    if (!this.state.resourceLimits) this.state.resourceLimits = {}; // backwards compat

    // Restore RNG
    this.rng.setState(data.rngState);

    // Restore global resources
    this.resources.deserialize(data.globalResources);

    // Restore tiles (compact tuple: [type, trees, fertility, elevation, occupied, buildingId, stone, iron])
    for (let i = 0; i < data.tiles.length; i++) {
      const t = data.tiles[i];
      const tile = this.tileMap.tiles[i];
      tile.type = t[0] as TileType;
      tile.trees = t[1];
      tile.fertility = t[2];
      tile.elevation = t[3];
      tile.occupied = !!t[4];
      tile.buildingId = t[5];
      tile.stoneAmount = t[6];
      tile.ironAmount = t[7];
      tile.blocksMovement = !!(t as any)[8];
      tile.berries = (t as any)[9] || 0;
      tile.mushrooms = (t as any)[10] || 0;
      tile.herbs = (t as any)[11] || 0;
      tile.fish = (t as any)[12] || 0;
      tile.wildlife = (t as any)[13] || 0;
    }

    // Restore ECS world
    this.world.deserialize(data.world);
    this.ensureCitizenPreferenceCompatibility();
    this.mineVeinState = new Map(data.mineVeinState || []);
    this.syncMineVeinStateFromWorld();

    // Restore camera
    this.camera.x = data.camera.x;
    this.camera.y = data.camera.y;
    this.camera.zoom = data.camera.zoom;

    // Restore system state
    this.weatherSystem.setInternalState(data.systems.weather);
    this.tradeSystem.setInternalState(data.systems.trade);
    this.environmentSystem.setInternalState(data.systems.environment);
    this.productionSystem.setInternalState(data.systems.production);
    this.citizenAI.setInternalState(data.systems.citizenAI);
    this.diseaseSystem.setInternalState(data.systems.disease);
    this.populationSystem.setInternalState(data.systems.population);
    this.storageSystem.setInternalState(data.systems.storage);
    this.particleSystem.setInternalState(data.systems.particle);
    if (data.systems.festival) {
      this.festivalSystem.setInternalState(data.systems.festival);
    }
    if (data.systems.livestock) {
      this.livestockSystem.setInternalState(data.systems.livestock);
    }
    if (data.systems.milestone) {
      this.milestoneSystem.setInternalState(data.systems.milestone);
    }

    // Restore event log
    if (data.eventLog) {
      this.uiManager.getEventLog().setEntries(data.eventLog);
    }

    // Clear pathfinder cache
    this.pathfinder.clearCache();

    // Invalidate terrain render cache
    this.renderSystem.invalidateTerrain();

    // Restore speed
    this.loop.setSpeed(this.state.paused ? 0 : this.state.speed);
  }

  start(): void {
    this.loop.start();
  }

  /** Stop the game loop and clean up */
  destroy(): void {
    this.loop.stop();
    this.input.destroy();
    window.removeEventListener('resize', this.resizeHandler);
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
    this.festivalSystem.update();
    this.livestockSystem.update();
    this.milestoneSystem.update();

    // Update population count
    const citizens = this.world.getComponentStore('citizen');
    this.state.population = citizens ? citizens.size : 0;

    // Periodic game state summary (every 600 ticks = 1 day)
    if (this.state.tick % 600 === 0) {
      const totalFood = this.getTotalFood();
      const firewood = this.getResource(ResourceType.FIREWOOD);
      logger.info('GAME', `Day summary (tick=${this.state.tick}): pop=${this.state.population}, food=${totalFood.toFixed(0)}, firewood=${firewood.toFixed(0)}, deaths=${this.state.totalDeaths}, births=${this.state.totalBirths}`);
    }

    // Check game over
    if (this.state.tick > 100 && this.state.population === 0) {
      this.state.gameOver = true;
    }
  }

  private render(interp: number): void {
    // Intercept scroll for event log before camera processes it
    if (this.input.scrollDelta !== 0) {
      if (this.uiManager.handleScroll(this.input.scrollDelta, this.input.mouseX, this.input.mouseY)) {
        this.input.consumeScroll();
      }
    }

    // Update camera
    this.cameraController.update(1 / 60);

    // Handle keyboard shortcuts
    this.handleKeyboardShortcuts();

    // Gather entity data for rendering
    const citizens = getCitizenRenderData(this.world);
    const travelers = getTravelerRenderData(this.world);
    const resourceMap = this.resources.buildResourceMap();
    const buildings = getBuildingRenderData(this.world, this.state.assigningWorker, resourceMap);
    const ghosts = this.placementController.getGhostData();

    const drawParticles = (ctx: CanvasRenderingContext2D) => this.particleSystem.draw(ctx);

    // Get selected citizen's path for rendering
    let selectedPath: Array<{ x: number; y: number }> | undefined;
    if (this.state.selectedEntity !== null) {
      const mov = this.world.getComponent<any>(this.state.selectedEntity, 'movement');
      if (mov?.path && mov.path.length > 0) {
        const pos = this.world.getComponent<any>(this.state.selectedEntity, 'position');
        if (pos) {
          selectedPath = [{ x: pos.tileX, y: pos.tileY }, ...mov.path];
        }
      }
    }

    this.renderSystem.render(interp, this.state, { citizens, travelers, buildings, ghosts, drawParticles, selectedPath });

    // Draw UI on top
    const ctx = this.canvas.getContext('2d')!;
    this.uiManager.draw(ctx);
    this.renderSystem.drawHUD(this.state, resourceMap, this.weatherSystem.currentWeather, this.getStorageUsed(), this.getStorageCapacity());

    // Post-render hook (pause menu overlay)
    if (this.postRenderHook) {
      this.postRenderHook(ctx);
    }
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
      // Cancel drag first
      if (this.placementController.isDragging()) {
        this.placementController.cancelDrag();
      } else if (this.state.assigningWorker !== null) {
        // Cancel assignment mode
        this.state.assigningWorker = null;
      } else if (this.state.placingBuilding || this.state.selectedEntity !== null) {
        this.state.placingBuilding = null;
        this.state.placingRotation = 0;
        this.state.selectedEntity = null;
        this.uiManager.closePanels();
      } else {
        // Nothing to cancel — request pause menu
        this.eventBus.emit('request_pause_menu', {});
      }
      this.input.keys.delete('escape');
    }
    if (this.input.isKeyDown('r')) {
      if (this.state.gameOver) {
        this.restart();
      } else if (this.state.placingBuilding) {
        this.placementController.rotate();
      }
      this.input.keys.delete('r');
    }
    if (this.input.isKeyDown('f3')) {
      this.uiManager.debugOverlay = !this.uiManager.debugOverlay;
      this.input.keys.delete('f3');
    }
    if (this.input.isKeyDown('f4')) {
      logger.cycleLevel();
      this.input.keys.delete('f4');
    }
    if (this.input.isKeyDown('l')) {
      this.uiManager.toggleEventLog();
      this.input.keys.delete('l');
    }
    if (this.input.isKeyDown('g')) {
      this.uiManager.toggleResourceLimitsPanel();
      this.input.keys.delete('g');
    }
    if (this.input.isKeyDown('v')) {
      this.uiManager.toggleVillagerPanel();
      this.input.keys.delete('v');
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

  /** Delegate: generate traits for new citizens (used by PopulationSystem) */
  generateTraits(): string[] {
    return this.entityFactory.generateTraits();
  }

  /** Delegate: generate partner preference for new citizens (used by PopulationSystem) */
  generatePartnerPreference(): PartnerPreference {
    return this.entityFactory.generatePartnerPreference();
  }

  /** Delegate: generate first/last names for new citizens (used by PopulationSystem) */
  generateCitizenName(isMale: boolean): GeneratedCitizenName {
    return this.entityFactory.generateCitizenName(isMale);
  }

  private ensureCitizenPreferenceCompatibility(): void {
    const citizens = this.world.getComponentStore<any>('citizen');
    if (!citizens) return;

    for (const [id, citizen] of citizens) {
      if (citizen.partnerPreference === 'opposite'
        || citizen.partnerPreference === 'both'
        || citizen.partnerPreference === 'same') {
        continue;
      }
      citizen.partnerPreference = this.getLegacyPartnerPreference(id);
    }
  }

  private getLegacyPartnerPreference(entityId: number): PartnerPreference {
    let x = (this.seed ^ Math.imul(entityId, 0x9E3779B1)) | 0;
    if (x === 0) x = 1;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    const roll = (x >>> 0) / 0xFFFFFFFF;
    if (roll < PARTNER_PREFERENCE_OPPOSITE_SHARE) return 'opposite';
    if (roll < PARTNER_PREFERENCE_OPPOSITE_SHARE + PARTNER_PREFERENCE_BOTH_SHARE) return 'both';
    if (roll < PARTNER_PREFERENCE_OPPOSITE_SHARE + PARTNER_PREFERENCE_BOTH_SHARE + PARTNER_PREFERENCE_SAME_SHARE) return 'same';
    return 'same';
  }

  private selectEntityAt(screenX: number, screenY: number): void {
    const tile = this.camera.screenToTile(screenX, screenY);

    // Record clicked tile for debug overlay
    this.uiManager.debugTile = { x: tile.x, y: tile.y };

    const tileData = this.tileMap.get(tile.x, tile.y);
    const clickedBuildingId = tileData?.buildingId ?? null;

    // Check citizens first
    const positions = this.world.getComponentStore<any>('position');
    const citizens = this.world.getComponentStore<any>('citizen');
    if (positions && citizens) {
      let closest: EntityId | null = null;
      // When clicking a building tile, only allow same-tile citizen picks.
      // This prevents nearby/hidden villagers from stealing building clicks.
      const maxCitizenDist = clickedBuildingId !== null ? 0.75 : 2;
      let closestDist = maxCitizenDist;

      for (const [id, citizen] of citizens) {
        if (citizen.insideBuildingId != null) continue;
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
    if (clickedBuildingId !== null) {
      this.state.selectedEntity = clickedBuildingId;
      return;
    }

    this.state.selectedEntity = null;
  }

  /** Assignment mode: try to assign the pending worker to a building at the click position */
  private tryAssignAtClick(screenX: number, screenY: number): void {
    const citizenId = this.state.assigningWorker;
    if (citizenId === null) return;

    const tile = this.camera.screenToTile(screenX, screenY);
    const tileData = this.tileMap.get(tile.x, tile.y);
    if (!tileData?.buildingId) return; // clicked empty tile

    const buildingId = tileData.buildingId;
    const bld = this.world.getComponent<any>(buildingId, 'building');
    if (!bld) return;

    // Validate: accepts workers and has capacity (allow incomplete buildings for construction)
    if (bld.completed) {
      if (bld.maxWorkers === 0) return;
      const currentWorkers = bld.assignedWorkers?.length || 0;
      if (currentWorkers >= bld.maxWorkers) return;
      if (this.isMineOrQuarryDepleted(buildingId)) return;
    }

    this.assignWorkerToBuilding(citizenId, buildingId);
    this.state.assigningWorker = null;
  }

  /** Assign a citizen to a building, setting their profession and manual flag */
  assignWorkerToBuilding(citizenId: EntityId, buildingId: EntityId): void {
    const worker = this.world.getComponent<any>(citizenId, 'worker');
    if (!worker) return;

    const bld = this.world.getComponent<any>(buildingId, 'building');
    if (!bld) return;
    if (bld.completed && this.isMineOrQuarryDepleted(buildingId)) return;

    // Unassign from old workplace first
    if (worker.workplaceId !== null) {
      this.unassignWorker(citizenId);
    }

    worker.workplaceId = buildingId;
    worker.manuallyAssigned = true;

    // Clear current movement path so worker immediately heads to new workplace
    const movement = this.world.getComponent<any>(citizenId, 'movement');
    if (movement) {
      movement.path = [];
      movement.targetEntity = null;
    }

    if (bld.completed) {
      worker.profession = this.populationSystem.getProfessionForBuilding(bld.type);
    } else {
      // Assigning to construction site — worker goes there as a laborer/builder
      worker.profession = Profession.LABORER;
    }

    if (!bld.assignedWorkers) bld.assignedWorkers = [];
    bld.assignedWorkers.push(citizenId);
  }

  /** Unassign a citizen from their current workplace */
  unassignWorker(citizenId: EntityId): void {
    const worker = this.world.getComponent<any>(citizenId, 'worker');
    if (!worker || worker.workplaceId === null) return;

    const bld = this.world.getComponent<any>(worker.workplaceId, 'building');
    if (bld?.assignedWorkers) {
      bld.assignedWorkers = bld.assignedWorkers.filter((w: number) => w !== citizenId);
    }

    worker.workplaceId = null;
    worker.profession = Profession.LABORER;
    worker.manuallyAssigned = false;

    // Clear gather-carry-deposit state
    worker.gatherState = undefined;
    worker.gatherTimer = 0;
    worker.gatherTargetTile = null;
    worker.carrying = null;
    worker.carryAmount = 0;
    worker.pendingResource = null;
    worker.depositTargetId = null;
    worker.demolitionCarryQueue = undefined;
    worker.task = null;
  }

  /** True when a completed quarry/mine has no surface deposits and no usable underground reserve. */
  isMineOrQuarryDepleted(buildingId: EntityId): boolean {
    const bld = this.world.getComponent<any>(buildingId, 'building');
    if (!bld || !bld.completed) return false;
    if (bld.type !== BuildingType.QUARRY && bld.type !== BuildingType.MINE) return false;

    const producer = this.world.getComponent<any>(buildingId, 'producer');
    if (!producer) return false;

    const remaining = bld.type === BuildingType.QUARRY
      ? (producer.undergroundStone ?? 0)
      : (producer.undergroundIron ?? 0);
    if (remaining > MINE_VEIN_EXHAUSTED_THRESHOLD) return false;

    return !this.hasMineOrQuarrySurfaceDeposits(buildingId, bld);
  }

  /** Unassign every worker currently attached to a building; returns release count. */
  releaseWorkersFromBuilding(buildingId: EntityId): number {
    const bld = this.world.getComponent<any>(buildingId, 'building');
    if (!bld?.assignedWorkers?.length) return 0;

    const toRelease = [...bld.assignedWorkers] as EntityId[];
    for (const wId of toRelease) {
      this.unassignWorker(wId);
    }
    return toRelease.length;
  }

  getMineVeinStateSnapshot(): [string, { remaining: number; max: number }][] {
    return [...this.mineVeinState].map(([key, state]) => [key, { ...state }]);
  }

  getOrCreateMineVeinReserve(
    type: string,
    tileX: number,
    tileY: number,
    generatedMax: number,
  ): { remaining: number; max: number } {
    const max = Math.max(0, Math.floor(generatedMax));
    if (type !== BuildingType.QUARRY && type !== BuildingType.MINE) {
      return { remaining: max, max };
    }

    const key = this.getMineVeinKey(type, tileX, tileY);
    const existing = this.mineVeinState.get(key);
    if (existing) return { ...existing };

    const created = { remaining: max, max };
    this.mineVeinState.set(key, created);
    return { ...created };
  }

  updateMineVeinStateFromBuilding(buildingId: EntityId): void {
    const bld = this.world.getComponent<any>(buildingId, 'building');
    if (!bld) return;
    if (bld.type !== BuildingType.QUARRY && bld.type !== BuildingType.MINE) return;

    const pos = this.world.getComponent<any>(buildingId, 'position');
    const producer = this.world.getComponent<any>(buildingId, 'producer');
    if (!pos || !producer) return;

    const remaining = bld.type === BuildingType.QUARRY
      ? (producer.undergroundStone ?? 0)
      : (producer.undergroundIron ?? 0);
    const max = Math.max(0, producer.maxUnderground ?? remaining ?? 0);
    const key = this.getMineVeinKey(bld.type, pos.tileX, pos.tileY);
    this.mineVeinState.set(key, { remaining: Math.max(0, remaining), max });
  }

  initiateDemolition(buildingId: EntityId): boolean {
    const bld = this.world.getComponent<any>(buildingId, 'building');
    if (!bld || !bld.completed || bld.isUpgrading || bld.isDemolishing) return false;

    this.updateMineVeinStateFromBuilding(buildingId);

    const house = this.world.getComponent<any>(buildingId, 'house');
    if (house?.residents) {
      for (const rId of house.residents as EntityId[]) {
        const fam = this.world.getComponent<any>(rId, 'family');
        if (fam?.homeId === buildingId) {
          fam.homeId = null;
        }
      }
      house.residents = [];
    }

    const citizens = this.world.getComponentStore<any>('citizen');
    if (citizens) {
      for (const [, citizen] of citizens) {
        if (citizen.insideBuildingId === buildingId) {
          citizen.insideBuildingId = null;
          citizen.isSleeping = false;
        }
      }
    }

    const refundLog = Math.floor((bld.costLog || 0) * DEMOLITION_RECLAIM_RATIO);
    const refundStone = Math.floor((bld.costStone || 0) * DEMOLITION_RECLAIM_RATIO);
    const refundIron = Math.floor((bld.costIron || 0) * DEMOLITION_RECLAIM_RATIO);
    const pos = this.world.getComponent<any>(buildingId, 'position');

    bld.completed = false;
    bld.constructionProgress = 1;
    bld.materialsDelivered = true;
    bld.isDemolishing = true;
    bld.demolitionProgress = 0;
    bld.demolitionWork = Math.max(1, Math.ceil((bld.constructionWork || 100) * DEMOLITION_WORK_MULT));
    bld.demolitionRefundLog = refundLog;
    bld.demolitionRefundStone = refundStone;
    bld.demolitionRefundIron = refundIron;

    this.eventBus.emit('building_demolition_started', {
      id: buildingId,
      name: bld.name,
      tileX: pos?.tileX,
      tileY: pos?.tileY,
      refundLog,
      refundStone,
      refundIron,
    });
    return true;
  }

  completeDemolition(buildingId: EntityId): void {
    const bld = this.world.getComponent<any>(buildingId, 'building');
    if (!bld) return;

    this.updateMineVeinStateFromBuilding(buildingId);
    const carrierIds = [...(bld.assignedWorkers || [])] as EntityId[];

    const refundLog = Math.max(0, Math.floor(bld.demolitionRefundLog ?? 0));
    const refundStone = Math.max(0, Math.floor(bld.demolitionRefundStone ?? 0));
    const refundIron = Math.max(0, Math.floor(bld.demolitionRefundIron ?? 0));

    const movedStorage: Array<[string, number]> = [];
    const storage = this.world.getComponent<any>(buildingId, 'storage');
    const inventory = storage?.inventory;
    if (inventory instanceof Map) {
      for (const [res, amount] of inventory) {
        if ((amount as number) > 0) movedStorage.push([res as string, amount as number]);
      }
    } else if (inventory && typeof inventory === 'object') {
      for (const [res, amount] of Object.entries(inventory as Record<string, number>)) {
        if ((amount as number) > 0) movedStorage.push([res, amount as number]);
      }
    }
    this.world.removeComponent(buildingId, 'storage');

    const house = this.world.getComponent<any>(buildingId, 'house');
    if (house?.residents) {
      for (const rId of house.residents as EntityId[]) {
        const fam = this.world.getComponent<any>(rId, 'family');
        if (fam?.homeId === buildingId) fam.homeId = null;
      }
      house.residents = [];
    }

    const citizens = this.world.getComponentStore<any>('citizen');
    if (citizens) {
      for (const [, citizen] of citizens) {
        if (citizen.insideBuildingId === buildingId) {
          citizen.insideBuildingId = null;
          citizen.isSleeping = false;
        }
      }
    }

    const pos = this.world.getComponent<any>(buildingId, 'position');
    if (pos) {
      for (let dy = 0; dy < (bld.height || 1); dy++) {
        for (let dx = 0; dx < (bld.width || 1); dx++) {
          this.tileMap.set(pos.tileX + dx, pos.tileY + dy, {
            occupied: false,
            buildingId: null,
            blocksMovement: false,
          });
        }
      }
    }

    this.world.destroyEntity(buildingId);
    for (const [res, amount] of movedStorage) {
      this.addResource(res, amount);
    }
    const queued = this.queueDemolitionReclaimDeliveries(carrierIds, [
      { type: ResourceType.LOG, amount: refundLog },
      { type: ResourceType.STONE, amount: refundStone },
      { type: ResourceType.IRON, amount: refundIron },
    ]);
    if (!queued) {
      this.addResource(ResourceType.LOG, refundLog);
      this.addResource(ResourceType.STONE, refundStone);
      this.addResource(ResourceType.IRON, refundIron);
    }

    if (this.state.selectedEntity === buildingId) {
      this.state.selectedEntity = null;
    }

    this.pathfinder.clearCache();

    this.eventBus.emit('building_demolished', {
      id: buildingId,
      name: bld.name,
      tileX: pos?.tileX,
      tileY: pos?.tileY,
      refundLog,
      refundStone,
      refundIron,
    });
  }

  private queueDemolitionReclaimDeliveries(
    carrierIds: EntityId[],
    deliveries: Array<{ type: ResourceType; amount: number }>,
  ): boolean {
    const workerStore = this.world.getComponentStore<any>('worker');
    if (!workerStore) return false;

    const workers: EntityId[] = [];
    for (const id of carrierIds) {
      const worker = workerStore.get(id);
      if (!worker) continue;

      worker.workplaceId = null;
      worker.profession = Profession.LABORER;
      worker.manuallyAssigned = false;
      worker.gatherState = undefined;
      worker.gatherTimer = 0;
      worker.gatherTargetTile = null;
      worker.carrying = null;
      worker.carryAmount = 0;
      worker.pendingResource = null;
      worker.depositTargetId = null;
      worker.task = null;
      worker.demolitionCarryQueue = undefined;
      workers.push(id);
    }

    const salvage = deliveries.filter(d => d.amount > 0);
    if (salvage.length === 0) return true;
    if (workers.length === 0) return false;

    let idx = 0;
    for (const delivery of salvage) {
      const workerId = workers[idx % workers.length];
      const worker = workerStore.get(workerId)!;
      if (!worker.demolitionCarryQueue) worker.demolitionCarryQueue = [];
      worker.demolitionCarryQueue.push({ type: delivery.type, amount: delivery.amount });
      idx++;
    }

    for (const id of workers) {
      const worker = workerStore.get(id)!;
      const queue = worker.demolitionCarryQueue;
      if (!queue || queue.length === 0) continue;
      const first = queue.shift()!;
      worker.carrying = first.type;
      worker.carryAmount = first.amount;
      worker.task = 'demolish_carry';
    }

    return true;
  }

  private syncMineVeinStateFromWorld(): void {
    const buildings = this.world.getComponentStore<any>('building');
    const producers = this.world.getComponentStore<any>('producer');
    const positions = this.world.getComponentStore<any>('position');
    if (!buildings || !producers || !positions) return;

    for (const [id, bld] of buildings) {
      if (bld.type !== BuildingType.QUARRY && bld.type !== BuildingType.MINE) continue;

      const producer = producers.get(id);
      const pos = positions.get(id);
      if (!producer || !pos) continue;

      const key = this.getMineVeinKey(bld.type, pos.tileX, pos.tileY);
      if (this.mineVeinState.has(key)) continue;

      const remaining = bld.type === BuildingType.QUARRY
        ? (producer.undergroundStone ?? 0)
        : (producer.undergroundIron ?? 0);
      const max = Math.max(0, producer.maxUnderground ?? remaining ?? 0);
      this.mineVeinState.set(key, { remaining: Math.max(0, remaining), max });
    }
  }

  private getMineVeinKey(type: string, tileX: number, tileY: number): string {
    return `${type}:${tileX},${tileY}`;
  }

  private hasMineOrQuarrySurfaceDeposits(buildingId: EntityId, bld: any): boolean {
    const pos = this.world.getComponent<any>(buildingId, 'position');
    if (!pos) return false;

    const isQuarry = bld.type === BuildingType.QUARRY;
    const radius = bld.workRadius || 20;
    const cx = pos.tileX + Math.floor((bld.width || 1) / 2);
    const cy = pos.tileY + Math.floor((bld.height || 1) / 2);
    const r2 = radius * radius;

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tile = this.tileMap.get(cx + dx, cy + dy);
        if (!tile) continue;
        if (isQuarry) {
          if (tile.type === TileType.STONE && (tile.stoneAmount ?? 0) > 0) return true;
        } else if (tile.type === TileType.IRON && (tile.ironAmount ?? 0) > 0) {
          return true;
        }
      }
    }

    return false;
  }

  // ── Resource delegate methods (preserve external API) ──

  getResource(type: string): number { return this.resources.getResource(type); }
  addResource(type: string, amount: number): number { return this.resources.addResource(type, amount); }
  removeResource(type: string, amount: number): number { return this.resources.removeResource(type, amount); }
  getTotalFood(): number { return this.resources.getTotalFood(); }
  removeFood(amount: number): number { return this.resources.removeFood(amount); }
  removeFoodPreferVariety(amount: number, recentDiet: string[]): { eaten: number; type: string } { return this.resources.removeFoodPreferVariety(amount, recentDiet); }
  getStorageCapacity(): number { return this.resources.getStorageCapacity(); }
  getStorageUsed(): number { return this.resources.getStorageUsed(); }
  isStorageFull(): boolean { return this.resources.isStorageFull(); }
  getResourceLimit(type: string): number | undefined { return this.state.resourceLimits[type]; }
  isResourceLimitMet(type: string): boolean {
    const limit = this.getResourceLimit(type);
    if (limit === undefined) return false;
    return this.getResource(type) >= limit;
  }
  addResourceRespectingLimit(type: string, amount: number): number {
    const limit = this.getResourceLimit(type);
    const cappedAmount = limit === undefined
      ? amount
      : Math.max(0, Math.min(amount, limit - this.getResource(type)));
    if (cappedAmount <= 0) return 0;
    return this.addResource(type, cappedAmount);
  }

  setResourceLimit(key: string, limit: number | undefined): void {
    if (limit === undefined) {
      delete this.state.resourceLimits[key];
    } else {
      this.state.resourceLimits[key] = limit;
    }
  }

  /**
   * Initiate an upgrade from a building to its tier-2 variant.
   * Deducts resources, sets upgrade state on the building.
   * Returns true if upgrade was started, false otherwise.
   */
  initiateUpgrade(buildingId: EntityId): boolean {
    const bld = this.world.getComponent<any>(buildingId, 'building');
    if (!bld || !bld.completed || bld.isUpgrading) return false;

    const def = BUILDING_DEFS[bld.type];
    if (!def?.upgradesTo) return false;

    const targetDef = BUILDING_DEFS[def.upgradesTo];
    if (!targetDef) return false;

    const costLog = def.upgradeCostLog ?? 0;
    const costStone = def.upgradeCostStone ?? 0;
    const costIron = def.upgradeCostIron ?? 0;

    if (this.getResource('log') < costLog) return false;
    if (this.getResource('stone') < costStone) return false;
    if (this.getResource('iron') < costIron) return false;

    // For size-expanding upgrades, check extra tiles at initiation time
    if (targetDef.upgradeSizeW || targetDef.upgradeSizeH) {
      const bPos = this.world.getComponent<any>(buildingId, 'position')!;
      const newW = targetDef.upgradeSizeW ?? bld.width;
      const newH = targetDef.upgradeSizeH ?? bld.height;
      if (!this.constructionSystem.checkExtraUpgradeTilesInternal(bPos.tileX, bPos.tileY, bld.width, bld.height, newW, newH)) {
        this.uiManager.addNotification('Cannot upgrade: expansion area is blocked!', '#ff8844');
        return false;
      }
    }

    // Deduct resources
    this.removeResource('log', costLog);
    this.removeResource('stone', costStone);
    this.removeResource('iron', costIron);

    bld.isUpgrading = true;
    bld.upgradeProgress = 0;
    bld.upgradeTotalWork = def.upgradeWork ?? 200;
    bld.upgradeTargetType = def.upgradesTo;

    this.eventBus.emit('building_upgrade_started', {
      id: buildingId, name: bld.name, targetName: targetDef.name,
    });

    return true;
  }
}
