import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUBBO_COLS,
  BUBBO_COLORS,
  BUBBO_PALETTE,
  BUBBO_ROWS,
  advanceBubboPressure,
  applyBubboShot,
  createBubboBoard,
  generateBubboWave,
  getBubboRemainingCount,
  isBubboDanger,
  normalizeBubboBoard,
  settleFloatingBubbo,
  shiftBubboPressure,
} from "../src/game-core/bubbo/engine.js";
import { calcBubboReward } from "../game-logic.js";

describe("Bubbo engine", () => {
  it("creates a normalized staggered field with playable empty rows", () => {
    const board = createBubboBoard({ seed: "shape" });

    assert.equal(board.length, BUBBO_ROWS);
    assert.equal(board[0].length, BUBBO_COLS);
    assert.ok(getBubboRemainingCount(board) > 0);
    assert.equal(board[BUBBO_ROWS - 1].every((cell) => cell === null), true);
    assert.equal(isBubboDanger(board), false);
  });

  it("creates deterministic procedural waves instead of fixed stripes", () => {
    const a = createBubboBoard({ seed: "daily-pressure" });
    const b = createBubboBoard({ seed: "daily-pressure" });
    const c = createBubboBoard({ seed: "other-pressure" });

    assert.deepEqual(a, b);
    assert.notDeepEqual(a.slice(0, 2), c.slice(0, 2));
    assert.ok(new Set(generateBubboWave("daily-pressure", 4)).size >= 3);
  });

  it("shifts pressure rows down and reports danger on overflow", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[0][0] = "mint";
    const shifted = shiftBubboPressure(board, "pressure", 7);

    assert.equal(shifted.board[1][0], "mint");
    assert.equal(shifted.board[0].every(Boolean), true);
    assert.equal(shifted.waveIndex, 8);

    const dangerBoard = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    dangerBoard[BUBBO_ROWS - 1][0] = "sky";
    const danger = shiftBubboPressure(dangerBoard, "pressure", 8);
    assert.equal(danger.overflow, true);
    assert.equal(danger.danger, true);
  });

  it("advances continuous pressure by elapsed time", () => {
    const board = createBubboBoard({ seed: "clocked", startRows: 1 });
    const advanced = advanceBubboPressure({ board, seed: "clocked", waveIndex: 1, pressure: 9000 }, 700);

    assert.equal(advanced.shifts, 1);
    assert.equal(advanced.waveIndex, 2);
    assert.ok(advanced.pressure < 9500);
    assert.equal(advanced.board[1].some(Boolean), true);
  });

  it("pops same-color clusters and drops unanchored bubbles", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[0][0] = "mint";
    board[1][0] = "mint";
    board[2][0] = "mint";
    board[3][0] = "sky";

    const result = applyBubboShot(board, "mint", 2, 1);

    assert.equal(result.error, null);
    assert.ok(result.popped.length >= 3);
    assert.ok(result.dropped.some((cell) => cell.row === 3 && cell.col === 0));
    assert.ok(result.points > 0);
    assert.equal(result.board[3][0], null);
  });

  it("keeps sky and berry as distinct playable colors", () => {
    assert.ok(BUBBO_COLORS.includes("sky"));
    assert.ok(BUBBO_COLORS.includes("berry"));
    assert.notEqual(BUBBO_PALETTE.sky, BUBBO_PALETTE.berry);
  });

  it("pops sky clusters without treating adjacent berry bubbles as sky", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[0][0] = "sky";
    board[0][1] = "sky";
    board[0][2] = "berry";

    const result = applyBubboShot(board, "sky", 1, 0);

    assert.equal(result.error, null);
    assert.ok(result.popped.some((cell) => cell.row === 0 && cell.col === 0));
    assert.ok(result.popped.some((cell) => cell.row === 0 && cell.col === 1));
    assert.equal(result.popped.some((cell) => cell.row === 0 && cell.col === 2), false);
    assert.equal(result.board[0][2], "berry");
  });

  it("drops disconnected multi-color islands after support is removed", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[3][3] = "sky";
    board[3][4] = "coral";
    board[4][4] = "amber";

    const dropped = settleFloatingBubbo(board);

    assert.deepEqual(
      dropped.map(([row, col]) => `${row}:${col}`).sort(),
      ["3:3", "3:4", "4:4"],
    );
  });

  it("normalizes malformed boards and keeps reward bounded", () => {
    const board = normalizeBubboBoard([["mint", "bad-value"], ["coral"]]);

    assert.equal(board[0][0], "mint");
    assert.equal(board[0][1], null);
    assert.equal(board[1][0], "coral");
    assert.equal(calcBubboReward(0), 5);
    assert.ok(calcBubboReward(50_000) <= 400);
  });
});
