import { Game } from './Game';
import { StartScreen } from './ui/StartScreen';
import { PauseMenu } from './ui/PauseMenu';
import { SettingsPanel } from './ui/SettingsPanel';
import { SaveManager } from './save/SaveManager';

const AUTO_SAVE_INTERVAL_MS = 60_000; // auto-save every 60 seconds

type ScreenState = 'START_SCREEN' | 'PLAYING';

export class AppController {
  private canvas: HTMLCanvasElement;
  private screen: ScreenState = 'START_SCREEN';
  private game: Game | null = null;
  private startScreen: StartScreen | null = null;
  private pauseMenu: PauseMenu;
  private settingsPanel: SettingsPanel;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private saveManager = new SaveManager();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.pauseMenu = new PauseMenu();
    this.settingsPanel = new SettingsPanel();
    this.setupPauseMenuCallbacks();
    this.setupSettingsCallbacks();
  }

  async start(): Promise<void> {
    await this.saveManager.init();

    // Try to auto-resume from a save
    const data = await this.saveManager.loadGame();
    if (data) {
      try {
        this.screen = 'PLAYING';
        this.game = Game.fromSaveData(this.canvas, data);
        this.wireGameEvents();
        this.game.start();
        this.startAutoSave();
        (window as any).game = this.game;
        return;
      } catch (e) {
        console.error('Failed to restore save, starting fresh:', e);
        await this.saveManager.deleteSave();
        if (this.game) {
          this.game.destroy();
          this.game = null;
        }
      }
    }
    this.showStartScreen();
  }

  private showStartScreen(): void {
    // Destroy existing game if any
    this.stopAutoSave();
    if (this.game) {
      this.game.destroy();
      this.game = null;
    }

    this.screen = 'START_SCREEN';
    this.pauseMenu.hide();
    this.canvas.style.cursor = 'default';

    this.startScreen = new StartScreen(this.canvas, this.saveManager);
    this.startScreen.onNewGame = (seed) => this.startNewGame(seed);
    this.startScreen.onLoadGame = () => this.loadGame();
    this.startScreen.start();
  }

  private startNewGame(seed: number): void {
    this.startScreen?.stop();
    this.startScreen = null;

    this.screen = 'PLAYING';
    this.game = new Game(this.canvas, seed);
    this.wireGameEvents();
    this.game.start();
    this.startAutoSave();

    // Expose for debugging
    (window as any).game = this.game;
  }

  private async loadGame(): Promise<void> {
    const data = await this.saveManager.loadGame();
    if (!data) return;

    this.startScreen?.stop();
    this.startScreen = null;

    this.screen = 'PLAYING';
    this.game = Game.fromSaveData(this.canvas, data);
    this.wireGameEvents();
    this.game.start();
    this.startAutoSave();

    this.game.uiManager.addNotification('Game loaded!', '#88ff88');

    // Expose for debugging
    (window as any).game = this.game;
  }

  private wireGameEvents(): void {
    if (!this.game) return;

    // Overlay hook — draw pause menu or settings panel
    this.game.postRenderHook = (ctx) => {
      this.pauseMenu.draw(ctx);
      this.settingsPanel.draw(ctx);
    };

    // Listen for Escape → pause menu request
    this.game.eventBus.on('request_pause_menu', () => {
      if (this.settingsPanel.isVisible()) {
        this.settingsPanel.hide();
        this.pauseMenu.show();
      } else if (this.pauseMenu.isVisible()) {
        this.resumeGame();
      } else {
        this.openPauseMenu();
      }
    });

    // Intercept mouse events for pause/settings (capture phase to intercept before InputManager)
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onPauseMouseDown, true);
    this.canvas.addEventListener('mouseup', this.onPauseClick, true);
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (this.settingsPanel.isVisible()) {
      this.settingsPanel.handleMouseMove(e.clientX, e.clientY);
      this.canvas.style.cursor = 'pointer';
    } else if (this.pauseMenu.isVisible()) {
      this.pauseMenu.handleMouseMove(e.clientX, e.clientY);
      this.canvas.style.cursor = 'pointer';
    }
  };

  private onPauseMouseDown = (e: MouseEvent): void => {
    if (this.settingsPanel.isVisible()) {
      e.stopImmediatePropagation();
      this.settingsPanel.handleMouseDown(e.clientX, e.clientY);
    }
  };

  /** Sync save — used only by beforeunload (must be synchronous). */
  private saveOnLeaveSync = (): void => {
    if (this.game && !this.game.state.gameOver) {
      this.saveManager.saveSync(this.game);
    }
  };

  /** Async save — used by visibilitychange (fire-and-forget). */
  private onVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden' && this.game && !this.game.state.gameOver) {
      this.saveManager.saveGame(this.game);
    }
  };

  private onPauseClick = (e: MouseEvent): void => {
    if (this.settingsPanel.isVisible()) {
      e.stopImmediatePropagation();
      this.settingsPanel.handleMouseUp(e.clientX, e.clientY);
    } else if (this.pauseMenu.isVisible()) {
      e.stopImmediatePropagation();
      this.pauseMenu.handleClick(e.clientX, e.clientY);
    }
  };

  private openPauseMenu(): void {
    if (!this.game) return;
    this.game.state.paused = true;
    this.pauseMenu.show();
  }

  private resumeGame(): void {
    if (!this.game) return;
    this.pauseMenu.hide();
    this.game.state.paused = false;
    this.canvas.style.cursor = 'default';
  }

  private startAutoSave(): void {
    this.stopAutoSave();
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('beforeunload', this.saveOnLeaveSync);
    this.autoSaveTimer = setInterval(() => {
      if (this.game && !this.game.state.gameOver) {
        this.saveManager.saveGame(this.game);
      }
    }, AUTO_SAVE_INTERVAL_MS);
  }

  private stopAutoSave(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('beforeunload', this.saveOnLeaveSync);
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  private setupPauseMenuCallbacks(): void {
    this.pauseMenu.onResume = () => this.resumeGame();

    this.pauseMenu.onSave = async () => {
      if (!this.game) return;
      const ok = await this.saveManager.saveGame(this.game);
      if (ok) {
        this.game.uiManager.addNotification('Game saved!', '#88ff88');
      } else {
        this.game.uiManager.addNotification('Save failed!', '#ff4444');
      }
      this.resumeGame();
    };

    this.pauseMenu.onLoad = async () => {
      const data = await this.saveManager.loadGame();
      if (!data) return;

      // Clean up current game
      this.canvas.removeEventListener('mousemove', this.onMouseMove);
      this.canvas.removeEventListener('mousedown', this.onPauseMouseDown, true);
      this.canvas.removeEventListener('mouseup', this.onPauseClick, true);
      this.pauseMenu.hide();
      this.stopAutoSave();

      if (this.game) {
        this.game.destroy();
        this.game = null;
      }

      this.screen = 'PLAYING';
      this.game = Game.fromSaveData(this.canvas, data);
      this.wireGameEvents();
      this.game.start();
      this.startAutoSave();

      this.game.uiManager.addNotification('Game loaded!', '#88ff88');
      (window as any).game = this.game;
    };

    this.pauseMenu.onSettings = () => {
      this.pauseMenu.hide();
      this.settingsPanel.show();
    };

    this.pauseMenu.onMainMenu = async () => {
      // Save before leaving to main menu
      if (this.game && !this.game.state.gameOver) {
        await this.saveManager.saveGame(this.game);
      }
      this.canvas.removeEventListener('mousemove', this.onMouseMove);
      this.canvas.removeEventListener('mousedown', this.onPauseMouseDown, true);
      this.canvas.removeEventListener('mouseup', this.onPauseClick, true);
      this.pauseMenu.hide();
      this.showStartScreen();
    };
  }

  private setupSettingsCallbacks(): void {
    this.settingsPanel.onBack = () => {
      this.settingsPanel.hide();
      this.pauseMenu.show();
    };
  }
}
