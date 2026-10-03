const RETIRED_API_CACHE = 'api-get-cache';
const CLEANUP_INTERVAL_MS = 5000;
let readSequence = 0;

export function privateApiReadUrl(path) {
  const url = new URL(path, globalThis.location?.origin || 'https://game-hub.invalid');
  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/config') return null;
  // An old controlling NetworkFirst worker ignores Request.cache=no-store.
  // Never reuse its URL key. No account ID, auth data or other secrets in URLs.
  const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${++readSequence}-${Math.random().toString(36).slice(2)}`;
  url.searchParams.set('__gh_read', nonce);
  return path.startsWith('/') ? `${url.pathname}${url.search}${url.hash}` : url.href;
}

export async function clearLegacyPrivateApiCache({ signal } = {}) {
  const aborted = () => new DOMException("Private API cache cleanup aborted", "AbortError");
  if (signal?.aborted) throw aborted();
  if (!globalThis.caches?.delete) return false;
  // This is a network response cache. Never enumerate/delete other caches,
  // localStorage, IndexedDB databases, player saves or action journals.
  const deletion = globalThis.caches.delete(RETIRED_API_CACHE);
  if (!signal) return deletion;
  return new Promise((resolve, reject) => {
    const onAbort = () => { signal.removeEventListener("abort", onAbort); reject(aborted()); };
    signal.addEventListener("abort", onAbort, { once: true });
    // CacheStorage itself cannot be cancelled. Its eventual completion is
    // observed, but cannot resume a private request after the deadline.
    Promise.resolve(deletion).then(
      value => { signal.removeEventListener("abort", onAbort); resolve(value); },
      error => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
    if (signal.aborted) onAbort();
  });
}

export function installPrivateApiCacheCleanup() {
  if (typeof window === 'undefined') return () => {};
  let stopped = false;
  let timer = 0;
  let reportedFailure = false;
  async function sweep() {
    if (stopped) return;
    try {
      await clearLegacyPrivateApiCache();
      reportedFailure = false;
    } catch (error) {
      if (!reportedFailure) console.error('Retired personal API cache cleanup failed', error);
      reportedFailure = true;
    }
  }
  function resume() {
    window.clearInterval(timer);
    timer = 0;
    if (stopped || document.visibilityState === 'hidden') return;
    void sweep();
    // Old workers can finish requests after a new worker claims the page and
    // repopulate the retired cache. Sweep while visible, including same builds.
    timer = window.setInterval(sweep, CLEANUP_INTERVAL_MS);
  }
  navigator.serviceWorker?.addEventListener('controllerchange', sweep);
  window.addEventListener('focus', sweep);
  window.addEventListener('pageshow', sweep);
  document.addEventListener('visibilitychange', resume);
  resume();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    navigator.serviceWorker?.removeEventListener('controllerchange', sweep);
    window.removeEventListener('focus', sweep);
    window.removeEventListener('pageshow', sweep);
    document.removeEventListener('visibilitychange', resume);
  };
}
