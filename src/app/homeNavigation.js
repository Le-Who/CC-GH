export const OPEN_HOME_EVENT = 'game-hub:open-home';
export function openHome(gameId) {
  window.dispatchEvent(new CustomEvent(OPEN_HOME_EVENT, { detail: { gameId: typeof gameId === 'string' ? gameId : null } }));
}

export function isHomeLeaveReady(state, accountId) {
  if (!accountId || state.snapshot?.player?.id !== accountId) return false;
  if (!state.outboxLoaded || state.outboxAccountId !== accountId || state.outboxStorageError || state.retainedLegacyOutbox?.length) return false;
  if (Object.values(state.busy || {}).some(Boolean) || (state.pendingActions || []).length) return false;
  return true;
}

/** A version change must never settle or discard a round on the player's behalf. */
export function isAppUpdateReady(state, accountId) {
  if (!isHomeLeaveReady(state, accountId)) return false;
  const controls = typeof state.activeGameShell === 'object' ? state.activeGameShell : null;
  if (state.activeTab !== 'garden' && controls?.id !== state.activeTab) return false;
  const run = state.snapshot?.[state.activeTab];
  return !controls?.activeRun && !controls?.hasPendingActions
    && !run?.activeGame && !run?.savedState?.gameActive && !run?.currentGame;
}

/** Only an acknowledged leave may unmount a game. The caller serializes requests. */
export async function leaveGameForHome({ state, controls, accountId }) {
  if (!isHomeLeaveReady(state, accountId)) return false;
  // A restored run may exist before its lazy controller has mounted.
  if (state.activeTab !== 'garden' && (!controls || controls.id !== state.activeTab)) return false;
  const serverRun = state.snapshot?.[state.activeTab];
  if (!controls?.activeRun && (serverRun?.activeGame || serverRun?.savedState?.gameActive || serverRun?.currentGame)) return false;
  if (controls?.hasPendingActions) return false;
  if (controls?.canLeave && !controls.canLeave()) return false;
  if (typeof controls?.safeLeave === 'function') return (await controls.safeLeave()) === true;
  if (state.activeTab === 'settlement') {
    // Only load this adapter when departing an already-mounted Town. Its
    // existing rehydrate API joins the same cross-tab command lock, providing
    // an awaited queue barrier without changing Town commands or save format.
    const { useSettlementStore } = await import('../games/settlement/useSettlementStore.js');
    await useSettlementStore.persist.rehydrate();
    const town = useSettlementStore.getState();
    return town.persistenceReady === true && !town.persistenceError;
  }
  // Garden and Yard have server-owned timers and shared-store persistence.
  // A game's custom persistence supplies its own safeLeave instead.
  return !controls?.activeRun;
}
