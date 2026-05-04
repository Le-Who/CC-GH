import { Container, Graphics, Rectangle, Sprite, Text, TilingSprite, Texture } from "pixi.js";
import { CROPS, MERGE_CHAINS, getMergePairResult } from "../../../../game-logic.js";
import { createPointerSession } from "../../pointerSession.js";
import {
  BUBBO_COLORS,
  BUBBO_COLS,
  BUBBO_PALETTE,
  BUBBO_ROWS,
  generateBubboWave,
  getAssistedBubboAim,
  getBubboNeighbors,
  getBubboRowVisualOffset,
} from "../../../game-core/bubbo/engine.js";
import { BOARD_SIZE, DROP_ICONS, GEM_ICONS } from "../../../game-core/match3/engine.js";
import { MATCH3_TIMING, match3StepStartFrame } from "../../../game-core/match3/animation.js";
import { GRID } from "../../../game-core/blox/pieces.js";
import { canPlace as canPlaceBloxPiece } from "../../../game-core/blox/engine.js";
import { resolveAssetUrl } from "../../assetBundles.js";
import {
  bloxAnchorCellFromDrag,
  bloxGhostOrigin,
  bloxPieceBounds,
  createBloxDragState,
  tickParticles,
} from "../../sceneGeometry.js";

const GEM_COLORS = {
  fire: 0xff5534,
  water: 0x1687ff,
  earth: 0x4f9a34,
  air: 0xff1493,
  light: 0xffc629,
  dark: 0x4a36b8,
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
  drop_gold: "match3.drop.gold",
  drop_seeds: "match3.drop.seeds",
  drop_energy: "match3.drop.energy",
};

const MATCH3_ASSET_KEYS = {
  backgroundTable: "match3.background.table",
  boardFrame: "match3.board.frame",
  boardCell: "match3.board.cell",
  boardCellSelected: "match3.board.cellSelected",
  uiHudBar: "match3.ui.hudBar",
  uiMenuPanel: "match3.ui.menuPanel",
  fxClearBurst: "match3.fx.clearBurst",
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

function offsetTopWithin(container, element) {
  if (!container || !element || typeof HTMLElement === "undefined") return null;
  let top = 0;
  let current = element;
  while (current && current !== container && current instanceof HTMLElement) {
    top += current.offsetTop || 0;
    current = current.offsetParent;
  }
  return current === container ? top : null;
}

function reserveFromShellChrome(app, selector, fallback = 0) {
  const shell = shellElement(app);
  const chrome = shell?.querySelector?.(selector);
  const canvasRect = app.canvas?.getBoundingClientRect?.();
  const chromeRect = chrome?.getBoundingClientRect?.();
  if (!canvasRect || !chromeRect || chromeRect.height <= 0) return fallback;
  const canvasTop = offsetTopWithin(shell, app.canvas);
  const chromeTop = offsetTopWithin(shell, chrome);
  const reserve = canvasTop != null && chromeTop != null
    ? chromeTop + chrome.offsetHeight - canvasTop + 8
    : chromeRect.bottom - canvasRect.top + 8;
  return Math.max(fallback, Math.ceil(reserve));
}

function reserveBottomFromShellChrome(app, selector, fallback = 0) {
  const shell = shellElement(app);
  const chrome = shell?.querySelector?.(selector);
  const canvasRect = app.canvas?.getBoundingClientRect?.();
  const chromeRect = chrome?.getBoundingClientRect?.();
  if (!canvasRect || !chromeRect || chromeRect.height <= 0) return fallback;
  const canvasTop = offsetTopWithin(shell, app.canvas);
  const chromeTop = offsetTopWithin(shell, chrome);
  const reserve = canvasTop != null && chromeTop != null
    ? canvasTop + app.canvas.offsetHeight - chromeTop + 8
    : canvasRect.bottom - chromeRect.top + 8;
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

function graphicsGameAsset(game, section, id) {
  return graphicsManifest?.graphics?.games?.[game]?.[section]?.[id] || "";
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


export {
  Container, Graphics, Rectangle, Sprite, Text, TilingSprite, Texture,
  CROPS, MERGE_CHAINS, getMergePairResult, createPointerSession,
  BUBBO_COLORS, BUBBO_COLS, BUBBO_PALETTE, BUBBO_ROWS, generateBubboWave, getAssistedBubboAim, getBubboNeighbors, getBubboRowVisualOffset,
  BOARD_SIZE, DROP_ICONS, GEM_ICONS, MATCH3_TIMING, match3StepStartFrame, GRID, canPlaceBloxPiece, resolveAssetUrl,
  GEM_COLORS, BUBBO_ASSET_KEYS, BUBBO_BALL_SHEET_WIDTH, BUBBO_BALL_SHEET_HEIGHT, BUBBO_BALL_ROWS, BUBBO_BALL_FRAMES, BUBBO_BALL_DRAW_SCALE, BUBBO_BUBBLE_ASSETS, POTION_PIECE_ASSETS, MATCH3_ASSET_KEYS,
  FARM_SOIL, PANEL, PANEL_2, FIELD, TEXT, MUTED, MINT, AMBER, CORAL, SKY, BUBBO_NUMBERS, BUBBO_BACKGROUND_THEMES,
  viewWidth, viewHeight, shellElement, reserveFromShellChrome, reserveBottomFromShellChrome, publishCanvasLayout, currentUiTheme, clear, destroyLater, label, rect, sprite, bubboBallFrame, bubboBallTexture, gameAsset, loadGraphicsManifest, graphicsGameAsset, tiledSprite, strokedRect, colorNumber, makeInteractive, fit, fitWithTopReserve, fitGrid, cellFromPoint, centeredPieceOrigin, isAdjacentMatch3Cell, match3TargetFromGesture, cropProgress, makeSparkles, cellCenter, makeTween, drawBubboBackground, makeRipple, makeRafScheduler, setupStage,
  bloxAnchorCellFromDrag, bloxGhostOrigin, bloxPieceBounds, createBloxDragState, tickParticles,
};
