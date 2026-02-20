import type { Game } from '../Game';
import { EventLogEntry } from '../types';
import {
  HUD_HEIGHT,
  EVENT_LOG_WIDTH,
  EVENT_LOG_MAX_ENTRIES,
  EVENT_LOG_VISIBLE_ROWS,
  EVENT_LOG_ROW_HEIGHT,
  EVENT_LOG_HEADER_HEIGHT,
} from '../constants';
import { Settings } from '../Settings';

const PANEL_X = 10;
const PANEL_Y = HUD_HEIGHT + 10;
const PANEL_PADDING = 6;

export class EventLog {
  private game: Game;
  private entries: EventLogEntry[] = [];
  private nextId = 0;
  private scrollOffset = 0;
  visible = false;

  // Hit rects (recalculated each frame in draw)
  private closeBtnRect = { x: 0, y: 0, w: 0, h: 0 };
  private scrollUpRect = { x: 0, y: 0, w: 0, h: 0 };
  private scrollDownRect = { x: 0, y: 0, w: 0, h: 0 };
  private entryRects: Array<{ x: number; y: number; w: number; h: number; entry: EventLogEntry }> = [];
  private panelRect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(game: Game) {
    this.game = game;
    this.subscribeToEvents();
  }

  private subscribeToEvents(): void {
    const bus = this.game.eventBus;

    bus.on('citizen_born', (data: any) => {
      const mother = this.game.world.getComponent<any>(data.motherId, 'citizen');
      const motherName = mother?.name || 'a citizen';
      const pos = this.game.world.getComponent<any>(data.motherId, 'position');
      this.addEntry('population', `A child has been born to ${motherName}`, '#44dd44',
        data.id, pos?.tileX, pos?.tileY);
    });

    bus.on('citizen_died', (data: any) => {
      this.addEntry('population', `${data.name} has died`, '#ff4444', data.id);
    });

    bus.on('citizen_pregnant', (data: any) => {
      const cit = this.game.world.getComponent<any>(data.id, 'citizen');
      const name = cit?.name || 'A citizen';
      const pos = this.game.world.getComponent<any>(data.id, 'position');
      this.addEntry('population', `${name} is expecting a child`, '#aaddaa',
        data.id, pos?.tileX, pos?.tileY);
    });

    bus.on('nomads_arrived', (data: any) => {
      this.addEntry('population', `${data.count} nomads have arrived`, '#44dd44');
    });

    bus.on('citizen_sick', (data: any) => {
      const pos = this.game.world.getComponent<any>(data.id, 'position');
      this.addEntry('health', `${data.name} has fallen ill`, '#dddd44',
        data.id, pos?.tileX, pos?.tileY);
    });

    bus.on('citizen_cured', (data: any) => {
      const pos = this.game.world.getComponent<any>(data.id, 'position');
      this.addEntry('health', `${data.name} has recovered`, '#88dd88',
        data.id, pos?.tileX, pos?.tileY);
    });

    bus.on('building_completed', (data: any) => {
      this.addEntry('building', `${data.name} completed`, '#88aaff',
        data.id, data.tileX, data.tileY);
    });

    bus.on('building_collapsed', (data: any) => {
      this.addEntry('building', `${data.name} has collapsed!`, '#ff6644',
        undefined, data.tileX, data.tileY);
    });

    bus.on('merchant_arrived', () => {
      this.addEntry('trade', 'A merchant has arrived', '#ffaa44');
    });

    bus.on('merchant_departed', () => {
      this.addEntry('trade', 'The merchant has departed', '#cc8844');
    });

    bus.on('new_year', (data: any) => {
      this.addEntry('season', `Year ${data.year} begins`, '#ffffff');
    });

    bus.on('season_changed', (data: any) => {
      // Only log when a major season changes (every 3 sub-seasons)
      if (data.subSeason % 3 === 0) {
        const majorSeasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
        const seasonName = majorSeasons[Math.floor(data.subSeason / 3)];
        this.addEntry('season', `${seasonName} has begun`, '#cccccc');
      }
    });

    bus.on('weather_started', (data: any) => {
      const label = data.type === 'harsh_winter' ? 'harsh winter' : data.type;
      this.addEntry('weather', `A ${label} has begun!`, '#ff6666');
    });

    bus.on('weather_cleared', () => {
      this.addEntry('weather', 'The weather has cleared', '#aaddaa');
    });
  }

  addEntry(category: string, text: string, color: string,
    entityId?: number, tileX?: number, tileY?: number): void {
    const s = this.game.state;
    this.entries.push({
      id: this.nextId++,
      tick: s.tick,
      year: s.year,
      subSeason: s.subSeason,
      category,
      text,
      color,
      entityId,
      tileX,
      tileY,
    });

    if (this.entries.length > EVENT_LOG_MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - EVENT_LOG_MAX_ENTRIES);
    }

    // Auto-scroll to bottom when new entry added
    const maxScroll = Math.max(0, this.entries.length - EVENT_LOG_VISIBLE_ROWS);
    this.scrollOffset = maxScroll;
  }

  getEntries(): EventLogEntry[] {
    return this.entries;
  }

  setEntries(entries: EventLogEntry[]): void {
    this.entries = entries;
    this.nextId = entries.length > 0 ? Math.max(...entries.map(e => e.id)) + 1 : 0;
    const maxScroll = Math.max(0, this.entries.length - EVENT_LOG_VISIBLE_ROWS);
    this.scrollOffset = maxScroll;
  }

  handleClick(screenX: number, screenY: number): boolean {
    if (!this.visible) return false;

    const s = Settings.get('uiScale');
    const x = screenX / s;
    const y = screenY / s;

    // Check if click is in panel area
    const pr = this.panelRect;
    if (x < pr.x || x > pr.x + pr.w || y < pr.y || y > pr.y + pr.h) {
      return false;
    }

    // Close button
    const cb = this.closeBtnRect;
    if (x >= cb.x && x <= cb.x + cb.w && y >= cb.y && y <= cb.y + cb.h) {
      this.visible = false;
      return true;
    }

    // Scroll up
    const su = this.scrollUpRect;
    if (su.h > 0 && x >= su.x && x <= su.x + su.w && y >= su.y && y <= su.y + su.h) {
      this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      return true;
    }

    // Scroll down
    const sd = this.scrollDownRect;
    if (sd.h > 0 && x >= sd.x && x <= sd.x + sd.w && y >= sd.y && y <= sd.y + sd.h) {
      const maxScroll = Math.max(0, this.entries.length - EVENT_LOG_VISIBLE_ROWS);
      this.scrollOffset = Math.min(maxScroll, this.scrollOffset + 1);
      return true;
    }

    // Entry clicks — center camera on event location / select entity
    for (const er of this.entryRects) {
      if (x >= er.x && x <= er.x + er.w && y >= er.y && y <= er.y + er.h) {
        const entry = er.entry;
        if (entry.entityId !== undefined && this.game.world.entityExists(entry.entityId)) {
          this.game.state.selectedEntity = entry.entityId;
          const pos = this.game.world.getComponent<any>(entry.entityId, 'position');
          if (pos) {
            this.game.camera.centerOn(pos.tileX, pos.tileY);
          }
        } else if (entry.tileX !== undefined && entry.tileY !== undefined) {
          this.game.camera.centerOn(entry.tileX, entry.tileY);
        }
        return true;
      }
    }

    return true; // consumed by panel
  }

  handleScroll(delta: number, mouseX: number, mouseY: number): boolean {
    if (!this.visible) return false;

    const s = Settings.get('uiScale');
    const x = mouseX / s;
    const y = mouseY / s;

    const pr = this.panelRect;
    if (x < pr.x || x > pr.x + pr.w || y < pr.y || y > pr.y + pr.h) {
      return false;
    }

    const maxScroll = Math.max(0, this.entries.length - EVENT_LOG_VISIBLE_ROWS);
    // delta > 0 means scroll up (zoom in for camera), so invert for log scrolling
    this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset - delta));
    return true;
  }

  draw(ctx: CanvasRenderingContext2D, _canvasWidth: number, _canvasHeight: number): void {
    if (!this.visible) return;

    // Clear hit rects
    this.entryRects = [];

    const panelW = EVENT_LOG_WIDTH;
    const panelH = EVENT_LOG_HEADER_HEIGHT + EVENT_LOG_VISIBLE_ROWS * EVENT_LOG_ROW_HEIGHT + PANEL_PADDING * 2;

    // Store panel rect for hit testing
    this.panelRect = { x: PANEL_X, y: PANEL_Y, w: panelW, h: panelH };

    // Background
    ctx.fillStyle = 'rgba(15, 15, 25, 0.9)';
    ctx.fillRect(PANEL_X, PANEL_Y, panelW, panelH);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(PANEL_X, PANEL_Y, panelW, panelH);

    // Header
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('Event Log', PANEL_X + PANEL_PADDING, PANEL_Y + 16);

    // Close button [X]
    const closeX = PANEL_X + panelW - 22;
    const closeY = PANEL_Y + 4;
    this.closeBtnRect = { x: closeX, y: closeY, w: 18, h: 16 };
    ctx.fillStyle = 'rgba(80, 30, 30, 0.6)';
    ctx.fillRect(closeX, closeY, 18, 16);
    ctx.strokeStyle = '#cc4444';
    ctx.strokeRect(closeX, closeY, 18, 16);
    ctx.fillStyle = '#ff6666';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('X', closeX + 4, closeY + 12);

    // Header divider
    const dividerY = PANEL_Y + EVENT_LOG_HEADER_HEIGHT;
    ctx.strokeStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(PANEL_X, dividerY);
    ctx.lineTo(PANEL_X + panelW, dividerY);
    ctx.stroke();

    // Entries area
    const entriesY = dividerY + PANEL_PADDING;
    const maxScroll = Math.max(0, this.entries.length - EVENT_LOG_VISIBLE_ROWS);
    this.scrollOffset = Math.min(this.scrollOffset, maxScroll);

    const visibleCount = Math.min(EVENT_LOG_VISIBLE_ROWS, this.entries.length);
    const startIdx = this.scrollOffset;

    ctx.save();
    // Clip to entries area
    ctx.beginPath();
    ctx.rect(PANEL_X, entriesY - 2, panelW, EVENT_LOG_VISIBLE_ROWS * EVENT_LOG_ROW_HEIGHT + 4);
    ctx.clip();

    for (let i = 0; i < visibleCount; i++) {
      const entryIdx = startIdx + i;
      if (entryIdx >= this.entries.length) break;

      const entry = this.entries[entryIdx];
      const rowY = entriesY + i * EVENT_LOG_ROW_HEIGHT;

      // Highlight on hover-like visual: alternate row backgrounds
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fillRect(PANEL_X + 2, rowY - 2, panelW - 4, EVENT_LOG_ROW_HEIGHT);
      }

      // Year prefix
      ctx.fillStyle = '#666666';
      ctx.font = '10px monospace';
      const yearLabel = `Y${entry.year}`;
      ctx.fillText(yearLabel, PANEL_X + PANEL_PADDING, rowY + 12);

      // Event text (truncated to fit)
      const textX = PANEL_X + PANEL_PADDING + 28;
      const maxTextW = panelW - PANEL_PADDING * 2 - 28;
      ctx.fillStyle = entry.color;
      ctx.font = '11px monospace';

      // Truncate text to fit
      let displayText = entry.text;
      while (ctx.measureText(displayText).width > maxTextW && displayText.length > 3) {
        displayText = displayText.slice(0, -4) + '...';
      }
      ctx.fillText(displayText, textX, rowY + 12);

      // Register entry hit rect (for click-to-navigate)
      if (entry.entityId !== undefined || (entry.tileX !== undefined && entry.tileY !== undefined)) {
        this.entryRects.push({
          x: PANEL_X,
          y: rowY - 2,
          w: panelW,
          h: EVENT_LOG_ROW_HEIGHT,
          entry,
        });
      }
    }

    ctx.restore();

    // Scroll indicators
    const arrowX = PANEL_X + panelW - 16;
    this.scrollUpRect = { x: 0, y: 0, w: 0, h: 0 };
    this.scrollDownRect = { x: 0, y: 0, w: 0, h: 0 };

    if (this.scrollOffset > 0) {
      // Up arrow
      const ay = entriesY - 2;
      this.scrollUpRect = { x: arrowX - 4, y: ay, w: 16, h: 12 };
      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.fillText('\u25B2', arrowX, ay + 10);
    }

    if (this.scrollOffset < maxScroll) {
      // Down arrow
      const ay = entriesY + EVENT_LOG_VISIBLE_ROWS * EVENT_LOG_ROW_HEIGHT - 10;
      this.scrollDownRect = { x: arrowX - 4, y: ay, w: 16, h: 12 };
      ctx.fillStyle = '#888';
      ctx.font = '10px monospace';
      ctx.fillText('\u25BC', arrowX, ay + 10);
    }

    // Empty state
    if (this.entries.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '11px monospace';
      ctx.fillText('No events yet...', PANEL_X + PANEL_PADDING, entriesY + 20);
    }
  }
}
