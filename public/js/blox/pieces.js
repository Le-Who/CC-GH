/* ═══════════════════════════════════════════════════
 *  Blox — Piece Library (v6.2.0)
 *  Static piece definitions for the 10×10 block puzzle.
 *  Extracted from blox.js for clarity.
 * ═══════════════════════════════════════════════════ */

export const GRID = 10;
export const PIECE_COUNT = 3;

export const PIECES = [
  { id: "dot", cells: [[0, 0]], color: "#94a3b8" },
  {
    id: "h2",
    cells: [
      [0, 0],
      [0, 1],
    ],
    color: "#60a5fa",
  },
  {
    id: "v2",
    cells: [
      [0, 0],
      [1, 0],
    ],
    color: "#60a5fa",
  },
  {
    id: "l3",
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
    ],
    color: "#f97316",
  },
  {
    id: "l3r",
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
    ],
    color: "#f97316",
  },
  {
    id: "h3",
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
    ],
    color: "#22c55e",
  },
  {
    id: "v3",
    cells: [
      [0, 0],
      [1, 0],
      [2, 0],
    ],
    color: "#22c55e",
  },
  {
    id: "sq",
    cells: [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ],
    color: "#fbbf24",
  },
  {
    id: "t4",
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 1],
    ],
    color: "#a78bfa",
  },
  {
    id: "s4",
    cells: [
      [0, 1],
      [0, 2],
      [1, 0],
      [1, 1],
    ],
    color: "#ef4444",
  },
  {
    id: "i4",
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
    color: "#06b6d4",
  },
  {
    id: "i5",
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
    color: "#e879f9",
  },
];
