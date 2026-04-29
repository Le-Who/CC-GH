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

function destroyLater(child) {
  const run = () => {
    if (!child?.destroyed) child.destroy?.({ children: true });
  };
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(run));
  } else {
    setTimeout(run, 0);
  }
}

function easeMotion(raw, mode) {
  const t = Math.max(0, Math.min(1, Number(raw) || 0));
  if (mode === "smooth") return t * t * (3 - 2 * t);
  if (mode === "snap") return 1 - (1 - t) ** 4;
  if (mode === "pop") {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  }
  if (mode === "drop") return t < 0.72 ? 1 - (1 - t / 0.72) ** 3 : 1 - 0.045 * Math.sin(((t - 0.72) / 0.28) * Math.PI);
  return 1 - (1 - t) ** 3;
}

export function tickParticles(container, deltaTime = 1) {
  const delta = Math.max(0.25, Math.min(2.5, Number(deltaTime) || 1));
  for (const child of [...container.children]) {
    if (child._delay > 0) {
      child._delay = Math.max(0, child._delay - delta);
      if (child._delay > 0) continue;
    }
    if (child._sequence) {
      child._sequence.age += delta;
      const raw = Math.min(1, child._sequence.age / child._sequence.duration);
      const textures = child._sequence.textures || [];
      if (textures.length && child.texture) {
        child.texture = textures[Math.min(textures.length - 1, Math.floor(raw * textures.length))];
      }
      const eased = raw * raw * (3 - 2 * raw);
      child.scale.set(child._sequence.scaleFrom + (child._sequence.scaleTo - child._sequence.scaleFrom) * eased);
      if (child._sequence.fade) child.alpha = Math.max(0, 1 - Math.max(0, raw - 0.68) / 0.32);
      if (raw >= 1) {
        child.parent?.removeChild(child);
        destroyLater(child);
      }
      continue;
    }
    if (child._tween) {
      child._tween.age = (child._tween.age || 0) + delta;
      const duration = Math.max(1, child._tween.duration || 1);
      const raw = Math.min(1, child._tween.age / duration);
      const eased = easeMotion(raw, child._tween.ease);
      child.x = child._tween.fromX + (child._tween.toX - child._tween.fromX) * eased;
      child.y = child._tween.fromY + (child._tween.toY - child._tween.fromY) * eased;
      if (child._tween.scaleFrom != null || child._tween.scaleTo != null) {
        const from = child._tween.scaleFrom ?? 1;
        const to = child._tween.scaleTo ?? from;
        child.scale.set(from + (to - from) * eased);
      }
      if (child._tween.fade) child.alpha = Math.max(0, 1 - raw);
      if (raw >= 1 && child._tween.destroy !== false) {
        child.parent?.removeChild(child);
        destroyLater(child);
        continue;
      }
    }
    if (!child._life) continue;
    child._life -= delta;
    child.x += child._vx * delta;
    child.y += child._vy * delta;
    if (child._gravity) child._vy += child._gravity * delta;
    if (child._spin) child.rotation += child._spin * delta;
    child.alpha = Math.min(1, Math.max(0, child._life / 26));
    const baseScale = child._grow ? 1 + (1 - child.alpha) * child._grow : 0.96 + child.alpha * 0.35;
    child.scale.set(baseScale);
    if (child._life <= 0) {
      child.parent?.removeChild(child);
      destroyLater(child);
    }
  }
}
