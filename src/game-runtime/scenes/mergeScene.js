import {
  Container,
  Graphics,
  MERGE_CHAINS,
  getMergePairResult,
  createPointerSession,
  resolveAssetUrl,
  PANEL,
  TEXT,
  MUTED,
  MINT,
  AMBER,
  CORAL,
  SKY,
  viewWidth,
  viewHeight,
  reserveFromShellChrome,
  reserveBottomFromShellChrome,
  publishCanvasLayout,
  publishCanvasAssetLayout,
  clear,
  label,
  rect,
  sprite,
  loadGraphicsManifest,
  graphicsGameAsset,
  strokedRect,
  makeInteractive,
  fitGrid,
  cellFromPoint,
  makeSparkles,
  makeRipple,
  makeRafScheduler,
  setupStage,
  applyHudAssetRegion,
  tickParticles,
} from './shared/runtime.js';
import { loadRuntimeAssetManifest } from '../assetBundles.js';
import { BOARD_COLS, BOARD_ROWS, createEmptyMergeBoard } from '../../../game-logic.js';

const MERGE_TABLE_ART_ASPECT = 1536 / 1024;
const MERGE_BOARD_FRAME_ASPECT = 896 / 1152;

export function buildMergeScene(app, initial = {}) {
  const root = new Container();
  const dragLayer = new Container();
  const effects = new Container();
  app.stage.addChild(root, dragLayer, effects);
  let data = initial;
  let layout = null;
  let drag = null;
  let destroyed = false;
  let cellViews = [];
  let lastStaticKey = "";
  let lastBoardKeys = [];
  let assetVersion = 0;
  const dragVisual = makeRafScheduler(() => updateDragVisualNow());
  loadGraphicsManifest(() => {
    assetVersion += 1;
    if (!destroyed) draw();
  });
  loadRuntimeAssetManifest().then((manifest) => {
    if (!manifest || destroyed) return;
    assetVersion += 1;
    draw();
  });

  function renderStaticFrame() {
    app.render?.();
    if (!drag && effects.children.length === 0) {
      app.ticker.stop();
    }
  }

  const pointer = createPointerSession({
    onMove: (next) => {
      if (!drag) return;
      drag.x = next.x;
      drag.y = next.y;
      if (next.moved) {
        drag.moved = true;
        updateDragVisual();
      }
    },
    onTap: (done) => {
      const cell = done.data?.cell;
      const item = done.data?.item;
      drag = null;
      dragVisual.cancel();
      clear(dragLayer);
      if (cell) {
        const tapResult = data.onMergeCell?.(cell.r, cell.c, item);
        if (tapResult?.miss) {
          playMergeDropFeedback(done, { error: tapResult.error || "invalid merge" }, item);
        } else {
          const tone = item ? AMBER : MUTED;
          makeRipple(effects, done.x, done.y, tone, item ? 24 : 14);
          if (item) makeSparkles(effects, done.x, done.y, tone, 5);
        }
        app.ticker.start();
      }
      draw();
    },
    onDragEnd: (done) => {
      if (!drag) return;
      const current = drag;
      drag = null;
      dragVisual.cancel();
      clear(dragLayer);
      const target = cellFromPoint(layout, done.x, done.y);
      if (target) {
        data.onMergeDrop?.(current.fromR, current.fromC, target.row, target.col, current.item)?.then?.((result) => {
          playMergeDropFeedback(done, result, current.item);
        });
      }
      draw();
    },
    onCancel: () => {
      drag = null;
      dragVisual.cancel();
      clear(dragLayer);
      draw();
    },
  });

  function itemText(item) {
    if (!item) return "";
    const chain = MERGE_CHAINS[item.chainId];
    return chain?.emoji?.[item.level] || String((item.level || 0) + 1);
  }

  function itemAsset(item) {
    if (!item) return "";
    return item.asset
      || graphicsGameAsset("gachaMerge", "items", item.id)
      || resolveAssetUrl(`gachaMerge.items.${item.id}`, { legacyPath: "" });
  }

  function itemSignature(item) {
    if (!item) return "";
    return [
      item.id || item.itemId || "",
      item.chainId || "",
      item.level ?? "",
      item.asset || "",
      item.recipeId || item.recipe || "",
    ].join(":");
  }

  function mergeSceneAsset(section, id) {
    return graphicsGameAsset("gachaMerge", section, id)
      || resolveAssetUrl(`gachaMerge.${section}.${id}`, { legacyPath: "" });
  }

  function mergeCellAsset({ selected = false, matching = false, occupied = false } = {}) {
    if (selected) return mergeSceneAsset("ui", "cellSelected");
    if (matching) return mergeSceneAsset("ui", "cellTarget");
    return mergeSceneAsset("ui", occupied ? "cellOccupied" : "cellEmpty");
  }

  function sameMergeTarget(item, other) {
    return !!getMergePairResult(item, other);
  }

  function drawAlchemyTable(left, top, width, height, cell) {
    const stageWidth = viewWidth(app);
    const stageHeight = viewHeight(app);
    const tableAsset = mergeSceneAsset("background", "table");
    publishCanvasAssetLayout(app, "mergeTableAsset", { left: 0, top: 0, width: stageWidth, height: stageHeight });
    if (tableAsset) {
      const stageAspect = stageWidth / stageHeight;
      const drawWidth = stageAspect > MERGE_TABLE_ART_ASPECT ? stageWidth : stageHeight * MERGE_TABLE_ART_ASPECT;
      const drawHeight = stageAspect > MERGE_TABLE_ART_ASPECT ? stageWidth / MERGE_TABLE_ART_ASPECT : stageHeight;
      const table = sprite(tableAsset, stageWidth / 2, stageHeight / 2, drawWidth, drawHeight, 1);
      root.addChild(applyHudAssetRegion(table, data, "mergeTableAsset"));
      return;
    }
    root.addChild(
      new Graphics()
        .rect(0, 0, stageWidth, stageHeight)
        .fill({ color: 0xf2e6cf, alpha: 1 }),
    );
    const table = new Graphics()
      .roundRect(Math.max(4, left - cell * 1.7), Math.max(42, top - cell * 1.3), width + cell * 3.4, height + cell * 2.2, 24)
      .fill({ color: 0x8a6043, alpha: 0.96 })
      .stroke({ color: 0x4f3529, width: 3, alpha: 0.42 });
    root.addChild(table);
    root.addChild(
      new Graphics()
        .roundRect(left - cell * 0.9, top - cell * 0.62, width + cell * 1.8, height + cell * 1.08, 18)
        .fill({ color: 0xb58b5d, alpha: 0.68 })
        .stroke({ color: 0xf6d794, width: 2, alpha: 0.32 }),
    );
    for (let i = 0; i < 5; i += 1) {
      const y = top - cell * 0.36 + i * ((height + cell * 0.72) / 5);
      root.addChild(
        new Graphics()
          .moveTo(left - cell * 0.62, y)
          .lineTo(left + width + cell * 0.62, y + Math.sin(i) * 4)
          .stroke({ color: 0x5f3d2c, width: 1.5, alpha: 0.22 }),
      );
    }
    root.addChild(
      new Graphics()
        .ellipse(left + width + cell * 0.72, top + cell * 0.12, cell * 0.44, cell * 0.32)
        .fill({ color: 0x326b78, alpha: 0.2 }),
    );
    root.addChild(
      new Graphics()
        .circle(left - cell * 0.64, top + height + cell * 0.22, cell * 0.24)
        .fill({ color: 0x6bbf96, alpha: 0.18 }),
    );
  }

  function drawMergeItem(item, x, y, cell, alpha = 1, state = {}) {
    const level = item?.level || 0;
    const focused = !!state.selected || !!state.matching;
    const radius = Math.min(cell * (focused ? 0.48 : 0.46), focused ? 36 : 34);
    const fill = [0x9ed8b4, 0xf6c86d, 0xf29485, 0x8fc5e8, 0xcdb7e9, 0xf6b8d0, 0xffbf8f, 0xffefd0][level] || AMBER;
    const group = new Container();
    group.eventMode = "none";
    group.alpha = alpha;
    group.x = x;
    group.y = y;
    if (focused) {
      group.addChild(
        new Graphics()
          .circle(0, 0, radius * (state.selected ? 1.22 : 1.14))
          .fill({ color: state.selected ? AMBER : MINT, alpha: state.selected ? 0.16 : 0.12 })
          .stroke({ color: state.selected ? AMBER : MINT, width: Math.max(2, cell * 0.035), alpha: state.selected ? 0.58 : 0.46 }),
      );
      group.scale.set(state.selected ? 1.035 : 1.018);
    }
    group.addChild(
      new Graphics()
        .circle(0, 0, radius)
        .fill({ color: fill, alpha: 0.96 })
        .stroke({ color: TEXT, width: 2, alpha: 0.3 }),
    );
    const asset = itemAsset(item);
    if (asset) {
      group.addChild(sprite(asset, 0, 0, radius * 1.94, radius * 1.94, 0.98));
    } else {
      group.addChild(label(itemText(item), 0, -1, Math.max(20, cell * 0.46), TEXT));
    }
    const badge = new Graphics()
      .roundRect(radius * 0.18, radius * 0.18, radius * 1.05, radius * 0.68, 5)
      .fill({ color: PANEL, alpha: 0.92 })
      .stroke({ color: fill, width: 1.5, alpha: 0.75 });
    group.addChild(badge);
    group.addChild(label(`${data.mergeLevelPrefix || "L"}${level + 1}`, radius * 0.7, radius * 0.53, Math.max(9, cell * 0.15), TEXT));
    return group;
  }

  function drawBoardCell(container, board, r, c, cell, left, top, tapSourceItem) {
    clear(container);
    const item = board[r]?.[c];
    const selected = data.mergeSelected?.r === r && data.mergeSelected?.c === c;
    const matching = item && (
      (drag?.item && sameMergeTarget(drag.item, item) && !(drag.fromR === r && drag.fromC === c))
      || (tapSourceItem && sameMergeTarget(tapSourceItem, item) && !selected)
    );
    const color = item ? [0x9ed8b4, 0xf6c86d, 0xf29485, 0x8fc5e8, 0xcdb7e9, 0xf6b8d0, 0xffbf8f, 0xffefd0][item.level || 0] : 0xe3eddc;
    const tileX = left + c * cell + 2;
    const tileY = top + r * cell + 2;
    const tileSize = cell - 4;
    const tileAsset = mergeCellAsset({ selected, matching, occupied: !!item });
    const tile = tileAsset
      ? sprite(tileAsset, tileX + tileSize / 2, tileY + tileSize / 2, tileSize, tileSize, item ? 1 : 0.92)
      : matching || selected
        ? strokedRect(tileX, tileY, tileSize, tileSize, selected ? AMBER : MINT, 6, color, item ? 0.95 : 0.82, 3)
        : rect(tileX, tileY, tileSize, tileSize, color, 6, item ? 1 : 0.82);
    makeInteractive(tile, {
      pointerdown: (event) => {
        if (data.mergeLocked) return;
        if (!item) return;
        drag = { fromR: r, fromC: c, item, pointerId: event.pointerId, x: event.global.x, y: event.global.y, startX: event.global.x, startY: event.global.y, moved: false };
        pointer.start(event, { kind: "merge-cell", cell: { r, c }, item });
      },
    });
    container.addChild(tile);
    if (item && !(drag?.fromR === r && drag?.fromC === c)) {
      container.addChild(drawMergeItem(item, left + c * cell + cell / 2, top + r * cell + cell / 2, cell, 1, { selected, matching }));
    }
  }

  function drawTapSelectionLinks(board, tapSourceItem) {
    const selected = data.mergeSelected;
    if (!selected || !tapSourceItem || !layout) return;
    const sourceX = layout.left + selected.c * layout.cell + layout.cell / 2;
    const sourceY = layout.top + selected.r * layout.cell + layout.cell / 2;
    const glowAsset = mergeSceneAsset("fx", "recipeGlow");
    for (let r = 0; r < layout.rows; r += 1) {
      for (let c = 0; c < layout.cols; c += 1) {
        const item = board[r]?.[c];
        if (!item || (selected.r === r && selected.c === c) || !sameMergeTarget(tapSourceItem, item)) continue;
        const targetX = layout.left + c * layout.cell + layout.cell / 2;
        const targetY = layout.top + r * layout.cell + layout.cell / 2;
        root.addChild(
          new Graphics()
            .moveTo(sourceX, sourceY)
            .quadraticCurveTo((sourceX + targetX) / 2, Math.min(sourceY, targetY) - layout.cell * 0.34, targetX, targetY)
            .stroke({ color: MINT, width: 3, alpha: 0.36 }),
        );
        if (glowAsset) {
          root.addChild(sprite(glowAsset, targetX, targetY, layout.cell * 0.86, layout.cell * 0.86, 0.5));
        } else {
          root.addChild(
            new Graphics()
              .circle(targetX, targetY, layout.cell * 0.38)
              .stroke({ color: MINT, width: 3, alpha: 0.38 }),
          );
        }
      }
    }
  }

  function playMergeDropFeedback(point, result = {}, item = null) {
    const success = !result?.error;
    const color = success ? MINT : CORAL;
    makeSparkles(effects, point.x, point.y, color, success ? 9 : 6);
    makeRipple(effects, point.x, point.y, color, success ? 24 : 20);
    if (!success) {
      const reject = label(data.mergeMissText || "miss", point.x, point.y - 22, 13, CORAL);
      reject._tween = { fromX: reject.x, fromY: reject.y, toX: reject.x + 12, toY: reject.y - 18, duration: 18, fade: true, scaleFrom: 0.9, scaleTo: 1.05 };
      effects.addChild(reject);
      app.ticker.start();
      return;
    }
    const level = Number(result?.newItem?.level ?? item?.level ?? 0) + 1;
    const pop = label(`${data.mergeLevelPrefix || "L"}${level + 1}`, point.x, point.y - 26, 15, AMBER);
    pop._tween = { fromX: pop.x, fromY: pop.y, toX: pop.x, toY: pop.y - 34, duration: 24, fade: true, scaleFrom: 0.7, scaleTo: 1.22 };
    effects.addChild(pop);
    if (result?.yardDrop) {
      const perfect = label(data.mergePerfectText || "Perfect reaction", point.x, point.y - 48, 14, AMBER);
      perfect._tween = { fromX: perfect.x, fromY: perfect.y, toX: perfect.x, toY: perfect.y - 38, duration: 30, fade: true, scaleFrom: 0.76, scaleTo: 1.16 };
      effects.addChild(perfect);
    }
    const essenceReward = Math.max(0, Math.floor(Number(result?.essenceReward) || 0));
    if (essenceReward > 0) {
      const essenceAsset = mergeSceneAsset("fx", "essenceOrb");
      if (essenceAsset) {
        const orb = sprite(essenceAsset, point.x, point.y - 12, 25, 25, 0.82);
        orb._tween = { fromX: orb.x, fromY: orb.y, toX: orb.x, toY: orb.y - 32, duration: 24, fade: true, scaleFrom: 0.64, scaleTo: 0.98 };
        effects.addChild(orb);
      }
      const essencePop = label(`+${essenceReward}`, point.x + 19, point.y - 16, 13, SKY);
      essencePop._tween = { fromX: essencePop.x, fromY: essencePop.y, toX: essencePop.x + 2, toY: essencePop.y - 28, duration: 24, fade: true, scaleFrom: 0.7, scaleTo: 1.06 };
      effects.addChild(essencePop);
      makeSparkles(effects, point.x + 8, point.y - 8, SKY, 4);
    }
    for (let i = 0; i < 4; i += 1) {
      const angle = -Math.PI / 2 + (i - 1.5) * 0.32;
      const shard = new Graphics()
        .roundRect(-3, -9, 6, 18, 4)
        .fill({ color: [MINT, AMBER, SKY, 0xcdb7e9][i % 4], alpha: 0.88 });
      shard.x = point.x;
      shard.y = point.y;
      shard.rotation = angle;
      shard._vx = Math.cos(angle) * (1.5 + i * 0.1);
      shard._vy = Math.sin(angle) * (2 + i * 0.12);
      shard._gravity = 0.09;
      shard._spin = 0.08 * (i % 2 ? 1 : -1);
      shard._life = 25 + i;
      effects.addChild(shard);
    }
    app.ticker.start();
  }

  function updateDragVisualNow() {
    clear(dragLayer);
    if (!drag?.item) return;
    const lift = Math.min(layout?.cell || 58, 52) * 0.38;
    const board = data.merge?.board || [];
    const glowAsset = mergeSceneAsset("fx", "recipeGlow");
    for (let r = 0; r < (layout?.rows || 0); r += 1) {
      for (let c = 0; c < (layout?.cols || 0); c += 1) {
        const item = board[r]?.[c];
        if (!item || (drag.fromR === r && drag.fromC === c) || !sameMergeTarget(drag.item, item)) continue;
        const targetX = layout.left + c * layout.cell + layout.cell / 2;
        const targetY = layout.top + r * layout.cell + layout.cell / 2;
        dragLayer.addChild(
          new Graphics()
            .moveTo(drag.x, drag.y - lift * 0.4)
            .quadraticCurveTo((drag.x + targetX) / 2, Math.min(drag.y, targetY) - layout.cell * 0.54, targetX, targetY)
            .stroke({ color: MINT, width: 3, alpha: 0.4 }),
        );
        if (glowAsset) {
          dragLayer.addChild(sprite(glowAsset, targetX, targetY, layout.cell * 0.88, layout.cell * 0.88, 0.62));
        } else {
          dragLayer.addChild(
            new Graphics()
              .circle(targetX, targetY, layout.cell * 0.42)
              .stroke({ color: MINT, width: 4, alpha: 0.46 }),
          );
        }
      }
    }
    dragLayer.addChild(drawMergeItem(drag.item, drag.x, drag.y - lift, layout?.cell || 58, 0.94));
    dragLayer.addChild(
      new Graphics()
        .circle(drag.x, drag.y, Math.max(5, (layout?.cell || 48) * 0.12))
        .fill({ color: TEXT, alpha: 0.18 }),
    );
    const target = cellFromPoint(layout, drag.x, drag.y);
    if (target) {
      dragLayer.addChild(strokedRect(layout.left + target.col * layout.cell + 2, layout.top + target.row * layout.cell + 2, layout.cell - 4, layout.cell - 4, MINT, 6, 0xf7efe0, 0.58, 3));
    }
    app.render?.();
  }

  function updateDragVisual() {
    dragVisual.request();
  }

  function draw() {
    const merge = data.merge || {};
    const board = merge.board || createEmptyMergeBoard();
    const cols = BOARD_COLS;
    const rows = BOARD_ROWS;
    const reservedTop = reserveFromShellChrome(app, ".merge-scene-hud", 88);
    const reservedBottom = reserveBottomFromShellChrome(app, ".merge-action-area", data.mergeBottomReserve || 176);
    const roomyBoard = viewWidth(app) >= 700 && viewHeight(app) >= 720;
    const fitted = fitGrid(app, cols, rows, roomyBoard ? 10 : 12, reservedBottom + 8, {
      reservedTop,
      verticalAnchor: 0.5,
      minCell: 34,
      maxCell: roomyBoard ? 96 : 82,
    });
    layout = { ...fitted, cols, rows };
    const { cell, left, top, width, height } = fitted;
    publishCanvasLayout(app, "merge", { top, left, size: Math.max(width, height) });
    if (app.canvas?.dataset) {
      app.canvas.dataset.mergeBoardRows = String(rows);
      app.canvas.dataset.mergeBoardCols = String(cols);
      app.canvas.dataset.mergeBoardWidth = String(Math.round(width * 100) / 100);
      app.canvas.dataset.mergeBoardCell = String(Math.round(cell * 100) / 100);
      app.canvas.dataset.mergeBoardHeight = String(Math.round(height * 100) / 100);
    }
    const tapSourceItem = data.mergeSelected
      ? board[data.mergeSelected.r]?.[data.mergeSelected.c]
      : null;
    const staticKey = [
      Math.round(left * 100) / 100,
      Math.round(top * 100) / 100,
      Math.round(cell * 100) / 100,
      Math.round(width * 100) / 100,
      Math.round(height * 100) / 100,
      data.mergeSelected ? `${data.mergeSelected.r}:${data.mergeSelected.c}` : "",
      drag?.item ? itemSignature(drag.item) : "",
      data.trashMode ? "trash" : "merge",
      assetVersion,
    ].join("|");
    const boardKeys = Array.from({ length: rows }, (_, r) => (
      Array.from({ length: cols }, (_, c) => itemSignature(board[r]?.[c]))
    ));
    const canPatchBoard = lastStaticKey === staticKey
      && cellViews.length === rows
      && cellViews.every((row) => row.length === cols);
    if (canPatchBoard) {
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (lastBoardKeys[r]?.[c] === boardKeys[r][c]) continue;
          drawBoardCell(cellViews[r][c], board, r, c, cell, left, top, tapSourceItem);
        }
      }
      lastBoardKeys = boardKeys;
      if (drag) updateDragVisual();
      else clear(dragLayer);
      renderStaticFrame();
      return;
    }
    clear(root);
    drawAlchemyTable(left, top, width, height, cell);
    const boardFrameAsset = mergeSceneAsset("ui", "boardFrame");
    if (boardFrameAsset) {
      const frameHeight = height + cell * 1.08;
      const frameWidth = Math.max(width + cell * 1.05, frameHeight * MERGE_BOARD_FRAME_ASPECT);
      if (app.canvas?.dataset) {
        app.canvas.dataset.mergeBoardFrameWidth = String(Math.round(frameWidth * 100) / 100);
        app.canvas.dataset.mergeBoardFrameHeight = String(Math.round(frameHeight * 100) / 100);
      }
      publishCanvasAssetLayout(app, "mergeBoardFrameAsset", { left: left + width / 2 - frameWidth / 2, top: top + height / 2 - frameHeight / 2, width: frameWidth, height: frameHeight });
      const frame = sprite(boardFrameAsset, left + width / 2, top + height / 2, frameHeight, frameWidth, 1);
      frame.rotation = Math.PI / 2;
      root.addChild(applyHudAssetRegion(frame, data, "mergeBoardFrameAsset"));
    } else {
      root.addChild(
        new Graphics()
          .roundRect(left - 10, top - 10, width + 20, height + 20, 18)
          .fill({ color: 0xeee5cf, alpha: 0.72 })
          .stroke({ color: 0x5d4634, width: 2, alpha: 0.25 }),
      );
    }
    drawTapSelectionLinks(board, tapSourceItem);
    cellViews = [];
    for (let r = 0; r < rows; r++) {
      const rowViews = [];
      for (let c = 0; c < cols; c++) {
        const cellContainer = new Container();
        drawBoardCell(cellContainer, board, r, c, cell, left, top, tapSourceItem);
        root.addChild(cellContainer);
        rowViews.push(cellContainer);
      }
      cellViews.push(rowViews);
    }
    lastStaticKey = staticKey;
    lastBoardKeys = boardKeys;
    if (drag) updateDragVisual();
    else clear(dragLayer);
    renderStaticFrame();
  }

  const cleanup = setupStage(app, pointer.move, pointer.end, () => pointer.cancel("stage"));
  const ticker = () => {
    tickParticles(effects);
    if (!drag && effects.children.length === 0) {
      app.render?.();
      app.ticker.stop();
    }
  };
  app.ticker.add(ticker);
  draw();
  return {
    update(next) {
      data = next || {};
      if (drag) updateDragVisual();
      else draw();
    },
    destroy() {
      destroyed = true;
      cleanup();
      app.ticker.remove(ticker);
      dragVisual.cancel();
      pointer.cancel("destroy");
      clear(root);
      clear(dragLayer);
      clear(effects);
      root.destroy({ children: true });
      dragLayer.destroy({ children: true });
      effects.destroy({ children: true });
    },
  };
}
