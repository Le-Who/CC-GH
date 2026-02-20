/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Building Blox Tests (v4.8.0)
 *  Tests for piece validation, placement, line clearing,
 *  scoring, game-over detection, and reward calculation.
 * ═══════════════════════════════════════════════════════
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ECONOMY, calcBloxReward, BLOX_PIECES } from "../game-logic.js";

/* ═══ Piece Shape Validation ═══ */
describe("Building Blox — Piece Shapes", () => {
  it("all pieces have valid cell coordinates (non-negative)", () => {
    for (const piece of BLOX_PIECES) {
      for (const [r, c] of piece.cells) {
        assert.ok(r >= 0, `Piece ${piece.id} has negative row: ${r}`);
        assert.ok(c >= 0, `Piece ${piece.id} has negative col: ${c}`);
      }
    }
  });

  it("all pieces have unique IDs", () => {
    const ids = BLOX_PIECES.map((p) => p.id);
    const unique = new Set(ids);
    assert.equal(unique.size, ids.length, "Duplicate piece IDs found");
  });

  it("all pieces have at least 1 cell", () => {
    for (const piece of BLOX_PIECES) {
      assert.ok(piece.cells.length >= 1, `Piece ${piece.id} is empty`);
    }
  });

  it("all pieces have a color string", () => {
    for (const piece of BLOX_PIECES) {
      assert.equal(typeof piece.color, "string");
      assert.ok(piece.color.startsWith("#"), `Piece ${piece.id} color invalid`);
    }
  });

  it("no pieces exceed 5x5 bounding box", () => {
    for (const piece of BLOX_PIECES) {
      const maxR = Math.max(...piece.cells.map((c) => c[0]));
      const maxC = Math.max(...piece.cells.map((c) => c[1]));
      assert.ok(maxR < 5, `Piece ${piece.id} exceeds 5 rows`);
      assert.ok(maxC < 5, `Piece ${piece.id} exceeds 5 cols`);
    }
  });

  it("piece library contains expected variety", () => {
    assert.ok(BLOX_PIECES.length >= 10, "Piece library should have 10+ pieces");
    const sizes = BLOX_PIECES.map((p) => p.cells.length);
    assert.ok(sizes.includes(1), "Missing 1-cell piece");
    assert.ok(sizes.includes(2), "Missing 2-cell piece");
    assert.ok(sizes.includes(3), "Missing 3-cell piece");
    assert.ok(sizes.includes(4), "Missing 4-cell piece");
  });
});

/* ═══ Placement Validation (pure logic) ═══ */
describe("Building Blox — Placement Logic", () => {
  const GRID = 10;

  function createBoard() {
    return Array.from({ length: GRID }, () => Array(GRID).fill(null));
  }

  function canPlace(piece, row, col, board) {
    for (const [dr, dc] of piece.cells) {
      const r = row + dr,
        c = col + dc;
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) return false;
      if (board[r][c] !== null) return false;
    }
    return true;
  }

  function placePiece(piece, row, col, board) {
    for (const [dr, dc] of piece.cells) {
      board[row + dr][col + dc] = piece.color;
    }
  }

  it("places a 1-cell piece at origin", () => {
    const board = createBoard();
    const dot = BLOX_PIECES.find((p) => p.id === "dot");
    assert.ok(canPlace(dot, 0, 0, board));
    placePiece(dot, 0, 0, board);
    assert.notEqual(board[0][0], null);
  });

  it("rejects placement out of bounds", () => {
    const board = createBoard();
    const h3 = BLOX_PIECES.find((p) => p.id === "h3"); // 3 horizontal
    assert.ok(!canPlace(h3, 0, 8, board), "h3 should not fit at (0,8)");
    assert.ok(!canPlace(h3, -1, 0, board), "negative row");
    assert.ok(canPlace(h3, 0, 7, board), "h3 should fit at (0,7)");
  });

  it("rejects placement on occupied cells", () => {
    const board = createBoard();
    board[0][0] = "#red";
    const dot = BLOX_PIECES.find((p) => p.id === "dot");
    assert.ok(!canPlace(dot, 0, 0, board), "Should not place on occupied");
    assert.ok(canPlace(dot, 0, 1, board), "Should fit on empty");
  });

  it("i5 piece fits at (0,0) and (0,5) but not (0,6)", () => {
    const board = createBoard();
    const i5 = BLOX_PIECES.find((p) => p.id === "i5"); // 5 horizontal
    assert.ok(canPlace(i5, 0, 0, board));
    assert.ok(canPlace(i5, 0, 5, board));
    assert.ok(!canPlace(i5, 0, 6, board), "i5 should overflow at col 6");
  });
});

/* ═══ Line Clear Detection ═══ */
describe("Building Blox — Line Clearing", () => {
  const GRID = 10;

  function createBoard() {
    return Array.from({ length: GRID }, () => Array(GRID).fill(null));
  }

  function detectClears(board) {
    const rows = [];
    const cols = [];
    for (let r = 0; r < GRID; r++) {
      if (board[r].every((c) => c !== null)) rows.push(r);
    }
    for (let c = 0; c < GRID; c++) {
      let full = true;
      for (let r = 0; r < GRID; r++) {
        if (board[r][c] === null) {
          full = false;
          break;
        }
      }
      if (full) cols.push(c);
    }
    return { rows, cols };
  }

  it("detects a full row", () => {
    const board = createBoard();
    for (let c = 0; c < GRID; c++) board[5][c] = "#color";
    const { rows, cols } = detectClears(board);
    assert.deepEqual(rows, [5]);
    assert.deepEqual(cols, []);
  });

  it("detects a full column", () => {
    const board = createBoard();
    for (let r = 0; r < GRID; r++) board[r][3] = "#color";
    const { rows, cols } = detectClears(board);
    assert.deepEqual(rows, []);
    assert.deepEqual(cols, [3]);
  });

  it("detects simultaneous row + column clear", () => {
    const board = createBoard();
    for (let c = 0; c < GRID; c++) board[0][c] = "#color";
    for (let r = 0; r < GRID; r++) board[r][0] = "#color";
    const { rows, cols } = detectClears(board);
    assert.deepEqual(rows, [0]);
    assert.deepEqual(cols, [0]);
  });

  it("detects multiple row clears", () => {
    const board = createBoard();
    for (let c = 0; c < GRID; c++) {
      board[2][c] = "#a";
      board[7][c] = "#b";
    }
    const { rows } = detectClears(board);
    assert.deepEqual(rows, [2, 7]);
  });

  it("no clears on empty board", () => {
    const board = createBoard();
    const { rows, cols } = detectClears(board);
    assert.deepEqual(rows, []);
    assert.deepEqual(cols, []);
  });

  it("no clears on nearly-full row (one gap)", () => {
    const board = createBoard();
    for (let c = 0; c < GRID - 1; c++) board[3][c] = "#color";
    const { rows } = detectClears(board);
    assert.deepEqual(rows, []);
  });
});

/* ═══ Reward Calculation ═══ */
describe("Building Blox — calcBloxReward", () => {
  it("returns REWARD_BLOX_LOSE for 0 or negative scores", () => {
    assert.equal(calcBloxReward(0), ECONOMY.REWARD_BLOX_LOSE);
    assert.equal(calcBloxReward(-10), ECONOMY.REWARD_BLOX_LOSE);
  });

  it("returns REWARD_BLOX_LOSE for non-number input", () => {
    assert.equal(calcBloxReward(null), ECONOMY.REWARD_BLOX_LOSE);
    assert.equal(calcBloxReward("abc"), ECONOMY.REWARD_BLOX_LOSE);
  });

  it("returns proportional for low scores (1–99)", () => {
    const r50 = calcBloxReward(50);
    assert.ok(r50 >= ECONOMY.REWARD_BLOX_LOSE);
    assert.ok(r50 <= ECONOMY.REWARD_BLOX_WIN);
  });

  it("returns base reward at score=100", () => {
    const r = calcBloxReward(100);
    assert.equal(r, ECONOMY.REWARD_BLOX_WIN);
  });

  it("reward increases with score", () => {
    const r100 = calcBloxReward(100);
    const r300 = calcBloxReward(300);
    const r600 = calcBloxReward(600);
    const r1000 = calcBloxReward(1000);
    assert.ok(r300 >= r100, "300 should reward more than 100");
    assert.ok(r600 >= r300, "600 should reward more than 300");
    assert.ok(r1000 >= r600, "1000 should reward more than 600");
  });

  it("reward is capped at 400", () => {
    const r = calcBloxReward(99999);
    assert.ok(r <= 400, `Reward ${r} exceeds cap of 400`);
  });

  it("ECONOMY has blox cost", () => {
    assert.equal(typeof ECONOMY.COST_BLOX, "number");
    assert.ok(ECONOMY.COST_BLOX > 0);
    assert.ok(ECONOMY.COST_BLOX <= 10);
  });
});

/* ═══ Game-Over Detection (Pure Logic) ═══ */
describe("Building Blox — Game Over Detection", () => {
  const GRID = 10;

  function canPieceFit(piece, board) {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        let fits = true;
        for (const [dr, dc] of piece.cells) {
          const nr = r + dr,
            nc = c + dc;
          if (nr >= GRID || nc >= GRID || board[nr][nc] !== null) {
            fits = false;
            break;
          }
        }
        if (fits) return true;
      }
    }
    return false;
  }

  it("1-cell piece always fits on non-full board", () => {
    const board = Array.from({ length: GRID }, () =>
      Array(GRID).fill("#filled"),
    );
    board[5][5] = null; // One empty cell
    const dot = BLOX_PIECES.find((p) => p.id === "dot");
    assert.ok(canPieceFit(dot, board));
  });

  it("large piece does not fit on nearly-full board", () => {
    const board = Array.from({ length: GRID }, () =>
      Array(GRID).fill("#filled"),
    );
    board[9][9] = null; // Only one empty cell
    const i5 = BLOX_PIECES.find((p) => p.id === "i5");
    assert.ok(
      !canPieceFit(i5, board),
      "i5 should not fit with only 1 empty cell",
    );
  });

  it("all piececs fit on empty board", () => {
    const board = Array.from({ length: GRID }, () => Array(GRID).fill(null));
    for (const piece of BLOX_PIECES) {
      assert.ok(
        canPieceFit(piece, board),
        `${piece.id} should fit on empty board`,
      );
    }
  });
});

/* ═══ Game-Over Correctness (v4.7 — clearLines sync fix) ═══ */
describe("Building Blox — Game-Over Correctness", () => {
  const GRID = 10;

  function createBoard() {
    return Array.from({ length: GRID }, () => Array(GRID).fill(null));
  }
  function canPlace(piece, row, col, board) {
    for (const [dr, dc] of piece.cells) {
      const r = row + dr,
        c = col + dc;
      if (r < 0 || r >= GRID || c < 0 || c >= GRID) return false;
      if (board[r][c] !== null) return false;
    }
    return true;
  }
  function canPieceFit(piece, board) {
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        if (canPlace(piece, r, c, board)) return true;
      }
    }
    return false;
  }
  function clearLinesSynchronous(board) {
    const rowsToClear = [];
    const colsToClear = [];
    for (let r = 0; r < GRID; r++) {
      if (board[r].every((c) => c !== null)) rowsToClear.push(r);
    }
    for (let c = 0; c < GRID; c++) {
      let full = true;
      for (let r = 0; r < GRID; r++) {
        if (board[r][c] === null) {
          full = false;
          break;
        }
      }
      if (full) colsToClear.push(c);
    }
    // SYNC clear — mirrors the v4.7 fix
    for (const r of rowsToClear) {
      for (let c = 0; c < GRID; c++) board[r][c] = null;
    }
    for (const c of colsToClear) {
      for (let r = 0; r < GRID; r++) board[r][c] = null;
    }
    return rowsToClear.length + colsToClear.length;
  }

  it("clearLines clears board cells synchronously", () => {
    const board = createBoard();
    for (let c = 0; c < GRID; c++) board[0][c] = "#filled";
    const cleared = clearLinesSynchronous(board);
    assert.equal(cleared, 1, "Should clear exactly 1 row");
    // Board row 0 should be empty IMMEDIATELY (sync)
    for (let c = 0; c < GRID; c++) {
      assert.equal(board[0][c], null, `Cell [0][${c}] should be null`);
    }
  });

  it("canAnyPieceFit sees empty cells after synchronous line clear", () => {
    // Fill board except row 0 (which is entirely full) and one cell in row 1
    const board = createBoard();
    // Fill row 0 completely
    for (let c = 0; c < GRID; c++) board[0][c] = "#a";
    // Fill rest of board except one cell
    for (let r = 1; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) board[r][c] = "#b";
    }
    board[5][5] = null; // single empty cell

    // Before clear: dot can fit at (5,5), but large pieces cannot
    const i5 = BLOX_PIECES.find((p) => p.id === "i5");
    assert.ok(!canPieceFit(i5, board), "i5 should NOT fit before clear");

    // Clear row 0
    clearLinesSynchronous(board);

    // After clear: row 0 is empty → i5 NOW fits at (0,0)
    assert.ok(
      canPieceFit(i5, board),
      "i5 MUST fit after row 0 is cleared — game should NOT end",
    );
  });

  it("game does NOT end when moves exist in newly-cleared cells", () => {
    const board = createBoard();
    // Nearly full board — only row 9 is completely full
    for (let r = 0; r < GRID - 1; r++) {
      for (let c = 0; c < GRID; c++) board[r][c] = "#color";
    }
    for (let c = 0; c < GRID; c++) board[9][c] = "#full";
    // Only empty spot is (4,4) — not enough for i5
    board[4][4] = null;

    const dot = BLOX_PIECES.find((p) => p.id === "dot");
    assert.ok(canPieceFit(dot, board), "dot fits at (4,4) before clear");
    assert.ok(
      !canPieceFit(
        BLOX_PIECES.find((p) => p.id === "i5"),
        board,
      ),
      "i5 does NOT fit before clear",
    );

    // Clearing row 9 frees 10 cells
    clearLinesSynchronous(board);

    // After clear: row 9 is empty, ALL pieces should fit
    for (const piece of BLOX_PIECES) {
      assert.ok(
        canPieceFit(piece, board),
        `${piece.id} should fit after row 9 cleared`,
      );
    }
  });

  it("dot piece always fits on empty board (sanity)", () => {
    const board = createBoard();
    const dot = BLOX_PIECES.find((p) => p.id === "dot");
    // Every cell should work
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        assert.ok(canPlace(dot, r, c, board), `dot should fit at (${r},${c})`);
      }
    }
  });
});
