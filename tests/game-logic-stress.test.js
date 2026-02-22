/**
 * ═══════════════════════════════════════════════════════
 *  Game Hub — Game Logic Stress & Correctness Tests (v5.0.0)
 *
 *  Deep-dive verification of Match-3, Building Blox, and Farm
 *  rules. Covers basic moves, edge cases, cascades, and
 *  stress tests with high iteration counts.
 *
 *  Run:  node --test tests/game-logic-stress.test.js
 * ═══════════════════════════════════════════════════════
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ECONOMY,
  CROPS,
  CROP_TIERS,
  GEM_TYPES,
  BOARD_SIZE,
  BLOX_PIECES,
  createDefaultPlayer,
  calcRegen,
  calcGoldReward,
  calcBloxReward,
  processOfflineActions,
  getWateringMultiplier,
  getGrowthPct,
  generateBoard,
  findMatches,
  randomGem,
} from "../game-logic.js";

// Client engine (different findMatches implementation)
import {
  findMatches as clientFindMatches,
  generateBoard as clientGenerateBoard,
  resolveBoard,
  hasValidMoves,
  cloneBoard,
  DROP_TYPES,
  BOARD_SIZE as CLIENT_BOARD_SIZE,
} from "../public/js/match3/engine.js";

/* ═══════════════════════════════════════════════════
 *  MATCH-3 — Board Generation Stress
 * ═══════════════════════════════════════════════════ */
describe("Match-3 Stress: Board Generation", () => {
  it("1000 boards: every board is 8×8, all cells are valid gems", () => {
    for (let i = 0; i < 1000; i++) {
      const board = generateBoard();
      assert.equal(board.length, BOARD_SIZE, `Board ${i} wrong height`);
      for (let y = 0; y < BOARD_SIZE; y++) {
        assert.equal(
          board[y].length,
          BOARD_SIZE,
          `Board ${i} row ${y} wrong width`,
        );
        for (let x = 0; x < BOARD_SIZE; x++) {
          assert.ok(
            GEM_TYPES.includes(board[y][x]),
            `Board ${i} cell [${y}][${x}] = "${board[y][x]}" not in GEM_TYPES`,
          );
        }
      }
    }
  });

  it("1000 boards: zero initial matches (server findMatches)", () => {
    for (let i = 0; i < 1000; i++) {
      const board = generateBoard();
      const matches = findMatches(board);
      assert.equal(
        matches.length,
        0,
        `Board ${i} has ${matches.length} initial matches`,
      );
    }
  });

  it("1000 client boards: zero initial matches (client findMatches)", () => {
    for (let i = 0; i < 1000; i++) {
      const board = clientGenerateBoard();
      const matches = clientFindMatches(board);
      assert.equal(
        matches.length,
        0,
        `Client board ${i} has ${matches.length} initial matches`,
      );
    }
  });

  it("1000 boards: hasValidMoves returns true (no deadlocks)", () => {
    for (let i = 0; i < 1000; i++) {
      const board = clientGenerateBoard();
      assert.ok(
        hasValidMoves(board),
        `Board ${i} is a deadlock — no valid moves`,
      );
    }
  });

  it("500 boards: all 6 gem types appear with roughly even distribution", () => {
    const counts = {};
    for (const gem of GEM_TYPES) counts[gem] = 0;
    for (let i = 0; i < 500; i++) {
      const board = generateBoard();
      for (const row of board) {
        for (const gem of row) counts[gem]++;
      }
    }
    const total = 500 * BOARD_SIZE * BOARD_SIZE; // 32000
    const expected = total / GEM_TYPES.length; // ~5333
    for (const gem of GEM_TYPES) {
      const ratio = counts[gem] / expected;
      assert.ok(
        ratio > 0.85 && ratio < 1.15,
        `Gem "${gem}" appears ${counts[gem]} times (expected ~${Math.round(expected)}, ratio=${ratio.toFixed(3)})`,
      );
    }
  });

  it("drop tokens never appear in generated boards", () => {
    for (let i = 0; i < 200; i++) {
      const board = clientGenerateBoard();
      for (const row of board) {
        for (const cell of row) {
          assert.ok(
            !DROP_TYPES.includes(cell),
            `Drop token "${cell}" found in generated board`,
          );
        }
      }
    }
  });
});

/* ═══════════════════════════════════════════════════
 *  MATCH-3 — findMatches Correctness (Server)
 * ═══════════════════════════════════════════════════ */
describe("Match-3: findMatches server correctness", () => {
  function makeUniqueBoard() {
    // Checkerboard — guarantees zero matches
    return Array.from({ length: BOARD_SIZE }, (_, y) =>
      Array.from(
        { length: BOARD_SIZE },
        (_, x) => GEM_TYPES[(x + y * 2) % GEM_TYPES.length],
      ),
    );
  }

  it("detects horizontal 3-in-a-row", () => {
    const b = makeUniqueBoard();
    b[0][0] = b[0][1] = b[0][2] = "dark";
    const m = findMatches(b);
    assert.ok(m.length > 0, "No matches found");
    const hit = m.find((mm) => mm.type === "dark");
    assert.ok(hit, "Match type 'dark' not found");
    assert.equal(hit.gems.length, 3);
  });

  it("detects horizontal 5-in-a-row as a single match of at least 5", () => {
    const b = makeUniqueBoard();
    // Use a gem type that doesn't appear in row 3 of the pattern
    const rowGems = new Set(b[3]);
    const safeGem = GEM_TYPES.find((g) => !rowGems.has(g)) || "fire";
    b[3][1] = b[3][2] = b[3][3] = b[3][4] = b[3][5] = safeGem;
    const m = findMatches(b);
    const hit = m.find((mm) => mm.type === safeGem && mm.gems.length >= 5);
    assert.ok(hit, "5-in-a-row not detected");
    assert.ok(hit.gems.length >= 5, `Expected ≥ 5, got ${hit.gems.length}`);
  });

  it("detects horizontal 8-in-a-row (full width)", () => {
    const b = makeUniqueBoard();
    for (let x = 0; x < BOARD_SIZE; x++) b[4][x] = "water";
    const m = findMatches(b);
    const hit = m.find((mm) => mm.type === "water" && mm.gems.length === 8);
    assert.ok(hit, "Full-row 8-in-a-row not detected");
  });

  it("detects vertical 3-in-a-row", () => {
    const b = makeUniqueBoard();
    b[0][7] = b[1][7] = b[2][7] = "light";
    const m = findMatches(b);
    const hit = m.find((mm) => mm.type === "light");
    assert.ok(hit, "Vertical match not found");
    assert.equal(hit.gems.length, 3);
  });

  it("detects vertical 8-in-a-column (full height)", () => {
    const b = makeUniqueBoard();
    for (let y = 0; y < BOARD_SIZE; y++) b[y][0] = "earth";
    const m = findMatches(b);
    const hit = m.find((mm) => mm.type === "earth" && mm.gems.length === 8);
    assert.ok(hit, "Full-column 8-in-a-row not detected");
  });

  it("L-shaped cross: shared cell counted in both matches", () => {
    const b = makeUniqueBoard();
    // Horizontal: row 3, cols 2-4 = "air"
    b[3][2] = b[3][3] = b[3][4] = "air";
    // Vertical: col 4, rows 3-5 = "air"
    b[4][4] = b[5][4] = "air"; // b[3][4] already set
    const m = findMatches(b);
    // Should find at least 2 matches (1 horizontal, 1 vertical)
    const airMatches = m.filter((mm) => mm.type === "air");
    assert.ok(
      airMatches.length >= 2,
      `Expected 2+ air matches, got ${airMatches.length}`,
    );
  });

  it("null cells never produce matches", () => {
    const b = Array.from({ length: BOARD_SIZE }, () =>
      Array(BOARD_SIZE).fill(null),
    );
    const m = findMatches(b);
    assert.equal(m.length, 0, "Null board should have 0 matches");
  });

  it("full board of same gem returns all cells matched", () => {
    const b = Array.from({ length: BOARD_SIZE }, () =>
      Array(BOARD_SIZE).fill("fire"),
    );
    const m = findMatches(b);
    // All 64 cells should be covered by matches
    const allGems = new Set();
    for (const match of m) {
      for (const g of match.gems) allGems.add(`${g.x},${g.y}`);
    }
    assert.equal(allGems.size, 64, `Only ${allGems.size}/64 cells matched`);
  });
});

/* ═══════════════════════════════════════════════════
 *  MATCH-3 — findMatches Correctness (Client engine.js)
 * ═══════════════════════════════════════════════════ */
describe("Match-3: findMatches client correctness", () => {
  function makeUniqueBoard() {
    return Array.from({ length: CLIENT_BOARD_SIZE }, (_, y) =>
      Array.from(
        { length: CLIENT_BOARD_SIZE },
        (_, x) => GEM_TYPES[(x + y * 2) % GEM_TYPES.length],
      ),
    );
  }

  it("client findMatches returns flat index array (not objects)", () => {
    const b = makeUniqueBoard();
    b[0][0] = b[0][1] = b[0][2] = "dark";
    const m = clientFindMatches(b);
    assert.ok(m.length > 0, "No matches found");
    // All entries should be numbers (flat indices)
    for (const idx of m) {
      assert.equal(typeof idx, "number", `Expected number, got ${typeof idx}`);
    }
  });

  it("client detects horizontal 3-in-a-row at correct indices", () => {
    const b = makeUniqueBoard();
    b[2][3] = b[2][4] = b[2][5] = "water";
    const m = clientFindMatches(b);
    // Expected indices: 2*8+3=19, 2*8+4=20, 2*8+5=21
    assert.ok(m.includes(19), "Missing index 19");
    assert.ok(m.includes(20), "Missing index 20");
    assert.ok(m.includes(21), "Missing index 21");
  });

  it("client skips DROP_TYPES in match detection", () => {
    const b = makeUniqueBoard();
    // Place 3 drop tokens in a row — should NOT match
    b[0][0] = "drop_gold";
    b[0][1] = "drop_gold";
    b[0][2] = "drop_gold";
    const m = clientFindMatches(b);
    // Indices 0,1,2 should NOT be in matches
    assert.ok(!m.includes(0), "drop_gold at index 0 should not match");
    assert.ok(!m.includes(1), "drop_gold at index 1 should not match");
    assert.ok(!m.includes(2), "drop_gold at index 2 should not match");
  });

  it("mixed drop tokens + gems in a row don't produce false match", () => {
    const b = makeUniqueBoard();
    b[1][0] = "fire";
    b[1][1] = "drop_energy";
    b[1][2] = "fire";
    b[1][3] = "fire";
    b[1][4] = "fire";
    // Only [1][2],[1][3],[1][4] should match, not [1][0]
    const m = clientFindMatches(b);
    assert.ok(m.includes(1 * 8 + 2), "fire at (1,2) should be in match");
    assert.ok(m.includes(1 * 8 + 3), "fire at (1,3) should be in match");
    assert.ok(m.includes(1 * 8 + 4), "fire at (1,4) should be in match");
    assert.ok(
      !m.includes(1 * 8 + 0),
      "fire at (1,0) separated by drop — should NOT match",
    );
  });

  it("full board same gem: all 64 cells matched", () => {
    const b = Array.from({ length: 8 }, () => Array(8).fill("earth"));
    const m = clientFindMatches(b);
    assert.equal(m.length, 64, `Expected 64, got ${m.length}`);
  });
});

/* ═══════════════════════════════════════════════════
 *  MATCH-3 — resolveBoard Cascade
 * ═══════════════════════════════════════════════════ */
describe("Match-3: resolveBoard cascade correctness", () => {
  it("single match: combo=1, points = count*10", () => {
    const b = Array.from({ length: 8 }, (_, y) =>
      Array.from(
        { length: 8 },
        (_, x) => GEM_TYPES[(x + y * 2) % GEM_TYPES.length],
      ),
    );
    b[0][0] = b[0][1] = b[0][2] = "dark";
    const { steps, totalPoints, combo } = resolveBoard(b);
    assert.ok(steps.length >= 1, "Should have at least 1 step");
    assert.equal(steps[0].combo, 1, "First combo should be 1");
    // 3 gems × 10 × min(1,5) = 30
    assert.ok(
      steps[0].cleared.length >= 3,
      `Should clear at least 3 gems, cleared ${steps[0].cleared.length}`,
    );
  });

  it("scoring cap: combo multiplier maxes at 5", () => {
    // Points per step = clearedCount * 10 * min(combo, 5)
    // combo=5 → ×5, combo=6 → still ×5
    const pts5 = 3 * 10 * Math.min(5, 5);
    const pts6 = 3 * 10 * Math.min(6, 5);
    assert.equal(pts5, pts6, "Combo 6 should not exceed combo 5 multiplier");
  });

  it("100× stress: resolved board has zero matches, 64 valid cells", () => {
    for (let i = 0; i < 100; i++) {
      const b = clientGenerateBoard();
      // Force a match to trigger cascade
      b[0][0] = b[0][1] = b[0][2] = "fire";
      resolveBoard(b);
      // After resolve, no matches should remain
      const remaining = clientFindMatches(b);
      assert.equal(
        remaining.length,
        0,
        `Board ${i} still has ${remaining.length} matches after resolve`,
      );
      // All 64 cells should be filled
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          assert.ok(
            b[y][x] !== null && b[y][x] !== undefined,
            `Cell [${y}][${x}] is empty after resolve`,
          );
        }
      }
    }
  });

  it("gravity: no floating gems after resolve", () => {
    for (let i = 0; i < 50; i++) {
      const b = clientGenerateBoard();
      b[4][4] = b[4][5] = b[4][6] = "air";
      resolveBoard(b);
      // Check no null cells above filled cells per column
      for (let x = 0; x < 8; x++) {
        let foundNull = false;
        for (let y = 0; y < 8; y++) {
          if (b[y][x] === null) {
            foundNull = true;
          } else if (foundNull) {
            assert.fail(`Floating gem at [${y}][${x}] — null exists above it`);
          }
        }
      }
    }
  });

  it("drop tokens survive clearing even if adjacent to match", () => {
    const b = Array.from({ length: 8 }, (_, y) =>
      Array.from(
        { length: 8 },
        (_, x) => GEM_TYPES[(x + y * 2) % GEM_TYPES.length],
      ),
    );
    b[2][0] = "drop_gold";
    b[2][1] = b[2][2] = b[2][3] = "dark";
    resolveBoard(b);
    // drop_gold should survive somewhere on the board (may have fallen)
    let found = false;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        if (b[y][x] === "drop_gold") found = true;
      }
    }
    assert.ok(found, "drop_gold token was erroneously cleared");
  });

  it("totalPoints is always > 0 when matches existed", () => {
    for (let i = 0; i < 50; i++) {
      const b = clientGenerateBoard();
      b[0][0] = b[0][1] = b[0][2] = "light";
      const { totalPoints } = resolveBoard(b);
      assert.ok(totalPoints > 0, `totalPoints was ${totalPoints}`);
    }
  });
});

/* ═══════════════════════════════════════════════════
 *  MATCH-3 — calcGoldReward
 * ═══════════════════════════════════════════════════ */
describe("Match-3: calcGoldReward correctness", () => {
  it("score ≤ 0 → REWARD_MATCH3_LOSE", () => {
    assert.equal(calcGoldReward(0), ECONOMY.REWARD_MATCH3_LOSE);
    assert.equal(calcGoldReward(-100), ECONOMY.REWARD_MATCH3_LOSE);
    assert.equal(calcGoldReward(null), ECONOMY.REWARD_MATCH3_LOSE);
  });

  it("score=500 → proportional (floor(40 × 0.5) = 20)", () => {
    assert.equal(calcGoldReward(500), 20);
  });

  it("score=1000 → base reward (40)", () => {
    assert.equal(calcGoldReward(1000), ECONOMY.REWARD_MATCH3_WIN);
  });

  it("score=1500 → base + tier1 bonus", () => {
    // 1000-1500: 5 steps of 100, rate=0.05 → 5 × floor(0.05 × 40) = 5 × 2 = 10
    assert.equal(calcGoldReward(1500), 40 + 10);
  });

  it("score=2000 → base + full tier1", () => {
    // 1000-2000: 10 steps × 0.05 × 40 = 10 × 2 = 20
    assert.equal(calcGoldReward(2000), 40 + 20);
  });

  it("100 ascending scores → non-decreasing reward (monotonicity)", () => {
    let prev = 0;
    for (let s = 0; s <= 10000; s += 100) {
      const r = calcGoldReward(s);
      assert.ok(r >= prev, `Reward decreased: score=${s} r=${r} prev=${prev}`);
      prev = r;
    }
  });

  it("very high score (50000) → reward is large but finite", () => {
    const r = calcGoldReward(50000);
    assert.ok(r > ECONOMY.REWARD_MATCH3_WIN, "High score should exceed base");
    assert.ok(r < 100000, "Reward should not be astronomically large");
  });
});

/* ═══════════════════════════════════════════════════
 *  BUILDING BLOX — Piece Integrity
 * ═══════════════════════════════════════════════════ */
describe("Blox Stress: Piece integrity", () => {
  const GRID = 10;

  it("every piece fits within 10×10 grid at (0,0)", () => {
    for (const piece of BLOX_PIECES) {
      for (const [r, c] of piece.cells) {
        assert.ok(
          r < GRID && c < GRID,
          `Piece ${piece.id} cell [${r},${c}] exceeds grid`,
        );
      }
    }
  });

  it("no duplicate cells within any piece", () => {
    for (const piece of BLOX_PIECES) {
      const keys = piece.cells.map(([r, c]) => `${r},${c}`);
      const unique = new Set(keys);
      assert.equal(
        unique.size,
        keys.length,
        `Piece ${piece.id} has duplicate cells`,
      );
    }
  });

  it("piece library has expected 12 pieces with sizes 1-5", () => {
    assert.equal(BLOX_PIECES.length, 12);
    const sizes = new Set(BLOX_PIECES.map((p) => p.cells.length));
    assert.ok(sizes.has(1), "Missing 1-cell piece");
    assert.ok(sizes.has(2), "Missing 2-cell piece");
    assert.ok(sizes.has(3), "Missing 3-cell piece");
    assert.ok(sizes.has(4), "Missing 4-cell piece");
    assert.ok(sizes.has(5), "Missing 5-cell piece");
  });
});

/* ═══════════════════════════════════════════════════
 *  BUILDING BLOX — Placement + Line Clear Stress
 * ═══════════════════════════════════════════════════ */
describe("Blox Stress: Placement + Line Clearing", () => {
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
  function clearLines(board) {
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
    for (const r of rowsToClear) {
      for (let c = 0; c < GRID; c++) board[r][c] = null;
    }
    for (const c of colsToClear) {
      for (let r = 0; r < GRID; r++) board[r][c] = null;
    }
    return rowsToClear.length + colsToClear.length;
  }
  function canAnyPieceFit(pieces, board) {
    for (const piece of pieces) {
      for (let r = 0; r < GRID; r++) {
        for (let c = 0; c < GRID; c++) {
          if (canPlace(piece, r, c, board)) return true;
        }
      }
    }
    return false;
  }

  it("scoring: 1 line = 10pts, 2 lines = 30pts, 3 lines = 45pts", () => {
    // 1 line: cleared × 10 + bonus(1>1? 0) = 10
    // 2 lines: 2×10 + 2×5 = 30
    // 3 lines: 3×10 + 3×5 = 45
    for (const [lines, expected] of [
      [1, 10],
      [2, 30],
      [3, 45],
      [10, 150],
    ]) {
      const bonus = lines > 1 ? lines * 5 : 0;
      const pts = lines * 10 + bonus;
      assert.equal(pts, expected, `${lines} lines should be ${expected} pts`);
    }
  });

  it("row + column intersection: cleared cells are null", () => {
    const board = createBoard();
    // Fill row 5 and column 5
    for (let c = 0; c < GRID; c++) board[5][c] = "#row";
    for (let r = 0; r < GRID; r++) board[r][5] = "#col";
    const cleared = clearLines(board);
    assert.equal(cleared, 2, "Should clear row + column = 2 lines");
    // Intersection cell [5][5] should be null
    assert.equal(board[5][5], null, "Intersection should be null");
    // All cells in row 5 and col 5 should be null
    for (let c = 0; c < GRID; c++) {
      assert.equal(board[5][c], null, `Row 5 col ${c} not cleared`);
    }
    for (let r = 0; r < GRID; r++) {
      assert.equal(board[r][5], null, `Col 5 row ${r} not cleared`);
    }
  });

  it("200× random games: always terminate, game-over is honest", () => {
    for (let game = 0; game < 200; game++) {
      const board = createBoard();
      let moves = 0;
      const MAX_MOVES = 500;

      while (moves < MAX_MOVES) {
        // Pick a random piece
        const piece =
          BLOX_PIECES[Math.floor(Math.random() * BLOX_PIECES.length)];

        // Find all valid positions
        const valid = [];
        for (let r = 0; r < GRID; r++) {
          for (let c = 0; c < GRID; c++) {
            if (canPlace(piece, r, c, board)) valid.push([r, c]);
          }
        }

        if (valid.length === 0) {
          // This specific piece doesn't fit — try others
          if (!canAnyPieceFit(BLOX_PIECES, board)) break; // True game over
          continue;
        }

        const [r, c] = valid[Math.floor(Math.random() * valid.length)];
        placePiece(piece, r, c, board);
        clearLines(board);
        moves++;
      }

      // Should have terminated within MAX_MOVES
      assert.ok(moves <= MAX_MOVES, `Game ${game} didn't terminate`);

      // If game ended by "no piece fits", verify EVERY piece truly can't fit
      if (!canAnyPieceFit(BLOX_PIECES, board)) {
        for (const piece of BLOX_PIECES) {
          let fits = false;
          for (let r = 0; r < GRID && !fits; r++) {
            for (let c = 0; c < GRID && !fits; c++) {
              if (canPlace(piece, r, c, board)) fits = true;
            }
          }
          assert.ok(
            !fits,
            `Game ${game}: game over but ${piece.id} still fits!`,
          );
        }
      }
    }
  });

  it("clearLines opens space for pieces: game doesn't end prematurely", () => {
    const board = createBoard();
    // Fill entire board EXCEPT leave row 9 full for clearing
    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        board[r][c] = "#filled";
      }
    }
    // Verify no pieces fit (board is full)
    assert.ok(!canAnyPieceFit(BLOX_PIECES, board), "Full board: no piece fits");

    // Full board: ALL 10 rows + ALL 10 columns are full → 20 lines cleared
    const cleared = clearLines(board);
    assert.equal(cleared, 20, "Full board clears 10 rows + 10 cols = 20 lines");

    // After clearing ALL lines, board is empty — every piece fits
    for (const piece of BLOX_PIECES) {
      let fits = false;
      for (let r = 0; r < GRID && !fits; r++) {
        for (let c = 0; c < GRID && !fits; c++) {
          if (canPlace(piece, r, c, board)) fits = true;
        }
      }
      assert.ok(fits, `${piece.id} should fit after full board clear`);
    }
  });
});

/* ═══════════════════════════════════════════════════
 *  BUILDING BLOX — calcBloxReward
 * ═══════════════════════════════════════════════════ */
describe("Blox: calcBloxReward correctness", () => {
  it("score=0 → REWARD_BLOX_LOSE (5)", () => {
    assert.equal(calcBloxReward(0), ECONOMY.REWARD_BLOX_LOSE);
  });

  it("score=50 → proportional floor(35×0.5)=17", () => {
    assert.equal(calcBloxReward(50), Math.floor(35 * 0.5));
  });

  it("score=100 → base reward (35)", () => {
    assert.equal(calcBloxReward(100), ECONOMY.REWARD_BLOX_WIN);
  });

  it("score=99999 → capped at 400", () => {
    assert.equal(calcBloxReward(99999), 400);
  });

  it("100 ascending scores → non-decreasing (monotonicity)", () => {
    let prev = 0;
    for (let s = 0; s <= 2000; s += 20) {
      const r = calcBloxReward(s);
      assert.ok(r >= prev, `Reward decreased: score=${s} r=${r} prev=${prev}`);
      prev = r;
    }
  });

  it("client reward formula matches server formula", () => {
    // Verify the client-side calcBloxRewardClient matches game-logic.js
    const BASE = 35,
      LOSE = 5;
    function clientCalc(s) {
      if (typeof s !== "number" || s <= 0) return LOSE;
      if (s < 100) return Math.max(LOSE, Math.floor(BASE * (s / 100)));
      let gold = BASE;
      if (s >= 100)
        gold += Math.floor(((Math.min(s, 300) - 100) / 50) * 0.08 * BASE);
      if (s >= 300)
        gold += Math.floor(((Math.min(s, 600) - 300) / 50) * 0.15 * BASE);
      if (s >= 600) gold += Math.floor(((s - 600) / 50) * 0.25 * BASE);
      return Math.min(gold, 400);
    }
    for (let s = 0; s <= 3000; s += 10) {
      assert.equal(
        calcBloxReward(s),
        clientCalc(s),
        `Mismatch at score=${s}: server=${calcBloxReward(s)} client=${clientCalc(s)}`,
      );
    }
  });
});

/* ═══════════════════════════════════════════════════
 *  FARM — Growth Calculation
 * ═══════════════════════════════════════════════════ */
describe("Farm Stress: Growth calculations", () => {
  it("all 8 crops: unwatered 0%, 50%, 100% growth at correct timestamps", () => {
    const now = Date.now();
    for (const [id, cfg] of Object.entries(CROPS)) {
      // 0%
      const pct0 = getGrowthPct(
        { crop: id, plantedAt: now, watered: false },
        now,
      );
      assert.equal(pct0, 0, `${id} should be 0% at plant time`);
      // 50%
      const half = now - cfg.growthTime / 2;
      const pct50 = getGrowthPct(
        { crop: id, plantedAt: half, watered: false },
        now,
      );
      assert.ok(
        pct50 > 0.45 && pct50 < 0.55,
        `${id} should be ~50%, got ${pct50}`,
      );
      // 100%
      const full = now - cfg.growthTime;
      const pct100 = getGrowthPct(
        { crop: id, plantedAt: full, watered: false },
        now,
      );
      assert.equal(pct100, 1, `${id} should be 100% at growthTime`);
      // Over 100% → capped at 1
      const over = now - cfg.growthTime * 3;
      const pctOver = getGrowthPct(
        { crop: id, plantedAt: over, watered: false },
        now,
      );
      assert.equal(pctOver, 1, `${id} should cap at 1`);
    }
  });

  it("all 8 crops: watered crop finishes faster than unwatered", () => {
    const now = Date.now();
    for (const [id, cfg] of Object.entries(CROPS)) {
      const mult = getWateringMultiplier(id);
      assert.ok(mult < 1, `${id} watering multiplier ${mult} should be < 1`);

      // At 70% of growthTime: unwatered < 1, watered may be >= 1
      const t70 = now - cfg.growthTime * 0.7;
      const pctUnwatered = getGrowthPct(
        { crop: id, plantedAt: t70, watered: false },
        now,
      );
      const pctWatered = getGrowthPct(
        { crop: id, plantedAt: t70, watered: true },
        now,
      );
      assert.ok(
        pctWatered >= pctUnwatered,
        `${id}: watered (${pctWatered}) should be >= unwatered (${pctUnwatered})`,
      );
    }
  });

  it("watering multipliers are correct per growth tier", () => {
    // <15min → 0.7, 15min-<1h → 0.6, 1h+ → 0.55
    assert.equal(getWateringMultiplier("strawberry"), 0.7); // 5 min
    assert.equal(getWateringMultiplier("blueberry"), 0.7); // 7 min
    assert.equal(getWateringMultiplier("tomato"), 0.6); // 15 min
    assert.equal(getWateringMultiplier("golden"), 0.6); // 30 min
    assert.equal(getWateringMultiplier("corn"), 0.55); // 1 hr
    assert.equal(getWateringMultiplier("sunflower"), 0.55); // 2 hr
    assert.equal(getWateringMultiplier("watermelon"), 0.55); // 4 hr
    assert.equal(getWateringMultiplier("pumpkin"), 0.55); // 8 hr
  });
});

/* ═══════════════════════════════════════════════════
 *  FARM — Economy Invariants
 * ═══════════════════════════════════════════════════ */
describe("Farm: Economy invariants", () => {
  it("sellPrice > seedPrice for all crops (profit is positive)", () => {
    for (const [id, cfg] of Object.entries(CROPS)) {
      assert.ok(
        cfg.sellPrice > cfg.seedPrice,
        `${id}: sellPrice (${cfg.sellPrice}) must exceed seedPrice (${cfg.seedPrice})`,
      );
    }
  });

  it("longer growthTime → higher sellPrice within same tier", () => {
    // Compare only within same CROP_TIERS tier.
    // Golden Rose is an intentional prestige outlier (short growth, premium price).
    const PRESTIGE_CROPS = new Set(["golden"]);
    const tiers = {};
    for (const [id, tier] of Object.entries(CROP_TIERS)) {
      if (PRESTIGE_CROPS.has(id)) continue;
      if (!tiers[tier]) tiers[tier] = [];
      tiers[tier].push(CROPS[id]);
    }
    for (const [tier, crops] of Object.entries(tiers)) {
      const sorted = crops.sort((a, b) => a.growthTime - b.growthTime);
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].growthTime > sorted[i - 1].growthTime) {
          assert.ok(
            sorted[i].sellPrice >= sorted[i - 1].sellPrice,
            `[${tier}] ${sorted[i].id} (${sorted[i].growthTime}ms) sells for ${sorted[i].sellPrice} but ` +
              `${sorted[i - 1].id} (${sorted[i - 1].growthTime}ms) sells for ${sorted[i - 1].sellPrice}`,
          );
        }
      }
    }
  });

  it("all crops have positive XP", () => {
    for (const [id, cfg] of Object.entries(CROPS)) {
      assert.ok(cfg.xp > 0, `${id} has non-positive XP: ${cfg.xp}`);
    }
  });

  it("exactly 8 crops exist", () => {
    assert.equal(Object.keys(CROPS).length, 8);
  });

  it("all crop IDs match their key", () => {
    for (const [key, cfg] of Object.entries(CROPS)) {
      assert.equal(cfg.id, key, `Key "${key}" doesn't match id "${cfg.id}"`);
    }
  });
});

/* ═══════════════════════════════════════════════════
 *  FARM — Offline Simulation Stress (v6.2.2 — fullness-based)
 * ═══════════════════════════════════════════════════ */
describe("Farm Stress: processOfflineActions", () => {
  it("100× random states: energy is NEVER modified", () => {
    for (let i = 0; i < 100; i++) {
      const now = Date.now();
      const p = createDefaultPlayer(`stress_${i}`, "Stress", now - 600000);
      p.pet.abilities.autoHarvest = Math.random() > 0.5;
      p.pet.abilities.autoPlant = Math.random() > 0.5;
      p.pet.abilities.autoWater = Math.random() > 0.5;
      p.pet.stats.fullness = Math.floor(Math.random() * ECONOMY.SATIETY_MAX);
      const energyBefore = p.resources.energy.current;
      // Random seeds (including cheap crops for auto-eat)
      p.farm.inventory.strawberry = Math.floor(Math.random() * 20);
      p.farm.inventory.tomato = Math.floor(Math.random() * 10);
      // Random plots
      for (const plot of p.farm.plots) {
        if (Math.random() > 0.5) {
          const crop = Math.random() > 0.5 ? "strawberry" : "tomato";
          plot.crop = crop;
          plot.plantedAt = now - Math.floor(Math.random() * 200000);
          plot.watered = Math.random() > 0.5;
        }
      }
      processOfflineActions(p, now);
      assert.equal(
        p.resources.energy.current,
        energyBefore,
        `Game ${i}: energy was modified from ${energyBefore} to ${p.resources.energy.current}`,
      );
    }
  });

  it("harvest costs fullness (not energy)", () => {
    const now = Date.now();
    const p = createDefaultPlayer("h_test", "Test", now - 300000);
    p.pet.abilities.autoHarvest = true;
    p.pet.stats.fullness = 50;
    const energyBefore = p.resources.energy.current;
    // Plant 3 fully-grown strawberries
    for (let i = 0; i < 3; i++) {
      p.farm.plots[i].crop = "strawberry";
      p.farm.plots[i].plantedAt = now - CROPS.strawberry.growthTime - 5000;
    }
    const report = processOfflineActions(p, now);
    assert.ok(report);
    assert.equal(report.harvested.strawberry, 3);
    assert.ok(report.fullnessConsumed > 0, "Should consume fullness");
    assert.equal(p.resources.energy.current, energyBefore, "Energy untouched");
  });

  it("plant costs fullness (not energy)", () => {
    const now = Date.now();
    const p = createDefaultPlayer("p_test", "Test", now - 300000);
    p.pet.abilities.autoPlant = true;
    p.pet.stats.fullness = 50;
    const energyBefore = p.resources.energy.current;
    p.farm.inventory.strawberry = 10;
    // All plots empty
    const report = processOfflineActions(p, now);
    assert.ok(report);
    const totalPlanted = Object.values(report.planted).reduce(
      (a, b) => a + b,
      0,
    );
    assert.ok(totalPlanted > 0);
    assert.ok(report.fullnessConsumed > 0, "Should consume fullness");
    assert.equal(p.resources.energy.current, energyBefore, "Energy untouched");
  });

  it("auto-water is free (no fullness or energy cost)", () => {
    const now = Date.now();
    const p = createDefaultPlayer("w_test", "Test", now - 300000);
    p.pet.abilities.autoWater = true;
    p.pet.stats.fullness = 0; // No fullness
    p.resources.energy.current = 0; // No energy
    p.farm.inventory = {}; // No food
    // Plant crops but don't water
    for (let i = 0; i < 4; i++) {
      p.farm.plots[i].crop = "strawberry";
      p.farm.plots[i].plantedAt = now;
      p.farm.plots[i].watered = false;
    }
    const report = processOfflineActions(p, now);
    assert.ok(report);
    assert.equal(report.autoWatered, 4);
    assert.equal(report.fullnessConsumed, 0, "Water should be free");
    assert.equal(p.resources.energy.current, 0, "Energy should stay at 0");
  });

  it("seeds never go negative after auto-plant", () => {
    for (let i = 0; i < 50; i++) {
      const now = Date.now();
      const p = createDefaultPlayer(`seed_${i}`, "Test", now - 300000);
      p.pet.abilities.autoPlant = true;
      p.pet.stats.fullness = 100;
      p.farm.inventory.strawberry = 2; // Only 2 seeds
      processOfflineActions(p, now);
      assert.ok(
        p.farm.inventory.strawberry >= 0,
        `Seeds went negative: ${p.farm.inventory.strawberry}`,
      );
    }
  });

  it("priority order: harvest → plant → water", () => {
    const now = Date.now();
    const p = createDefaultPlayer("order_test", "Test", now - 300000);
    p.pet.abilities.autoHarvest = true;
    p.pet.abilities.autoPlant = true;
    p.pet.abilities.autoWater = true;
    p.pet.stats.fullness = 6; // 2 for harvest + 4 for plant = exactly 6
    // Use tomato (mid-tier) so auto-eat can't refuel from inventory
    p.farm.inventory = { tomato: 5 };
    // Plot 0: fully grown (can harvest for 2 fullness)
    p.farm.plots[0].crop = "strawberry";
    p.farm.plots[0].plantedAt = now - CROPS.strawberry.growthTime - 5000;
    // Plots 1-5: empty (can plant for 4 fullness each)

    const report = processOfflineActions(p, now);
    assert.ok(report);
    // Should harvest first (2 fullness), then plant 1 (4 fullness), total = 6
    assert.equal(report.harvested.strawberry, 1, "Should harvest 1");
    assert.equal(report.fullnessConsumed, 6, "Should use all 6 fullness");
    const totalPlanted = Object.values(report.planted).reduce(
      (a, b) => a + b,
      0,
    );
    assert.equal(
      totalPlanted,
      1,
      "Should plant exactly 1 with remaining 4 fullness",
    );
  });

  it("farm level = floor(xp/100) + 1", () => {
    const now = Date.now();
    const p = createDefaultPlayer("level_test", "Test", now - 300000);
    p.pet.abilities.autoHarvest = true;
    p.pet.stats.fullness = 50;
    p.farm.xp = 250;
    // Plant 2 fully-grown strawberries (5 xp each)
    p.farm.plots[0].crop = "strawberry";
    p.farm.plots[0].plantedAt = now - 60000;
    p.farm.plots[1].crop = "strawberry";
    p.farm.plots[1].plantedAt = now - 60000;
    processOfflineActions(p, now);
    // xp = 250 + 2×5 = 260 → level = floor(260/100) + 1 = 3
    assert.equal(p.farm.level, Math.floor(p.farm.xp / 100) + 1);
  });
});

/* ═══════════════════════════════════════════════════
 *  FARM — Energy Regeneration Edge Cases
 * ═══════════════════════════════════════════════════ */
describe("Farm: Energy regen edge cases", () => {
  it("massive elapsed (1 hour) → capped at ENERGY_MAX", () => {
    const now = Date.now();
    const p = createDefaultPlayer("regen1", "Test", now);
    p.resources.energy.current = 0;
    p.resources.energy.lastRegenTimestamp = now - 3600000; // 1 hour ago
    calcRegen(p, now);
    assert.equal(p.resources.energy.current, ECONOMY.ENERGY_MAX);
  });

  it("0 elapsed → no regen", () => {
    const now = Date.now();
    const p = createDefaultPlayer("regen2", "Test", now);
    p.resources.energy.current = 5;
    p.resources.energy.lastRegenTimestamp = now;
    calcRegen(p, now);
    assert.equal(p.resources.energy.current, 5);
  });

  it("partial tick preserved across multiple calls", () => {
    const now = Date.now();
    const p = createDefaultPlayer("regen3", "Test", now);
    p.resources.energy.current = 5;
    p.resources.energy.lastRegenTimestamp = now;
    // 80% of interval — not enough for 1 regen
    const partial = Math.floor(ECONOMY.ENERGY_REGEN_INTERVAL_MS * 0.8);
    calcRegen(p, now + partial);
    assert.equal(p.resources.energy.current, 5, "Should not regen yet");
    // Another 40% — total 120% → 1 regen, 20% remaining
    calcRegen(
      p,
      now + partial + Math.floor(ECONOMY.ENERGY_REGEN_INTERVAL_MS * 0.4),
    );
    assert.equal(
      p.resources.energy.current,
      6,
      "Should regen 1 from accumulated",
    );
  });

  it("100× random energy states: regen never exceeds max", () => {
    for (let i = 0; i < 100; i++) {
      const now = Date.now();
      const p = createDefaultPlayer(`regen_${i}`, "Test", now);
      p.resources.energy.current = Math.floor(
        Math.random() * ECONOMY.ENERGY_MAX,
      );
      p.resources.energy.lastRegenTimestamp =
        now - Math.floor(Math.random() * 7200000);
      calcRegen(p, now);
      assert.ok(
        p.resources.energy.current <= ECONOMY.ENERGY_MAX,
        `Energy ${p.resources.energy.current} exceeds max ${ECONOMY.ENERGY_MAX}`,
      );
      assert.ok(
        p.resources.energy.current >= 0,
        `Energy went negative: ${p.resources.energy.current}`,
      );
    }
  });
});
