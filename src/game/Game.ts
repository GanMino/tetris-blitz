import * as THREE from 'three';
import { InputController } from '../core/InputController';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { AudioSystem } from '../systems/AudioSystem';
import { DebugTools } from '../systems/DebugTools';
import { Hud, type GamePhase, type HudMetrics } from '../systems/Hud';
import { createSeededRandom } from '../utils/random';
import { Board, type PowerUpPick } from './Board';
import {
  BOARD_HEIGHT,
  BOARD_TOP_Y,
  BOARD_WIDTH,
  POWERUPS,
  TETROMINO_COLORS,
  TUNING,
  type PowerUpKind,
} from './constants';
import { BagRandomizer, pieceCells, ROTATIONS, type ActivePiece, type TetrominoType } from './Pieces';
import { rollPowerUp } from './PowerUps';
import { BoardView } from './BoardView';
import { BossState, type BossAttack } from './Boss';
import { BossView } from './BossView';
import { defaultModifiers, rollUpgradeOffers, type RunModifiers, type UpgradeDef } from './Upgrades';

const BEST_KEY = 'tetris-blitz-best';

const CLEAR_BANNERS = ['', '', 'DOUBLE!', 'TRIPLE!', 'TETRIS!'];

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  private readonly input: InputController;
  private readonly audio = new AudioSystem();
  private readonly hud: Hud;
  private readonly board = new Board();
  private readonly boardView: BoardView;
  private readonly debug: DebugTools;
  private readonly loop = new Loop(
    (delta) => this.update(delta),
    () => this.render(),
  );

  private phase: GamePhase = 'menu';
  private rng = createSeededRandom(1);
  private bag = new BagRandomizer(this.rng);
  private active: ActivePiece | null = null;
  private activePower: PowerUpPick | null = null;
  private nextPiece: { type: TetrominoType; rotation: number } | null = null;

  private frame = 0;
  private elapsed = 0;
  private timeLeft: number = TUNING.time.startSeconds;
  private gravityTimer = 0;
  private score = 0;
  private lines = 0;
  private combo = 0;
  private level = 1;
  private slowUntil = -1;
  private doubleUntil = -1;
  private best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
  private newBest = false;
  private lastTickSecond = -1;
  private bank: PowerUpKind[] = [];
  private goldRow = -1;
  private goldTimer: number = TUNING.gold.firstAtSeconds;

  // Boss battle + roguelite upgrades.
  private stage = 1;
  private boss: BossState | null = null;
  private readonly bossView: BossView;
  private modifiers: RunModifiers = defaultModifiers();
  private readonly takenUpgrades = new Set<string>();
  private upgradeOffers: UpgradeDef[] | null = null;
  private furyUntil = -1;

  private pausedForScreenshot = false;
  private reducedMotion = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.toneMappingExposure = TUNING.render.exposure;

    this.input = new InputController({
      left: 'btn-left',
      right: 'btn-right',
      down: 'btn-down',
      rotateCw: 'btn-rotate-cw',
      rotateCcw: 'btn-rotate-ccw',
      drop: 'btn-drop',
      pause: 'pause-button',
      mute: 'mute-button',
    });

    this.hud = new Hud({
      onStart: () => this.startGame(),
      onRestart: () => this.startGame(),
      onResume: () => this.resume(),
      onMenu: () => this.toMenu(),
      onPauseToggle: () => this.togglePause(),
      onMute: () => this.toggleMute(),
      onTriggerBank: (index) => this.triggerBank(index),
      onChooseUpgrade: (index) => this.chooseUpgrade(index),
    });

    this.boardView = new BoardView(this.scene);
    this.bossView = new BossView(this.scene);

    this.debug = new DebugTools(() => {
      this.renderer.toneMappingExposure = TUNING.render.exposure;
    });

    window.addEventListener('resize', this.onResize);
    this.hud.setMuted(this.audio.isMuted);
    this.hud.setPhase('menu');
    this.hud.update(this.metrics());
    this.boardView.syncBoard(this.board);
    this.boardView.syncActive([], 'I', null, 0);
    this.boardView.syncGhost(null);
    this.onResize();
    this.installTestHooks();
    this.publishDiagnostics();
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.debug.dispose();
    this.boardView.dispose();
    this.bossView.dispose();
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  // ---------------------------------------------------------------- update

  private update(delta: number): void {
    this.frame += 1;
    if (this.pausedForScreenshot) {
      this.publishDiagnostics();
      return;
    }

    this.boardView.update(delta, this.reducedMotion);
    this.bossView.update(delta, this.reducedMotion);

    if (resizeRenderer(this.renderer, this.camera, TUNING.render.maxDpr)) {
      this.boardView.fitCamera(this.camera, this.camera.aspect);
    }

    if (this.phase !== 'playing') {
      // Still poll input so pause/menu/gameover shortcuts work in every phase.
      this.processIntents(delta);
      this.publishDiagnostics();
      return;
    }

    // Upgrade choice pauses the simulation but keeps input + visuals alive.
    if (this.upgradeOffers) {
      this.processIntents(delta);
      this.publishDiagnostics();
      return;
    }

    this.elapsed += delta;
    this.timeLeft -= delta;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.endGame('time');
      this.publishDiagnostics();
      return;
    }
    this.board.tickFlash(delta);
    this.updateLevel();
    this.updateCountdownTick();
    this.updateGoldRow(delta);
    this.updateBoss(delta);
    this.stepGravity(delta);
    this.processIntents(delta);
    if (this.phase !== 'playing') {
      this.publishDiagnostics();
      return;
    }
    this.syncScene();
    this.updateDangerSignals();
    this.hud.update(this.metrics());
    this.publishDiagnostics();
  }

  private render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private onResize = (): void => {
    this.boardView.fitCamera(this.camera, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
  };

  // ------------------------------------------------------------- gameplay

  private stepGravity(delta: number): void {
    if (!this.active) return;
    this.gravityTimer += delta;
    const slowActive = this.elapsed < this.slowUntil;
    const furyActive = this.elapsed < this.furyUntil;
    const factor =
      (slowActive ? 1 / TUNING.gravity.slowMultiplier : 1) *
      (furyActive ? TUNING.boss.furyGravityMult : 1);
    const interval = this.gravityInterval() * factor;
    while (this.gravityTimer >= interval) {
      this.gravityTimer -= interval;
      if (!this.tryMove(0, 1)) {
        this.lockActive();
        return;
      }
    }
  }

  private gravityInterval(): number {
    const table = TUNING.gravity.levels;
    let interval: number = table[0].interval;
    for (const entry of table) {
      if (this.elapsed >= entry.atSeconds) interval = entry.interval;
    }
    return interval;
  }

  private processIntents(delta: number): void {
    for (const intent of this.input.poll(delta)) {
      const playing = this.phase === 'playing';
      switch (intent) {
        case 'move-left':
          if (playing) this.movePiece(-1);
          break;
        case 'move-right':
          if (playing) this.movePiece(1);
          break;
        case 'rotate-cw':
          if (playing) this.rotatePiece(1);
          break;
        case 'rotate-ccw':
          if (playing) this.rotatePiece(-1);
          break;
        case 'soft-drop':
          if (playing && this.tryMove(0, 1)) {
            this.score += 1;
            this.audio.softDrop();
          }
          break;
        case 'hard-drop':
          if (playing) this.hardDrop();
          break;
        case 'trigger-0':
          if (playing) this.triggerSlot(0);
          break;
        case 'trigger-1':
          if (playing) this.triggerSlot(1);
          break;
        case 'trigger-2':
          if (playing) this.triggerSlot(2);
          break;
        case 'pause':
          this.togglePause();
          break;
        case 'mute':
          this.toggleMute();
          break;
        case 'start':
          if ((this.phase as GamePhase) === 'menu') this.startGame();
          break;
        case 'restart':
          if ((this.phase as GamePhase) === 'gameover') this.startGame();
          break;
        default:
          break;
      }
    }
  }

  private movePiece(dx: number): void {
    if (this.tryMove(dx, 0)) this.audio.move();
  }

  private tryMove(dx: number, dy: number): boolean {
    if (!this.active) return false;
    const candidate: ActivePiece = { ...this.active, x: this.active.x + dx, y: this.active.y + dy };
    if (this.board.canPlace(candidate)) {
      this.active = candidate;
      return true;
    }
    return false;
  }

  private rotatePiece(direction: 1 | -1): void {
    if (!this.active) return;
    const count = ROTATIONS[this.active.type].length;
    const targetRotation = (this.active.rotationIndex + direction + count) % count;
    for (const kick of [0, -1, 1, -2, 2]) {
      const candidate: ActivePiece = {
        ...this.active,
        rotationIndex: targetRotation,
        x: this.active.x + kick,
      };
      if (this.board.canPlace(candidate)) {
        this.active = candidate;
        this.audio.rotate();
        return;
      }
    }
  }

  private hardDrop(): void {
    if (!this.active) return;
    const dropRow = this.board.dropRow(this.active);
    const distance = dropRow - this.active.y;
    this.active.y = dropRow;
    if (distance > 0) {
      this.score += distance * 2;
      this.audio.hardDrop();
      this.boardView.addShake(0.16);
      const cells = pieceCells(this.active);
      for (const [col, row] of cells) {
        this.boardView.burst(col, row, TETROMINO_COLORS[this.active.type], 4, 1.2);
      }
    }
    this.lockActive();
  }

  private lockActive(): void {
    if (!this.active) return;
    const piece = this.active;
    const cells = pieceCells(piece);
    const badge = this.activePower;
    const badgeWorldCell = badge ? cells[badge.cellIndex] : null;

    // Snapshot colors of rows about to clear (for burst coloring).
    const fullRows = this.board.fullRows();
    const rowColors = new Map<number, string[]>();
    for (const row of fullRows) {
      rowColors.set(row, this.board.cellTypes(row));
    }

    const result = this.board.lock(piece, badge);
    this.audio.lock();

    // Power-up collection → bank (full bank auto-fires the new pickup).
    if (badge && badgeWorldCell) {
      const kind = badge.kind;
      this.boardView.spawnBadgeGem(badgeWorldCell[0], badgeWorldCell[1], kind);
      this.boardView.burst(badgeWorldCell[0], badgeWorldCell[1], POWERUPS[kind].color, 16, 2.2, 'spark');
      this.grantPowerUp(kind);
    }

    // Scored line clears.
    if (result.clearedLines) {
      const n = result.clearedRows.length;
      this.combo += 1;
      this.lines += n;
      this.timeLeft += TUNING.time.secondsPerLine * n;
      const gained = this.lineScore(n);
      this.score += gained;
      this.dealBossDamage(this.bossDamage(n));
      this.boardView.flashRows(result.clearedRows);
      for (const row of result.clearedRows) {
        const colors = rowColors.get(row) ?? [];
        for (let col = 0; col < BOARD_WIDTH; col += 1) {
          this.boardView.burst(col, row, colors[col] ?? '#ffffff', 4, 2.4, 'spark');
        }
      }
      this.boardView.addShake(0.14 + n * 0.06);
      this.audio.lineClear(this.combo);
      if (n >= 2) this.hud.banner(`${CLEAR_BANNERS[n]}  +${gained}`, 'score');
      this.checkGoldRow(result.clearedRows);
    } else {
      this.combo = 0;
    }

    // Cascade chains.
    this.scoreCascades(result.cascadedRows, result.cascadedColors);

    this.spawnPiece();
  }

  /** Score + FX for gravity-cascade waves (from line clears or the bomb). */
  private scoreCascades(cascades: number[][], colors: string[][]): void {
    for (let wave = 0; wave < cascades.length; wave += 1) {
      const rows = cascades[wave];
      const waveColors = colors[wave] ?? [];
      this.combo += 1;
      this.lines += rows.length;
      this.timeLeft += (TUNING.cascade.secondsPerRow + this.modifiers.cascadeSecondsBonus) * rows.length;
      const gained = this.lineScore(rows.length);
      this.score += gained;
      this.dealBossDamage(this.bossDamage(rows.length));
      this.boardView.flashRows(rows);
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        for (let col = 0; col < BOARD_WIDTH; col += 1) {
          this.boardView.burst(col, row, waveColors[i * BOARD_WIDTH + col] ?? '#ffffff', 3, 2.8, 'star');
        }
      }
      this.boardView.addShake(0.1 + wave * 0.05);
      this.audio.lineClear(this.combo);
      this.hud.banner(`连锁 x${wave + 1}！  +${gained}`, 'gold');
      this.checkGoldRow(rows);
    }
  }

  /** Score for clearing n lines at the current combo/level/effects. */
  private lineScore(n: number): number {
    const comboIndex = Math.min(this.combo - 1, TUNING.scoring.comboSteps.length - 1);
    const doubleActive = this.elapsed < this.doubleUntil;
    return Math.round(
      TUNING.scoring.lineScores[n] *
        this.level *
        TUNING.scoring.comboSteps[comboIndex] *
        (doubleActive ? 2 : 1) *
        this.modifiers.scoreMultiplier,
    );
  }

  /** Apply a power-up effect (bank trigger or auto-fire). */
  private applyPowerUp(kind: PowerUpKind): void {
    const def = POWERUPS[kind];
    this.audio.powerUp();
    this.boardView.powerUpVfx(kind);
    switch (kind) {
      case 'time':
        this.timeLeft += TUNING.time.powerupTimeBonus;
        this.hud.banner(`${def.emoji} 时间 +${TUNING.time.powerupTimeBonus}s`, 'powerup');
        break;
      case 'slow':
        this.slowUntil = this.elapsed + TUNING.powerups.slowDuration;
        this.hud.banner(`${def.emoji} 减速 ${TUNING.powerups.slowDuration}s`, 'powerup');
        break;
      case 'bomb': {
        const result = this.board.bombClear();
        for (const [col, row] of result.blasted) {
          this.boardView.burst(col, row, def.color, 3, 1.8, 'smoke');
        }
        this.boardView.flashRows([...new Set(result.blasted.map(([, row]) => row))], def.color);
        this.boardView.addShake(0.3);
        this.dealBossDamage(TUNING.boss.bombDamage + this.modifiers.bombDamageBonus);
        this.scoreCascades(result.cascades, result.cascadeColors);
        this.hud.banner(`${def.emoji} 3×3 爆破！`, 'powerup');
        break;
      }
      case 'double':
        this.doubleUntil = this.elapsed + TUNING.powerups.doubleDuration;
        this.hud.banner(`${def.emoji} 双倍得分 ${TUNING.powerups.doubleDuration}s`, 'powerup');
        break;
      case 'bonus':
        this.score += TUNING.powerups.bonusPoints;
        this.hud.banner(`${def.emoji} +${TUNING.powerups.bonusPoints}`, 'powerup');
        break;
    }
  }

  /** Slot keys 1/2/3: choose an upgrade offer when one is open, else the bank. */
  private triggerSlot(index: number): void {
    if (this.upgradeOffers) {
      this.chooseUpgrade(index);
      return;
    }
    this.triggerBank(index);
  }

  private triggerBank(index: number): void {
    const kind = this.bank[index];
    if (!kind) return;
    this.bank.splice(index, 1);
    this.applyPowerUp(kind);
    this.hud.setBank(this.bank);
    this.hud.bankPop(index);
  }

  // ------------------------------------------------------------ gold row

  private updateGoldRow(delta: number): void {
    if (this.goldRow >= 0) return;
    this.goldTimer -= delta;
    if (this.goldTimer <= 0) {
      const span = TUNING.gold.rowMax - TUNING.gold.rowMin;
      this.goldRow = TUNING.gold.rowMin + Math.floor(this.rng() * (span + 1));
      this.audio.gold();
      this.hud.banner('金色目标行出现！', 'gold');
    }
  }

  private checkGoldRow(clearedRows: number[]): void {
    if (this.goldRow >= 0 && clearedRows.includes(this.goldRow)) this.resolveGoldRow(true);
  }

  private resolveGoldRow(rewarded: boolean): void {
    if (rewarded) {
      const timeBonus = TUNING.gold.bonusSeconds * this.modifiers.goldMultiplier;
      const scoreBonus = TUNING.gold.bonusPoints * this.level * this.modifiers.goldMultiplier;
      this.timeLeft += timeBonus;
      this.score += Math.round(scoreBonus * this.modifiers.scoreMultiplier);
      this.boardView.goldBurst(this.goldRow);
      this.hud.banner(`黄金行！ +${timeBonus}s +${scoreBonus}分`, 'gold');
    }
    this.goldRow = -1;
    this.goldTimer = TUNING.gold.nextAfterSeconds;
  }

  // ---------------------------------------------------------------- boss

  private updateBoss(delta: number): void {
    // Boss window: the clock reaching the threshold summons the boss.
    if (!this.boss && this.stage <= TUNING.stage.count && this.timeLeft <= TUNING.boss.spawnTimeLeft) {
      this.spawnBoss();
      return;
    }
    if (!this.boss) return;
    for (const event of this.boss.tick(delta, this.rng)) {
      if (event.type === 'warn') this.telegraphAttack(event.attack as BossAttack);
      else if (event.type === 'attack') this.executeAttack(event.attack as BossAttack);
      else if (event.type === 'phase2') {
        this.hud.banner('BOSS 狂暴了！', 'warn');
        this.audio.attackWarn();
      }
    }
  }

  private spawnBoss(): void {
    this.boss = new BossState(this.stage);
    const y = BOARD_TOP_Y + 6.2;
    this.bossView.show(this.stage, y, -7);
    this.boardView.setBossMode(true);
    this.boardView.fitCamera(this.camera, this.camera.aspect);
    this.hud.setBoss(this.boss.name, this.boss.hp, this.boss.maxHp);
    this.hud.banner(`⚠ ${this.boss.name} 出现！消行攻击！`, 'warn');
    this.audio.bossRoar();
    this.boardView.addShake(0.24);
  }

  private telegraphAttack(attack: BossAttack): void {
    this.bossView.setCharging(true);
    this.audio.attackWarn();
    const names: Record<BossAttack, string> = { garbage: '垃圾行来袭！', shuffle: '洗牌攻击！', fury: '狂怒加速！' };
    this.hud.banner(`⚠ ${names[attack]}`, 'warn');
    if (attack === 'garbage') this.boardView.setGarbageWarn(true);
  }

  private executeAttack(attack: BossAttack): void {
    this.bossView.setCharging(false);
    this.boardView.setGarbageWarn(false);
    switch (attack) {
      case 'garbage': {
        const count = Math.max(1, this.boss!.garbageRows() - this.modifiers.garbageReduction);
        const { topOut } = this.board.addGarbageRows(count, this.rng);
        this.boardView.addShake(0.34);
        for (let row = BOARD_HEIGHT - count; row < BOARD_HEIGHT; row += 1) {
          for (let col = 0; col < BOARD_WIDTH; col += 1) {
            if (this.board.cell(row, col)?.type === 'garbage') {
              this.boardView.burst(col, row, '#8b93a7', 2, 1.4, 'smoke');
            }
          }
        }
        if (topOut) {
          this.syncScene();
          this.endGame('stack');
          return;
        }
        break;
      }
      case 'shuffle': {
        this.board.shuffleBottomRows(TUNING.boss.shuffleRows, this.rng);
        this.boardView.addShake(0.2);
        this.boardView.flashRows([BOARD_HEIGHT - 3, BOARD_HEIGHT - 2, BOARD_HEIGHT - 1], '#c44df2');
        break;
      }
      case 'fury':
        this.furyUntil = this.elapsed + TUNING.boss.furyDuration;
        break;
    }
    this.syncScene();
  }

  private bossDamage(lines: number): number {
    const base = TUNING.boss.lineDamage[Math.min(lines, 4)];
    return Math.round(base * (1 + TUNING.boss.damageComboStep * Math.max(0, this.combo - 1)));
  }

  private dealBossDamage(amount: number): void {
    if (!this.boss || amount <= 0) return;
    this.boss.damage(amount);
    this.bossView.hit();
    this.audio.bossHit();
    this.hud.setBoss(this.boss.name, this.boss.hp, this.boss.maxHp);
    if (this.boss.hp <= 0) this.killBoss();
  }

  private killBoss(): void {
    if (!this.boss) return;
    const defeatedStage = this.stage;
    this.bossView.explode();
    this.audio.bossDeath();
    this.boardView.addShake(0.4);
    this.boardView.setBossMode(false);
    this.boardView.fitCamera(this.camera, this.camera.aspect);
    this.hud.setBoss(null);
    this.boss = null;

    if (defeatedStage >= TUNING.stage.count) {
      this.endGame('victory');
      return;
    }
    // Stage clear rewards.
    this.stage += 1;
    const timeBonus = TUNING.boss.stageBonusSeconds + this.modifiers.timePerStageBonus;
    const scoreBonus = Math.round(TUNING.boss.stageBonusScore * defeatedStage * this.modifiers.scoreMultiplier);
    this.timeLeft += timeBonus;
    this.score += scoreBonus;
    this.hud.banner(`BOSS 击破！ +${timeBonus}s +${scoreBonus}分`, 'gold');
    // Stage-start gifts (稳健开局).
    for (let i = 0; i < this.modifiers.startSlowGifts; i += 1) {
      this.grantPowerUp('slow');
    }
    // Upgrade choice.
    this.upgradeOffers = rollUpgradeOffers(this.rng, this.takenUpgrades);
    this.hud.showUpgrade(this.upgradeOffers);
    this.hud.update(this.metrics());
  }

  private chooseUpgrade(index: number): void {
    const def = this.upgradeOffers?.[index];
    if (!def) return;
    def.apply(this.modifiers);
    this.takenUpgrades.add(def.id);
    this.upgradeOffers = null;
    this.hud.hideUpgrade();
    this.hud.update(this.metrics());
    this.audio.upgrade();
  }

  /** Grant a power-up into the bank (auto-fires when full) — no FX origin cell. */
  private grantPowerUp(kind: PowerUpKind): void {
    if (this.bank.length >= TUNING.bank.size + this.modifiers.bankSizeBonus) {
      this.applyPowerUp(kind);
    } else {
      this.bank.push(kind);
      this.hud.setBank(this.bank);
      this.hud.banner(`获得道具：${POWERUPS[kind].name}（存入银行）`, 'powerup');
    }
  }

  private spawnPiece(): void {
    const type = this.nextPiece?.type ?? this.bag.next();
    const width = Math.max(...ROTATIONS[type][0].map(([x]) => x)) + 1;
    const x = Math.floor((BOARD_WIDTH - width) / 2);
    const y = 0; // fully inside the hidden spawn zone (rows 0-1)
    if (!this.board.canPlaceAt(type, 0, x, y)) {
      this.endGame('stack');
      return;
    }
    this.active = { type, rotationIndex: 0, x, y };
    this.activePower = rollPowerUp(this.rng, this.elapsed);
    this.nextPiece = { type: this.bag.next(), rotation: 0 };
    this.gravityTimer = 0;
  }

  private syncScene(): void {
    this.boardView.syncBoard(this.board);
    this.boardView.setGoldRow(this.goldRow);
    if (this.active) {
      const cells = pieceCells(this.active);
      this.boardView.syncActive(cells, this.active.type, this.activePower?.kind ?? null, this.activePower?.cellIndex ?? 0);
      const ghostCells = cells.map(([col, row]) => {
        const drop = this.board.dropRow(this.active as ActivePiece);
        const dy = row - this.active!.y;
        return [col, drop + dy] as [number, number];
      });
      this.boardView.syncGhost(ghostCells);
    } else {
      this.boardView.syncActive([], 'I', null, 0);
      this.boardView.syncGhost(null);
    }
  }

  private updateLevel(): void {
    let newLevel = 1;
    for (let i = 0; i < TUNING.gravity.levels.length; i += 1) {
      if (this.elapsed >= TUNING.gravity.levels[i].atSeconds) newLevel = i + 1;
    }
    if (newLevel !== this.level) {
      this.level = newLevel;
      this.audio.levelUp();
      this.hud.banner(`LEVEL ${this.level}`, 'level');
    }
  }

  private updateCountdownTick(): void {
    const second = Math.ceil(this.timeLeft);
    if (second !== this.lastTickSecond) {
      this.lastTickSecond = second;
      if (second <= TUNING.time.tickBelow && second > 0) this.audio.tick();
    }
  }

  private updateDangerSignals(): void {
    const stackTop = this.board.stackTopVisible();
    // Danger when the stack is within 5 rows of the visible top (spawn zone).
    const stackDanger = stackTop >= 2 && stackTop <= 7;
    document.body.classList.toggle('stack-danger', stackDanger);
    const critical = this.timeLeft <= TUNING.time.dangerThreshold;
    const danger = this.timeLeft <= TUNING.time.dangerThreshold * 2.5;
    this.hud.setTimerDanger(danger, critical);
    document.body.classList.toggle('time-critical', critical);
  }

  private clearDangerSignals(): void {
    document.body.classList.remove('stack-danger', 'time-critical');
  }

  // ---------------------------------------------------------------- phases

  private startGame(): void {
    this.board.reset();
    this.score = 0;
    this.lines = 0;
    this.combo = 0;
    this.level = 1;
    this.elapsed = 0;
    this.timeLeft = TUNING.time.startSeconds;
    this.slowUntil = -1;
    this.doubleUntil = -1;
    this.gravityTimer = 0;
    this.newBest = false;
    this.lastTickSecond = -1;
    this.bank = [];
    this.goldRow = -1;
    this.goldTimer = TUNING.gold.firstAtSeconds;
    this.stage = 1;
    this.boss = null;
    this.modifiers = defaultModifiers();
    this.takenUpgrades.clear();
    this.upgradeOffers = null;
    this.furyUntil = -1;
    this.bossView.hide();
    this.boardView.setBossMode(false);
    this.hud.setBoss(null);
    this.hud.hideUpgrade();
    this.hud.setBank(this.bank);
    this.active = null;
    this.activePower = null;
    this.nextPiece = { type: this.bag.next(), rotation: 0 };
    this.phase = 'playing';
    this.hud.setPhase('playing');
    this.spawnPiece();
    this.syncScene();
    this.boardView.hideBadge();
    this.audio.start();
    this.audio.startMusic();
    this.updateDangerSignals();
    this.hud.update(this.metrics());
  }

  private endGame(reason: 'time' | 'stack' | 'victory'): void {
    this.phase = 'gameover';
    this.active = null;
    this.activePower = null;
    this.boss = null;
    this.upgradeOffers = null;
    this.bossView.hide();
    this.boardView.setBossMode(false);
    this.hud.setBoss(null);
    this.hud.hideUpgrade();
    if (reason === 'victory') this.audio.victory();
    else this.audio.gameOver();
    if (this.score > this.best) {
      this.best = this.score;
      this.newBest = true;
      localStorage.setItem(BEST_KEY, String(this.best));
    }
    this.audio.stopMusic();
    this.clearDangerSignals();
    this.goldRow = -1;
    this.hud.setPhase('gameover', reason);
    this.hud.update(this.metrics());
    this.boardView.setGoldRow(-1);
    this.boardView.syncActive([], 'I', null, 0);
    this.boardView.syncGhost(null);
    this.boardView.hideBadge();
  }

  private togglePause(): void {
    if (this.phase === 'playing') {
      this.phase = 'paused';
      this.audio.stopMusic();
      this.audio.ui();
      this.hud.setPhase('paused');
    } else if (this.phase === 'paused') {
      this.resume();
    }
  }

  private resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.audio.startMusic();
    this.audio.ui();
    this.hud.setPhase('playing');
  }

  private toMenu(): void {
    this.phase = 'menu';
    this.active = null;
    this.activePower = null;
    this.audio.stopMusic();
    this.audio.ui();
    this.clearDangerSignals();
    this.bank = [];
    this.goldRow = -1;
    this.boss = null;
    this.upgradeOffers = null;
    this.bossView.hide();
    this.boardView.setBossMode(false);
    this.hud.setBoss(null);
    this.hud.hideUpgrade();
    this.hud.setBank(this.bank);
    this.board.reset();
    this.boardView.syncBoard(this.board);
    this.boardView.setGoldRow(-1);
    this.boardView.syncActive([], 'I', null, 0);
    this.boardView.syncGhost(null);
    this.boardView.hideBadge();
    this.hud.setPhase('menu');
    this.hud.update(this.metrics());
  }

  private toggleMute(): void {
    this.hud.setMuted(this.audio.toggleMute());
  }

  private metrics(): HudMetrics {
    return {
      timeLeft: this.timeLeft,
      score: this.score,
      best: this.best,
      level: this.level,
      lines: this.lines,
      combo: this.combo,
      stage: this.stage,
      nextType: this.nextPiece?.type ?? 'I',
      nextRotation: this.nextPiece?.rotation ?? 0,
      effects: {
        slow: this.slowUntil > this.elapsed ? this.slowUntil - this.elapsed : undefined,
        double: this.doubleUntil > this.elapsed ? this.doubleUntil - this.elapsed : undefined,
      },
      newBest: this.newBest,
    };
  }

  // ------------------------------------------------------------ test hooks

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.rng = createSeededRandom(value);
        this.bag = new BagRandomizer(this.rng);
      },
      setState: (name: string) => {
        const known = new Set([
          'menu',
          'active-play',
          'powerup',
          'danger',
          'gameover-time',
          'gameover-stack',
          'paused',
          'gold',
          'boss',
          'upgrade',
          'victory',
          'bot-well',
          'boss-low',
          'boss-final',
          'time-low',
        ]);
        if (!known.has(name)) throw new Error(`Unknown test state: ${name}`);
        switch (name) {
          case 'menu':
            this.toMenu();
            break;
          case 'active-play':
            this.startGame();
            this.elapsed = 45;
            this.timeLeft = 75;
            this.score = 1240;
            this.lines = 6;
            this.level = 2;
            this.buildPresetStack(14);
            this.forceActivePiece('T', 4, 10, 1);
            break;
          case 'powerup':
            this.startGame();
            this.elapsed = 30;
            this.timeLeft = 60;
            this.score = 840;
            this.lines = 4;
            this.level = 2;
            this.bank = ['bomb', 'double'];
            this.hud.setBank(this.bank);
            this.buildPresetStack(10);
            this.forceActivePiece('J', 3, 7, 1);
            this.activePower = { kind: 'time', cellIndex: 2 };
            break;
          case 'danger':
            this.startGame();
            this.elapsed = 95;
            this.timeLeft = 8;
            this.score = 2260;
            this.lines = 14;
            this.level = 4;
            this.buildPresetStack(7);
            this.forceActivePiece('S', 2, 5, 0);
            break;
          case 'gameover-time':
            this.startGame();
            this.elapsed = 130;
            this.timeLeft = 0;
            this.buildPresetStack(8);
            this.endGame('time');
            break;
          case 'gameover-stack':
            this.startGame();
            this.buildPresetStack(4);
            this.endGame('stack');
            break;
          case 'paused':
            this.startGame();
            this.buildPresetStack(8);
            this.forceActivePiece('O', 3, 6, 0);
            this.phase = 'paused';
            this.hud.setPhase('paused');
            break;
          case 'gold':
            this.startGame();
            this.elapsed = 50;
            this.timeLeft = 70;
            this.score = 1560;
            this.lines = 9;
            this.level = 2;
            this.buildPresetStack(14);
            this.forceActivePiece('L', 3, 11, 1);
            this.goldRow = 12;
            break;
          case 'bot-well':
            this.startGame();
            this.buildWellPreset();
            this.active = { type: 'I', rotationIndex: 0, x: 3, y: 1 };
            this.activePower = null;
            break;
          case 'boss':
            this.startGame();
            this.elapsed = 50;
            this.timeLeft = 45;
            this.score = 2140;
            this.lines = 12;
            this.level = 2;
            this.buildPresetStack(10);
            this.forceActivePiece('Z', 3, 6, 0);
            this.spawnBoss();
            this.boss!.hp = Math.round(this.boss!.maxHp * 0.6);
            this.hud.setBoss(this.boss!.name, this.boss!.hp, this.boss!.maxHp);
            break;
          case 'upgrade':
            this.startGame();
            this.elapsed = 130;
            this.timeLeft = 95;
            this.score = 4120;
            this.lines = 22;
            this.level = 3;
            this.stage = 2;
            this.buildPresetStack(8);
            this.upgradeOffers = rollUpgradeOffers(this.rng, new Set(['frenzy']));
            this.hud.showUpgrade(this.upgradeOffers);
            break;
          case 'victory':
            this.startGame();
            this.elapsed = 400;
            this.timeLeft = 30;
            this.score = 12850;
            this.lines = 64;
            this.level = 4;
            this.stage = 3;
            this.buildPresetStack(8);
            this.endGame('victory');
            break;
          case 'boss-low':
            this.startGame();
            this.elapsed = 80;
            this.timeLeft = 45;
            this.score = 3000;
            this.lines = 16;
            this.level = 2;
            this.buildWellPreset();
            this.active = { type: 'I', rotationIndex: 0, x: 3, y: 1 };
            this.activePower = null;
            this.spawnBoss();
            this.boss!.hp = 20;
            this.boss!.attackTimer = 999;
            this.hud.setBoss(this.boss!.name, this.boss!.hp, this.boss!.maxHp);
            break;
          case 'boss-final':
            this.startGame();
            this.elapsed = 300;
            this.timeLeft = 45;
            this.score = 9000;
            this.lines = 48;
            this.level = 4;
            this.stage = 3;
            this.buildWellPreset();
            this.active = { type: 'I', rotationIndex: 0, x: 3, y: 1 };
            this.activePower = null;
            this.spawnBoss();
            this.boss!.hp = 20;
            this.boss!.attackTimer = 999;
            this.hud.setBoss(this.boss!.name, this.boss!.hp, this.boss!.maxHp);
            break;
          case 'time-low':
            this.startGame();
            this.elapsed = 105;
            this.timeLeft = 3;
            this.buildPresetStack(6);
            break;
        }
        this.syncScene();
        this.updateDangerSignals();
        this.hud.update(this.metrics());
        this.render();
        this.publishDiagnostics();
        return { state: name };
      },
      setPausedForScreenshot: (paused: boolean) => {
        this.pausedForScreenshot = paused;
        if (paused) {
          this.syncScene();
          this.render();
        }
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
        this.render();
      },
      hideDebugUi: (hidden: boolean) => {
        this.debug.setHidden(hidden);
      },
    };
  }

  /** Deterministic mid-game stack used by screenshot states (fills rows topRow..bottom). */
  private buildPresetStack(topRow: number): void {
    this.board.reset();
    const types: TetrominoType[] = ['J', 'L', 'S', 'Z', 'T', 'O', 'I'];
    for (let row = Math.max(2, topRow); row < BOARD_HEIGHT; row += 1) {
      const skip = (row * 7 + 3) % BOARD_WIDTH;
      const skip2 = row % 4 === 0 ? (skip + 5) % BOARD_WIDTH : -1;
      for (let col = 0; col < BOARD_WIDTH; col += 1) {
        if (col === skip || col === skip2) continue;
        const cell = this.board.cell(row, col);
        if (cell) cell.type = types[(row * 3 + col) % types.length];
      }
    }
  }

  private forceActivePiece(type: TetrominoType, x: number, y: number, rotation: number): void {
    this.active = { type, rotationIndex: rotation, x, y };
    this.activePower = null;
    this.nextPiece = { type: 'L', rotation: 0 };
    this.gravityTimer = 0;
  }

  /** Bot fixture: 10-deep one-column well at column 5, rows 12-21 filled elsewhere. */
  private buildWellPreset(): void {
    this.board.reset();
    const types: TetrominoType[] = ['J', 'L', 'S', 'Z', 'T', 'O', 'I'];
    for (let row = 12; row < BOARD_HEIGHT; row += 1) {
      for (let col = 0; col < BOARD_WIDTH; col += 1) {
        if (col === 5) continue;
        const cell = this.board.cell(row, col);
        if (cell) cell.type = types[(row + col) % types.length];
      }
    }
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      phase: this.phase,
      elapsed: this.elapsed,
      timeLeft: this.timeLeft,
      score: this.score,
      level: this.level,
      lines: this.lines,
      combo: this.combo,
      bank: [...this.bank],
      goldRow: this.goldRow,
      occupied: this.board.occupiedCount(),
      stage: this.stage,
      bossHp: this.boss?.hp ?? null,
      bossMaxHp: this.boss?.maxHp ?? null,
      upgradeActive: this.upgradeOffers !== null,
      stackTop: this.board.stackTopVisible(),
      active: this.active
        ? { type: this.active.type, x: this.active.x, y: this.active.y, rotation: this.active.rotationIndex }
        : null,
      powerup: this.activePower?.kind ?? null,
      best: this.best,
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, TUNING.render.maxDpr),
      },
    };
  }
}
