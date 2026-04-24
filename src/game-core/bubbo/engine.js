export const BUBBO_ROWS = 11;
export const BUBBO_COLS = 9;
export const BUBBO_START_ROWS = 5;
export const BUBBO_SHOTS = 36;

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

export function cloneBubboBoard(board = []) {
  return board.map((row) => [...row]);
}

export function createBubboBoard() {
  return Array.from({ length: BUBBO_ROWS }, (_, row) =>
    Array.from({ length: BUBBO_COLS }, (_, col) => {
      if (row >= BUBBO_START_ROWS) return null;
      return BUBBO_COLORS[(row * 2 + col + Math.floor(col / 3)) % BUBBO_COLORS.length];
    }),
  );
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

export function getBubboNeighbors(row, col) {
  const offsets = row % 2 === 0 ? EVEN_NEIGHBORS : ODD_NEIGHBORS;
  return offsets
    .map(([dr, dc]) => [row + dr, col + dc])
    .filter(([r, c]) => r >= 0 && r < BUBBO_ROWS && c >= 0 && c < BUBBO_COLS);
}

function cellKey(row, col) {
  return `${row}:${col}`;
}

function parseKey(key) {
  return key.split(":").map(Number);
}

function nearestEmptyCell(board, row, col) {
  const startRow = Math.max(0, Math.min(BUBBO_ROWS - 1, Math.round(row)));
  const startCol = Math.max(0, Math.min(BUBBO_COLS - 1, Math.round(col)));
  if (!board[startRow][startCol]) return [startRow, startCol];

  const queue = [[startRow, startCol]];
  const seen = new Set([cellKey(startRow, startCol)]);
  while (queue.length) {
    const [r, c] = queue.shift();
    for (const [nr, nc] of getBubboNeighbors(r, c)) {
      const key = cellKey(nr, nc);
      if (seen.has(key)) continue;
      if (!board[nr][nc]) return [nr, nc];
      seen.add(key);
      queue.push([nr, nc]);
    }
  }
  return null;
}

function sameColorCluster(board, row, col) {
  const color = board[row]?.[col];
  if (!color) return [];
  const queue = [[row, col]];
  const seen = new Set([cellKey(row, col)]);
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    for (const [nr, nc] of getBubboNeighbors(r, c)) {
      const key = cellKey(nr, nc);
      if (seen.has(key) || board[nr][nc] !== color) continue;
      seen.add(key);
      queue.push([nr, nc]);
    }
  }
  return [...seen].map(parseKey);
}

function floatingCells(board) {
  const anchored = new Set();
  const queue = [];
  for (let c = 0; c < BUBBO_COLS; c++) {
    if (!board[0][c]) continue;
    const key = cellKey(0, c);
    anchored.add(key);
    queue.push([0, c]);
  }
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    for (const [nr, nc] of getBubboNeighbors(r, c)) {
      const key = cellKey(nr, nc);
      if (anchored.has(key) || !board[nr][nc]) continue;
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

export function applyBubboShot(board, color, row, col) {
  const next = normalizeBubboBoard(board);
  const target = nearestEmptyCell(next, row, col);
  if (!target) {
    return {
      board: next,
      landed: null,
      popped: [],
      dropped: [],
      points: 0,
      error: "board full",
    };
  }

  const [landedRow, landedCol] = target;
  next[landedRow][landedCol] = BUBBO_COLORS.includes(color) ? color : BUBBO_COLORS[0];

  const cluster = sameColorCluster(next, landedRow, landedCol);
  const popped = cluster.length >= 3 ? cluster : [];
  for (const [r, c] of popped) next[r][c] = null;

  const dropped = popped.length ? floatingCells(next) : [];
  for (const [r, c] of dropped) next[r][c] = null;

  return {
    board: next,
    landed: { row: landedRow, col: landedCol },
    popped: popped.map(([r, c]) => ({ row: r, col: c })),
    dropped: dropped.map(([r, c]) => ({ row: r, col: c })),
    points: popped.length * 20 + dropped.length * 35,
    error: null,
  };
}
