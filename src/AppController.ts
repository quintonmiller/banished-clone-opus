import { Game } from './Game';
import { StartScreen } from './ui/StartScreen';
import { PauseMenu } from './ui/PauseMenu';
import { SettingsPanel } from './ui/SettingsPanel';
import { FairSummaryUI } from './ui/FairSummaryUI';
import { AchievementPanel } from './ui/AchievementPanel';
import { SaveManager } from './save/SaveManager';
import { AchievementStore } from './save/AchievementStore';

const AUTO_SAVE_INTERVAL_MS = 60_000; // auto-save every 60 seconds

type ScreenState = 'START_SCREEN' | 'PLAYING';

export class AppController {
  private canvas: HTMLCanvasElement;
  private screen: ScreenState = 'START_SCREEN';
  private game: Game | null = null;
  private startScreen: StartScreen | null = null;
  private pauseMenu: PauseMenu;
  private settingsPanel: SettingsPanel;
  private fairSummaryUI: FairSummaryUI;
  private achievementPanel: AchievementPanel;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private saveManager = new SaveManager();
  /** Where to return when closing the achievement panel */
  private achievementReturnTo: 'pause' | 'start' | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.pauseMenu = new PauseMenu();
    this.settingsPanel = new SettingsPanel();
    this.fairSummaryUI = new FairSummaryUI();
    this.achievementPanel = new AchievementPanel();
    this.setupPauseMenuCallbacks();
    this.setupSettingsCallbacks();
    this.setupFairSummaryCallbacks();
    this.setupAchievementCallbacks();
  }

  async start(): Promise<void> {
    await this.saveManager.init();
    await AchievementStore.initFromIDB(this.saveManager.idbStore);

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
    this.fairSummaryUI.hide();
    this.canvas.style.cursor = 'default';

    this.startScreen = new StartScreen(this.canvas, this.saveManager);
    this.startScreen.onNewGame = (seed) => this.startNewGame(seed);
    this.startScreen.onLoadGame = () => this.loadGame();
    this.startScreen.onManual = () => {
      const manualUrl = new URL('manual/index.html', window.location.href);
      window.open(manualUrl.toString(), '_blank', 'noopener');
    };
    this.startScreen.onAchievements = () => {
      this.achievementReturnTo = 'start';
      this.achievementPanel.show();
    };
    this.startScreen.overlayHook = (ctx) => {
      this.achievementPanel.draw(ctx);
    };
    this.startScreen.onOverlayMouseMove = (x, y) => {
      if (this.achievementPanel.isVisible()) {
        this.achievementPanel.handleMouseMove(x, y);
        return true;
      }
      return false;
    };
    this.startScreen.onOverlayClick = (x, y) => {
      if (this.achievementPanel.isVisible()) {
        this.achievementPanel.handleClick(x, y);
        return true;
      }
      return false;
    };
    this.startScreen.onOverlayScroll = (delta) => {
      if (this.achievementPanel.isVisible()) {
        this.achievementPanel.handleScroll(delta);
        return true;
      }
      return false;
    };
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

    // If fair was in summary phase when saved, re-show the reward screen
    this.game.festivalSystem.restoreSummaryIfNeeded();

    this.game.uiManager.addNotification('Game loaded!', '#88ff88');

    // Expose for debugging
    (window as any).game = this.game;
  }

  private wireGameEvents(): void {
    if (!this.game) return;

    // Overlay hook — draw pause menu, settings panel, fair summary, or achievement panel
    this.game.postRenderHook = (ctx) => {
      this.fairSummaryUI.draw(ctx);
      this.pauseMenu.draw(ctx);
      this.settingsPanel.draw(ctx);
      this.achievementPanel.draw(ctx);
    };

    // Listen for Escape → pause menu request
    this.game.eventBus.on('request_pause_menu', () => {
      // Don't open pause menu while fair summary is showing
      if (this.fairSummaryUI.isVisible()) return;
      if (this.achievementPanel.isVisible()) {
        this.achievementPanel.onBack?.();
        return;
      }
      if (this.settingsPanel.isVisible()) {
        this.settingsPanel.hide();
        this.pauseMenu.show();
      } else if (this.pauseMenu.isVisible()) {
        this.resumeGame();
      } else {
        this.openPauseMenu();
      }
    });

    // Listen for fair summary event
    this.game.eventBus.on('fair_summary_show', (data: any) => {
      this.fairSummaryUI.show(
        data.stats,
        data.rewardOptions,
        data.type,
        data.year,
        data.prosperity,
      );
    });

    // Intercept mouse events for pause/settings (capture phase to intercept before InputManager)
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onPauseMouseDown, true);
    this.canvas.addEventListener('mouseup', this.onPauseClick, true);
    this.canvas.addEventListener('wheel', this.onOverlayWheel, { capture: true, passive: false });
  }

  private onMouseMove = (e: MouseEvent): void => {
    if (this.achievementPanel.isVisible()) {
      this.achievementPanel.handleMouseMove(e.clientX, e.clientY);
      this.canvas.style.cursor = 'pointer';
    } else if (this.fairSummaryUI.isVisible()) {
      this.fairSummaryUI.handleMouseMove(e.clientX, e.clientY);
      this.canvas.style.cursor = 'pointer';
    } else if (this.settingsPanel.isVisible()) {
      this.settingsPanel.handleMouseMove(e.clientX, e.clientY);
      this.canvas.style.cursor = 'pointer';
    } else if (this.pauseMenu.isVisible()) {
      this.pauseMenu.handleMouseMove(e.clientX, e.clientY);
      this.canvas.style.cursor = 'pointer';
    }
  };

  private onPauseMouseDown = (e: MouseEvent): void => {
    if (this.achievementPanel.isVisible()) {
      e.stopImmediatePropagation();
    } else if (this.fairSummaryUI.isVisible()) {
      e.stopImmediatePropagation();
    } else if (this.settingsPanel.isVisible()) {
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

  private onOverlayWheel = (e: WheelEvent): void => {
    if (this.achievementPanel.isVisible()) {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.achievementPanel.handleScroll(e.deltaY > 0 ? -1 : 1);
    }
  };

  private onPauseClick = (e: MouseEvent): void => {
    if (this.achievementPanel.isVisible()) {
      e.stopImmediatePropagation();
      this.achievementPanel.handleClick(e.clientX, e.clientY);
    } else if (this.fairSummaryUI.isVisible()) {
      e.stopImmediatePropagation();
      this.fairSummaryUI.handleClick(e.clientX, e.clientY);
    } else if (this.settingsPanel.isVisible()) {
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
    this.game.loop.setSpeed(0);
    this.pauseMenu.show();
  }

  private resumeGame(): void {
    if (!this.game) return;
    this.pauseMenu.hide();
    if (this.game.state.speed <= 0) {
      this.game.state.speed = 1;
    }
    this.game.state.paused = false;
    this.game.loop.setSpeed(this.game.state.speed);
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
      this.canvas.removeEventListener('wheel', this.onOverlayWheel, true);
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

    this.pauseMenu.onAchievements = () => {
      this.pauseMenu.hide();
      this.achievementReturnTo = 'pause';
      this.achievementPanel.show();
    };

    this.pauseMenu.onManual = () => {
      const manualUrl = new URL('manual/index.html', window.location.href);
      window.open(manualUrl.toString(), '_blank', 'noopener');
    };

    this.pauseMenu.onMainMenu = async () => {
      // Save before leaving to main menu
      if (this.game && !this.game.state.gameOver) {
        await this.saveManager.saveGame(this.game);
      }
      this.canvas.removeEventListener('mousemove', this.onMouseMove);
      this.canvas.removeEventListener('mousedown', this.onPauseMouseDown, true);
      this.canvas.removeEventListener('mouseup', this.onPauseClick, true);
      this.canvas.removeEventListener('wheel', this.onOverlayWheel, true);
      this.pauseMenu.hide();
      this.showStartScreen();
    };
  }

  private setupFairSummaryCallbacks(): void {
    this.fairSummaryUI.onRewardChosen = (rewardId: string) => {
      if (!this.game) return;
      this.game.festivalSystem.applyReward(rewardId);
      this.fairSummaryUI.hide();
      this.game.festivalSystem.finalizeFair();
      this.canvas.style.cursor = 'default';
    };
  }

  private setupSettingsCallbacks(): void {
    this.settingsPanel.onBack = () => {
      this.settingsPanel.hide();
      this.pauseMenu.show();
    };
  }

  private setupAchievementCallbacks(): void {
    this.achievementPanel.onBack = () => {
      this.achievementPanel.hide();
      if (this.achievementReturnTo === 'pause') {
        this.pauseMenu.show();
      } else if (this.achievementReturnTo === 'start') {
        // Start screen is still running, just hide the panel
      }
      this.achievementReturnTo = null;
      this.canvas.style.cursor = 'default';
    };
  }
}
