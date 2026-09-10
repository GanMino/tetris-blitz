/** Board dimensions. The top 2 rows are the hidden spawn zone. */
export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 22;
export const HIDDEN_ROWS = 2;
export const VISIBLE_ROWS = BOARD_HEIGHT - HIDDEN_ROWS;

/** World-space cell size; everything else derives from it. */
export const CELL = 1;

/** Number of next pieces previewed in the HUD. */
export const PREVIEW_COUNT = 1;

/**
 * Runtime tuning. All values are live-editable via lil-gui when debug UI is on.
 * Grouped so the debug panel stays readable.
 */
export const TUNING = {
  time: {
    startSeconds: 120,
    secondsPerLine: 4,
    powerupTimeBonus: 8,
    dangerThreshold: 10, // red pulse below this many seconds
    tickBelow: 10, // audible countdown tick below this many seconds
  },
  gravity: {
    // Interval (seconds per cell) per level, matched by elapsed-time thresholds.
    levels: [
      { atSeconds: 0, interval: 0.9 },
      { atSeconds: 30, interval: 0.7 },
      { atSeconds: 60, interval: 0.5 },
      { atSeconds: 90, interval: 0.35 },
    ],
    softDropMultiplier: 20,
    slowMultiplier: 0.55, // SLOW power-up scales gravity interval by this
  },
  powerups: {
    chance: 0.18,
    chanceLate: 0.26, // after lateBoostSeconds
    lateBoostSeconds: 60,
    slowDuration: 12,
    doubleDuration: 12,
    bonusPoints: 300,
    bombRows: 2,
  },
  scoring: {
    lineScores: [0, 100, 300, 500, 800], // index = lines cleared in one lock
    comboSteps: [1, 1.5, 2, 2.5, 3], // combo 1..5, capped at last
  },
  render: {
    maxDpr: 2,
    exposure: 1.12,
  },
} as const;

export type Tuning = typeof TUNING;

/** NES-Tetris-inspired saturated palette, slightly brightened for 3D lighting. */
export const TETROMINO_COLORS = {
  I: '#19e0d8', // cyan
  O: '#f6d22e', // yellow
  T: '#b45cf2', // purple
  S: '#4fd64a', // green
  Z: '#f24c4c', // red
  J: '#3f7bf2', // blue
  L: '#f29a2e', // orange
} as const;

export type TetrominoType = keyof typeof TETROMINO_COLORS;

export const TETROMINO_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export const POWERUP_COLORS = {
  time: '#29b6f6',
  slow: '#66d94c',
  bomb: '#ff8a2b',
  double: '#ffd23e',
  bonus: '#f4539e',
} as const;

export type PowerUpKind = keyof typeof POWERUP_COLORS;

export interface PowerUpDef {
  kind: PowerUpKind;
  label: string; // short glyph rendered on the badge texture
  name: string; // full name for banners
  color: string;
  duration: number | null; // null = instant
}

export const POWERUPS: Record<PowerUpKind, PowerUpDef> = {
  time: { kind: 'time', label: '+8s', name: '时间 +8s', color: POWERUP_COLORS.time, duration: null },
  slow: { kind: 'slow', label: 'SLOW', name: '减速', color: POWERUP_COLORS.slow, duration: TUNING.powerups.slowDuration },
  bomb: { kind: 'bomb', label: 'BOOM', name: '爆破清底', color: POWERUP_COLORS.bomb, duration: null },
  double: { kind: 'double', label: 'x2', name: '双倍得分', color: POWERUP_COLORS.double, duration: TUNING.powerups.doubleDuration },
  bonus: { kind: 'bonus', label: '+300', name: '加分', color: POWERUP_COLORS.bonus, duration: null },
};

export const POWERUP_KINDS: PowerUpKind[] = ['time', 'slow', 'bomb', 'double', 'bonus'];

/** Scene palette (arcade cabinet backdrop). */
export const SCENE_COLORS = {
  backgroundTop: '#0d1030',
  backgroundBottom: '#05060f',
  frame: '#1a1d3a',
  frameEdge: '#32376b',
  well: '#070818',
  gridLine: '#2a2f5e',
  neonA: '#ff4f9a',
  neonB: '#29b6f6',
  ghost: '#ffffff',
} as const;

/** Cell coordinate helpers. */
export const BOARD_ORIGIN_X = -(BOARD_WIDTH / 2) * CELL;
/** y = 0 is the TOP of the visible board; +y is up. */
export const BOARD_TOP_Y = (VISIBLE_ROWS / 2) * CELL;
export const BOARD_BOTTOM_Y = BOARD_TOP_Y - VISIBLE_ROWS * CELL;

export function cellToWorldX(col: number): number {
  return BOARD_ORIGIN_X + (col + 0.5) * CELL;
}

export function cellToWorldY(row: number): number {
  // row 0 = hidden top, row HIDDEN_ROWS..BOARD_HEIGHT-1 = visible.
  // Visible top edge at BOARD_TOP_Y + CELL/2, bottom at BOARD_BOTTOM_Y - CELL/2.
  const visibleRow = row - HIDDEN_ROWS;
  return BOARD_TOP_Y - CELL / 2 - visibleRow * CELL;
}
