export const BUILD_RELOAD_GUARD_KEY = "gh_build_reload_guard";
const DEFAULT_RELOAD_GUARD_MS = 60_000;

export function normalizeBuildId(value) {
  return String(value || "").trim();
}

export function shouldRefreshForBuild(currentBuildId, latestBuildId) {
  const current = normalizeBuildId(currentBuildId);
  const latest = normalizeBuildId(latestBuildId);
  return !!current && !!latest && current !== latest;
}

export function markReloadForBuild(storage, buildId, now = Date.now(), ttlMs = DEFAULT_RELOAD_GUARD_MS) {
  const latest = normalizeBuildId(buildId);
  if (!storage || !latest) return true;
  const raw = storage.getItem(BUILD_RELOAD_GUARD_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.buildId === latest && now - Number(parsed.at || 0) < ttlMs) return false;
    } catch {
      // Corrupt guard data should not strand a client on an old build.
    }
  }
  storage.setItem(BUILD_RELOAD_GUARD_KEY, JSON.stringify({ buildId: latest, at: now }));
  return true;
}

export function buildCacheBustingUrl(href, buildId) {
  const url = new URL(href, "http://localhost/");
  url.searchParams.set("build", normalizeBuildId(buildId) || String(Date.now()));
  return url.pathname + url.search + url.hash;
}
