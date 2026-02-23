import type { Game } from '../Game';
import { INFO_PANEL_WIDTH, HUD_HEIGHT, SKILL_XP_PER_LEVEL, SKILL_MAX_LEVEL, TRIMESTER_1_END, TRIMESTER_2_END, PREGNANCY_DURATION_TICKS, DEMOLITION_RECLAIM_RATIO } from '../constants';
import { Settings } from '../Settings';
import { EntityId } from '../types';
import { estimateStorageContentsForBuilding } from '../utils/StorageContents';
import { BUILDING_DEFS } from '../data/BuildingDefs';

const PANEL_HEIGHT = 600;
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
  private autoAssignBtnRect: { x: number; y: number; w: number; h: number } | null = null;
  private upgradeBtnRect: { x: number; y: number; w: number; h: number } | null = null;
  private demolishBtnRect: { x: number; y: number; w: number; h: number } | null = null;

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

    // Check [Auto-Assign] button on building panel
    if (this.autoAssignBtnRect) {
      const r = this.autoAssignBtnRect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.autoAssignRandomWorker(id);
        return true;
      }
    }

    // Check [Upgrade] button on building panel
    if (this.upgradeBtnRect) {
      const r = this.upgradeBtnRect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.game.initiateUpgrade(id);
        return true;
      }
    }

    if (this.demolishBtnRect) {
      const r = this.demolishBtnRect;
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this.game.initiateDemolition(id);
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
    this.autoAssignBtnRect = null;
    this.upgradeBtnRect = null;
    this.demolishBtnRect = null;
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
      if (citizen.age >= 13) {
        const interestLabel = citizen.partnerPreference === 'both'
          ? 'Male or Female'
          : citizen.partnerPreference === 'same'
            ? (citizen.isMale ? 'Male' : 'Female')
            : (citizen.isMale ? 'Female' : 'Male');
        ctx.fillText(`Interested In: ${interestLabel}`, leftX, textY);
        textY += 16;
      }
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
        if (ticks < TRIMESTER_1_END) {
          trimesterLabel = 'T1';
          trimesterColor = '#aaddaa';
        } else if (ticks < TRIMESTER_2_END) {
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

        const progressPct = Math.min(100, (ticks / PREGNANCY_DURATION_TICKS) * 100);
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
        const relationshipLabel = family.relationshipStatus
          ? (family.relationshipStatus.charAt(0).toUpperCase() + family.relationshipStatus.slice(1))
          : 'Single';
        ctx.fillStyle = '#cccccc';
        ctx.fillText(`Relationship: ${relationshipLabel}`, leftX, textY);
        textY += 16;

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
        } else if (activity === 'freezing' && movement?.targetEntity != null && world.entityExists(movement.targetEntity)) {
          const targetBld = world.getComponent<any>(movement.targetEntity, 'building');
          const bldName = targetBld?.name || 'Shelter';
          const labelW = ctx.measureText('Task: Seeking warmth at ').width;
          ctx.fillText('Task: Seeking warmth at ', leftX, textY);
          this.drawLink(ctx, bldName, leftX + labelW, textY, movement.targetEntity);
        } else if (activity !== 'freezing' && worker && worker.workplaceId != null && world.entityExists(worker.workplaceId)) {
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

      const buildingDef = BUILDING_DEFS[building.type];
      if (buildingDef?.description) {
        ctx.fillStyle = '#88aacc';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('Purpose:', leftX, textY);
        textY += 14;

        ctx.fillStyle = '#bbbbbb';
        ctx.font = '11px monospace';
        textY = this.drawWrappedText(ctx, buildingDef.description, leftX, textY, w - 20, 13);
        textY += 6;
      }

      ctx.font = '12px monospace';
      ctx.fillStyle = '#aaaaaa';

      if (building.isDemolishing) {
        const pct = ((building.demolitionProgress ?? 0) * 100);
        this.drawBar(ctx, leftX, textY, w - 20, 'Demolition', pct, '#cc6655');
        textY += 22;
      } else if (!building.completed) {
        this.drawBar(ctx, leftX, textY, w - 20, 'Construction', building.constructionProgress * 100, '#ffaa44');
        textY += 22;
      } else {
        ctx.fillText('Completed', leftX, textY);
        textY += 16;
      }

      // Upgrade section
      if (building.completed && !building.isUpgrading && buildingDef?.upgradesTo) {
        const upgDef = BUILDING_DEFS[buildingDef.upgradesTo];
        textY += 4;
        ctx.fillStyle = '#ddbb44';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`Tier 2: ${upgDef?.name || buildingDef.upgradesTo}`, leftX, textY);
        textY += 14;

        const costParts: string[] = [];
        if (buildingDef.upgradeCostLog) costParts.push(`${buildingDef.upgradeCostLog} log`);
        if (buildingDef.upgradeCostStone) costParts.push(`${buildingDef.upgradeCostStone} stone`);
        if (buildingDef.upgradeCostIron) costParts.push(`${buildingDef.upgradeCostIron} iron`);
        ctx.fillStyle = '#999999';
        ctx.font = '10px monospace';
        ctx.fillText(`Cost: ${costParts.join(', ')}`, leftX, textY);
        textY += 14;

        const canAfford =
          this.game.getResource('log') >= (buildingDef.upgradeCostLog || 0) &&
          this.game.getResource('stone') >= (buildingDef.upgradeCostStone || 0) &&
          this.game.getResource('iron') >= (buildingDef.upgradeCostIron || 0);

        const btnLabel = `Upgrade to ${upgDef?.name || buildingDef.upgradesTo}`;
        ctx.font = 'bold 11px monospace';
        const upgBtnW = Math.min(w - 20, ctx.measureText(btnLabel).width + 16);
        const btnX = leftX;
        const btnY = textY;
        this.upgradeBtnRect = { x: btnX, y: btnY, w: upgBtnW, h: BTN_HEIGHT };

        ctx.lineWidth = 1;
        if (canAfford) {
          ctx.strokeStyle = '#ddbb44';
          ctx.fillStyle = 'rgba(80, 60, 10, 0.7)';
        } else {
          ctx.strokeStyle = '#666633';
          ctx.fillStyle = 'rgba(40, 40, 20, 0.5)';
        }
        ctx.strokeRect(btnX, btnY, upgBtnW, BTN_HEIGHT);
        ctx.fillRect(btnX, btnY, upgBtnW, BTN_HEIGHT);
        ctx.fillStyle = canAfford ? '#ffdd44' : '#666644';
        ctx.fillText(btnLabel, btnX + 6, btnY + 15);
        textY += BTN_HEIGHT + 6;
      } else if (building.isUpgrading) {
        textY += 4;
        ctx.fillStyle = '#ffbb44';
        ctx.font = 'bold 12px monospace';
        ctx.fillText('UPGRADING...', leftX, textY);
        textY += 16;
        const pct = (building.upgradeProgress ?? 0) * 100;
        this.drawBar(ctx, leftX, textY, w - 20, 'Progress', pct, '#ddbb44');
        textY += 22;
      }

      if (building.completed && !building.isUpgrading && !building.isDemolishing) {
        const btnX = leftX;
        const btnY = textY;
        this.demolishBtnRect = { x: btnX, y: btnY, w: BTN_WIDTH, h: BTN_HEIGHT };

        ctx.strokeStyle = '#cc6666';
        ctx.lineWidth = 1;
        ctx.strokeRect(btnX, btnY, BTN_WIDTH, BTN_HEIGHT);
        ctx.fillStyle = 'rgba(80, 35, 35, 0.65)';
        ctx.fillRect(btnX, btnY, BTN_WIDTH, BTN_HEIGHT);
        ctx.fillStyle = '#ff9999';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('Demolish', btnX + 6, btnY + 15);
        textY += BTN_HEIGHT + 4;

        ctx.fillStyle = '#aa8888';
        ctx.font = '10px monospace';
        ctx.fillText(`Reclaim ~${Math.floor(DEMOLITION_RECLAIM_RATIO * 100)}% materials`, leftX, textY + 9);
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

      // Storage capacity (for storage buildings)
      if (building.isStorage && building.storageCapacity) {
        const estimate = estimateStorageContentsForBuilding(this.game.world, this.game.resources.globalResources, id, 5, 12);
        const bldgUsed = estimate?.estimatedUsed ?? 0;
        const bldgCap = estimate?.capacity ?? building.storageCapacity;

        ctx.fillStyle = '#aaaaaa';
        ctx.font = '12px monospace';
        ctx.fillText(`Capacity: ${Math.floor(bldgUsed)} / ${bldgCap}`, leftX, textY);
        textY += 16;
        const fillPct = bldgCap > 0 ? Math.min(100, (bldgUsed / bldgCap) * 100) : 100;
        const fillColor = fillPct >= 100 ? '#ff4444' : fillPct > 80 ? '#ddaa22' : '#44aa44';
        this.drawBar(ctx, leftX, textY, w - 20, 'Fill', fillPct, fillColor);
        textY += 18;

        ctx.fillStyle = '#cccccc';
        ctx.font = 'bold 11px monospace';
        ctx.fillText('Contents:', leftX, textY);
        textY += 14;

        if (estimate && estimate.topContents.length > 0) {
          ctx.font = '11px monospace';
          for (const item of estimate.topContents) {
            ctx.fillStyle = item.color;
            ctx.fillText('\u25A0', leftX, textY);
            ctx.fillStyle = '#aaaaaa';
            ctx.fillText(`${item.name}: ${Math.floor(item.amount)}`, leftX + 12, textY);
            textY += 14;
          }
        } else {
          ctx.fillStyle = '#777777';
          ctx.font = '11px monospace';
          ctx.fillText('Empty', leftX, textY);
          textY += 14;
        }
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

        // [Auto-Assign] button (shown when completed building has capacity)
        if (building.completed && assigned < building.maxWorkers && !this.game.isMineOrQuarryDepleted(id)) {
          textY += 4;
          const btnX = leftX;
          const btnY = textY;
          this.autoAssignBtnRect = { x: btnX, y: btnY, w: BTN_WIDTH, h: BTN_HEIGHT };

          ctx.strokeStyle = '#44aacc';
          ctx.lineWidth = 1;
          ctx.strokeRect(btnX, btnY, BTN_WIDTH, BTN_HEIGHT);
          ctx.fillStyle = 'rgba(30, 60, 80, 0.6)';
          ctx.fillRect(btnX, btnY, BTN_WIDTH, BTN_HEIGHT);
          ctx.fillStyle = '#88ddff';
          ctx.font = 'bold 11px monospace';
          ctx.fillText('Auto-Assign', btnX + 6, btnY + 15);
          textY += BTN_HEIGHT + 4;
        }
      }

      // [Auto-Assign] button for buildings under construction (cap at maxWorkers, min 1)
      if (!building.completed) {
        const constructionCap = Math.max(building.maxWorkers, 1);
        const constructionAssigned = building.assignedWorkers?.length || 0;
        if (constructionAssigned < constructionCap) {
          textY += 4;
          const btnX = leftX;
          const btnY = textY;
          this.autoAssignBtnRect = { x: btnX, y: btnY, w: BTN_WIDTH, h: BTN_HEIGHT };

          ctx.strokeStyle = '#44aacc';
          ctx.lineWidth = 1;
          ctx.strokeRect(btnX, btnY, BTN_WIDTH, BTN_HEIGHT);
          ctx.fillStyle = 'rgba(30, 60, 80, 0.6)';
          ctx.fillRect(btnX, btnY, BTN_WIDTH, BTN_HEIGHT);
          ctx.fillStyle = '#88ddff';
          ctx.font = 'bold 11px monospace';
          ctx.fillText('Auto-Assign', btnX + 6, btnY + 15);
          textY += BTN_HEIGHT + 4;
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

      // Mine / Quarry vein status
      if (building.type === 'quarry' || building.type === 'mine') {
        const mineProducer = world.getComponent<any>(id, 'producer');
        if (mineProducer && building.completed) {
          const isQuarry = building.type === 'quarry';
          const remaining = isQuarry
            ? (mineProducer.undergroundStone ?? 0)
            : (mineProducer.undergroundIron ?? 0);
          const max = mineProducer.maxUnderground ?? 1;
          const ratio = max > 0 ? Math.max(0, remaining / max) : 0;
          const pct = Math.floor(ratio * 100);

          ctx.fillStyle = '#cccccc';
          ctx.font = 'bold 11px monospace';
          ctx.fillText('Vein Status:', leftX, textY);
          textY += 14;

          // Status text
          let statusText: string;
          let statusColor: string;
          if (remaining <= 5) {
            statusText = 'Vein exhausted — workers idling';
            statusColor = '#cc4444';
          } else if (ratio <= 0.3) {
            statusText = `Underground — diminished output (${pct}%)`;
            statusColor = '#ddaa22';
          } else {
            statusText = `Underground reserve: ${Math.floor(remaining)} (${pct}%)`;
            statusColor = '#44cc88';
          }
          ctx.fillStyle = statusColor;
          ctx.font = '10px monospace';
          ctx.fillText(statusText, leftX, textY);
          textY += 13;

          // Vein bar
          const barW = w - 20;
          const barH = 6;
          ctx.fillStyle = '#333';
          ctx.fillRect(leftX, textY, barW, barH);
          if (ratio > 0) {
            const barColor = ratio > 0.5 ? '#44cc44' : ratio > 0.2 ? '#ddaa22' : '#cc4444';
            ctx.fillStyle = barColor;
            ctx.fillRect(leftX, textY, Math.floor(barW * ratio), barH);
          }
          textY += barH + 8;

          // Check whether any workers are currently in surface mode
          const workerStore = world.getComponentStore<any>('worker');
          let hasSurfaceWorkers = false;
          if (workerStore && building.assignedWorkers) {
            for (const wId of building.assignedWorkers) {
              const w2 = workerStore.get(wId);
              if (w2?.gatherTargetTile !== null && w2?.gatherTargetTile !== undefined) {
                hasSurfaceWorkers = true;
                break;
              }
            }
          }
          if (hasSurfaceWorkers) {
            ctx.fillStyle = '#88ccff';
            ctx.font = '10px monospace';
            ctx.fillText('Surface deposits nearby', leftX, textY);
            textY += 13;
          }
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

      // Citizens currently inside this building
      const allCitizens = world.getComponentStore<any>('citizen');
      if (allCitizens) {
        const insideIds: EntityId[] = [];
        for (const [cId, cit] of allCitizens) {
          if (cit.insideBuildingId === id) insideIds.push(cId);
        }
        if (insideIds.length > 0) {
          textY += 4;
          ctx.fillStyle = '#cccccc';
          ctx.font = 'bold 12px monospace';
          ctx.fillText(`Inside (${insideIds.length}):`, leftX, textY);
          textY += 16;
          for (const cId of insideIds) {
            const cit = allCitizens.get(cId);
            if (!cit) continue;
            ctx.font = '12px monospace';
            const sleeping = cit.isSleeping;
            const prefix = sleeping ? '  zzz ' : '  ';
            ctx.fillStyle = sleeping ? '#8888cc' : '#cccccc';
            ctx.fillText(prefix, leftX, textY);
            const prefixW = ctx.measureText(prefix).width;
            this.drawLink(ctx, cit.name, leftX + prefixW, textY, cId);
            const nameW = ctx.measureText(cit.name).width;
            const activity = cit.activity || 'idle';
            ctx.fillStyle = '#888888';
            ctx.font = '11px monospace';
            ctx.fillText(` ${this.activityLabel(activity)}`, leftX + prefixW + nameW, textY);
            textY += 15;
          }
        }
      }
    }
  }

  /** Find a worker and assign them to the building. Prefers unassigned workers,
   *  then auto-assigned workers. Will unassign someone if necessary. */
  private autoAssignRandomWorker(buildingId: EntityId): void {
    const world = this.game.world;
    const bld = world.getComponent<any>(buildingId, 'building');
    if (!bld) return;
    if (bld.completed && this.game.isMineOrQuarryDepleted(buildingId)) return;

    // Check worker capacity (for construction sites, cap at maxWorkers with min 1)
    const cap = bld.completed ? bld.maxWorkers : Math.max(bld.maxWorkers, 1);
    const assigned = bld.assignedWorkers?.length || 0;
    if (assigned >= cap) return;

    const workers = world.getComponentStore<any>('worker');
    const citizens = world.getComponentStore<any>('citizen');
    if (!workers || !citizens) return;

    // Already assigned to this building
    const alreadyAssigned = new Set<EntityId>(bld.assignedWorkers || []);

    const unassigned: EntityId[] = [];
    const autoAssigned: EntityId[] = [];
    const manuallyAssigned: EntityId[] = [];

    for (const [entityId, worker] of workers) {
      const citizen = citizens.get(entityId);
      if (!citizen || citizen.isChild) continue;
      if (alreadyAssigned.has(entityId)) continue;

      if (worker.workplaceId === null) {
        unassigned.push(entityId);
      } else if (!worker.manuallyAssigned) {
        autoAssigned.push(entityId);
      } else {
        manuallyAssigned.push(entityId);
      }
    }

    // Pick from best available pool: free workers > auto-assigned > manually assigned
    const pool = unassigned.length > 0 ? unassigned
      : autoAssigned.length > 0 ? autoAssigned
      : manuallyAssigned.length > 0 ? manuallyAssigned
      : null;

    if (!pool) return;

    const idx = Math.floor(Math.random() * pool.length);
    this.game.assignWorkerToBuilding(pool[idx], buildingId);
  }

  private activityLabel(activity: string): string {
    switch (activity) {
      case 'starving': return 'Seeking food';
      case 'freezing': return 'Seeking warmth';
      case 'eating': return 'Eating';
      case 'chatting': return 'Chatting';
      case 'building': return 'Constructing';
      case 'upgrading': return 'Upgrading';
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

  private drawWrappedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ): number {
    const words = text.split(/\s+/).filter(Boolean);
    let line = '';

    for (const word of words) {
      const candidate = line.length > 0 ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        continue;
      }

      if (line.length > 0) {
        ctx.fillText(line, x, y);
        y += lineHeight;
      }
      line = word;
    }

    if (line.length > 0) {
      ctx.fillText(line, x, y);
      y += lineHeight;
    }

    return y;
  }
}
