import { Container, Graphics, Rectangle, Sprite, Text, TilingSprite, Texture } from "pixi.js";
import { CROPS, MERGE_CHAINS, getMergePairResult } from "../../game-logic.js";
import { createPointerSession } from "./pointerSession.js";
import {
  BUBBO_COLORS,
  BUBBO_COLS,
  BUBBO_PALETTE,
  BUBBO_ROWS,
  generateBubboWave,
  getBubboNeighbors,
  getBubboRowVisualOffset,
} from "../game-core/bubbo/engine.js";
import { BOARD_SIZE, DROP_ICONS, GEM_ICONS } from "../game-core/match3/engine.js";
import { MATCH3_TIMING, match3StepStartFrame } from "../game-core/match3/animation.js";
import { GRID } from "../game-core/blox/pieces.js";
import { canPlace as canPlaceBloxPiece } from "../game-core/blox/engine.js";
import { resolveAssetUrl } from "./assetBundles.js";
import {
  bloxAnchorCellFromDrag,
  bloxGhostOrigin,
  bloxPieceBounds,
  createBloxDragState,
  tickParticles,
} from "./sceneGeometry.js";
export {
  bloxAnchorCellFromDrag,
  bloxGhostOrigin,
  bloxPieceBounds,
  createBloxDragState,
  tickParticles,
} from "./sceneGeometry.js";

const GEM_COLORS = {
  fire: 0xffa986,
  water: 0x93c8f4,
  earth: 0x9ed8b4,
  air: 0xd7e9ef,
  light: 0xf8d781,
  dark: 0xcdb7e9,
  drop_gold: 0xf6c86d,
  drop_seeds: 0xa8d97a,
  drop_energy: 0x8fd6ee,
  special_row: 0xf6c86d,
  special_column: 0x8fc5e8,
  special_blast: 0xf29485,
  special_colour: 0xcdb7e9,
};

const BUBBO_ASSET_KEYS = {
  ballSheet: "bubbo.balls.sheet",
  backgroundTile: "bubbo.background.tile",
  bottomTray: "bubbo.bottomTray",
  cannonMain: "bubbo.cannon.main",
};
const BUBBO_BALL_SHEET_WIDTH = 1672;
const BUBBO_BALL_SHEET_HEIGHT = 941;
const BUBBO_BALL_ROWS = {
  coral: 0,
  sky: 1,
  mint: 2,
  amber: 3,
  berry: 4,
};
const BUBBO_BALL_FRAMES = {
  idle: [
    { x: 174, y: 36, w: 161, h: 162 },
    { x: 174, y: 224, w: 161, h: 162 },
    { x: 174, y: 406, w: 161, h: 162 },
    { x: 174, y: 585, w: 160, h: 159 },
    { x: 174, y: 759, w: 161, h: 159 },
  ],
  glow: [
    { x: 952, y: 14, w: 215, h: 194 },
    { x: 960, y: 208, w: 205, h: 186 },
    { x: 950, y: 394, w: 221, h: 182 },
    { x: 952, y: 576, w: 221, h: 172 },
    { x: 950, y: 748, w: 226, h: 172 },
  ],
  burst: [
    { x: 1240, y: 24, w: 255, h: 177 },
    { x: 1242, y: 221, w: 254, h: 170 },
    { x: 1231, y: 407, w: 270, h: 164 },
    { x: 1239, y: 583, w: 256, h: 163 },
    { x: 1235, y: 758, w: 263, h: 163 },
  ],
};
const BUBBO_BALL_DRAW_SCALE = 2.42;
const bubboBallTextureCache = new Map();
const BUBBO_BUBBLE_ASSETS = {
  mint: "bubbo.bubble.green",
  amber: "bubbo.bubble.yellow",
  coral: "bubbo.bubble.red",
  sky: "bubbo.bubble.blue",
};

const POTION_PIECE_ASSETS = {
  fire: "match3.piece.dragon",
  water: "match3.piece.frog",
  earth: "match3.piece.newt",
  air: "match3.piece.snake",
  light: "match3.piece.spider",
  dark: "match3.piece.yeti",
  special_row: "match3.special.row",
  special_column: "match3.special.column",
  special_blast: "match3.special.blast",
  special_colour: "match3.special.colour",
};

let graphicsManifest = null;
let graphicsManifestPromise = null;

const FARM_SOIL = [0x7b4f2d, 0x8b5c34, 0x684022];
const PANEL = 0xfff1f4;
const PANEL_2 = 0xeef5e5;
const FIELD = 0xf8e5ea;
const TEXT = 0x243044;
const MUTED = 0x687463;
const MINT = 0x8fcf9d;
const AMBER = 0xe7bd69;
const CORAL = 0xdc7a85;
const SKY = 0x8bbfd9;
const BUBBO_NUMBERS = Object.fromEntries(
  Object.entries(BUBBO_PALETTE).map(([name, value]) => [name, Number.parseInt(value.slice(1), 16)]),
);
const BUBBO_BACKGROUND_THEMES = {
  light: {
    outer: 0xf6eee6,
    panel: 0xeaf4df,
    stroke: 0xb8c89d,
    pattern: 0x6f9d78,
    finish: 0xc97884,
    cannonPanel: 0xf2eadb,
    tileAlpha: 0.055,
    lineAlpha: 0.085,
  },
  dark: {
    outer: 0x101416,
    panel: 0x162024,
    stroke: 0x36595d,
    pattern: 0x92c8af,
    finish: 0xe08b93,
    cannonPanel: 0x223036,
    tileAlpha: 0.035,
    lineAlpha: 0.09,
  },
};

function viewWidth(app) {
  return app.screen?.width || app.renderer.width;
}

function viewHeight(app) {
  return app.screen?.height || app.renderer.height;
}

function shellElement(app) {
  if (typeof document === "undefined") return null;
  return app.canvas?.closest?.(".game-shell") || null;
}

function reserveFromShellChrome(app, selector, fallback = 0) {
  const canvasRect = app.canvas?.getBoundingClientRect?.();
  const chromeRect = shellElement(app)?.querySelector?.(selector)?.getBoundingClientRect?.();
  if (!canvasRect || !chromeRect || chromeRect.height <= 0) return fallback;
  const reserve = chromeRect.bottom - canvasRect.top + 8;
  return Math.max(fallback, Math.ceil(reserve));
}

function reserveBottomFromShellChrome(app, selector, fallback = 0) {
  const canvasRect = app.canvas?.getBoundingClientRect?.();
  const chromeRect = shellElement(app)?.querySelector?.(selector)?.getBoundingClientRect?.();
  if (!canvasRect || !chromeRect || chromeRect.height <= 0) return fallback;
  const reserve = canvasRect.bottom - chromeRect.top + 8;
  return Math.max(fallback, Math.ceil(reserve));
}

function publishCanvasLayout(app, name, layout) {
  const dataset = app.canvas?.dataset;
  if (!dataset || !layout) return;
  const prefix = name === "match3" ? "match3" : name;
  dataset[`${prefix}BoardTop`] = String(Math.round(layout.top * 100) / 100);
  dataset[`${prefix}BoardLeft`] = String(Math.round(layout.left * 100) / 100);
  dataset[`${prefix}BoardSize`] = String(Math.round(layout.size * 100) / 100);
}

function currentUiTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-ui-theme") === "dark" ? "dark" : "light";
}

function clear(container) {
  for (const child of container.removeChildren()) {
    destroyLater(child);
  }
}

function destroyLater(child) {
  const run = () => {
    if (!child?.destroyed) child.destroy({ children: true });
  };
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(run));
  } else {
    setTimeout(run, 0);
  }
}

function label(text, x, y, size = 16, fill = TEXT, weight = "800") {
  const item = new Text({
    text: String(text),
    style: {
      fill,
      fontFamily: "Nunito, Varela Round, sans-serif",
      fontSize: size,
      fontWeight: weight,
      align: "center",
    },
  });
  item.anchor.set(0.5);
  item.x = x;
  item.y = y;
  item.eventMode = "none";
  return item;
}

function rect(x, y, w, h, color, radius = 8, alpha = 1) {
  return new Graphics().roundRect(x, y, w, h, radius).fill({ color, alpha });
}

function sprite(path, x, y, width, height, alpha = 1) {
  const item = Sprite.from(path);
  item.anchor.set(0.5);
  item.x = x;
  item.y = y;
  item.width = width;
  item.height = height;
  item.alpha = alpha;
  item.eventMode = "none";
  return item;
}

function bubboBallFrame(bounds, { padding = 8, square = false } = {}) {
  const frameWidth = bounds.w + padding * 2;
  const frameHeight = bounds.h + padding * 2;
  const size = square ? Math.max(frameWidth, frameHeight) : null;
  const width = size || frameWidth;
  const height = size || frameHeight;
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;
  const x = Math.max(0, Math.min(BUBBO_BALL_SHEET_WIDTH - width, Math.round(centerX - width / 2)));
  const y = Math.max(0, Math.min(BUBBO_BALL_SHEET_HEIGHT - height, Math.round(centerY - height / 2)));
  return new Rectangle(x, y, width, height);
}

function bubboBallTexture(colorName, variant = "idle") {
  const row = BUBBO_BALL_ROWS[colorName];
  const bounds = BUBBO_BALL_FRAMES[variant]?.[row];
  if (row == null || !bounds) return null;
  const cacheKey = `${colorName}:${variant}`;
  if (bubboBallTextureCache.has(cacheKey)) return bubboBallTextureCache.get(cacheKey);

  const frameRect = bubboBallFrame(bounds, {
    padding: variant === "idle" ? 12 : 5,
    square: variant === "idle",
  });
  const base = Texture.from(gameAsset(BUBBO_ASSET_KEYS.ballSheet));
  const texture = new Texture({
    source: base.source,
    frame: frameRect,
    orig: new Rectangle(0, 0, frameRect.width, frameRect.height),
  });
  bubboBallTextureCache.set(cacheKey, texture);
  return texture;
}

function gameAsset(path) {
  return resolveAssetUrl(path);
}

function loadGraphicsManifest(onReady) {
  if (graphicsManifest || typeof fetch !== "function") return;
  if (!graphicsManifestPromise) {
    graphicsManifestPromise = fetch("/assets/manifest.json", { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
  }
  graphicsManifestPromise.then((manifest) => {
    if (!manifest) return;
    graphicsManifest = manifest;
    onReady?.();
  });
}

function tiledSprite(path, x, y, width, height, alpha = 1) {
  const item = new TilingSprite({
    texture: Texture.from(path),
    width,
    height,
  });
  item.x = x;
  item.y = y;
  item.alpha = alpha;
  item.eventMode = "none";
  return item;
}

function strokedRect(x, y, w, h, color, radius = 8, fill = FIELD, alpha = 1, width = 2) {
  return new Graphics()
    .roundRect(x, y, w, h, radius)
    .fill({ color: fill, alpha })
    .stroke({ color, alpha: 0.95, width });
}

function colorNumber(value, fallback = MINT) {
  return Number.parseInt(String(value || "").replace("#", ""), 16) || fallback;
}

function makeInteractive(g, handlers = {}) {
  g.eventMode = "static";
  g.cursor = "pointer";
  for (const [event, handler] of Object.entries(handlers)) {
    g.on(event, (payload) => {
      payload.stopPropagation?.();
      handler(payload);
    });
  }
  return g;
}

function fit(app, cols, rows, margin = 18, extraBottom = 0, options = {}) {
  const width = viewWidth(app);
  const height = Math.max(180, viewHeight(app) - extraBottom);
  const size = Math.max(140, Math.min(width - margin * 2, height - margin * 2));
  const verticalAnchor = Math.max(0, Math.min(1, options.verticalAnchor ?? 0));
  const spareY = Math.max(0, height - size - margin * 2);
  return {
    size,
    cell: size / Math.max(cols, rows),
    left: (width - size) / 2,
    top: margin + spareY * verticalAnchor,
  };
}

function fitWithTopReserve(app, cols, rows, margin = 18, reservedTop = 0, extraBottom = 0, options = {}) {
  const width = viewWidth(app);
  const height = Math.max(180, viewHeight(app) - reservedTop - extraBottom);
  const size = Math.max(140, Math.min(width - margin * 2, height - margin * 2));
  const verticalAnchor = Math.max(0, Math.min(1, options.verticalAnchor ?? 0));
  const spareY = Math.max(0, height - size - margin * 2);
  return {
    size,
    cell: size / Math.max(cols, rows),
    left: (width - size) / 2,
    top: reservedTop + margin + spareY * verticalAnchor,
  };
}

function fitGrid(app, cols, rows, margin = 18, extraBottom = 0, options = {}) {
  const width = viewWidth(app);
  const reservedTop = Math.max(0, options.reservedTop ?? 0);
  const availableHeight = Math.max(180, viewHeight(app) - reservedTop - extraBottom);
  const maxCell = options.maxCell ?? Infinity;
  const minCell = options.minCell ?? 20;
  const cell = Math.max(
    minCell,
    Math.min(maxCell, (width - margin * 2) / cols, (availableHeight - margin * 2) / rows),
  );
  const gridWidth = cell * cols;
  const gridHeight = cell * rows;
  const verticalAnchor = Math.max(0, Math.min(1, options.verticalAnchor ?? 0));
  const spareY = Math.max(0, availableHeight - gridHeight - margin * 2);
  return {
    size: Math.max(gridWidth, gridHeight),
    width: gridWidth,
    height: gridHeight,
    cell,
    left: (width - gridWidth) / 2,
    top: reservedTop + margin + spareY * verticalAnchor,
  };
}

function cellFromPoint(layout, x, y) {
  if (!layout) return null;
  const col = Math.floor((x - layout.left) / layout.cell);
  const row = Math.floor((y - layout.top) / layout.cell);
  if (row < 0 || row >= layout.rows || col < 0 || col >= layout.cols) return null;
  return { row, col };
}

function centeredPieceOrigin(piece, x, y, width, height, unit) {
  const bounds = bloxPieceBounds(piece);
  return {
    x: x + (width - bounds.width * unit) / 2 - bounds.minCol * unit,
    y: y + (height - bounds.height * unit) / 2 - bounds.minRow * unit,
  };
}

function isAdjacentMatch3Cell(from, to) {
  return !!from && !!to && Math.abs(from.x - to.x) + Math.abs(from.y - to.y) === 1;
}

function match3TargetFromGesture(layout, current, done) {
  if (!layout || !current?.from || !done) return null;
  const dx = done.x - current.startX;
  const dy = done.y - current.startY;
  const threshold = Math.max(10, Math.min(30, layout.cell * 0.32));
  let target = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) >= threshold) {
    target = Math.abs(dx) >= Math.abs(dy)
      ? { x: current.from.x + Math.sign(dx), y: current.from.y }
      : { x: current.from.x, y: current.from.y + Math.sign(dy) };
  } else {
    const cell = cellFromPoint(layout, done.x, done.y);
    if (cell) target = { x: cell.col, y: cell.row };
  }
  if (!target || target.x < 0 || target.x >= layout.cols || target.y < 0 || target.y >= layout.rows) return null;
  if (target.x === current.from.x && target.y === current.from.y) return null;
  return target;
}

function cropProgress(plot, now) {
  if (!plot?.crop || !plot?.plantedAt) return 0;
  const base = plot.effectiveGrowthTime || plot.growthTime || CROPS[plot.crop]?.growthTime || 60_000;
  const multiplier = plot.watered ? plot.wateringMultiplier || 0.7 : 1;
  return Math.max(0, Math.min(1, (now - plot.plantedAt) / (base * multiplier)));
}

function makeSparkles(root, x, y, color = AMBER, count = 9) {
  for (let i = 0; i < count; i++) {
    const dot = new Graphics().circle(0, 0, 2 + (i % 3), color).fill({ color, alpha: 0.9 });
    dot.x = x;
    dot.y = y;
    dot.alpha = 0.85;
    dot._vx = Math.cos((Math.PI * 2 * i) / count) * (1.2 + (i % 2));
    dot._vy = Math.sin((Math.PI * 2 * i) / count) * (1.2 + (i % 2));
    dot._life = 22 + i;
    root.addChild(dot);
  }
}

function cellCenter(layout, x, y) {
  return {
    x: layout.left + x * layout.cell + layout.cell / 2,
    y: layout.top + y * layout.cell + layout.cell / 2,
  };
}

function makeTween(view, from, to, duration = 18, options = {}) {
  view.x = from.x;
  view.y = from.y;
  view._delay = options.delay || 0;
  view._tween = {
    fromX: from.x,
    fromY: from.y,
    toX: to.x,
    toY: to.y,
    duration,
    fade: !!options.fade,
    ease: options.ease,
    scaleFrom: options.scaleFrom,
    scaleTo: options.scaleTo,
    destroy: options.destroy,
  };
  return view;
}

function drawBubboBackground(root, app, layout, frameBottom) {
  const palette = BUBBO_BACKGROUND_THEMES[currentUiTheme()] || BUBBO_BACKGROUND_THEMES.light;
  root.addChild(rect(0, 0, viewWidth(app), viewHeight(app), palette.outer, 0, 1));
  root.addChild(strokedRect(layout.left - 10, layout.top - 10, layout.right - layout.left + 20, frameBottom - layout.top + 10, palette.stroke, 16, palette.panel, 0.96, 2));
  const stripes = new Graphics();
  const x0 = layout.left - 2;
  const y0 = layout.top - 2;
  const width = layout.right - layout.left + 4;
  const height = frameBottom - layout.top + 4;
  for (let x = x0 - height; x < x0 + width; x += Math.max(24, layout.cell * 0.86)) {
    stripes.moveTo(x, y0 + height);
    stripes.lineTo(x + height, y0);
  }
  stripes.stroke({ color: palette.pattern, width: 1.4, alpha: palette.lineAlpha });
  root.addChild(stripes);
  const curves = new Graphics();
  for (let row = 0; row < 4; row += 1) {
    const y = y0 + height * (0.18 + row * 0.2);
    curves.moveTo(x0 + 10, y);
    curves.bezierCurveTo(x0 + width * 0.3, y - 12, x0 + width * 0.58, y + 10, x0 + width - 10, y - 4);
  }
  curves.stroke({ color: palette.pattern, width: 2, alpha: palette.lineAlpha * 0.7 });
  root.addChild(curves);
  root.addChild(tiledSprite(gameAsset(BUBBO_ASSET_KEYS.backgroundTile), layout.left - 8, layout.top - 8, layout.right - layout.left + 16, frameBottom - layout.top + 8, palette.tileAlpha));
  return palette;
}

function makeRipple(root, x, y, color = SKY, radius = 28) {
  const ripple = new Graphics().circle(0, 0, radius).stroke({ color, width: 3, alpha: 0.85 });
  ripple.x = x;
  ripple.y = y;
  ripple._life = 20;
  ripple._vx = 0;
  ripple._vy = 0;
  ripple._grow = 1.45;
  root.addChild(ripple);
}

function makeRafScheduler(fn) {
  let frame = 0;
  return {
    request() {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        fn();
      });
    },
    cancel() {
      if (!frame) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}

function setupStage(app, onMove, onUp, onCancel = null) {
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  const move = (event) => onMove?.(event);
  const up = (event) => onUp?.(event);
  const cancel = (event = {}) => {
    if (onCancel) onCancel(event);
    else onUp?.({ cancelled: true, global: null });
  };
  const visibility = () => {
    if (document.visibilityState === "hidden") cancel();
  };
  app.stage.on("globalpointermove", move);
  app.stage.on("pointerup", up);
  app.stage.on("pointerupoutside", up);
  app.stage.on("pointercancel", cancel);
  window.addEventListener("blur", cancel);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    app.stage.off("globalpointermove", move);
    app.stage.off("pointerup", up);
    app.stage.off("pointerupoutside", up);
    app.stage.off("pointercancel", cancel);
    window.removeEventListener("blur", cancel);
    document.removeEventListener("visibilitychange", visibility);
  };
}

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

export function buildBloxScene(app, initial = {}) {
  const root = new Container();
  const dragLayer = new Container();
  const effects = new Container();
  app.stage.addChild(root, dragLayer, effects);
  let data = initial;
  let layout = null;
  let drag = null;
  let lastTraySignature = "";
  const dragVisual = makeRafScheduler(() => updateDragVisualNow());

  function drawPiece(piece, x, y, unit, alpha = 1) {
    const group = new Container();
    group.eventMode = "none";
    group.interactiveChildren = false;
    for (const [r, c] of piece.cells || []) {
      const cell = rect(x + c * unit, y + r * unit, unit - 2, unit - 2, colorNumber(piece.color), 4, alpha);
      cell.eventMode = "none";
      group.addChild(cell);
    }
    return group;
  }

  function updateDragVisualNow() {
    clear(dragLayer);
    if (!drag?.piece) return;
    const state = data.blox || {};
    const board = state.board || state.savedState?.board || Array.from({ length: GRID }, () => Array(GRID).fill(null));
    const boardUnit = layout?.cell || 22;
    const trayUnit = Math.min(boardUnit, 28);
    const unit = drag.overCell ? boardUnit : trayUnit;
    const origin = bloxGhostOrigin(drag, unit);
    const ghost = drawPiece(drag.piece, origin.x, origin.y, unit, drag.overCell ? 0.72 : 0.76);
    const valid = drag.overCell && canPlaceBloxPiece(board, drag.piece, drag.overCell.row, drag.overCell.col);
    ghost.alpha = drag.overCell ? 0.78 : 0.66;
    dragLayer.addChild(ghost);
    if (drag.overCell) {
      const snap = drawPiece(
        drag.piece,
        layout.left + drag.overCell.col * layout.cell,
        layout.top + drag.overCell.row * layout.cell,
        layout.cell,
        valid ? 0.34 : 0.24,
      );
      snap.alpha = valid ? 0.74 : 0.52;
      dragLayer.addChild(snap);
      for (const [dr, dc] of drag.piece.cells || []) {
        const row = drag.overCell.row + dr;
        const col = drag.overCell.col + dc;
        if (row < 0 || row >= GRID || col < 0 || col >= GRID) continue;
        const x = layout.left + col * layout.cell + 1;
        const y = layout.top + row * layout.cell + 1;
        dragLayer.addChild(strokedRect(x, y, layout.cell - 2, layout.cell - 2, valid ? MINT : CORAL, 6, 0xf7efe0, 0.58, 3));
      }
    }
  }

  function updateDragVisual() {
    dragVisual.request();
  }

  function playBloxClearEffects(clearInfo = {}) {
    if (!layout) return;
    const rows = Array.isArray(clearInfo.rows) ? clearInfo.rows : [];
    const cols = Array.isArray(clearInfo.cols) ? clearInfo.cols : [];
    const clearedCells = new Set();
    for (const row of rows) {
      for (let col = 0; col < GRID; col += 1) clearedCells.add(`${row}:${col}`);
    }
    for (const col of cols) {
      for (let row = 0; row < GRID; row += 1) clearedCells.add(`${row}:${col}`);
    }
    for (const key of clearedCells) {
      const [row, col] = key.split(":").map(Number);
      const x = layout.left + col * layout.cell + 2;
      const y = layout.top + row * layout.cell + 2;
      const flash = strokedRect(x, y, layout.cell - 4, layout.cell - 4, AMBER, 6, 0xfff4c7, 0.78, 2);
      flash._delay = Math.min(10, (row + col) % 5);
      flash._tween = {
        fromX: x,
        fromY: y,
        toX: x,
        toY: y,
        duration: 18,
        fade: true,
        scaleFrom: 0.9,
        scaleTo: 1.08,
      };
      effects.addChild(flash);
    }
    for (const row of rows) {
      const y = layout.top + row * layout.cell + layout.cell / 2;
      const wipe = new Graphics()
        .roundRect(-layout.size / 2 - 4, -layout.cell * 0.26, layout.size + 8, layout.cell * 0.52, 8)
        .fill({ color: AMBER, alpha: 0.74 });
      wipe.x = layout.left + layout.size / 2;
      wipe.y = y;
      wipe.scale.x = 0.08;
      wipe._delay = row % 3;
      wipe._tween = { fromX: wipe.x, fromY: wipe.y, toX: wipe.x, toY: wipe.y, duration: 20, scaleFrom: 0.08, scaleTo: 1.08, fade: true };
      effects.addChild(wipe);
      for (let col = 0; col < GRID; col += 2) {
        const before = effects.children.length;
        makeSparkles(effects, layout.left + (col + 0.5) * layout.cell, y, AMBER, 3);
        for (const child of effects.children.slice(before)) child._delay = 4 + row % 3;
      }
    }
    for (const col of cols) {
      const x = layout.left + col * layout.cell + layout.cell / 2;
      const wipe = new Graphics()
        .roundRect(-layout.cell * 0.26, -layout.size / 2 - 4, layout.cell * 0.52, layout.size + 8, 8)
        .fill({ color: MINT, alpha: 0.7 });
      wipe.x = x;
      wipe.y = layout.top + layout.size / 2;
      wipe.scale.y = 0.08;
      wipe._delay = col % 3;
      wipe._tween = { fromX: wipe.x, fromY: wipe.y, toX: wipe.x, toY: wipe.y, duration: 20, scaleFrom: 0.08, scaleTo: 1.08, fade: true };
      effects.addChild(wipe);
      for (let row = 0; row < GRID; row += 2) {
        const before = effects.children.length;
        makeSparkles(effects, x, layout.top + (row + 0.5) * layout.cell, MINT, 3);
        for (const child of effects.children.slice(before)) child._delay = 6 + col % 3;
      }
    }
    if (clearedCells.size) {
      const text = label(data.bloxClearText || "CLEAR", layout.left + layout.size / 2, layout.top + layout.size / 2, Math.max(18, layout.cell * 0.48), AMBER, "1000");
      text._tween = {
        fromX: text.x,
        fromY: text.y,
        toX: text.x,
        toY: text.y - layout.cell * 0.7,
        duration: 30,
        fade: true,
        scaleFrom: 0.82,
        scaleTo: 1.18,
      };
      effects.addChild(text);
    }
  }

  function dropDrag(done) {
    if (!drag) return;
    const point = done || drag;
    const current = drag;
    const target = done?.cancelled ? null : current.overCell || bloxAnchorCellFromDrag(layout, current);
    drag = null;
    dragVisual.cancel();
    clear(dragLayer);
    if (target && data.blox?.gameActive) {
      data.onBloxDrop?.(current.pieceIdx, target.row, target.col)?.then?.((result) => {
        if (!result?.error) {
          const clearColor = result.clear?.cleared ? AMBER : MINT;
          makeSparkles(effects, point.x, point.y, clearColor, result.clear?.cleared ? 18 : 13);
          makeRipple(effects, point.x, point.y, clearColor, result.clear?.cleared ? 42 : 24);
          if (result.clear?.cleared) playBloxClearEffects(result.clear);
        }
      });
    } else if (current.moved || done?.moved) {
      makeSparkles(effects, current.startX, current.startY, CORAL, 5);
    } else {
      data.onBloxTray?.(current.pieceIdx);
    }
    draw();
  }

  const pointer = createPointerSession({
    onMove: (next) => {
      if (!drag) return;
      drag.x = next.x;
      drag.y = next.y;
      drag.moved = next.moved;
      drag.overCell = bloxAnchorCellFromDrag(layout, drag);
      updateDragVisual();
    },
    onTap: (done) => {
      if (done.data?.kind === "blox-cell") {
        data.onBloxCell?.(done.data.row, done.data.col);
        return;
      }
      if (!drag) return;
      data.onBloxTray?.(drag.pieceIdx);
      drag = null;
      dragVisual.cancel();
      clear(dragLayer);
      draw();
    },
    onDragEnd: dropDrag,
    onCancel: (done) => dropDrag(done),
  });

  function draw() {
    clear(root);
    const state = data.blox || {};
    const board = state.board || state.savedState?.board || Array.from({ length: GRID }, () => Array(GRID).fill(null));
    const tray = state.tray || state.savedState?.tray || [];
    const fitted = fitWithTopReserve(app, GRID, GRID, 14, data.bloxHudReserve || 132, 112, { verticalAnchor: 0.1 });
    layout = { ...fitted, cols: GRID, rows: GRID };
    const { size, cell, left, top } = fitted;
    root.addChild(rect(left - 8, top - 8, size + 16, size + 16, PANEL, 14));

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const value = board[r]?.[c];
        const color = value ? colorNumber(value) : 0xe4ebd7;
        const tile = rect(left + c * cell + 2, top + r * cell + 2, cell - 4, cell - 4, color, 5, value ? 1 : 0.88);
        makeInteractive(tile, {
          pointerdown: (event) => {
            if (!state.gameActive) return;
            pointer.start(event, { kind: "blox-cell", row: r, col: c });
          },
        });
        root.addChild(tile);
      }
    }

    const trayTop = top + size + 16;
    const trayUnit = Math.min(18, Math.max(10, (viewWidth(app) - 70) / 18));
    const slotW = (viewWidth(app) - 36) / 3;
    const traySignature = tray.map((item) => `${item?.piece?.id || "empty"}:${item?.placed ? 1 : 0}`).join("|");
    const trayChanged = lastTraySignature && lastTraySignature !== traySignature;
    lastTraySignature = traySignature;
    for (let i = 0; i < 3; i++) {
      const t = tray[i];
      const x = 14 + i * slotW;
      const slotWidth = slotW - 8;
      const slotHeight = 58;
      const pieceOrigin = centeredPieceOrigin(t?.piece, x, trayTop, slotWidth, slotHeight, trayUnit);
      const slot = rect(x, trayTop, slotWidth, slotHeight, i === data.selectedBloxPiece ? 0xdbeccf : PANEL_2, 10, t?.placed ? 0.45 : 1);
      makeInteractive(slot, {
        pointerdown: (event) => {
          if (!t?.piece || t.placed || !state.gameActive) {
            data.onBloxTray?.(i);
            return;
          }
          drag = createBloxDragState({
            pieceIdx: i,
            piece: t.piece,
            event,
            originX: pieceOrigin.x,
            originY: pieceOrigin.y,
            unit: trayUnit,
          });
          drag.overCell = bloxAnchorCellFromDrag(layout, drag);
          pointer.start(event, { kind: "blox-tray", pieceIdx: i });
          updateDragVisual();
        },
      });
      root.addChild(slot);
      if (t?.piece && drag?.pieceIdx !== i) root.addChild(drawPiece(t.piece, pieceOrigin.x, pieceOrigin.y, trayUnit, t.placed ? 0.35 : 1));
      if (trayChanged && t?.piece && !t.placed) {
        makeRipple(effects, x + slotWidth / 2, trayTop + slotHeight / 2, MINT, 18);
      }
    }

    updateDragVisual();
    if (!data.bloxHideStatusText) {
      root.addChild(label(data.bloxStatusText || `Score ${state.score || 0} · Lines ${state.linesCleared || 0}`, viewWidth(app) / 2, trayTop + 76, 14, AMBER));
    }
  }

  const cleanup = setupStage(app, pointer.move, pointer.end, () => pointer.cancel("stage"));
  const ticker = () => tickParticles(effects);
  app.ticker.add(ticker);
  draw();
  return {
    update(next) {
      data = next || {};
      if (drag) updateDragVisual();
      else draw();
    },
    destroy() {
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

export function buildMatch3Scene(app, initial = {}) {
  const root = new Container();
  const dragLayer = new Container();
  const effects = new Container();
  app.stage.addChild(root, dragLayer, effects);
  let data = initial;
  let layout = null;
  let drag = null;
  let lastAnimationId = null;
  let animationFrames = [];
  let animationFrameIndex = 0;
  let animationFrameAge = 0;
  const dragVisual = makeRafScheduler(() => updateDragVisualNow());

  const pointer = createPointerSession({
    onMove: (next) => {
      if (!drag) return;
      drag.x = next.x;
      drag.y = next.y;
      drag.target = match3TargetFromGesture(layout, drag, next);
      updateDragVisual();
    },
    onTap: (done) => {
      const from = done.data?.from || drag?.from;
      drag = null;
      dragVisual.cancel();
      clear(dragLayer);
      if (from) data.onMatch3Cell?.(from.x, from.y);
      draw();
    },
    onDragEnd: (done) => {
      if (!drag) return;
      const current = drag;
      drag = null;
      dragVisual.cancel();
      clear(dragLayer);
      const target = current.target || match3TargetFromGesture(layout, current, done);
      if (isAdjacentMatch3Cell(current.from, target)) {
        data.onMatch3Swap?.(current.from, target);
        makeSparkles(effects, done.x, done.y, SKY, 7);
        makeRipple(effects, done.x, done.y, SKY, 24);
      } else if (current.from) {
        data.onMatch3Cell?.(current.from.x, current.from.y);
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

  function updateDragVisualNow() {
    clear(dragLayer);
    if (!drag) return;
    const state = data.match3 || {};
    const board = state.board || state.savedModes?.[state.gameMode || "classic"]?.board || [];
    const actual = board.length ? board : data.fallbackBoard || [];
    const gem = actual[drag.from.y]?.[drag.from.x];
    const color = GEM_COLORS[gem] || 0xa4af9a;
    const radius = Math.max(14, (layout?.cell || 44) * 0.33);
    if (drag.target) {
      dragLayer.addChild(strokedRect(
        layout.left + drag.target.x * layout.cell + 3,
        layout.top + drag.target.y * layout.cell + 3,
        layout.cell - 6,
        layout.cell - 6,
        SKY,
        10,
        0xf7efe0,
        0.7,
        3,
      ));
    }
    dragLayer.addChild(
      new Graphics()
        .circle(drag.x, drag.y, radius)
        .fill({ color, alpha: 0.8 })
        .stroke({ color: TEXT, width: 2, alpha: 0.7 }),
    );
    const pieceAsset = gameAsset(POTION_PIECE_ASSETS[gem]);
    if (pieceAsset) dragLayer.addChild(sprite(pieceAsset, drag.x, drag.y, radius * 1.85, radius * 1.85, 0.92));
  }

  function updateDragVisual() {
    dragVisual.request();
  }

  function matchInputLocked() {
    return !!data.match3?.inputLocked;
  }

  function makeGemView(gem, radius, alpha = 1) {
    const color = GEM_COLORS[gem] || 0xa4af9a;
    const group = new Container();
    group.eventMode = "none";
    group.interactiveChildren = false;
    group.alpha = alpha;
    group.addChild(
      new Graphics()
        .circle(0, 0, radius)
        .fill({ color, alpha: Math.min(0.95, alpha) })
        .stroke({ color: TEXT, width: 2, alpha: 0.36 }),
    );
    const pieceAsset = gameAsset(POTION_PIECE_ASSETS[gem]);
    if (pieceAsset) {
      group.addChild(sprite(pieceAsset, 0, 0, radius * 1.9, radius * 1.9, Math.min(0.98, alpha + 0.08)));
    }
    const icon = DROP_ICONS[gem] || GEM_ICONS[gem] || "";
    if (icon && !pieceAsset) group.addChild(label(icon, 0, 0, Math.max(13, radius * 0.88), TEXT));
    return group;
  }

  function cloneMatch3Board(board = []) {
    return Array.from({ length: BOARD_SIZE }, (_, y) =>
      Array.from({ length: BOARD_SIZE }, (_, x) => board[y]?.[x] || null),
    );
  }

  function swappedMatch3Board(animation = {}) {
    const next = cloneMatch3Board(animation.startBoard || []);
    const { from, to } = animation;
    if (!from || !to || !next[from.y]?.[from.x] || !next[to.y]?.[to.x]) return next;
    [next[from.y][from.x], next[to.y][to.x]] = [next[to.y][to.x], next[from.y][from.x]];
    return next;
  }

  function match3MotionBoard(sourceBoard, step = {}) {
    const next = cloneMatch3Board(sourceBoard);
    for (const cell of step.cleared || []) {
      if (next[cell.y]) next[cell.y][cell.x] = null;
    }
    for (const special of step.specials || []) {
      if (next[special.y]) next[special.y][special.x] = special.type;
    }
    for (const fall of step.fallen || []) {
      if (next[fall.fromY]) next[fall.fromY][fall.x] = null;
      if (next[fall.toY]) next[fall.toY][fall.x] = null;
    }
    for (const fill of step.filled || []) {
      if (next[fill.y]) next[fill.y][fill.x] = null;
    }
    for (const drop of step.dropCollected || []) {
      if (next[drop.y]) next[drop.y][drop.x] = null;
    }
    return next;
  }

  function buildMatch3Frames(animation = {}) {
    if (animation.type !== "cascade") return [];
    const steps = Array.isArray(animation.steps) ? animation.steps : [];
    const frames = [];
    const hasStart = Array.isArray(animation.startBoard) && animation.startBoard.length;
    const swapBoard = Array.isArray(animation.swapBoard) && animation.swapBoard.length
      ? cloneMatch3Board(animation.swapBoard)
      : swappedMatch3Board(animation);
    let previousBoard = swapBoard;

    if (hasStart) {
      frames.push({ board: cloneMatch3Board(animation.startBoard), holdFrames: MATCH3_TIMING.swapFrames });
    }
    frames.push({ board: cloneMatch3Board(swapBoard), holdFrames: MATCH3_TIMING.swapSettleFrames });

    for (const step of steps) {
      const matchBoard = cloneMatch3Board(previousBoard);
      frames.push({ board: matchBoard, holdFrames: MATCH3_TIMING.clearFrames });
      frames.push({ board: match3MotionBoard(matchBoard, step), holdFrames: MATCH3_TIMING.motionFrames });
      const settledBoard = cloneMatch3Board(step.boardSnapshot);
      frames.push({ board: settledBoard, holdFrames: MATCH3_TIMING.settleFrames });
      previousBoard = settledBoard;
    }
    if (frames.length && MATCH3_TIMING.tailFrames > 0) {
      frames.push({ board: cloneMatch3Board(previousBoard), holdFrames: MATCH3_TIMING.tailFrames });
    }

    return frames.filter((frame) => frame.board?.length);
  }

  function activeAnimationBoard(fallback) {
    if (!animationFrames.length) return fallback;
    const frame = animationFrames[Math.min(animationFrameIndex, animationFrames.length - 1)];
    return frame?.board || fallback;
  }

  function advanceAnimationFrame(tickerState = {}) {
    if (!animationFrames.length) return;
    animationFrameAge += Math.max(0.5, tickerState.deltaTime || 1);
    const holdFrames = animationFrames[animationFrameIndex]?.holdFrames || 1;
    if (animationFrameAge < holdFrames) return;
    animationFrameAge = 0;
    if (animationFrameIndex < animationFrames.length - 1) {
      animationFrameIndex += 1;
      draw();
      return;
    }
    animationFrames = [];
    draw();
  }

  function queueMatch3Animation(animation = {}) {
    if (!animation?.id) {
      if (animationFrames.length || lastAnimationId) {
        animationFrames = [];
        animationFrameIndex = 0;
        animationFrameAge = 0;
        lastAnimationId = null;
      }
      return;
    }
    if (!layout || animation.id === lastAnimationId) return;
    lastAnimationId = animation.id;
    if (animation.type !== "cascade") {
      animationFrames = [];
      animationFrameIndex = 0;
      animationFrameAge = 0;
    }
    const radius = Math.max(14, layout.cell * 0.3);
    const from = animation.from ? cellCenter(layout, animation.from.x, animation.from.y) : null;
    const to = animation.to ? cellCenter(layout, animation.to.x, animation.to.y) : null;

    if (animation.type === "invalid" && from && to) {
      const nudge = {
        x: from.x + (to.x - from.x) * 0.24,
        y: from.y + (to.y - from.y) * 0.24,
      };
      const ghost = makeGemView(animation.fromGem, radius, 0.86);
      ghost._tween = {
        fromX: from.x,
        fromY: from.y,
        toX: nudge.x,
        toY: nudge.y,
        duration: 7,
        fade: true,
        scaleFrom: 1,
        scaleTo: 0.9,
        ease: "snap",
      };
      ghost.x = from.x;
      ghost.y = from.y;
      effects.addChild(ghost);
      makeRipple(effects, from.x, from.y, CORAL, radius * 1.1);
      makeSparkles(effects, from.x, from.y, CORAL, 5);
      return;
    }

    if (from && to) {
      effects.addChild(makeTween(makeGemView(animation.fromGem, radius, 0.94), from, to, MATCH3_TIMING.swapFrames, { fade: true, scaleFrom: 0.98, scaleTo: 1.04, ease: "snap" }));
      effects.addChild(makeTween(makeGemView(animation.toGem, radius, 0.82), to, from, MATCH3_TIMING.swapFrames, { fade: true, scaleFrom: 0.96, scaleTo: 1.02, ease: "snap" }));
      makeRipple(effects, (from.x + to.x) / 2, (from.y + to.y) / 2, SKY, radius * 1.2);
    }

    const steps = Array.isArray(animation.steps) ? animation.steps : [];
    if (animation.type === "cascade") {
      animationFrames = buildMatch3Frames(animation);
      animationFrameIndex = 0;
      animationFrameAge = 0;
    }
    let previousBoard = Array.isArray(animation.swapBoard) && animation.swapBoard.length
      ? cloneMatch3Board(animation.swapBoard)
      : swappedMatch3Board(animation);
    let stepDelay = match3StepStartFrame(0);
    steps.forEach((step, stepIndex) => {
      const clearDelay = stepDelay;
      const motionDelay = clearDelay + MATCH3_TIMING.clearFrames;
      for (const cell of step.cleared || []) {
        const pos = cellCenter(layout, cell.x, cell.y);
        const pulse = new Graphics().circle(0, 0, radius * (1 + Math.min(0.55, step.combo * 0.08))).stroke({ color: AMBER, width: 3, alpha: 0.86 });
        pulse.x = pos.x;
        pulse.y = pos.y;
        pulse._delay = clearDelay + Math.min(1.5, ((cell.x + cell.y) % 3) * 0.5);
        pulse._tween = { fromX: pos.x, fromY: pos.y, toX: pos.x, toY: pos.y, duration: 11, fade: true, scaleFrom: 0.62, scaleTo: 1.3, ease: "snap" };
        effects.addChild(pulse);
        const burst = makeGemView(cell.type, radius * 0.95, 0.96);
        burst.x = pos.x;
        burst.y = pos.y;
        burst._delay = clearDelay + 1 + ((cell.x + cell.y) % 2) * 0.5;
        burst._tween = { fromX: pos.x, fromY: pos.y, toX: pos.x, toY: pos.y - radius * 0.16, duration: 10, fade: true, scaleFrom: 1.05, scaleTo: 0.5, ease: "pop" };
        effects.addChild(burst);
        const beforeSparkles = effects.children.length;
        makeSparkles(effects, pos.x, pos.y, step.combo > 1 ? CORAL : AMBER, Math.min(12, 5 + step.combo));
        for (const child of effects.children.slice(beforeSparkles)) child._delay = clearDelay + 1.5;
      }
      for (const special of step.specials || []) {
        const pos = cellCenter(layout, special.x, special.y);
        const color = GEM_COLORS[special.type] || SKY;
        const specialPulse = new Graphics()
          .circle(0, 0, radius * 1.05)
          .fill({ color, alpha: 0.38 })
          .stroke({ color, width: 4, alpha: 0.78 });
        specialPulse.x = pos.x;
        specialPulse.y = pos.y;
        specialPulse._delay = clearDelay + 2;
        specialPulse._tween = { fromX: pos.x, fromY: pos.y, toX: pos.x, toY: pos.y, duration: 14, fade: true, scaleFrom: 0.45, scaleTo: 1.25, ease: "snap" };
        effects.addChild(specialPulse);
      }
      for (const special of step.triggeredSpecials || []) {
        const pos = cellCenter(layout, special.x, special.y);
        const color = GEM_COLORS[special.type] || SKY;
        const triggerPulse = new Graphics()
          .circle(0, 0, radius * 1.18)
          .stroke({ color, width: 5, alpha: 0.9 });
        triggerPulse.x = pos.x;
        triggerPulse.y = pos.y;
        triggerPulse._delay = clearDelay + 1;
        triggerPulse._tween = { fromX: pos.x, fromY: pos.y, toX: pos.x, toY: pos.y, duration: 16, fade: true, scaleFrom: 0.55, scaleTo: 1.55, ease: "snap" };
        effects.addChild(triggerPulse);
      }
      for (const fall of step.fallen || []) {
        const type = previousBoard?.[fall.fromY]?.[fall.x] || step.boardSnapshot?.[fall.toY]?.[fall.x];
        if (!type) continue;
        const fromPos = cellCenter(layout, fall.x, fall.fromY);
        const toPos = cellCenter(layout, fall.x, fall.toY);
        const fallDistance = Math.max(1, Math.abs(fall.toY - fall.fromY));
        const fallDelay = motionDelay + Math.min(2.5, fallDistance * 0.45);
        const fallDuration = Math.min(MATCH3_TIMING.motionFrames - 3, 12 + fallDistance * 2.8);
        effects.addChild(makeTween(
          makeGemView(type, radius * 0.92, 0.96),
          fromPos,
          toPos,
          fallDuration,
          { delay: fallDelay, fade: false, scaleFrom: 0.97, scaleTo: 1.02, ease: "drop" },
        ));
      }
      for (const fill of step.filled || []) {
        const fromPos = { ...cellCenter(layout, fill.x, fill.y), y: layout.top - layout.cell * (1.2 + (fill.y % 2) * 0.2) };
        const toPos = cellCenter(layout, fill.x, fill.y);
        const fillDelay = motionDelay + 3 + Math.min(2.5, fill.y * 0.35);
        const fillDuration = Math.min(MATCH3_TIMING.motionFrames - 4, 12 + fill.y * 0.9);
        effects.addChild(makeTween(
          makeGemView(fill.type, radius * 0.9, 0.96),
          fromPos,
          toPos,
          fillDuration,
          { delay: fillDelay, fade: false, scaleFrom: 0.82, scaleTo: 1.03, ease: "drop" },
        ));
      }
      for (const drop of step.dropCollected || []) {
        const pos = cellCenter(layout, drop.x, drop.y);
        const collect = makeGemView(drop.type, radius * 1.02, 0.98);
        collect._delay = motionDelay + 5;
        collect._tween = { fromX: pos.x, fromY: pos.y, toX: pos.x, toY: pos.y - layout.cell * 0.72, duration: 16, fade: true, scaleFrom: 1, scaleTo: 1.35, ease: "pop" };
        effects.addChild(collect);
        const points = label(`+${drop.points || 80}`, pos.x, pos.y - radius * 1.5, Math.max(12, radius * 0.72), AMBER);
        points._delay = motionDelay + 7;
        points._tween = { fromX: points.x, fromY: points.y, toX: points.x, toY: points.y - layout.cell * 0.44, duration: 18, fade: true, scaleFrom: 0.8, scaleTo: 1.12, ease: "pop" };
        effects.addChild(points);
      }
      previousBoard = cloneMatch3Board(step.boardSnapshot);
      stepDelay = match3StepStartFrame(stepIndex + 1);
    });
  }

  function draw() {
    clear(root);
    const state = data.match3 || {};
    const board = state.board || state.savedModes?.[state.gameMode || "classic"]?.board || [];
    const fallback = data.fallbackBoard || [];
    const actual = board.length ? board : fallback;
    const hudReserve = state.gameActive ? reserveFromShellChrome(app, ".game-play-hud", data.match3HudReserve || 0) : 0;
    const fitted = fitWithTopReserve(app, BOARD_SIZE, BOARD_SIZE, 14, hudReserve, 44, { verticalAnchor: 0.66 });
    layout = { ...fitted, cols: BOARD_SIZE, rows: BOARD_SIZE };
    const { size, cell, left, top } = fitted;
    publishCanvasLayout(app, "match3", { top: top - 10, left: left - 10, size: size + 20 });
    root.addChild(rect(left - 10, top - 10, size + 20, size + 20, PANEL, 16));
    root.addChild(tiledSprite(gameAsset("match3.shelf.block"), left - 4, top - 4, size + 8, size + 8, 0.16));
    queueMatch3Animation(data.match3Animation);
    const renderBoard = activeAnimationBoard(actual);
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const gem = renderBoard[y]?.[x];
        const selected = data.selectedGem?.x === x && data.selectedGem?.y === y;
        const dragging = drag?.from?.x === x && drag?.from?.y === y;
        const tile = selected
          ? strokedRect(left + x * cell + 3, top + y * cell + 3, cell - 6, cell - 6, AMBER, 10, 0xf7efe0, 1, 3)
          : rect(left + x * cell + 3, top + y * cell + 3, cell - 6, cell - 6, 0xe8efdc, 10);
        makeInteractive(tile, {
          pointerdown: (event) => {
            if (!state.gameActive || matchInputLocked()) return;
            drag = { from: { x, y }, pointerId: event.pointerId, startX: event.global.x, startY: event.global.y, x: event.global.x, y: event.global.y, target: null };
            pointer.start(event, { kind: "match3-cell", from: { x, y } });
          },
        });
        root.addChild(tile);
        if (!gem) continue;
        const color = GEM_COLORS[gem] || 0xa4af9a;
        const orb = new Graphics()
          .circle(left + x * cell + cell / 2, top + y * cell + cell / 2, cell * (selected ? 0.34 : 0.29))
          .fill({ color, alpha: dragging ? 0.38 : 1 });
        makeInteractive(orb, {
          pointerdown: (event) => {
            if (!state.gameActive || matchInputLocked()) return;
            drag = { from: { x, y }, pointerId: event.pointerId, startX: event.global.x, startY: event.global.y, x: event.global.x, y: event.global.y, target: null };
            pointer.start(event, { kind: "match3-cell", from: { x, y } });
          },
        });
        root.addChild(orb);
        const pieceAsset = gameAsset(POTION_PIECE_ASSETS[gem]);
        if (pieceAsset && !dragging) {
          root.addChild(sprite(pieceAsset, left + x * cell + cell / 2, top + y * cell + cell / 2, cell * 0.72, cell * 0.72, 0.96));
        }
        const icon = DROP_ICONS[gem] || GEM_ICONS[gem] || "";
        if (icon && !pieceAsset) {
          root.addChild(label(icon, left + x * cell + cell / 2, top + y * cell + cell / 2, Math.max(12, cell * 0.34)));
        }
      }
    }
    updateDragVisual();
    root.addChild(label(data.match3StatusText || `${state.gameMode || "classic"} · ${state.score || 0} pts · ${state.movesLeft ?? 30} moves`, viewWidth(app) / 2, top + size + 24, 14, AMBER));
  }

  const cleanup = setupStage(app, pointer.move, pointer.end, () => pointer.cancel("stage"));
  const ticker = (tickerState) => {
    advanceAnimationFrame(tickerState);
    tickParticles(effects, tickerState.deltaTime);
  };
  app.ticker.add(ticker);
  draw();
  return {
    update(next) {
      data = next || {};
      if (drag) updateDragVisual();
      else draw();
    },
    resize(next = data) {
      data = next || {};
      clear(effects);
      draw();
    },
    destroy() {
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

export function buildBubboScene(app, initial = {}) {
  const root = new Container();
  const boardLayer = new Container();
  const aimLayer = new Container();
  const projectileLayer = new Container();
  const effects = new Container();
  boardLayer.enableRenderGroup?.();
  projectileLayer.enableRenderGroup?.();
  app.stage.addChild(root, boardLayer, aimLayer, projectileLayer, effects);
  let data = initial;
  let layout = null;
  let aimPoint = null;
  let projectile = null;
  let lastShotId = null;
  let lastPressureShiftId = null;
  let renderSignature = "";
  let breathClock = 0;
  let pressureDisplayStep = Math.max(0, Math.min(1, Number(initial.bubbo?.pressureStep) || 0));
  let pressureTargetStep = pressureDisplayStep;
  const pointer = createPointerSession({
    onMove: (next) => {
      aimPoint = { x: next.x, y: next.y };
      updateAimVisual();
    },
    onTap: (done) => {
      aimPoint = { x: done.x, y: done.y };
      fireShot();
    },
    onDragEnd: (done) => {
      aimPoint = { x: done.x, y: done.y };
      fireShot();
    },
    onCancel: () => {
      aimPoint = null;
      clear(aimLayer);
    },
  });

  function bubbleColor(value) {
    return BUBBO_NUMBERS[value] || BUBBO_NUMBERS[BUBBO_COLORS[0]];
  }

  function bubbleBreathSeed(row, col) {
    const raw = Math.sin((row + 1) * 12.9898 + (col + 1) * 78.233) * 43758.5453;
    return raw - Math.floor(raw);
  }

  function nextRenderSignature(next = data) {
    const state = next?.bubbo || {};
    return JSON.stringify({
      board: state.board || [],
      current: state.current || "",
      next: state.next || "",
      gameActive: !!state.gameActive,
      lastShot: state.lastShot?.id || "",
      pendingRow: state.pendingRow || [],
      rowOffset: Number(state.rowOffset) || 0,
      seed: state.seed || "",
      waveIndex: Number(state.waveIndex) || 0,
      statusText: state.statusText || "",
      bottomHudReserve: !!state.bottomHudReserve,
    });
  }

  function buildLayout() {
    const width = viewWidth(app);
    const height = viewHeight(app);
    const margin = 8;
    const bottomReserve = data.bubbo?.bottomHudReserve ? Math.max(112, Math.min(154, height * 0.19)) : 0;
    const playHeight = Math.max(260, height - bottomReserve);
    const cell = Math.max(28, Math.min((width - margin * 2) / (BUBBO_COLS + 0.08), (playHeight - 48) / (BUBBO_ROWS + 0.72)));
    const boardWidth = cell * (BUBBO_COLS + 0.5);
    const left = (width - boardWidth) / 2;
    const top = Math.max(4, Math.min(14, (playHeight - cell * (BUBBO_ROWS + 0.95) - 24) / 2));
    const cannonY = Math.max(
      top + cell * (BUBBO_ROWS + 0.62),
      playHeight - Math.max(34, Math.min(72, cell * 0.9)),
    );
    return {
      cell,
      radius: cell * 0.485,
      left,
      top,
      right: left + boardWidth,
      bottom: top + cell * BUBBO_ROWS,
      finishLineY: top + cell * (BUBBO_ROWS + 0.22),
      pressureOffset: pressureDisplayStep * cell,
      cannonX: width / 2,
      cannonY,
      bottomReserve,
      playHeight,
    };
  }

  function currentRowOffset() {
    return Number.isFinite(Number(data.bubbo?.rowOffset)) ? Number(data.bubbo.rowOffset) : 0;
  }

  function currentPendingRow() {
    const state = data.bubbo || {};
    if (Array.isArray(state.pendingRow) && state.pendingRow.length) return state.pendingRow;
    if (Array.isArray(state.nextPressureWave) && state.nextPressureWave.length) return state.nextPressureWave;
    return generateBubboWave(state.seed || "bubbo", Number.isFinite(Number(state.waveIndex)) ? Number(state.waveIndex) : 0);
  }

  function hasPendingRow() {
    return currentPendingRow().some(Boolean);
  }

  function baseBubblePosition(row, col) {
    const offset = getBubboRowVisualOffset(row, currentRowOffset()) * layout.cell;
    return {
      x: layout.left + offset + col * layout.cell + layout.cell / 2,
      y: layout.top + row * layout.cell + layout.cell / 2,
    };
  }

  function bubblePosition(row, col) {
    const pos = baseBubblePosition(row, col);
    return {
      x: pos.x,
      y: pos.y + pressureDisplayStep * layout.cell,
    };
  }

  function applyPressureVisual(refreshAim = false) {
    if (!layout) return;
    boardLayer.y = pressureDisplayStep * layout.cell;
    if (refreshAim && aimPoint) updateAimVisual();
  }

  function nearestCellFromPoint(board, x, y) {
    const pendingRow = currentPendingRow();
    const includePendingRow = pendingRow.some(Boolean);
    let best = null;
    let bestScore = Infinity;
    for (let row = includePendingRow ? -1 : 0; row < BUBBO_ROWS; row++) {
      for (let col = 0; col < BUBBO_COLS; col++) {
        const occupied = row === -1 ? pendingRow[col] : board[row]?.[col];
        if (occupied) continue;
        const touches = row === -1
          || row === 0
          || getBubboNeighbors(row, col, currentRowOffset(), { includePendingRow }).some(([nr, nc]) => (nr === -1 ? pendingRow[nc] : board[nr]?.[nc]));
        if (!touches) continue;
        const pos = bubblePosition(row, col);
        const distance = (pos.x - x) ** 2 + (pos.y - y) ** 2;
        const score = distance + Math.max(0, row) * 10;
        if (score < bestScore) {
          bestScore = score;
          best = { row, col, x: pos.x, y: pos.y };
        }
      }
    }
    if (best) return best;
    for (let row = includePendingRow ? -1 : 0; row < BUBBO_ROWS; row++) {
      for (let col = 0; col < BUBBO_COLS; col++) {
        const occupied = row === -1 ? pendingRow[col] : board[row]?.[col];
        if (!occupied) {
          const pos = bubblePosition(row, col);
          return { row, col, x: pos.x, y: pos.y };
        }
      }
    }
    return null;
  }

  function calculateShot(target = aimPoint) {
    const state = data.bubbo || {};
    const board = state.board || [];
    const pendingRow = currentPendingRow();
    const includePendingRow = hasPendingRow();
    const cannonX = layout.cannonX;
    const cannonY = layout.cannonY;
    const targetX = target?.x ?? cannonX;
    const targetY = Math.min(target?.y ?? layout.top, cannonY - layout.cell * 2);
    let angle = Math.atan2(targetY - cannonY, targetX - cannonX);
    angle = Math.max(-Math.PI + 0.18, Math.min(-0.18, angle));
    let vx = Math.cos(angle);
    let vy = Math.sin(angle);
    let x = cannonX;
    let y = cannonY;
    const points = [{ x, y }];
    const step = Math.max(5, layout.cell * 0.18);

    for (let i = 0; i < 900; i++) {
      x += vx * step;
      y += vy * step;
      if (x - layout.radius <= layout.left) {
        x = layout.left + layout.radius;
        vx = Math.abs(vx);
        points.push({ x, y });
      } else if (x + layout.radius >= layout.right) {
        x = layout.right - layout.radius;
        vx = -Math.abs(vx);
        points.push({ x, y });
      }

      const topTargetY = includePendingRow ? layout.top - layout.cell * 0.5 : layout.top;
      if (y <= topTargetY + layout.radius) {
        const targetCell = nearestCellFromPoint(board, x, topTargetY);
        if (!targetCell) return null;
        points.push({ x: targetCell.x, y: targetCell.y });
        return { ...targetCell, path: points };
      }

      for (let row = includePendingRow ? -1 : 0; row < BUBBO_ROWS; row++) {
        for (let col = 0; col < BUBBO_COLS; col++) {
          const occupied = row === -1 ? pendingRow[col] : board[row]?.[col];
          if (!occupied) continue;
          const pos = bubblePosition(row, col);
          const distance = Math.hypot(pos.x - x, pos.y - y);
          if (distance < layout.radius * 1.8) {
            const targetCell = nearestCellFromPoint(board, x, y);
            if (!targetCell) return null;
            points.push({ x: targetCell.x, y: targetCell.y });
            return { ...targetCell, path: points };
          }
        }
      }
    }

    const targetCell = nearestCellFromPoint(board, x, y);
    if (!targetCell) return null;
    points.push({ x: targetCell.x, y: targetCell.y });
    return { ...targetCell, path: points };
  }

  function drawBubble(x, y, radius, colorName, alpha = 1, options = {}) {
    const color = bubbleColor(colorName);
    const group = new Container();
    if (options.glow) {
      const glow = new Graphics()
        .circle(0, 0, radius * 1.1)
        .fill({ color, alpha: 0.08 })
        .stroke({ color, width: Math.max(2, radius * 0.1), alpha: 0.34 });
      glow.alpha = 0.18 * alpha;
      group._bubboGlow = glow;
      group.addChild(glow);
    }
    const sheetTexture = bubboBallTexture(colorName, "idle");
    if (sheetTexture) {
      group.addChild(new Graphics().ellipse(0, radius * 0.48, radius * 0.78, radius * 0.22).fill({ color: 0x1f2937, alpha: 0.1 * alpha }));
      group.addChild(sprite(sheetTexture, 0, 0, radius * BUBBO_BALL_DRAW_SCALE, radius * BUBBO_BALL_DRAW_SCALE, alpha));
    } else {
      const g = new Graphics()
        .circle(0, 0, radius)
        .fill({ color, alpha: alpha * 0.35 })
        .stroke({ color: TEXT, width: Math.max(1.5, radius * 0.09), alpha: 0.24 });
      g.circle(-radius * 0.28, -radius * 0.32, radius * 0.22).fill({ color: 0xffffff, alpha: 0.34 * alpha });
      group.addChild(g);
      const asset = gameAsset(BUBBO_BUBBLE_ASSETS[colorName]);
      if (asset) group.addChild(sprite(asset, 0, 0, radius * 2.12, radius * 2.12, alpha));
    }
    group.x = x;
    group.y = y;
    return group;
  }

  function tickBubboBreathing(deltaTime = 1) {
    const delta = Math.max(0.25, Math.min(2.5, Number(deltaTime) || 1));
    breathClock += delta;
    for (const child of boardLayer.children) {
      const breath = child._bubboBreath;
      if (!breath) continue;
      const raw = (Math.sin(breathClock * breath.speed + breath.phase) + 1) / 2;
      const pulse = raw * raw * (3 - 2 * raw);
      const scale = breath.baseScale + breath.amount * pulse;
      child.scale.set(scale);
      if (child._bubboGlow) {
        child._bubboGlow.alpha = 0.14 + pulse * 0.28;
      }
    }
  }

  function drawBubboBurst(x, y, radius, colorName, duration = 26) {
    const color = bubbleColor(colorName);
    const view = new Container();
    view.x = x;
    view.y = y;
    const glowTexture = bubboBallTexture(colorName, "glow");
    if (glowTexture) view.addChild(sprite(glowTexture, 0, 0, radius * 2.2, radius * 2.02, 0.62));
    const burstTexture = bubboBallTexture(colorName, "burst");
    if (burstTexture) view.addChild(sprite(burstTexture, 0, radius * 0.03, radius * 3.12, radius * 2.02, 0.9));
    view.addChild(new Graphics().circle(0, 0, radius * 0.88).fill({ color, alpha: 0.16 }).stroke({ color, width: Math.max(2, radius * 0.11), alpha: 0.68 }));
    view.addChild(new Graphics().circle(-radius * 0.22, -radius * 0.28, radius * 0.2).fill({ color: 0xffffff, alpha: 0.3 }));
    view._tween = {
      age: 0,
      duration: Math.max(10, duration),
      fromX: x,
      toX: x,
      fromY: y,
      toY: y,
      scaleFrom: 0.74,
      scaleTo: 1.36,
      fade: true,
      ease: "smooth",
    };
    return view;
  }

  function updateAimVisual() {
    clear(aimLayer);
    if (!layout) return;
    const state = data.bubbo || {};
    if (!state.gameActive || projectile) return;
    const shot = calculateShot();
    if (!shot?.path?.length) return;
    const line = new Graphics();
    line.moveTo(shot.path[0].x, shot.path[0].y);
    for (const point of shot.path.slice(1)) line.lineTo(point.x, point.y);
    line.stroke({ color: SKY, width: 3, alpha: 0.42 });
    aimLayer.addChild(line);
    for (const point of shot.path.slice(1, -1)) {
      aimLayer.addChild(new Graphics().circle(point.x, point.y, 4).fill({ color: SKY, alpha: 0.55 }));
    }
    aimLayer.addChild(drawBubble(shot.x, shot.y, layout.radius * 0.42, state.current || BUBBO_COLORS[0], 0.52));
  }

  function reducedMotion() {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  }

  function playShotEffects() {
    const shot = data.bubbo?.lastShot;
    if (!shot?.id || shot.id === lastShotId || !layout) return;
    lastShotId = shot.id;
    const reduce = reducedMotion();
    const droppedSet = new Set((shot.dropped || []).map((cell) => `${cell.row}:${cell.col}`));
    const targets = [...(shot.popped || []), ...(shot.dropped || [])]
      .filter((cell, index, all) => all.findIndex((item) => item.row === cell.row && item.col === cell.col) === index);
    if (shot.landed && !targets.length) {
      const pos = bubblePosition(shot.landed.row, shot.landed.col);
      const touch = drawBubboBurst(pos.x, pos.y, layout.radius * 0.72, shot.color || BUBBO_COLORS[0], 18);
      if (touch) effects.addChild(touch);
      makeRipple(effects, pos.x, pos.y, AMBER, 22);
      return;
    }
    for (const cell of targets.slice(0, reduce ? 14 : 28)) {
      const pos = bubblePosition(cell.row, cell.col);
      const dropped = droppedSet.has(`${cell.row}:${cell.col}`)
        ? shot.dropped?.find((drop) => drop.row === cell.row && drop.col === cell.col)
        : null;
      if (dropped) {
        const falling = drawBubble(pos.x, pos.y, layout.radius * 0.82, dropped.color || cell.color || BUBBO_COLORS[0], 0.92);
        const seed = bubbleBreathSeed(cell.row, cell.col);
        falling._delay = reduce ? 0 : Math.min(14, ((cell.row * 2 + cell.col) % 8) * 1.75);
        falling._vx = reduce ? 0 : (cell.col - BUBBO_COLS / 2) * (0.035 + seed * 0.035);
        falling._vy = reduce ? 2.4 : 1.35 + (cell.row % 3) * 0.18 + seed * 0.28;
        falling._gravity = reduce ? 0.18 : 0.07 + seed * 0.045;
        falling._spin = reduce ? 0 : (cell.col % 2 ? 1 : -1) * (0.018 + seed * 0.026);
        falling._sway = reduce ? null : {
          amount: 0.08 + seed * 0.08,
          lift: 0.018 + seed * 0.02,
          phase: seed * Math.PI * 2,
          speed: 0.12 + seed * 0.08,
        };
        falling._wobble = reduce ? null : {
          amount: 0.018 + seed * 0.016,
          phase: seed * Math.PI,
          speed: 0.3 + seed * 0.18,
        };
        falling._life = reduce ? 42 : 78 + (cell.col % 6) * 3;
        effects.addChild(falling);
      } else {
        const burst = drawBubboBurst(pos.x, pos.y, layout.radius * 0.9, shot.color || cell.color || BUBBO_COLORS[0]);
        if (burst) effects.addChild(burst);
      }
      makeSparkles(effects, pos.x, pos.y, dropped ? SKY : AMBER, reduce ? 4 : 9);
      makeRipple(effects, pos.x, pos.y, AMBER, 24);
    }
  }

  function draw() {
    clear(root);
    clear(boardLayer);
    layout = buildLayout();
    const state = data.bubbo || {};
    const board = state.board || [];
    const frameBottom = Math.max(layout.bottom + layout.cell + 20, layout.cannonY + layout.cell * 1.2);
    const background = drawBubboBackground(root, app, layout, frameBottom);
    root.addChild(new Graphics().moveTo(layout.left, layout.finishLineY).lineTo(layout.right, layout.finishLineY).stroke({ color: background.finish, width: 3, alpha: 0.48 }));
    if (state.gameActive) {
      const pendingRow = currentPendingRow();
      for (let c = 0; c < BUBBO_COLS; c++) {
        const value = pendingRow[c];
        const pos = baseBubblePosition(-1, c);
        if (value) {
          const bubble = drawBubble(pos.x, pos.y, layout.radius * 0.96, value, 0.96, { glow: true });
          bubble._bubboBreath = {
            baseScale: 0.99,
            phase: bubbleBreathSeed(-1, c) * Math.PI * 2,
            speed: 0.022,
            amount: 0.01,
          };
          boardLayer.addChild(bubble);
        } else {
          boardLayer.addChild(new Graphics().circle(pos.x, pos.y, Math.max(1.5, layout.radius * 0.08)).fill({ color: 0xffffff, alpha: 0.07 }));
        }
      }
    }
    for (let r = 0; r < BUBBO_ROWS; r++) {
      for (let c = 0; c < BUBBO_COLS; c++) {
        const value = board[r]?.[c];
        const pos = baseBubblePosition(r, c);
        if (value) {
          const seed = bubbleBreathSeed(r, c);
          const breathEnabled = seed > 0.42;
          const bubble = drawBubble(pos.x, pos.y, layout.radius, value, 1, { glow: breathEnabled });
          const baseScale = 0.98 + Math.sin((r + c) * 0.9) * 0.015;
          bubble.scale.set(baseScale);
          if (breathEnabled) {
            bubble._bubboBreath = {
              baseScale,
              phase: seed * Math.PI * 2,
              speed: 0.026 + seed * 0.018,
              amount: 0.012 + seed * 0.014,
            };
          }
          boardLayer.addChild(bubble);
        } else {
          boardLayer.addChild(new Graphics().circle(pos.x, pos.y, Math.max(1.5, layout.radius * 0.08)).fill({ color: 0xffffff, alpha: 0.08 }));
        }
      }
    }

    const cannonColor = state.current || BUBBO_COLORS[0];
    root.addChild(sprite(gameAsset(BUBBO_ASSET_KEYS.bottomTray), layout.cannonX, Math.min(layout.playHeight - layout.cell * 0.24, layout.cannonY + layout.cell * 0.45), Math.min(viewWidth(app) * 1.05, layout.cell * 7.5), layout.cell * 2.05, 0.54));
    root.addChild(new Graphics().roundRect(layout.cannonX - 24, layout.cannonY - 8, 48, 54, 20).fill({ color: background.cannonPanel, alpha: 0.95 }).stroke({ color: SKY, width: 2, alpha: 0.38 }));
    root.addChild(sprite(gameAsset(BUBBO_ASSET_KEYS.cannonMain), layout.cannonX, layout.cannonY + 14, layout.radius * 2.45, layout.radius * 2.45, 0.92));
    root.addChild(drawBubble(layout.cannonX, layout.cannonY, layout.radius * 0.9, cannonColor));
    root.addChild(drawBubble(layout.cannonX + layout.radius * 1.65, layout.cannonY + layout.radius * 0.25, layout.radius * 0.52, state.next || BUBBO_COLORS[1], 0.86));
    if (!state.bottomHudReserve) {
      root.addChild(label(state.statusText || `${state.score || 0} pts · ${state.shotsLeft ?? 0} shots`, viewWidth(app) / 2, Math.min(layout.playHeight - 12, layout.cannonY + 46), 14, AMBER));
    }
    renderSignature = nextRenderSignature();
    applyPressureVisual();
    updateAimVisual();
    playShotEffects();
  }

  function fireShot() {
    const state = data.bubbo || {};
    if (!state.gameActive || projectile) return;
    const shot = calculateShot();
    if (!shot) return;
    clear(aimLayer);
    const firedColor = state.current || BUBBO_COLORS[0];
    projectile = {
      path: shot.path,
      segments: shotPathSegments(shot.path),
      distance: 0,
      color: firedColor,
      target: shot,
      view: drawBubble(shot.path[0].x, shot.path[0].y, layout.radius * 0.9, firedColor),
    };
    projectileLayer.addChild(projectile.view);
    data.onBubboShotStart?.(firedColor);
  }

  const down = (event) => {
    aimPoint = { x: event.global.x, y: event.global.y };
    pointer.start(event, { kind: "bubbo-aim" });
    updateAimVisual();
  };
  const cleanup = setupStage(app, pointer.move, pointer.end, () => pointer.cancel("stage"));
  app.stage.on("pointerdown", down);

  function shotPathSegments(path = []) {
    const segments = [];
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const from = path[i];
      const to = path[i + 1];
      const length = Math.max(0.001, Math.hypot(to.x - from.x, to.y - from.y));
      segments.push({ from, to, start: total, end: total + length, length });
      total += length;
    }
    return { segments, total };
  }

  function pointAtDistance(metrics, distance) {
    if (!metrics?.segments?.length) return null;
    const segment = metrics.segments.find((item) => distance <= item.end) || metrics.segments.at(-1);
    const t = Math.max(0, Math.min(1, (distance - segment.start) / segment.length));
    return {
      x: segment.from.x + (segment.to.x - segment.from.x) * t,
      y: segment.from.y + (segment.to.y - segment.from.y) * t,
    };
  }

  const ticker = (tickerState) => {
    tickParticles(effects, tickerState.deltaTime);
    tickBubboBreathing(tickerState.deltaTime);
    const pressureDelta = pressureTargetStep - pressureDisplayStep;
    if (Math.abs(pressureDelta) > 0.002) {
      const blend = Math.min(0.42, Math.max(0.12, (tickerState.deltaTime || 1) * 0.16));
      pressureDisplayStep += pressureDelta * blend;
      applyPressureVisual(true);
    } else if (pressureDisplayStep !== pressureTargetStep) {
      pressureDisplayStep = pressureTargetStep;
      applyPressureVisual(true);
    }
    if (!projectile) return;
    const pxPerFrame = Math.max(9, (layout?.cell || 32) * 0.42);
    projectile.distance += pxPerFrame * Math.max(0.5, tickerState.deltaTime || 1);
    const done = projectile.distance >= projectile.segments.total;
    const point = pointAtDistance(projectile.segments, Math.min(projectile.distance, projectile.segments.total));
    if (point) {
      projectile.view.x = point.x;
      projectile.view.y = point.y;
    }
    projectile.view.rotation += 0.08 * tickerState.deltaTime;
    if (done) {
      const current = projectile;
      projectile = null;
      clear(projectileLayer);
      data.onBubboFire?.(current.target.row, current.target.col, current.path, current.color);
    }
  };
  app.ticker.add(ticker);
  draw();
  return {
    update(next) {
      const previousShotId = data?.bubbo?.lastShot?.id;
      data = next || {};
      pressureTargetStep = Math.max(0, Math.min(1, Number(data.bubbo?.pressureStep) || 0));
      const shot = data.bubbo?.lastShot;
      if (shot?.shifted && shot.id && shot.id !== previousShotId && shot.id !== lastPressureShiftId) {
        lastPressureShiftId = shot.id;
        pressureDisplayStep = Math.max(-1, pressureDisplayStep - Number(shot.shifted || 1));
      } else if (pressureTargetStep + 0.24 < pressureDisplayStep && pressureDisplayStep > 0.92) {
        pressureDisplayStep = pressureTargetStep;
      }
      if (nextRenderSignature(data) !== renderSignature) {
        draw();
      } else {
        applyPressureVisual(true);
        updateAimVisual();
        playShotEffects();
      }
    },
    destroy() {
      cleanup();
      app.stage.off("pointerdown", down);
      pointer.cancel("destroy");
      app.ticker.remove(ticker);
      clear(root);
      clear(boardLayer);
      clear(aimLayer);
      clear(projectileLayer);
      clear(effects);
      root.destroy({ children: true });
      boardLayer.destroy({ children: true });
      aimLayer.destroy({ children: true });
      projectileLayer.destroy({ children: true });
      effects.destroy({ children: true });
    },
  };
}

export function buildMergeScene(app, initial = {}) {
  const root = new Container();
  const dragLayer = new Container();
  const effects = new Container();
  app.stage.addChild(root, dragLayer, effects);
  let data = initial;
  let layout = null;
  let drag = null;
  let destroyed = false;
  const dragVisual = makeRafScheduler(() => updateDragVisualNow());
  loadGraphicsManifest(() => {
    if (!destroyed) draw();
  });

  const pointer = createPointerSession({
    onMove: (next) => {
      if (!drag) return;
      drag.x = next.x;
      drag.y = next.y;
      updateDragVisual();
    },
    onTap: (done) => {
      const cell = done.data?.cell;
      const item = done.data?.item;
      drag = null;
      dragVisual.cancel();
      clear(dragLayer);
      if (cell) data.onMergeCell?.(cell.r, cell.c, item);
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
      || graphicsManifest?.graphics?.games?.gachaMerge?.items?.[item.id]
      || resolveAssetUrl(`gachaMerge.items.${item.id}`, { legacyPath: "" });
  }

  function sameMergeTarget(item, other) {
    return !!getMergePairResult(item, other);
  }

  function drawMergeItem(item, x, y, cell, alpha = 1) {
    const level = item?.level || 0;
    const radius = Math.min(cell * 0.42, 27);
    const fill = [0x9ed8b4, 0xf6c86d, 0xf29485, 0x8fc5e8, 0xcdb7e9, 0xf6b8d0, 0xffbf8f, 0xffefd0][level] || AMBER;
    const group = new Container();
    group.eventMode = "none";
    group.alpha = alpha;
    group.x = x;
    group.y = y;
    group.addChild(
      new Graphics()
        .circle(0, 0, radius)
        .fill({ color: fill, alpha: 0.96 })
        .stroke({ color: TEXT, width: 2, alpha: 0.3 }),
    );
    const asset = itemAsset(item);
    if (asset) {
      group.addChild(sprite(asset, 0, 0, radius * 1.8, radius * 1.8, 0.98));
    } else {
      group.addChild(label(itemText(item), 0, -1, Math.max(20, cell * 0.46), TEXT));
    }
    const badge = new Graphics()
      .roundRect(radius * 0.18, radius * 0.18, radius * 1.05, radius * 0.68, 5)
      .fill({ color: PANEL, alpha: 0.92 })
      .stroke({ color: fill, width: 1.5, alpha: 0.75 });
    group.addChild(badge);
    group.addChild(label(`${data.mergeLevelPrefix || "L"}${level + 1}`, radius * 0.7, radius * 0.53, Math.max(8, cell * 0.13), TEXT));
    return group;
  }

  function playMergeDropFeedback(point, result = {}, item = null) {
    const success = !result?.error;
    const color = success ? MINT : CORAL;
    makeSparkles(effects, point.x, point.y, color, success ? 14 : 6);
    makeRipple(effects, point.x, point.y, color, success ? 32 : 20);
    if (!success) {
      const reject = label(data.mergeMissText || "miss", point.x, point.y - 22, 13, CORAL);
      reject._tween = { fromX: reject.x, fromY: reject.y, toX: reject.x + 12, toY: reject.y - 18, duration: 18, fade: true, scaleFrom: 0.9, scaleTo: 1.05 };
      effects.addChild(reject);
      return;
    }
    const level = Number(result?.newItem?.level ?? item?.level ?? 0) + 1;
    const pop = label(`${data.mergeLevelPrefix || "L"}${level + 1}`, point.x, point.y - 26, 15, AMBER);
    pop._tween = { fromX: pop.x, fromY: pop.y, toX: pop.x, toY: pop.y - 34, duration: 24, fade: true, scaleFrom: 0.7, scaleTo: 1.22 };
    effects.addChild(pop);
    for (let i = 0; i < 6; i += 1) {
      const angle = -Math.PI / 2 + (i - 2.5) * 0.28;
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
  }

  function updateDragVisualNow() {
    clear(dragLayer);
    if (!drag?.item) return;
    const lift = Math.min(layout?.cell || 58, 52) * 0.38;
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
  }

  function updateDragVisual() {
    dragVisual.request();
  }

  function draw() {
    clear(root);
    const merge = data.merge || {};
    const board = merge.board || Array.from({ length: 7 }, () => Array(9).fill(null));
    const cols = 9;
    const rows = 7;
    const reservedTop = reserveFromShellChrome(app, ".merge-play-status", 66);
    const reservedBottom = reserveBottomFromShellChrome(app, ".merge-action-dock", data.mergeBottomReserve || 146);
    const fitted = fitGrid(app, cols, rows, 14, reservedBottom + 32, {
      reservedTop,
      verticalAnchor: 0.5,
      minCell: 30,
      maxCell: 58,
    });
    layout = { ...fitted, cols, rows };
    const { cell, left, top, width, height } = fitted;
    root.addChild(rect(left - 8, top - 8, width + 16, height + 16, PANEL, 14));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const item = board[r]?.[c];
        const selected = data.mergeSelected?.r === r && data.mergeSelected?.c === c;
        const matching = drag?.item && sameMergeTarget(drag.item, item) && !(drag.fromR === r && drag.fromC === c);
        const color = item ? [0x9ed8b4, 0xf6c86d, 0xf29485, 0x8fc5e8, 0xcdb7e9, 0xf6b8d0, 0xffbf8f, 0xffefd0][item.level || 0] : 0xe3eddc;
        const tile = matching || selected
          ? strokedRect(left + c * cell + 2, top + r * cell + 2, cell - 4, cell - 4, selected ? AMBER : MINT, 6, color, item ? 0.95 : 0.82, 3)
          : rect(left + c * cell + 2, top + r * cell + 2, cell - 4, cell - 4, color, 6, item ? 1 : 0.82);
        makeInteractive(tile, {
          pointerdown: (event) => {
            if (data.mergeLocked) return;
            if (!item) return;
            drag = { fromR: r, fromC: c, item, pointerId: event.pointerId, x: event.global.x, y: event.global.y, startX: event.global.x, startY: event.global.y };
            pointer.start(event, { kind: "merge-cell", cell: { r, c }, item });
            updateDragVisual();
          },
        });
        root.addChild(tile);
        if (item && !(drag?.fromR === r && drag?.fromC === c)) {
          root.addChild(drawMergeItem(item, left + c * cell + cell / 2, top + r * cell + cell / 2, cell));
        }
      }
    }
    updateDragVisual();
    root.addChild(label(data.mergeStatusText || (data.trashMode ? "Trash mode" : "Drag/tap merge pairs"), viewWidth(app) / 2, top + height + 24, 14, data.trashMode ? CORAL : MUTED));
  }

  const cleanup = setupStage(app, pointer.move, pointer.end, () => pointer.cancel("stage"));
  const ticker = () => tickParticles(effects);
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
