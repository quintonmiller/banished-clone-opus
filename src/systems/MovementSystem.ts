import { World } from '../ecs/World';
import { TileMap } from '../map/TileMap';
import { TILE_SIZE, CITIZEN_SPEED, TICK_RATE } from '../constants';

export class MovementSystem {
  constructor(
    private world: World,
    private tileMap: TileMap,
  ) {}

  update(): void {
    const positions = this.world.getComponentStore<any>('position');
    const movements = this.world.getComponentStore<any>('movement');
    if (!positions || !movements) return;

    for (const [id, mov] of movements) {
      const pos = positions.get(id);
      if (!pos || !mov.path || mov.path.length === 0) {
        if (mov) mov.moving = false;
        continue;
      }

      mov.moving = true;
      const target = mov.path[0];
      const targetPX = target.x * TILE_SIZE + TILE_SIZE / 2;
      const targetPY = target.y * TILE_SIZE + TILE_SIZE / 2;

      const dx = targetPX - pos.pixelX;
      const dy = targetPY - pos.pixelY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Apply terrain speed modifier based on current tile
      const terrainMult = this.tileMap.getSpeedMultiplier(pos.tileX, pos.tileY);
      const speedMod = mov.speedModifier ?? 1.0;
      const speed = (mov.speed || CITIZEN_SPEED) * terrainMult * speedMod * TILE_SIZE / TICK_RATE;

      if (dist <= speed) {
        // Arrived at next path node
        pos.pixelX = targetPX;
        pos.pixelY = targetPY;
        pos.tileX = target.x;
        pos.tileY = target.y;
        mov.path.shift();

        if (mov.path.length === 0) {
          mov.moving = false;
        }
      } else {
        // Move toward target
        pos.pixelX += (dx / dist) * speed;
        pos.pixelY += (dy / dist) * speed;
        // Update tile position based on pixel position
        pos.tileX = Math.floor(pos.pixelX / TILE_SIZE);
        pos.tileY = Math.floor(pos.pixelY / TILE_SIZE);
      }
    }
  }
}
