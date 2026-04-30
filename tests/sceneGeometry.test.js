import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bloxAnchorCellFromDrag,
  bloxGhostOrigin,
  createBloxDragState,
  tickParticles,
} from "../src/game-runtime/sceneGeometry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

  it("keeps Blox board-scale ghosts under the original touch capture point", () => {
    const layout = { left: 18, top: 52, cell: 34, rows: 10, cols: 10 };
    const drag = createBloxDragState({
      pieceIdx: 0,
      piece: line3,
      event: { pointerId: 1, global: { x: 76, y: 38 } },
      originX: 28,
      originY: 26,
      unit: 16,
    });

    drag.x = layout.left + 3 * layout.cell + drag.grabX * layout.cell + 7;
    drag.y = layout.top + 4 * layout.cell + drag.grabY * layout.cell + 6;

    const origin = bloxGhostOrigin(drag, layout.cell);
    assert.equal(origin.x + drag.grabX * layout.cell, drag.x);
    assert.equal(origin.y + drag.grabY * layout.cell, drag.y);
    assert.deepEqual(bloxAnchorCellFromDrag(layout, drag), { row: 4, col: 3 });
  });

  it("keeps Bubbo using corrected sheet frames and internal HUD reserve", () => {
    const scenes = fs.readFileSync(path.join(__dirname, "..", "src", "game-runtime", "scenes.js"), "utf-8");
    const assetBundles = fs.readFileSync(path.join(__dirname, "..", "src", "game-runtime", "assetBundles.js"), "utf-8");
    const bubboGame = fs.readFileSync(path.join(__dirname, "..", "src", "games", "bubbo", "BubboGame.jsx"), "utf-8");

    assert.ok(scenes.includes("BUBBO_BALL_FRAMES"), "Bubbo should crop the new ball sheet from measured transparent bounds");
    assert.ok(scenes.includes("BUBBO_BALL_DRAW_SCALE"), "Bubbo should size the corrected sheet artwork to fill the hex grid");
    assert.ok(scenes.includes("bubbo.balls.sheet"), "Bubbo runtime should resolve the new ball artwork through the runtime asset manifest");
    assert.ok(scenes.includes("finishLineY"), "Bubbo danger/finish line should be independently positioned below the last row");
    assert.ok(scenes.includes("boardLayer.enableRenderGroup"), "Bubbo board pressure motion should use a render group");
    assert.ok(scenes.includes("falling._life = reduce ? 42 : 78"), "Bubbo island drops should stay visible long enough to read as falling");
    assert.ok(scenes.includes("falling._gravity = reduce ? 0.18 : 0.07"), "Bubbo island drops should use slow gravity instead of instant removal");
    assert.ok(bubboGame.includes("bottomHudReserve: true"), "Bubbo scene should reserve launcher space above the bottom HUD");
    assert.ok(assetBundles.includes("assets_bubbo_balls"), "Bubbo should preload the corrected sheet artwork");
  });

  it("starts delayed Match-3 effect tweens instead of leaving them stuck above the board", () => {
    const effect = {
      x: 0,
      y: -24,
      alpha: 1,
      scale: { set(value) { this.value = value; } },
      _delay: 0.5,
      _tween: {
        age: 0,
        fromX: 0,
        fromY: -24,
        toX: 0,
        toY: 24,
        duration: 10,
        destroy: false,
      },
    };

    tickParticles({ children: [effect] }, 1);

    assert.equal(effect._delay, 0);
    assert.ok(effect._tween.age > 0);
    assert.ok(effect.y > -24);
  });
});
