import { registerSW } from "virtual:pwa-register";
import {
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

async function clearServiceWorkersAndCaches() {
  const registrations = await navigator.serviceWorker?.getRegistrations?.().catch(() => []) || [];
  await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));

  if (!globalThis.caches?.keys) return;
  const keys = await globalThis.caches.keys().catch(() => []);
  await Promise.all(keys.map((key) => globalThis.caches.delete(key).catch(() => false)));
}

export function installUpdateManager(options = {}) {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;

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
      if (!shouldRefreshForBuild(clientBuildId(), config.buildId)) return;
      if (!markReloadForBuild(window.sessionStorage, config.buildId)) return;
      await clearServiceWorkersAndCaches();
      window.location.replace(buildCacheBustingUrl(window.location.href, config.buildId));
    } catch {
      // Update checks are best-effort; normal gameplay must not be blocked by them.
    }
  }

  timer = window.setInterval(checkBuild, intervalMs);
  window.setTimeout(checkBuild, 4000);

  return () => {
    stopped = true;
    window.clearInterval(timer);
  };
}
