import { POWERUPS, TETROMINO_COLORS, type PowerUpKind, type TetrominoType } from '../game/constants';
import { ROTATIONS } from '../game/Pieces';

export type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover';

export interface HudMetrics {
  timeLeft: number;
  score: number;
  best: number;
  level: number;
  lines: number;
  combo: number;
  nextType: TetrominoType;
  nextRotation: number;
  effects: Partial<Record<'slow' | 'double', number>>; // remaining seconds
  newBest: boolean;
}

export interface HudCallbacks {
  onStart: () => void;
  onRestart: () => void;
  onResume: () => void;
  onMenu: () => void;
  onPauseToggle: () => void;
  onMute: () => void;
}

/**
 * DOM interface: HUD metrics, next-piece preview, effect badges, event
 * banners, menu/pause/gameover overlays, mute/pause buttons, danger pulse.
 * Wired to a single source of truth via `update()`; buttons dispatch to Game.
 */
export class Hud {
  private readonly timerValue = this.el('#timer-value');
  private readonly timerMetric = this.el('#time-metric');
  private readonly scoreValue = this.el('#score-value');
  private readonly bestValue = this.el('#best-value');
  private readonly menuBestValue = this.el('#menu-best-value');
  private readonly levelValue = this.el('#level-value');
  private readonly linesValue = this.el('#lines-value');
  private readonly comboBox = this.el('#combo-box');
  private readonly nextPreview = this.el('#next-preview');
  private readonly effectsBox = this.el('#effects-box');
  private readonly bannerBox = this.el('#banner');
  private readonly menuOverlay = this.el('#menu-overlay');
  private readonly pauseOverlay = this.el('#pause-overlay');
  private readonly gameoverOverlay = this.el('#gameover-overlay');
  private readonly gameoverReason = this.el('#gameover-reason');
  private readonly gameoverScore = this.el('#gameover-score');
  private readonly gameoverBest = this.el('#gameover-best');
  private readonly newBestTag = this.el('#new-best-tag');
  private readonly muteButton = this.el<HTMLButtonElement>('#mute-button');
  private readonly pauseButton = this.el<HTMLButtonElement>('#pause-button');
  private readonly menuStartButton = this.el<HTMLButtonElement>('#menu-start-button');
  private readonly pauseResumeButton = this.el<HTMLButtonElement>('#pause-resume-button');
  private readonly pauseRestartButton = this.el<HTMLButtonElement>('#pause-restart-button');
  private readonly pauseMenuButton = this.el<HTMLButtonElement>('#pause-menu-button');
  private readonly gameoverRetryButton = this.el<HTMLButtonElement>('#gameover-retry-button');
  private readonly gameoverMenuButton = this.el<HTMLButtonElement>('#gameover-menu-button');

  private bannerTimer: number | null = null;

  constructor(private readonly callbacks: HudCallbacks) {
    this.menuStartButton.addEventListener('click', () => this.callbacks.onStart());
    this.pauseResumeButton.addEventListener('click', () => this.callbacks.onResume());
    this.pauseRestartButton.addEventListener('click', () => this.callbacks.onRestart());
    this.pauseMenuButton.addEventListener('click', () => this.callbacks.onMenu());
    this.gameoverRetryButton.addEventListener('click', () => this.callbacks.onRestart());
    this.gameoverMenuButton.addEventListener('click', () => this.callbacks.onMenu());
    this.pauseButton.addEventListener('click', () => this.callbacks.onPauseToggle());
    this.muteButton.addEventListener('click', () => this.callbacks.onMute());
    this.buildLegend();
  }

  setPhase(phase: GamePhase, reason?: 'time' | 'stack'): void {
    this.menuOverlay.classList.toggle('hidden', phase !== 'menu');
    this.pauseOverlay.classList.toggle('hidden', phase !== 'paused');
    this.gameoverOverlay.classList.toggle('hidden', phase !== 'gameover');
    document.body.classList.toggle('phase-playing', phase === 'playing');
    if (phase === 'gameover') {
      this.gameoverReason.textContent = reason === 'time' ? '时间到！' : '方块堆满！';
    }
  }

  update(metrics: HudMetrics): void {
    const totalSeconds = Math.max(0, Math.ceil(metrics.timeLeft));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    this.timerValue.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    this.scoreValue.textContent = String(metrics.score);
    this.bestValue.textContent = String(metrics.best);
    this.menuBestValue.textContent = String(metrics.best);
    this.levelValue.textContent = String(metrics.level);
    this.linesValue.textContent = String(metrics.lines);
    this.comboBox.classList.toggle('hidden', metrics.combo < 2);
    this.comboBox.textContent = `COMBO x${metrics.combo}`;
    this.newBestTag.classList.toggle('hidden', !metrics.newBest);
    this.gameoverScore.textContent = String(metrics.score);
    this.gameoverBest.textContent = String(metrics.best);

    // Danger: timer or stack pressure is communicated by Game via classes.
    this.renderNext(metrics.nextType, metrics.nextRotation);
    this.renderEffects(metrics.effects);
  }

  setTimerDanger(danger: boolean, critical: boolean): void {
    this.timerMetric.classList.toggle('danger', danger);
    this.timerMetric.classList.toggle('critical', critical);
  }

  private renderNext(type: TetrominoType, rotation: number): void {
    this.nextPreview.innerHTML = '';
    const cells = ROTATIONS[type][rotation];
    const minX = Math.min(...cells.map(([x]) => x));
    const maxX = Math.max(...cells.map(([x]) => x));
    const minY = Math.min(...cells.map(([, y]) => y));
    const maxY = Math.max(...cells.map(([, y]) => y));
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    this.nextPreview.style.gridTemplateColumns = `repeat(${width}, 1fr)`;
    for (let y = maxY; y >= minY; y -= 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const cell = document.createElement('div');
        cell.className = 'next-cell';
        if (cells.some(([cx, cy]) => cx === x && cy === y)) {
          cell.style.background = TETROMINO_COLORS[type];
          cell.style.boxShadow = `0 0 6px ${TETROMINO_COLORS[type]}88`;
        }
        this.nextPreview.appendChild(cell);
      }
    }
    // Fill remaining rows so the box height is stable.
    const rows = height;
    if (rows < 2) {
      for (let i = 0; i < (2 - rows) * width; i += 1) {
        const cell = document.createElement('div');
        cell.className = 'next-cell';
        this.nextPreview.appendChild(cell);
      }
    }
  }

  private renderEffects(effects: HudMetrics['effects']): void {
    this.effectsBox.innerHTML = '';
    const badges: Array<[string, string, number]> = [];
    if (effects.slow !== undefined) badges.push(['slow', '减速', effects.slow]);
    if (effects.double !== undefined) badges.push(['double', '双倍分', effects.double]);
    for (const [kind, label, remaining] of badges) {
      const badge = document.createElement('div');
      badge.className = `effect-badge effect-${kind}`;
      const color = POWERUPS[kind as PowerUpKind].color as string;
      badge.style.borderColor = color;
      badge.style.color = color;
      badge.innerHTML = `<span>${label}</span><strong>${Math.ceil(remaining)}s</strong>`;
      this.effectsBox.appendChild(badge);
    }
  }

  banner(text: string, kind: 'powerup' | 'level' | 'score' | 'warn' = 'powerup'): void {
    this.bannerBox.textContent = text;
    this.bannerBox.className = `banner-show banner-${kind}`;
    if (this.bannerTimer !== null) window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => {
      this.bannerBox.className = '';
    }, 1400);
  }

  setMuted(muted: boolean): void {
    this.muteButton.textContent = muted ? '🔇' : '♪';
    this.muteButton.classList.toggle('muted', muted);
  }

  private buildLegend(): void {
    const legend = this.el('#powerup-legend');
    legend.innerHTML = '';
    for (const kind of ['time', 'slow', 'bomb', 'double', 'bonus'] as PowerUpKind[]) {
      const def = POWERUPS[kind];
      const chip = document.createElement('span');
      chip.className = 'legend-chip';
      chip.style.background = `${def.color}22`;
      chip.style.borderColor = def.color;
      chip.style.color = def.color;
      chip.textContent = `${def.label} ${def.name}`;
      legend.appendChild(chip);
    }
  }

  private el<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
