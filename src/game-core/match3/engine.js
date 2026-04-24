/* ═══════════════════════════════════════════════════
 *  Match-3 Engine — Pure Game Logic (v6.2.0)
 *  No DOM, no state — all functions are pure.
 *  Extracted from match3.js for clarity and testability.
 * ═══════════════════════════════════════════════════ */

// ─── Constants ───
export const GEM_TYPES = ["fire", "water", "earth", "air", "light", "dark"];
export const GEM_ICONS = {
  fire: "🔥",
  water: "💧",
  earth: "🌿",
  air: "💨",
  light: "⭐",
  dark: "🔮",
};
export const BOARD_SIZE = 8;

// Star-drop mode token types (excluded from matching)
export const DROP_TYPES = ["drop_gold", "drop_seeds", "drop_energy"];
export const DROP_ICONS = {
  drop_gold: "💰",
  drop_seeds: "🌾",
  drop_energy: "⚡",
};
export const DROP_LABELS = {
  drop_gold: "Gold Bag",
  drop_seeds: "Seed Pack",
  drop_energy: "Energy",
};

export const SPECIAL_TYPES = ["special_row", "special_column", "special_blast", "special_colour"];
export const SPECIAL_ICONS = {
  special_row: "↔",
  special_column: "↕",
  special_blast: "✦",
  special_colour: "✹",
};
export const SPECIAL_LABELS = {
  special_row: "Row Clear",
  special_column: "Column Clear",
  special_blast: "Blast",
  special_colour: "Colour Clear",
};

// ─── Progressive gold reward (mirrors game-logic.js calcGoldReward) ───
export const REWARD_BASE = 40;
const REWARD_LOSE = 5;

export function calcGoldReward(s) {
  if (typeof s !== "number" || s <= 0) return REWARD_LOSE;
  if (s < 1000)
    return Math.max(REWARD_LOSE, Math.floor(REWARD_BASE * (s / 1000)));
  let gold = REWARD_BASE;
  const tiers = [
    { min: 1000, max: 1999, r: 0.05 },
    { min: 2000, max: 2999, r: 0.1 },
    { min: 3000, max: 3999, r: 0.2 },
  ];
  for (const t of tiers) {
    if (s < t.min) break;
    gold += Math.floor(
      Math.floor((Math.min(s, t.max + 1) - t.min) / 100) * t.r * REWARD_BASE,
    );
  }
  if (s >= 4000) {
    let ts = 4000,
      rate = 0.4;
    while (ts <= s) {
      gold += Math.floor(
        Math.floor((Math.min(s, ts + 1000) - ts) / 100) * rate * REWARD_BASE,
      );
      ts += 1000;
      rate = Math.min(rate * 2, 2.0);
    }
  }
  return gold;
}

// ─── Clone helpers (v4.16: eliminate JSON.parse/stringify GC pressure) ───
export function cloneBoard(b) {
  return b.map((row) => [...row]);
}

export function cloneDropStars(ds) {
  return ds.map((s) => ({ ...s }));
}

// ─── persisted payload hydration helpers ───

// v7.3: Compact serialization — gem type to single-char mapping
const GEM_TO_CHAR = {
  fire: "F",
  water: "W",
  earth: "E",
  air: "A",
  light: "L",
  dark: "D",
  drop_gold: "G",
  drop_seeds: "S",
  drop_energy: "N",
  special_row: "R",
  special_column: "C",
  special_blast: "B",
  special_colour: "Q",
  "": ".",
};
const CHAR_TO_GEM = Object.fromEntries(
  Object.entries(GEM_TO_CHAR).map(([k, v]) => [v, k]),
);

/**
 * v7.3: Serialize a 2D board to a compact flat string (e.g. "FWEAD.WL...")
 * Reduces payload size compared to nested arrays/objects.
 */
export function serializeBoard(b) {
  if (!b || !Array.isArray(b)) return null;
  let s = "";
  for (let y = 0; y < b.length; y++) {
    for (let x = 0; x < b[y].length; x++) {
      s += GEM_TO_CHAR[b[y][x]] || ".";
    }
  }
  return s;
}

/**
 * v7.3: Deserialize a flat string back to a 2D board array.
 * @param {string} s - flat string of single-char gem codes
 * @param {number} size - board dimension (default: BOARD_SIZE)
 */
export function deserializeBoard(s, size = BOARD_SIZE) {
  if (typeof s !== "string") return null;
  const b = [];
  for (let y = 0; y < size; y++) {
    b[y] = [];
    for (let x = 0; x < size; x++) {
      const ch = s[y * size + x] || ".";
      b[y][x] = CHAR_TO_GEM[ch] || "";
    }
  }
  return b;
}

/** Convert 2D array-like objects back to arrays.
 *  v7.3: Also supports flat-string format for compact storage. */
export function hydrateBoard(b) {
  if (b == null) return null;
  // v7.3: flat-string format support (backwards-compatible)
  if (typeof b === "string") return deserializeBoard(b);
  if (Array.isArray(b)) return b;
  return Object.keys(b)
    .sort((a, c) => Number(a) - Number(c))
    .map((k) => {
      const row = b[k];
      return Array.isArray(row) ? row : Object.values(row);
    });
}

/** Convert array-like objects back to arrays. */
export function hydrateArray(a) {
  if (Array.isArray(a)) return a;
  if (a && typeof a === "object") return Object.values(a);
  return [];
}

/** Hydrate all boards and arrays inside a savedModes object. */
export function hydrateSavedModes(modes) {
  for (const mode of Object.keys(modes)) {
    const s = modes[mode];
    if (s && s.board) s.board = hydrateBoard(s.board);
    if (s && s.dropStars) s.dropStars = hydrateArray(s.dropStars);
  }
  return modes;
}

// ─── Core Engine ───

export function randomGem() {
  return GEM_TYPES[Math.floor(Math.random() * GEM_TYPES.length)];
}

export function randomDropToken() {
  return DROP_TYPES[Math.floor(Math.random() * DROP_TYPES.length)];
}

export function isDropToken(type) {
  return DROP_TYPES.includes(type);
}

export function isSpecialType(type) {
  return SPECIAL_TYPES.includes(type);
}

function isMatchableGem(type) {
  return !!type && !isDropToken(type) && !isSpecialType(type);
}

export function generateBoard() {
  const b = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    b[y] = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      let gem;
      do {
        gem = randomGem();
      } while (
        (x >= 2 && b[y][x - 1] === gem && b[y][x - 2] === gem) ||
        (y >= 2 && b[y - 1]?.[x] === gem && b[y - 2]?.[x] === gem)
      );
      b[y][x] = gem;
    }
  }

  return b;
}

// v7.3: Early-exit fast detector for `hasValidMoves`.
// Stops at the *first* match found instead of mapping the entire board.
export function hasAnyMatch(b) {
  // Horizontal
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE - 2; x++) {
      const type = b[y][x];
      if (!isMatchableGem(type)) continue;
      if (type === b[y][x + 1] && type === b[y][x + 2]) return true;
    }
  }
  // Vertical
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE - 2; y++) {
      const type = b[y][x];
      if (!isMatchableGem(type)) continue;
      if (type === b[y + 1][x] && type === b[y + 2][x]) return true;
    }
  }
  return false;
}

// PRE-ALLOCATED BUFFER FOR MATCH-3 (OPT 9)
// Eliminates allocation of Uint8Array every frame/cascade step.
const _matchBuffer = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
// Pre-allocated result array to avoid `new Array` allocs in tight loops if possible,
// but since we must return variable length arrays for the engine iterators,
// we just recycle the buffer and return a standard flat array.

export function findMatchGroups(b, dirtyMask = null) {
  const groups = [];

  for (let y = 0; y < BOARD_SIZE; y++) {
    if (dirtyMask && !dirtyMask.rows[y]) continue;

    for (let x = 0; x < BOARD_SIZE - 2; x++) {
      const type = b[y][x];
      if (!isMatchableGem(type)) continue;
      if (type === b[y][x + 1] && type === b[y][x + 2]) {
        let end = x + 3;
        while (end < BOARD_SIZE && b[y][end] === type) end++;
        const group = [];
        for (let k = x; k < end; k++) group.push(y * BOARD_SIZE + k);
        groups.push(group);
        x = end - 1;
      }
    }
  }

  for (let x = 0; x < BOARD_SIZE; x++) {
    if (dirtyMask && !dirtyMask.cols[x]) continue;

    for (let y = 0; y < BOARD_SIZE - 2; y++) {
      const type = b[y][x];
      if (!isMatchableGem(type)) continue;
      if (type === b[y + 1][x] && type === b[y + 2][x]) {
        let end = y + 3;
        while (end < BOARD_SIZE && b[end][x] === type) end++;
        const group = [];
        for (let k = y; k < end; k++) group.push(k * BOARD_SIZE + x);
        groups.push(group);
        y = end - 1;
      }
    }
  }

  return groups;
}

export function findMatches(b, dirtyMask = null) {
  _matchBuffer.fill(0);
  let count = 0;

  for (const group of findMatchGroups(b, dirtyMask)) {
    for (const idx of group) {
      if (_matchBuffer[idx] === 0) {
        _matchBuffer[idx] = 1;
        count++;
      }
    }
  }

  const result = [];
  if (count > 0) {
    const len = BOARD_SIZE * BOARD_SIZE;
    for (let i = 0; i < len; i++) {
      if (_matchBuffer[i] === 1) result.push(i);
    }
  }
  return result;
}

/** Check if board has any valid moves (prevents deadlocks) */
export function hasValidMoves(b) {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE - 1; x++) {
      if (b[y][x] === b[y][x + 1]) continue; // Optimization: don't swap identical gems
      [b[y][x], b[y][x + 1]] = [b[y][x + 1], b[y][x]];
      const hasMatch = hasAnyMatch(b);
      [b[y][x], b[y][x + 1]] = [b[y][x + 1], b[y][x]];
      if (hasMatch) return true;
    }
  }
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE - 1; y++) {
      if (b[y][x] === b[y + 1][x]) continue;
      [b[y + 1][x], b[y][x]] = [b[y][x], b[y + 1][x]];
      const hasMatch = hasAnyMatch(b);
      [b[y + 1][x], b[y][x]] = [b[y][x], b[y + 1][x]];
      if (hasMatch) return true;
    }
  }
  return false;
}

// v7.3: Performance optimization: double-buffered object pool for dirty masks
// Eliminates Uint8Array garbage collection during long cascade loops
const _dirtyPoolA = {
  rows: new Uint8Array(BOARD_SIZE),
  cols: new Uint8Array(BOARD_SIZE),
};
const _dirtyPoolB = {
  rows: new Uint8Array(BOARD_SIZE),
  cols: new Uint8Array(BOARD_SIZE),
};

function groupSpecialType(group) {
  if (!group || group.length < 4) return null;
  const rows = new Set(group.map((idx) => Math.floor(idx / BOARD_SIZE)));
  const cols = new Set(group.map((idx) => idx % BOARD_SIZE));
  if (group.length >= 5) return "special_colour";
  if (rows.size === 1) return "special_row";
  if (cols.size === 1) return "special_column";
  return "special_blast";
}

function collectSpecialClears(board, x, y) {
  const type = board[y]?.[x];
  if (!isSpecialType(type)) return [];
  const cells = new Set();
  const add = (cx, cy) => {
    if (cx >= 0 && cx < BOARD_SIZE && cy >= 0 && cy < BOARD_SIZE) cells.add(cy * BOARD_SIZE + cx);
  };

  if (type === "special_row") {
    for (let cx = 0; cx < BOARD_SIZE; cx++) add(cx, y);
  } else if (type === "special_column") {
    for (let cy = 0; cy < BOARD_SIZE; cy++) add(x, cy);
  } else if (type === "special_blast") {
    for (let cy = y - 1; cy <= y + 1; cy++) {
      for (let cx = x - 1; cx <= x + 1; cx++) add(cx, cy);
    }
  } else if (type === "special_colour") {
    const target = GEM_TYPES.find((gem) => board.some((row) => row.includes(gem))) || null;
    if (target) {
      for (let cy = 0; cy < BOARD_SIZE; cy++) {
        for (let cx = 0; cx < BOARD_SIZE; cx++) {
          if (board[cy][cx] === target) add(cx, cy);
        }
      }
    }
    add(x, y);
  }

  return [...cells];
}

function clearCells(board, indices) {
  const cleared = [];
  for (const idx of indices) {
    const x = idx % BOARD_SIZE;
    const y = Math.floor(idx / BOARD_SIZE);
    const type = board[y]?.[x];
    if (!type || isDropToken(type)) continue;
    board[y][x] = null;
    cleared.push({ x, y, type });
  }
  return cleared;
}

/** Run a full cascade: match → clear → gravity → fill → repeat.
 *  Returns { steps, totalPoints, combo } for animation.
 *  @param {Function} [onCascadeStep] — optional callback after each step (for star-drop checks)
 */
export function resolveBoard(b, onCascadeStep) {
  const steps = [];
  let totalPoints = 0;
  let cascadeCombo = 0;
  let matches = findMatches(b);
  let dirtyMask; // assigned at end of loop
  let usePoolA = true;

  while (matches.length > 0) {
    cascadeCombo++;

    // Grab alternating array from the pool and zero it out
    const nextDirtyMask = usePoolA ? _dirtyPoolA : _dirtyPoolB;
    usePoolA = !usePoolA;
    nextDirtyMask.rows.fill(0);
    nextDirtyMask.cols.fill(0);

    const groups = findMatchGroups(b, dirtyMask);
    const protectedSpecials = new Map();
    const clearSet = new Set(matches);
    for (const group of groups) {
      const special = groupSpecialType(group);
      if (!special) continue;
      const anchor = group[0];
      protectedSpecials.set(anchor, special);
      clearSet.delete(anchor);
    }
    const cleared = [];
    for (const idx of clearSet) {
      const x = idx % BOARD_SIZE;
      const y = Math.floor(idx / BOARD_SIZE);
      if (isDropToken(b[y][x])) continue;
      cleared.push({ x, y, type: b[y][x] });
      b[y][x] = null;
      nextDirtyMask.rows[y] = 1;
      nextDirtyMask.cols[x] = 1;
    }
    const specials = [];
    for (const [idx, type] of protectedSpecials.entries()) {
      const x = idx % BOARD_SIZE;
      const y = Math.floor(idx / BOARD_SIZE);
      b[y][x] = type;
      nextDirtyMask.rows[y] = 1;
      nextDirtyMask.cols[x] = 1;
      specials.push({ x, y, type });
    }
    totalPoints += cleared.length * 10 * Math.min(cascadeCombo, 5);

    // Gravity + fill
    const fallen = [];
    const filled = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      // If this column had no matches and no items above matches, it skips gravity
      // but gravity logic is fast enough.
      let wy = BOARD_SIZE - 1;
      for (let y = BOARD_SIZE - 1; y >= 0; y--) {
        if (b[y][x]) {
          if (wy !== y) {
            b[wy][x] = b[y][x];
            b[y][x] = null;
            fallen.push({ x, fromY: y, toY: wy });
            // Mark fallen destinations and origins as dirty
            nextDirtyMask.rows[wy] = 1;
            nextDirtyMask.rows[y] = 1;
            nextDirtyMask.cols[x] = 1;
          }
          wy--;
        }
      }
      for (let y = wy; y >= 0; y--) {
        b[y][x] = randomGem();
        filled.push({ x, y, type: b[y][x] });
        // Mark filled cells as dirty
        nextDirtyMask.rows[y] = 1;
        nextDirtyMask.cols[x] = 1;
      }
    }

    steps.push({
      cleared,
      specials,
      fallen,
      filled,
      combo: cascadeCombo,
      boardSnapshot: cloneBoard(b),
    });

    // Callback for star-drop mode checks
    if (onCascadeStep) onCascadeStep();

    dirtyMask = nextDirtyMask;
    matches = findMatches(b, dirtyMask);
  }

  return { steps, totalPoints, combo: cascadeCombo };
}

export function seedDropTokens(board, count = 3) {
  const next = cloneBoard(board);
  const emptyish = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (!isDropToken(next[y][x]) && !isSpecialType(next[y][x])) emptyish.push({ x, y });
    }
  }
  for (let i = 0; i < count && emptyish.length; i++) {
    const pick = Math.floor(Math.random() * emptyish.length);
    const [{ x, y }] = emptyish.splice(pick, 1);
    next[y][x] = randomDropToken();
  }
  return next;
}

export function attemptMatch3Move(board, from, to, options = {}) {
  const original = cloneBoard(board);
  const adjacent = Math.abs(from.x - to.x) + Math.abs(from.y - to.y) === 1;
  if (!adjacent) {
    return { valid: false, board: original, totalPoints: 0, combo: 0, steps: [], reason: "not adjacent" };
  }

  const next = cloneBoard(board);
  const fromType = next[from.y]?.[from.x];
  const toType = next[to.y]?.[to.x];
  if (!fromType || !toType) {
    return { valid: false, board: original, totalPoints: 0, combo: 0, steps: [], reason: "empty cell" };
  }

  [next[from.y][from.x], next[to.y][to.x]] = [next[to.y][to.x], next[from.y][from.x]];

  const specialCells = [];
  if (isSpecialType(fromType)) specialCells.push({ x: to.x, y: to.y });
  if (isSpecialType(toType)) specialCells.push({ x: from.x, y: from.y });

  if (specialCells.length) {
    const clearSet = new Set();
    for (const cell of specialCells) {
      for (const idx of collectSpecialClears(next, cell.x, cell.y)) clearSet.add(idx);
    }
    const cleared = clearCells(next, clearSet);
    const resolved = resolveBoard(next, options.onCascadeStep);
    const specialPoints = cleared.length * 12;
    return {
      valid: true,
      board: next,
      totalPoints: specialPoints + resolved.totalPoints,
      combo: Math.max(1, resolved.combo),
      steps: [{ cleared, specials: [], fallen: [], filled: [], combo: 1, boardSnapshot: cloneBoard(next) }, ...resolved.steps],
      special: true,
    };
  }

  if (!findMatches(next).length) {
    return { valid: false, board: original, totalPoints: 0, combo: 0, steps: [], reason: "no match" };
  }

  const resolved = resolveBoard(next, options.onCascadeStep);
  return {
    valid: true,
    board: next,
    totalPoints: resolved.totalPoints,
    combo: resolved.combo,
    steps: resolved.steps,
    special: false,
  };
}
