/* ═══════════════════════════════════════════════════
 *  Game Hub — GameStore (v4.12.3)
 *  Zustand-inspired slice pattern for vanilla JS.
 *  Each game registers its own slice; listeners are
 *  scoped per-slice so Match-3 updates never trigger
 *  Farm re-renders.
 * ═══════════════════════════════════════════════════ */

const GameStore = (() => {
  const state = {};
  const listeners = new Map(); // sliceKey -> Set<fn>

  /** Get full store state or a specific slice */
  function getState(sliceKey) {
    return sliceKey ? state[sliceKey] : state;
  }

  /**
   * Update state for a specific slice.
   * Only notifies listeners subscribed to that slice.
   * @param {string} sliceKey  — e.g. "farm", "trivia", "match3"
   * @param {object|function} updater — object to merge, or fn(prevSlice) => newSlice
   */
  function setState(sliceKey, updater) {
    const prev = state[sliceKey];
    if (typeof updater === "function") {
      state[sliceKey] = updater(prev);
    } else {
      state[sliceKey] = { ...prev, ...updater };
    }
    // Notify only this slice's listeners
    if (listeners.has(sliceKey)) {
      listeners.get(sliceKey).forEach((fn) => fn(state[sliceKey], prev));
    }
  }

  /**
   * Subscribe to changes in a specific slice.
   * Returns an unsubscribe function.
   */
  function subscribe(sliceKey, fn) {
    if (!listeners.has(sliceKey)) listeners.set(sliceKey, new Set());
    listeners.get(sliceKey).add(fn);
    return () => listeners.get(sliceKey).delete(fn);
  }

  /**
   * Register a new slice with initial state.
   */
  function registerSlice(sliceKey, initialState) {
    state[sliceKey] = initialState;
  }

  /**
   * Optimistic action helper:
   * 1. Snapshot current state
   * 2. Apply optimistic update immediately
   * 3. Execute async action (API call)
   * 4. On success: apply server response
   * 5. On error: rollback to snapshot
   *
   * @param {string} sliceKey
   * @param {function} optimisticUpdate — fn(prevSlice) => optimisticSlice
   * @param {function} asyncAction — async fn() => serverResult | throws
   * @param {function} onSuccess — fn(serverResult, currentSlice) => finalSlice
   * @param {function} [onError] — optional fn(error, snapshotSlice)
   */
  async function optimistic(
    sliceKey,
    optimisticUpdate,
    asyncAction,
    onSuccess,
    onError,
  ) {
    const snapshot = { ...state[sliceKey] };
    // 1. Apply optimistic update
    setState(sliceKey, optimisticUpdate);
    try {
      // 2. Execute async action
      const result = await asyncAction();
      if (result && result.error) {
        // Server returned error — rollback
        setState(sliceKey, () => snapshot);
        if (onError) onError(result.error, snapshot);
        return result;
      }
      // 3. Apply server response
      if (onSuccess) {
        setState(sliceKey, (current) => onSuccess(result, current));
      }
      return result;
    } catch (err) {
      // 4. Network error — rollback
      setState(sliceKey, () => snapshot);
      if (onError) onError(err, snapshot);
      throw err;
    }
  }

  return { getState, setState, subscribe, registerSlice, optimistic };
})();
