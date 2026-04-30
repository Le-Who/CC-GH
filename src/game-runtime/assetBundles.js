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
  "bubbo.background.tile": "/games/bubbo-bubbo/images/background-tile.png",
  "bubbo.bubble.blue": "/games/bubbo-bubbo/images/bubble-blue.png",
  "bubbo.bubble.green": "/games/bubbo-bubbo/images/bubble-green.png",
  "bubbo.bubble.red": "/games/bubbo-bubbo/images/bubble-red.png",
  "bubbo.bubble.yellow": "/games/bubbo-bubbo/images/bubble-yellow.png",
  "bubbo.balls.sheet": "/games/bubbo-bubbo/assets_bubbo_balls.png",
  "bubbo.bottomTray": "/games/bubbo-bubbo/images/bottom-tray.png",
  "bubbo.cannon.main": "/games/bubbo-bubbo/images/cannon-main.png",
  "match3.piece.dragon": "/games/puzzling-potions/images/piece-dragon.png",
  "match3.piece.frog": "/games/puzzling-potions/images/piece-frog.png",
  "match3.piece.newt": "/games/puzzling-potions/images/piece-newt.png",
  "match3.piece.snake": "/games/puzzling-potions/images/piece-snake.png",
  "match3.piece.spider": "/games/puzzling-potions/images/piece-spider.png",
  "match3.piece.yeti": "/games/puzzling-potions/images/piece-yeti.png",
  "match3.shelf.block": "/games/puzzling-potions/images/shelf-block.png",
  "match3.special.blast": "/games/puzzling-potions/images/special-blast.png",
  "match3.special.column": "/games/puzzling-potions/images/special-column.png",
  "match3.special.colour": "/games/puzzling-potions/images/special-colour.png",
  "match3.special.row": "/games/puzzling-potions/images/special-row.png",
  "gardenShelf.sheet.transparent": "/games/garden-shelf/assets_transparent.png",
  "gardenShelf.shelf": "/games/garden-shelf/assets_shelf.png",
  "gardenShelf.sign": "/games/garden-shelf/assets_garden_sign.png",
  "gardenShelf.bottomPlank": "/games/garden-shelf/assets_garden_bottom_plank.png",
  "gardenShelf.settingsCog": "/games/garden-shelf/assets_garden_cog.png",
};

export const GAME_ASSET_BUNDLES = {
  bubbo: [
    "bubbo.background.tile",
    "bubbo.bubble.blue",
    "bubbo.bubble.green",
    "bubbo.bubble.red",
    "bubbo.bubble.yellow",
    "bubbo.balls.sheet",
    "bubbo.bottomTray",
    "bubbo.cannon.main",
  ],
  match3: [
    "match3.piece.dragon",
    "match3.piece.frog",
    "match3.piece.newt",
    "match3.piece.snake",
    "match3.piece.spider",
    "match3.piece.yeti",
    "match3.shelf.block",
    "match3.special.blast",
    "match3.special.column",
    "match3.special.colour",
    "match3.special.row",
  ],
};

let runtimeAssetManifest = null;
let runtimeAssetManifestPromise = null;

export function setRuntimeAssetManifest(manifest) {
  runtimeAssetManifest = manifest || null;
  return runtimeAssetManifest;
}

export function getRuntimeAssetManifest() {
  return runtimeAssetManifest;
}

export function runtimeAssetSources(manifest, key) {
  const item = manifest?.assets?.[key];
  if (!item) return [];
  const sources = [];
  if (Array.isArray(item.src)) sources.push(...item.src);
  else if (item.src) sources.push(item.src);
  if (item.fallback) sources.push(item.fallback);
  return sources.filter(Boolean).map(withAssetBase);
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
