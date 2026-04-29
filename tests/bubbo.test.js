import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BUBBO_COLS,
  BUBBO_COLORS,
  BUBBO_PALETTE,
  BUBBO_ROWS,
  BUBBO_START_ROWS,
  BUBBO_TIMED_SECONDS,
  advanceBubboPressure,
  applyBubboShot,
  createBubboBoard,
  createBubboRun,
  dropFloatingBubbo,
  generateBubboWave,
  getBubboOccupiedPlayableRows,
  getBubboRemainingCount,
  getBubboRowVisualOffset,
  isBubboDanger,
  normalizeBubboMode,
  normalizeBubboBoard,
  recoverSparseBubboField,
  resolveBubboShot,
  settleFloatingBubbo,
  shiftBubboPressure,
} from "../src/game-core/bubbo/engine.js";
import { calcBubboReward } from "../game-logic.js";

describe("Bubbo engine", () => {
  function assertNoFloatingCells(board, rowOffset = 0, message = "board should not contain unsupported islands") {
    assert.deepEqual(settleFloatingBubbo(board, rowOffset), [], message);
  }

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
    assert.equal(shifted.rowOffset, 1);
    assert.equal(getBubboRowVisualOffset(0, 0), getBubboRowVisualOffset(1, shifted.rowOffset));

    const dangerBoard = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    for (let row = 0; row < BUBBO_ROWS; row += 1) dangerBoard[row][0] = "sky";
    const danger = shiftBubboPressure(dangerBoard, "pressure", 8);
    assert.equal(danger.overflow, true);
    assert.equal(danger.danger, true);
    assertNoFloatingCells(danger.board, danger.rowOffset);
  });

  it("creates and consumes a deterministic playable pending pressure row", () => {
    const run = createBubboRun("pending-pressure");

    assert.deepEqual(run.pendingRow, generateBubboWave("pending-pressure", BUBBO_START_ROWS));

    const shifted = shiftBubboPressure(run.board, run.seed, run.waveIndex, run.rowOffset, run.pendingRow);

    assert.deepEqual(shifted.board[0], run.pendingRow);
    assert.deepEqual(shifted.pendingRow, generateBubboWave(run.seed, run.waveIndex + 1));
    assert.equal(shifted.waveIndex, run.waveIndex + 1);
  });

  it("keeps existing rows in the same visual columns after pressure descent", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[0][4] = "sky";
    board[1][4] = "sky";
    board[2][4] = "sky";
    const shifted = shiftBubboPressure(board, "visual-stability", 3, 0);

    assert.equal(shifted.board[3][4], "sky");
    assert.equal(
      4 + getBubboRowVisualOffset(2, 0),
      4 + getBubboRowVisualOffset(3, shifted.rowOffset),
    );
    assertNoFloatingCells(shifted.board, shifted.rowOffset);
  });

  it("drops pre-existing unsupported islands during pressure shifts before checking overflow", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[BUBBO_ROWS - 1][4] = "mint";

    const shifted = shiftBubboPressure(board, "orphan-bottom", 2, 0);

    assert.equal(shifted.overflow, false);
    assert.ok(shifted.dropped.some((cell) => cell.row === BUBBO_ROWS - 1 && cell.col === 4 && cell.color === "mint"));
    assertNoFloatingCells(shifted.board, shifted.rowOffset);
  });

  it("advances continuous pressure by elapsed time", () => {
    const board = createBubboBoard({ seed: "clocked", startRows: 1 });
    const advanced = advanceBubboPressure({ board, seed: "clocked", waveIndex: 1, pressure: 9000 }, 700);

    assert.equal(advanced.shifts, 1);
    assert.equal(advanced.waveIndex, 2);
    assert.equal(advanced.rowOffset, 1);
    assert.ok(advanced.pressure < 9500);
    assert.equal(advanced.board[1].some(Boolean), true);
    assertNoFloatingCells(advanced.board, advanced.rowOffset);
  });

  it("returns dropped cells when pressure advance settles islands", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[6][2] = "amber";
    const advanced = advanceBubboPressure({
      board,
      seed: "pressure-orphan",
      waveIndex: BUBBO_START_ROWS,
      pendingRow: generateBubboWave("pressure-orphan", BUBBO_START_ROWS),
      pressure: 9500,
    }, 100);

    assert.equal(advanced.shifts, 1);
    assert.ok(advanced.dropped.some((cell) => cell.row === 6 && cell.col === 2 && cell.color === "amber"));
    assertNoFloatingCells(advanced.board, advanced.rowOffset);
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

  it("lets shots aimed at virtual row -1 pop pending-row clusters", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    const pendingRow = Array(BUBBO_COLS).fill(null);
    pendingRow[0] = "mint";
    pendingRow[1] = "mint";

    const result = applyBubboShot(board, "mint", -1, 0, { pendingRow });

    assert.equal(result.error, null);
    assert.ok(result.popped.some((cell) => cell.row === -1 && cell.col === 0));
    assert.ok(result.popped.some((cell) => cell.row === -1 && cell.col === 1));
    assert.ok(result.popped.some((cell) => cell.row === 0 && cell.col === 0));
    assert.equal(result.pendingRow[0], null);
    assert.equal(result.pendingRow[1], null);
  });

  it("recovers cleared fields instead of ending the run path", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[0][0] = "sky";
    board[0][1] = "sky";
    const run = {
      ...createBubboRun("clear-recover"),
      board,
      pendingRow: generateBubboWave("clear-recover", BUBBO_START_ROWS),
      pressure: 5200,
    };

    const result = resolveBubboShot(run, "sky", 0, 2);

    assert.equal(result.error, null);
    assert.equal(result.recovered, true);
    assert.equal(result.pressure, 0);
    assert.equal(result.pressureStep, 0);
    assert.ok(getBubboOccupiedPlayableRows(result.board) >= 3);
    assert.ok(getBubboRemainingCount(result.board) > 0);
  });

  it("refills a one-row sparse field without pressure penalty", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[0][3] = "coral";
    const recovered = recoverSparseBubboField({
      board,
      seed: "one-row-refill",
      waveIndex: BUBBO_START_ROWS,
      pendingRow: generateBubboWave("one-row-refill", BUBBO_START_ROWS),
      pressure: 8000,
      pressureStep: 0.84,
    });

    assert.equal(recovered.recovered, true);
    assert.equal(recovered.pressure, 0);
    assert.equal(recovered.pressureStep, 0);
    assert.equal(recovered.board[0][3], "coral");
    assert.ok(getBubboOccupiedPlayableRows(recovered.board) >= 3);
    assert.equal(isBubboDanger(recovered.board), false);
    assertNoFloatingCells(recovered.board, recovered.rowOffset);
  });

  it("drops unsupported sparse islands before recovery refill", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[7][3] = "coral";

    const recovered = recoverSparseBubboField({
      board,
      seed: "sparse-orphan",
      waveIndex: BUBBO_START_ROWS,
      pendingRow: generateBubboWave("sparse-orphan", BUBBO_START_ROWS),
      pressure: 8000,
      pressureStep: 0.84,
    });

    assert.equal(recovered.recovered, true);
    assert.ok(recovered.dropped.some((cell) => cell.row === 7 && cell.col === 3 && cell.color === "coral"));
    assert.notEqual(recovered.board[0][3], "coral");
    assertNoFloatingCells(recovered.board, recovered.rowOffset);
  });

  it("normalizes timed mode state without relying on shots left", () => {
    const timed = createBubboRun("timed-run", { mode: "timed" });

    assert.equal(timed.mode, "timed");
    assert.equal(timed.timeLeft, BUBBO_TIMED_SECONDS);
    assert.equal(timed.shotsFired, 0);
    assert.equal(normalizeBubboMode("bad-mode"), "classic");
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

  it("clears unsupported cells and returns their colors for animation", () => {
    const board = Array.from({ length: BUBBO_ROWS }, () => Array(BUBBO_COLS).fill(null));
    board[4][2] = "berry";
    board[4][3] = "sky";

    const dropped = dropFloatingBubbo(board);

    assert.deepEqual(dropped.map((cell) => `${cell.row}:${cell.col}:${cell.color}`).sort(), ["4:2:berry", "4:3:sky"]);
    assert.equal(board[4][2], null);
    assert.equal(board[4][3], null);
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
