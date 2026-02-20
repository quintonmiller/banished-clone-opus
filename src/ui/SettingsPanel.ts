import { Settings, SettingsData } from '../Settings';

type NumericSettingsKey = { [K in keyof SettingsData]: SettingsData[K] extends number ? K : never }[keyof SettingsData];

interface Slider {
  key: NumericSettingsKey;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  x: number;
  y: number;
  w: number;
}

interface Toggle {
  key: keyof SettingsData;
  label: string;
  x: number;
  y: number;
  w: number;
  boxX: number;
  boxY: number;
  boxSize: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const TRACK_H = 6;
const THUMB_R = 8;
const SLIDER_H = 40;
const TOGGLE_H = 28;
const FONT = 'Georgia, "Times New Roman", serif';

export class SettingsPanel {
  private visible = false;
  private sliders: Slider[] = [];
  private toggles: Toggle[] = [];
  private backBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hoveredBack = false;
  private draggingSlider: number = -1;

  onBack: (() => void) | null = null;

  show(): void {
    this.visible = true;
    this.draggingSlider = -1;
  }

  hide(): void {
    this.visible = false;
    this.draggingSlider = -1;
  }

  isVisible(): boolean {
    return this.visible;
  }

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
    const panelW = 360;
    const panelH = 420;
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
    ctx.font = `bold 28px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Settings', w / 2, panelY + 40);

    // Build controls
    this.sliders = [];
    this.toggles = [];
    const controlW = panelW - 60;
    const controlX = panelX + 30;
    let cy = panelY + 80;

    // Slider: Arrow Movement Speed
    this.sliders.push({
      key: 'cameraPanSpeed',
      label: 'Arrow Movement Speed',
      min: 100, max: 1200, step: 50,
      format: (v) => {
        if (v <= 200) return 'Slow';
        if (v <= 400) return 'Normal';
        if (v <= 700) return 'Fast';
        return 'Very Fast';
      },
      x: controlX, y: cy, w: controlW,
    });
    cy += SLIDER_H + 20;

    // Slider: Zoom Speed
    this.sliders.push({
      key: 'zoomSpeed',
      label: 'Zoom Speed',
      min: 0.02, max: 0.3, step: 0.02,
      format: (v) => {
        if (v <= 0.05) return 'Slow';
        if (v <= 0.1) return 'Normal';
        if (v <= 0.2) return 'Fast';
        return 'Very Fast';
      },
      x: controlX, y: cy, w: controlW,
    });
    cy += SLIDER_H + 20;

    // Slider: UI Scale
    this.sliders.push({
      key: 'uiScale',
      label: 'UI Scale',
      min: 0.5, max: 2.0, step: 0.1,
      format: (v) => `${Math.round(v * 100)}%`,
      x: controlX, y: cy, w: controlW,
    });
    cy += SLIDER_H + 20;

    // Toggle: Edge Panning
    const boxSize = 18;
    this.toggles.push({
      key: 'edgePanEnabled',
      label: 'Edge Panning',
      x: controlX, y: cy, w: controlW,
      boxX: controlX + controlW - boxSize,
      boxY: cy - boxSize / 2,
      boxSize,
    });
    cy += TOGGLE_H + 10;

    // Draw sliders
    for (let i = 0; i < this.sliders.length; i++) {
      this.drawSlider(ctx, this.sliders[i]);
    }

    // Draw toggles
    for (const toggle of this.toggles) {
      this.drawToggle(ctx, toggle);
    }

    // Back button
    const btnW = 160;
    const btnH = 42;
    const btnX = (w - btnW) / 2;
    const btnY = panelY + panelH - btnH - 24;
    this.backBtn = { x: btnX, y: btnY, w: btnW, h: btnH };

    ctx.fillStyle = this.hoveredBack ? '#2a3a5a' : '#1e2a44';
    ctx.strokeStyle = this.hoveredBack ? '#88aaff' : '#445577';
    ctx.lineWidth = 2;
    this.roundRect(ctx, btnX, btnY, btnW, btnH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#e0e0e0';
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Back', btnX + btnW / 2, btnY + btnH / 2);

    ctx.restore();
  }

  private drawSlider(ctx: CanvasRenderingContext2D, slider: Slider): void {
    const value = Settings.get(slider.key) as number;
    const t = (value - slider.min) / (slider.max - slider.min);

    // Label
    ctx.fillStyle = '#b0b0c0';
    ctx.font = `14px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(slider.label, slider.x, slider.y);

    // Value text
    ctx.fillStyle = '#c8a96e';
    ctx.font = `bold 14px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(slider.format(value), slider.x + slider.w, slider.y);

    // Track
    const trackY = slider.y + 24;
    ctx.fillStyle = '#2a2a44';
    this.roundRect(ctx, slider.x, trackY - TRACK_H / 2, slider.w, TRACK_H, 3);
    ctx.fill();

    // Filled portion
    ctx.fillStyle = '#445588';
    this.roundRect(ctx, slider.x, trackY - TRACK_H / 2, slider.w * t, TRACK_H, 3);
    ctx.fill();

    // Thumb
    const thumbX = slider.x + slider.w * t;
    ctx.beginPath();
    ctx.arc(thumbX, trackY, THUMB_R, 0, Math.PI * 2);
    ctx.fillStyle = '#88aaff';
    ctx.fill();
    ctx.strokeStyle = '#aaccff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawToggle(ctx: CanvasRenderingContext2D, toggle: Toggle): void {
    const enabled = Settings.get(toggle.key) as boolean;

    // Label
    ctx.fillStyle = '#b0b0c0';
    ctx.font = `14px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(toggle.label, toggle.x, toggle.y);

    // Checkbox
    const { boxX, boxY, boxSize } = toggle;
    ctx.fillStyle = enabled ? '#445588' : '#2a2a44';
    ctx.strokeStyle = enabled ? '#88aaff' : '#555';
    ctx.lineWidth = 2;
    this.roundRect(ctx, boxX, boxY, boxSize, boxSize, 3);
    ctx.fill();
    ctx.stroke();

    // Checkmark
    if (enabled) {
      ctx.strokeStyle = '#88ffaa';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(boxX + 4, boxY + boxSize / 2);
      ctx.lineTo(boxX + boxSize / 2 - 1, boxY + boxSize - 5);
      ctx.lineTo(boxX + boxSize - 4, boxY + 4);
      ctx.stroke();
    }
  }

  handleMouseMove(x: number, y: number): boolean {
    if (!this.visible) return false;

    // Update back hover
    const b = this.backBtn;
    this.hoveredBack = x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

    // Drag slider
    if (this.draggingSlider >= 0) {
      this.updateSliderFromMouse(this.sliders[this.draggingSlider], x);
    }

    return true;
  }

  handleMouseDown(x: number, y: number): boolean {
    if (!this.visible) return false;

    // Check sliders
    for (let i = 0; i < this.sliders.length; i++) {
      const s = this.sliders[i];
      const trackY = s.y + 24;
      if (x >= s.x - THUMB_R && x <= s.x + s.w + THUMB_R &&
          y >= trackY - THUMB_R - 4 && y <= trackY + THUMB_R + 4) {
        this.draggingSlider = i;
        this.updateSliderFromMouse(s, x);
        return true;
      }
    }

    return true; // consume
  }

  handleMouseUp(x: number, y: number): boolean {
    if (!this.visible) return false;

    this.draggingSlider = -1;

    // Check toggles
    for (const toggle of this.toggles) {
      const { boxX, boxY, boxSize } = toggle;
      if (x >= boxX && x <= boxX + boxSize && y >= boxY && y <= boxY + boxSize) {
        const current = Settings.get(toggle.key) as boolean;
        Settings.set(toggle.key, !current);
        return true;
      }
    }

    // Check back button
    const b = this.backBtn;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      this.onBack?.();
      return true;
    }

    return true; // consume
  }

  private updateSliderFromMouse(slider: Slider, mx: number): void {
    const t = Math.max(0, Math.min(1, (mx - slider.x) / slider.w));
    const raw = slider.min + t * (slider.max - slider.min);
    const snapped = Math.round(raw / slider.step) * slider.step;
    const clamped = Math.max(slider.min, Math.min(slider.max, snapped));
    Settings.set(slider.key, clamped);
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
