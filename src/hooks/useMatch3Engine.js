/**
 * ═══════════════════════════════════════════════════════
 *  useMatch3Engine — React/Zustand hook for Match-3 state
 *
 *  Owns: board, score, movesLeft, combo, gameMode, savedModes,
 *  highScore, gameActive, gamePaused, drop stars, timer state.
 *
 *  Usage in React:
 *    const { board, score, startGame } = useMatch3Engine();
 *
 *  Usage in Vanilla JS:
 *    import { match3Store } from '@/hooks/useMatch3Engine';
 *    match3Store.getState().startGame('classic');
 * ═══════════════════════════════════════════════════════
 */
import { create } from "zustand";
import {
  hasValidMoves,
  cloneBoard,
  cloneDropStars,
  calcGoldReward,
} from "../vanilla/match3/engine.js";

export const match3Store = create((set, get) => ({
  // ─── State ───
  board: [],
  score: 0,
  movesLeft: 30,
  combo: 0,
  highScore: 0,
  gameMode: "classic", // "classic" | "timed" | "drop"
  gameActive: false,
  gamePaused: false,
  isAnimating: false,
  selected: null, // { x, y } or null
  savedModes: {}, // { mode: { board, score, movesLeft, ... } }

  // Drop mode
  dropStars: [],
  starsDropped: 0,

  // Timed mode
  timedSecondsLeft: 90,

  // ─── Computed ───
  getGoldReward: () => calcGoldReward(get().score),
  hasValidMoves: () => hasValidMoves(get().board),

  // ─── Actions ───
  setBoard: (board) => set({ board }),
  setScore: (score) => set({ score }),
  setMovesLeft: (movesLeft) => set({ movesLeft }),
  setCombo: (combo) => set({ combo }),
  setHighScore: (highScore) => set({ highScore }),
  setGameMode: (gameMode) => set({ gameMode }),
  setGameActive: (gameActive) => set({ gameActive }),
  setGamePaused: (gamePaused) => set({ gamePaused }),
  setIsAnimating: (isAnimating) => set({ isAnimating }),
  setSelected: (selected) => set({ selected }),

  // Bulk update from server state
  syncFromServer: (data) =>
    set({
      board: data.board || get().board,
      score: data.score ?? get().score,
      movesLeft: data.movesLeft ?? get().movesLeft,
      combo: data.combo ?? get().combo,
      highScore: data.highScore ?? get().highScore,
      gameMode: data.mode || get().gameMode,
      gameActive: data.gameActive ?? get().gameActive,
    }),

  // savedModes management
  setSavedModes: (savedModes) => set({ savedModes }),
  saveCurrentMode: () => {
    const s = get();
    if (!s.gameActive) return;
    set({
      savedModes: {
        ...s.savedModes,
        [s.gameMode]: {
          board: cloneBoard(s.board),
          score: s.score,
          movesLeft: s.movesLeft,
          combo: s.combo,
          dropStars: cloneDropStars(s.dropStars),
          starsDropped: s.starsDropped,
          timedSecondsLeft: s.timedSecondsLeft,
        },
      },
    });
  },

  // Drop mode actions
  setDropStars: (dropStars) => set({ dropStars }),
  setStarsDropped: (starsDropped) => set({ starsDropped }),

  // Timed mode actions
  setTimedSecondsLeft: (timedSecondsLeft) => set({ timedSecondsLeft }),
  decrementTimer: () =>
    set((s) => ({
      timedSecondsLeft: Math.max(0, s.timedSecondsLeft - 1),
    })),

  // Board cell update
  updateCell: (y, x, value) =>
    set((s) => {
      const newBoard = s.board.map((row) => [...row]);
      newBoard[y][x] = value;
      return { board: newBoard };
    }),

  // Score increment with combo
  addScore: (points) =>
    set((s) => ({
      score: s.score + points,
      combo: s.combo + 1,
    })),

  // Use a move
  useMove: () =>
    set((s) => ({
      movesLeft: Math.max(0, s.movesLeft - 1),
    })),

  // Reset combo
  resetCombo: () => set({ combo: 0 }),

  // Full state snapshot
  snapshot: () => {
    const s = get();
    return {
      board: cloneBoard(s.board),
      score: s.score,
      movesLeft: s.movesLeft,
      combo: s.combo,
      highScore: s.highScore,
      gameMode: s.gameMode,
      gameActive: s.gameActive,
    };
  },

  rollback: (snap) => set(snap),
}));

export function useMatch3Engine() {
  return match3Store();
}

export const useMatch3Board = () => match3Store((s) => s.board);
export const useMatch3Score = () => match3Store((s) => s.score);
export const useMatch3Active = () => match3Store((s) => s.gameActive);
export const useMatch3Mode = () => match3Store((s) => s.gameMode);
