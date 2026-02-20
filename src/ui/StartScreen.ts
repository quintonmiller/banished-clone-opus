import type { SaveManager } from '../save/SaveManager';

interface Button {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  enabled: boolean;
  subText?: string;
}

export class StartScreen {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private saveManager: SaveManager;
  private seedInput: HTMLInputElement | null = null;
  private footer: HTMLElement;
  private showingSeedInput = false;
  private buttons: Button[] = [];
  private hoveredButton: number = -1;
  private rafId = 0;
  private running = false;

  onNewGame: ((seed: number) => void) | null = null;
  onLoadGame: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement, saveManager: SaveManager) {
    this.canvas = canvas;
    this.saveManager = saveManager;
    this.ctx = canvas.getContext('2d')!;

    // Footer
    this.footer = document.createElement('div');
    this.footer.style.cssText = `
      position: absolute;
      bottom: 16px;
      left: 0;
      right: 0;
      text-align: center;
      z-index: 10;
      font: 13px Georgia, "Times New Roman", serif;
      color: #555;
    `;
    const link = document.createElement('a');
    link.href = 'https://quinton.dev';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Made by Quinton Miller';
    link.style.cssText = 'color: #667; text-decoration: none;';
    link.addEventListener('mouseenter', () => { link.style.color = '#99b'; });
    link.addEventListener('mouseleave', () => { link.style.color = '#667'; });
    this.footer.appendChild(link);
    document.body.appendChild(this.footer);

    // Mouse events
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('click', this.onClick);
  }

  start(): void {
    this.running = true;
    this.resizeCanvas();
    this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('click', this.onClick);
    this.hideSeedInput();
    this.footer.remove();
  }

  private showSeedInput(): void {
    if (this.seedInput) return;
    this.showingSeedInput = true;

    this.seedInput = document.createElement('input');
    this.seedInput.id = 'seed-input';
    this.seedInput.type = 'text';
    this.seedInput.placeholder = 'Enter a seed...';
    this.seedInput.style.cssText = `
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 280px;
      padding: 10px 14px;
      font-size: 15px;
      font-family: 'Courier New', Courier, monospace;
      background: #1a1a2e;
      color: #e0e0e0;
      border: 2px solid #444;
      border-radius: 6px;
      outline: none;
      text-align: center;
      z-index: 10;
    `;
    document.body.appendChild(this.seedInput);
    this.seedInput.focus();

    this.seedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.startSeededGame();
      } else if (e.key === 'Escape') {
        this.hideSeedInput();
      }
    });
  }

  private hideSeedInput(): void {
    this.showingSeedInput = false;
    if (this.seedInput) {
      this.seedInput.remove();
      this.seedInput = null;
    }
  }

  private resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  private loop = (): void => {
    if (!this.running) return;
    this.draw();
    this.rafId = requestAnimationFrame(this.loop);
  };

  private draw(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;

    this.ctx.save();
    this.ctx.scale(dpr, dpr);

    // Solid dark background
    this.ctx.fillStyle = '#0d0d1a';
    this.ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    let cy = h * 0.22;

    // Title
    this.ctx.fillStyle = '#c8a96e';
    this.ctx.font = 'bold 52px Georgia, "Times New Roman", serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('Exiled', cx, cy);

    cy += 44;
    this.ctx.fillStyle = '#6a6a7a';
    this.ctx.font = 'italic 17px Georgia, "Times New Roman", serif';
    this.ctx.fillText('A Settlement Survival Game', cx, cy);

    // Buttons
    const btnW = 280;
    const btnH = 48;
    const btnX = cx - btnW / 2;
    let btnY = cy + 60;

    this.buttons = [];

    if (this.showingSeedInput) {
      // Seed input mode: show the input and a "Start" button below it
      if (this.seedInput) {
        this.seedInput.style.top = btnY + 'px';
      }
      btnY += 60;

      this.buttons.push({
        label: 'Start',
        x: btnX, y: btnY, w: btnW, h: btnH,
        enabled: true,
      });
      btnY += btnH + 12;

      this.buttons.push({
        label: 'Back',
        x: btnX, y: btnY, w: btnW, h: btnH,
        enabled: true,
      });
    } else {
      // Main menu buttons
      this.buttons.push({
        label: 'New Game',
        x: btnX, y: btnY, w: btnW, h: btnH,
        enabled: true,
      });
      btnY += btnH + 12;

      this.buttons.push({
        label: 'New Game (from seed)',
        x: btnX, y: btnY, w: btnW, h: btnH,
        enabled: true,
      });
      btnY += btnH + 12;

      // Load Game button
      const meta = this.saveManager.getSaveMetadata();
      let subText: string | undefined;
      if (meta.exists) {
        const date = meta.savedAt ? new Date(meta.savedAt).toLocaleDateString() : '?';
        subText = `Year ${meta.year}, Pop ${meta.population} — ${date}`;
      }
      this.buttons.push({
        label: 'Load Game',
        x: btnX, y: btnY, w: btnW, h: meta.exists ? btnH + 20 : btnH,
        enabled: meta.exists,
        subText,
      });
    }

    // Draw buttons
    for (let i = 0; i < this.buttons.length; i++) {
      this.drawButton(this.buttons[i], i === this.hoveredButton);
    }

    this.ctx.restore();
  }

  private drawButton(btn: Button, hovered: boolean): void {
    const ctx = this.ctx;

    // Background
    if (!btn.enabled) {
      ctx.fillStyle = '#1a1a2e';
    } else if (hovered) {
      ctx.fillStyle = '#2a3a5a';
    } else {
      ctx.fillStyle = '#1e2a44';
    }
    ctx.strokeStyle = btn.enabled ? (hovered ? '#88aaff' : '#445577') : '#2a2a3e';
    ctx.lineWidth = 2;

    this.roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 8);
    ctx.fill();
    ctx.stroke();

    // Label
    ctx.fillStyle = btn.enabled ? '#e0e0e0' : '#555';
    ctx.font = 'bold 17px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelY = btn.subText ? btn.y + btn.h / 2 - 10 : btn.y + btn.h / 2;
    ctx.fillText(btn.label, btn.x + btn.w / 2, labelY);

    // Sub text
    if (btn.subText) {
      ctx.fillStyle = btn.enabled ? '#8a9ab0' : '#444';
      ctx.font = '12px "Courier New", Courier, monospace';
      ctx.fillText(btn.subText, btn.x + btn.w / 2, btn.y + btn.h / 2 + 12);
    }
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

  private onMouseMove = (e: MouseEvent): void => {
    const mx = e.clientX;
    const my = e.clientY;
    this.hoveredButton = -1;
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      if (b.enabled && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        this.hoveredButton = i;
        break;
      }
    }
    this.canvas.style.cursor = this.hoveredButton >= 0 ? 'pointer' : 'default';
  };

  private onClick = (e: MouseEvent): void => {
    const mx = e.clientX;
    const my = e.clientY;
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      if (b.enabled && mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
        if (this.showingSeedInput) {
          if (i === 0) this.startSeededGame(); // Start
          if (i === 1) this.hideSeedInput();    // Back
        } else {
          if (i === 0) this.onNewGame?.(Date.now());        // New Game (random)
          if (i === 1) this.showSeedInput();                 // New Game (from seed)
          if (i === 2) this.onLoadGame?.();                  // Load Game
        }
        break;
      }
    }
  };

  private startSeededGame(): void {
    const text = this.seedInput?.value.trim() ?? '';
    let seed: number;
    if (text === '') {
      seed = Date.now();
    } else {
      const num = Number(text);
      seed = isNaN(num) ? this.hashString(text) : num;
    }
    this.onNewGame?.(seed);
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + c;
      hash |= 0;
    }
    return Math.abs(hash);
  }
}
