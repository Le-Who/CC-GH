import {
  Container,
  Graphics,
  createPointerSession,
  BUBBO_COLORS,
  BUBBO_COLS,
  BUBBO_ROWS,
  generateBubboWave,
  getAssistedBubboAim,
  getBubboNeighbors,
  getBubboRowVisualOffset,
  BUBBO_ASSET_KEYS,
  BUBBO_BALL_DRAW_SCALE,
  TEXT,
  AMBER,
  SKY,
  BUBBO_NUMBERS,
  viewWidth,
  viewHeight,
  clear,
  label,
  sprite,
  bubboBallTexture,
  gameAsset,
  makeSparkles,
  drawBubboBackground,
  makeRipple,
  setupStage,
  publishCanvasAssetLayout,
  applyHudAssetRegion,
  tickParticles,
} from './shared/runtime.js';

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
      bottomReservePx: Number(next?.hudReserves?.bottom || next?.layoutSafeArea?.bottom || 0),
    });
  }

  function buildLayout() {
    const width = viewWidth(app);
    const height = viewHeight(app);
    const margin = 8;
    const layoutReserve = Number(data.hudReserves?.bottom || data.layoutSafeArea?.bottom || 0);
    const bottomReserve = layoutReserve || (data.bubbo?.bottomHudReserve ? Math.max(112, Math.min(154, height * 0.19)) : 0);
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
    if (state.aimAssist !== false && state.current) {
      const candidates = [];
      for (let row = includePendingRow ? -1 : 0; row < BUBBO_ROWS; row += 1) {
        for (let col = 0; col < BUBBO_COLS; col += 1) {
          const color = row === -1 ? pendingRow[col] : board[row]?.[col];
          if (color !== state.current) continue;
          const pos = bubblePosition(row, col);
          candidates.push({ angle: Math.atan2(pos.y - cannonY, pos.x - cannonX), target: { row, col } });
        }
      }
      const assisted = getAssistedBubboAim({ rawAngle: angle, candidates, maxDegrees: 3 });
      angle = Math.max(-Math.PI + 0.18, Math.min(-0.18, assisted.angle));
    }
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
    const trayWidth = Math.min(viewWidth(app) * 1.05, layout.cell * 7.5);
    const trayHeight = layout.cell * 2.05;
    const trayY = Math.min(layout.playHeight - layout.cell * 0.24, layout.cannonY + layout.cell * 0.45);
    publishCanvasAssetLayout(app, "bubboBottomTrayAsset", { left: layout.cannonX - trayWidth / 2, top: trayY - trayHeight / 2, width: trayWidth, height: trayHeight });
    const bottomTray = sprite(gameAsset(BUBBO_ASSET_KEYS.bottomTray), layout.cannonX, trayY, trayWidth, trayHeight, 0.54);
    root.addChild(applyHudAssetRegion(bottomTray, data, "bubboBottomTrayAsset"));
    root.addChild(new Graphics().roundRect(layout.cannonX - 24, layout.cannonY - 8, 48, 54, 20).fill({ color: background.cannonPanel, alpha: 0.95 }).stroke({ color: SKY, width: 2, alpha: 0.38 }));
    const cannonSize = layout.radius * 2.45;
    publishCanvasAssetLayout(app, "bubboCannonAsset", { left: layout.cannonX - cannonSize / 2, top: layout.cannonY + 14 - cannonSize / 2, width: cannonSize, height: cannonSize });
    const cannon = sprite(gameAsset(BUBBO_ASSET_KEYS.cannonMain), layout.cannonX, layout.cannonY + 14, cannonSize, cannonSize, 0.92);
    root.addChild(applyHudAssetRegion(cannon, data, "bubboCannonAsset"));
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
