import type { Game } from '../Game';
import { BUILDING_DEFS } from '../data/BuildingDefs';
import { BuildingCategory, BUILD_MENU_HEIGHT } from '../constants';

const CATEGORIES = [
  BuildingCategory.HOUSING,
  BuildingCategory.STORAGE,
  BuildingCategory.FOOD,
  BuildingCategory.RESOURCE,
  BuildingCategory.SERVICES,
  BuildingCategory.INFRASTRUCTURE,
];

const BUTTON_WIDTH = 160;
const BUTTON_HEIGHT = 80;
const PADDING = 10;
const TAB_HEIGHT = 32;
const TAB_WIDTH = 110;

export class BuildMenu {
  private game: Game;
  private selectedCategory: string = BuildingCategory.FOOD;

  constructor(game: Game) {
    this.game = game;
  }

  handleClick(x: number, y: number): void {
    // Category tabs at top
    if (y < TAB_HEIGHT) {
      const idx = Math.floor(x / TAB_WIDTH);
      if (idx >= 0 && idx < CATEGORIES.length) {
        this.selectedCategory = CATEGORIES[idx];
      }
      return;
    }

    // Building buttons below
    const buildings = Object.values(BUILDING_DEFS).filter(b => b.category === this.selectedCategory);
    const buttonY = TAB_HEIGHT + 8;
    const row = Math.floor((y - buttonY) / (BUTTON_HEIGHT + PADDING));
    const col = Math.floor((x - PADDING) / (BUTTON_WIDTH + PADDING));
    const idx = row * 8 + col;

    if (idx >= 0 && idx < buildings.length) {
      const def = buildings[idx];
      this.game.state.placingBuilding = def.type;
      this.game.state.assigningWorker = null;
    }
  }

  draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    const menuY = canvasHeight - BUILD_MENU_HEIGHT;

    // Background
    ctx.fillStyle = 'rgba(15, 15, 25, 0.95)';
    ctx.fillRect(0, menuY, canvasWidth, BUILD_MENU_HEIGHT);

    // Top border
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, menuY);
    ctx.lineTo(canvasWidth, menuY);
    ctx.stroke();

    // Category tabs
    for (let i = 0; i < CATEGORIES.length; i++) {
      const tx = i * TAB_WIDTH + 4;
      const isActive = CATEGORIES[i] === this.selectedCategory;

      ctx.fillStyle = isActive ? '#3a5577' : '#2a2a3a';
      ctx.fillRect(tx, menuY + 2, TAB_WIDTH - 4, TAB_HEIGHT - 2);

      if (isActive) {
        ctx.strokeStyle = '#88aacc';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx, menuY + 2, TAB_WIDTH - 4, TAB_HEIGHT - 2);
      }

      ctx.fillStyle = isActive ? '#ffffff' : '#999999';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(CATEGORIES[i], tx + 8, menuY + 21);
    }

    // Building buttons
    const buildings = Object.values(BUILDING_DEFS).filter(b => b.category === this.selectedCategory);
    const startY = menuY + TAB_HEIGHT + 8;

    for (let i = 0; i < buildings.length; i++) {
      const def = buildings[i];
      const col = i % 8;
      const row = Math.floor(i / 8);
      const bx = col * (BUTTON_WIDTH + PADDING) + PADDING;
      const by = startY + row * (BUTTON_HEIGHT + PADDING);

      const canAfford =
        this.game.getResource('log') >= def.costLog &&
        this.game.getResource('stone') >= def.costStone &&
        this.game.getResource('iron') >= def.costIron;

      const isSelected = this.game.state.placingBuilding === def.type;

      // Button background
      if (isSelected) {
        ctx.fillStyle = '#3a5570';
      } else if (canAfford) {
        ctx.fillStyle = '#2a3a4a';
      } else {
        ctx.fillStyle = '#3a2222';
      }
      ctx.fillRect(bx, by, BUTTON_WIDTH, BUTTON_HEIGHT);

      // Border
      ctx.strokeStyle = isSelected ? '#88ccff' : canAfford ? '#556677' : '#553333';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(bx, by, BUTTON_WIDTH, BUTTON_HEIGHT);

      // Name - large and crisp
      ctx.fillStyle = canAfford ? '#ffffff' : '#cc6666';
      ctx.font = 'bold 13px monospace';
      ctx.fillText(def.name, bx + 6, by + 18);

      // Cost line
      ctx.fillStyle = '#bbbbbb';
      ctx.font = '12px monospace';
      const costs: string[] = [];
      if (def.costLog > 0) costs.push(`L:${def.costLog}`);
      if (def.costStone > 0) costs.push(`S:${def.costStone}`);
      if (def.costIron > 0) costs.push(`I:${def.costIron}`);
      ctx.fillText(costs.join(' ') || 'Free', bx + 6, by + 36);

      // Size + workers
      ctx.fillStyle = '#999999';
      ctx.font = '11px monospace';
      let meta = `${def.width}x${def.height}`;
      if (def.maxWorkers > 0) meta += `  Workers: ${def.maxWorkers}`;
      ctx.fillText(meta, bx + 6, by + 52);

      // Description
      ctx.fillStyle = '#777777';
      ctx.font = '10px monospace';
      const maxChars = Math.floor((BUTTON_WIDTH - 12) / 6);
      const desc = def.description.length > maxChars
        ? def.description.substring(0, maxChars - 2) + '..'
        : def.description;
      ctx.fillText(desc, bx + 6, by + 68);
    }
  }
}
