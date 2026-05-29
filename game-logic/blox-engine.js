/* ═══════════════════════════════════════════════════
 *  Blox — Shared Domain Engine
 *  Pure stateless board rules used by server mutations and client state.
 * ═══════════════════════════════════════════════════ */
import { GRID } from "./blox-pieces.js";

export const DEFAULT_BLOX_ROTATE_CHARGES = 3;

export function createEmptyBoard() {
  return Array.from({ length: GRID }, () => Array(GRID).fill(null));
}

export function canPlace(board, piece, row, col) {
  for (const [dr, dc] of piece.cells) {
    const r = row + dr;
    const c = col + dc;
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

export function rotateBloxPiece(piece = {}) {
  const cells = Array.isArray(piece.cells) ? piece.cells : [];
  if (!cells.length) return { ...piece, cells: [] };
  const maxRow = Math.max(...cells.map(([row]) => Number(row) || 0));
  const rotated = cells.map(([row, col]) => [Number(col) || 0, maxRow - (Number(row) || 0)]);
  const minRow = Math.min(...rotated.map(([row]) => row));
  const minCol = Math.min(...rotated.map(([, col]) => col));
  return {
    ...piece,
    cells: rotated
      .map(([row, col]) => [row - minRow, col - minCol])
      .sort(([rowA, colA], [rowB, colB]) => rowA - rowB || colA - colB),
  };
}

export function clearBloxLines(board) {
  const rows = [];
  const cols = [];
  for (let r = 0; r < board.length; r++) {
    if (board[r].every(Boolean)) rows.push(r);
  }
  for (let c = 0; c < board[0].length; c++) {
    let full = true;
    for (let r = 0; r < board.length; r++) {
      if (!board[r][c]) {
        full = false;
        break;
      }
    }
    if (full) cols.push(c);
  }
  for (const r of rows) {
    for (let c = 0; c < board[r].length; c++) board[r][c] = null;
  }
  for (const c of cols) {
    for (let r = 0; r < board.length; r++) board[r][c] = null;
  }
  const cleared = rows.length + cols.length;
  return { rows, cols, cleared, points: cleared ? cleared * 10 + Math.max(0, cleared - 1) * 10 : 0 };
}

export function cloneBloxState(state = {}) {
  return {
    ...state,
    board: Array.isArray(state.board)
      ? state.board.map((row) => (Array.isArray(row) ? [...row] : []))
      : createEmptyBoard(),
    tray: Array.isArray(state.tray)
      ? state.tray.map((item) => (item ? { ...item, piece: item.piece ? { ...item.piece, cells: [...item.piece.cells] } : item.piece } : item))
      : [],
  };
}

export function previewBloxPlacement(state = {}, placement = {}) {
  const pieceIdx = Number(placement.pieceIdx);
  const row = Number(placement.row);
  const col = Number(placement.col);
  const next = cloneBloxState(state);
  const trayItem = next.tray[pieceIdx];
  if (!Number.isInteger(pieceIdx) || !Number.isInteger(row) || !Number.isInteger(col)) {
    return { valid: false, reason: "invalid coordinates", state: next };
  }
  if (!trayItem || trayItem.placed || !trayItem.piece) {
    return { valid: false, reason: "invalid piece", state: next };
  }
  if (!canPlace(next.board, trayItem.piece, row, col)) {
    return { valid: false, reason: "invalid placement", state: next };
  }
  placePiece(next.board, trayItem.piece, row, col);
  next.tray[pieceIdx] = { ...trayItem, placed: true };
  const clear = clearBloxLines(next.board);
  next.score = (Number(next.score) || 0) + trayItem.piece.cells.length + clear.points;
  next.linesCleared = (Number(next.linesCleared) || 0) + clear.cleared;
  return { valid: true, state: next, clear };
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
  const rows = piece.cells.map((cell) => cell[0]);
  const cols = piece.cells.map((cell) => cell[1]);
  const avgR = rows.reduce((a, b) => a + b, 0) / rows.length;
  const avgC = cols.reduce((a, b) => a + b, 0) / cols.length;
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
