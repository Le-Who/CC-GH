import { registerSW } from "virtual:pwa-register";
import { clearLegacyPrivateApiCache, installPrivateApiCacheCleanup } from "./privateApiCache.js";
import {
  BUILD_RELOAD_GUARD_KEY,
  buildCacheBustingUrl,
  markReloadForBuild,
  shouldRefreshForBuild,
} from "./updateManagerCore.js";

let installed = false;

function clientBuildId() {
  return globalThis.__APP_BUILD_ID__ || import.meta.env?.VITE_BUILD_ID || globalThis.__APP_VERSION__ || "";
}

async function fetchLatestConfig() {
  const response = await fetch(`/api/config?buildCheck=${Date.now()}`, {
    cache: "no-store",
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
  installed = true;
  const cleanupPrivateCache = installPrivateApiCacheCleanup();

  const intervalMs = Math.max(15_000, Number(options.intervalMs) || 60_000);
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateSW(true);
    },
  });

  let stopped = false;
  let timer = 0;

  async function checkBuild() {
    if (stopped) return;
    try {
      const config = await fetchLatestConfig();
      if (stopped) return;
      if (!shouldRefreshForBuild(clientBuildId(), config.buildId)) return;
      await clearLegacyPrivateApiCache();
      if (stopped) return;
      // In autoUpdate mode this helper waits for registration setup; it does
      // not call ServiceWorkerRegistration.update(). Reload supplies fresh HTML.
      await updateSW(true);
      if (stopped) return;
      const reloadStorage = window.sessionStorage;
      const previousGuard = reloadStorage?.getItem(BUILD_RELOAD_GUARD_KEY) ?? null;
      if (!markReloadForBuild(reloadStorage, config.buildId)) return;
      try {
        window.location.replace(buildCacheBustingUrl(window.location.href, config.buildId));
      } catch (error) {
        // A failed navigation must not suppress the next healthy retry.
        if (reloadStorage) {
          if (previousGuard === null) reloadStorage.removeItem(BUILD_RELOAD_GUARD_KEY);
          else reloadStorage.setItem(BUILD_RELOAD_GUARD_KEY, previousGuard);
        }
        throw error;
      }
    } catch {
      // Update checks are best-effort; normal gameplay must not be blocked by them.
    }
  }

  timer = window.setInterval(checkBuild, intervalMs);
  const initialCheck = window.setTimeout(checkBuild, 4000);

  return () => {
    stopped = true;
    installed = false;
    cleanupPrivateCache();
    window.clearInterval(timer);
    window.clearTimeout(initialCheck);
  };
}
