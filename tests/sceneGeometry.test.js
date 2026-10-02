import {composeBubbo,bubboFieldGeometry} from "../src/games/bubbo/bubboComposition.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { composeBlox } from "../src/games/blox/bloxComposition.js";
import { BLOX_ART, BLOX_BLOCK_ART, BLOX_PIXI_ASSETS, BLOX_NINE_SLICE } from "../src/games/blox/bloxArt.js";
import {
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

  it("keeps Bubbo v2 token geometry, launch origin and non-overlapping HUD composition", () => {
    const fieldSource = fs.readFileSync(path.join(__dirname, "..", "src/games/bubbo/BubboField.jsx"), "utf8");
    const artSource = fs.readFileSync(path.join(__dirname, "..", "src/games/bubbo/bubboArt.js"), "utf8");
    assert.ok(fieldSource.includes("traceBubboShot"), "guide and flight share analytical collision geometry");
    assert.ok(fieldSource.includes("resizeBubboFlight"), "in-flight geometry follows resize");
    assert.ok(fieldSource.includes("prefers-reduced-motion"), "fall effects honor reduced motion");
    assert.ok(artSource.includes("/games/bubbo-v2/"), "individual v2 tokens replace the old sheet");
    for (const [width,height] of [[320,568],[390,844],[568,320],[844,390],[768,1024],[1280,720]]) {
      const layout = composeBubbo({width,height});
      const geometry = bubboFieldGeometry(layout.field.width,layout.field.height);
      assert.ok(geometry.cell >= 20, `${width}x${height} bubbles remain readable`);
      assert.ok(geometry.cannonY > geometry.dangerY + geometry.radius, "launcher stays below danger cells");
      const separated = layout.hud.top + layout.hud.height <= layout.field.top || layout.field.left + layout.field.width <= layout.hud.left;
      assert.ok(separated, "HUD does not cover the shot field");
    }
  });

  it("wires final-state Blox and Farm art through asset keys instead of shape-only placeholders", () => {
    const scenes = readSceneRuntimeText();
    const bloxScene = fs.readFileSync(path.join(__dirname, "..", "src", "game-runtime", "scenes", "bloxScene.js"), "utf-8");

    assert.equal(LEGACY_ASSET_PATHS["blox.cell_empty"], "/games/blox/cell_empty.png");
    assert.equal(LEGACY_ASSET_PATHS["farm.crops.strawberry_ready"], "/games/farm/crops/strawberry_ready.png");
    assert.ok(GAME_ASSET_BUNDLES.blox.includes("blox.cell_empty"), "Blox preload fallback should include generated cell art");
    assert.ok(GAME_ASSET_BUNDLES.farm.includes("farm.crops.strawberry_ready"), "Farm preload fallback should include generated crop art");
    assert.equal(BLOX_BLOCK_ART["#60a5fa"], "/games/blox-v2/tiles/blue.webp");
    assert.equal(Object.keys(BLOX_BLOCK_ART).length, 9, "Blox v2 should retain all color-to-generated-tile mappings");
    assert.ok(BLOX_PIXI_ASSETS.includes(BLOX_ART.energy), "Blox v2 must preload generated row/column energy art");
    assert.ok(BLOX_PIXI_ASSETS.includes(BLOX_ART.burst), "Blox v2 must preload generated clear burst art");
    assert.ok(bloxScene.includes('bloxArtUrl("energy")'), "Blox clear effects should resolve generated energy art");
    assert.ok(bloxScene.includes("drawTrayPiece"), "Blox tray previews should render from live piece cells");
    assert.ok(!bloxScene.includes("BLOX_PIECE_ASSET_BY_ID"), "Blox tray previews should not use mismatched fixed preview sprites");
    assert.ok(scenes.includes("FARM_CROP_SLUGS"), "Farm should map crop ids to generated crop sprite paths");
    assert.ok(scenes.includes("FARM_ASSET_KEYS.backgroundField"), "Farm should render the generated field background");
  });

  it("renders Blox predicted row and column clears during drag preview", () => {
    const bloxScene = fs.readFileSync(path.join(__dirname, "..", "src", "game-runtime", "scenes", "bloxScene.js"), "utf-8");

    assert.ok(bloxScene.includes("previewBloxPlacement"), "Blox drag preview should use the domain placement preview");
    const dragPreview = bloxScene.slice(bloxScene.indexOf("function updateDragVisualNow"), bloxScene.indexOf("function g()"));
    assert.match(dragPreview, /\?\.clear\.rows/, "Blox drag preview should inspect predicted row clears");
    assert.match(dragPreview, /\?\.clear\.cols/, "Blox drag preview should inspect predicted column clears");
    assert.ok(dragPreview.includes('bloxArtUrl("energy")'), "Blox row preview should use generated energy art");
    assert.ok(dragPreview.includes("createBloxEnergyLine("), "Blox column preview should rotate the generated energy art");
    assert.match(bloxScene, /rotation\s*=\s*Math\.PI\s*\/\s*2/, "Blox column-clear art must be vertical");
  });

  it("fits Blox v2 cells inside the nine-slice frame without shrinking gameplay to the legacy opening", () => {
    for (const [width, height] of [[320, 568], [390, 844], [568, 320], [844, 390], [768, 1024], [1024, 768]]) {
      const composition = composeBlox({ width, height, safe: {} });
      const { board, frame, frameInset } = composition;
      assert.equal(board.cols, 10);
      assert.equal(board.rows, 10);
      assert.equal(board.left, frame.left + frameInset);
      assert.equal(board.top, frame.top + frameInset);
      assert.equal(board.size, frame.width - frameInset * 2);
      assert.equal(board.cell, board.size / 10);
      assert.ok(frameInset >= BLOX_NINE_SLICE.frame.destination[0], "board must clear the destination nine-slice border");
      assert.ok(board.cell > 0);
      assert.ok(board.left + board.size <= width && board.top + board.size <= height);
    }
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
