export const match3MotionBoard = () => {
  const board = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => ['fire', 'water', 'earth', 'air', 'light', 'dark'][(x + y * 2) % 6]));
  board[7][0] = 'fire'; board[7][1] = 'water'; board[7][2] = 'fire'; board[6][1] = 'fire';
  return board;
};

/** Install with addInitScript BEFORE Pixi registers its own window-capture
 * pointerup listener. Arming later must not change this listener's ordering. */
export function installMatch3RefillSeed(scope = window) {
  const apply = event => {
    const audit = scope.__match3RefillSeed;
    if (!audit?.armed) return;
    if (event.target?.tagName !== 'CANVAS' || !event.target.dataset?.match3BoardSize) return;
    audit.armed = false;
    const original = scope.Math.random;
    let n = audit.seed;
    audit.used = true;
    scope.Math.random = () => {
      audit.calls++;
      n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
      const value = (n >>> 0) / 4294967296;
      if (audit.values.length < 6) audit.values.push(value);
      return value;
    };
    scope.setTimeout(() => { scope.Math.random = original; audit.restored = true; }, 0);
  };
  scope.addEventListener('pointerup', apply, true);
}

/** Serializable for page.evaluate. The stream is inactive between inputs, so
 * Socket.IO reconnect jitter cannot consume any of the engine's refill values. */
export function armMatch3RefillSeed(seed, scope = window) {
  scope.__match3RefillSeed = { seed, armed: true, used: false, restored: false, calls: 0, values: [] };
}
