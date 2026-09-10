import { BOARD_HEIGHT, BOARD_WIDTH, TETROMINO_COLORS, type PowerUpKind, type TetrominoType } from './constants';
import type { PowerUpPick } from './PowerUps';
import type { ActivePiece } from './Pieces';
import { pieceCells } from './Pieces';

/** Garbage cells use a distinct gray marker type. */
export type GarbageType = 'garbage';
export type CellType = TetrominoType | GarbageType;

export interface BoardCell {
  type: CellType | null;
  /** Remnant badge (rendered fading) after a power-up piece locks. */
  badge: PowerUpKind | null;
  /** Age in locks; used for subtle color stabilization. */
  flash: number; // 1 = just locked (flash), decays to 0
}

export interface LockResult {
  clearedRows: number[];
  /** Rows removed by a lock-time BOMB (legacy; bank-triggered bombs use bombClear). */
  bombedRows: number[];
  /** Cascade waves: rows completed by the collapse after the first clear. */
  cascadedRows: number[][];
  /** Flat color snapshots per cascade wave cell, for burst coloring. */
  cascadedColors: string[][];
  triggeredPowerUps: PowerUpKind[];
  /** True when this lock cleared at least one scored line. */
  clearedLines: boolean;
}

export class Board {
  readonly cells: BoardCell[][] = [];

  constructor() {
    this.reset();
  }

  reset(): void {
    for (let row = 0; row < BOARD_HEIGHT; row += 1) {
      if (!this.cells[row]) this.cells[row] = [];
      for (let col = 0; col < BOARD_WIDTH; col += 1) {
        const cell = this.cells[row][col];
        if (cell) {
          cell.type = null;
          cell.badge = null;
          cell.flash = 0;
        } else {
          this.cells[row][col] = { type: null, badge: null, flash: 0 };
        }
      }
    }
  }

  cell(row: number, col: number): BoardCell | null {
    if (row < 0 || row >= BOARD_HEIGHT || col < 0 || col >= BOARD_WIDTH) return null;
    return this.cells[row][col];
  }

  isFree(row: number, col: number): boolean {
    return this.cell(row, col)?.type === null;
  }

  canPlace(piece: ActivePiece): boolean {
    return pieceCells(piece).every(([col, row]) => {
      if (col < 0 || col >= BOARD_WIDTH) return false;
      if (row < 0) return false; // above the board is blocked
      if (row >= BOARD_HEIGHT) return false;
      return this.isFree(row, col);
    });
  }

  canPlaceAt(type: ActivePiece['type'], rotationIndex: number, x: number, y: number): boolean {
    return this.canPlace({ type, rotationIndex, x, y });
  }

  /**
   * Move the piece down until it collides; returns the resting row (piece.y).
   * Used for ghost projection and hard drop.
   */
  dropRow(piece: ActivePiece): number {
    let y = piece.y;
    while (this.canPlaceAt(piece.type, piece.rotationIndex, piece.x, y + 1)) y += 1;
    return y;
  }

  /**
   * Lock a piece (with optional badge cell) into the grid. Runs BOMB row
   * removal first, then line detection, then top-out check. Returns everything
   * the game needs to score and animate.
   */
  lock(piece: ActivePiece, badge: PowerUpPick | null): LockResult {
    const cells = pieceCells(piece);
    const triggeredPowerUps: PowerUpKind[] = [];

    for (const [col, row] of cells) {
      const cell = this.cell(row, col);
      if (cell) {
        cell.type = piece.type;
        cell.flash = 1;
      }
    }

    // Mark the badge cell (renders a fading gem) and record the trigger.
    if (badge) {
      triggeredPowerUps.push(badge.kind);
      const [col, row] = cells[badge.cellIndex];
      const cell = this.cell(row, col);
      if (cell) cell.badge = badge.kind;
    }

    // Scored line clears, then gravity cascade chains.
    const clearedRows: number[] = [];
    for (let row = 0; row < BOARD_HEIGHT; row += 1) {
      const line = this.cells[row];
      if (line && line.every((c) => c.type !== null)) clearedRows.push(row);
    }
    if (clearedRows.length > 0) {
      for (const row of clearedRows) this.clearRow(row);
      this.collapse();
    }

    // Cascade: rows completed by the collapse clear automatically, wave after wave.
    const cascadedRows: number[][] = [];
    const cascadedColors: string[][] = [];
    let safety = 0;
    while (safety < 6) {
      const rows = this.fullRows();
      if (rows.length === 0) break;
      cascadedColors.push(rows.flatMap((row) => this.cellTypes(row)));
      for (const row of rows) this.clearRow(row);
      this.collapse();
      cascadedRows.push(rows);
      safety += 1;
    }

    return {
      clearedRows,
      bombedRows: [],
      cascadedRows,
      cascadedColors,
      triggeredPowerUps,
      clearedLines: clearedRows.length > 0,
    };
  }

  /**
   * BOMB power-up (bank-triggered): blast a 3×3 region at the bottom-center
   * (cols 3-5, rows 19-21), then apply per-column gravity — cells fall into
   * the holes and can complete new rows (gravity cascade chains).
   */
  bombClear(): { blasted: [number, number][]; cascades: number[][]; cascadeColors: string[][] } {
    const blasted: [number, number][] = [];
    for (let row = BOARD_HEIGHT - 3; row < BOARD_HEIGHT; row += 1) {
      for (let col = 3; col <= 5; col += 1) {
        const cell = this.cells[row][col];
        if (cell && cell.type !== null) {
          blasted.push([col, row]);
          cell.type = null;
          cell.badge = null;
          cell.flash = 0;
        }
      }
    }
    this.applyColumnGravity();

    const cascades: number[][] = [];
    const cascadeColors: string[][] = [];
    let safety = 0;
    while (safety < 6) {
      const rows = this.fullRows();
      if (rows.length === 0) break;
      cascadeColors.push(rows.flatMap((row) => this.cellTypes(row)));
      for (const row of rows) this.clearRow(row);
      this.applyColumnGravity();
      cascades.push(rows);
      safety += 1;
    }
    return { blasted, cascades, cascadeColors };
  }

  /** Per-column gravity: cells fall straight down into gaps below them. */
  private applyColumnGravity(): void {
    for (let col = 0; col < BOARD_WIDTH; col += 1) {
      let write = BOARD_HEIGHT - 1;
      for (let row = BOARD_HEIGHT - 1; row >= 0; row -= 1) {
        const cell = this.cells[row][col];
        if (cell.type === null && cell.badge === null) continue;
        if (write !== row) {
          const dst = this.cells[write][col];
          dst.type = cell.type;
          dst.badge = cell.badge;
          dst.flash = cell.flash;
          cell.type = null;
          cell.badge = null;
          cell.flash = 0;
        }
        write -= 1;
      }
    }
  }

  /** Total occupied cells (diagnostics / bomb observability). */
  occupiedCount(): number {
    let count = 0;
    for (const line of this.cells) {
      for (const cell of line) if (cell.type !== null) count += 1;
    }
    return count;
  }

  /** Decay flash values every frame tick (called by Game). */
  tickFlash(delta: number): void {
    const decay = Math.min(1, delta * 3.5);
    for (const line of this.cells) {
      for (const cell of line) {
        if (cell.flash > 0) cell.flash = Math.max(0, cell.flash - decay);
        // Badges linger visually a bit longer; cleared by BoardView timing.
      }
    }
  }

  private clearRow(row: number): void {
    const line = this.cells[row];
    if (!line) return;
    for (const cell of line) {
      cell.type = null;
      cell.badge = null;
      cell.flash = 0;
    }
  }

  /** Compress the stack downward so empty rows end up at the top. */
  private collapse(): void {
    let writeRow = BOARD_HEIGHT - 1;
    for (let row = BOARD_HEIGHT - 1; row >= 0; row -= 1) {
      const line = this.cells[row];
      const empty = line.every((c) => c.type === null);
      if (empty) continue;
      if (writeRow !== row) {
        for (let col = 0; col < BOARD_WIDTH; col += 1) {
          const src = line[col];
          const dst = this.cells[writeRow][col];
          dst.type = src.type;
          dst.badge = src.badge;
          dst.flash = src.flash;
          src.type = null;
          src.badge = null;
          src.flash = 0;
        }
      }
      writeRow -= 1;
    }
  }

  /** Top-most occupied row in the visible zone (for danger warning), -1 if empty. */
  stackTopVisible(): number {
    for (let row = 2; row < BOARD_HEIGHT; row += 1) {
      if (this.cells[row]?.some((c) => c.type !== null)) return row;
    }
    return -1;
  }

  /** Rows currently complete (before locking), for FX snapshots. */
  fullRows(): number[] {
    const rows: number[] = [];
    for (let row = 0; row < BOARD_HEIGHT; row += 1) {
      if (this.cells[row].every((c) => c.type !== null)) rows.push(row);
    }
    return rows;
  }

  /** Hex colors of each cell in a row (for burst coloring). */
  cellTypes(row: number): string[] {
    return this.cells[row].map((c) => {
      if (!c.type) return '#ffffff';
      if (c.type === 'garbage') return GARBAGE_COLOR;
      return TETROMINO_COLORS[c.type];
    });
  }

  /**
   * Boss garbage attack: the whole stack shifts UP by `count` rows and gray
   * garbage rows (one random hole each) fill the bottom. If any block is
   * pushed out through the top, the player tops out.
   */
  addGarbageRows(count: number, rng: () => number): { topOut: boolean } {
    let topOut = false;
    for (let row = 0; row < count; row += 1) {
      if (this.cells[row]?.some((c) => c.type !== null)) topOut = true;
    }
    for (let row = 0; row < BOARD_HEIGHT - count; row += 1) {
      for (let col = 0; col < BOARD_WIDTH; col += 1) {
        const src = this.cells[row + count][col];
        this.cells[row][col].type = src.type;
        this.cells[row][col].badge = src.badge;
        this.cells[row][col].flash = src.flash;
        src.type = null;
        src.badge = null;
        src.flash = 0;
      }
    }
    for (let row = BOARD_HEIGHT - count; row < BOARD_HEIGHT; row += 1) {
      const hole = Math.floor(rng() * BOARD_WIDTH);
      for (let col = 0; col < BOARD_WIDTH; col += 1) {
        const cell = this.cells[row][col];
        cell.type = col === hole ? null : 'garbage';
        cell.badge = null;
        cell.flash = 1;
      }
    }
    return { topOut };
  }

  /** Boss shuffle attack: permute the cells of the bottom `count` rows. */
  shuffleBottomRows(count: number, rng: () => number): void {
    const start = Math.max(0, BOARD_HEIGHT - count);
    for (let row = start; row < BOARD_HEIGHT; row += 1) {
      const line = this.cells[row];
      for (let i = line.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [line[i], line[j]] = [line[j], line[i]];
      }
    }
  }
}

export const GARBAGE_COLOR = '#8b93a7';

export type { PowerUpPick };
