/** Timed-mode bookkeeping independent of score updates and React renders. */
export function createMatch3Clock(seconds) {
  const value = Number(seconds);
  return {remainingMs: (Number.isFinite(value) ? Math.max(0, value) : 0) * 1000, lastAt: null, hidden: false};
}

export function match3ClockSeconds(clock) {
  return Math.ceil(Math.max(0, Number(clock.remainingMs) || 0) / 1000);
}

/**
 * The previous visibility state owns the interval ending at `now`.
 * Calling this from visibilitychange accounts for the final visible fraction,
 * then excludes hidden wall time until the corresponding visible event.
 */
export function advanceMatch3Clock(clock, now, hidden = false) {
  const at = Number(now);
  const elapsed = clock.lastAt == null || !Number.isFinite(at)
    ? 0 : Math.max(0, at - clock.lastAt);
  return {
    remainingMs: Math.max(0, clock.remainingMs - (clock.hidden ? 0 : elapsed)),
    lastAt: Number.isFinite(at) ? at : clock.lastAt,
    hidden: !!hidden,
  };
}
