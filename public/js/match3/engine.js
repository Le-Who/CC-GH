/* ═══════════════════════════════════════════════════
 *  Match-3 Engine — Pure Game Logic (v6.1.0)
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

// ─── Firestore hydration helpers ───

/** Firestore converts 2D arrays to objects — convert back */
export function hydrateBoard(b) {
  if (b == null) return null;
  if (Array.isArray(b)) return b;
  return Object.keys(b)
    .sort((a, c) => Number(a) - Number(c))
    .map((k) => {
      const row = b[k];
      return Array.isArray(row) ? row : Object.values(row);
    });
}

/** Firestore converts flat arrays to objects — convert back */
export function hydrateArray(a) {
  if (Array.isArray(a)) return a;
  if (a && typeof a === "object") return Object.values(a);
  return [];
}

/** Hydrate all boards and arrays inside a savedModes object from Firestore */
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

export function findMatches(b) {
  const matched = new Uint8Array(BOARD_SIZE * BOARD_SIZE);
  let count = 0;

  // Horizontal
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE - 2; x++) {
      const type = b[y][x];
      if (!type || DROP_TYPES.includes(type)) continue;
      if (type === b[y][x + 1] && type === b[y][x + 2]) {
        let end = x + 3;
        while (end < BOARD_SIZE && b[y][end] === type) end++;
        for (let k = x; k < end; k++) {
          const idx = y * BOARD_SIZE + k;
          if (matched[idx] === 0) {
            matched[idx] = 1;
            count++;
          }
        }
        x = end - 1;
      }
    }
  }
  // Vertical
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE - 2; y++) {
      const type = b[y][x];
      if (!type || DROP_TYPES.includes(type)) continue;
      if (type === b[y + 1][x] && type === b[y + 2][x]) {
        let end = y + 3;
        while (end < BOARD_SIZE && b[end][x] === type) end++;
        for (let k = y; k < end; k++) {
          const idx = k * BOARD_SIZE + x;
          if (matched[idx] === 0) {
            matched[idx] = 1;
            count++;
          }
        }
        y = end - 1;
      }
    }
  }

  const result = [];
  if (count > 0) {
    const len = BOARD_SIZE * BOARD_SIZE;
    for (let i = 0; i < len; i++) {
      if (matched[i]) result.push(i);
    }
  }
  return result;
}

/** Check if board has any valid moves (prevents deadlocks) */
export function hasValidMoves(b) {
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE - 1; x++) {
      [b[y][x], b[y][x + 1]] = [b[y][x + 1], b[y][x]];
      const hasMatch = findMatches(b).length > 0;
      [b[y][x], b[y][x + 1]] = [b[y][x + 1], b[y][x]];
      if (hasMatch) return true;
    }
  }
  for (let x = 0; x < BOARD_SIZE; x++) {
    for (let y = 0; y < BOARD_SIZE - 1; y++) {
      [b[y + 1][x], b[y][x]] = [b[y][x], b[y + 1][x]];
      const hasMatch = findMatches(b).length > 0;
      [b[y + 1][x], b[y][x]] = [b[y][x], b[y + 1][x]];
      if (hasMatch) return true;
    }
  }
  return false;
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

  while (matches.length > 0) {
    cascadeCombo++;
    const cleared = matches.map((idx) => {
      const x = idx % BOARD_SIZE;
      const y = Math.floor(idx / BOARD_SIZE);
      return { x, y, type: b[y][x] };
    });
    totalPoints += cleared.length * 10 * Math.min(cascadeCombo, 5);

    // Clear matched cells (but NEVER clear drop tokens)
    for (const { x, y } of cleared) {
      if (!DROP_TYPES.includes(b[y][x])) b[y][x] = null;
    }

    // Gravity + fill
    const fallen = [];
    const filled = [];
    for (let x = 0; x < BOARD_SIZE; x++) {
      let wy = BOARD_SIZE - 1;
      for (let y = BOARD_SIZE - 1; y >= 0; y--) {
        if (b[y][x]) {
          if (wy !== y) {
            b[wy][x] = b[y][x];
            b[y][x] = null;
            fallen.push({ x, fromY: y, toY: wy });
          }
          wy--;
        }
      }
      for (let y = wy; y >= 0; y--) {
        b[y][x] = randomGem();
        filled.push({ x, y, type: b[y][x] });
      }
    }

    steps.push({
      cleared,
      fallen,
      filled,
      combo: cascadeCombo,
      boardSnapshot: cloneBoard(b),
    });

    // Callback for star-drop mode checks
    if (onCascadeStep) onCascadeStep();

    matches = findMatches(b);
  }

  return { steps, totalPoints, combo: cascadeCombo };
}
