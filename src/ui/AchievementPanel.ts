import { ACHIEVEMENT_DEFS, AchievementCategory, TOTAL_ACHIEVEMENTS } from '../data/AchievementDefs';
import { AchievementStore } from '../save/AchievementStore';

const FONT = 'Georgia, "Times New Roman", serif';
const MONO = '"Courier New", Courier, monospace';

const CATEGORIES: Array<{ key: AchievementCategory | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'survival', label: 'Survival' },
  { key: 'population', label: 'Population' },
  { key: 'building', label: 'Building' },
  { key: 'economy', label: 'Economy' },
  { key: 'challenge', label: 'Challenge' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'secret', label: 'Secret' },
];

const CATEGORY_COLORS: Record<string, string> = {
  survival: '#66bb6a',
  population: '#42a5f5',
  building: '#ffa726',
  economy: '#ffee58',
  challenge: '#ef5350',
  discovery: '#ab47bc',
  secret: '#78909c',
  all: '#cc8e28',
};

interface TabRect { x: number; y: number; w: number; h: number; key: string }
interface TileRect { x: number; y: number; w: number; h: number; id: string }

export class AchievementPanel {
  private visible = false;
  private activeCategory: AchievementCategory | 'all' = 'all';
  private scrollOffset = 0;
  private tabRects: TabRect[] = [];
  private tileRects: TileRect[] = [];
  private backBtn = { x: 0, y: 0, w: 0, h: 0 };
  private hoveredBack = false;
  private hoveredTab = -1;
  private maxScroll = 0;
  private panelRect = { x: 0, y: 0, w: 0, h: 0 };

  onBack: (() => void) | null = null;

  show(): void { this.visible = true; this.scrollOffset = 0; }
  hide(): void { this.visible = false; }
  isVisible(): boolean { return this.visible; }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.visible) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, w, h);

    // Panel
    const panelW = Math.min(620, w - 40);
    const panelH = Math.min(520, h - 40);
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;
    this.panelRect = { x: panelX, y: panelY, w: panelW, h: panelH };

    ctx.fillStyle = '#161210';
    ctx.strokeStyle = '#cc8e28';
    ctx.lineWidth = 2;
    this.roundRect(ctx, panelX, panelY, panelW, panelH, 12);
    ctx.fill();
    ctx.stroke();

    // Title
    const unlocked = AchievementStore.getUnlockedCount();
    ctx.fillStyle = '#cc8e28';
    ctx.font = `bold 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Achievements', w / 2, panelY + 32);

    // Progress counter
    ctx.fillStyle = '#96866a';
    ctx.font = `14px ${MONO}`;
    ctx.fillText(`${unlocked} / ${TOTAL_ACHIEVEMENTS} unlocked`, w / 2, panelY + 56);

    // Category tabs
    this.tabRects = [];
    const tabY = panelY + 74;
    const tabH = 26;
    const tabGap = 4;
    let tabX = panelX + 10;

    ctx.font = `12px ${FONT}`;
    for (let i = 0; i < CATEGORIES.length; i++) {
      const cat = CATEGORIES[i];
      const tw = ctx.measureText(cat.label).width + 16;
      const isActive = this.activeCategory === cat.key;
      const isHovered = this.hoveredTab === i;

      ctx.fillStyle = isActive ? '#2a221a' : (isHovered ? '#1d1813' : '#131110');
      ctx.strokeStyle = isActive ? (CATEGORY_COLORS[cat.key] || '#cc8e28') : '#2a221a';
      ctx.lineWidth = isActive ? 2 : 1;
      this.roundRect(ctx, tabX, tabY, tw, tabH, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = isActive ? (CATEGORY_COLORS[cat.key] || '#cc8e28') : '#96866a';
      ctx.font = `${isActive ? 'bold ' : ''}12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cat.label, tabX + tw / 2, tabY + tabH / 2);

      this.tabRects.push({ x: tabX, y: tabY, w: tw, h: tabH, key: cat.key });
      tabX += tw + tabGap;
    }

    // Achievement grid area
    const gridY = tabY + tabH + 12;
    const gridH = panelH - (gridY - panelY) - 60; // leave room for back button
    const gridW = panelW - 20;
    const gridX = panelX + 10;

    // Filter achievements
    const filtered = this.activeCategory === 'all'
      ? ACHIEVEMENT_DEFS
      : ACHIEVEMENT_DEFS.filter(a => a.category === this.activeCategory);

    // Two-column layout
    const colW = (gridW - 8) / 2;
    const tileH = 56;
    const tileGap = 4;
    const rows = Math.ceil(filtered.length / 2);
    const totalContentH = rows * (tileH + tileGap);
    this.maxScroll = Math.max(0, totalContentH - gridH);
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, this.maxScroll));

    // Clip to grid area
    ctx.save();
    ctx.beginPath();
    ctx.rect(gridX, gridY, gridW, gridH);
    ctx.clip();

    this.tileRects = [];
    for (let i = 0; i < filtered.length; i++) {
      const def = filtered[i];
      const row = Math.floor(i / 2);
      const col = i % 2;
      const tx = gridX + col * (colW + 8);
      const ty = gridY + row * (tileH + tileGap) - this.scrollOffset;

      // Skip if off-screen
      if (ty + tileH < gridY || ty > gridY + gridH) continue;

      const isUnlocked = AchievementStore.hasAchievement(def.id);
      this.drawTile(ctx, tx, ty, colW, tileH, def, isUnlocked);
      this.tileRects.push({ x: tx, y: ty, w: colW, h: tileH, id: def.id });
    }

    ctx.restore();

    // Scroll indicator
    if (this.maxScroll > 0) {
      const barH = Math.max(20, gridH * (gridH / totalContentH));
      const barY = gridY + (this.scrollOffset / this.maxScroll) * (gridH - barH);
      ctx.fillStyle = 'rgba(204, 142, 40, 0.3)';
      this.roundRect(ctx, gridX + gridW - 4, barY, 4, barH, 2);
      ctx.fill();
    }

    // Back button
    const btnW = 140;
    const btnH = 38;
    const btnX = (w - btnW) / 2;
    const btnY = panelY + panelH - btnH - 12;
    this.backBtn = { x: btnX, y: btnY, w: btnW, h: btnH };

    ctx.fillStyle = this.hoveredBack ? '#252019' : '#1d1813';
    ctx.strokeStyle = this.hoveredBack ? '#cc8e28' : '#2a221a';
    ctx.lineWidth = 2;
    this.roundRect(ctx, btnX, btnY, btnW, btnH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#eee6d2';
    ctx.font = `bold 15px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Back', btnX + btnW / 2, btnY + btnH / 2);

    ctx.restore();
  }

  private drawTile(
    ctx: CanvasRenderingContext2D,
    x: number, y: number, w: number, h: number,
    def: typeof ACHIEVEMENT_DEFS[0],
    unlocked: boolean,
  ): void {
    // Background
    ctx.fillStyle = unlocked ? '#1a1610' : '#111010';
    ctx.strokeStyle = unlocked ? '#3a321a' : '#1a1815';
    ctx.lineWidth = 1;
    this.roundRect(ctx, x, y, w, h, 5);
    ctx.fill();
    ctx.stroke();

    // Category accent line
    const accentColor = CATEGORY_COLORS[def.category] || '#cc8e28';
    ctx.fillStyle = unlocked ? accentColor : '#2a2520';
    ctx.fillRect(x, y + 2, 3, h - 4);

    // Icon
    const iconX = x + 14;
    const iconY = y + h / 2;
    ctx.font = unlocked ? '18px sans-serif' : '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = unlocked ? '#ffffff' : '#504030';
    ctx.fillText(unlocked ? def.icon : '🔒', iconX, iconY);

    // Name
    const textX = x + 32;
    const maxTextW = w - 40;
    ctx.textAlign = 'left';
    ctx.font = unlocked ? `bold 12px ${FONT}` : `12px ${FONT}`;
    ctx.fillStyle = unlocked ? '#ffd700' : '#605040';
    let name = def.name;
    while (ctx.measureText(name).width > maxTextW && name.length > 3) {
      name = name.slice(0, -4) + '...';
    }
    ctx.fillText(name, textX, y + 16);

    // Description
    ctx.font = `11px ${MONO}`;
    ctx.fillStyle = unlocked ? '#96866a' : '#403830';
    let desc: string;
    if (def.secret && !unlocked) {
      desc = '???';
    } else {
      desc = def.description;
    }
    while (ctx.measureText(desc).width > maxTextW && desc.length > 3) {
      desc = desc.slice(0, -4) + '...';
    }
    ctx.fillText(desc, textX, y + 32);

    // Bonus text
    if (unlocked && def.bonusDescription) {
      ctx.fillStyle = '#88cc88';
      ctx.font = `10px ${MONO}`;
      ctx.fillText(def.bonusDescription, textX, y + 46);
    }
  }

  handleMouseMove(x: number, y: number): boolean {
    if (!this.visible) return false;

    // Back button hover
    const b = this.backBtn;
    this.hoveredBack = x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

    // Tab hover
    this.hoveredTab = -1;
    for (let i = 0; i < this.tabRects.length; i++) {
      const t = this.tabRects[i];
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        this.hoveredTab = i;
        break;
      }
    }

    return true;
  }

  handleClick(x: number, y: number): boolean {
    if (!this.visible) return false;

    // Back button
    const b = this.backBtn;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      this.onBack?.();
      return true;
    }

    // Tabs
    for (const t of this.tabRects) {
      if (x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h) {
        this.activeCategory = t.key as AchievementCategory | 'all';
        this.scrollOffset = 0;
        return true;
      }
    }

    return true; // consume click on panel area
  }

  handleScroll(delta: number): boolean {
    if (!this.visible) return false;
    this.scrollOffset = Math.max(0, Math.min(this.maxScroll, this.scrollOffset - delta * 30));
    return true;
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
