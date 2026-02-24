import { TILE_SIZE, MAP_WIDTH, MAP_HEIGHT, MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM } from '../constants';

export class Camera {
  x: number;
  y: number;
  zoom: number;
  screenWidth: number;
  screenHeight: number;

  // Smooth animation state
  private animTarget: { x: number; y: number; zoom: number } | null = null;
  private animStartX = 0;
  private animStartY = 0;
  private animStartZoom = 1;
  private animDuration = 0;
  private animStartTime = 0;

  constructor(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.zoom = DEFAULT_ZOOM;
    // Center on map
    this.x = (MAP_WIDTH * TILE_SIZE) / 2 - screenWidth / 2;
    this.y = (MAP_HEIGHT * TILE_SIZE) / 2 - screenHeight / 2;
  }

  resize(w: number, h: number): void {
    this.screenWidth = w;
    this.screenHeight = h;
  }

  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  zoomAt(delta: number, screenX: number, screenY: number): void {
    const oldZoom = this.zoom;
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, this.zoom * (1 + delta)));

    // Zoom toward cursor position
    const worldX = this.x + screenX / oldZoom;
    const worldY = this.y + screenY / oldZoom;
    this.x = worldX - screenX / this.zoom;
    this.y = worldY - screenY / this.zoom;
    this.clamp();
  }

  centerOn(tileX: number, tileY: number): void {
    this.x = tileX * TILE_SIZE - this.screenWidth / (2 * this.zoom);
    this.y = tileY * TILE_SIZE - this.screenHeight / (2 * this.zoom);
    this.clamp();
  }

  /** Begin a smooth pan+zoom animation to the given tile position */
  animateTo(tileX: number, tileY: number, targetZoom: number, durationMs: number): void {
    this.animStartX = this.x;
    this.animStartY = this.y;
    this.animStartZoom = this.zoom;
    // Compute target camera position to center on tile at target zoom
    const targetX = tileX * TILE_SIZE - this.screenWidth / (2 * targetZoom);
    const targetY = tileY * TILE_SIZE - this.screenHeight / (2 * targetZoom);
    this.animTarget = { x: targetX, y: targetY, zoom: targetZoom };
    this.animDuration = durationMs;
    this.animStartTime = performance.now();
  }

  /** Update animation each frame. Returns true while animating. */
  updateAnimation(): boolean {
    if (!this.animTarget) return false;

    const elapsed = performance.now() - this.animStartTime;
    const t = Math.min(1, elapsed / this.animDuration);
    // Ease-in-out cubic
    const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    this.x = this.animStartX + (this.animTarget.x - this.animStartX) * ease;
    this.y = this.animStartY + (this.animTarget.y - this.animStartY) * ease;
    this.zoom = this.animStartZoom + (this.animTarget.zoom - this.animStartZoom) * ease;
    this.clamp();

    if (t >= 1) {
      this.animTarget = null;
    }
    return true;
  }

  /** Query whether a smooth animation is in progress */
  isAnimating(): boolean {
    return this.animTarget !== null;
  }

  private clamp(): void {
    const maxX = MAP_WIDTH * TILE_SIZE - this.screenWidth / this.zoom;
    const maxY = MAP_HEIGHT * TILE_SIZE - this.screenHeight / this.zoom;
    this.x = Math.max(0, Math.min(maxX, this.x));
    this.y = Math.max(0, Math.min(maxY, this.y));
  }

  /** Convert screen coordinates to world pixel coordinates */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: this.x + sx / this.zoom,
      y: this.y + sy / this.zoom,
    };
  }

  /** Convert world pixel coordinates to screen coordinates */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom,
      y: (wy - this.y) * this.zoom,
    };
  }

  /** Convert screen coordinates to tile coordinates */
  screenToTile(sx: number, sy: number): { x: number; y: number } {
    const world = this.screenToWorld(sx, sy);
    return {
      x: Math.floor(world.x / TILE_SIZE),
      y: Math.floor(world.y / TILE_SIZE),
    };
  }

  /** Get visible tile bounds */
  getVisibleBounds(): { startX: number; startY: number; endX: number; endY: number } {
    const startX = Math.max(0, Math.floor(this.x / TILE_SIZE) - 1);
    const startY = Math.max(0, Math.floor(this.y / TILE_SIZE) - 1);
    const endX = Math.min(
      MAP_WIDTH - 1,
      Math.ceil((this.x + this.screenWidth / this.zoom) / TILE_SIZE) + 1,
    );
    const endY = Math.min(
      MAP_HEIGHT - 1,
      Math.ceil((this.y + this.screenHeight / this.zoom) / TILE_SIZE) + 1,
    );
    return { startX, startY, endX, endY };
  }
}
