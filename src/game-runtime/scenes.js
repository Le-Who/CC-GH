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
const LINE = 0x2b3b4f;
const TEXT = 0xfff4d8;
const MUTED = 0xa9b5c4;
const MINT = 0x70e5a0;
const AMBER = 0xffcc5f;
const CORAL = 0xff7867;

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

function makeButtonLike(g, onTap) {
  g.eventMode = "static";
  g.cursor = "pointer";
  g.on("pointertap", (event) => {
    event.stopPropagation();
    onTap?.();
  });
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

function cropProgress(plot, now) {
  if (!plot?.crop || !plot?.plantedAt) return 0;
  const base = plot.effectiveGrowthTime || plot.growthTime || CROPS[plot.crop]?.growthTime || 60_000;
  const multiplier = plot.watered ? plot.wateringMultiplier || 0.7 : 1;
  return Math.max(0, Math.min(1, (now - plot.plantedAt) / (base * multiplier)));
}

export function buildFarmScene(app, initial = {}) {
  const root = new Container();
  app.stage.addChild(root);
  let data = initial;

  function draw() {
    clear(root);
    const snapshot = data.snapshot || {};
    const farm = snapshot.farm || {};
    const plots = farm.plots || [];
    const now = snapshot.serverTime ? Date.now() : Date.now();
    const cols = 4;
    const rows = Math.max(2, Math.ceil(Math.max(plots.length, 6) / cols));
    const { cell, left, top } = fit(app, cols, rows, 16, 10);
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
      const tile = rect(x, y, w, w, planted ? 0x234b2f : FARM_SOIL[i % FARM_SOIL.length], 12);
      tile.lineStyle?.();
      makeButtonLike(tile, () => data.onFarmPlot?.(i, plot));
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
      const stem = new Graphics()
        .roundRect(x + w * 0.42, y + w * 0.38, w * 0.16, w * 0.34, 4)
        .fill(0x61bd62);
      root.addChild(stem);
      root.addChild(label(cfg.emoji || "🌱", x + w / 2, y + w * 0.34, Math.max(18, cell * 0.28)));

      const barW = w * 0.7;
      root.addChild(rect(x + w * 0.15, y + w * 0.78, barW, 6, 0x17231d, 6));
      root.addChild(rect(x + w * 0.15, y + w * 0.78, barW * progress, 6, ready ? AMBER : MINT, 6));
      root.addChild(label(ready ? "READY" : plot.watered ? "watered" : `${Math.round(progress * 100)}%`, x + w / 2, y + w * 0.9, Math.max(8, cell * 0.1), ready ? AMBER : MUTED));
    }
  }

  draw();
  return {
    update(next) {
      data = next || {};
      draw();
    },
    destroy() {
      clear(root);
      root.destroy({ children: true });
    },
  };
}

export function buildBloxScene(app, initial = {}) {
  const root = new Container();
  app.stage.addChild(root);
  let data = initial;

  function drawPiece(piece, x, y, unit, alpha = 1) {
    const group = new Container();
    for (const [r, c] of piece.cells || []) {
      group.addChild(rect(x + c * unit, y + r * unit, unit - 2, unit - 2, Number.parseInt(String(piece.color || "#70e5a0").replace("#", ""), 16) || MINT, 4, alpha));
    }
    return group;
  }

  function draw() {
    clear(root);
    const state = data.blox || {};
    const board = state.board || state.savedState?.board || Array.from({ length: GRID }, () => Array(GRID).fill(null));
    const tray = state.tray || state.savedState?.tray || [];
    const { size, cell, left, top } = fit(app, GRID, GRID, 14, 86);
    root.addChild(rect(left - 8, top - 8, size + 16, size + 16, PANEL, 14));

    for (let r = 0; r < GRID; r++) {
      for (let c = 0; c < GRID; c++) {
        const value = board[r]?.[c];
        const color = value ? Number.parseInt(String(value).replace("#", ""), 16) || MINT : 0x223042;
        const tile = rect(left + c * cell + 2, top + r * cell + 2, cell - 4, cell - 4, color, 5, value ? 1 : 0.88);
        makeButtonLike(tile, () => data.onBloxCell?.(r, c));
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
      makeButtonLike(slot, () => data.onBloxTray?.(i));
      root.addChild(slot);
      if (t?.piece) root.addChild(drawPiece(t.piece, x + 14, trayTop + 12, trayUnit, t.placed ? 0.35 : 1));
    }

    root.addChild(label(`Score ${state.score || 0} · Lines ${state.linesCleared || 0}`, app.renderer.width / 2, trayTop + 76, 14, AMBER));
  }

  draw();
  return {
    update(next) {
      data = next || {};
      draw();
    },
    destroy() {
      clear(root);
      root.destroy({ children: true });
    },
  };
}

export function buildMatch3Scene(app, initial = {}) {
  const root = new Container();
  app.stage.addChild(root);
  let data = initial;

  function draw() {
    clear(root);
    const state = data.match3 || {};
    const board = state.board || state.savedModes?.[state.gameMode || "classic"]?.board || [];
    const fallback = data.fallbackBoard || [];
    const actual = board.length ? board : fallback;
    const { size, cell, left, top } = fit(app, BOARD_SIZE, BOARD_SIZE, 14, 8);
    root.addChild(rect(left - 10, top - 10, size + 20, size + 20, PANEL, 16));
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const gem = actual[y]?.[x];
        const color = GEM_COLORS[gem] || 0x5f6c7a;
        const selected = data.selectedGem?.x === x && data.selectedGem?.y === y;
        const tile = new Graphics()
          .roundRect(left + x * cell + 3, top + y * cell + 3, cell - 6, cell - 6, 10)
          .fill(selected ? 0xffffff : 0x1c2837);
        makeButtonLike(tile, () => data.onMatch3Cell?.(x, y));
        root.addChild(tile);
        const orb = new Graphics()
          .circle(left + x * cell + cell / 2, top + y * cell + cell / 2, cell * (selected ? 0.33 : 0.29))
          .fill(color);
        makeButtonLike(orb, () => data.onMatch3Cell?.(x, y));
        root.addChild(orb);
        const icon = DROP_ICONS[gem] || GEM_ICONS[gem] || "";
        if (icon) root.addChild(label(icon, left + x * cell + cell / 2, top + y * cell + cell / 2, Math.max(12, cell * 0.34)));
      }
    }
    root.addChild(label(`${state.gameMode || "classic"} · ${state.score || 0} pts · ${state.movesLeft ?? 30} moves`, app.renderer.width / 2, top + size + 24, 14, AMBER));
  }

  draw();
  return {
    update(next) {
      data = next || {};
      draw();
    },
    destroy() {
      clear(root);
      root.destroy({ children: true });
    },
  };
}

export function buildMergeScene(app, initial = {}) {
  const root = new Container();
  app.stage.addChild(root);
  let data = initial;

  function itemText(item) {
    if (!item) return "";
    const chain = MERGE_CHAINS[item.chainId];
    return chain?.emoji?.[item.level] || String((item.level || 0) + 1);
  }

  function draw() {
    clear(root);
    const merge = data.merge || {};
    const board = merge.board || Array.from({ length: 7 }, () => Array(9).fill(null));
    const cols = 9;
    const rows = 7;
    const { size, cell, left, top } = fit(app, cols, rows, 14, 8);
    const width = cell * cols;
    const height = cell * rows;
    root.addChild(rect(left - 8, top - 8, width + 16, height + 16, PANEL, 14));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const item = board[r]?.[c];
        const selected = data.mergeSelected?.r === r && data.mergeSelected?.c === c;
        const color = item ? [0x6ee7b7, 0xfcd34d, 0xfb7185, 0x93c5fd, 0xc4b5fd, 0xf9a8d4, 0xfdba74, 0xfff1a8][item.level || 0] : 0x223024;
        const tile = rect(left + c * cell + 2, top + r * cell + 2, cell - 4, cell - 4, selected ? AMBER : color, 6, item ? 1 : 0.82);
        makeButtonLike(tile, () => data.onMergeCell?.(r, c, item));
        root.addChild(tile);
        if (item) {
          root.addChild(label(itemText(item), left + c * cell + cell / 2, top + r * cell + cell * 0.46, Math.max(15, cell * 0.34)));
          root.addChild(label(`L${(item.level || 0) + 1}`, left + c * cell + cell / 2, top + r * cell + cell * 0.78, Math.max(8, cell * 0.12), PANEL));
        }
      }
    }
    root.addChild(label(data.trashMode ? "Trash mode" : "Drag/tap merge pairs", app.renderer.width / 2, top + height + 24, 14, data.trashMode ? CORAL : MUTED));
  }

  draw();
  return {
    update(next) {
      data = next || {};
      draw();
    },
    destroy() {
      clear(root);
      root.destroy({ children: true });
    },
  };
}
