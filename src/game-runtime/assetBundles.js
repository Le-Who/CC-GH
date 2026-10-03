export function clientBuildId() {
  return globalThis.__APP_BUILD_ID__ || import.meta.env?.VITE_BUILD_ID || globalThis.__APP_VERSION__ || "";
}

export function assetBaseUrl() {
  return (globalThis.__ASSET_BASE_URL__ || import.meta.env?.VITE_ASSET_BASE_URL || "").replace(/\/+$/, "");
}

function isAbsoluteUrl(path) {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(String(path || "")) || String(path || "").startsWith("data:");
}

function withAssetBase(path) {
  const value = String(path || "");
  const base = assetBaseUrl();
  if (!base || !value.startsWith("/assets-runtime/") || isAbsoluteUrl(value)) return value;
  return `${base}${value}`;
}

export function assetUrl(path) {
  const value = String(path || "");
  if (!value) return value;
  const based = withAssetBase(value);
  const buildId = clientBuildId();
  if (!buildId || !value.startsWith("/games/")) return based;
  const joiner = based.includes("?") ? "&" : "?";
  return `${based}${joiner}v=${encodeURIComponent(buildId)}`;
}

export const LEGACY_ASSET_PATHS = {
  "match3.special.blast": "/games/puzzling-potions/images/special-blast.png",
  "match3.special.column": "/games/puzzling-potions/images/special-column.png",
  "match3.special.colour": "/games/puzzling-potions/images/special-colour.png",
  "match3.special.row": "/games/puzzling-potions/images/special-row.png",
  "match3.fx.clearBurst": "/games/puzzling-potions/images/fx-clear-burst.png",
  "match3.drop.gold": "/games/puzzling-potions/images/drop-gold.png",
  "match3.drop.seeds": "/games/puzzling-potions/images/drop-seeds.png",
  "match3.drop.energy": "/games/puzzling-potions/images/drop-energy.png",
  "gardenShelf.sheet.transparent": "/games/garden-shelf/assets_transparent.png",
};

export const GAME_ASSET_BUNDLES = {
  match3: ["match3.drop.energy", "match3.drop.gold", "match3.drop.seeds", "match3.fx.clearBurst", "match3.special.blast", "match3.special.colour", "match3.special.column", "match3.special.row"],
};

let runtimeAssetManifest = null;
let runtimeAssetManifestPromise = null;
const runtimeAssetSourceCache = new WeakMap();

export function setRuntimeAssetManifest(manifest) {
  runtimeAssetManifest = manifest || null;
  return runtimeAssetManifest;
}

export function getRuntimeAssetManifest() {
  return runtimeAssetManifest;
}

function compactRuntimeAssetSource(manifest, source, key) {
  if (typeof source === "string") return source;
  if (!Array.isArray(source)) return "";
  const [dirIndex, hash, extension = "webp"] = source;
  if (!Number.isInteger(dirIndex) || !hash) return "";
  const dir = manifest?.dirs?.[dirIndex];
  if (typeof dir !== "string") return "";
  const base = runtimeFileBase(key);
  return `/assets-runtime/${dir ? `${dir}/` : ""}${base}.${hash}.${extension}`;
}

function runtimeFileBase(key) {
  return String(key || "")
    .split(".")
    .pop()
    .replace(/[^a-zA-Z0-9_-]+/g, "-");
}

export function runtimeAssetSources(manifest, key) {
  if (manifest && typeof manifest === "object") {
    let sourceCache = runtimeAssetSourceCache.get(manifest);
    if (!sourceCache) {
      sourceCache = new Map();
      runtimeAssetSourceCache.set(manifest, sourceCache);
    } else if (sourceCache.has(key)) {
      return sourceCache.get(key).map(withAssetBase);
    }
    const rawSources = runtimeAssetSourcesRaw(manifest, key);
    sourceCache.set(key, rawSources);
    return rawSources.map(withAssetBase);
  }
  return runtimeAssetSourcesRaw(manifest, key).map(withAssetBase);
}

function runtimeAssetSourcesRaw(manifest, key) {
  const item = manifest?.assets?.[key];
  if (!item) return [];
  if (typeof item === "string") return [item].filter(Boolean);
  if (Array.isArray(item)) {
    const sources = Number.isInteger(item[0])
      ? [compactRuntimeAssetSource(manifest, item, key)]
      : item.map((source) => compactRuntimeAssetSource(manifest, source, key));
    return sources.filter(Boolean);
  }
  const sources = [];
  if (Array.isArray(item.src)) sources.push(...item.src);
  else if (item.src) sources.push(item.src);
  if (item.fallback) sources.push(item.fallback);
  return sources.filter(Boolean);
}

export function runtimeAssetSrc(manifest, key) {
  return runtimeAssetSources(manifest, key)[0] || "";
}

export function resolveAssetUrl(keyOrPath, options = {}) {
  const { runtimeManifest = runtimeAssetManifest } = options;
  const legacyPath = Object.prototype.hasOwnProperty.call(options, "legacyPath")
    ? options.legacyPath
    : LEGACY_ASSET_PATHS[keyOrPath];
  const generated = runtimeAssetSrc(runtimeManifest, keyOrPath);
  if (generated) return generated;
  if (legacyPath === "") return "";
  return assetUrl(legacyPath || keyOrPath);
}

export function resolveAssetSourceList(keyOrPath, runtimeManifest = runtimeAssetManifest) {
  const generated = runtimeAssetSources(runtimeManifest, keyOrPath);
  if (generated.length) return generated;
  return [assetUrl(LEGACY_ASSET_PATHS[keyOrPath] || keyOrPath)];
}

export async function loadRuntimeAssetManifest(fetchImpl = globalThis.fetch) {
  if (runtimeAssetManifest) return runtimeAssetManifest;
  if (typeof fetchImpl !== "function") return null;
  if (!runtimeAssetManifestPromise) {
    runtimeAssetManifestPromise = fetchImpl(assetUrl("/assets-runtime/manifest.json"), { cache: "no-cache" })
      .then((response) => (response?.ok ? response.json() : null))
      .then((manifest) => setRuntimeAssetManifest(manifest))
      .catch(() => null);
  }
  return runtimeAssetManifestPromise;
}
