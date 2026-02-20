import type { Game } from '../Game';
import {
  TILE_SIZE, MAX_PARTICLES, PARTICLE_SPAWN_INTERVAL,
  SMOKE_SPAWN_CHANCE, SMOKE_MIN_WARMTH, SNOW_PARTICLES_PER_SPAWN,
  LEAF_SPAWN_CHANCE,
} from '../constants';
import { SEASON_DATA } from '../data/SeasonDefs';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
}

export class ParticleSystem {
  private game: Game;
  private particles: Particle[] = [];
  private tickCounter = 0;

  constructor(game: Game) {
    this.game = game;
  }

  update(): void {
    this.tickCounter++;

    // Spawn new particles every few ticks
    if (this.tickCounter % PARTICLE_SPAWN_INTERVAL === 0) {
      this.spawnSmoke();
      this.spawnWeatherParticles();
    }

    // Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.alpha = Math.max(0, p.life / p.maxLife);

      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  /** Spawn smoke from houses with active fireplaces */
  private spawnSmoke(): void {
    if (this.particles.length >= MAX_PARTICLES) return;

    const world = this.game.world;
    const houses = world.getComponentStore<any>('house');
    if (!houses) return;

    for (const [id, house] of houses) {
      if (house.warmthLevel <= SMOKE_MIN_WARMTH) continue; // No fire = no smoke

      // Only spawn occasionally per house
      if (Math.random() > SMOKE_SPAWN_CHANCE) continue;

      const pos = world.getComponent<any>(id, 'position');
      const bld = world.getComponent<any>(id, 'building');
      if (!pos || !bld) continue;

      // Smoke rises from chimney (top-center of building)
      const px = (pos.tileX + bld.width / 2) * TILE_SIZE;
      const py = pos.tileY * TILE_SIZE - 4;

      this.particles.push({
        x: px + (Math.random() - 0.5) * 4,
        y: py,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.3 - Math.random() * 0.3,
        life: 40 + Math.floor(Math.random() * 20),
        maxLife: 60,
        size: 2 + Math.random() * 2,
        color: '#888888',
        alpha: 0.5,
      });
    }
  }

  /** Spawn weather particles (snow, leaves) */
  private spawnWeatherParticles(): void {
    if (this.particles.length >= MAX_PARTICLES) return;

    const seasonData = SEASON_DATA[this.game.state.subSeason];
    const camera = this.game.camera;
    const bounds = camera.getVisibleBounds();

    // Snow in winter
    if (seasonData.snow) {
      for (let i = 0; i < SNOW_PARTICLES_PER_SPAWN; i++) {
        const px = (bounds.startX + Math.random() * (bounds.endX - bounds.startX)) * TILE_SIZE;
        const py = bounds.startY * TILE_SIZE;

        this.particles.push({
          x: px,
          y: py,
          vx: (Math.random() - 0.5) * 0.5,
          vy: 0.5 + Math.random() * 0.5,
          life: 80 + Math.floor(Math.random() * 40),
          maxLife: 120,
          size: 1.5 + Math.random() * 1.5,
          color: '#ffffff',
          alpha: 0.7,
        });
      }
    }

    // Falling leaves in autumn
    const subSeason = this.game.state.subSeason;
    if (subSeason >= 6 && subSeason <= 8) { // Autumn
      if (Math.random() < LEAF_SPAWN_CHANCE) {
        const px = (bounds.startX + Math.random() * (bounds.endX - bounds.startX)) * TILE_SIZE;
        const py = bounds.startY * TILE_SIZE;
        const leafColors = ['#cc6622', '#dd8833', '#aa4411', '#eebb44'];

        this.particles.push({
          x: px,
          y: py,
          vx: (Math.random() - 0.5) * 0.8,
          vy: 0.3 + Math.random() * 0.3,
          life: 100 + Math.floor(Math.random() * 50),
          maxLife: 150,
          size: 2 + Math.random() * 2,
          color: leafColors[Math.floor(Math.random() * leafColors.length)],
          alpha: 0.8,
        });
      }
    }
  }

  getInternalState(): { tickCounter: number } {
    return { tickCounter: this.tickCounter };
  }

  setInternalState(s: { tickCounter: number }): void {
    this.tickCounter = s.tickCounter;
    this.particles = []; // Clear particles on load — they're visual-only
  }

  /** Draw all particles (called from RenderSystem in world space) */
  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
