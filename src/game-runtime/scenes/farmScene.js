import {
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TilingSprite,
  Texture,
  CROPS,
  MERGE_CHAINS,
  getMergePairResult,
  createPointerSession,
  BUBBO_COLORS,
  BUBBO_COLS,
  BUBBO_PALETTE,
  BUBBO_ROWS,
  generateBubboWave,
  getAssistedBubboAim,
  getBubboNeighbors,
  getBubboRowVisualOffset,
  BOARD_SIZE,
  DROP_ICONS,
  GEM_ICONS,
  MATCH3_TIMING,
  match3StepStartFrame,
  GRID,
  canPlaceBloxPiece,
  resolveAssetUrl,
  GEM_COLORS,
  BUBBO_ASSET_KEYS,
  BUBBO_BALL_SHEET_WIDTH,
  BUBBO_BALL_SHEET_HEIGHT,
  BUBBO_BALL_ROWS,
  BUBBO_BALL_FRAMES,
  BUBBO_BALL_DRAW_SCALE,
  BUBBO_BUBBLE_ASSETS,
  POTION_PIECE_ASSETS,
  FARM_SOIL,
  PANEL,
  PANEL_2,
  FIELD,
  TEXT,
  MUTED,
  MINT,
  AMBER,
  CORAL,
  SKY,
  BUBBO_NUMBERS,
  BUBBO_BACKGROUND_THEMES,
  viewWidth,
  viewHeight,
  shellElement,
  reserveFromShellChrome,
  reserveBottomFromShellChrome,
  publishCanvasLayout,
  currentUiTheme,
  clear,
  destroyLater,
  label,
  rect,
  sprite,
  bubboBallFrame,
  bubboBallTexture,
  gameAsset,
  loadGraphicsManifest,
  tiledSprite,
  strokedRect,
  colorNumber,
  makeInteractive,
  fit,
  fitWithTopReserve,
  fitGrid,
  cellFromPoint,
  centeredPieceOrigin,
  isAdjacentMatch3Cell,
  match3TargetFromGesture,
  cropProgress,
  makeSparkles,
  cellCenter,
  makeTween,
  drawBubboBackground,
  makeRipple,
  makeRafScheduler,
  setupStage,
  bloxAnchorCellFromDrag,
  bloxGhostOrigin,
  bloxPieceBounds,
  createBloxDragState,
  tickParticles
} from './shared/runtime.js';

export function buildFarmScene(app, initial = {}) {
  const root = new Container();
  const effects = new Container();
  app.stage.addChild(root, effects);
  let data = initial;
  let hold = null;
  let layout = null;
  let suppressTap = false;

  function finishHold(cancelled = false) {
    if (!hold) return;
    window.clearTimeout(hold.timer);
    const completed = hold.completed;
    hold = null;
    if (!cancelled && completed) data.onFarmLongPress?.(completed.index, completed.plot);
  }

  const pointer = createPointerSession({
    tapDistance: 12,
    onMove: (next) => {
      if (hold && next.distance > 14) finishHold(true);
    },
    onTap: (done) => {
      if (suppressTap) {
        suppressTap = false;
        return;
      }
      const item = done.data || {};
      data.onFarmPlot?.(item.index, item.plot);
      makeSparkles(effects, item.x, item.y, item.ready ? AMBER : MINT, 6);
      draw();
    },
    onDragEnd: () => finishHold(true),
    onCancel: () => finishHold(true),
  });

  function draw() {
    clear(root);
    const snapshot = data.snapshot || {};
    const farm = snapshot.farm || {};
    const plots = farm.plots || [];
    const labels = data.farmLabels || {};
    const now = Date.now();
    const cols = 4;
    const rows = Math.max(2, Math.ceil(Math.max(plots.length, 6) / cols));
    const fitted = fit(app, cols, rows, 16, 10);
    layout = { ...fitted, cols, rows };
    const { cell, left, top } = fitted;
    root.addChild(rect(left - 10, top - 10, cell * cols + 20, cell * rows + 20, PANEL, 14));

    for (let i = 0; i < rows * cols; i++) {
      const plot = plots[i];
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = left + c * cell + 5;
      const y = top + r * cell + 5;
      const w = cell - 10;
      const progress = cropProgress(plot, now);
      const planted = !!plot?.crop;
      const ready = planted && progress >= 1;
      const isHolding = hold?.index === i;
      const tile = isHolding
        ? strokedRect(x, y, w, w, CORAL, 12, planted ? 0x234b2f : FARM_SOIL[i % FARM_SOIL.length])
        : rect(x, y, w, w, planted ? 0x234b2f : FARM_SOIL[i % FARM_SOIL.length], 12);
      makeInteractive(tile, {
        pointerdown: (event) => {
          if (!plot) return;
          suppressTap = false;
          const timer = window.setTimeout(() => {
            if (!hold || hold.index !== i || !plot.crop || ready) return;
            hold.completed = { index: i, plot };
            suppressTap = true;
            data.onFarmLongPress?.(i, plot);
            makeSparkles(effects, x + w / 2, y + w / 2, CORAL, 8);
            draw();
          }, 1200);
          hold = { index: i, plot, timer, completed: null };
          pointer.start(event, { kind: "farm-plot", index: i, plot, x: x + w / 2, y: y + w / 2, ready });
        },
      });
      root.addChild(tile);

      if (!plot) {
        root.addChild(label("+", x + w / 2, y + w / 2, 22, MUTED));
        continue;
      }
      if (!planted) {
        root.addChild(label(labels.soil || "soil", x + w / 2, y + w / 2, Math.max(10, cell * 0.13), 0xc69b61));
        continue;
      }

      const cfg = CROPS[plot.crop] || {};
      root.addChild(new Graphics().roundRect(x + w * 0.42, y + w * 0.38, w * 0.16, w * 0.34, 4).fill(0x61bd62));
      root.addChild(label(cfg.emoji || labels.seed || "seed", x + w / 2, y + w * 0.34, Math.max(18, cell * 0.28)));
      root.addChild(rect(x + w * 0.15, y + w * 0.78, w * 0.7, 6, 0x17231d, 6));
      root.addChild(rect(x + w * 0.15, y + w * 0.78, w * 0.7 * progress, 6, ready ? AMBER : MINT, 6));
      root.addChild(label(ready ? labels.ready || "READY" : isHolding ? labels.uproot || "UPROOT" : plot.watered ? labels.watered || "watered" : `${Math.round(progress * 100)}%`, x + w / 2, y + w * 0.9, Math.max(8, cell * 0.1), ready ? AMBER : isHolding ? CORAL : MUTED));
    }
  }

  function _handleStageTap(event) {
    if (suppressTap) return;
    const cell = cellFromPoint(layout, event.global.x, event.global.y);
    if (!cell) return;
    const index = cell.row * layout.cols + cell.col;
    const plot = data.snapshot?.farm?.plots?.[index];
    if (!plot) return;
    data.onFarmPlot?.(index, plot);
    makeSparkles(effects, layout.left + cell.col * layout.cell + layout.cell / 2, layout.top + cell.row * layout.cell + layout.cell / 2, MINT, 6);
    draw();
  }

  const cleanup = setupStage(app, pointer.move, pointer.end, () => pointer.cancel("stage"));
  const ticker = () => tickParticles(effects);
  app.ticker.add(ticker);
  draw();
  return {
    update(next) {
      data = next || {};
      draw();
    },
    destroy() {
      cleanup();
      app.ticker.remove(ticker);
      pointer.cancel("destroy");
      finishHold(true);
      clear(root);
      clear(effects);
      root.destroy({ children: true });
      effects.destroy({ children: true });
      layout = null;
    },
  };
}
