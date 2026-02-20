import type { Game } from '../Game';
import {
  HUD_HEIGHT, BUILD_MENU_HEIGHT, INFO_PANEL_WIDTH, MINIMAP_SIZE,
  EVENT_LOG_VISIBLE_ROWS, EVENT_LOG_ROW_HEIGHT, EVENT_LOG_HEADER_HEIGHT,
} from '../constants';
import { BuildMenu } from './BuildMenu';
import { InfoPanel } from './InfoPanel';
import { Minimap } from './Minimap';
import { EventLog } from './EventLog';
import { Settings } from '../Settings';

export class UIManager {
  private game: Game;
  private buildMenu: BuildMenu;
  private infoPanel: InfoPanel;
  private minimap: Minimap;
  private eventLog: EventLog;
  buildMenuOpen = false;
  debugOverlay = false;
  private notifications: Array<{ text: string; time: number; color: string }> = [];

  constructor(game: Game) {
    this.game = game;
    this.buildMenu = new BuildMenu(game);
    this.infoPanel = new InfoPanel(game);
    this.minimap = new Minimap(game);
    this.eventLog = new EventLog(game);

    // Listen for events
    game.eventBus.on('citizen_died', (data: any) => {
      this.addNotification(`${data.name} has died`, '#ff4444');
    });
    game.eventBus.on('citizen_born', () => {
      this.addNotification('A child has been born!', '#44ff44');
    });
    game.eventBus.on('merchant_arrived', () => {
      this.addNotification('A merchant has arrived!', '#ffaa44');
    });
    game.eventBus.on('new_year', (data: any) => {
      this.addNotification(`Year ${data.year} begins`, '#ffffff');
    });
    game.eventBus.on('festival_started', (data: any) => {
      const names: Record<string, string> = {
        planting_day: 'Planting Day',
        midsummer: 'Midsummer Celebration',
        harvest_festival: 'Harvest Festival',
        frost_fair: 'Frost Fair',
      };
      this.addNotification(`${names[data.type] || 'Festival'} has begun!`, '#ffdd44');
    });
    game.eventBus.on('milestone_achieved', (data: any) => {
      this.addNotification(`Milestone: ${data.name}!`, '#ffcc00');
    });
  }

  handleClick(screenX: number, screenY: number): boolean {
    // Event log click (highest priority when visible)
    if (this.eventLog.handleClick(screenX, screenY)) return true;

    // Convert screen coords to UI coords (account for UI scale)
    const s = Settings.get('uiScale');
    const x = screenX / s;
    const y = screenY / s;

    // Build menu click
    if (this.buildMenuOpen) {
      const menuY = this.game.logicalHeight / s - BUILD_MENU_HEIGHT;
      if (y >= menuY) {
        this.buildMenu.handleClick(x, y - menuY);
        return true;
      }
    }

    // HUD click
    if (y < HUD_HEIGHT) {
      this.handleHUDClick(x, y);
      return true;
    }

    // Minimap click
    const mmPos = this.minimap.getPosition(this.game.logicalHeight / s, this.buildMenuOpen, BUILD_MENU_HEIGHT);
    if (x >= mmPos.x && x <= mmPos.x + MINIMAP_SIZE &&
        y >= mmPos.y && y <= mmPos.y + MINIMAP_SIZE) {
      this.minimap.handleClick(x - mmPos.x, y - mmPos.y);
      return true;
    }

    // InfoPanel button clicks
    if (this.game.state.selectedEntity !== null) {
      if (this.infoPanel.handleClick(screenX, screenY)) return true;
    }

    return false;
  }

  private handleHUDClick(x: number, _y: number): void {
    const s = Settings.get('uiScale');
    if (x > this.game.logicalWidth / s - 200) {
      const speeds = [1, 2, 5, 10];
      const currentIdx = speeds.indexOf(this.game.state.speed);
      const nextIdx = (currentIdx + 1) % speeds.length;
      this.game.state.speed = speeds[nextIdx];
      this.game.state.paused = false;
    }
  }

  toggleBuildMenu(): void {
    this.buildMenuOpen = !this.buildMenuOpen;
  }

  closePanels(): void {
    this.buildMenuOpen = false;
  }

  toggleEventLog(): void {
    this.eventLog.visible = !this.eventLog.visible;
  }

  getEventLog(): EventLog {
    return this.eventLog;
  }

  handleScroll(delta: number, mouseX: number, mouseY: number): boolean {
    return this.eventLog.handleScroll(delta, mouseX, mouseY);
  }

  addNotification(text: string, color: string): void {
    this.notifications.push({ text, time: 300, color });
    if (this.notifications.length > 5) {
      this.notifications.shift();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const s = Settings.get('uiScale');

    ctx.save();
    ctx.scale(s, s);

    const w = this.game.logicalWidth / s;
    const h = this.game.logicalHeight / s;

    // Draw build menu
    if (this.buildMenuOpen) {
      this.buildMenu.draw(ctx, w, h);
    }

    // Draw "B" button hint
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(w - 100, h - 30, 90, 25);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    ctx.fillText('[B] Build', w - 95, h - 13);

    // Draw info panel for selected entity
    if (this.game.state.selectedEntity !== null) {
      this.infoPanel.draw(ctx, w, h);
    }

    // Draw minimap (pass build menu state)
    this.minimap.draw(ctx, w, h, this.buildMenuOpen, BUILD_MENU_HEIGHT);

    // Draw event log
    this.eventLog.draw(ctx, w, h);

    // Draw notifications
    this.drawNotifications(ctx);

    // Draw speed indicator on HUD
    this.drawSpeedControls(ctx, w);

    // Draw debug overlay
    if (this.debugOverlay) {
      this.drawDebugOverlay(ctx, w, h);
    }

    // Draw keyboard hint for log
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(w - 100, h - 82, 90, 22);
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText('[L] Log', w - 95, h - 66);

    // Draw keyboard hint for debug
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(w - 100, h - 56, 90, 22);
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText('[F3] Debug', w - 95, h - 40);

    // Assignment mode banner
    if (this.game.state.assigningWorker !== null) {
      const citizenId = this.game.state.assigningWorker;
      const cit = this.game.world.getComponent<any>(citizenId, 'citizen');
      const name = cit?.name || 'Worker';

      const bannerText = `Assign ${name} — Click a building (Right-click / Esc to cancel)`;
      const bannerW = Math.min(w - 20, 520);
      const bannerX = (w - bannerW) / 2;
      const bannerY = HUD_HEIGHT + 4;

      ctx.fillStyle = 'rgba(20, 60, 30, 0.9)';
      ctx.fillRect(bannerX, bannerY, bannerW, 26);
      ctx.strokeStyle = '#44cc66';
      ctx.lineWidth = 1;
      ctx.strokeRect(bannerX, bannerY, bannerW, 26);
      ctx.fillStyle = '#88ff88';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(bannerText, bannerX + 10, bannerY + 18);
    }

    ctx.restore();
  }

  private drawNotifications(ctx: CanvasRenderingContext2D): void {
    // Offset notifications below event log when it's visible
    let y = HUD_HEIGHT + 10;
    if (this.eventLog.visible) {
      y = HUD_HEIGHT + 10 + EVENT_LOG_HEADER_HEIGHT + EVENT_LOG_VISIBLE_ROWS * EVENT_LOG_ROW_HEIGHT + 18;
    }
    for (let i = this.notifications.length - 1; i >= 0; i--) {
      const n = this.notifications[i];
      n.time--;
      if (n.time <= 0) {
        this.notifications.splice(i, 1);
        continue;
      }

      const alpha = Math.min(1, n.time / 60);
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.7})`;
      ctx.fillRect(10, y, 300, 22);
      ctx.fillStyle = n.color;
      ctx.globalAlpha = alpha;
      ctx.font = '12px monospace';
      ctx.fillText(n.text, 15, y + 15);
      ctx.globalAlpha = 1;
      y += 25;
    }
  }

  private drawSpeedControls(ctx: CanvasRenderingContext2D, canvasWidth: number): void {
    const speeds = [1, 2, 5, 10];
    const x = canvasWidth - 180;
    const y = 8;

    ctx.font = '12px monospace';
    for (let i = 0; i < speeds.length; i++) {
      const bx = x + i * 35;
      const isActive = this.game.state.speed === speeds[i] && !this.game.state.paused;
      ctx.fillStyle = isActive ? '#44aa44' : 'rgba(255,255,255,0.3)';
      ctx.fillRect(bx, y, 30, 22);
      ctx.fillStyle = isActive ? '#fff' : '#aaa';
      ctx.fillText(`${speeds[i]}x`, bx + 4, y + 16);
    }

    if (this.game.state.paused) {
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(x + 145, y, 35, 22);
      ctx.fillStyle = '#fff';
      ctx.fillText('||', x + 152, y + 16);
    }
  }

  private drawDebugOverlay(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    const world = this.game.world;
    const cam = this.game.camera;

    // Draw citizen debug info on the game world
    const citizens = world.getComponentStore<any>('citizen');
    const positions = world.getComponentStore<any>('position');
    const workers = world.getComponentStore<any>('worker');
    const movements = world.getComponentStore<any>('movement');
    const needs = world.getComponentStore<any>('needs');

    if (!citizens || !positions) return;

    // Stats panel
    let stuckCount = 0;
    let movingCount = 0;
    let idleCount = 0;
    let workingCount = 0;
    const professionCounts = new Map<string, number>();

    for (const [id] of citizens) {
      const mov = movements?.get(id);
      const worker = workers?.get(id);

      if (mov?.moving) {
        movingCount++;
      } else if (mov?.stuckTicks > 30) {
        stuckCount++;
      } else {
        idleCount++;
      }

      if (worker?.workplaceId !== null && worker?.workplaceId !== undefined) {
        workingCount++;
      }

      if (worker) {
        const prof = worker.profession || 'laborer';
        professionCounts.set(prof, (professionCounts.get(prof) || 0) + 1);
      }
    }

    // Debug panel in top-left
    const panelX = 10;
    const panelY = HUD_HEIGHT + 10;
    const panelW = 240;
    const lines: string[] = [
      `-- DEBUG (F3) --`,
      `Entities: ${world.getEntityCount()}`,
      `Citizens: ${citizens.size}`,
      `Moving: ${movingCount}  Idle: ${idleCount}  Stuck: ${stuckCount}`,
      `Assigned: ${workingCount}  Unassigned: ${citizens.size - workingCount}`,
      `Tick: ${this.game.state.tick}`,
      ``,
      `Professions:`,
    ];

    for (const [prof, count] of professionCounts) {
      lines.push(`  ${prof}: ${count}`);
    }

    lines.push('');
    lines.push('Resources:');
    for (const [key, val] of this.game.globalResources) {
      if (val > 0) lines.push(`  ${key}: ${Math.floor(val)}`);
    }

    const lineHeight = 14;
    const panelH = lines.length * lineHeight + 10;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = '#666';
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.font = '11px monospace';
    for (let i = 0; i < lines.length; i++) {
      ctx.fillStyle = lines[i].includes('Stuck') && stuckCount > 0 ? '#ff6644' : '#cccccc';
      ctx.fillText(lines[i], panelX + 6, panelY + 14 + i * lineHeight);
    }

    // Draw per-citizen debug labels on the world
    for (const [id] of citizens) {
      const pos = positions.get(id);
      if (!pos) continue;

      const screenPos = cam.worldToScreen(
        pos.tileX * 32 + 16,
        pos.tileY * 32 + 16,
      );

      // Skip if off screen
      if (screenPos.x < 0 || screenPos.x > canvasWidth ||
          screenPos.y < 0 || screenPos.y > canvasHeight) continue;

      const mov = movements?.get(id);
      const worker = workers?.get(id);
      const need = needs?.get(id);

      // Small label above citizen
      let label = '';
      let color = '#88ff88';

      if (mov?.stuckTicks > 30) {
        label = 'STUCK';
        color = '#ff4444';
      } else if (mov?.moving) {
        label = 'moving';
        color = '#88ff88';
      } else if (worker?.workplaceId !== null && worker?.workplaceId !== undefined) {
        label = worker.profession?.substring(0, 6) || 'work';
        color = '#88aaff';
      } else {
        label = 'idle';
        color = '#aaaaaa';
      }

      if (need && need.food < 20) {
        label += ' HUNGRY';
        color = '#ffaa44';
      }
      if (need && need.health < 30) {
        label += ' DYING';
        color = '#ff4444';
      }

      ctx.fillStyle = color;
      ctx.font = '9px monospace';
      ctx.fillText(label, screenPos.x - 15, screenPos.y - 12);
    }
  }
}
