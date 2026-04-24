import { Container, Graphics, Text } from "pixi.js";

const GEM_COLORS = [0xf25555, 0x54a3ff, 0x5fd28a, 0xffcf4a, 0xb779ff, 0xff7db6];
const BLOX_COLORS = [0xff6b6b, 0x4ecdc4, 0xffd166, 0x7c5cff, 0x2dd4bf];
const MERGE_COLORS = [0x80ed99, 0xffd166, 0xf4978e, 0x90dbf4, 0xcdb4db];

function centerText(text, x, y, size = 18, color = 0xffffff) {
  const label = new Text({
    text,
    style: {
      fill: color,
      fontFamily: "Nunito, sans-serif",
      fontSize: size,
      fontWeight: "800",
    },
  });
  label.anchor.set(0.5);
  label.x = x;
  label.y = y;
  return label;
}

function fitSquare(app, margin = 20) {
  const w = app.renderer.width;
  const h = app.renderer.height;
  return Math.max(160, Math.min(w, h) - margin * 2);
}

export function buildBloxScene(app, state = {}) {
  const root = new Container();
  app.stage.addChild(root);

  function draw() {
    root.removeChildren();
    const size = fitSquare(app, 18);
    const cell = size / 10;
    const left = (app.renderer.width - size) / 2;
    const top = 18;
    const board = state.savedState?.board || state.board;

    const bg = new Graphics().roundRect(left - 8, top - 8, size + 16, size + 16, 14).fill(0x15212f);
    root.addChild(bg);

    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const filled = board?.[r]?.[c];
        const color = filled ? BLOX_COLORS[(r + c) % BLOX_COLORS.length] : 0x243447;
        root.addChild(
          new Graphics()
            .roundRect(left + c * cell + 2, top + r * cell + 2, cell - 4, cell - 4, 6)
            .fill(color),
        );
      }
    }

    root.addChild(centerText(`Best ${state.highScore || 0}`, app.renderer.width / 2, top + size + 32, 16, 0xffd166));
  }

  draw();
  return () => {
    root.destroy({ children: true });
  };
}

export function buildMatch3Scene(app, state = {}) {
  const root = new Container();
  app.stage.addChild(root);
  const board =
    state.game?.board ||
    Array.from({ length: 8 }, (_, r) =>
      Array.from({ length: 8 }, (_, c) => GEM_COLORS[(r * 3 + c * 5) % GEM_COLORS.length]),
    );

  function draw() {
    root.removeChildren();
    const size = fitSquare(app, 18);
    const cell = size / 8;
    const left = (app.renderer.width - size) / 2;
    const top = 18;
    root.addChild(new Graphics().roundRect(left - 10, top - 10, size + 20, size + 20, 16).fill(0x101827));
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const value = board[r]?.[c];
        const color = typeof value === "number" ? value : GEM_COLORS[(r + c) % GEM_COLORS.length];
        root.addChild(
          new Graphics()
            .circle(left + c * cell + cell / 2, top + r * cell + cell / 2, cell * 0.36)
            .fill(color),
        );
      }
    }
    root.addChild(centerText(`Best ${state.highScore || 0}`, app.renderer.width / 2, top + size + 32, 16, 0x80edff));
  }

  draw();
  return () => {
    root.destroy({ children: true });
  };
}

export function buildMergeScene(app, state = {}) {
  const root = new Container();
  app.stage.addChild(root);
  const board = state.merge?.board || Array.from({ length: 7 }, () => Array(9).fill(null));

  function draw() {
    root.removeChildren();
    const width = Math.min(app.renderer.width - 24, 420);
    const cell = width / 9;
    const height = cell * 7;
    const left = (app.renderer.width - width) / 2;
    const top = 18;
    root.addChild(new Graphics().roundRect(left - 8, top - 8, width + 16, height + 16, 14).fill(0x172216));
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 9; c++) {
        const item = board[r]?.[c];
        const base = new Graphics()
          .roundRect(left + c * cell + 2, top + r * cell + 2, cell - 4, cell - 4, 6)
          .fill(item ? MERGE_COLORS[(item.level || r + c) % MERGE_COLORS.length] : 0x263626);
        root.addChild(base);
        if (item) root.addChild(centerText(String((item.level || 0) + 1), left + c * cell + cell / 2, top + r * cell + cell / 2, 14));
      }
    }
  }

  draw();
  return () => {
    root.destroy({ children: true });
  };
}

export function buildFarmScene(app, state = {}) {
  const root = new Container();
  app.stage.addChild(root);
  const plots = state.plots || state.farm?.plots || [];

  function draw() {
    root.removeChildren();
    const columns = 4;
    const rows = 3;
    const width = Math.min(app.renderer.width - 24, 420);
    const cell = width / columns;
    const left = (app.renderer.width - width) / 2;
    const top = 18;
    for (let i = 0; i < columns * rows; i++) {
      const plot = plots[i];
      const r = Math.floor(i / columns);
      const c = i % columns;
      const planted = !!plot?.crop;
      root.addChild(
        new Graphics()
          .roundRect(left + c * cell + 5, top + r * cell + 5, cell - 10, cell - 10, 12)
          .fill(planted ? 0x6bcf63 : 0x6b4f2a),
      );
      if (planted) root.addChild(centerText("✓", left + c * cell + cell / 2, top + r * cell + cell / 2, 20));
    }
  }

  draw();
  return () => {
    root.destroy({ children: true });
  };
}
