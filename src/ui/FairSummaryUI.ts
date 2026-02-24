import { FairSeasonStats, FestivalType } from '../types';
import { FAIR_REWARD_MAP } from '../data/FairRewardDefs';

interface RewardCard {
  id: string;
  name: string;
  description: string;
  flavorText: string;
  category: string;
  icon: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const FESTIVAL_NAMES: Record<FestivalType, string> = {
  planting_day: 'Planting Day Fair',
  midsummer: 'Midsummer Celebration',
  harvest_festival: 'Harvest Festival',
  frost_fair: 'Frost Fair',
};

const PROSPERITY_LABELS: [number, string, string][] = [
  [0.8, 'Flourishing',  '#66cc44'],
  [0.6, 'Prosperous',   '#ccaa33'],
  [0.4, 'Stable',       '#aa9870'],
  [0.2, 'Struggling',   '#cc7744'],
  [0.0, 'Desperate',    '#cc4444'],
];

function getProsperityLabel(p: number): { label: string; color: string } {
  for (const [threshold, label, color] of PROSPERITY_LABELS) {
    if (p >= threshold) return { label, color };
  }
  return { label: 'Desperate', color: '#cc4444' };
}

/**
 * Canvas-rendered modal that shows after a fair's flourish phase.
 * Displays season progress stats, village prosperity, and 3 reward choices.
 */
export class FairSummaryUI {
  private visible = false;
  private stats: FairSeasonStats | null = null;
  private festivalType: FestivalType | null = null;
  private year = 1;
  private prosperity = 0.5;
  private rewardCards: RewardCard[] = [];
  private hoveredCard = -1;

  onRewardChosen: ((rewardId: string) => void) | null = null;

  show(stats: FairSeasonStats, rewardOptionIds: string[], festivalType: FestivalType, year: number, prosperity?: number): void {
    this.visible = true;
    this.stats = stats;
    this.festivalType = festivalType;
    this.year = year;
    this.prosperity = prosperity ?? 0.5;
    this.hoveredCard = -1;
    this.rewardCards = [];

    // Build reward card data
    for (const id of rewardOptionIds) {
      const def = FAIR_REWARD_MAP.get(id);
      if (def) {
        this.rewardCards.push({
          id: def.id,
          name: def.name,
          description: def.description,
          flavorText: def.flavorText,
          category: def.category,
          icon: def.icon,
          x: 0, y: 0, w: 0, h: 0, // computed in draw()
        });
      }
    }
  }

  hide(): void {
    this.visible = false;
    this.stats = null;
    this.rewardCards = [];
    this.hoveredCard = -1;
  }

  isVisible(): boolean {
    return this.visible;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.visible || !this.stats) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Reset shadow state (may be left over from RenderSystem)
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const w = window.innerWidth;
    const h = window.innerHeight;

    // Dark overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
    ctx.fillRect(0, 0, w, h);

    // Panel dimensions (round to integers for crisp rendering)
    const panelW = Math.min(740, w - 40);
    const panelH = Math.min(580, h - 40);
    const panelX = Math.round((w - panelW) / 2);
    const panelY = Math.round((h - panelH) / 2);

    // Panel background
    ctx.fillStyle = '#161210';
    ctx.strokeStyle = '#2a221a';
    ctx.lineWidth = 2;
    this.roundRect(ctx, panelX, panelY, panelW, panelH, 12);
    ctx.fill();
    ctx.stroke();

    // Inner glow border
    ctx.strokeStyle = '#3a3020';
    ctx.lineWidth = 1;
    this.roundRect(ctx, panelX + 4, panelY + 4, panelW - 8, panelH - 8, 10);
    ctx.stroke();

    // Title
    const title = this.festivalType ? FESTIVAL_NAMES[this.festivalType] : 'Festival';
    ctx.fillStyle = '#cc8e28';
    ctx.font = 'bold 26px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${title} — Year ${this.year}`, w / 2, panelY + 36);

    // ── Stats + Prosperity row ──
    const statsY = panelY + 60;

    // Prosperity badge (right side)
    const prosInfo = getProsperityLabel(this.prosperity);
    ctx.font = 'bold 13px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#887766';
    ctx.fillText('Village: ', panelX + panelW - 24 - ctx.measureText(prosInfo.label).width, statsY + 8);
    ctx.fillStyle = prosInfo.color;
    ctx.fillText(prosInfo.label, panelX + panelW - 24, statsY + 8);

    // "This Season" label (left side)
    ctx.font = '14px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#aa9870';
    ctx.fillText('This Season:', panelX + 24, statsY + 8);

    const stats = this.stats;
    const statLines: [string, number][] = [
      ['Babies Born', stats.babiesBorn],
      ['Couples Formed', stats.couplesMet],
      ['Weddings', stats.couplesMarried],
      ['New Citizens', stats.newCitizens],
      ['Buildings Completed', stats.buildingsCompleted],
      ['Buildings Upgraded', stats.buildingsUpgraded],
      ['Citizens Lost', stats.citizensDied],
    ];

    ctx.font = '13px Georgia, "Times New Roman", serif';
    const col1X = panelX + 30;
    const col2X = Math.round(panelX + panelW / 2 + 10);
    const sy = statsY + 28;

    for (let i = 0; i < statLines.length; i++) {
      const [label, val] = statLines[i];
      const cx = i < 4 ? col1X : col2X;
      const cy = i < 4 ? sy + i * 20 : sy + (i - 4) * 20;
      ctx.fillStyle = '#eee6d2';
      ctx.fillText(label + ':', cx, cy);
      ctx.fillStyle = val > 0 ? '#cc8e28' : '#887766';
      ctx.fillText(String(val), cx + 160, cy);
    }

    // ── Divider ──
    const divY = sy + 83;
    ctx.strokeStyle = '#2a221a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 20, divY);
    ctx.lineTo(panelX + panelW - 20, divY);
    ctx.stroke();

    // ── Reward section ──
    const rewardHeaderY = Math.round(divY + 20);
    ctx.fillStyle = '#cc8e28';
    ctx.font = 'bold 18px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillText('Choose a Reward', w / 2, rewardHeaderY);

    // Reward cards
    const cardCount = this.rewardCards.length;
    if (cardCount === 0) {
      ctx.fillStyle = '#887766';
      ctx.font = '14px Georgia, "Times New Roman", serif';
      ctx.fillText('No rewards available.', w / 2, rewardHeaderY + 60);
      ctx.restore();
      return;
    }

    const cardW = Math.round(Math.min(210, (panelW - 60 - (cardCount - 1) * 16) / cardCount));
    const cardH = 240;
    const cardTotalW = cardCount * cardW + (cardCount - 1) * 16;
    const cardStartX = Math.round((w - cardTotalW) / 2);
    const cardY = Math.round(rewardHeaderY + 28);

    for (let i = 0; i < cardCount; i++) {
      const card = this.rewardCards[i];
      const cx = Math.round(cardStartX + i * (cardW + 16));
      card.x = cx;
      card.y = cardY;
      card.w = cardW;
      card.h = cardH;

      const isHovered = i === this.hoveredCard;

      // Card background
      ctx.fillStyle = isHovered ? '#252019' : '#1d1813';
      ctx.strokeStyle = isHovered ? '#cc8e28' : '#2a221a';
      ctx.lineWidth = isHovered ? 2 : 1;
      this.roundRect(ctx, cx, cardY, cardW, cardH, 8);
      ctx.fill();
      ctx.stroke();

      // Category badge
      const badgeColors: Record<string, string> = {
        building: '#44aa44',
        traveler: '#4488cc',
        knowledge: '#aa66cc',
        resources: '#ccaa33',
      };
      const badgeColor = badgeColors[card.category] || '#888888';
      const badgeText = card.category.charAt(0).toUpperCase() + card.category.slice(1);
      ctx.fillStyle = badgeColor;
      ctx.font = 'bold 10px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'left';
      const badgeW = ctx.measureText(badgeText).width + 8;
      this.roundRect(ctx, cx + 8, cardY + 8, badgeW, 16, 3);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, cx + 12, cardY + 16);

      // Icon
      ctx.fillStyle = '#cc8e28';
      ctx.font = 'bold 28px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(card.icon, cx + cardW / 2, cardY + 48);

      // Name
      ctx.fillStyle = isHovered ? '#ffdd88' : '#eee6d2';
      ctx.font = 'bold 13px Georgia, "Times New Roman", serif';
      ctx.textAlign = 'center';
      ctx.fillText(card.name, cx + cardW / 2, cardY + 70);

      // Flavor text (italic, word-wrapped)
      ctx.fillStyle = '#887766';
      ctx.font = 'italic 10px Georgia, "Times New Roman", serif';
      const flavorLines = this.wrapText(ctx, card.flavorText, cardW - 16);
      let flavorEndY = cardY + 86;
      for (let j = 0; j < Math.min(flavorLines.length, 3); j++) {
        ctx.fillText(flavorLines[j], cx + cardW / 2, flavorEndY + j * 13);
      }
      flavorEndY += Math.min(flavorLines.length, 3) * 13 + 6;

      // Description (word-wrapped)
      ctx.fillStyle = '#aa9870';
      ctx.font = '11px Georgia, "Times New Roman", serif';
      const descLines = this.wrapText(ctx, card.description, cardW - 16);
      for (let j = 0; j < Math.min(descLines.length, 3); j++) {
        ctx.fillText(descLines[j], cx + cardW / 2, flavorEndY + j * 14);
      }
    }

    // Click hint
    ctx.fillStyle = '#665544';
    ctx.font = '12px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.fillText('Click a reward to choose it', w / 2, panelY + panelH - 16);

    ctx.restore();
  }

  handleMouseMove(x: number, y: number): boolean {
    if (!this.visible) return false;
    this.hoveredCard = -1;
    for (let i = 0; i < this.rewardCards.length; i++) {
      const c = this.rewardCards[i];
      if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) {
        this.hoveredCard = i;
        break;
      }
    }
    return true;
  }

  handleClick(x: number, y: number): boolean {
    if (!this.visible) return false;

    for (const card of this.rewardCards) {
      if (x >= card.x && x <= card.x + card.w && y >= card.y && y <= card.y + card.h) {
        this.onRewardChosen?.(card.id);
        return true;
      }
    }
    return true; // consume click on overlay background
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

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const test = current ? current + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  }
}
