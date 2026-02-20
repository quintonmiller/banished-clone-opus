import { Camera } from '../map/Camera';
import { TileMap } from '../map/TileMap';
import { TileType, TILE_SIZE, HUD_HEIGHT, TICKS_PER_SUB_SEASON, TICKS_PER_YEAR, DAYS_PER_YEAR } from '../constants';
import { GameState, EntityId, FestivalType } from '../types';
import { Settings } from '../Settings';

// Tile colors
const TILE_COLORS: Record<number, string> = {
  [TileType.GRASS]: '#4a8c3f',
  [TileType.FOREST]: '#2d6b24',
  [TileType.WATER]: '#2856a0',
  [TileType.STONE]: '#8a8a8a',
  [TileType.IRON]: '#6b5b3e',
  [TileType.RIVER]: '#3668b5',
  [TileType.FERTILE]: '#5a9c4a',
  [TileType.ROAD]: '#8a7d6b',
};

// Building placeholder colors by category
const BUILDING_COLORS: Record<string, string> = {
  Housing: '#c4833e',
  Storage: '#8a6d3b',
  Food: '#6aaa3a',
  Resource: '#aa7733',
  Services: '#5577aa',
  Infrastructure: '#8a7d6b',
  'Services_festival': '#ffdd44', // Used during active festivals for Town Hall glow
};

export class RenderSystem {
  private ctx: CanvasRenderingContext2D;
  private terrainBuffer: HTMLCanvasElement | null = null;
  private terrainDirty = true;
  private dpr = window.devicePixelRatio || 1;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera,
    private tileMap: TileMap,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  setDPR(dpr: number): void {
    this.dpr = dpr;
  }

  /** Logical (CSS) pixel width */
  private get logicalWidth(): number {
    return this.canvas.width / this.dpr;
  }

  /** Logical (CSS) pixel height */
  private get logicalHeight(): number {
    return this.canvas.height / this.dpr;
  }

  invalidateTerrain(): void {
    this.terrainDirty = true;
  }

  render(
    _interp: number,
    state: GameState,
    entityData?: {
      citizens: Array<{ id: EntityId; x: number; y: number; isMale: boolean; isChild: boolean; health: number; isSleeping: boolean; isSick: boolean; isChatting: boolean; activity: string; isPregnant: boolean }>;
      buildings: Array<{
        id: EntityId; x: number; y: number; w: number; h: number;
        category: string; completed: boolean; progress: number; name: string;
        type?: string; isValidTarget?: boolean; isFullOrInvalid?: boolean;
      }>;
      ghosts?: Array<{ x: number; y: number; w: number; h: number; valid: boolean }>;
      drawParticles?: (ctx: CanvasRenderingContext2D) => void;
      selectedPath?: Array<{ x: number; y: number }>;
    },
  ): void {
    const ctx = this.ctx;
    const cam = this.camera;

    // Set DPR base transform so all coordinates work in logical (CSS) pixels
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.logicalWidth, this.logicalHeight);
    ctx.save();
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    // Draw terrain
    this.drawTerrain(ctx);

    // Draw buildings
    if (entityData?.buildings) {
      for (const b of entityData.buildings) {
        this.drawBuilding(ctx, b);
      }
    }

    // Draw building ghost
    if (entityData?.ghosts) {
      for (const g of entityData.ghosts) {
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = g.valid ? '#00ff0066' : '#ff000066';
        ctx.fillRect(g.x * TILE_SIZE, g.y * TILE_SIZE, g.w * TILE_SIZE, g.h * TILE_SIZE);
        ctx.strokeStyle = g.valid ? '#00ff00' : '#ff0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(g.x * TILE_SIZE, g.y * TILE_SIZE, g.w * TILE_SIZE, g.h * TILE_SIZE);
        ctx.globalAlpha = 1;
      }
    }

    // Draw selected citizen's path
    if (entityData?.selectedPath && entityData.selectedPath.length >= 2) {
      this.drawPath(ctx, entityData.selectedPath);
    }

    // Draw citizens
    if (entityData?.citizens) {
      for (const c of entityData.citizens) {
        this.drawCitizen(ctx, c, state.selectedEntity === c.id);
      }
    }

    // Draw particles (in world space, above citizens)
    if (entityData?.drawParticles) {
      entityData.drawParticles(ctx);
    }

    // Night overlay (drawn in world space, covers terrain+buildings+citizens)
    if (state.nightAlpha > 0) {
      this.drawNightOverlay(ctx, state, entityData?.buildings);
    }

    ctx.restore();
  }

  private drawNightOverlay(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    buildings?: Array<{ x: number; y: number; w: number; h: number; completed: boolean; type?: string }>,
  ): void {
    const bounds = this.camera.getVisibleBounds();
    const worldX = bounds.startX * TILE_SIZE;
    const worldY = bounds.startY * TILE_SIZE;
    const worldW = (bounds.endX - bounds.startX + 2) * TILE_SIZE;
    const worldH = (bounds.endY - bounds.startY + 2) * TILE_SIZE;

    // Blue-tinted darkness
    ctx.fillStyle = `rgba(10, 15, 40, ${state.nightAlpha})`;
    ctx.fillRect(worldX, worldY, worldW, worldH);

    // Dawn/dusk tint
    if (state.isDawn) {
      ctx.fillStyle = `rgba(255, 180, 80, ${state.nightAlpha * 0.3})`;
      ctx.fillRect(worldX, worldY, worldW, worldH);
    } else if (state.isDusk) {
      ctx.fillStyle = `rgba(255, 120, 50, ${state.nightAlpha * 0.4})`;
      ctx.fillRect(worldX, worldY, worldW, worldH);
    }

    // House firelight glow at night
    if (state.nightAlpha > 0.2 && buildings) {
      for (const b of buildings) {
        if (!b.completed) continue;
        if (b.type !== 'wooden_house') continue;

        const cx = (b.x + b.w / 2) * TILE_SIZE;
        const cy = (b.y + b.h / 2) * TILE_SIZE;
        const radius = TILE_SIZE * 3;

        const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, `rgba(255, 200, 80, ${state.nightAlpha * 0.5})`);
        gradient.addColorStop(0.5, `rgba(255, 150, 50, ${state.nightAlpha * 0.2})`);
        gradient.addColorStop(1, 'rgba(255, 150, 50, 0)');

        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = gradient;
        ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }

  private drawTerrain(ctx: CanvasRenderingContext2D): void {
    const bounds = this.camera.getVisibleBounds();

    for (let y = bounds.startY; y <= bounds.endY; y++) {
      for (let x = bounds.startX; x <= bounds.endX; x++) {
        const tile = this.tileMap.get(x, y);
        if (!tile) continue;

        const px = x * TILE_SIZE;
        const py = y * TILE_SIZE;

        ctx.fillStyle = TILE_COLORS[tile.type] || '#4a8c3f';
        ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

        // Road markings
        if (tile.type === TileType.ROAD) {
          // Subtle center line
          ctx.fillStyle = '#9a8d7b';
          ctx.fillRect(px + TILE_SIZE / 2 - 1, py, 2, TILE_SIZE);
          ctx.fillRect(px, py + TILE_SIZE / 2 - 1, TILE_SIZE, 2);
        }

        // Draw tree indicators on forest tiles — size and shade vary by density
        if (tile.type === TileType.FOREST && tile.trees > 0) {
          // Darker green for denser forests, lighter for saplings
          const shade = Math.floor(12 + tile.trees * 14); // 26..82
          ctx.fillStyle = `rgb(${shade - 10}, ${shade + 60}, ${shade - 10})`;
          const treeSize = 3 + tile.trees * 1.4;
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, treeSize, 0, Math.PI * 2);
          ctx.fill();

          // Trunk (only visible on smaller trees)
          if (tile.trees <= 3) {
            ctx.fillStyle = '#5c3a1a';
            ctx.fillRect(px + TILE_SIZE / 2 - 1, py + TILE_SIZE / 2 + 2, 3, 5);
          }
        }

        // Stone deposits — size varies by remaining amount
        if (tile.type === TileType.STONE) {
          const stoneRatio = Math.max(0.3, (tile.stoneAmount || 50) / 50);
          ctx.fillStyle = '#aaa';
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 3 + 5 * stoneRatio, 0, Math.PI * 2);
          ctx.fill();
        }

        // Iron deposits — size varies by remaining amount
        if (tile.type === TileType.IRON) {
          const ironRatio = Math.max(0.3, (tile.ironAmount || 30) / 30);
          ctx.fillStyle = '#c4863a';
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 3 + 4 * ironRatio, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private drawBuilding(
    ctx: CanvasRenderingContext2D,
    b: { x: number; y: number; w: number; h: number; category: string; completed: boolean; progress: number; name: string; isValidTarget?: boolean; isFullOrInvalid?: boolean },
  ): void {
    const px = b.x * TILE_SIZE;
    const py = b.y * TILE_SIZE;
    const pw = b.w * TILE_SIZE;
    const ph = b.h * TILE_SIZE;

    const color = BUILDING_COLORS[b.category] || '#888';

    if (b.completed) {
      ctx.fillStyle = color;
      ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    } else {
      // Under construction - show progress
      ctx.fillStyle = '#555';
      ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(px + 1, py + 1, (pw - 2) * b.progress, ph - 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
    }

    // Assignment mode highlights
    if (b.isValidTarget) {
      ctx.strokeStyle = '#00ff66';
      ctx.lineWidth = 3;
      ctx.strokeRect(px - 1, py - 1, pw + 2, ph + 2);
    } else if (b.isFullOrInvalid) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
    }
  }

  private static readonly ACTIVITY_ICONS: Record<string, { symbol: string; color: string }> = {
    starving:    { symbol: '!',  color: '#ff3333' },
    freezing:    { symbol: '*',  color: '#66ddff' },
    eating:      { symbol: 'E',  color: '#ffaa33' },
    building:    { symbol: 'B',  color: '#ffaa00' },
    woodcutting: { symbol: 'W',  color: '#cc8844' },
    farming:     { symbol: 'F',  color: '#44bb44' },
    gathering:   { symbol: 'G',  color: '#88aa44' },
    hunting:     { symbol: 'H',  color: '#cc5544' },
    fishing:     { symbol: 'F',  color: '#4499dd' },
    forestry:    { symbol: 'T',  color: '#228844' },
    smithing:    { symbol: 'S',  color: '#aaaaaa' },
    tailoring:   { symbol: 'T',  color: '#aa66cc' },
    healing:     { symbol: '+',  color: '#44dd44' },
    vending:     { symbol: 'V',  color: '#ddaa44' },
    teaching:    { symbol: 'T',  color: '#dddddd' },
    trading:     { symbol: '$',  color: '#dddd44' },
    school:      { symbol: 'S',  color: '#aaaadd' },
    working:     { symbol: 'W',  color: '#cccccc' },
    celebrating: { symbol: '\u266B', color: '#ffdd44' },
  };

  private drawCitizen(
    ctx: CanvasRenderingContext2D,
    c: { x: number; y: number; isMale: boolean; isChild: boolean; health: number; isSleeping: boolean; isSick: boolean; isChatting: boolean; activity: string; isPregnant: boolean },
    selected: boolean,
  ): void {
    const px = c.x * TILE_SIZE + TILE_SIZE / 2;
    const py = c.y * TILE_SIZE + TILE_SIZE / 2;
    const radius = c.isChild ? 4 : 6;

    // Body — dimmer when sleeping
    if (c.isSleeping) {
      ctx.fillStyle = c.isMale ? '#2a4466' : '#662a44';
    } else {
      ctx.fillStyle = c.isMale ? '#4488cc' : '#cc4488';
    }
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();

    // Health indicator (red outline if low)
    if (c.health < 50) {
      ctx.strokeStyle = `rgba(255, 0, 0, ${1 - c.health / 50})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Sleeping "Z" indicator
    if (c.isSleeping) {
      ctx.fillStyle = '#aaaaff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('z', px + radius + 1, py - radius - 1);
      ctx.font = 'bold 7px monospace';
      ctx.fillText('z', px + radius + 7, py - radius - 6);
    }

    // Sick indicator
    if (c.isSick) {
      ctx.fillStyle = '#44dd44';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('\u2620', px - radius - 4, py - radius - 2);
    }

    // Pregnancy indicator
    if (c.isPregnant) {
      ctx.fillStyle = '#ffaacc';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('\u2764', px + radius + 1, py - radius - 6);
    }

    // Chat bubble
    if (c.isChatting) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '9px monospace';
      ctx.fillText('...', px + radius + 2, py - radius - 1);
    }

    // Activity indicator (shown above citizen when not sleeping/chatting/sick)
    if (!c.isSleeping && !c.isChatting && c.activity !== 'idle') {
      const icon = RenderSystem.ACTIVITY_ICONS[c.activity];
      if (icon) {
        // Draw small background pill behind the letter
        ctx.font = 'bold 8px monospace';
        const textW = ctx.measureText(icon.symbol).width;
        const bgX = px - textW / 2 - 2;
        const bgY = py - radius - 12;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(bgX, bgY, textW + 4, 10, 2);
        ctx.fill();

        // Draw the icon letter
        ctx.fillStyle = icon.color;
        ctx.fillText(icon.symbol, px - textW / 2, py - radius - 3);
      }
    }

    // Selection ring
    if (selected) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, radius + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawPath(ctx: CanvasRenderingContext2D, path: Array<{ x: number; y: number }>): void {
    const half = TILE_SIZE / 2;

    // Draw dotted line along the path
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(path[0].x * TILE_SIZE + half, path[0].y * TILE_SIZE + half);
    for (let i = 1; i < path.length; i++) {
      ctx.lineTo(path[i].x * TILE_SIZE + half, path[i].y * TILE_SIZE + half);
    }
    ctx.stroke();

    // Draw destination marker (small diamond at the end)
    const end = path[path.length - 1];
    const ex = end.x * TILE_SIZE + half;
    const ey = end.y * TILE_SIZE + half;
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.moveTo(ex, ey - 5);
    ctx.lineTo(ex + 5, ey);
    ctx.lineTo(ex, ey + 5);
    ctx.lineTo(ex - 5, ey);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawHUD(state: GameState, resources?: Map<string, number>, weather?: string): void {
    const ctx = this.ctx;
    const s = Settings.get('uiScale');

    // Ensure DPR base transform for HUD drawing, then apply UI scale
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    ctx.scale(s, s);

    const scaledW = this.logicalWidth / s;
    const scaledH = this.logicalHeight / s;

    // Top bar background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, scaledW, HUD_HEIGHT);

    ctx.fillStyle = '#ffffff';
    ctx.font = '14px monospace';

    const majorSeasons = ['Spring', 'Summer', 'Autumn', 'Winter'];
    const seasonName = majorSeasons[Math.floor(state.subSeason / 3)];
    const speedText = state.paused ? 'PAUSED' : `${state.speed}x`;

    // Calculate calendar day of year (1-based)
    const ticksIntoYear = state.subSeason * TICKS_PER_SUB_SEASON + state.tickInSubSeason;
    const dayOfYear = Math.floor(ticksIntoYear / TICKS_PER_YEAR * DAYS_PER_YEAR) + 1;

    // Day/night indicator
    let timeOfDay = 'Day';
    let timeColor = '#ffdd44';
    if (state.isNight) { timeOfDay = 'Night'; timeColor = '#6688cc'; }
    else if (state.isDawn) { timeOfDay = 'Dawn'; timeColor = '#ffaa66'; }
    else if (state.isDusk) { timeOfDay = 'Dusk'; timeColor = '#ff8844'; }

    let x = 10;
    const y = 26;

    ctx.fillText(`Year ${state.year} Day ${dayOfYear}  ${seasonName}`, x, y);
    x += 260;

    // Time of day with color indicator
    ctx.fillStyle = timeColor;
    ctx.fillText(timeOfDay, x, y);
    x += 60;

    // Weather indicator
    if (weather && weather !== 'clear') {
      const weatherLabels: Record<string, { label: string; color: string }> = {
        storm: { label: 'STORM', color: '#ff4444' },
        drought: { label: 'DROUGHT', color: '#ddaa22' },
        harsh_winter: { label: 'COLD SNAP', color: '#88ccff' },
      };
      const w = weatherLabels[weather];
      if (w) {
        ctx.fillStyle = w.color;
        ctx.font = 'bold 14px monospace';
        ctx.fillText(w.label, x, y);
        x += 90;
        ctx.font = '14px monospace';
      }
    }

    // Festival indicator
    if (state.festival && state.festival.ticksRemaining > 0) {
      const festNames: Record<FestivalType, string> = {
        planting_day: 'PLANTING DAY',
        midsummer: 'MIDSUMMER',
        harvest_festival: 'HARVEST FEST',
        frost_fair: 'FROST FAIR',
      };
      ctx.fillStyle = '#ffdd44';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(festNames[state.festival.type], x, y);
      x += ctx.measureText(festNames[state.festival.type]).width + 15;
      ctx.font = '14px monospace';
    }

    ctx.fillStyle = '#ffffff';
    ctx.fillText(`Pop: ${state.population}`, x, y);
    x += 90;
    ctx.fillText(`Speed: ${speedText}`, x, y);

    if (resources) {
      x += 110;
      const keys = ['log', 'stone', 'iron', 'firewood', 'tool', 'coat'];
      const labels = ['Log', 'Stn', 'Irn', 'Fwd', 'Tol', 'Cot'];
      let totalFood = 0;
      for (const [key, val] of resources) {
        if (['berries', 'mushrooms', 'roots', 'venison', 'fish', 'wheat', 'cabbage', 'potato', 'food'].includes(key)) {
          totalFood += val;
        }
      }
      ctx.fillText(`Food: ${Math.floor(totalFood)}`, x, y);
      x += 80;

      for (let i = 0; i < keys.length; i++) {
        const val = Math.floor(resources.get(keys[i]) || 0);
        ctx.fillText(`${labels[i]}:${val}`, x, y);
        x += 65;
      }
    }

    ctx.restore();

    // Game over overlay (drawn at full logical size, not scaled)
    if (state.gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, this.logicalWidth, this.logicalHeight);
      ctx.fillStyle = '#ff4444';
      ctx.font = '48px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('GAME OVER', this.logicalWidth / 2, this.logicalHeight / 2 - 30);
      ctx.fillStyle = '#ffffff';
      ctx.font = '20px monospace';
      ctx.fillText('All citizens have perished.', this.logicalWidth / 2, this.logicalHeight / 2 + 20);
      ctx.fillText(`Survived ${state.year} years. Deaths: ${state.totalDeaths}. Births: ${state.totalBirths}.`,
        this.logicalWidth / 2, this.logicalHeight / 2 + 50);
      ctx.fillText('Press R to restart', this.logicalWidth / 2, this.logicalHeight / 2 + 90);
      ctx.textAlign = 'left';
    }
  }
}
