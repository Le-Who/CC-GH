/** Own native Telegram swipe suppression without blocking browser scrolling.
 * Each caller releases only its own scope. The last release restores the state
 * observed before the first scope, including an already-disabled host setting.
 */
export function createGameGestureController(loadSdk) {
  const owners = new Set();
  let sdk = null;
  let loading = null;
  let previousEnabled = null;

  function reconcile() {
    if (!sdk) return;
    try {
      if (owners.size) {
        if (previousEnabled !== null || !sdk.isSwipeBehaviorSupported?.()) return;
        if (typeof sdk.disableVerticalSwipes !== "function" || typeof sdk.enableVerticalSwipes !== "function") return;
        if (!sdk.isSwipeBehaviorMounted?.()) sdk.mountSwipeBehavior?.();
        const enabled = sdk.isVerticalSwipesEnabled?.();
        if (typeof enabled !== "boolean") return;
        sdk.disableVerticalSwipes();
        previousEnabled = enabled;
      } else if (previousEnabled !== null) {
        const enabled = previousEnabled;
        previousEnabled = null;
        if (enabled) sdk.enableVerticalSwipes();
        else sdk.disableVerticalSwipes();
      }
    } catch {
      // Host gesture support is progressive enhancement in older clients/dev.
    }
  }

  function acquire() {
    const owner = {};
    owners.add(owner);
    if (sdk) reconcile();
    else if (!loading) {
      loading = Promise.resolve().then(loadSdk).then((loaded) => {
        sdk = loaded;
        // Read current owners, not stale pointer state from before SDK loading.
        reconcile();
      }).catch(() => {}).finally(() => { loading = null; });
    }
    return () => {
      if (owners.delete(owner)) reconcile();
    };
  }

  return { acquire };
}
