import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUBBO_COLS,
  BUBBO_ROWS,
  applyBubboShot,
  createBubboBoard,
  getBubboRemainingCount,
  isBubboDanger,
  normalizeBubboBoard,
} from "../src/game-core/bubbo/engine.js";
import { calcBubboReward } from "../game-logic.js";

describe("Bubbo engine", () => {
  it("creates a normalized staggered field with playable empty rows", () => {
    const board = createBubboBoard();

    assert.equal(board.length, BUBBO_ROWS);
    assert.equal(board[0].length, BUBBO_COLS);
    assert.ok(getBubboRemainingCount(board) > 0);
    assert.equal(board[BUBBO_ROWS - 1].every((cell) => cell === null), true);
    assert.equal(isBubboDanger(board), false);
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

  it("normalizes malformed boards and keeps reward bounded", () => {
    const board = normalizeBubboBoard([["mint", "bad-value"], ["coral"]]);

    assert.equal(board[0][0], "mint");
    assert.equal(board[0][1], null);
    assert.equal(board[1][0], "coral");
    assert.equal(calcBubboReward(0), 5);
    assert.ok(calcBubboReward(50_000) <= 400);
  });
});
