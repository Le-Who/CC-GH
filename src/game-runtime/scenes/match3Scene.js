import {
  Container,
  Graphics,
  createPointerSession,
  BOARD_SIZE,
  DROP_ICONS,
  GEM_ICONS,
  MATCH3_TIMING,
  match3StepStartFrame,
  GEM_COLORS,
  POTION_PIECE_ASSETS,
  MATCH3_ASSET_KEYS,
  PANEL,
  TEXT,
  AMBER,
  CORAL,
  SKY,
  viewWidth,
  viewHeight,
  reserveFromShellChrome,
  publishCanvasLayout,
  clear,
  label,
  rect,
  sprite,
  gameAsset,
  tiledSprite,
  strokedRect,
  makeInteractive,
  fitWithTopReserve,
  isAdjacentMatch3Cell,
  match3TargetFromGesture,
  makeSparkles,
  cellCenter,
  makeTween,
  makeRipple,
  makeRafScheduler,
  setupStage,
  tickParticles,
} from './shared/runtime.js';

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
        const burstAsset = sprite(gameAsset(MATCH3_ASSET_KEYS.fxClearBurst), pos.x, pos.y, radius * 2.6, radius * 2.6, 0.74);
        burstAsset._delay = clearDelay + 0.5 + ((cell.x + cell.y) % 2) * 0.4;
        burstAsset._tween = { fromX: pos.x, fromY: pos.y, toX: pos.x, toY: pos.y, duration: 12, fade: true, scaleFrom: 0.56, scaleTo: 1.24, ease: "pop" };
        effects.addChild(burstAsset);
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
    const hudReserve = state.gameActive ? reserveFromShellChrome(app, ".game-play-hud", data.match3HudReserve || 0) + 4 : 0;
    const fitted = fitWithTopReserve(app, BOARD_SIZE, BOARD_SIZE, 14, hudReserve, 44, { verticalAnchor: 0.66 });
    layout = { ...fitted, cols: BOARD_SIZE, rows: BOARD_SIZE };
    const { size, cell, left, top } = fitted;
    publishCanvasLayout(app, "match3", { top: top - 10, left: left - 10, size: size + 20 });
    root.addChild(rect(0, 0, viewWidth(app), viewHeight(app), 0x1b1424, 0));
    root.addChild(tiledSprite(gameAsset(MATCH3_ASSET_KEYS.backgroundTable), 0, 0, viewWidth(app), viewHeight(app), 0.78));
    root.addChild(rect(left - 18, top - 18, size + 36, size + 36, PANEL, 18, 0.18));
    root.addChild(sprite(gameAsset(MATCH3_ASSET_KEYS.boardFrame), left + size / 2, top + size / 2, size + 38, size + 38, 0.98));
    queueMatch3Animation(data.match3Animation);
    const renderBoard = activeAnimationBoard(actual);
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const gem = renderBoard[y]?.[x];
        const selected = data.selectedGem?.x === x && data.selectedGem?.y === y;
        const dragging = drag?.from?.x === x && drag?.from?.y === y;
        root.addChild(sprite(gameAsset(MATCH3_ASSET_KEYS.boardCell), left + x * cell + cell / 2, top + y * cell + cell / 2, cell - 5, cell - 5, 0.92));
        if (selected) {
          root.addChild(sprite(gameAsset(MATCH3_ASSET_KEYS.boardCellSelected), left + x * cell + cell / 2, top + y * cell + cell / 2, cell + 1, cell + 1, 0.96));
        }
        const tile = selected
          ? strokedRect(left + x * cell + 3, top + y * cell + 3, cell - 6, cell - 6, AMBER, 10, 0xf7efe0, 0.08, 3)
          : rect(left + x * cell + 3, top + y * cell + 3, cell - 6, cell - 6, 0xe8efdc, 10, 0.001);
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
