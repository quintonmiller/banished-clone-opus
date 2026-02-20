interface MenuButton {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  action: string;
}

export class PauseMenu {
  private buttons: MenuButton[] = [];
  private hoveredButton = -1;
  private visible = false;

  onResume: (() => void) | null = null;
  onSave: (() => void) | null = null;
  onLoad: (() => void) | null = null;
  onSettings: (() => void) | null = null;
  onMainMenu: (() => void) | null = null;

  show(): void {
    this.visible = true;
    this.hoveredButton = -1;
  }

  hide(): void {
    this.visible = false;
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Draw the pause menu overlay. Call from the game's postRenderHook. */
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
    const panelW = 300;
    const panelH = 376;
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    ctx.fillStyle = '#1a1a2e';
    ctx.strokeStyle = '#445577';
    ctx.lineWidth = 2;
    this.roundRect(ctx, panelX, panelY, panelW, panelH, 12);
    ctx.fill();
    ctx.stroke();

    // Title
    ctx.fillStyle = '#c8a96e';
    ctx.font = 'bold 28px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Paused', w / 2, panelY + 40);

    // Buttons
    const btnW = 220;
    const btnH = 44;
    const btnX = (w - btnW) / 2;
    let btnY = panelY + 80;
    const gap = 12;

    const actions = ['resume', 'save', 'load', 'settings', 'mainmenu'];
    const labels = ['Resume', 'Save Game', 'Load Game', 'Settings', 'Main Menu'];

    this.buttons = [];
    for (let i = 0; i < labels.length; i++) {
      this.buttons.push({
        label: labels[i],
        x: btnX, y: btnY, w: btnW, h: btnH,
        action: actions[i],
      });
      btnY += btnH + gap;
    }

    for (let i = 0; i < this.buttons.length; i++) {
      this.drawButton(ctx, this.buttons[i], i === this.hoveredButton);
    }

    ctx.restore();
  }

  private drawButton(ctx: CanvasRenderingContext2D, btn: MenuButton, hovered: boolean): void {
    ctx.fillStyle = hovered ? '#2a3a5a' : '#1e2a44';
    ctx.strokeStyle = hovered ? '#88aaff' : '#445577';
    ctx.lineWidth = 2;

    this.roundRect(ctx, btn.x, btn.y, btn.w, btn.h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e0e0e0';
    ctx.font = 'bold 16px Georgia, "Times New Roman", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(btn.label, btn.x + btn.w / 2, btn.y + btn.h / 2);
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

  /** Handle mouse move for hover highlighting */
  handleMouseMove(x: number, y: number): boolean {
    if (!this.visible) return false;
    this.hoveredButton = -1;
    for (let i = 0; i < this.buttons.length; i++) {
      const b = this.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        this.hoveredButton = i;
        break;
      }
    }
    return true; // consume mouse move when visible
  }

  /** Handle click. Returns true if consumed. */
  handleClick(x: number, y: number): boolean {
    if (!this.visible) return false;

    for (const b of this.buttons) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
        switch (b.action) {
          case 'resume': this.onResume?.(); break;
          case 'save': this.onSave?.(); break;
          case 'load': this.onLoad?.(); break;
          case 'settings': this.onSettings?.(); break;
          case 'mainmenu': this.onMainMenu?.(); break;
        }
        return true;
      }
    }
    return true; // still consume click on overlay background
  }
}
