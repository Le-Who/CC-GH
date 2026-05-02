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

    const predictedLines = Math.max(0, Number(data.bloxPredictedLines) || 0);
    if (predictedLines > 0) {
      const predicted = label(`+${predictedLines} ${predictedLines === 1 ? "line" : "lines"}`, left + size / 2, Math.max(18, top - 18), Math.max(14, cell * 0.32), AMBER, "900");
      predicted.alpha = 0.94;
      root.addChild(predicted);
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
