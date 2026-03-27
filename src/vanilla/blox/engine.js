/* ═══════════════════════════════════════════════════
 *  Blox — Domain Engine (v6.3.0)
 *  Pure stateless functions for game rules and board manipulation.
 *  Atomized to share logic between Vanilla JS client and React state.
 * ═══════════════════════════════════════════════════ */
import { GRID } from "./pieces.js";

export function createEmptyBoard() {
  return Array.from({ length: GRID }, () => Array(GRID).fill(null));
}

export function canPlace(board, piece, row, col) {
  for (const [dr, dc] of piece.cells) {
    const r = row + dr,
      c = col + dc;
    if (r < 0 || r >= GRID || c < 0 || c >= GRID) return false;
    if (board[r][c] !== null) return false;
  }
  return true;
}

export function placePiece(board, piece, row, col) {
  for (const [dr, dc] of piece.cells) {
    board[row + dr][col + dc] = piece.color;
  }
}

export function canAnyPieceFit(board, tray) {
  for (const t of tray) {
    if (t.placed) continue;
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (canPlace(board, t.piece, r, c)) return true;
      }
    }
  }
  return false;
}

export function getCenterOffset(piece) {
  const rows = piece.cells.map((c) => c[0]);
  const cols = piece.cells.map((c) => c[1]);
  const avgR = rows.reduce((a, b) => a + b, 0) / rows.length;
  const avgC = cols.reduce((a, b) => a + b, 0) / cols.length;
  // Snap to nearest actual cell in the piece
  let bestCell = piece.cells[0];
  let bestDist = Infinity;
  for (const [r, c] of piece.cells) {
    const d = (r - avgR) ** 2 + (c - avgC) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestCell = [r, c];
    }
  }
  return { dr: bestCell[0], dc: bestCell[1] };
}
