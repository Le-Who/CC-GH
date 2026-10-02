/** One pointer owns a plant gesture. Scroll, cancel, blur and hidden pages never pay a tap. */
export function createGardenPressSession({
  onTap,
  onDetails,
  schedule = setTimeout,
  unschedule = clearTimeout,
  holdMs = 1500,
  moveThreshold = 10,
  now = Date.now
}) {
  let session = null,
    timer = null;
  const cancel = () => {
    if (timer != null) unschedule(timer);
    timer = null;
    session = null;
  };
  return {
    cancel,
    start(event) {
      if (session || event.isPrimary === false || event.button != null && event.button !== 0) return false;
      session = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        startedAt: now()
      };
      timer = schedule(() => {
        if (!session) return;
        cancel();
        onDetails();
      }, holdMs);
      return true;
    },
    move(event) {
      if (session?.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - session.x, event.clientY - session.y) > moveThreshold) cancel();
    },
    end(event) {
      if (!session || session.id !== event.pointerId) return false;
      const tap = now() - session.startedAt < 500;
      cancel();
      if (tap) onTap();
      return tap;
    },
    active() {
      return session != null;
    }
  };
}
export function createGardenActionGate() {
  let pending = false;
  return {
    isPending: () => pending,
    async run(action) {
      if (pending) return false;
      pending = true;
      try {
        await action();
        return true;
      } finally {
        pending = false;
      }
    }
  };
}
export function gardenQuestPriority(q) {
  const locked = !!q.locked || !q.unlocked;
  if (!q.claimed && q.kind === 'daily' && !locked) return 0;
  if (!q.claimed && q.kind === 'story') return 1;
  if (q.claimed && q.kind === 'daily') return 2;
  if (q.claimed && q.kind === 'story') return 3;
  return 4;
}
export function orderGardenQuests(sections) {
  return sections.flatMap((s, si) => (s?.quests || []).map((q, qi) => ({
    ...q,
    sectionIndex: si,
    questIndex: qi
  }))).sort((a, b) => gardenQuestPriority(a) - gardenQuestPriority(b) || Number(!!b.complete) - Number(!!a.complete) || b.percent - a.percent || a.sectionIndex - b.sectionIndex || a.questIndex - b.questIndex);
}
export const clampGardenPercent = value => Math.max(0, Math.min(100, Number(value) || 0));
const GARDEN_INTERACTIVE_TARGET = 'button,a,input,textarea,select,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="slider"],[role="tab"],[draggable="true"],[data-no-scroll-drag],[data-game-drag]';
/** Mouse-only shelf panning. Native touch, wheel, controls and game drag/drop keep ownership. */
export function createGardenShelfDrag({
  getViewport,
  onDragging = () => {},
  threshold = 8,
  now = Date.now
}) {
  let session = null;
  let suppressUntil = 0;
  const finish = event => {
    if (!session || event?.pointerId != null && event.pointerId !== session.id) return false;
    const previous = session;
    session = null;
    if (previous.dragging) suppressUntil = now() + 500;
    onDragging(false);
    try {
      if (previous.node.hasPointerCapture?.(previous.id)) previous.node.releasePointerCapture(previous.id);
    } catch {/* A browser may already have released capture on cancel. */}
    return previous.dragging;
  };
  return {
    cancel: finish,
    start(event) {
      if (event.pointerType !== 'mouse' || event.isPrimary === false || event.button !== 0) return false;
      if (session) finish(); // Recover a missed release before accepting another mouse press.
      suppressUntil = 0; // A new intentional press must never inherit a previous drag's click suppression.
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
      const node = getViewport();
      if (!node || node.scrollHeight <= node.clientHeight || event.target?.closest?.(GARDEN_INTERACTIVE_TARGET)) return false;
      session = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scrollTop: node.scrollTop,
        node,
        dragging: false
      };
      return true;
    },
    move(event) {
      if (!session || session.id !== event.pointerId) return false;
      if (event.buttons === 0) {
        finish(event);
        return false;
      }
      const dx = event.clientX - session.x,
        dy = event.clientY - session.y;
      if (!session.dragging) {
        if (Math.abs(dx) > threshold && Math.abs(dx) > Math.abs(dy)) {
          finish(event);
          return false;
        }
        if (Math.abs(dy) < threshold) return false;
        try {
          session.node.setPointerCapture(event.pointerId);
        } catch {
          finish(event);
          return false;
        }
        session.dragging = true;
        onDragging(true);
      }
      event.preventDefault();
      session.node.scrollTop = Math.max(0, Math.min(session.node.scrollHeight - session.node.clientHeight, session.scrollTop - dy));
      return true;
    },
    end: finish,
    click(event) {
      if (event.detail === 0 || now() > suppressUntil || suppressUntil === 0) return false;
      suppressUntil = 0;
      event.preventDefault();
      event.stopPropagation();
      return true;
    },
    active: () => session != null
  };
}
