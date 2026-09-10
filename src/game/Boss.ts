import { TUNING } from './constants';

export type BossAttack = 'garbage' | 'shuffle' | 'fury';

export interface BossTickEvent {
  type: 'warn' | 'attack' | 'phase2';
  attack?: BossAttack;
}

/**
 * Boss state machine: HP, two phases (below 50% HP attacks come 33% faster
 * with one extra garbage row), and a telegraph-then-execute attack cycle.
 */
export class BossState {
  hp: number;
  readonly maxHp: number;
  phase: 1 | 2 = 1;
  attackTimer: number;
  telegraph: BossAttack | null = null;
  telegraphTimer = 0;

  constructor(public readonly stage: number) {
    this.maxHp = TUNING.boss.hp[Math.min(stage, TUNING.boss.hp.length) - 1];
    this.hp = this.maxHp;
    this.attackTimer = 2.5; // grace period after spawn
  }

  get stageColor(): string {
    return ['#4fd64a', '#ff8a2b', '#c44df2'][this.stage - 1] ?? '#ff4a5a';
  }

  get name(): string {
    return ['毒藤核心', '熔岩巨核', '虚空主宰'][this.stage - 1] ?? 'BOSS';
  }

  interval(): number {
    const base = TUNING.boss.attackIntervals[this.stage - 1] ?? 8;
    return this.phase === 2 ? base * 0.75 : base;
  }

  garbageRows(): number {
    const base = TUNING.boss.garbageRows[this.stage - 1] ?? 1;
    return Math.max(1, base + (this.phase === 2 ? 1 : 0));
  }

  damage(amount: number): void {
    if (amount <= 0) return;
    this.hp = Math.max(0, this.hp - amount);
  }

  /** Advance the attack cycle. Returns events for the game to react to. */
  tick(delta: number, rng: () => number): BossTickEvent[] {
    const events: BossTickEvent[] = [];
    if (this.telegraph) {
      this.telegraphTimer -= delta;
      if (this.telegraphTimer <= 0) {
        events.push({ type: 'attack', attack: this.telegraph });
        this.telegraph = null;
        this.attackTimer = this.interval();
      }
      return events;
    }
    this.attackTimer -= delta;
    if (this.attackTimer <= 0) {
      const roll = rng();
      const attack: BossAttack = roll < 0.5 ? 'garbage' : roll < 0.8 ? 'shuffle' : 'fury';
      this.telegraph = attack;
      this.telegraphTimer = 1.5;
      events.push({ type: 'warn', attack });
    }
    // Phase 2 check after each damage application (hp watched by Game).
    if (this.phase === 1 && this.hp < this.maxHp * TUNING.boss.phase2HpFactor) {
      this.phase = 2;
      events.push({ type: 'phase2' });
    }
    return events;
  }
}
