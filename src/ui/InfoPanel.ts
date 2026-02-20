import type { Game } from '../Game';
import { INFO_PANEL_WIDTH, HUD_HEIGHT, SKILL_XP_PER_LEVEL, SKILL_MAX_LEVEL } from '../constants';
import { Settings } from '../Settings';
import { EntityId } from '../types';

const PANEL_HEIGHT = 520;
const BTN_WIDTH = 120;
const BTN_HEIGHT = 22;

interface LinkRect {
  x: number;
  y: number;
  w: number;
  h: number;
  entityId: EntityId;
}

export class InfoPanel {
  private game: Game;

  // Button hit-test rects (in UI-scaled coords)
  private assignBtnRect: { x: number; y: number; w: number; h: number } | null = null;
  private unassignBtnRect: { x: number; y: number; w: number; h: number } | null = null;

  // Clickable entity link rects
  private linkRects: LinkRect[] = [];

  constructor(game: Game) {
    this.game = game;
  }

  /** Returns true if the click was consumed by a button or link */
  handleClick(screenX: number, screenY: number): boolean {
    const s = Settings.get('uiScale');
    const x = screenX / s;
    const y = screenY / s;

    const id = this.game.state.selectedEntity;
    if (id === null) return false;

    // Check clickable entity links
    for (const link of this.linkRects) {
      if (x >= link.x && x <= link.x + link.w && y >= link.y && y <= link.y + link.h) {
        this.selectAndFocus(link.entityId);
        return true;
      }
    }

    const citizen = this.game.world.getComponent<any>(id, 'citizen');
    if (!citizen) return false;

    const worker = this.game.world.getComponent<any>(id, 'worker');
    if (!worker) return false;

    // Check [Assign] button
    if (this.assignBtnRect) {
      const r = this.assignBtnRect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.game.state.assigningWorker = id;
        return true;
      }
    }

    // Check [Unassign] button
    if (this.unassignBtnRect) {
      const r = this.unassignBtnRect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.game.unassignWorker(id);
        return true;
      }
    }

    return false;
  }

  /** Select an entity and center the camera on it */
  private selectAndFocus(entityId: EntityId): void {
    if (!this.game.world.entityExists(entityId)) return;
    this.game.state.selectedEntity = entityId;
    const pos = this.game.world.getComponent<any>(entityId, 'position');
    if (pos) {
      this.game.camera.centerOn(pos.tileX, pos.tileY);
    }
  }

  /** Draw a clickable link and register its hit rect. Returns the width of the drawn text. */
  private drawLink(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    entityId: EntityId,
  ): number {
    const width = ctx.measureText(text).width;
    ctx.fillStyle = '#55ccff';
    ctx.fillText(text, x, y);
    // Underline
    ctx.strokeStyle = '#55ccff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 2);
    ctx.lineTo(x + width, y + 2);
    ctx.stroke();
    // Register hit rect (text is drawn from baseline, so top is ~10px above)
    this.linkRects.push({ x, y: y - 11, w: width, h: 14, entityId });
    return width;
  }

  draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    const id = this.game.state.selectedEntity;
    if (id === null) return;

    // Clear button and link rects each frame
    this.assignBtnRect = null;
    this.unassignBtnRect = null;
    this.linkRects = [];

    const world = this.game.world;
    if (!world.entityExists(id)) {
      this.game.state.selectedEntity = null;
      return;
    }

    const x = canvasWidth - INFO_PANEL_WIDTH;
    const y = HUD_HEIGHT + 10;
    const w = INFO_PANEL_WIDTH - 10;

    // Background
    ctx.fillStyle = 'rgba(20, 20, 30, 0.9)';
    ctx.fillRect(x, y, w, PANEL_HEIGHT);
    ctx.strokeStyle = '#555';
    ctx.strokeRect(x, y, w, PANEL_HEIGHT);

    let textY = y + 20;
    const leftX = x + 10;
    ctx.font = '12px monospace';

    // Citizen info
    const citizen = world.getComponent<any>(id, 'citizen');
    if (citizen) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(citizen.name, leftX, textY);
      textY += 20;

      ctx.font = '12px monospace';
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText(`Age: ${citizen.age}  ${citizen.isMale ? 'Male' : 'Female'}`, leftX, textY);
      textY += 16;
      ctx.fillText(`${citizen.isChild ? 'Child' : 'Adult'}  ${citizen.isEducated ? 'Educated' : 'Uneducated'}`, leftX, textY);
      textY += 16;

      // Personality traits
      if (citizen.traits && citizen.traits.length > 0) {
        const traitColors: Record<string, string> = {
          hardworking: '#44cc44',
          lazy: '#cc8844',
          cheerful: '#ffdd44',
          shy: '#8888cc',
          adventurous: '#44ccaa',
        };
        ctx.font = '11px monospace';
        let tx = leftX;
        for (const trait of citizen.traits) {
          const label = (trait as string).charAt(0).toUpperCase() + (trait as string).slice(1);
          ctx.fillStyle = traitColors[trait as string] || '#aaaaaa';
          ctx.fillText(label, tx, textY);
          tx += ctx.measureText(label).width + 8;
        }
        textY += 16;
      }
      textY += 4;

      // Needs bars
      const needs = world.getComponent<any>(id, 'needs');
      if (needs) {
        this.drawBar(ctx, leftX, textY, w - 20, 'Food', needs.food, '#44aa44');
        textY += 18;
        this.drawBar(ctx, leftX, textY, w - 20, 'Energy', needs.energy ?? 100, '#ffdd44');
        textY += 18;
        this.drawBar(ctx, leftX, textY, w - 20, 'Warmth', needs.warmth, '#ff8844');
        textY += 18;
        this.drawBar(ctx, leftX, textY, w - 20, 'Health', needs.health, '#ff4444');
        textY += 18;
        this.drawBar(ctx, leftX, textY, w - 20, 'Happy', needs.happiness, '#44aaff');
        textY += 22;
      }

      // Sleeping status
      if (citizen.isSleeping) {
        ctx.fillStyle = '#aaaaff';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('Sleeping...', leftX, textY);
        textY += 16;
      }

      // Disease status
      if (needs?.isSick) {
        ctx.fillStyle = '#44dd44';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('SICK', leftX, textY);
        textY += 16;
      }

      // Pregnancy status
      const familyEarly = world.getComponent<any>(id, 'family');
      if (familyEarly?.isPregnant) {
        const ticks = familyEarly.pregnancyTicks || 0;
        let trimesterLabel: string;
        let trimesterColor: string;
        if (ticks < 1800) {
          trimesterLabel = 'T1';
          trimesterColor = '#aaddaa';
        } else if (ticks < 3600) {
          trimesterLabel = 'T2';
          trimesterColor = '#dddd88';
        } else {
          trimesterLabel = 'T3';
          trimesterColor = '#ddaa88';
        }

        ctx.fillStyle = trimesterColor;
        ctx.font = 'bold 12px monospace';
        ctx.fillText(`Pregnant (${trimesterLabel})`, leftX, textY);
        textY += 16;

        const progressPct = Math.min(100, (ticks / 5400) * 100);
        this.drawBar(ctx, leftX, textY, w - 20, 'Preg.', progressPct, trimesterColor);
        textY += 18;
      }

      // Diet info
      if (needs && needs.recentDiet && needs.recentDiet.length > 0) {
        const unique = new Set(needs.recentDiet).size;
        const dietLabel = unique >= 3 ? 'Varied' : unique === 1 ? 'Monotonous' : 'Limited';
        const dietColor = unique >= 3 ? '#44aa44' : unique === 1 ? '#cc6644' : '#aaaa44';
        ctx.fillStyle = dietColor;
        ctx.font = '11px monospace';
        ctx.fillText(`Diet: ${dietLabel} (${unique} types)`, leftX, textY);
        textY += 16;
      }

      // Worker info + assign/unassign buttons
      const worker = world.getComponent<any>(id, 'worker');
      if (worker) {
        ctx.fillStyle = '#cccccc';
        ctx.font = '12px monospace';
        const jobLabel = `Job: ${worker.profession}`;
        ctx.fillText(jobLabel, leftX, textY);
        // Show [Manual] tag if manually assigned
        if (worker.manuallyAssigned) {
          const jobWidth = ctx.measureText(jobLabel).width;
          ctx.fillStyle = '#ffdd44';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('[Manual]', leftX + jobWidth + 6, textY);
        }
        textY += 16;

        if (worker.carrying) {
          ctx.fillStyle = '#cccccc';
          ctx.font = '12px monospace';
          ctx.fillText(`Carrying: ${worker.carrying} x${worker.carryAmount}`, leftX, textY);
          textY += 16;
        }

        // [Assign to Building] button (always shown for adult workers)
        if (!citizen.isChild) {
          textY += 6;
          const btnX = leftX;
          const btnY = textY;
          this.assignBtnRect = { x: btnX, y: btnY, w: BTN_WIDTH, h: BTN_HEIGHT };

          ctx.strokeStyle = '#44cc66';
          ctx.lineWidth = 1;
          ctx.strokeRect(btnX, btnY, BTN_WIDTH, BTN_HEIGHT);
          ctx.fillStyle = 'rgba(40, 80, 50, 0.6)';
          ctx.fillRect(btnX, btnY, BTN_WIDTH, BTN_HEIGHT);
          ctx.fillStyle = '#88ff88';
          ctx.font = 'bold 11px monospace';
          ctx.fillText('Assign to Bldg', btnX + 6, btnY + 15);
          textY += BTN_HEIGHT + 4;

          // [Unassign] button (only shown if currently assigned)
          if (worker.workplaceId !== null) {
            const ubtnX = leftX;
            const ubtnY = textY;
            this.unassignBtnRect = { x: ubtnX, y: ubtnY, w: BTN_WIDTH, h: BTN_HEIGHT };

            ctx.strokeStyle = '#cc4444';
            ctx.lineWidth = 1;
            ctx.strokeRect(ubtnX, ubtnY, BTN_WIDTH, BTN_HEIGHT);
            ctx.fillStyle = 'rgba(80, 30, 30, 0.6)';
            ctx.fillRect(ubtnX, ubtnY, BTN_WIDTH, BTN_HEIGHT);
            ctx.fillStyle = '#ff8888';
            ctx.font = 'bold 11px monospace';
            ctx.fillText('Unassign', ubtnX + 6, ubtnY + 15);
            textY += BTN_HEIGHT + 4;
          }
        }
      }

      // Skills
      const workerForSkills = world.getComponent<any>(id, 'worker');
      if (workerForSkills?.skills) {
        ctx.fillStyle = '#cccccc';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('Skills:', leftX, textY);
        textY += 14;
        for (const [skillName, skillData] of Object.entries(workerForSkills.skills)) {
          const sd = skillData as { xp: number; level: number };
          const label = (skillName as string).charAt(0).toUpperCase() + (skillName as string).slice(1);
          const progress = sd.level >= SKILL_MAX_LEVEL ? 100 : (sd.xp / SKILL_XP_PER_LEVEL) * 100;
          const levelColor = sd.level >= SKILL_MAX_LEVEL ? '#ffdd44' : '#88bbff';
          ctx.fillStyle = levelColor;
          ctx.font = '10px monospace';
          ctx.fillText(`${label} Lv${sd.level}`, leftX, textY + 9);
          // Mini progress bar
          const barX = leftX + 90;
          const barW = w - 110;
          ctx.fillStyle = '#333';
          ctx.fillRect(barX, textY, barW, 10);
          ctx.fillStyle = levelColor;
          ctx.fillRect(barX, textY, barW * (progress / 100), 10);
          if (sd.level >= SKILL_MAX_LEVEL) {
            ctx.fillStyle = '#ffdd44';
            ctx.font = 'bold 9px monospace';
            ctx.fillText('MAX', barX + 2, textY + 8);
          }
          textY += 14;
        }
        textY += 4;
      }

      // Family info
      const family = world.getComponent<any>(id, 'family');
      if (family) {
        ctx.font = '12px monospace';
        if (family.partnerId !== null && world.entityExists(family.partnerId)) {
          const partner = world.getComponent<any>(family.partnerId, 'citizen');
          ctx.fillStyle = '#cccccc';
          const labelW = ctx.measureText('Partner: ').width;
          ctx.fillText('Partner: ', leftX, textY);
          this.drawLink(ctx, partner?.name || 'Unknown', leftX + labelW, textY, family.partnerId);
          textY += 16;
        }
        if (family.childrenIds.length > 0) {
          ctx.fillStyle = '#cccccc';
          ctx.font = '12px monospace';
          const childLabel = 'Children: ';
          const childLabelW = ctx.measureText(childLabel).width;
          ctx.fillText(childLabel, leftX, textY);
          let cx = leftX + childLabelW;
          for (let i = 0; i < family.childrenIds.length; i++) {
            const childId = family.childrenIds[i];
            if (!world.entityExists(childId)) continue;
            const child = world.getComponent<any>(childId, 'citizen');
            const childName = child?.name || '?';
            ctx.font = '12px monospace';
            const linkW = this.drawLink(ctx, childName, cx, textY, childId);
            cx += linkW;
            if (i < family.childrenIds.length - 1) {
              ctx.fillStyle = '#cccccc';
              ctx.fillText(', ', cx, textY);
              cx += ctx.measureText(', ').width;
            }
          }
          textY += 16;
        }
        if (family.homeId !== null && world.entityExists(family.homeId)) {
          ctx.font = '12px monospace';
          const homeBld = world.getComponent<any>(family.homeId, 'building');
          const homeLabel = homeBld?.name || 'Home';
          ctx.fillStyle = '#cccccc';
          const hw = ctx.measureText('Home: ').width;
          ctx.fillText('Home: ', leftX, textY);
          this.drawLink(ctx, homeLabel, leftX + hw, textY, family.homeId);
          textY += 16;
        }
      }

      // Activity / Task
      if (citizen.activity && citizen.activity !== 'idle') {
        ctx.font = '12px monospace';
        ctx.fillStyle = '#cccccc';
        const movement = world.getComponent<any>(id, 'movement');
        const activity = citizen.activity as string;

        if (activity === 'building' && movement?.targetEntity != null && world.entityExists(movement.targetEntity)) {
          const targetBld = world.getComponent<any>(movement.targetEntity, 'building');
          const bldName = targetBld?.name || 'Building';
          const labelW = ctx.measureText('Task: Construct ').width;
          ctx.fillText('Task: Construct ', leftX, textY);
          this.drawLink(ctx, bldName, leftX + labelW, textY, movement.targetEntity);
        } else if (worker && worker.workplaceId != null && world.entityExists(worker.workplaceId)) {
          const wpBld = world.getComponent<any>(worker.workplaceId, 'building');
          const wpName = wpBld?.name || 'Workplace';
          const actLabel = this.activityLabel(activity);
          const labelW = ctx.measureText(`Task: ${actLabel} at `).width;
          ctx.fillText(`Task: ${actLabel} at `, leftX, textY);
          this.drawLink(ctx, wpName, leftX + labelW, textY, worker.workplaceId);
        } else {
          ctx.fillStyle = '#aaaacc';
          ctx.fillText(`Task: ${this.activityLabel(activity)}`, leftX, textY);
        }
        textY += 16;
      }

      return;
    }

    // Building info
    const building = world.getComponent<any>(id, 'building');
    if (building) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px monospace';
      ctx.fillText(building.name, leftX, textY);
      textY += 20;

      ctx.font = '12px monospace';
      ctx.fillStyle = '#aaaaaa';

      if (!building.completed) {
        this.drawBar(ctx, leftX, textY, w - 20, 'Construction', building.constructionProgress * 100, '#ffaa44');
        textY += 22;
      } else {
        ctx.fillText('Completed', leftX, textY);
        textY += 16;
      }

      ctx.fillText(`Size: ${building.width}x${building.height}`, leftX, textY);
      textY += 16;

      // Durability bar
      if (building.durability !== undefined) {
        const durColor = building.durability > 60 ? '#44aa44' : building.durability > 30 ? '#ddaa22' : '#ff4444';
        this.drawBar(ctx, leftX, textY, w - 20, 'Cond.', building.durability, durColor);
        textY += 18;
      }

      if (building.maxWorkers > 0) {
        const assigned = building.assignedWorkers?.length || 0;
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '12px monospace';
        ctx.fillText(`Workers: ${assigned}/${building.maxWorkers}`, leftX, textY);
        textY += 16;
        // List assigned worker names as clickable links
        if (building.assignedWorkers) {
          for (const wId of building.assignedWorkers) {
            if (!world.entityExists(wId)) continue;
            const wCit = world.getComponent<any>(wId, 'citizen');
            if (!wCit) continue;
            ctx.font = '12px monospace';
            ctx.fillStyle = '#cccccc';
            ctx.fillText('  ', leftX, textY);
            this.drawLink(ctx, wCit.name, leftX + ctx.measureText('  ').width, textY, wId);
            textY += 15;
          }
        }
      }

      // House info
      const house = world.getComponent<any>(id, 'house');
      if (house) {
        ctx.fillStyle = '#aaaaaa';
        ctx.font = '12px monospace';
        ctx.fillText(`Residents: ${house.residents.length}/${house.maxResidents}`, leftX, textY);
        textY += 16;
        // List resident names as clickable links
        for (const rId of house.residents) {
          if (!world.entityExists(rId)) continue;
          const rCit = world.getComponent<any>(rId, 'citizen');
          if (!rCit) continue;
          ctx.font = '12px monospace';
          ctx.fillStyle = '#cccccc';
          ctx.fillText('  ', leftX, textY);
          this.drawLink(ctx, rCit.name, leftX + ctx.measureText('  ').width, textY, rId);
          textY += 15;
        }
        ctx.fillText(`Firewood: ${Math.floor(house.firewood)}`, leftX, textY);
        textY += 16;
        this.drawBar(ctx, leftX, textY, w - 20, 'Warmth', house.warmthLevel, '#ff8844');
        textY += 22;
      }

      // Producer info
      const producer = world.getComponent<any>(id, 'producer');
      if (producer) {
        // Crop field: show growth stage
        if (building.type === 'crop_field' && producer.cropStage !== undefined) {
          const stageNames = ['Fallow', 'Planted', 'Sprouting', 'Growing', 'Flowering', 'Ready to Harvest'];
          const stageColors = ['#8a7d6b', '#6a6030', '#4a7733', '#55aa33', '#66bb44', '#ccaa33'];
          const stage = producer.cropStage as number;
          ctx.fillStyle = stageColors[stage] || '#aaaaaa';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(`Crops: ${stageNames[stage] || 'Unknown'}`, leftX, textY);
          textY += 16;

          // Growth progress bar within current stage
          if (stage > 0 && stage < 5) {
            const progress = ((producer.cropGrowthTimer || 0) / 120) * 100;
            this.drawBar(ctx, leftX, textY, w - 20, 'Growth', Math.min(100, progress), stageColors[stage]);
            textY += 18;
          }
        } else {
          ctx.fillStyle = '#aaaaaa';
          ctx.fillText(`Active: ${producer.active ? 'Yes' : 'No'}`, leftX, textY);
          textY += 16;
        }
      }

      // Livestock info
      if (building.type === 'chicken_coop' || building.type === 'pasture') {
        const lsData = this.game.livestockSystem.getLivestockData(id);
        if (lsData) {
          const animalName = building.type === 'chicken_coop' ? 'Chickens' : 'Cattle';
          const cap = building.type === 'chicken_coop' ? 8 : 4;
          ctx.fillStyle = '#cccccc';
          ctx.font = '12px monospace';
          ctx.fillText(`${animalName}: ${lsData.animalCount}/${cap}`, leftX, textY);
          textY += 16;
          this.drawBar(ctx, leftX, textY, w - 20, 'Health', lsData.health, '#44aa44');
          textY += 18;
        }
      }
    }
  }

  private activityLabel(activity: string): string {
    switch (activity) {
      case 'starving': return 'Seeking food';
      case 'freezing': return 'Seeking warmth';
      case 'eating': return 'Eating';
      case 'chatting': return 'Chatting';
      case 'building': return 'Constructing';
      case 'farming': return 'Farming';
      case 'gathering': return 'Gathering';
      case 'hunting': return 'Hunting';
      case 'fishing': return 'Fishing';
      case 'forestry': return 'Forestry';
      case 'woodcutting': return 'Woodcutting';
      case 'smithing': return 'Smithing';
      case 'tailoring': return 'Tailoring';
      case 'healing': return 'Healing';
      case 'vending': return 'Vending';
      case 'teaching': return 'Teaching';
      case 'trading': return 'Trading';
      case 'school': return 'At school';
      case 'celebrating': return 'Celebrating';
      case 'baking': return 'Baking';
      case 'drinking': return 'At Tavern';
      case 'serving': return 'Serving';
      case 'herding': return 'Herding';
      case 'dairying': return 'Making Cheese';
      default: return activity.charAt(0).toUpperCase() + activity.slice(1);
    }
  }

  private drawBar(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, label: string, value: number, color: string): void {
    const barWidth = width - 60;
    const barHeight = 12;
    const barX = x + 55;

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '10px monospace';
    ctx.fillText(label, x, y + 10);

    // Background
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, y, barWidth, barHeight);

    // Fill
    ctx.fillStyle = color;
    ctx.fillRect(barX, y, barWidth * (value / 100), barHeight);

    // Value text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.floor(value)}`, barX + barWidth + 4, y + 10);
  }
}
