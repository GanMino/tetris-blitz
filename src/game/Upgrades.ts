/** Roguelite run modifiers — every upgrade mutates this state for the run. */
export interface RunModifiers {
  timePerStageBonus: number; // extra seconds granted on boss kill
  powerChanceBonus: number; // +chance of power-up blocks
  bankSizeBonus: number; // +bank slots
  scoreMultiplier: number; // score multiplier
  cascadeSecondsBonus: number; // extra time per cascaded row
  goldMultiplier: number; // gold row reward multiplier
  startSlowGifts: number; // SLOW power-ups granted at each stage start
  garbageReduction: number; // -garbage rows per boss attack (min 1)
  bombDamageBonus: number; // +BOMB direct damage
}

export function defaultModifiers(): RunModifiers {
  return {
    timePerStageBonus: 0,
    powerChanceBonus: 0,
    bankSizeBonus: 0,
    scoreMultiplier: 1,
    cascadeSecondsBonus: 0,
    goldMultiplier: 1,
    startSlowGifts: 0,
    garbageReduction: 0,
    bombDamageBonus: 0,
  };
}

export interface UpgradeDef {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  apply(modifiers: RunModifiers): void;
}

/** The upgrade pool. Each upgrade is offered at most once per run. */
export const UPGRADES: UpgradeDef[] = [
  {
    id: 'time-capacity',
    emoji: '⏱',
    name: '时间扩容',
    desc: '击败 Boss 额外 +20 秒',
    apply: (m) => {
      m.timePerStageBonus += 20;
    },
  },
  {
    id: 'magnet',
    emoji: '💎',
    name: '道具磁铁',
    desc: '道具出现率 +15%',
    apply: (m) => {
      m.powerChanceBonus += 0.15;
    },
  },
  {
    id: 'bank-expand',
    emoji: '🏦',
    name: '银行扩容',
    desc: '道具银行 +1 格（最多 4 格）',
    apply: (m) => {
      m.bankSizeBonus = 1;
    },
  },
  {
    id: 'frenzy',
    emoji: '⭐',
    name: '得分狂热',
    desc: '所有得分 +50%',
    apply: (m) => {
      m.scoreMultiplier += 0.5;
    },
  },
  {
    id: 'cascade-master',
    emoji: '🔗',
    name: '连锁大师',
    desc: '连锁消行每行 +2 秒',
    apply: (m) => {
      m.cascadeSecondsBonus += 2;
    },
  },
  {
    id: 'prospector',
    emoji: '🥇',
    name: '淘金者',
    desc: '黄金目标行奖励 ×2',
    apply: (m) => {
      m.goldMultiplier *= 2;
    },
  },
  {
    id: 'starter-slow',
    emoji: '🐢',
    name: '稳健开局',
    desc: '每个阶段开始送 1 个减速',
    apply: (m) => {
      m.startSlowGifts += 1;
    },
  },
  {
    id: 'armor',
    emoji: '🛡',
    name: '装甲',
    desc: 'Boss 垃圾行 -1（最低 1 行）',
    apply: (m) => {
      m.garbageReduction += 1;
    },
  },
  {
    id: 'bomber',
    emoji: '🧨',
    name: '爆破专家',
    desc: 'BOMB 直接伤害 +20',
    apply: (m) => {
      m.bombDamageBonus += 20;
    },
  },
];

/** Roll `count` random upgrade offers not yet taken this run. */
export function rollUpgradeOffers(rng: () => number, taken: Set<string>, count = 3): UpgradeDef[] {
  const pool = UPGRADES.filter((u) => !taken.has(u.id));
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}
