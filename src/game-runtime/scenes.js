import { Container, Graphics, Text } from "pixi.js";
import { CROPS, MERGE_CHAINS } from "../../game-logic.js";
import { BOARD_SIZE, DROP_ICONS, GEM_ICONS } from "../game-core/match3/engine.js";
import { GRID } from "../game-core/blox/pieces.js";

const GEM_COLORS = {
  fire: 0xff5a5f,
  water: 0x49a6ff,
  earth: 0x58d68d,
  air: 0xd7e4f2,
  light: 0xffd45e,
  dark: 0xa678ff,
  drop_gold: 0xffc247,
  drop_seeds: 0x8ee06a,
  drop_energy: 0x70d6ff,
};

const FARM_SOIL = [0x7b4f2d, 0x8b5c34, 0x684022];
const PANEL = 0x101722;
const PANEL_2 = 0x172432;
const FIELD = 0x0b1118;
const TEXT = 0xfff4d8;
const MUTED = 0xa9b5c4;
const MINT = 0x70e5a0;
const AMBER = 0xffcc5f;
const CORAL = 0xff7867;
const SKY = 0x78c7ff;

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
  return item;
}

function rect(x, y, w, h, color, radius = 8, alpha = 1) {
  return new Graphics().roundRect(x, y, w, h, radius).fill({ color, alpha });
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

function fit(app, cols, rows, margin = 18, extraBottom = 0) {
  const width = app.renderer.width;
  const height = app.renderer.height - extraBottom;
  const size = Math.max(140, Math.min(width - margin * 2, height - margin * 2));
  return {
    size,
    cell: size / Math.max(cols, rows),
    left: (width - size) / 2,
    top: margin,
  };
}

function cellFromPoint(layout, x, y) {
  if (!layout) return null;
  const col = Math.floor((x - layout.left) / layout.cell);
  const row = Math.floor((y - layout.top) / layout.cell);
  if (row < 0 || row >= layout.rows || col < 0 || col >= layout.cols) return null;
  return { row, col };
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
    child.alpha = Math.max(0, child._life / 26);
    child.scale.set(0.96 + child.alpha * 0.35);
    if (child._life <= 0) child.destroy();
  }
}

function setupStage(app, onMove, onUp) {
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  const move = (event) => onMove?.(event);
  const up = (event) => onUp?.(event);
  app.stage.on("globalpointermove", move);
  app.stage.on("pointerup", up);
  app.stage.on("pointerupoutside", up);
  app.stage.on("pointercancel", up);
  return () => {
    app.stage.off("globalpointermove", move);
    app.stage.off("pointerup", up);
    app.stage.off("pointerupoutside", up);
    app.stage.off("pointercancel", up);
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
        pointerdown: () => {
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
        },
        pointerup: () => {
          if (!hold || hold.index !== i) return;
          window.clearTimeout(hold.timer);
          hold = null;
        },
        pointertap: () => {
          if (suppressTap) return;
          data.onFarmPlot?.(i, plot);
          makeSparkles(effects, x + w / 2, y + w / 2, ready ? AMBER : MINT, 6);
          draw();
        },
        pointerupoutside: () => finishHold(true),
        pointercancel: () => finishHold(true),
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

  const cleanup = setupStage(app, null, () => finishHold(true));
  app.stage.on("pointertap", handleStageTap);
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
      app.stage.off("pointertap", handleStageTap);
      app.ticker.remove(ticker);
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
  const effects = new Container();
  app.stage.addChild(root, effects);
  let data = initial;
  let layout = null;
  let drag = null;

  function drawPiece(piece, x, y, unit, alpha = 1) {
    const group = new Container();
    for (const [r, c] of piece.cells || []) {
      group.addChild(rect(x + c * unit, y + r * unit, unit - 2, unit - 2, colorNumber(piece.color), 4, alpha));
    }
    return group;
  }

  function drawGhost() {
    if (!drag?.piece) return;
    const unit = Math.min(layout?.cell || 22, 28);
    const ghost = drawPiece(drag.piece, drag.x - unit * 0.8, drag.y - unit * 0.8, unit, 0.76);
    ghost.alpha = drag.overCell ? 0.98 : 0.66;
    root.addChild(ghost);
    if (drag.overCell) {
      const x = layout.left + drag.overCell.col * layout.cell + 1;
      const y = layout.top + drag.overCell.row * layout.cell + 1;
      root.addChild(strokedRect(x, y, layout.cell - 2, layout.cell - 2, AMBER, 6, 0x1f2a39, 0.55, 3));
    }
  }

  function dropDrag(event) {
    if (!drag) return;
    const point = event?.global || drag;
    const target = cellFromPoint(layout, point.x, point.y);
    const current = drag;
    drag = null;
    if (target && data.blox?.gameActive) {
      data.onBloxDrop?.(current.pieceIdx, target.row, target.col)?.then?.((result) => {
        if (!result?.error) makeSparkles(effects, point.x, point.y, result.clear?.cleared ? AMBER : MINT, 11);
      });
    } else if (current.moved) {
      makeSparkles(effects, current.startX, current.startY, CORAL, 5);
    } else {
      data.onBloxTray?.(current.pieceIdx);
    }
    draw();
  }

  function draw() {
    clear(root);
    const state = data.blox || {};
    const board = state.board || state.savedState?.board || Array.from({ length: GRID }, () => Array(GRID).fill(null));
    const tray = state.tray || state.savedState?.tray || [];
    const fitted = fit(app, GRID, GRID, 14, 88);
    layout = { ...fitted, cols: GRID, rows: GRID };
    const { size, cell, left, top } = fitted;
    root.addChild(rect(left - 8, top - 8, size + 16, size + 16, PANEL, 14));

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const value = board[r]?.[c];
        const color = value ? colorNumber(value) : 0x223042;
        const tile = rect(left + c * cell + 2, top + r * cell + 2, cell - 4, cell - 4, color, 5, value ? 1 : 0.88);
        makeInteractive(tile, {
          pointertap: () => data.onBloxCell?.(r, c),
        });
        root.addChild(tile);
      }
    }

    const trayTop = top + size + 16;
    const trayUnit = Math.min(18, Math.max(10, (app.renderer.width - 70) / 18));
    const slotW = (app.renderer.width - 36) / 3;
    for (let i = 0; i < 3; i++) {
      const t = tray[i];
      const x = 14 + i * slotW;
      const slot = rect(x, trayTop, slotW - 8, 58, i === data.selectedBloxPiece ? 0x31445b : PANEL_2, 10, t?.placed ? 0.45 : 1);
      makeInteractive(slot, {
        pointerdown: (event) => {
          if (!t?.piece || t.placed || !state.gameActive) {
            data.onBloxTray?.(i);
            return;
          }
          drag = {
            pieceIdx: i,
            piece: t.piece,
            startX: event.global.x,
            startY: event.global.y,
            x: event.global.x,
            y: event.global.y,
            moved: false,
            overCell: null,
          };
          draw();
        },
        pointertap: () => data.onBloxTray?.(i),
      });
      root.addChild(slot);
      if (t?.piece && drag?.pieceIdx !== i) root.addChild(drawPiece(t.piece, x + 14, trayTop + 12, trayUnit, t.placed ? 0.35 : 1));
    }

    drawGhost();
    root.addChild(label(`Score ${state.score || 0} · Lines ${state.linesCleared || 0}`, app.renderer.width / 2, trayTop + 76, 14, AMBER));
  }

  const cleanup = setupStage(
    app,
    (event) => {
      if (!drag) return;
      drag.x = event.global.x;
      drag.y = event.global.y;
      drag.moved = drag.moved || Math.abs(drag.x - drag.startX) + Math.abs(drag.y - drag.startY) > 8;
      drag.overCell = cellFromPoint(layout, drag.x, drag.y);
      draw();
    },
    dropDrag,
  );
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
      clear(root);
      clear(effects);
      root.destroy({ children: true });
      effects.destroy({ children: true });
    },
  };
}

export function buildMatch3Scene(app, initial = {}) {
  const root = new Container();
  const effects = new Container();
  app.stage.addChild(root, effects);
  let data = initial;
  let layout = null;
  let drag = null;

  function draw() {
    clear(root);
    const state = data.match3 || {};
    const board = state.board || state.savedModes?.[state.gameMode || "classic"]?.board || [];
    const fallback = data.fallbackBoard || [];
    const actual = board.length ? board : fallback;
    const fitted = fit(app, BOARD_SIZE, BOARD_SIZE, 14, 8);
    layout = { ...fitted, cols: BOARD_SIZE, rows: BOARD_SIZE };
    const { size, cell, left, top } = fitted;
    root.addChild(rect(left - 10, top - 10, size + 20, size + 20, PANEL, 16));
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const gem = actual[y]?.[x];
        const color = GEM_COLORS[gem] || 0x5f6c7a;
        const selected = data.selectedGem?.x === x && data.selectedGem?.y === y;
        const dragging = drag?.from?.x === x && drag?.from?.y === y;
        const tile = selected
          ? strokedRect(left + x * cell + 3, top + y * cell + 3, cell - 6, cell - 6, AMBER, 10, 0x26364a, 1, 3)
          : rect(left + x * cell + 3, top + y * cell + 3, cell - 6, cell - 6, 0x1c2837, 10);
        makeInteractive(tile, {
          pointerdown: (event) => {
            if (!state.gameActive) return;
            drag = { from: { x, y }, startX: event.global.x, startY: event.global.y, x: event.global.x, y: event.global.y };
          },
          pointertap: () => data.onMatch3Cell?.(x, y),
        });
        root.addChild(tile);
        const orb = new Graphics()
          .circle(left + x * cell + cell / 2, top + y * cell + cell / 2, cell * (selected ? 0.34 : 0.29))
          .fill({ color, alpha: dragging ? 0.38 : 1 });
        makeInteractive(orb, {
          pointerdown: (event) => {
            if (!state.gameActive) return;
            drag = { from: { x, y }, startX: event.global.x, startY: event.global.y, x: event.global.x, y: event.global.y };
          },
          pointertap: () => data.onMatch3Cell?.(x, y),
        });
        root.addChild(orb);
        const icon = DROP_ICONS[gem] || GEM_ICONS[gem] || "";
        if (icon) root.addChild(label(icon, left + x * cell + cell / 2, top + y * cell + cell / 2, Math.max(12, cell * 0.34)));
      }
    }
    if (drag) {
      const from = drag.from;
      const gem = actual[from.y]?.[from.x];
      const color = GEM_COLORS[gem] || 0x5f6c7a;
      root.addChild(new Graphics().circle(drag.x, drag.y, cell * 0.31).fill({ color, alpha: 0.72 }).stroke({ color: TEXT, width: 2, alpha: 0.55 }));
    }
    root.addChild(label(`${state.gameMode || "classic"} · ${state.score || 0} pts · ${state.movesLeft ?? 30} moves`, app.renderer.width / 2, top + size + 24, 14, AMBER));
  }

  const cleanup = setupStage(
    app,
    (event) => {
      if (!drag) return;
      drag.x = event.global.x;
      drag.y = event.global.y;
      draw();
    },
    (event) => {
      if (!drag) return;
      const current = drag;
      drag = null;
      const target = cellFromPoint(layout, event.global.x, event.global.y);
      if (target && (target.row !== current.from.y || target.col !== current.from.x)) {
        data.onMatch3Swap?.(current.from, { x: target.col, y: target.row });
        makeSparkles(effects, event.global.x, event.global.y, SKY, 7);
      } else if (Math.abs(event.global.x - current.startX) + Math.abs(event.global.y - current.startY) < 8) {
        data.onMatch3Cell?.(current.from.x, current.from.y);
      }
      draw();
    },
  );
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
      clear(root);
      clear(effects);
      root.destroy({ children: true });
      effects.destroy({ children: true });
    },
  };
}

export function buildMergeScene(app, initial = {}) {
  const root = new Container();
  const effects = new Container();
  app.stage.addChild(root, effects);
  let data = initial;
  let layout = null;
  let drag = null;

  function itemText(item) {
    if (!item) return "";
    const chain = MERGE_CHAINS[item.chainId];
    return chain?.emoji?.[item.level] || String((item.level || 0) + 1);
  }

  function sameMergeTarget(item, other) {
    return item && other && item.chainId === other.chainId && item.level === other.level;
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
        const color = item ? [0x6ee7b7, 0xfcd34d, 0xfb7185, 0x93c5fd, 0xc4b5fd, 0xf9a8d4, 0xfdba74, 0xfff1a8][item.level || 0] : 0x223024;
        const tile = matching || selected
          ? strokedRect(left + c * cell + 2, top + r * cell + 2, cell - 4, cell - 4, selected ? AMBER : MINT, 6, color, item ? 0.95 : 0.82, 3)
          : rect(left + c * cell + 2, top + r * cell + 2, cell - 4, cell - 4, color, 6, item ? 1 : 0.82);
        makeInteractive(tile, {
          pointerdown: (event) => {
            if (!item) return;
            drag = { fromR: r, fromC: c, item, x: event.global.x, y: event.global.y, startX: event.global.x, startY: event.global.y };
            draw();
          },
          pointertap: () => data.onMergeCell?.(r, c, item),
        });
        root.addChild(tile);
        if (item && !(drag?.fromR === r && drag?.fromC === c)) {
          root.addChild(label(itemText(item), left + c * cell + cell / 2, top + r * cell + cell * 0.46, Math.max(15, cell * 0.34)));
          root.addChild(label(`L${(item.level || 0) + 1}`, left + c * cell + cell / 2, top + r * cell + cell * 0.78, Math.max(8, cell * 0.12), PANEL));
        }
      }
    }
    if (drag?.item) {
      root.addChild(new Graphics().circle(drag.x, drag.y, Math.min(26, cell * 0.38)).fill({ color: AMBER, alpha: 0.82 }).stroke({ color: TEXT, width: 2, alpha: 0.5 }));
      root.addChild(label(itemText(drag.item), drag.x, drag.y - 1, Math.max(16, cell * 0.34)));
    }
    root.addChild(label(data.trashMode ? "Trash mode" : "Drag/tap merge pairs", app.renderer.width / 2, top + height + 24, 14, data.trashMode ? CORAL : MUTED));
  }

  const cleanup = setupStage(
    app,
    (event) => {
      if (!drag) return;
      drag.x = event.global.x;
      drag.y = event.global.y;
      draw();
    },
    (event) => {
      if (!drag) return;
      const current = drag;
      drag = null;
      const target = cellFromPoint(layout, event.global.x, event.global.y);
      if (target) {
        data.onMergeDrop?.(current.fromR, current.fromC, target.row, target.col, current.item)?.then?.((result) => {
          makeSparkles(effects, event.global.x, event.global.y, result?.error ? CORAL : MINT, result?.error ? 5 : 10);
        });
      }
      draw();
    },
  );
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
      clear(root);
      clear(effects);
      root.destroy({ children: true });
      effects.destroy({ children: true });
    },
  };
}
