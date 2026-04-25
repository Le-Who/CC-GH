import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bloxAnchorCellFromDrag,
  bloxGhostOrigin,
  createBloxDragState,
} from "../src/game-runtime/scenes.js";

const line3 = {
  id: "h3",
  color: "#60a5fa",
  cells: [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
};

describe("Pixi scene geometry helpers", () => {
  it("keeps a Blox drag ghost anchored to the player's grab point", () => {
    const drag = createBloxDragState({
      pieceIdx: 0,
      piece: line3,
      event: { pointerId: 1, global: { x: 64, y: 28 } },
      originX: 24,
      originY: 16,
      unit: 20,
    });

    drag.x = 184;
    drag.y = 76;
    const origin = bloxGhostOrigin(drag, 30);

    assert.equal(origin.x + drag.grabX * 30, drag.x);
    assert.equal(origin.y + drag.grabY * 30, drag.y);
  });

  it("uses the piece center when the drag starts from tray padding", () => {
    const drag = createBloxDragState({
      pieceIdx: 0,
      piece: line3,
      event: { pointerId: 1, global: { x: 8, y: 8 } },
      originX: 40,
      originY: 30,
      unit: 18,
    });

    assert.equal(drag.grabX, 1.5);
    assert.equal(drag.grabY, 0.5);
  });

  it("snaps Blox drops from the ghost anchor instead of the finger cell", () => {
    const layout = { left: 20, top: 40, cell: 36, rows: 10, cols: 10 };
    const drag = {
      piece: line3,
      x: 20 + 4 * 36 + 1.5 * 36 + 11,
      y: 40 + 5 * 36 + 0.5 * 36 + 9,
      grabX: 1.5,
      grabY: 0.5,
    };

    assert.deepEqual(bloxAnchorCellFromDrag(layout, drag), { row: 5, col: 4 });
  });
});
