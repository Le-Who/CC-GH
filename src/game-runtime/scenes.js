import { Container, Graphics, Sprite, Text, TilingSprite, Texture } from "pixi.js";
import { CROPS, MERGE_CHAINS } from "../../game-logic.js";
import { createPointerSession } from "./pointerSession.js";
import {
  BUBBO_COLORS,
  BUBBO_COLS,
  BUBBO_PALETTE,
  BUBBO_ROWS,
  getBubboNeighbors,
} from "../game-core/bubbo/engine.js";
import { BOARD_SIZE, DROP_ICONS, GEM_ICONS } from "../game-core/match3/engine.js";
import { GRID } from "../game-core/blox/pieces.js";
import { canPlace as canPlaceBloxPiece } from "../game-core/blox/engine.js";

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

const BUBBO_IMAGE_BASE = "/games/bubbo-bubbo/images";
const POTIONS_IMAGE_BASE = "/games/puzzling-potions/images";

const BUBBO_BUBBLE_ASSETS = {
  mint: `${BUBBO_IMAGE_BASE}/bubble-green.png`,
  amber: `${BUBBO_IMAGE_BASE}/bubble-yellow.png`,
  coral: `${BUBBO_IMAGE_BASE}/bubble-red.png`,
  sky: `${BUBBO_IMAGE_BASE}/bubble-blue.png`,
  berry: `${BUBBO_IMAGE_BASE}/bubble-blue.png`,
};

const POTION_PIECE_ASSETS = {
  fire: `${POTIONS_IMAGE_BASE}/piece-dragon.png`,
  water: `${POTIONS_IMAGE_BASE}/piece-frog.png`,
  earth: `${POTIONS_IMAGE_BASE}/piece-newt.png`,
  air: `${POTIONS_IMAGE_BASE}/piece-snake.png`,
  light: `${POTIONS_IMAGE_BASE}/piece-spider.png`,
  dark: `${POTIONS_IMAGE_BASE}/piece-yeti.png`,
  special_row: `${POTIONS_IMAGE_BASE}/special-row.png`,
  special_column: `${POTIONS_IMAGE_BASE}/special-column.png`,
  special_blast: `${POTIONS_IMAGE_BASE}/special-blast.png`,
  special_colour: `${POTIONS_IMAGE_BASE}/special-colour.png`,
};

const FARM_SOIL = [0x7b4f2d, 0x8b5c34, 0x684022];
const PANEL = 0xfff8ea;
const PANEL_2 = 0xeaf3df;
const FIELD = 0xf6ead7;
const TEXT = 0x213049;
const MUTED = 0x66725f;
const MINT = 0x9ed8b4;
const AMBER = 0xf6c86d;
const CORAL = 0xf29485;
const SKY = 0x8fc5e8;
const BUBBO_NUMBERS = Object.fromEntries(
  Object.entries(BUBBO_PALETTE).map(([name, value]) => [name, Number.parseInt(value.slice(1), 16)]),
);

function viewWidth(app) {
  return app.screen?.width || app.renderer.width;
}

function viewHeight(app) {
  return app.screen?.height || app.renderer.height;
}

function clear(container) {
  for (const child of container.removeChildren()) {
    child.destroy({ children: true });
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

function cellFromPoint(layout, x, y) {
  if (!layout) return null;
  const col = Math.floor((x - layout.left) / layout.cell);
  const row = Math.floor((y - layout.top) / layout.cell);
  if (row < 0 || row >= layout.rows || col < 0 || col >= layout.cols) return null;
  return { row, col };
}

export function bloxPieceBounds(piece = {}) {
  const cells = piece.cells?.length ? piece.cells : [[0, 0]];
  const rows = cells.map(([row]) => row);
  const cols = cells.map(([, col]) => col);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const minCol = Math.min(...cols);
  const maxCol = Math.max(...cols);
  return {
    minRow,
    maxRow,
    minCol,
    maxCol,
    width: maxCol - minCol + 1,
    height: maxRow - minRow + 1,
  };
}

function centeredPieceOrigin(piece, x, y, width, height, unit) {
  const bounds = bloxPieceBounds(piece);
  return {
    x: x + (width - bounds.width * unit) / 2 - bounds.minCol * unit,
    y: y + (height - bounds.height * unit) / 2 - bounds.minRow * unit,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createBloxDragState({ pieceIdx, piece, event, originX, originY, unit }) {
  const bounds = bloxPieceBounds(piece);
  const source = event?.global || event || {};
  const point = {
    x: Number(source.x ?? event?.clientX ?? event?.pageX ?? 0),
    y: Number(source.y ?? event?.clientY ?? event?.pageY ?? 0),
  };
  const localX = (point.x - originX) / unit;
  const localY = (point.y - originY) / unit;
  const inside =
    localX >= bounds.minCol &&
    localX <= bounds.maxCol + 1 &&
    localY >= bounds.minRow &&
    localY <= bounds.maxRow + 1;
  return {
    pieceIdx,
    piece,
    startX: point.x,
    startY: point.y,
    x: point.x,
    y: point.y,
    grabX: inside ? clamp(localX, bounds.minCol, bounds.maxCol + 1) : bounds.minCol + bounds.width / 2,
    grabY: inside ? clamp(localY, bounds.minRow, bounds.maxRow + 1) : bounds.minRow + bounds.height / 2,
    moved: false,
    overCell: null,
  };
}

export function bloxGhostOrigin(drag, unit) {
  return {
    x: drag.x - drag.grabX * unit,
    y: drag.y - drag.grabY * unit,
  };
}

export function bloxAnchorCellFromDrag(layout, drag) {
  if (!layout || !drag?.piece) return null;
  const origin = bloxGhostOrigin(drag, layout.cell);
  const col = Math.round((origin.x - layout.left) / layout.cell);
  const row = Math.round((origin.y - layout.top) / layout.cell);
  if (row < -1 || row >= layout.rows || col < -1 || col >= layout.cols) return null;
  return { row, col };
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

function tickParticles(container) {
  for (const child of [...container.children]) {
    if (!child._life) continue;
    child._life -= 1;
    child.x += child._vx;
    child.y += child._vy;
    if (child._gravity) child._vy += child._gravity;
    if (child._spin) child.rotation += child._spin;
    child.alpha = Math.min(1, Math.max(0, child._life / 26));
    const baseScale = child._grow ? 1 + (1 - child.alpha) * child._grow : 0.96 + child.alpha * 0.35;
    child.scale.set(baseScale);
    if (child._life <= 0) child.destroy();
  }
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
  app.stage.on("pointercancel", up);
  window.addEventListener("blur", cancel);
  document.addEventListener("visibilitychange", visibility);
  return () => {
    app.stage.off("globalpointermove", move);
    app.stage.off("pointerup", up);
    app.stage.off("pointerupoutside", up);
    app.stage.off("pointercancel", up);
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
        root.addChild(label("soil", x + w / 2, y + w / 2, Math.max(10, cell * 0.13), 0xc69b61));
        continue;
      }

      const cfg = CROPS[plot.crop] || {};
      root.addChild(new Graphics().roundRect(x + w * 0.42, y + w * 0.38, w * 0.16, w * 0.34, 4).fill(0x61bd62));
      root.addChild(label(cfg.emoji || "seed", x + w / 2, y + w * 0.34, Math.max(18, cell * 0.28)));
      root.addChild(rect(x + w * 0.15, y + w * 0.78, w * 0.7, 6, 0x17231d, 6));
      root.addChild(rect(x + w * 0.15, y + w * 0.78, w * 0.7 * progress, 6, ready ? AMBER : MINT, 6));
      root.addChild(label(ready ? "READY" : isHolding ? "UPROOT" : plot.watered ? "watered" : `${Math.round(progress * 100)}%`, x + w / 2, y + w * 0.9, Math.max(8, cell * 0.1), ready ? AMBER : isHolding ? CORAL : MUTED));
    }
  }

  function handleStageTap(event) {
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
    const unit = drag.overCell ? layout.cell : Math.min(layout?.cell || 22, 28);
    const origin = drag.overCell
      ? { x: layout.left + drag.overCell.col * layout.cell, y: layout.top + drag.overCell.row * layout.cell }
      : bloxGhostOrigin(drag, unit);
    const ghost = drawPiece(drag.piece, origin.x, origin.y, unit, 0.76);
    const valid = drag.overCell && canPlaceBloxPiece(board, drag.piece, drag.overCell.row, drag.overCell.col);
    ghost.alpha = drag.overCell ? 0.96 : 0.66;
    dragLayer.addChild(ghost);
    if (drag.overCell) {
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
          makeSparkles(effects, point.x, point.y, result.clear?.cleared ? AMBER : MINT, 13);
          makeRipple(effects, point.x, point.y, result.clear?.cleared ? AMBER : MINT, result.clear?.cleared ? 34 : 24);
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
    const fitted = fit(app, GRID, GRID, 14, 180, { verticalAnchor: 0.45 });
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
    }

    updateDragVisual();
    root.addChild(label(`Score ${state.score || 0} · Lines ${state.linesCleared || 0}`, viewWidth(app) / 2, trayTop + 76, 14, AMBER));
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
    const pieceAsset = POTION_PIECE_ASSETS[gem];
    if (pieceAsset) dragLayer.addChild(sprite(pieceAsset, drag.x, drag.y, radius * 1.85, radius * 1.85, 0.92));
  }

  function updateDragVisual() {
    dragVisual.request();
  }

  function draw() {
    clear(root);
    const state = data.match3 || {};
    const board = state.board || state.savedModes?.[state.gameMode || "classic"]?.board || [];
    const fallback = data.fallbackBoard || [];
    const actual = board.length ? board : fallback;
    const fitted = fit(app, BOARD_SIZE, BOARD_SIZE, 14, 116, { verticalAnchor: 0.52 });
    layout = { ...fitted, cols: BOARD_SIZE, rows: BOARD_SIZE };
    const { size, cell, left, top } = fitted;
    root.addChild(rect(left - 10, top - 10, size + 20, size + 20, PANEL, 16));
    root.addChild(tiledSprite(`${POTIONS_IMAGE_BASE}/shelf-block.png`, left - 4, top - 4, size + 8, size + 8, 0.16));
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const gem = actual[y]?.[x];
        const color = GEM_COLORS[gem] || 0xa4af9a;
        const selected = data.selectedGem?.x === x && data.selectedGem?.y === y;
        const dragging = drag?.from?.x === x && drag?.from?.y === y;
        const tile = selected
          ? strokedRect(left + x * cell + 3, top + y * cell + 3, cell - 6, cell - 6, AMBER, 10, 0xf7efe0, 1, 3)
          : rect(left + x * cell + 3, top + y * cell + 3, cell - 6, cell - 6, 0xe8efdc, 10);
        makeInteractive(tile, {
          pointerdown: (event) => {
            if (!state.gameActive) return;
            drag = { from: { x, y }, pointerId: event.pointerId, startX: event.global.x, startY: event.global.y, x: event.global.x, y: event.global.y, target: null };
            pointer.start(event, { kind: "match3-cell", from: { x, y } });
          },
        });
        root.addChild(tile);
        const orb = new Graphics()
          .circle(left + x * cell + cell / 2, top + y * cell + cell / 2, cell * (selected ? 0.34 : 0.29))
          .fill({ color, alpha: dragging ? 0.38 : 1 });
        makeInteractive(orb, {
          pointerdown: (event) => {
            if (!state.gameActive) return;
            drag = { from: { x, y }, pointerId: event.pointerId, startX: event.global.x, startY: event.global.y, x: event.global.x, y: event.global.y, target: null };
            pointer.start(event, { kind: "match3-cell", from: { x, y } });
          },
        });
        root.addChild(orb);
        const pieceAsset = POTION_PIECE_ASSETS[gem];
        if (pieceAsset && !dragging) {
          root.addChild(sprite(pieceAsset, left + x * cell + cell / 2, top + y * cell + cell / 2, cell * 0.72, cell * 0.72, 0.96));
        }
        const icon = DROP_ICONS[gem] || GEM_ICONS[gem] || "";
        if (icon) root.addChild(label(icon, left + x * cell + cell / 2, top + y * cell + cell / 2, Math.max(12, cell * 0.34)));
      }
    }
    updateDragVisual();
    root.addChild(label(`${state.gameMode || "classic"} · ${state.score || 0} pts · ${state.movesLeft ?? 30} moves`, viewWidth(app) / 2, top + size + 24, 14, AMBER));
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

export function buildBubboScene(app, initial = {}) {
  const root = new Container();
  const aimLayer = new Container();
  const projectileLayer = new Container();
  const effects = new Container();
  app.stage.addChild(root, aimLayer, projectileLayer, effects);
  let data = initial;
  let layout = null;
  let aimPoint = null;
  let projectile = null;
  let lastShotId = null;
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

  function buildLayout() {
    const width = viewWidth(app);
    const height = viewHeight(app);
    const margin = 14;
    const cell = Math.max(24, Math.min((width - margin * 2) / (BUBBO_COLS + 0.55), (height - 92) / (BUBBO_ROWS + 1.2)));
    const boardWidth = cell * (BUBBO_COLS + 0.5);
    const left = (width - boardWidth) / 2;
    const top = Math.max(10, Math.min(18, (height - cell * (BUBBO_ROWS + 1.2) - 52) / 2));
    return {
      cell,
      radius: cell * 0.42,
      left,
      top,
      right: left + boardWidth,
      bottom: top + cell * BUBBO_ROWS,
      pressureOffset: Math.max(0, Math.min(1, Number(data.bubbo?.pressureStep) || 0)) * cell,
      cannonX: width / 2,
      cannonY: Math.min(height - 34, top + cell * (BUBBO_ROWS + 0.8)),
    };
  }

  function bubblePosition(row, col) {
    const offset = row % 2 ? layout.cell * 0.5 : 0;
    return {
      x: layout.left + offset + col * layout.cell + layout.cell / 2,
      y: layout.top + layout.pressureOffset + row * layout.cell + layout.cell / 2,
    };
  }

  function nearestCellFromPoint(board, x, y) {
    let best = null;
    let bestScore = Infinity;
    for (let row = 0; row < BUBBO_ROWS; row++) {
      for (let col = 0; col < BUBBO_COLS; col++) {
        if (board[row]?.[col]) continue;
        const touches = row === 0 || getBubboNeighbors(row, col).some(([nr, nc]) => board[nr]?.[nc]);
        if (!touches) continue;
        const pos = bubblePosition(row, col);
        const distance = (pos.x - x) ** 2 + (pos.y - y) ** 2;
        const score = distance + row * 10;
        if (score < bestScore) {
          bestScore = score;
          best = { row, col, x: pos.x, y: pos.y };
        }
      }
    }
    if (best) return best;
    for (let row = 0; row < BUBBO_ROWS; row++) {
      for (let col = 0; col < BUBBO_COLS; col++) {
        if (!board[row]?.[col]) {
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

      if (y <= layout.top + layout.radius) {
        const targetCell = nearestCellFromPoint(board, x, layout.top);
        if (!targetCell) return null;
        points.push({ x: targetCell.x, y: targetCell.y });
        return { ...targetCell, path: points };
      }

      for (let row = 0; row < BUBBO_ROWS; row++) {
        for (let col = 0; col < BUBBO_COLS; col++) {
          if (!board[row]?.[col]) continue;
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

  function drawBubble(x, y, radius, colorName, alpha = 1) {
    const color = bubbleColor(colorName);
    const group = new Container();
    const g = new Graphics()
      .circle(0, 0, radius)
      .fill({ color, alpha })
      .stroke({ color: TEXT, width: Math.max(1.5, radius * 0.09), alpha: 0.24 });
    g.circle(-radius * 0.28, -radius * 0.32, radius * 0.22).fill({ color: 0xffffff, alpha: 0.34 * alpha });
    group.addChild(g);
    const asset = BUBBO_BUBBLE_ASSETS[colorName];
    if (asset) group.addChild(sprite(asset, 0, 0, radius * 2.2, radius * 2.2, alpha));
    group.x = x;
    group.y = y;
    return group;
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

  function playShotEffects() {
    const shot = data.bubbo?.lastShot;
    if (!shot?.id || shot.id === lastShotId || !layout) return;
    lastShotId = shot.id;
    const targets = [...(shot.popped || []), ...(shot.dropped || [])];
    if (shot.landed && !targets.length) {
      const pos = bubblePosition(shot.landed.row, shot.landed.col);
      makeRipple(effects, pos.x, pos.y, AMBER, 22);
      return;
    }
    for (const cell of targets) {
      const pos = bubblePosition(cell.row, cell.col);
      const dropped = shot.dropped?.find((drop) => drop.row === cell.row && drop.col === cell.col);
      if (dropped) {
        const falling = drawBubble(pos.x, pos.y, layout.radius * 0.82, dropped.color || cell.color || BUBBO_COLORS[0], 0.92);
        falling._vx = (cell.col - BUBBO_COLS / 2) * 0.08;
        falling._vy = 2.8 + (cell.row % 3) * 0.35;
        falling._gravity = 0.22;
        falling._spin = (cell.col % 2 ? 1 : -1) * 0.045;
        falling._life = 40;
        effects.addChild(falling);
      }
      makeSparkles(effects, pos.x, pos.y, dropped ? SKY : AMBER, 9);
      makeRipple(effects, pos.x, pos.y, AMBER, 24);
    }
  }

  function draw() {
    clear(root);
    layout = buildLayout();
    const state = data.bubbo || {};
    const board = state.board || [];
    root.addChild(rect(layout.left - 10, layout.top - 10, layout.right - layout.left + 20, layout.bottom - layout.top + layout.cell + 20, PANEL, 16, 0.92));
    root.addChild(tiledSprite(`${BUBBO_IMAGE_BASE}/background-tile.png`, layout.left - 8, layout.top - 8, layout.right - layout.left + 16, layout.bottom - layout.top + layout.cell + 16, 0.2));
    root.addChild(new Graphics().moveTo(layout.left, layout.bottom - layout.cell * 0.2).lineTo(layout.right, layout.bottom - layout.cell * 0.2).stroke({ color: CORAL, width: 3, alpha: 0.45 }));
    for (let r = 0; r < BUBBO_ROWS; r++) {
      for (let c = 0; c < BUBBO_COLS; c++) {
        const value = board[r]?.[c];
        const pos = bubblePosition(r, c);
        if (value) {
          const bubble = drawBubble(pos.x, pos.y, layout.radius, value);
          bubble.scale.set(0.98 + Math.sin((r + c) * 0.9) * 0.015);
          root.addChild(bubble);
        } else {
          root.addChild(new Graphics().circle(pos.x, pos.y, Math.max(1.5, layout.radius * 0.08)).fill({ color: 0xffffff, alpha: 0.08 }));
        }
      }
    }

    const cannonColor = state.current || BUBBO_COLORS[0];
    root.addChild(new Graphics().roundRect(layout.cannonX - 24, layout.cannonY - 8, 48, 54, 20).fill({ color: PANEL_2, alpha: 0.95 }).stroke({ color: SKY, width: 2, alpha: 0.38 }));
    root.addChild(sprite(`${BUBBO_IMAGE_BASE}/cannon-main.png`, layout.cannonX, layout.cannonY + 14, layout.radius * 2.45, layout.radius * 2.45, 0.92));
    root.addChild(drawBubble(layout.cannonX, layout.cannonY, layout.radius * 0.9, cannonColor));
    root.addChild(drawBubble(layout.cannonX + layout.radius * 1.65, layout.cannonY + layout.radius * 0.25, layout.radius * 0.52, state.next || BUBBO_COLORS[1], 0.86));
    root.addChild(label(`${state.score || 0} pts · ${state.shotsLeft ?? 0} shots`, viewWidth(app) / 2, Math.min(viewHeight(app) - 12, layout.cannonY + 46), 14, AMBER));
    updateAimVisual();
    playShotEffects();
  }

  function fireShot() {
    const state = data.bubbo || {};
    if (!state.gameActive || projectile) return;
    const shot = calculateShot();
    if (!shot) return;
    clear(aimLayer);
    projectile = {
      path: shot.path,
      segment: 0,
      progress: 0,
      color: state.current || BUBBO_COLORS[0],
      target: shot,
      view: drawBubble(shot.path[0].x, shot.path[0].y, layout.radius * 0.9, state.current || BUBBO_COLORS[0]),
    };
    projectileLayer.addChild(projectile.view);
  }

  const down = (event) => {
    aimPoint = { x: event.global.x, y: event.global.y };
    pointer.start(event, { kind: "bubbo-aim" });
    updateAimVisual();
  };
  const cleanup = setupStage(app, pointer.move, pointer.end, () => pointer.cancel("stage"));
  app.stage.on("pointerdown", down);

  const ticker = (tickerState) => {
    tickParticles(effects);
    if (!projectile) return;
    const speed = Math.max(0.085, tickerState.deltaTime * 0.105);
    projectile.progress += speed;
    while (projectile.progress >= 1 && projectile.segment < projectile.path.length - 2) {
      projectile.progress -= 1;
      projectile.segment += 1;
    }
    const from = projectile.path[projectile.segment];
    const to = projectile.path[Math.min(projectile.segment + 1, projectile.path.length - 1)];
    const done = projectile.segment >= projectile.path.length - 2 && projectile.progress >= 1;
    const t = Math.min(1, projectile.progress);
    projectile.view.x = from.x + (to.x - from.x) * t;
    projectile.view.y = from.y + (to.y - from.y) * t;
    projectile.view.rotation += 0.08 * tickerState.deltaTime;
    if (done) {
      const current = projectile;
      projectile = null;
      clear(projectileLayer);
      data.onBubboFire?.(current.target.row, current.target.col, current.path);
    }
  };
  app.ticker.add(ticker);
  draw();
  return {
    update(next) {
      data = next || {};
      draw();
    },
    destroy() {
      cleanup();
      app.stage.off("pointerdown", down);
      pointer.cancel("destroy");
      app.ticker.remove(ticker);
      clear(root);
      clear(aimLayer);
      clear(projectileLayer);
      clear(effects);
      root.destroy({ children: true });
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
  const dragVisual = makeRafScheduler(() => updateDragVisualNow());

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
          makeSparkles(effects, done.x, done.y, result?.error ? CORAL : MINT, result?.error ? 5 : 10);
          if (!result?.error) makeRipple(effects, done.x, done.y, MINT, 26);
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

  function sameMergeTarget(item, other) {
    return item && other && item.chainId === other.chainId && item.level === other.level;
  }

  function updateDragVisualNow() {
    clear(dragLayer);
    if (!drag?.item) return;
    const radius = Math.min(30, (layout?.cell || 58) * 0.4);
    dragLayer.addChild(
      new Graphics()
        .circle(drag.x, drag.y, radius)
        .fill({ color: AMBER, alpha: 0.84 })
        .stroke({ color: TEXT, width: 2, alpha: 0.55 }),
    );
    dragLayer.addChild(label(itemText(drag.item), drag.x, drag.y - 1, Math.max(16, (layout?.cell || 58) * 0.34)));
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
    const fitted = fit(app, cols, rows, 14, 8);
    layout = { ...fitted, cols, rows };
    const { cell, left, top } = fitted;
    const width = cell * cols;
    const height = cell * rows;
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
          root.addChild(label(itemText(item), left + c * cell + cell / 2, top + r * cell + cell * 0.46, Math.max(15, cell * 0.34)));
          root.addChild(label(`L${(item.level || 0) + 1}`, left + c * cell + cell / 2, top + r * cell + cell * 0.78, Math.max(8, cell * 0.12), PANEL));
        }
      }
    }
    updateDragVisual();
    root.addChild(label(data.trashMode ? "Trash mode" : "Drag/tap merge pairs", viewWidth(app) / 2, top + height + 24, 14, data.trashMode ? CORAL : MUTED));
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
