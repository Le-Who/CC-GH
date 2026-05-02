/**
 * ═══════════════════════════════════════════════════
 *  Game Hub — Merge Board Utilities (Shared)
 *  Board hydration, validation, and empty cell helpers.
 *  Used by mergeRoutes.js and questRoutes.js.
 * ═══════════════════════════════════════════════════
 */

import { normalizeMergeItem } from "./merge-config.js";

export const BOARD_ROWS = 7;
export const BOARD_COLS = 9;

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
  // Ensure 7×9 dimensions
  if (Array.isArray(board)) {
    while (board.length < BOARD_ROWS)
      board.push(Array(BOARD_COLS).fill(null));
    for (let r = 0; r < board.length; r++) {
      if (!Array.isArray(board[r])) board[r] = Array(BOARD_COLS).fill(null);
      while (board[r].length < BOARD_COLS) board[r].push(null);
      for (let c = 0; c < board[r].length; c++) {
        const item = board[r][c];
        board[r][c] = item == null ? null : normalizeMergeItem(item);
      }
    }
  }
  p.merge.board = board;
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
