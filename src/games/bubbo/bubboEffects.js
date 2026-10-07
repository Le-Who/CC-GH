import {getBubboNeighbors} from '../../game-core/bubbo/engine.js';

/** Presentation-only timing. Never imported by the aim, flight or game engine. */
export const BUBBO_FX_LIMITS = Object.freeze({
  maxEffects: 32,
  maxPops: 20,
  maxDrops: 11,
  maxIdleTokens: 1,
  idleInterval: 3600,
  idleDuration: 1600,
  idleRotation: 0.028,
  quietAfterInput: 850,
  maxFrameMs: 50,
});

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = value => value * value * (3 - 2 * value);
const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const cellKey = cell => `${cell.row}:${cell.col}`;
const validCell = cell => cell && Number.isInteger(cell.row) && Number.isInteger(cell.col)
  && cell.row >= -1 && cell.row < 11 && cell.col >= 0 && cell.col < 9;

function hash(value) {
  let result = 2166136261;
  for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function advanceBubboAmbience(ambience, elapsed, {
  playing = true, hidden = false, reducedMotion = false, aiming = false, busy = false,
} = {}) {
  if (!playing || hidden || reducedMotion) return { ...ambience, gain: 0, hold: BUBBO_FX_LIMITS.quietAfterInput };
  const dt = clamp(finite(elapsed), 0, BUBBO_FX_LIMITS.maxFrameMs);
  const blocked = aiming || busy;
  const hold = blocked ? BUBBO_FX_LIMITS.quietAfterInput : Math.max(0, ambience.hold - dt);
  const target = blocked || hold > 0 ? 0 : 1;
  // Finite, linear settle: fully quiet within 120 ms; return gently over 500 ms.
  const nextGain = clamp(ambience.gain + (target ? dt / 500 : -dt / 120));
  const gain = nextGain < 1e-6 ? 0 : nextGain > 1 - 1e-6 ? 1 : nextGain;
  return { time: ambience.time + dt, hold, gain };
}

/** One rare, deterministic token gesture, separated by a genuine still interval. */
export function sampleBubboIdle(state, ambience) {
  if (ambience.gain <= 0) return null;
  const epoch = Math.floor(ambience.time / BUBBO_FX_LIMITS.idleInterval);
  const age = ambience.time % BUBBO_FX_LIMITS.idleInterval;
  if (age >= BUBBO_FX_LIMITS.idleDuration) return null;
  const candidates = [];
  // Pending/danger rows stay completely still. No random call can affect gameplay RNG.
  for (let row = 0; row < 8; row++) for (let col = 0; col < 9; col++) {
    if (state.board?.[row]?.[col]) candidates.push({ row, col });
  }
  if (!candidates.length) return null;
  const seed = hash(`${state.seed}:${state.waveIndex || 0}:${epoch}`);
  const cell = candidates[seed % candidates.length];
  const progress = age / BUBBO_FX_LIMITS.idleDuration;
  const envelope = Math.sin(Math.PI * progress) ** 2 * ambience.gain;
  return {
    ...cell,
    rotation: Math.sin(progress * Math.PI * 2) * envelope * BUBBO_FX_LIMITS.idleRotation * (seed & 1 ? 1 : -1),
    // Every other gesture catches the existing upper-left art highlight.
    glint: epoch % 2 ? 0 : Math.sin(Math.PI * clamp((progress - .18) / .5)) ** 4 * ambience.gain,
  };
}

export function createBubboShotEffects(shot, {
  board = [], pendingRow = [], rowOffset = 0, pressureStep = 0, reducedMotion = false,
} = {}) {
  if (!shot) return [];
  const effects = [];
  const seen = new Set();
  const origin = validCell(shot.landed) ? shot.landed : null;
  const colorAt = cell => cell.color || (cell.row === -1 ? pendingRow[cell.col] : board[cell.row]?.[cell.col]) || shot.color || 'sky';
  const add = (cell, kind, delay, duration) => {
    effects.push({ row: cell.row, col: cell.col, color: colorAt(cell), kind, delay,
      duration, age: 0, rowOffset, pressureStep, reducedMotion });
  };
  if (origin) add(origin, 'hit', 0, reducedMotion ? 160 : 250);
  const pops = (shot.popped || []).filter(validCell).sort((a, b) => {
    const distance = cell => origin ? Math.abs(cell.row - origin.row) + Math.abs(cell.col - origin.col) : cell.row;
    return distance(a) - distance(b) || a.row - b.row || a.col - b.col;
  });
  let popCount = 0;
  for (const cell of pops) {
    if (seen.has(cellKey(cell)) || popCount >= BUBBO_FX_LIMITS.maxPops) continue;
    seen.add(cellKey(cell));
    const distance = origin ? Math.hypot(cell.row - origin.row, cell.col - origin.col) : 0;
    add(cell, 'pop', reducedMotion ? 0 : 35 + Math.min(95, distance * 19), reducedMotion ? 180 : 420);
    popCount++;
  }
  let dropCount = 0;
  for (const cell of (shot.dropped || []).filter(validCell).sort((a, b) => a.row - b.row || a.col - b.col)) {
    if (seen.has(cellKey(cell)) || dropCount >= BUBBO_FX_LIMITS.maxDrops) continue;
    seen.add(cellKey(cell));
    add(cell, 'drop', reducedMotion ? 0 : 130 + Math.min(90, dropCount * 12), reducedMotion ? 200 : 670);
    dropCount++;
  }
  return effects.slice(0, BUBBO_FX_LIMITS.maxEffects);
}

export function advanceBubboEffects(effects, elapsed, { playing = true, hidden = false } = {}) {
  // Decorative feedback never resumes halfway through an old burst after interruption.
  if (!playing || hidden) return [];
  const dt = clamp(finite(elapsed), 0, BUBBO_FX_LIMITS.maxFrameMs);
  return effects.slice(-BUBBO_FX_LIMITS.maxEffects)
    .map(effect => ({ ...effect, age: effect.age + dt }))
    .filter(effect => effect.age < effect.delay + effect.duration);
}

export function sampleBubboEffect(effect) {
  const progress = clamp((effect.age - effect.delay) / effect.duration);
  const visible = effect.age < effect.delay + effect.duration;
  const waiting = effect.age < effect.delay;
  if (effect.reducedMotion) return { visible, waiting, progress, alpha: visible ? 1 - progress : 0, scale: 1, x: 0, y: 0, rotation: 0 };
  if (effect.kind === 'drop') return {
    visible, waiting, progress, alpha: visible ? 1 - smooth(clamp((progress - .28) / .72)) : 0,
    scale: 1 - progress * .12,
    x: Math.sin(progress * Math.PI) * .12 * (effect.col % 2 ? 1 : -1),
    y: progress * progress * 2.4,
    rotation: Math.sin(progress * Math.PI) * .12 * (effect.col % 2 ? 1 : -1),
  };
  return { visible, waiting, progress, alpha: visible ? 1 - progress : 0,
    scale: 1 + Math.sin(Math.PI * clamp(progress / .32)) * .08, x: 0, y: 0, rotation: 0 };
}


/** Immediate survivors only: no board displacement, random calls or chain propagation. */
export function createBubboNeighborReactions(shot, {board = [], pendingRow = [], rowOffset = 0, reducedMotion = false} = {}) {
  if (!shot || reducedMotion || shot.shifted || shot.recovered) return [];
  const origins = [...(shot.popped || []), shot.landed].filter(validCell);
  const excluded = new Set([...origins, ...(shot.dropped || []).filter(validCell)].map(cellKey));
  const reactions = [];
  const seen = new Set();
  for (const origin of origins) {
    for (const [row, col] of getBubboNeighbors(origin.row, origin.col, rowOffset, {includePendingRow: true})) {
      const key = cellKey({row, col});
      const color = row === -1 ? pendingRow[col] : board[row]?.[col];
      if (!color || excluded.has(key) || seen.has(key)) continue;
      seen.add(key);
      reactions.push({row, col, color, kind: 'neighbor', age: 0, delay: 0, duration: 360,
        direction: (row + col) % 2 ? 1 : -1});
      if (reactions.length === 6) return reactions;
    }
  }
  return reactions;
}

export function sampleBubboNeighborReaction(effect) {
  const progress = clamp(effect.age / effect.duration);
  if (progress === 0 || progress === 1) return {rotation: 0, scale: 1};
  const envelope = Math.sin(Math.PI * progress) ** 2;
  return {rotation: Math.sin(2 * Math.PI * progress) * envelope * .06 * effect.direction,
    scale: 1 + envelope * .025};
}
