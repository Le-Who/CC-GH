import test, { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import { bloxStore } from "../src/hooks/useBloxEngine.js";
import { GRID, PIECES } from "../src/vanilla/blox/pieces.js";

describe("useBloxEngine (Zustand Store)", () => {
  beforeEach(() => {
    // Reset store to a clean state before each test
    bloxStore.setState({
      board: Array.from({ length: GRID }, () => Array(GRID).fill(null)),
      tray: [],
      score: 0,
      linesCleared: 0,
      highScore: 0,
      gameActive: false,
      gamePaused: false,
      selectedPiece: -1,
    });
  });

  describe("Actions", () => {
    it("newGame() initializes the board, tray, and game state", () => {
      bloxStore.getState().newGame();
      const state = bloxStore.getState();

      assert.equal(state.board.length, GRID);
      assert.equal(state.board[0].length, GRID);
      assert.equal(state.board[0][0], null);

      assert.equal(state.tray.length, 3);
      assert.ok(state.tray.every(t => !t.placed));
      assert.ok(state.tray.every(t => t.piece && t.piece.id));

      assert.equal(state.score, 0);
      assert.equal(state.linesCleared, 0);
      assert.equal(state.gameActive, true);
      assert.equal(state.gamePaused, false);
      assert.equal(state.selectedPiece, -1);
    });

    it("selectPiece() updates selectedPiece index", () => {
      bloxStore.getState().selectPiece(1);
      assert.equal(bloxStore.getState().selectedPiece, 1);
    });

    it("placePieceAt() places a piece on the board and updates the tray", () => {
      bloxStore.getState().newGame();
      const stateBefore = bloxStore.getState();
      const firstPiece = stateBefore.tray[0].piece;

      // Place the first piece at (0, 0)
      bloxStore.getState().placePieceAt(0, 0, 0);

      const stateAfter = bloxStore.getState();
      assert.equal(stateAfter.tray[0].placed, true);
      assert.equal(stateAfter.selectedPiece, -1);

      // Check if the board is updated
      for (const [dr, dc] of firstPiece.cells) {
        assert.equal(stateAfter.board[0 + dr][0 + dc], firstPiece.color);
      }
    });

    it("placePieceAt() does nothing if piece is already placed or invalid", () => {
      bloxStore.getState().newGame();
      // Manually set the first piece to placed
      bloxStore.setState(s => {
        const newTray = [...s.tray];
        newTray[0] = { ...newTray[0], placed: true };
        return { tray: newTray };
      });

      const stateBefore = bloxStore.getState();
      bloxStore.getState().placePieceAt(0, 0, 0);

      const stateAfter = bloxStore.getState();
      // Ensure the board hasn't changed
      assert.deepEqual(stateBefore.board, stateAfter.board);
    });

    it("addScore() and addLines() accumulate values", () => {
      bloxStore.getState().addScore(50);
      assert.equal(bloxStore.getState().score, 50);

      bloxStore.getState().addScore(25);
      assert.equal(bloxStore.getState().score, 75);

      bloxStore.getState().addLines(2);
      assert.equal(bloxStore.getState().linesCleared, 2);

      bloxStore.getState().addLines(1);
      assert.equal(bloxStore.getState().linesCleared, 3);
    });

    it("setters update simple state variables correctly", () => {
      bloxStore.getState().setHighScore(100);
      assert.equal(bloxStore.getState().highScore, 100);

      bloxStore.getState().setGameActive(true);
      assert.equal(bloxStore.getState().gameActive, true);

      bloxStore.getState().setGamePaused(true);
      assert.equal(bloxStore.getState().gamePaused, true);
    });

    it("clearBoardCell() clears a specific cell", () => {
      bloxStore.getState().newGame();
      // Manually set a cell to filled
      bloxStore.setState(s => {
        const newBoard = s.board.map(r => [...r]);
        newBoard[5][5] = "#color";
        return { board: newBoard };
      });

      assert.equal(bloxStore.getState().board[5][5], "#color");

      bloxStore.getState().clearBoardCell(5, 5);
      assert.equal(bloxStore.getState().board[5][5], null);
    });

    it("refillTray() generates 3 new pieces", () => {
      bloxStore.getState().refillTray();
      const state = bloxStore.getState();
      assert.equal(state.tray.length, 3);
      assert.ok(state.tray.every(t => !t.placed));
      assert.ok(state.tray.every(t => t.piece && t.piece.id));
      assert.equal(state.selectedPiece, -1);
    });

    it("restoreState(), snapshot(), and rollback() handle store state correctly", () => {
      bloxStore.getState().newGame();
      bloxStore.getState().addScore(100);
      bloxStore.getState().setHighScore(200);

      // Snapshot the current state
      const snap = bloxStore.getState().snapshot();
      assert.equal(snap.score, 100);
      assert.equal(snap.highScore, 200);

      // Modify the state
      bloxStore.getState().addScore(50);
      assert.equal(bloxStore.getState().score, 150);

      // Rollback to the snapshot
      bloxStore.getState().rollback(snap);
      assert.equal(bloxStore.getState().score, 100);

      // Restore from an external generic object
      const externalState = {
        board: [],
        tray: [],
        score: 500,
        linesCleared: 10,
        highScore: 1000,
        gameActive: false,
      };
      bloxStore.getState().restoreState(externalState);
      assert.equal(bloxStore.getState().score, 500);
      assert.equal(bloxStore.getState().linesCleared, 10);
      assert.equal(bloxStore.getState().highScore, 1000);
      assert.equal(bloxStore.getState().gameActive, false);

      // Restore handles null correctly
      bloxStore.getState().restoreState(null);
      // Ensure score is still 500
      assert.equal(bloxStore.getState().score, 500);
    });
  });

  describe("Computed functions", () => {
    it("canPlace() returns correct validation", () => {
      bloxStore.getState().newGame();
      const dot = PIECES.find(p => p.id === "dot");
      const i5 = PIECES.find(p => p.id === "i5");

      // dot at 0, 0 should fit
      assert.equal(bloxStore.getState().canPlace(dot, 0, 0), true);

      // i5 at 0, 0 should fit
      assert.equal(bloxStore.getState().canPlace(i5, 0, 0), true);

      // i5 at 0, 9 should overflow horizontally and return false
      assert.equal(bloxStore.getState().canPlace(i5, 0, 9), false);

      // dot at -1, 0 should underflow and return false
      assert.equal(bloxStore.getState().canPlace(dot, -1, 0), false);

      // Fill a spot and test intersection
      bloxStore.setState(s => {
        const newBoard = s.board.map(r => [...r]);
        newBoard[5][5] = "#filled";
        return { board: newBoard };
      });

      assert.equal(bloxStore.getState().canPlace(dot, 5, 5), false);
    });

    it("canAnyPieceFit() returns correct validation", () => {
      bloxStore.getState().newGame();

      // With an empty board, any piece should fit
      assert.equal(bloxStore.getState().canAnyPieceFit(), true);

      // Fill the board so no piece can fit
      bloxStore.setState(s => {
        const newBoard = Array.from({ length: GRID }, () => Array(GRID).fill("#filled"));
        return { board: newBoard };
      });

      // Now no piece should fit
      assert.equal(bloxStore.getState().canAnyPieceFit(), false);
    });

    it("allPlaced() returns true when all tray pieces are placed", () => {
      bloxStore.getState().newGame();
      assert.equal(bloxStore.getState().allPlaced(), false);

      // Place all pieces
      bloxStore.setState(s => {
        const newTray = s.tray.map(t => ({ ...t, placed: true }));
        return { tray: newTray };
      });

      assert.equal(bloxStore.getState().allPlaced(), true);
    });
  });
});
