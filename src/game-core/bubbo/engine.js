export const BUBBO_ROWS = 11;
export const BUBBO_COLS = 9;
export const BUBBO_START_ROWS = 5;
export const BUBBO_SHOTS = 36;
export const BUBBO_TIMED_SECONDS = 90;
export const BUBBO_PRESSURE_INTERVAL_MS = 9500;
export const BUBBO_PRESSURE_STEP = 1;

export const BUBBO_COLORS = ["mint", "amber", "coral", "sky", "berry"];

export const BUBBO_PALETTE = {
  mint: "#6ee7b7",
  amber: "#facc15",
  coral: "#fb7185",
  sky: "#60a5fa",
  berry: "#c084fc",
};

const EVEN_NEIGHBORS = [
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 0],
  [1, -1],
  [1, 0],
];

const ODD_NEIGHBORS = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [-1, 1],
  [1, 0],
  [1, 1],
];

function normalizeRowOffset(value = 0) {
  return Math.abs(Math.floor(Number(value) || 0)) % 2;
}

export function normalizeBubboMode(mode = "classic") {
  return mode === "timed" ? "timed" : "classic";
}

export function cloneBubboBoard(board = []) {
  return board.map((row) => [...row]);
}

function hashSeed(value = "") {
  const text = String(value || "bubbo");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed, salt = 0) {
  let state = (hashSeed(seed) + Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeSeed(seed = null) {
  return seed || `bubbo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateBubboWave(seed = "bubbo", waveIndex = 0) {
  const rand = seededRandom(seed, waveIndex);
  const phase = Math.floor(rand() * BUBBO_COLORS.length);
  const pivotA = Math.floor(rand() * BUBBO_COLS);
  const pivotB = Math.floor(rand() * BUBBO_COLS);
  return Array.from({ length: BUBBO_COLS }, (_, col) => {
    const noise = Math.floor(rand() * BUBBO_COLORS.length);
    const ridge = Math.abs(col - pivotA) <= 1 ? 1 : 0;
    const pocket = Math.abs(col - pivotB) === 2 ? 2 : 0;
    return BUBBO_COLORS[(phase + noise + ridge + pocket + col) % BUBBO_COLORS.length];
  });
}

export function createBubboBoard(options = {}) {
  const seed = typeof options === "string" ? options : options.seed;
  const waveIndex = typeof options === "object" ? options.waveIndex || 0 : 0;
  const startRows = typeof options === "object" ? options.startRows || BUBBO_START_ROWS : BUBBO_START_ROWS;
  return Array.from({ length: BUBBO_ROWS }, (_, row) => {
    if (row >= startRows) return Array(BUBBO_COLS).fill(null);
    return generateBubboWave(seed || "bubbo_default", waveIndex + row);
  });
}

export function normalizeBubboBoard(board) {
  const source = Array.isArray(board) && board.length ? board : createBubboBoard();
  return Array.from({ length: BUBBO_ROWS }, (_, row) =>
    Array.from({ length: BUBBO_COLS }, (_, col) => {
      const value = source[row]?.[col] || null;
      return BUBBO_COLORS.includes(value) ? value : null;
    }),
  );
}

export function normalizeBubboPendingRow(row, seed = "bubbo", waveIndex = BUBBO_START_ROWS) {
  const fallback = generateBubboWave(seed || "bubbo", Number.isFinite(Number(waveIndex)) ? Number(waveIndex) : BUBBO_START_ROWS);
  const source = Array.isArray(row) && row.length ? row : fallback;
  return Array.from({ length: BUBBO_COLS }, (_, col) => {
    const value = source[col] || null;
    return BUBBO_COLORS.includes(value) ? value : null;
  });
}

export function randomBubboColor(board = null) {
  const available = new Set();
  for (const row of board || []) {
    for (const value of row || []) {
      if (BUBBO_COLORS.includes(value)) available.add(value);
    }
  }
  const pool = available.size ? [...available] : BUBBO_COLORS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getBubboRowVisualOffset(row, rowOffset = 0) {
  return (row + normalizeRowOffset(rowOffset)) % 2 ? 0.5 : 0;
}

export function getBubboNeighbors(row, col, rowOffset = 0, options = {}) {
  const minRow = options.includePendingRow ? -1 : 0;
  const offsets = getBubboRowVisualOffset(row, rowOffset) ? ODD_NEIGHBORS : EVEN_NEIGHBORS;
  return offsets
    .map(([dr, dc]) => [row + dr, col + dc])
    .filter(([r, c]) => r >= minRow && r < BUBBO_ROWS && c >= 0 && c < BUBBO_COLS);
}

function cellKey(row, col) {
  return `${row}:${col}`;
}

function parseKey(key) {
  return key.split(":").map(Number);
}

function hasPendingRow(pendingRow) {
  return Array.isArray(pendingRow);
}

function getBubboCell(board, pendingRow, row, col) {
  if (row === -1) return pendingRow?.[col] || null;
  return board[row]?.[col] || null;
}

function setBubboCell(board, pendingRow, row, col, value) {
  if (row === -1) {
    if (pendingRow) pendingRow[col] = value;
    return;
  }
  if (board[row]) board[row][col] = value;
}

function nearestEmptyCell(board, row, col, rowOffset = 0, pendingRow = null) {
  const includePendingRow = hasPendingRow(pendingRow);
  const minRow = includePendingRow ? -1 : 0;
  const startRow = Math.max(minRow, Math.min(BUBBO_ROWS - 1, Math.round(row)));
  const startCol = Math.max(0, Math.min(BUBBO_COLS - 1, Math.round(col)));
  if (!getBubboCell(board, pendingRow, startRow, startCol)) return [startRow, startCol];

  const queue = [[startRow, startCol]];
  const seen = new Set([cellKey(startRow, startCol)]);
  while (queue.length) {
    const [r, c] = queue.shift();
    for (const [nr, nc] of getBubboNeighbors(r, c, rowOffset, { includePendingRow })) {
      const key = cellKey(nr, nc);
      if (seen.has(key)) continue;
      if (!getBubboCell(board, pendingRow, nr, nc)) return [nr, nc];
      seen.add(key);
      queue.push([nr, nc]);
    }
  }
  return null;
}

function sameColorCluster(board, row, col, rowOffset = 0, pendingRow = null) {
  const includePendingRow = hasPendingRow(pendingRow);
  const color = getBubboCell(board, pendingRow, row, col);
  if (!color) return [];
  const queue = [[row, col]];
  const seen = new Set([cellKey(row, col)]);
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    for (const [nr, nc] of getBubboNeighbors(r, c, rowOffset, { includePendingRow })) {
      const key = cellKey(nr, nc);
      if (seen.has(key) || getBubboCell(board, pendingRow, nr, nc) !== color) continue;
      seen.add(key);
      queue.push([nr, nc]);
    }
  }
  return [...seen].map(parseKey);
}

export function settleFloatingBubbo(board, rowOffset = 0, options = {}) {
  const pendingRow = Array.isArray(options.pendingRow) ? options.pendingRow : null;
  const includePendingRow = hasPendingRow(pendingRow);
  const anchored = new Set();
  const queue = [];
  if (includePendingRow) {
    for (let c = 0; c < BUBBO_COLS; c++) {
      if (!pendingRow[c]) continue;
      const key = cellKey(-1, c);
      anchored.add(key);
      queue.push([-1, c]);
    }
  }
  for (let c = 0; c < BUBBO_COLS; c++) {
    if (!board[0][c]) continue;
    const key = cellKey(0, c);
    anchored.add(key);
    queue.push([0, c]);
  }
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    for (const [nr, nc] of getBubboNeighbors(r, c, rowOffset, { includePendingRow })) {
      const key = cellKey(nr, nc);
      if (anchored.has(key) || !getBubboCell(board, pendingRow, nr, nc)) continue;
      anchored.add(key);
      queue.push([nr, nc]);
    }
  }

  const dropped = [];
  for (let r = 0; r < BUBBO_ROWS; r++) {
    for (let c = 0; c < BUBBO_COLS; c++) {
      if (board[r][c] && !anchored.has(cellKey(r, c))) dropped.push([r, c]);
    }
  }
  return dropped;
}

export function getBubboRemainingCount(board = []) {
  let count = 0;
  for (const row of board) {
    for (const value of row || []) {
      if (value) count += 1;
    }
  }
  return count;
}

export function isBubboDanger(board = []) {
  return board[BUBBO_ROWS - 2]?.some(Boolean) || board[BUBBO_ROWS - 1]?.some(Boolean) || false;
}

export function getBubboOccupiedPlayableRows(board = []) {
  return normalizeBubboBoard(board).filter((row) => row.some(Boolean)).length;
}

export function createBubboRun(seed = null, options = {}) {
  const config = seed && typeof seed === "object" ? seed : options;
  const runSeed = normalizeSeed(seed && typeof seed === "object" ? config.seed : seed);
  const mode = normalizeBubboMode(config.mode);
  const board = createBubboBoard({ seed: runSeed });
  const pendingRow = normalizeBubboPendingRow(config.pendingRow, runSeed, BUBBO_START_ROWS);
  return {
    board,
    pendingRow,
    seed: runSeed,
    waveIndex: BUBBO_START_ROWS,
    pressure: 0,
    pressureStep: 0,
    rowOffset: 0,
    shotsLeft: BUBBO_SHOTS,
    shotsFired: 0,
    mode,
    timeLeft: mode === "timed" ? BUBBO_TIMED_SECONDS : null,
    score: 0,
  };
}

export function shiftBubboPressure(board, seed = "bubbo", waveIndex = 0, rowOffset = 0, pendingRow = null) {
  const current = normalizeBubboBoard(board);
  const currentWaveIndex = Number.isFinite(Number(waveIndex)) ? Number(waveIndex) : BUBBO_START_ROWS;
  const consumedRow = normalizeBubboPendingRow(pendingRow, seed, currentWaveIndex);
  const overflow = current[BUBBO_ROWS - 1].some(Boolean);
  const nextRowOffset = (normalizeRowOffset(rowOffset) + 1) % 2;
  const nextWaveIndex = currentWaveIndex + 1;
  const shifted = [
    consumedRow,
    ...current.slice(0, BUBBO_ROWS - 1),
  ];
  return {
    board: shifted,
    pendingRow: normalizeBubboPendingRow(null, seed, nextWaveIndex),
    seed,
    waveIndex: nextWaveIndex,
    rowOffset: nextRowOffset,
    overflow,
    danger: overflow || isBubboDanger(shifted),
  };
}

export function advanceBubboPressure(state = {}, elapsedMs = 0) {
  const interval = Math.max(1000, Number(state.pressureIntervalMs) || BUBBO_PRESSURE_INTERVAL_MS);
  let pressure = Math.max(0, Number(state.pressure) || 0) + Math.max(0, elapsedMs);
  let board = normalizeBubboBoard(state.board);
  let waveIndex = Number.isFinite(Number(state.waveIndex)) ? Number(state.waveIndex) : BUBBO_START_ROWS;
  let rowOffset = normalizeRowOffset(state.rowOffset);
  const seed = state.seed || "bubbo";
  let pendingRow = normalizeBubboPendingRow(state.pendingRow, seed, waveIndex);
  let shifts = 0;
  let danger = false;
  let overflow = false;

  while (pressure >= interval) {
    pressure -= interval;
    const shifted = shiftBubboPressure(board, seed, waveIndex, rowOffset, pendingRow);
    board = shifted.board;
    pendingRow = shifted.pendingRow;
    waveIndex = shifted.waveIndex;
    rowOffset = shifted.rowOffset;
    danger = danger || shifted.danger;
    overflow = overflow || shifted.overflow;
    shifts += 1;
  }

  return {
    ...state,
    board,
    pendingRow,
    seed,
    waveIndex,
    rowOffset,
    pressure,
    pressureStep: Math.floor((pressure / interval) * 1000) / 1000,
    shifts,
    danger: danger || isBubboDanger(board),
    overflow,
  };
}

export function applyBubboShot(board, color, row, col, options = {}) {
  const next = normalizeBubboBoard(board);
  const rowOffset = normalizeRowOffset(typeof options === "number" ? options : options.rowOffset);
  const usePendingRow = typeof options === "object" && Object.hasOwn(options, "pendingRow");
  const pendingRow = usePendingRow
    ? normalizeBubboPendingRow(options.pendingRow, options.seed || "bubbo", options.waveIndex ?? BUBBO_START_ROWS)
    : null;
  const target = nearestEmptyCell(next, row, col, rowOffset, pendingRow);
  if (!target) {
    return {
      board: next,
      pendingRow: usePendingRow ? pendingRow : undefined,
      landed: null,
      popped: [],
      dropped: [],
      points: 0,
      error: "board full",
    };
  }

  const [landedRow, landedCol] = target;
  setBubboCell(next, pendingRow, landedRow, landedCol, BUBBO_COLORS.includes(color) ? color : BUBBO_COLORS[0]);

  const cluster = sameColorCluster(next, landedRow, landedCol, rowOffset, pendingRow);
  const popped = cluster.length >= 3 ? cluster : [];
  for (const [r, c] of popped) setBubboCell(next, pendingRow, r, c, null);

  const dropped = popped.length ? settleFloatingBubbo(next, rowOffset, { pendingRow }) : [];
  const droppedCells = dropped.map(([r, c]) => ({ row: r, col: c, color: getBubboCell(next, pendingRow, r, c) }));
  for (const [r, c] of dropped) setBubboCell(next, pendingRow, r, c, null);

  return {
    board: next,
    pendingRow: usePendingRow ? pendingRow : undefined,
    landed: { row: landedRow, col: landedCol },
    popped: popped.map(([r, c]) => ({ row: r, col: c })),
    dropped: droppedCells,
    points: popped.length * 20 + dropped.length * 35,
    error: null,
  };
}

export function recoverSparseBubboField(state = {}, options = {}) {
  const minimumRows = Math.max(1, Number(options.minimumRows) || 3);
  const seed = state.seed || "bubbo";
  let waveIndex = Number.isFinite(Number(state.waveIndex)) ? Number(state.waveIndex) : BUBBO_START_ROWS;
  let pendingRow = normalizeBubboPendingRow(state.pendingRow, seed, waveIndex);
  const board = normalizeBubboBoard(state.board);
  const occupiedRows = board.filter((row) => row.some(Boolean)).map((row) => [...row]);

  if (occupiedRows.length > 1) {
    return {
      ...state,
      board,
      pendingRow,
      waveIndex,
      pressure: Math.max(0, Number(state.pressure) || 0),
      pressureStep: Math.max(0, Number(state.pressureStep) || 0),
      recovered: false,
    };
  }

  const restoredRows = occupiedRows;
  while (restoredRows.length < minimumRows) {
    const refillRow = pendingRow.some(Boolean) ? pendingRow : normalizeBubboPendingRow(null, seed, waveIndex);
    restoredRows.push([...refillRow]);
    waveIndex += 1;
    pendingRow = normalizeBubboPendingRow(null, seed, waveIndex);
  }

  return {
    ...state,
    board: Array.from({ length: BUBBO_ROWS }, (_, row) => restoredRows[row] ? [...restoredRows[row]] : Array(BUBBO_COLS).fill(null)),
    pendingRow,
    waveIndex,
    pressure: 0,
    pressureStep: 0,
    recovered: true,
    danger: false,
    overflow: false,
  };
}

export function resolveBubboShot(state = {}, color, row, col) {
  const seed = state.seed || "bubbo";
  const waveIndex = Number.isFinite(Number(state.waveIndex)) ? Number(state.waveIndex) : BUBBO_START_ROWS;
  const rowOffset = normalizeRowOffset(state.rowOffset);
  const result = applyBubboShot(state.board, color, row, col, {
    rowOffset,
    pendingRow: state.pendingRow,
    seed,
    waveIndex,
  });
  if (result.error) {
    return {
      ...result,
      seed,
      waveIndex,
      rowOffset,
      pressure: Math.max(0, Number(state.pressure) || 0),
      pressureStep: Math.max(0, Number(state.pressureStep) || 0),
      recovered: false,
    };
  }
  const recovered = recoverSparseBubboField({
    ...state,
    board: result.board,
    pendingRow: result.pendingRow,
    seed,
    waveIndex,
    rowOffset,
  });
  return {
    ...result,
    board: recovered.board,
    pendingRow: recovered.pendingRow,
    seed,
    waveIndex: recovered.waveIndex,
    rowOffset,
    pressure: recovered.pressure,
    pressureStep: recovered.pressureStep,
    recovered: recovered.recovered,
    danger: recovered.danger || isBubboDanger(recovered.board),
    overflow: !!recovered.overflow,
  };
}
