import { clearLegacyPrivateApiCache, installPrivateApiCacheCleanup } from "./privateApiCache.js";
import {
  BUILD_RELOAD_GUARD_KEY,
  buildCacheBustingUrl,
  markReloadForBuild,
  normalizeBuildId,
  shouldRefreshForBuild,
} from "./updateManagerCore.js";

let installed = null;

export async function checkForAppUpdate() {
  return installed?.check?.() ?? null;
}

function clientBuildId() {
  return globalThis.__APP_BUILD_ID__ || import.meta.env?.VITE_BUILD_ID || globalThis.__APP_VERSION__ || "";
}

async function fetchLatestConfig(signal) {
  const response = await fetch(`/api/config?buildCheck=${Date.now()}`, {
    cache: "no-store",
    signal,
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });
  if (!response.ok) throw new Error(`config_${response.status}`);
  return response.json();
}

export function installUpdateManager(options = {}) {
  if (installed || typeof window === "undefined") return () => {};
  const instance = {};
  installed = instance;
  const cleanupPrivateCache = installPrivateApiCacheCleanup();
  const intervalMs = Math.max(15_000, Number(options.intervalMs) || 60_000);
  let stopped = false;
  let latestBuild = "";
  let checking = null;
  let applying = false;
  const requests = new Set();
  // The generated autoUpdate client reloads on worker activation, independently
  // of gameplay and even during boot. Register the same worker without owning
  // navigation: its network-only API policy and shell precache still activate.
  const registration = Promise.resolve().then(() => {
    if (stopped || !navigator.serviceWorker?.register) return null;
    return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  }).catch(() => null);

  const offer = () => latestBuild ? { buildId: latestBuild, apply: applyUpdate } : null;
  async function applyUpdate({ canReload, tab } = {}) {
    const target = latestBuild;
    const allowed = () => !stopped && latestBuild === target && document.visibilityState !== "hidden"
      && typeof canReload === "function" && canReload() === true;
    if (applying || !shouldRefreshForBuild(clientBuildId(), target) || !allowed()) return false;
    applying = true;
    const controller = new AbortController();
    requests.add(controller);
    const deadline = window.setTimeout(() => controller.abort(), 8000);
    try {
      await clearLegacyPrivateApiCache({ signal: controller.signal });
      if (!allowed()) return false;
      const storage = window.sessionStorage;
      const previousGuard = storage?.getItem(BUILD_RELOAD_GUARD_KEY) ?? null;
      if (!markReloadForBuild(storage, target)) return false;
      try {
        window.location.replace(buildCacheBustingUrl(window.location.href, target, { tab }));
        return true;
      } catch (error) {
        if (storage) {
          if (previousGuard === null) storage.removeItem(BUILD_RELOAD_GUARD_KEY);
          else storage.setItem(BUILD_RELOAD_GUARD_KEY, previousGuard);
        }
        throw error;
      }
    } catch {
      return false;
    } finally {
      window.clearTimeout(deadline);
      requests.delete(controller);
      applying = false;
    }
  }

  function checkBuild() {
    if (stopped) return Promise.resolve(null);
    if (checking) return checking;
    if (document.visibilityState === "hidden") return Promise.resolve(offer());
    const controller = new AbortController();
    requests.add(controller);
    const deadline = window.setTimeout(() => controller.abort(), 8000);
    checking = (async () => {
      try {
        const config = await fetchLatestConfig(controller.signal);
        if (stopped || controller.signal.aborted) return stopped ? null : offer();
        const latest = normalizeBuildId(config.buildId);
        if (!latest) return offer();
        const available = shouldRefreshForBuild(clientBuildId(), latest) ? latest : "";
        if (available !== latestBuild) {
          latestBuild = available;
          options.onUpdateAvailable?.(offer());
          if (available) void registration.then(worker => stopped ? null : worker?.update()).catch(() => {});
        }
        return offer();
      } catch {
        // A known update still needs confirmation when the network is unavailable.
        return offer();
      } finally {
        window.clearTimeout(deadline);
        requests.delete(controller);
        checking = null;
      }
    })();
    return checking;
  }
  instance.check = checkBuild;

  const resume = () => { if (document.visibilityState === "visible") void checkBuild(); };
  document.addEventListener("visibilitychange", resume);
  const timer = window.setInterval(checkBuild, intervalMs);
  const initialCheck = window.setTimeout(checkBuild, 4000);

  return () => {
    if (stopped) return;
    stopped = true;
    if (installed === instance) installed = null;
    for (const request of requests) request.abort();
    document.removeEventListener("visibilitychange", resume);
    cleanupPrivateCache();
    window.clearInterval(timer);
    window.clearTimeout(initialCheck);
  };
}
