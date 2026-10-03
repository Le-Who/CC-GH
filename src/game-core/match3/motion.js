/** Match-3-only presentation timeline. Logical outcomes are never calculated here. */
export const MATCH3_MOTION = Object.freeze({
  swapMs: 150, invalidMs: 180, clearMs: 120, collectMs: 180,
  fallBaseMs: 120, fallPerRootCellMs: 50, fallMaxMs: 260,
  landingMs: 45, reconcileMs: 140, maxBursts: 18,
});
const copy = board => (board || []).map(row => [...row]);
const clamp = x => Math.max(0, Math.min(1, x));
export const match3Smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const key = cell => `${cell.x}:${cell.y}`;
const equalBoards = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createMatch3MotionPlan(animation = {}, fallbackBoard = [], reduced = false) {
  let board = copy(animation.startBoard || fallbackBoard);
  const phases = [];
  let duration = 0;
  const add = phase => {
    phase.start = duration;
    phase.before = copy(board);
    duration += phase.duration;
    phases.push(phase);
    board = copy(phase.after);
  };
  const from = animation.from, to = animation.to;
  const isSwap = from && to && (from.x !== to.x || from.y !== to.y);
  if (animation.type === 'invalid') {
    add({ kind: 'invalid', duration: MATCH3_MOTION.invalidMs, from, to, after: board });
  } else if (isSwap) {
    const after = copy(board);
    if (after[from.y] && after[to.y]) [after[from.y][from.x], after[to.y][to.x]] = [after[to.y][to.x], after[from.y][from.x]];
    add({ kind: 'swap', duration: reduced ? 90 : MATCH3_MOTION.swapMs, from, to, after });
  }
  for (const [index, step] of (animation.steps || []).entries()) {
    const after = copy(board);
    for (const item of step.cleared || []) if (after[item.y]) after[item.y][item.x] = null;
    for (const item of step.specials || []) if (after[item.y]) after[item.y][item.x] = item.type;
    add({ kind: 'clear', duration: reduced ? 100 : Math.max(96, MATCH3_MOTION.clearMs - index * 8),
      cleared: step.cleared || [], specials: step.specials || [], combo: step.combo || index + 1, after });
    const motions = step.motionPhases || [{ kind: 'fall', fallen: step.fallen || [], filled: step.filled || [], boardSnapshot: step.boardSnapshot }];
    for (const motion of motions) {
      if (motion.kind === 'collect') {
        const next = copy(board);
        for (const item of motion.dropCollected || []) if (next[item.y]) next[item.y][item.x] = null;
        add({ kind: 'collect', duration: reduced ? 90 : MATCH3_MOTION.collectMs, collected: motion.dropCollected || [], after: next });
        continue;
      }
      const tracks = [];
      for (const item of motion.fallen || []) {
        const type = board[item.fromY]?.[item.x];
        if (type) tracks.push({ x: item.x, fromY: item.fromY, toY: item.toY, type, fresh: false });
      }
      const counts = new Map();
      for (const item of motion.filled || []) counts.set(item.x, (counts.get(item.x) || 0) + 1);
      for (const item of motion.filled || []) tracks.push({ x: item.x, fromY: item.y - counts.get(item.x), toY: item.y, type: item.type, fresh: true });
      const distances = new Map();
      for (const track of tracks) distances.set(track.x, Math.max(distances.get(track.x) || 0, track.toY - track.fromY));
      const speed = Math.max(.88, 1 - index * .04);
      for (const track of tracks) track.flightMs = reduced ? 90 : Math.max(145, Math.min(MATCH3_MOTION.fallMaxMs, MATCH3_MOTION.fallBaseMs + MATCH3_MOTION.fallPerRootCellMs * Math.sqrt(distances.get(track.x))) * speed);
      const flight = Math.max(0, ...tracks.map(track => track.flightMs));
      add({ kind: 'fall', duration: Math.max(1, flight + (reduced ? 0 : MATCH3_MOTION.landingMs)), tracks, after: motion.boardSnapshot || step.boardSnapshot || board });
    }
    // Older saved animation descriptors may lack detailed drop sub-phases.
    if (!equalBoards(board, step.boardSnapshot) && step.boardSnapshot) add({ kind: 'reconcile', duration: reduced ? 90 : MATCH3_MOTION.reconcileMs, after: step.boardSnapshot });
  }
  const finalBoard = copy(animation.finalBoard || board);
  if (!equalBoards(board, finalBoard)) add({ kind: 'reconcile', duration: reduced ? 90 : MATCH3_MOTION.reconcileMs, after: finalBoard });
  return { id: animation.id, phases, duration, finalBoard, reduced };
}

/** Pure poses use cell coordinates, so resizing never loses an in-flight piece. */
export function sampleMatch3Motion(plan, elapsedMs = 0) {
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const phaseIndex = plan.phases.findIndex(phase => elapsed < phase.start + phase.duration);
  if (phaseIndex < 0) return { done: true, phaseIndex: plan.phases.length, kind: 'idle', board: plan.finalBoard, poses: boardPoses(plan.finalBoard), bursts: [] };
  const phase = plan.phases[phaseIndex];
  const age = elapsed - phase.start;
  const progress = clamp(age / phase.duration);
  const reduced = plan.reduced;
  let poses = boardPoses(phase.before), bursts = [];
  const remove = cells => { const hidden = new Set(cells.map(key)); poses = poses.filter(pose => !hidden.has(key(pose))); };
  if (phase.kind === 'swap' || phase.kind === 'invalid') {
    const { from, to } = phase;
    if (from && to) {
      remove([from, to]);
      const p = phase.kind === 'swap' ? match3Smooth(progress) : progress < .4 ? .18 * match3Smooth(progress / .4) : .18 * (1 - match3Smooth((progress - .4) / .6));
      for (const [index, [a, b]] of [[from, to], [to, from]].entries()) {
        if (index === 1 && from.x === to.x && from.y === to.y) continue;
        const type = phase.before[a.y]?.[a.x];
        if (!type) continue;
        const target = reduced && phase.kind === 'swap' && progress >= .5 ? b : a;
        poses.push({ type, x: reduced ? target.x : a.x + (b.x - a.x) * p, y: reduced ? target.y : a.y + (b.y - a.y) * p,
          scaleX: 1, scaleY: 1, alpha: reduced && phase.kind === 'swap' ? Math.abs(1 - 2 * progress) : 1 });
      }
    }
  } else if (phase.kind === 'clear') {
    remove(phase.cleared);
    for (const item of phase.cleared) {
      const pop = progress < .28 ? 1 + .065 * match3Smooth(progress / .28) : 1.065 - .56 * match3Smooth((progress - .28) / .72);
      poses.push({ ...item, scaleX: reduced ? 1 : pop, scaleY: reduced ? 1 : pop, alpha: progress < .28 ? 1 : 1 - match3Smooth((progress - .28) / .72) });
    }
    if (!reduced && progress > .2) bursts = phase.cleared.slice(0, MATCH3_MOTION.maxBursts).map((cell, i) => ({ ...cell, progress: clamp((progress - .2) / .8), rotation: (i % 3 - 1) * .18, combo: phase.combo }));
    for (const item of phase.specials) {
      remove([item]);
      poses.push({ ...item, alpha: 1, type: progress < .45 ? phase.before[item.y]?.[item.x] : item.type,
        scaleX: reduced ? 1 : 1 + .09 * Math.sin(progress * Math.PI), scaleY: reduced ? 1 : 1 + .09 * Math.sin(progress * Math.PI) });
    }
  } else if (phase.kind === 'fall') {
    remove(phase.tracks.filter(track => !track.fresh).map(track => ({ x: track.x, y: track.fromY })));
    for (const track of phase.tracks) {
      const p = clamp(age / track.flightMs), landed = clamp((age - track.flightMs) / MATCH3_MOTION.landingMs);
      const squash = reduced ? 0 : Math.sin(landed * Math.PI) * .035;
      poses.push({ type: track.type, x: track.x, y: reduced ? track.toY : track.fromY + (track.toY - track.fromY) * match3Smooth(p),
        scaleX: 1 + squash, scaleY: 1 - squash, alpha: reduced ? match3Smooth(p) : 1 });
    }
  } else if (phase.kind === 'collect') {
    remove(phase.collected);
    for (const item of phase.collected) poses.push({ ...item, y: item.y - (reduced ? 0 : .3 * match3Smooth(progress)), scaleX: 1, scaleY: 1, alpha: 1 - match3Smooth(progress) });
  } else if (phase.kind === 'reconcile') {
    poses = boardPoses(progress < .5 ? phase.before : phase.after).map(pose => ({ ...pose, alpha: Math.abs(1 - 2 * progress) }));
  }
  return { done: false, phaseIndex, kind: phase.kind, combo: phase.combo, progress, board: phase.before, poses, bursts };
}

export function boardPoses(board = []) {
  return board.flatMap((row, y) => row.flatMap((type, x) => type ? [{ type, x, y, scaleX: 1, scaleY: 1, alpha: 1 }] : []));
}
