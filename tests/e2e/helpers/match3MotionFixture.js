export const match3MotionBoard = () => {
  const board = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => ['fire', 'water', 'earth', 'air', 'light', 'dark'][(x + y * 2) % 6]));
  board[7][0] = 'fire'; board[7][1] = 'water'; board[7][2] = 'fire'; board[6][1] = 'fire';
  return board;
};

/** Serializable for page.evaluate. Keep the seeded stream inside the native
 * pointerup task that synchronously runs the real Pixi/controller/engine path.
 * Socket.IO reconnect jitter must not consume refill values between taps. */
export function armMatch3RefillSeed(seed, scope = window) {
  const audit = scope.__match3RefillSeed = { seed, used: false, restored: false, calls: 0 };
  const apply = event => {
    if (event.target?.tagName !== 'CANVAS' || !event.target.dataset?.match3BoardSize) return;
    scope.removeEventListener('pointerup', apply, true);
    const original = scope.Math.random;
    let n = seed;
    audit.used = true;
    scope.Math.random = () => {
      audit.calls++;
      n ^= n << 13; n ^= n >>> 17; n ^= n << 5;
      return (n >>> 0) / 4294967296;
    };
    scope.setTimeout(() => { scope.Math.random = original; audit.restored = true; }, 0);
  };
  scope.addEventListener('pointerup', apply, true);
}
