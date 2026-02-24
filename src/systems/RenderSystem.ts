import { Camera } from '../map/Camera';
import { TileMap } from '../map/TileMap';
import { TileType, TILE_SIZE, HUD_HEIGHT, TICKS_PER_SUB_SEASON, TICKS_PER_YEAR, DAYS_PER_YEAR, CropStage } from '../constants';
import { GameState, EntityId, FestivalType, DoorDef } from '../types';
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
  [TileType.STONE_ROAD]: '#b0a898',
  [TileType.BRIDGE]: '#8B6914',
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

// Per-type color overrides (takes priority over category colors)
const BUILDING_TYPE_COLORS: Record<string, string> = {
  quarry: '#8a7060',
  mine: '#4a4040',
  // Tier-2 upgrades — cooler/richer tones to distinguish from tier-1
  stone_house:     '#8899bb', // cool blue-grey stone (vs orange-brown wooden house)
  stone_barn:      '#778899', // slate blue-grey (vs dark brown barn)
  gathering_lodge: '#3d7a22', // deep forest green (vs mid-green hut)
  hunting_lodge:   '#4a6633', // dark olive (vs lighter hunting cabin)
  forestry_hall:   '#7a5522', // deep amber-wood (vs lighter forester lodge)
  sawmill:         '#7a5a33', // dark wood-brown (vs lighter wood cutter)
  iron_works:      '#445566', // dark steel blue-grey (vs amber blacksmith)
  stone_well:      '#5588aa', // stone blue (vs generic services blue)
  academy:         '#3355cc', // deep blue-indigo (vs medium services blue)
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
      travelers?: Array<{ id: EntityId; x: number; y: number; travelType: 'pass_through' | 'work_seekers' | 'settler_family' }>;
      buildings: Array<{
        id: EntityId; x: number; y: number; w: number; h: number;
        category: string; completed: boolean; progress: number; name: string;
        type?: string; isValidTarget?: boolean; isFullOrInvalid?: boolean;
        cropStage?: number; doorDef?: DoorDef;
        storageVisual?: {
          usesGlobalEstimate: boolean;
          fillRatio: number;
          unitsPerIcon: number;
          icons: Array<{ resource: string; label: string; color: string }>;
        };
        occupants?: Array<{ isMale: boolean; isChild: boolean }>;
      }>;
      ghosts?: Array<{ x: number; y: number; w: number; h: number; valid: boolean; doorDef?: DoorDef; entryTile?: { x: number; y: number } }>;
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
        // Draw entry tile beneath the footprint so the footprint border isn't obscured
        if (g.entryTile) {
          const ex = g.entryTile.x * TILE_SIZE;
          const ey = g.entryTile.y * TILE_SIZE;
          ctx.globalAlpha = 0.65;
          ctx.fillStyle = g.valid ? '#ffdd00' : '#ff6600';
          ctx.fillRect(ex, ey, TILE_SIZE, TILE_SIZE);
          ctx.strokeStyle = g.valid ? '#ffdd00' : '#ff6600';
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(ex + 1, ey + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }

        // Draw main footprint
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = g.valid ? '#00ff0066' : '#ff000066';
        ctx.fillRect(g.x * TILE_SIZE, g.y * TILE_SIZE, g.w * TILE_SIZE, g.h * TILE_SIZE);
        ctx.strokeStyle = g.valid ? '#00ff00' : '#ff0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(g.x * TILE_SIZE, g.y * TILE_SIZE, g.w * TILE_SIZE, g.h * TILE_SIZE);
        if (g.doorDef) {
          this.drawDoor(ctx, g.x, g.y, g.doorDef, g.valid ? '#33aa33' : '#aa3333');
        }
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

    // Draw transient road travelers
    if (entityData?.travelers) {
      for (const t of entityData.travelers) {
        this.drawTraveler(ctx, t);
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
    buildings?: Array<{ x: number; y: number; w: number; h: number; completed: boolean; type?: string; warmthLevel?: number }>,
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

    // Firelight glow at night for houses and warm heated public buildings
    if (state.nightAlpha > 0.2 && buildings) {
      for (const b of buildings) {
        if (!b.completed) continue;

        const isHouse = b.type === 'wooden_house' || b.type === 'stone_house';
        const isWarmHeated = b.warmthLevel !== undefined && b.warmthLevel > 30;
        if (!isHouse && !isWarmHeated) continue;

        const cx = (b.x + b.w / 2) * TILE_SIZE;
        const cy = (b.y + b.h / 2) * TILE_SIZE;
        // Larger buildings get a proportionally larger glow
        const radius = TILE_SIZE * Math.max(3, (b.w + b.h) / 2 * 1.5);

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
        } else if (tile.type === TileType.STONE_ROAD) {
          // Stone road: solid cross + corner accents for a paved look
          ctx.fillStyle = '#c8bfb0';
          ctx.fillRect(px + TILE_SIZE / 2 - 1, py, 2, TILE_SIZE);
          ctx.fillRect(px, py + TILE_SIZE / 2 - 1, TILE_SIZE, 2);
          // Corner stones
          ctx.fillStyle = '#a09888';
          ctx.fillRect(px + 1, py + 1, 4, 4);
          ctx.fillRect(px + TILE_SIZE - 5, py + 1, 4, 4);
          ctx.fillRect(px + 1, py + TILE_SIZE - 5, 4, 4);
          ctx.fillRect(px + TILE_SIZE - 5, py + TILE_SIZE - 5, 4, 4);
        }

        // Bridge plank visuals
        if (tile.type === TileType.BRIDGE) {
          ctx.strokeStyle = '#6b4f10';
          ctx.lineWidth = 1;
          const spacing = TILE_SIZE / 4;
          for (let i = 1; i < 4; i++) {
            const lineY = py + Math.round(i * spacing);
            ctx.beginPath();
            ctx.moveTo(px + 2, lineY);
            ctx.lineTo(px + TILE_SIZE - 2, lineY);
            ctx.stroke();
          }
          ctx.strokeStyle = '#5c3a0a';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px + 1, py + 2); ctx.lineTo(px + TILE_SIZE - 1, py + 2);
          ctx.moveTo(px + 1, py + TILE_SIZE - 2); ctx.lineTo(px + TILE_SIZE - 1, py + TILE_SIZE - 2);
          ctx.stroke();
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
          const stoneRatio = Math.max(0.3, (tile.stoneAmount || 200) / 200);
          ctx.fillStyle = '#aaa';
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 3 + 5 * stoneRatio, 0, Math.PI * 2);
          ctx.fill();
        }

        // Iron deposits — size varies by remaining amount
        if (tile.type === TileType.IRON) {
          const ironRatio = Math.max(0.3, (tile.ironAmount || 100) / 100);
          ctx.fillStyle = '#c4863a';
          ctx.beginPath();
          ctx.arc(px + TILE_SIZE / 2, py + TILE_SIZE / 2, 3 + 4 * ironRatio, 0, Math.PI * 2);
          ctx.fill();
        }

        // Berry bushes — small red/purple dots
        if (tile.berries > 0) {
          const count = Math.min(tile.berries, 3);
          for (let i = 0; i < count; i++) {
            ctx.fillStyle = i % 2 === 0 ? '#cc3344' : '#8833aa';
            const bx = px + 6 + i * 8;
            const by = py + TILE_SIZE - 7;
            ctx.beginPath();
            ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Mushroom patches — small brown semicircles
        if (tile.mushrooms > 0) {
          const count = Math.min(tile.mushrooms, 2);
          for (let i = 0; i < count; i++) {
            ctx.fillStyle = '#8B6914';
            const mx = px + 4 + i * 12;
            const my = py + 6;
            ctx.beginPath();
            ctx.arc(mx, my, 3, Math.PI, 0);
            ctx.fill();
            // Stem
            ctx.fillStyle = '#d4c5a0';
            ctx.fillRect(mx - 1, my, 2, 3);
          }
        }

        // Herb plants — small green + marks
        if (tile.herbs > 0) {
          const count = Math.min(tile.herbs, 2);
          ctx.strokeStyle = '#33cc55';
          ctx.lineWidth = 1.5;
          for (let i = 0; i < count; i++) {
            const hx = px + TILE_SIZE - 8 - i * 10;
            const hy = py + TILE_SIZE - 8;
            ctx.beginPath();
            ctx.moveTo(hx - 3, hy);
            ctx.lineTo(hx + 3, hy);
            ctx.moveTo(hx, hy - 3);
            ctx.lineTo(hx, hy + 3);
            ctx.stroke();
          }
        }

        // Fish — subtle animated blue dots on water/river
        if (tile.fish > 0 && (tile.type === TileType.WATER || tile.type === TileType.RIVER)) {
          const count = Math.min(Math.ceil(tile.fish / 3), 3);
          ctx.fillStyle = 'rgba(120, 200, 255, 0.6)';
          for (let i = 0; i < count; i++) {
            // Simple shimmer using tile position as seed for offset variation
            const fx = px + 5 + ((x * 7 + i * 11) % 22);
            const fy = py + 5 + ((y * 13 + i * 7) % 22);
            ctx.beginPath();
            ctx.arc(fx, fy, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  }

  private drawBuilding(
    ctx: CanvasRenderingContext2D,
    b: {
      x: number; y: number; w: number; h: number;
      category: string; completed: boolean; progress: number; name: string;
      isValidTarget?: boolean; isFullOrInvalid?: boolean;
      type?: string; cropStage?: number; doorDef?: DoorDef;
      isUpgrading?: boolean; upgradeProgress?: number;
      storageVisual?: {
        usesGlobalEstimate: boolean;
        fillRatio: number;
        unitsPerIcon: number;
        icons: Array<{ resource: string; label: string; color: string }>;
      };
      occupants?: Array<{ isMale: boolean; isChild: boolean }>;
      mineVeinRatio?: number;
    },
  ): void {
    const px = b.x * TILE_SIZE;
    const py = b.y * TILE_SIZE;
    const pw = b.w * TILE_SIZE;
    const ph = b.h * TILE_SIZE;

    const color = (b.type && BUILDING_TYPE_COLORS[b.type]) || BUILDING_COLORS[b.category] || '#888';

    if (b.completed) {
      // Special crop field rendering with growth stages
      if (b.type === 'crop_field' && b.cropStage !== undefined) {
        this.drawCropField(ctx, px, py, pw, ph, b.cropStage);
      } else {
        ctx.fillStyle = color;
        ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
      }
      // Storage buildings show representative contents from the global storage mix.
      if (b.storageVisual) {
        this.drawStorageContents(ctx, px, py, pw, ph, b.storageVisual);
      }
      // Draw door on completed buildings
      if (b.doorDef) {
        this.drawDoor(ctx, b.x, b.y, b.doorDef, '#5c3a1a');
      }
      // Draw vein depletion bar for mine/quarry buildings
      if ((b.type === 'quarry' || b.type === 'mine') && b.mineVeinRatio !== undefined) {
        const barH = 3;
        const barY = py + ph - barH - 1;
        const ratio = b.mineVeinRatio;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(px + 1, barY, pw - 2, barH);
        if (ratio > 0) {
          const barColor = ratio > 0.5 ? '#44cc44' : ratio > 0.2 ? '#ddaa22' : '#cc4444';
          ctx.fillStyle = barColor;
          ctx.fillRect(px + 1, barY, Math.floor((pw - 2) * ratio), barH);
        }
      }
    } else if (b.type === 'road' || b.type === 'stone_road' || b.type === 'bridge') {
      // Under-construction road/bridge: compact 1x1 visual without overflow labels
      const tileColor = b.type === 'road' ? '#8a7d6b' : b.type === 'stone_road' ? '#b0a898' : '#8B6914';
      ctx.fillStyle = '#555';
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = tileColor;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(px, py, pw * b.progress, ph);
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = '#ff8800';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
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

    // Upgrade indicator (drawn over the completed building, below assignment highlights)
    if (b.completed && b.isUpgrading) {
      // Gold border around the building
      ctx.strokeStyle = '#ddbb44';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, pw, ph);

      // Progress bar along the top edge (avoids conflict with mine/quarry bar at bottom)
      const barH = 3;
      const barY = py + 1;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(px + 1, barY, pw - 2, barH);
      ctx.fillStyle = '#ffdd44';
      ctx.fillRect(px + 1, barY, Math.floor((pw - 2) * (b.upgradeProgress ?? 0)), barH);
    }

    // Occupant indicators drawn last so they're always on top of upgrade UI and other overlays
    if (b.completed && b.occupants && b.occupants.length > 0) {
      this.drawOccupants(ctx, px, py, pw, ph, b.occupants);
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

  private drawStorageContents(
    ctx: CanvasRenderingContext2D,
    px: number,
    py: number,
    pw: number,
    ph: number,
    storageVisual: {
      fillRatio: number;
      unitsPerIcon: number;
      icons: Array<{ label: string; color: string }>;
    },
  ): void {
    if (pw < 24 || ph < 24) return;

    const pad = 4;
    const barHeight = 3;
    const innerW = Math.max(8, pw - pad * 2);
    const innerH = Math.max(8, ph - pad * 2 - barHeight - 2);

    const iconSize = Math.max(8, Math.min(11, Math.floor(Math.min(innerW / 4, innerH / 3))));
    const step = iconSize + 3;
    const cols = Math.max(1, Math.floor(innerW / step));
    const rows = Math.max(1, Math.floor(innerH / step));
    const maxVisible = cols * rows;
    const icons = storageVisual.icons.slice(0, maxVisible);

    if (icons.length > 0) {
      const gridW = cols * step - 3;
      const startX = px + pad + Math.max(0, Math.floor((innerW - gridW) / 2));
      const startY = py + pad + 1;

      ctx.font = `bold ${Math.max(6, iconSize - 3)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let i = 0; i < icons.length; i++) {
        const icon = icons[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const ix = startX + col * step;
        const iy = startY + row * step;

        ctx.fillStyle = icon.color;
        ctx.fillRect(ix, iy, iconSize, iconSize);
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = 1;
        ctx.strokeRect(ix, iy, iconSize, iconSize);

        ctx.fillStyle = '#111111';
        ctx.fillText(icon.label, ix + iconSize / 2, iy + iconSize / 2 + 0.5);
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }

    const barX = px + pad;
    const barY = py + ph - pad - barHeight;
    const barW = innerW;
    const fillW = Math.floor(barW * Math.max(0, Math.min(1, storageVisual.fillRatio)));

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(barX, barY, barW, barHeight);
    ctx.fillStyle = storageVisual.fillRatio >= 1 ? '#ff4444' : storageVisual.fillRatio > 0.8 ? '#ddaa22' : '#66bb66';
    if (fillW > 0) ctx.fillRect(barX, barY, fillW, barHeight);

  }

  /** Draw semi-transparent citizen dots and a count badge inside a building */
  private drawOccupants(
    ctx: CanvasRenderingContext2D,
    px: number, py: number, pw: number, ph: number,
    occupants: Array<{ isMale: boolean; isChild: boolean }>,
  ): void {
    const count = occupants.length;

    // Arrange dots in a grid inside the building
    const cols = Math.min(count, Math.max(1, Math.floor((pw - 6) / 10)));
    const rows = Math.ceil(count / cols);
    const spacingX = Math.min(10, (pw - 6) / cols);
    const spacingY = Math.min(10, (ph - 6) / rows);
    const startX = px + pw / 2 - ((cols - 1) * spacingX) / 2;
    const startY = py + ph / 2 - ((rows - 1) * spacingY) / 2;

    ctx.globalAlpha = 0.55;
    for (let i = 0; i < count; i++) {
      const occ = occupants[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const dotX = startX + col * spacingX;
      const dotY = startY + row * spacingY;
      const r = occ.isChild ? 2 : 3;

      ctx.fillStyle = occ.isMale ? '#4488cc' : '#cc4488';
      ctx.beginPath();
      ctx.arc(dotX, dotY, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Count badge at top-right corner
    const badgeX = px + pw - 2;
    const badgeY = py + 2;
    const badgeR = count >= 10 ? 8 : 7;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(count), badgeX, badgeY);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  private drawDoor(ctx: CanvasRenderingContext2D, bx: number, by: number, door: DoorDef, color: string): void {
    const doorX = (bx + door.dx) * TILE_SIZE;
    const doorY = (by + door.dy) * TILE_SIZE;
    const doorW = 8;
    const doorH = 4;

    ctx.fillStyle = color;
    switch (door.side) {
      case 'south':
        ctx.fillRect(doorX + (TILE_SIZE - doorW) / 2, doorY + TILE_SIZE - doorH, doorW, doorH);
        break;
      case 'north':
        ctx.fillRect(doorX + (TILE_SIZE - doorW) / 2, doorY, doorW, doorH);
        break;
      case 'east':
        ctx.fillRect(doorX + TILE_SIZE - doorH, doorY + (TILE_SIZE - doorW) / 2, doorH, doorW);
        break;
      case 'west':
        ctx.fillRect(doorX, doorY + (TILE_SIZE - doorW) / 2, doorH, doorW);
        break;
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
    baking:      { symbol: 'K',  color: '#dd8844' },
    drinking:    { symbol: '\u2615', color: '#cc8844' },
    serving:     { symbol: 'B',  color: '#cc8844' },
    herding:     { symbol: 'H',  color: '#88aa44' },
    dairying:    { symbol: 'D',  color: '#eeddaa' },
    returning:   { symbol: 'R',  color: '#ddaa44' },
    // Fair activities — generic
    dancing:         { symbol: 'D',  color: '#ff88cc' },
    arm_wrestling:   { symbol: 'A',  color: '#dd8844' },
    storytelling:    { symbol: 'S',  color: '#ddcc88' },
    juggling:        { symbol: 'J',  color: '#ffaa44' },
    singing:         { symbol: '\u266A', color: '#ffdd44' },
    feasting:        { symbol: 'F',  color: '#ffcc33' },
    games:           { symbol: 'G',  color: '#88dd44' },
    // Fair activities — spring
    seed_trading:    { symbol: 'S',  color: '#66cc44' },
    flower_crowns:   { symbol: '\u273F', color: '#ff88aa' },
    // Fair activities — summer
    bonfire_dancing: { symbol: '\u2668', color: '#ff6633' },
    foot_race:       { symbol: 'R',  color: '#44bbdd' },
    // Fair activities — autumn
    pie_contest:     { symbol: 'P',  color: '#dd8844' },
    apple_bobbing:   { symbol: 'A',  color: '#cc4422' },
    // Fair activities — winter
    ice_carving:     { symbol: '\u2744', color: '#aaddff' },
    snowball_fight:  { symbol: '\u2746', color: '#cceeFF' },
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

  private drawTraveler(
    ctx: CanvasRenderingContext2D,
    t: { x: number; y: number; travelType: 'pass_through' | 'work_seekers' | 'settler_family' },
  ): void {
    const px = t.x * TILE_SIZE + TILE_SIZE / 2;
    const py = t.y * TILE_SIZE + TILE_SIZE / 2;

    let color = '#d8c39a';
    let radius = 4;
    if (t.travelType === 'work_seekers') {
      color = '#b8d1a6';
      radius = 4.5;
    } else if (t.travelType === 'settler_family') {
      color = '#d6b0c8';
      radius = 5;
    }

    // Traveler body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();

    // Pack marker to visually separate travelers from citizens
    ctx.fillStyle = '#5c4a2f';
    ctx.fillRect(px - 2, py - radius - 3, 4, 3);
  }

  private drawCropField(ctx: CanvasRenderingContext2D, px: number, py: number, pw: number, ph: number, stage: number): void {
    // Base soil color
    const soilColors: Record<number, string> = {
      [CropStage.FALLOW]: '#6b5b3e',
      [CropStage.PLANTED]: '#5a4e35',
      [CropStage.SPROUTING]: '#4a6030',
      [CropStage.GROWING]: '#3a7030',
      [CropStage.FLOWERING]: '#3a8030',
      [CropStage.READY]: '#4a9030',
    };

    ctx.fillStyle = soilColors[stage] || '#6b5b3e';
    ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);

    // Draw crop rows
    if (stage >= CropStage.PLANTED) {
      const rowSpacing = TILE_SIZE;
      const plantHeight = stage === CropStage.PLANTED ? 2
        : stage === CropStage.SPROUTING ? 5
        : stage === CropStage.GROWING ? 10
        : stage === CropStage.FLOWERING ? 14
        : 16; // READY

      const plantColor = stage === CropStage.PLANTED ? '#3a5525'
        : stage === CropStage.SPROUTING ? '#4a7733'
        : stage === CropStage.GROWING ? '#55aa33'
        : stage === CropStage.FLOWERING ? '#66bb44'
        : '#ccaa33'; // READY (golden)

      ctx.fillStyle = plantColor;

      for (let ry = py + 8; ry < py + ph - 4; ry += rowSpacing) {
        for (let rx = px + 6; rx < px + pw - 4; rx += 10) {
          ctx.fillRect(rx, ry - plantHeight, 2, plantHeight);
          // Add leaves/flowers at higher stages
          if (stage >= CropStage.GROWING) {
            ctx.fillRect(rx - 2, ry - plantHeight + 2, 6, 2);
          }
          if (stage === CropStage.FLOWERING) {
            ctx.fillStyle = '#ffdd55';
            ctx.fillRect(rx - 1, ry - plantHeight - 1, 4, 3);
            ctx.fillStyle = plantColor;
          }
          if (stage === CropStage.READY) {
            ctx.fillStyle = '#ddaa22';
            ctx.fillRect(rx - 1, ry - plantHeight - 2, 4, 4);
            ctx.fillStyle = plantColor;
          }
        }
      }
    }

    // Fallow: draw furrow lines
    if (stage === CropStage.FALLOW) {
      ctx.strokeStyle = '#5a4a30';
      ctx.lineWidth = 1;
      for (let ry = py + 8; ry < py + ph - 4; ry += TILE_SIZE) {
        ctx.beginPath();
        ctx.moveTo(px + 4, ry);
        ctx.lineTo(px + pw - 4, ry);
        ctx.stroke();
      }
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

  drawHUD(state: GameState, resources?: Map<string, number>, weather?: string, storageUsed?: number, storageCap?: number): void {
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
        if (['berries', 'mushrooms', 'roots', 'venison', 'fish', 'wheat', 'cabbage', 'potato', 'food', 'bread', 'fish_stew', 'berry_pie', 'vegetable_soup'].includes(key)) {
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

      // Storage capacity indicator
      if (storageUsed !== undefined && storageCap !== undefined) {
        const ratio = storageCap > 0 ? storageUsed / storageCap : 1;
        if (ratio >= 1) {
          ctx.fillStyle = '#ff4444';
        } else if (ratio > 0.8) {
          ctx.fillStyle = '#ddaa22';
        } else {
          ctx.fillStyle = '#ffffff';
        }
        ctx.fillText(`Sto:${Math.floor(storageUsed)}/${storageCap}`, x, y);
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
