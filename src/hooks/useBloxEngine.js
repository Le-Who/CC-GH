/**
 * ═══════════════════════════════════════════════════════
 *  useBloxEngine — React/Zustand hook for Building Blox state
 *
 *  Owns: board (10×10), tray (3 pieces), score, linesCleared,
 *  highScore, gameActive, selectedPiece.
 *
 *  Usage in React:
 *    const { board, score, placePiece } = useBloxEngine();
 *
 *  Usage in Vanilla JS:
 *    import { bloxStore } from '@/hooks/useBloxEngine';
 *    bloxStore.getState().newGame();
 * ═══════════════════════════════════════════════════════
 */
import { create } from "zustand";
import { GRID, PIECES, PIECE_COUNT } from "../vanilla/blox/pieces.js";

export const bloxStore = create((set, get) => ({
  // ─── State ───
  board: [],              // GRID×GRID, null or color string
  tray: [],               // [{ piece, placed }]
  score: 0,
  linesCleared: 0,
  highScore: 0,
  gameActive: false,
  gamePaused: false,
  selectedPiece: -1,

  // ─── Computed ───
  canPlace: (piece, row, col) => {
    const { board } = get();
    for (const [dr, dc] of piece.cells) {
      const r = row + dr, c = col + dc;
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) return false;
      if (board[r][c] !== null) return false;
    }
    return true;
  },

  canAnyPieceFit: () => {
    const { tray, canPlace } = get();
    for (const t of tray) {
      if (t.placed) continue;
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (canPlace(t.piece, r, c)) return true;
        }
      }
    }
    return false;
  },

  allPlaced: () => get().tray.every(t => t.placed),

  // ─── Actions ───
  newGame: () => {
    const board = Array.from({ length: GRID }, () => Array(GRID).fill(null));
    const tray = Array.from({ length: PIECE_COUNT }, () => ({
      piece: PIECES[Math.floor(Math.random() * PIECES.length)],
      placed: false,
    }));
    set({
      board,
      tray,
      score: 0,
      linesCleared: 0,
      gameActive: true,
      gamePaused: false,
      selectedPiece: -1,
    });
  },

  selectPiece: (index) => set({ selectedPiece: index }),

  placePieceAt: (pieceIdx, row, col) => set((s) => {
    const t = s.tray[pieceIdx];
    if (!t || t.placed) return s;

    const newBoard = s.board.map(r => [...r]);
    for (const [dr, dc] of t.piece.cells) {
      newBoard[row + dr][col + dc] = t.piece.color;
    }

    const newTray = s.tray.map((item, i) =>
      i === pieceIdx ? { ...item, placed: true } : item
    );

    return {
      board: newBoard,
      tray: newTray,
      selectedPiece: -1,
    };
  }),

  addScore: (pts) => set((s) => ({ score: s.score + pts })),
  addLines: (count) => set((s) => ({ linesCleared: s.linesCleared + count })),

  setHighScore: (hs) => set({ highScore: hs }),
  setGameActive: (active) => set({ gameActive: active }),
  setGamePaused: (paused) => set({ gamePaused: paused }),

  clearBoardCell: (r, c) => set((s) => {
    const newBoard = s.board.map(row => [...row]);
    newBoard[r][c] = null;
    return { board: newBoard };
  }),

  refillTray: () => set({
    tray: Array.from({ length: PIECE_COUNT }, () => ({
      piece: PIECES[Math.floor(Math.random() * PIECES.length)],
      placed: false,
    })),
    selectedPiece: -1,
  }),

  // Bulk restore from server/localStorage save
  restoreState: (saved) => {
    if (!saved) return;
    set({
      board: saved.board || [],
      tray: saved.tray || [],
      score: saved.score || 0,
      linesCleared: saved.linesCleared || 0,
      highScore: saved.highScore || 0,
      gameActive: saved.gameActive ?? false,
    });
  },

  // Full snapshot
  snapshot: () => {
    const s = get();
    return {
      board: s.board.map(r => [...r]),
      tray: s.tray.map(t => ({ ...t, piece: { ...t.piece } })),
      score: s.score,
      linesCleared: s.linesCleared,
      highScore: s.highScore,
      gameActive: s.gameActive,
    };
  },

  rollback: (snap) => set(snap),
}));

export function useBloxEngine() {
  return bloxStore();
}

export const useBloxBoard = () => bloxStore((s) => s.board);
export const useBloxScore = () => bloxStore((s) => s.score);
export const useBloxActive = () => bloxStore((s) => s.gameActive);
export const useBloxTray = () => bloxStore((s) => s.tray);
