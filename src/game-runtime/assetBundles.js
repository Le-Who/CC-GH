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

function legacyPngEntries(prefix, baseDir, ids) {
  return Object.fromEntries(ids.map((id) => [`${prefix}.${id}`, `${baseDir}/${id}.png`]));
}

const BLOX_ROOT_ASSET_IDS = [
  "background",
  "block_tile_blue",
  "block_tile_cyan",
  "block_tile_gray",
  "block_tile_green",
  "block_tile_orange",
  "block_tile_pink",
  "block_tile_purple",
  "block_tile_red",
  "block_tile_yellow",
  "board_frame",
  "button_primary",
  "button_secondary",
  "cell_clear_col",
  "cell_clear_row",
  "cell_empty",
  "cell_invalid",
  "cell_pending",
  "cell_selected",
  "cell_valid",
  "grid_shadow",
  "hud_bar",
  "icon_exit",
  "icon_lines",
  "icon_restart",
  "icon_reward",
  "icon_score",
  "icon_settle",
  "pause_panel",
  "piece_dot",
  "piece_h2",
  "piece_h3",
  "piece_i4",
  "piece_i5",
  "piece_l3",
  "piece_l3r",
  "piece_s4",
  "piece_sq",
  "piece_t4",
  "piece_v2",
  "piece_v3",
  "result_panel",
  "tray_panel",
  "tray_slot_empty",
  "tray_slot_selected",
];
const BLOX_FX_ASSET_IDS = [
  "column_wipe",
  "invalid_pulse",
  "multi_clear_burst",
  "place_settle",
  "reward_spark",
  "row_wipe",
  "tray_refill",
  "valid_glow",
];
const FARM_ROOT_ASSET_IDS = [
  "background-field",
  "plot-disabled-overlay",
  "plot-empty",
  "plot-locked",
  "plot-pending",
  "plot-ready-overlay",
  "plot-selected",
  "plot-shadow",
  "plot-theme-default",
  "plot-theme-flower",
  "plot-theme-moon",
  "plot-theme-stone",
  "plot-watered-overlay",
];
const FARM_CROP_ASSET_IDS = [
  "blueberry_growing",
  "blueberry_ready",
  "blueberry_seed",
  "blueberry_sprout",
  "corn_growing",
  "corn_ready",
  "corn_seed",
  "corn_sprout",
  "golden_rose_growing",
  "golden_rose_ready",
  "golden_rose_seed",
  "golden_rose_sprout",
  "pumpkin_growing",
  "pumpkin_ready",
  "pumpkin_seed",
  "pumpkin_sprout",
  "strawberry_growing",
  "strawberry_ready",
  "strawberry_seed",
  "strawberry_sprout",
  "sunflower_growing",
  "sunflower_ready",
  "sunflower_seed",
  "sunflower_sprout",
  "tomato_growing",
  "tomato_ready",
  "tomato_seed",
  "tomato_sprout",
  "watermelon_growing",
  "watermelon_ready",
  "watermelon_seed",
  "watermelon_sprout",
];
const FARM_FX_ASSET_IDS = [
  "booster_flash",
  "growth_glow",
  "harvest_pop",
  "level_up",
  "offline_report",
  "plant_puff",
  "water_splash",
];
const FARM_HARVEST_ASSET_IDS = [
  "blueberry",
  "corn",
  "golden_rose",
  "pumpkin",
  "strawberry",
  "sunflower",
  "tomato",
  "watermelon",
];
const FARM_SEED_ASSET_IDS = [
  "blueberry_packet",
  "corn_packet",
  "golden_rose_packet",
  "pumpkin_packet",
  "strawberry_packet",
  "sunflower_packet",
  "tomato_packet",
  "watermelon_packet",
];
const FARM_UI_ASSET_IDS = [
  "badges_panel",
  "bag_panel",
  "button_primary",
  "button_secondary",
  "empty_slot_placeholder",
  "hud_bar",
  "icon_buy_plot",
  "icon_gold",
  "icon_harvest",
  "icon_plot",
  "icon_seed",
  "icon_theme",
  "icon_uproot",
  "icon_water",
  "icon_xp",
  "journal_panel",
  "season_panel",
  "shop_panel",
  "side_panel",
];
const FARM_RENDER_ROOT_ASSET_IDS = [
  "background-field",
  "plot-empty",
  "plot-locked",
  "plot-pending",
  "plot-ready-overlay",
  "plot-selected",
  "plot-shadow",
  "plot-theme-default",
  "plot-theme-flower",
  "plot-theme-moon",
  "plot-theme-stone",
  "plot-watered-overlay",
];
const FARM_RENDER_FX_ASSET_IDS = [
  "growth_glow",
  "harvest_pop",
  "plant_puff",
  "water_splash",
];
const BLOX_BUNDLE_KEYS = [
  ...BLOX_ROOT_ASSET_IDS.map((id) => `blox.${id}`),
  ...BLOX_FX_ASSET_IDS.map((id) => `blox.fx.${id}`),
];
const FARM_BUNDLE_KEYS = [
  ...FARM_RENDER_ROOT_ASSET_IDS.map((id) => `farm.${id}`),
  ...FARM_CROP_ASSET_IDS.map((id) => `farm.crops.${id}`),
  ...FARM_RENDER_FX_ASSET_IDS.map((id) => `farm.fx.${id}`),
];

export const LEGACY_ASSET_PATHS = {
  ...legacyPngEntries("blox", "/games/blox", BLOX_ROOT_ASSET_IDS),
  ...legacyPngEntries("blox.fx", "/games/blox/fx", BLOX_FX_ASSET_IDS),
  "bubbo.background.underwater": "/games/bubbo-bubbo/images/underwater-backdrop.png",
  "bubbo.background.tile": "/games/bubbo-bubbo/images/background-tile.png",
  "bubbo.balls.sheet": "/games/bubbo-bubbo/assets_bubbo_balls.png",
  "bubbo.bottomTray": "/games/bubbo-bubbo/images/bottom-tray.png",
  "bubbo.cannon.main": "/games/bubbo-bubbo/images/cannon-main.png",
  ...legacyPngEntries("farm", "/games/farm", FARM_ROOT_ASSET_IDS),
  ...legacyPngEntries("farm.crops", "/games/farm/crops", FARM_CROP_ASSET_IDS),
  ...legacyPngEntries("farm.fx", "/games/farm/fx", FARM_FX_ASSET_IDS),
  ...legacyPngEntries("farm.harvest", "/games/farm/harvest", FARM_HARVEST_ASSET_IDS),
  ...legacyPngEntries("farm.seeds", "/games/farm/seeds", FARM_SEED_ASSET_IDS),
  ...legacyPngEntries("farm.ui", "/games/farm/ui", FARM_UI_ASSET_IDS),
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
  "match3.background.table": "/games/puzzling-potions/images/background-table.png",
  "match3.board.frame": "/games/puzzling-potions/images/board-frame.png",
  "match3.board.cell": "/games/puzzling-potions/images/cell-empty.png",
  "match3.board.cellSelected": "/games/puzzling-potions/images/cell-selected.png",
  "match3.ui.hudBar": "/games/puzzling-potions/images/hud-bar.png",
  "match3.ui.menuPanel": "/games/puzzling-potions/images/menu-panel.png",
  "match3.fx.clearBurst": "/games/puzzling-potions/images/fx-clear-burst.png",
  "match3.drop.gold": "/games/puzzling-potions/images/drop-gold.png",
  "match3.drop.seeds": "/games/puzzling-potions/images/drop-seeds.png",
  "match3.drop.energy": "/games/puzzling-potions/images/drop-energy.png",
  "gardenShelf.sheet.transparent": "/games/garden-shelf/assets_transparent.png",
  "gardenShelf.shelf": "/games/garden-shelf/assets_shelf.png",
  "gardenShelf.sign": "/games/garden-shelf/assets_garden_sign.png",
  "gardenShelf.bottomPlank": "/games/garden-shelf/assets_garden_bottom_plank.png",
  "gardenShelf.settingsCog": "/games/garden-shelf/assets_garden_cog.png",
};

export const GAME_ASSET_BUNDLES = {
  blox: BLOX_BUNDLE_KEYS,
  bubbo: [
    "bubbo.background.underwater",
    "bubbo.background.tile",
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
    "match3.background.table",
    "match3.board.frame",
    "match3.board.cell",
    "match3.board.cellSelected",
    "match3.ui.hudBar",
    "match3.ui.menuPanel",
    "match3.fx.clearBurst",
    "match3.drop.gold",
    "match3.drop.seeds",
    "match3.drop.energy",
  ],
  farm: FARM_BUNDLE_KEYS,
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
