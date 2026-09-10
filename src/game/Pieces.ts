import { TETROMINO_TYPES, type TetrominoType } from './constants';

export type { TetrominoType };

/** A piece = 4 cells as [x, y] offsets; y grows upward, spawn reference at top. */
export type PieceShape = [number, number][];

const BASE_SHAPES: Record<TetrominoType, PieceShape> = {
  I: [[0, 0], [1, 0], [2, 0], [3, 0]],
  O: [[0, 0], [1, 0], [0, 1], [1, 1]],
  T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]],
  Z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  J: [[0, 0], [0, 1], [1, 1], [2, 1]],
  L: [[2, 0], [0, 1], [1, 1], [2, 1]],
};

/**
 * Rotate a shape 90° clockwise around (0,0), then normalize so min cell is
 * at (0,0) — a simple bounded rotation without wall-kick offsets.
 */
export function rotateShape(shape: PieceShape): PieceShape {
  const rotated = shape.map(([x, y]) => [-y, x] as [number, number]);
  const minX = Math.min(...rotated.map(([x]) => x));
  const minY = Math.min(...rotated.map(([, y]) => y));
  return rotated.map(([x, y]) => [x - minX, y - minY] as [number, number]);
}

function rotationsOf(shape: PieceShape): PieceShape[] {
  const seen = new Set<string>();
  const rotations: PieceShape[] = [];
  let current = shape;
  for (let i = 0; i < 4; i += 1) {
    const key = JSON.stringify(current);
    if (seen.has(key)) break;
    seen.add(key);
    rotations.push(current);
    current = rotateShape(current);
  }
  return rotations;
}

export const ROTATIONS: Record<TetrominoType, PieceShape[]> = Object.fromEntries(
  TETROMINO_TYPES.map((type) => [type, rotationsOf(BASE_SHAPES[type])]),
) as Record<TetrominoType, PieceShape[]>;

export interface ActivePiece {
  type: TetrominoType;
  rotationIndex: number;
  /** Board column/row of the shape's (0,0) reference cell. */
  x: number;
  y: number;
}

/** Cells of the active piece in board coordinates. */
export function pieceCells(piece: ActivePiece): [number, number][] {
  return ROTATIONS[piece.type][piece.rotationIndex].map(
    ([dx, dy]) => [piece.x + dx, piece.y + dy] as [number, number],
  );
}

/** Random 7-bag piece generator using the seeded RNG. */
export class BagRandomizer {
  private bag: TetrominoType[] = [];

  constructor(private readonly rng: () => number) {}

  next(): TetrominoType {
    if (this.bag.length === 0) {
      this.bag = [...TETROMINO_TYPES];
      for (let i = this.bag.length - 1; i > 0; i -= 1) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop() as TetrominoType;
  }
}
