import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bloxBoardFrameLayout,
  bloxAnchorCellFromDrag,
  bloxDragVisualPoint,
  bloxGhostOrigin,
  createBloxDragState,
  tickParticles,
} from "../src/game-runtime/sceneGeometry.js";
import {
  GAME_ASSET_BUNDLES,
  LEGACY_ASSET_PATHS,
} from "../src/game-runtime/assetBundles.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSceneRuntimeText() {
  const files = [path.join(__dirname, "..", "src", "game-runtime", "scenes.js")];
  const scenesDir = path.join(__dirname, "..", "src", "game-runtime", "scenes");
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.name.endsWith(".js")) files.push(fullPath);
    }
  };
  visit(scenesDir);
  return files.map((file) => fs.readFileSync(file, "utf-8")).join("\n");
}

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

  it("lifts touch Blox drag previews without losing the visible placement anchor", () => {
    const layout = { left: 18, top: 52, cell: 34, rows: 10, cols: 10 };
    const drag = createBloxDragState({
      pieceIdx: 0,
      piece: line3,
      event: { pointerId: 1, global: { x: 76, y: 38 } },
      originX: 28,
      originY: 26,
      unit: 16,
    });

    drag.visualOffsetY = -68;
    drag.x = layout.left + 3 * layout.cell + drag.grabX * layout.cell + 7;
    drag.y = layout.top + 6 * layout.cell + drag.grabY * layout.cell + 6;

    const visual = bloxDragVisualPoint(drag);
    const origin = bloxGhostOrigin(drag, layout.cell);

    assert.equal(visual.y, drag.y - 68);
    assert.equal(origin.x + drag.grabX * layout.cell, visual.x);
    assert.equal(origin.y + drag.grabY * layout.cell, visual.y);
    assert.deepEqual(bloxAnchorCellFromDrag(layout, drag), { row: 4, col: 3 });
  });

  it("keeps Bubbo using corrected sheet frames and internal HUD reserve", () => {
    const scenes = readSceneRuntimeText();
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

  it("wires final-state Blox and Farm art through asset keys instead of shape-only placeholders", () => {
    const scenes = readSceneRuntimeText();
    const bloxScene = fs.readFileSync(path.join(__dirname, "..", "src", "game-runtime", "scenes", "bloxScene.js"), "utf-8");

    assert.equal(LEGACY_ASSET_PATHS["blox.cell_empty"], "/games/blox/cell_empty.png");
    assert.equal(LEGACY_ASSET_PATHS["farm.crops.strawberry_ready"], "/games/farm/crops/strawberry_ready.png");
    assert.ok(GAME_ASSET_BUNDLES.blox.includes("blox.cell_empty"), "Blox preload fallback should include generated cell art");
    assert.ok(GAME_ASSET_BUNDLES.farm.includes("farm.crops.strawberry_ready"), "Farm preload fallback should include generated crop art");
    assert.ok(scenes.includes("BLOX_TILE_ASSET_BY_COLOR"), "Blox should map placed block colors to generated block tile sprites");
    assert.ok(scenes.includes("BLOX_ASSET_KEYS.rowWipe"), "Blox clear effects should use generated row/column wipe art");
    assert.ok(bloxScene.includes("drawTrayPiece"), "Blox tray previews should render from live piece cells");
    assert.ok(!bloxScene.includes("BLOX_PIECE_ASSET_BY_ID"), "Blox tray previews should not use mismatched fixed preview sprites");
    assert.ok(scenes.includes("FARM_CROP_SLUGS"), "Farm should map crop ids to generated crop sprite paths");
    assert.ok(scenes.includes("FARM_ASSET_KEYS.backgroundField"), "Farm should render the generated field background");
  });

  it("renders Blox predicted row and column clears during drag preview", () => {
    const bloxScene = fs.readFileSync(path.join(__dirname, "..", "src", "game-runtime", "scenes", "bloxScene.js"), "utf-8");

    assert.ok(bloxScene.includes("previewBloxPlacement"), "Blox drag preview should use the domain placement preview");
    assert.ok(bloxScene.includes("dragPreview?.clear.rows"), "Blox drag preview should inspect predicted row clears");
    assert.ok(bloxScene.includes("dragPreview?.clear.cols"), "Blox drag preview should inspect predicted column clears");
    assert.ok(bloxScene.includes("BLOX_ASSET_KEYS.rowWipe"), "Blox drag preview should render generated row-clear art");
    assert.ok(bloxScene.includes("BLOX_ASSET_KEYS.columnWipe"), "Blox drag preview should render generated column-clear art");
  });

  it("fits Blox cells inside the generated board frame opening instead of over its border", () => {
    const fitted = { left: 14, top: 164, size: 584 };
    const layout = bloxBoardFrameLayout(fitted, 10);

    assert.equal(layout.cols, 10);
    assert.equal(layout.rows, 10);
    assert.ok(layout.left > layout.frame.left + layout.frame.width * 0.14);
    assert.ok(layout.top > layout.frame.top + layout.frame.height * 0.14);
    assert.ok(layout.left + layout.size < layout.frame.left + layout.frame.width * 0.86);
    assert.ok(layout.top + layout.size < layout.frame.top + layout.frame.height * 0.86);
    assert.ok(layout.cell < fitted.size / 10, "cell size should be derived from the inner opening, not the outer frame");
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
