import { POWERUPS, POWERUP_KINDS, TUNING, type PowerUpKind } from './constants';
import { pieceCells, type ActivePiece } from './Pieces';

export interface PowerUpPick {
  kind: PowerUpKind;
  /** Index into the piece's 4 cells where the badge sits. */
  cellIndex: number;
}

/** Randomly decide whether a piece carries a power-up and which cell hosts it. */
export function rollPowerUp(rng: () => number, elapsed: number): PowerUpPick | null {
  const late = elapsed >= TUNING.powerups.lateBoostSeconds;
  const chance = late ? TUNING.powerups.chanceLate : TUNING.powerups.chance;
  if (rng() >= chance) return null;
  const kind = POWERUP_KINDS[Math.floor(rng() * POWERUP_KINDS.length)];
  const cellIndex = Math.floor(rng() * 4);
  return { kind, cellIndex };
}

export function powerUpLabel(kind: PowerUpKind): string {
  return POWERUPS[kind].label;
}

export function powerUpName(kind: PowerUpKind): string {
  return POWERUPS[kind].name;
}

/** Cells that carry a badge for the given piece, in board coordinates. */
export function badgeCells(piece: ActivePiece, pick: PowerUpPick): [number, number][] {
  const cells = pieceCells(piece);
  return [cells[pick.cellIndex]];
}
