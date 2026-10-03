const HOME_ENTRY = '__gameHubHome';
let serial = 0;
const activeTokens = new WeakMap();

// Zero marks a retired entry, never an open Home. Keep ownership when repairing
// it so repeated Back/Forward also remains safe after later game switches.
export function markHomeHistoryEntry(target) {
  target.history.replaceState({ ...(target.history.state || {}), [HOME_ENTRY]: 0 }, '', target.location.href);
}

/** A dismissed Home entry may remain in the browser's forward stack. Repair
 * only our retired entries against the still-mounted game; ordinary history
 * entries and navigation remain untouched. This never activates another game. */
export function installHomeHistoryGuard(target, getActiveGame) {
  const repair = state => {
    if (!state || !Object.hasOwn(state, HOME_ENTRY) || state[HOME_ENTRY] === activeTokens.get(target)) return;
    const next = { ...state, [HOME_ENTRY]: 0 };
    const url = new URL(target.location.href);
    const game = getActiveGame();
    if (game === 'garden') url.searchParams.delete('tab');
    else url.searchParams.set('tab', game);
    target.history.replaceState(next, '', url.href);
  };
  const onPop = event => repair(event.state);
  target.addEventListener('popstate', onPop, true);
  repair(target.history.state);
  return () => target.removeEventListener('popstate', onPop, true);
}

/** An owned same-document history entry lets browser/Android Back close Home.
 * Retire it before committing a new tab so reload keeps the chosen game's URL. */
export function createHomeHistoryLayer(target, onBack, isLocked = () => false) {
  const token = ++serial;
  const url = target.location.href;
  const marker = { ...(target.history.state || {}), [HOME_ENTRY]: token };
  let active = true, retiring = false, resolveClose, closePromise;
  const detach = () => {
    active = false;
    if (activeTokens.get(target) === token) activeTokens.delete(target);
    target.removeEventListener('popstate', onPop, true);
  };
  const onPop = event => {
    if (!active) return;
    event.stopImmediatePropagation();
    if (!retiring && isLocked()) {
      target.history.pushState(marker, '', url);
      return;
    }
    detach();
    if (retiring) resolveClose();
    else onBack();
  };
  target.history.pushState(marker, '', url);
  activeTokens.set(target, token);
  target.addEventListener('popstate', onPop, true);
  return {
    close() {
      if (!active) return Promise.resolve();
      if (closePromise) return closePromise;
      retiring = true;
      closePromise = new Promise(resolve => { resolveClose = resolve; });
      target.history.back();
      return closePromise;
    },
    dispose() {
      detach();
      resolveClose?.();
      if (target.history.state?.[HOME_ENTRY] === token) {
        markHomeHistoryEntry(target);
      }
    },
  };
}
