/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Merge Board Utilities (Shared)
 *  Board hydration, validation, and empty cell helpers.
 *  Used by mergeRoutes.js and questRoutes.js.
 * ═══════════════════════════════════════════════════
 */

import { normalizeMergeItem } from "./merge-config.js";

export const BOARD_ROWS = 7;
export const BOARD_COLS = 5;

export function createEmptyMergeBoard() {
  return Array.from({ length: BOARD_ROWS }, () => Array(BOARD_COLS).fill(null));
}

function normalizeBoardItem(item, cache) {
  if (item == null) return null;
  const key = `${item.id || ""}|${item.chainId || ""}|${item.level ?? ""}`;
  if (!cache.has(key)) cache.set(key, normalizeMergeItem(item));
  const normalized = cache.get(key);
  return normalized ? { ...normalized } : null;
}

function normalizeBoardShape(board) {
  const next = createEmptyMergeBoard();
  const normalizedItems = new Map();
  if (!Array.isArray(board)) return next;
  const overflow = [];

  for (let r = 0; r < board.length; r += 1) {
    const row = Array.isArray(board[r]) ? board[r] : [];
    for (let c = 0; c < row.length; c += 1) {
      const item = normalizeBoardItem(row[c], normalizedItems);
      if (!item) continue;
      if (r < BOARD_ROWS && c < BOARD_COLS && !next[r][c]) {
        next[r][c] = item;
      } else {
        overflow.push(item);
      }
    }
  }

  if (overflow.length) {
    let index = 0;
    for (let r = 0; r < BOARD_ROWS; r += 1) {
      for (let c = 0; c < BOARD_COLS; c += 1) {
        if (next[r][c] || index >= overflow.length) continue;
        next[r][c] = overflow[index];
        index += 1;
      }
    }
  }
  return next;
}

/**
 * Hydrate merge board from persisted JSON storage.
 * Some older payloads stored nested arrays as JSON strings or numeric-key objects.
 * This restores the board to a proper 2D array.
 */
export function hydrateMergeBoard(p) {
  if (!p.merge) return;
  let board = p.merge.board;
  // Case 1: JSON-stringified by sanitizeBoardData
  if (typeof board === "string") {
    try {
      board = JSON.parse(board);
    } catch {
      /* leave as-is */
    }
  }
  // Case 2: Postgres converted array → object with numeric keys
  if (board && !Array.isArray(board)) {
    board = Object.keys(board)
      .sort((a, b) => a - b)
      .map((k) => {
        const row = board[k];
        if (row && !Array.isArray(row)) {
          return Object.keys(row)
            .sort((a, b) => a - b)
            .map((j) => row[j] ?? null);
        }
        return row;
      });
  }
  p.merge.board = normalizeBoardShape(board);
}

/** Helper: get empty cells on a board */
export function getEmptyCells(board) {
  const cells = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      if (board[r][c] === null) cells.push([r, c]);
    }
  }
  return cells;
}

/** Validate grid coordinate is a valid integer in [0, limit) */
export function validCoord(v, limit) {
  return Number.isInteger(v) && v >= 0 && v < limit;
}
