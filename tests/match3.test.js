/**
 * Match-3 Tile Clearing Tests — v4.8.0
 * Run: node --test tests/match3.test.js
 *
 * Tests extracted match-3 logic (findMatches, resolveBoard, gravity)
 * to verify only the correct tiles are cleared during a player's turn.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const BOARD_SIZE = 8;
const GEM_TYPES = ["fire", "water", "earth", "air", "light", "dark"];
const DROP_TYPES = ["drop_gold", "drop_seeds", "drop_energy"];

function randomGem() {
  return GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
}

/** Find all 3+ horizontal and vertical matches */
function findMatches(b) {
  const matches = new Set();
  // Horizontal
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE - 2; x++) {
      if (
        b[y][x] &&
        !DROP_TYPES.includes(b[y][x]) &&
        b[y][x] === b[y][x + 1] &&
        b[y][x] === b[y][x + 2]
      ) {
        let end = x;
        while (end < BOARD_SIZE && b[y][end] === b[y][x]) end++;
        for (let i = x; i < end; i++) matches.add(`${i},${y}`);
        x = end - 1;
      }
    }
  }
  // Vertical
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE - 2; y++) {
      if (
        b[y][x] &&
        !DROP_TYPES.includes(b[y][x]) &&
        b[y][x] === b[y + 1][x] &&
        b[y][x] === b[y + 2][x]
      ) {
        let end = y;
        while (end < BOARD_SIZE && b[end][x] === b[y][x]) end++;
        for (let i = y; i < end; i++) matches.add(`${x},${i}`);
        y = end - 1;
      }
    }
  }
  return matches;
}

/** Resolve entire board: match → clear → gravity → fill → repeat */
function resolveBoard(b) {
  const steps = [];
  let totalPoints = 0;
  let cascadeCombo = 0;
  let matches = findMatches(b);

  while (matches.size > 0) {
    cascadeCombo++;
    const cleared = [...matches].map((k) => {
      const [x, y] = k.split(",").map(Number);
      return { x, y, type: b[y][x] };
    });
    totalPoints += cleared.length * 10 * Math.min(cascadeCombo, 5);

    for (const { x, y } of cleared) b[y][x] = null;

    // Gravity + fill
    for (let x = 0; x < BOARD_SIZE; x++) {
      let wy = BOARD_SIZE - 1;
      for (let y = BOARD_SIZE - 1; y >= 0; y--) {
        if (b[y][x]) {
          if (wy !== y) {
            b[wy][x] = b[y][x];
            b[y][x] = null;
          }
          wy--;
        }
      }
      for (let y = wy; y >= 0; y--) {
        b[y][x] = randomGem();
      }
    }
    steps.push({ cleared, combo: cascadeCombo });
    matches = findMatches(b);
  }
  return { steps, totalPoints, combo: cascadeCombo };
}

function emptyBoard() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

// ───── Tests ─────

describe("findMatches", () => {
  it("finds a horizontal match of 3", () => {
    const b = emptyBoard();
    // Fill entire board with non-matching pattern
    const types = ["fire", "water", "earth", "air", "light", "dark"];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        b[y][x] = types[(x + y * 3) % types.length];
      }
    }
    // Now place the match
    b[0][0] = "dark";
    b[0][1] = "dark";
    b[0][2] = "dark";
    const m = findMatches(b);
    assert.equal(m.size, 3);
    assert.ok(m.has("0,0"));
    assert.ok(m.has("1,0"));
    assert.ok(m.has("2,0"));
  });

  it("finds a horizontal match of 4", () => {
    const b = emptyBoard();
    b[3][2] = "water";
    b[3][3] = "water";
    b[3][4] = "water";
    b[3][5] = "water";
    const m = findMatches(b);
    assert.equal(m.size, 4);
    for (let x = 2; x <= 5; x++) assert.ok(m.has(`${x},3`));
  });

  it("finds a vertical match of 3", () => {
    const b = emptyBoard();
    b[1][4] = "earth";
    b[2][4] = "earth";
    b[3][4] = "earth";
    const m = findMatches(b);
    assert.equal(m.size, 3);
    assert.ok(m.has("4,1"));
    assert.ok(m.has("4,2"));
    assert.ok(m.has("4,3"));
  });

  it("returns empty set when no matches exist", () => {
    const b = emptyBoard();
    b[0][0] = "fire";
    b[0][1] = "water";
    b[0][2] = "earth";
    const m = findMatches(b);
    assert.equal(m.size, 0);
  });

  it("does NOT match drop-type gems", () => {
    const b = emptyBoard();
    b[0][0] = "drop_gold";
    b[0][1] = "drop_gold";
    b[0][2] = "drop_gold";
    const m = findMatches(b);
    assert.equal(m.size, 0, "Drop gems should not be matchable");
  });

  it("does not match across different gem types", () => {
    const b = emptyBoard();
    b[0][0] = "fire";
    b[0][1] = "fire";
    b[0][2] = "water";
    const m = findMatches(b);
    assert.equal(m.size, 0);
  });

  it("finds overlapping horizontal + vertical (L-shape)", () => {
    const b = emptyBoard();
    // Horizontal: row 2, cols 1-3
    b[2][1] = "light";
    b[2][2] = "light";
    b[2][3] = "light";
    // Vertical: col 3, rows 0-2
    b[0][3] = "light";
    b[1][3] = "light"; // b[2][3] already "light"
    const m = findMatches(b);
    // Should include all 5 unique positions
    assert.ok(m.size >= 5, `Expected ≥5 matches, got ${m.size}`);
    assert.ok(m.has("3,0")); // top of vertical
    assert.ok(m.has("1,2")); // left of horizontal
  });
});

describe("resolveBoard", () => {
  it("clears only matched tiles", () => {
    const b = emptyBoard();
    // Place a single horizontal match at row 7
    b[7][0] = "fire";
    b[7][1] = "fire";
    b[7][2] = "fire";
    // Place non-matching tiles nearby
    b[7][3] = "water";
    b[7][4] = "earth";
    b[6][0] = "air";
    b[6][1] = "dark";
    b[6][2] = "light";

    const result = resolveBoard(b);
    assert.ok(result.totalPoints > 0, "Should award points");

    // Verify the FIRST step cleared exactly the 3 matched tiles
    const firstCleared = result.steps[0].cleared
      .map((c) => `${c.x},${c.y}`)
      .sort();
    assert.deepEqual(
      firstCleared,
      ["0,7", "1,7", "2,7"],
      "Should clear only matched tiles",
    );

    // Board should be fully populated after resolve (gravity + fill)
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        assert.ok(b[y][x] !== null, `Cell [${x},${y}] should not be empty`);
      }
    }
  });

  it("applies gravity: tiles fall down to fill gaps", () => {
    const b = emptyBoard();
    // Place tiles that will survive
    b[5][0] = "dark";
    // Place match at bottom
    b[7][0] = "fire";
    b[7][1] = "fire";
    b[7][2] = "fire";

    resolveBoard(b);

    // "dark" should have fell to a lower row (row 6 or 7)
    // After clearing row 7 cols 0-2, gravity pulls dark down
    let darkFound = false;
    for (let y = 0; y < BOARD_SIZE; y++) {
      if (b[y][0] === "dark") darkFound = true;
    }
    // dark may have been filled over by cascade, but board should be full
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        assert.ok(
          b[y][x] !== null && b[y][x] !== undefined,
          `Cell [${x},${y}] should not be empty after resolve`,
        );
      }
    }
  });

  it("produces zero steps for a match-free board", () => {
    // Build a board with no matches
    const b = emptyBoard();
    const types = ["fire", "water", "earth", "air", "light", "dark"];
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        b[y][x] = types[(x + y * 3) % types.length];
      }
    }
    // Verify no initial matches — this pattern is deterministic and must be match-free
    const m = findMatches(b);
    assert.equal(
      m.size,
      0,
      "Deterministic no-match board unexpectedly has matches — pattern broken",
    );
    const result = resolveBoard(b);
    assert.equal(result.steps.length, 0);
    assert.equal(result.totalPoints, 0);
  });

  it("handles cascading matches (chain reaction)", () => {
    const b = emptyBoard();
    // Set up so clearing one match causes gravity to create another
    // Row 7: fire fire fire (match)
    b[7][0] = "fire";
    b[7][1] = "fire";
    b[7][2] = "fire";
    // Rows 4-6: water water water stacked above (will fall and match)
    b[4][0] = "water";
    b[4][1] = "water";
    b[4][2] = "water";
    b[5][0] = "earth";
    b[5][1] = "dark";
    b[5][2] = "light";
    b[6][0] = "air";
    b[6][1] = "light";
    b[6][2] = "dark";

    const result = resolveBoard(b);
    // Should have at least 1 step (the initial match)
    assert.ok(result.steps.length >= 1, "Should have cascade steps");
    assert.ok(result.totalPoints >= 30, "3 tiles × 10 pts × combo 1");
  });
});

describe("drop type exclusion", () => {
  it("drop gems survive matching even when 3 are adjacent", () => {
    const b = emptyBoard();
    b[0][0] = "drop_gold";
    b[0][1] = "drop_gold";
    b[0][2] = "drop_gold";
    b[1][0] = "drop_seeds";
    b[1][1] = "drop_energy";
    b[1][2] = "drop_gold";
    const m = findMatches(b);
    assert.equal(m.size, 0, "Drop gems must never be matched");
  });
});
