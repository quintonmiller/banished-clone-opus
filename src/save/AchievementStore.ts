import type { IndexedDBStore } from './IndexedDBStore';

const LS_KEY = 'exiled_achievements';
const IDB_KEY = 'achievements';

export interface AchievementRecord {
  id: string;
  firstUnlockedAt: number;
  timesEarned: number;
  lastEarnedAt: number;
}

export interface AchievementStoreData {
  version: 1;
  achievements: Record<string, AchievementRecord>;
  stats: {
    totalGamesPlayed: number;
    totalYearsSurvived: number;
    totalCitizensBorn: number;
    totalCitizensDied: number;
    totalBuildingsBuilt: number;
    totalTradesCompleted: number;
    fairRewardsSeen: string[];
    narrativeEventCount: number;
  };
}

function defaultData(): AchievementStoreData {
  return {
    version: 1,
    achievements: {},
    stats: {
      totalGamesPlayed: 0,
      totalYearsSurvived: 0,
      totalCitizensBorn: 0,
      totalCitizensDied: 0,
      totalBuildingsBuilt: 0,
      totalTradesCompleted: 0,
      fairRewardsSeen: [],
      narrativeEventCount: 0,
    },
  };
}

class AchievementStoreImpl {
  private data: AchievementStoreData;
  private idb: IndexedDBStore | null = null;

  constructor() {
    this.data = defaultData();
    this.loadSync();
  }

  async initFromIDB(idb: IndexedDBStore): Promise<void> {
    this.idb = idb;
    try {
      const stored = await idb.getItem(IDB_KEY);
      if (stored && typeof stored === 'object' && stored.version === 1) {
        this.mergeInto(stored);
        this.saveSync();
      } else {
        await idb.putItem(IDB_KEY, { ...this.data });
      }
    } catch { /* ignore — localStorage fallback still works */ }
  }

  hasAchievement(id: string): boolean {
    return id in this.data.achievements;
  }

  /** Returns true if this is the first-ever unlock. */
  unlock(id: string): boolean {
    const now = Date.now();
    const existing = this.data.achievements[id];
    if (existing) {
      existing.timesEarned++;
      existing.lastEarnedAt = now;
      this.persist();
      return false;
    }
    this.data.achievements[id] = {
      id,
      firstUnlockedAt: now,
      timesEarned: 1,
      lastEarnedAt: now,
    };
    this.persist();
    return true;
  }

  getUnlockedCount(): number {
    return Object.keys(this.data.achievements).length;
  }

  getAllUnlocked(): AchievementRecord[] {
    return Object.values(this.data.achievements);
  }

  getRecord(id: string): AchievementRecord | undefined {
    return this.data.achievements[id];
  }

  incrementStat(key: keyof AchievementStoreData['stats'], amount: number): void {
    const stats = this.data.stats;
    if (key === 'fairRewardsSeen') return; // use addFairReward instead
    (stats[key] as number) += amount;
  }

  addFairReward(rewardId: string): void {
    if (!this.data.stats.fairRewardsSeen.includes(rewardId)) {
      this.data.stats.fairRewardsSeen.push(rewardId);
    }
  }

  getStats(): Readonly<AchievementStoreData['stats']> {
    return this.data.stats;
  }

  flushStats(): void {
    this.persist();
  }

  private persist(): void {
    this.saveSync();
    this.idb?.putItem(IDB_KEY, { ...this.data });
  }

  private loadSync(): void {
    try {
      const json = localStorage.getItem(LS_KEY);
      if (json) {
        const parsed = JSON.parse(json);
        if (parsed && parsed.version === 1) {
          this.mergeInto(parsed);
        }
      }
    } catch { /* ignore corrupt data */ }
  }

  private saveSync(): void {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(this.data));
    } catch { /* ignore quota errors */ }
  }

  private mergeInto(parsed: any): void {
    if (parsed.achievements && typeof parsed.achievements === 'object') {
      // Merge achievements — keep the most complete record
      for (const [id, rec] of Object.entries(parsed.achievements)) {
        const r = rec as AchievementRecord;
        const existing = this.data.achievements[id];
        if (!existing || r.timesEarned > existing.timesEarned) {
          this.data.achievements[id] = r;
        }
      }
    }
    if (parsed.stats && typeof parsed.stats === 'object') {
      const s = parsed.stats;
      const d = this.data.stats;
      // Take the larger value for each numeric stat
      if (typeof s.totalGamesPlayed === 'number') d.totalGamesPlayed = Math.max(d.totalGamesPlayed, s.totalGamesPlayed);
      if (typeof s.totalYearsSurvived === 'number') d.totalYearsSurvived = Math.max(d.totalYearsSurvived, s.totalYearsSurvived);
      if (typeof s.totalCitizensBorn === 'number') d.totalCitizensBorn = Math.max(d.totalCitizensBorn, s.totalCitizensBorn);
      if (typeof s.totalCitizensDied === 'number') d.totalCitizensDied = Math.max(d.totalCitizensDied, s.totalCitizensDied);
      if (typeof s.totalBuildingsBuilt === 'number') d.totalBuildingsBuilt = Math.max(d.totalBuildingsBuilt, s.totalBuildingsBuilt);
      if (typeof s.totalTradesCompleted === 'number') d.totalTradesCompleted = Math.max(d.totalTradesCompleted, s.totalTradesCompleted);
      if (typeof s.narrativeEventCount === 'number') d.narrativeEventCount = Math.max(d.narrativeEventCount, s.narrativeEventCount);
      if (Array.isArray(s.fairRewardsSeen)) {
        for (const r of s.fairRewardsSeen) {
          if (!d.fairRewardsSeen.includes(r)) d.fairRewardsSeen.push(r);
        }
      }
    }
  }
}

/** Global singleton — import and use anywhere */
export const AchievementStore = new AchievementStoreImpl();
