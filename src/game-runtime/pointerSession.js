export const POINTER_TAP_MAX_DISTANCE = 10;
export const POINTER_TAP_MAX_MS = 550;

function eventPoint(event = {}) {
  const source = event.global || event;
  return {
    x: Number(source.x ?? event.clientX ?? event.pageX ?? 0),
    y: Number(source.y ?? event.clientY ?? event.pageY ?? 0),
  };
}

function eventPointerId(event = {}) {
  return event.pointerId ?? event.pointer?.pointerId ?? 1;
}

function distanceFromStart(session, point) {
  return Math.hypot(point.x - session.startX, point.y - session.startY);
}

/**
 * Shared pointer-state machine for Pixi scenes.
 *
 * @typedef {Object} PointerSessionSnapshot
 * @property {number|string} pointerId
 * @property {number} startX
 * @property {number} startY
 * @property {number} x
 * @property {number} y
 * @property {number} dx
 * @property {number} dy
 * @property {number} distance
 * @property {boolean} moved
 * @property {boolean} tapped
 * @property {number} elapsed
 * @property {unknown} data
 */
export function createPointerSession({
  tapDistance = POINTER_TAP_MAX_DISTANCE,
  tapMs = POINTER_TAP_MAX_MS,
  now = () => Date.now(),
  onMove,
  onTap,
  onDragEnd,
  onCancel,
} = {}) {
  let active = null;

  function snapshot(event = null, forced = {}) {
    if (!active) return null;
    const point = event ? eventPoint(event) : { x: active.x, y: active.y };
    const distance = distanceFromStart(active, point);
    const elapsed = now() - active.startedAt;
    const moved = active.moved || distance > tapDistance;
    return {
      pointerId: active.pointerId,
      startX: active.startX,
      startY: active.startY,
      x: point.x,
      y: point.y,
      dx: point.x - active.startX,
      dy: point.y - active.startY,
      distance,
      moved,
      tapped: !moved && elapsed <= tapMs,
      elapsed,
      data: active.data,
      ...forced,
    };
  }

  function matches(event = {}) {
    return !!active && eventPointerId(event) === active.pointerId;
  }

  function start(event = {}, data = null) {
    if (active) cancel("restart", event);
    const point = eventPoint(event);
    active = {
      pointerId: eventPointerId(event),
      startX: point.x,
      startY: point.y,
      x: point.x,
      y: point.y,
      moved: false,
      startedAt: now(),
      data,
    };
    return snapshot(event);
  }

  function move(event = {}) {
    if (!matches(event)) return null;
    const next = snapshot(event);
    active.x = next.x;
    active.y = next.y;
    active.moved = next.moved;
    onMove?.(next, event);
    return next;
  }

  function end(event = {}) {
    if (!matches(event)) return null;
    const done = move(event) || snapshot(event);
    active = null;
    if (event.cancelled) {
      onCancel?.({ ...done, tapped: false }, event);
      return { ...done, cancelled: true, tapped: false };
    }
    if (done.tapped) onTap?.(done, event);
    else onDragEnd?.(done, event);
    return done;
  }

  function cancel(reason = "cancelled", event = {}) {
    if (!active) return null;
    const done = snapshot(event, { cancelled: true, reason, tapped: false }) || {
      cancelled: true,
      reason,
      tapped: false,
    };
    active = null;
    onCancel?.(done, event);
    return done;
  }

  return {
    start,
    move,
    end,
    cancel,
    matches,
    current: () => snapshot(),
    isActive: () => !!active,
  };
}

