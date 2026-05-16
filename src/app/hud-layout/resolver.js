import { selectHudViewportProfile } from "./profiles.js";

export const HUD_LAYOUT_SCHEMA_VERSION = 1;

const LAYOUT_MODES = new Set(["anchored", "dock", "flow", "stack", "freeform", "reserveOnly", "custom"]);
const ANCHORS = new Set([
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
]);

export const EMERGENCY_HUD_LAYOUT = {
  schemaVersion: HUD_LAYOUT_SCHEMA_VERSION,
  layoutVersion: "emergency",
  gameId: "emergency",
  base: {
    regions: {
      gameplayHud: { mode: "anchored", anchor: "top-center", x: 0, y: 8, maxWidth: 380, zIndex: 40, visible: true },
      eventLog: { mode: "anchored", anchor: "bottom-center", x: 0, y: -96, maxWidth: 360, zIndex: 35, visible: true },
      bottomDock: { mode: "dock", edge: "bottom", offset: 0, thickness: 84, reserve: 92, zIndex: 50, visible: true },
      pixiPlayfieldReserve: { mode: "reserveOnly", topReserve: 88, bottomReserve: 120, leftReserve: 0, rightReserve: 0 },
    },
  },
  profiles: {
    "phone-default-portrait": {
      match: { orientation: "portrait", maxWidth: 430 },
      regions: {
        pixiPlayfieldReserve: { topReserve: 96, bottomReserve: 132 },
      },
    },
    "phone-landscape": {
      match: { orientation: "landscape", maxHeight: 480 },
      regions: {
        gameplayHud: { anchor: "top-right", x: -12, y: 8, maxWidth: 320 },
        eventLog: { anchor: "bottom-left", x: 12, y: -12, maxWidth: 320 },
        pixiPlayfieldReserve: { topReserve: 52, bottomReserve: 64 },
      },
    },
  },
};

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (value == null || typeof value !== "object") return value;
  return structuredClone(value);
}

function finiteNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function sanitizeNumber(value, { min = -10000, max = 10000, fallback = 0 } = {}) {
  const next = finiteNumber(value, fallback);
  return Math.max(min, Math.min(max, next));
}

function mergeObjects(base = {}, patch = {}) {
  const out = clone(base) || {};
  if (!isPlainObject(patch)) return out;
  for (const [key, value] of Object.entries(patch)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = mergeObjects(out[key], value);
    } else if (value === undefined) {
      delete out[key];
    } else {
      out[key] = clone(value);
    }
  }
  return out;
}

export function mergeHudLayout(base = {}, patch = {}) {
  return mergeObjects(base, patch);
}

function sanitizeVisibility(value) {
  return value === false ? false : true;
}

export function sanitizeRegionLayout(region = {}) {
  const mode = LAYOUT_MODES.has(region.mode) ? region.mode : "custom";
  const out = { ...region, mode };
  if ("visible" in out) out.visible = sanitizeVisibility(out.visible);
  if ("x" in out) out.x = sanitizeNumber(out.x);
  if ("y" in out) out.y = sanitizeNumber(out.y);
  if ("width" in out) out.width = sanitizeNumber(out.width, { min: 1, max: 2000, fallback: 1 });
  if ("height" in out) out.height = sanitizeNumber(out.height, { min: 1, max: 2000, fallback: 1 });
  if ("minWidth" in out) out.minWidth = sanitizeNumber(out.minWidth, { min: 0, max: 2000 });
  if ("maxWidth" in out) out.maxWidth = sanitizeNumber(out.maxWidth, { min: 1, max: 2400, fallback: 1 });
  if ("minHeight" in out) out.minHeight = sanitizeNumber(out.minHeight, { min: 0, max: 2000 });
  if ("maxHeight" in out) out.maxHeight = sanitizeNumber(out.maxHeight, { min: 1, max: 2400, fallback: 1 });
  if ("zIndex" in out) out.zIndex = sanitizeNumber(out.zIndex, { min: -1, max: 1000 });
  if ("offset" in out) out.offset = sanitizeNumber(out.offset);
  if ("thickness" in out) out.thickness = sanitizeNumber(out.thickness, { min: 0, max: 800 });
  if ("reserve" in out) out.reserve = sanitizeNumber(out.reserve, { min: 0, max: 1000 });
  if ("scale" in out) out.scale = sanitizeNumber(out.scale, { min: 0.2, max: 4, fallback: 1 });
  if ("opacity" in out) out.opacity = sanitizeNumber(out.opacity, { min: 0, max: 1, fallback: 1 });
  if ("rotation" in out) out.rotation = sanitizeNumber(out.rotation, { min: -360, max: 360 });
  for (const key of ["topReserve", "bottomReserve", "leftReserve", "rightReserve"]) {
    if (key in out) out[key] = sanitizeNumber(out[key], { min: 0, max: 1000 });
  }
  if (out.anchor && !ANCHORS.has(out.anchor)) out.anchor = "top-left";
  return out;
}

function sanitizeRegions(regions = {}) {
  return Object.fromEntries(
    Object.entries(regions || {}).map(([id, region]) => [id, sanitizeRegionLayout(region)]),
  );
}

function profileFromRepo(repoLayout, viewport) {
  const profile = selectHudViewportProfile(viewport || {});
  if (repoLayout?.profiles?.[profile.id]) return profile.id;
  const orientation = viewport?.orientation || profile.match?.orientation;
  const sameOrientation = Object.entries(repoLayout?.profiles || {})
    .find(([, item]) => item?.match?.orientation === orientation);
  if (sameOrientation) return sameOrientation[0];
  if (repoLayout?.profiles?.["phone-default-portrait"]) return "phone-default-portrait";
  return profile.id;
}

function profilePatch(layout, profileId) {
  const profile = layout?.profiles?.[profileId];
  return profile ? { regions: profile.regions || {}, pixiSafeArea: profile.pixiSafeArea || undefined } : {};
}

export function resolveHudLayout({
  repoLayout = EMERGENCY_HUD_LAYOUT,
  viewport = {},
  localOverrides = null,
  transientOverrides = null,
  allowLocalOverrides = false,
} = {}) {
  const activeProfileId = profileFromRepo(repoLayout, viewport);
  const baseLayer = { regions: repoLayout?.base?.regions || {}, pixiSafeArea: repoLayout?.base?.pixiSafeArea || {} };
  const repoProfileLayer = profilePatch(repoLayout, activeProfileId);
  const localBaseLayer = allowLocalOverrides ? { regions: localOverrides?.base?.regions || {}, pixiSafeArea: localOverrides?.base?.pixiSafeArea || undefined } : {};
  const localProfileLayer = allowLocalOverrides ? profilePatch(localOverrides, activeProfileId) : {};
  const transientLayer = transientOverrides || {};
  const merged = [baseLayer, repoProfileLayer, localBaseLayer, localProfileLayer, transientLayer]
    .reduce((current, layer) => mergeHudLayout(current, layer), {});
  return {
    schemaVersion: HUD_LAYOUT_SCHEMA_VERSION,
    layoutVersion: repoLayout?.layoutVersion || "resolved",
    gameId: repoLayout?.gameId || "unknown",
    activeProfileId,
    viewport,
    regions: sanitizeRegions(merged.regions || {}),
    pixiSafeArea: merged.pixiSafeArea || {},
    sources: {
      base: "repo",
      profile: repoLayout?.profiles?.[activeProfileId] ? "repo" : "fallback",
      local: allowLocalOverrides && localOverrides ? "local" : "disabled",
      transient: transientOverrides ? "transient" : "none",
    },
  };
}

export function getPixiSafeAreaFromHudLayout(layoutOrResolved = {}) {
  const regions = layoutOrResolved.regions || layoutOrResolved.base?.regions || {};
  const reserve = regions.pixiPlayfieldReserve || {};
  const safe = layoutOrResolved.pixiSafeArea || {};
  return {
    top: sanitizeNumber(reserve.topReserve ?? safe.top ?? 0, { min: 0, max: 1000 }),
    bottom: sanitizeNumber(reserve.bottomReserve ?? safe.bottom ?? 0, { min: 0, max: 1000 }),
    left: sanitizeNumber(reserve.leftReserve ?? safe.left ?? 0, { min: 0, max: 1000 }),
    right: sanitizeNumber(reserve.rightReserve ?? safe.right ?? 0, { min: 0, max: 1000 }),
  };
}

function px(value) {
  return `${sanitizeNumber(value)}px`;
}

export function getHudLayoutCssVars(region = {}) {
  const vars = {
    "--hud-region-x": px(region.x || 0),
    "--hud-region-y": px(region.y || 0),
  };
  if (region.width != null) vars["--hud-region-width"] = px(region.width);
  if (region.height != null) vars["--hud-region-height"] = px(region.height);
  if (region.minWidth != null) vars["--hud-region-min-width"] = px(region.minWidth);
  if (region.maxWidth != null) vars["--hud-region-max-width"] = px(region.maxWidth);
  if (region.minHeight != null) vars["--hud-region-min-height"] = px(region.minHeight);
  if (region.maxHeight != null) vars["--hud-region-max-height"] = px(region.maxHeight);
  if (region.zIndex != null) vars["--hud-region-z"] = sanitizeNumber(region.zIndex, { min: -1, max: 1000 });
  if (region.scale != null) vars["--hud-region-scale"] = sanitizeNumber(region.scale, { min: 0.2, max: 4, fallback: 1 });
  if (region.opacity != null) vars["--hud-region-opacity"] = sanitizeNumber(region.opacity, { min: 0, max: 1, fallback: 1 });
  if (region.rotation != null) vars["--hud-region-rotation"] = `${sanitizeNumber(region.rotation, { min: -360, max: 360 })}deg`;
  if (region.offset != null) vars["--hud-dock-offset"] = px(region.offset);
  if (region.thickness != null) vars["--hud-dock-thickness"] = px(region.thickness);
  if (region.reserve != null) vars["--hud-dock-reserve"] = px(region.reserve);
  if (region.topReserve != null) vars["--hud-safe-top"] = px(region.topReserve);
  if (region.bottomReserve != null) vars["--hud-safe-bottom"] = px(region.bottomReserve);
  if (region.leftReserve != null) vars["--hud-safe-left"] = px(region.leftReserve);
  if (region.rightReserve != null) vars["--hud-safe-right"] = px(region.rightReserve);
  return vars;
}

export function getHudRegionRuntimeStyle(region = {}) {
  const vars = getHudLayoutCssVars(region);
  const style = { ...vars };
  if (region.visible === false) style.display = "none";
  if (region.zIndex != null) style.zIndex = vars["--hud-region-z"];
  if (region.maxWidth != null) style.maxWidth = vars["--hud-region-max-width"];
  if (region.width != null) style.width = vars["--hud-region-width"];
  if (region.height != null) style.height = vars["--hud-region-height"];
  if (region.opacity != null) style.opacity = vars["--hud-region-opacity"];
  if (region.minWidth != null) style.minWidth = vars["--hud-region-min-width"];
  if (region.minHeight != null) style.minHeight = vars["--hud-region-min-height"];
  return style;
}

function validateRegion(region, path, errors) {
  if (!isPlainObject(region)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!LAYOUT_MODES.has(region.mode)) errors.push(`${path}.mode must be one of ${Array.from(LAYOUT_MODES).join(", ")}`);
  if (region.anchor && !ANCHORS.has(region.anchor)) errors.push(`${path}.anchor is not supported`);
  for (const key of ["x", "y", "width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight", "zIndex", "topReserve", "bottomReserve", "leftReserve", "rightReserve", "offset", "thickness", "reserve", "scale", "opacity", "rotation"]) {
    if (region[key] != null && !Number.isFinite(Number(region[key]))) errors.push(`${path}.${key} must be numeric`);
  }
}

export function validateHudLayout(layout, {
  knownRegionIds = null,
  knownGameIds = null,
  source = "repo",
} = {}) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(layout)) {
    return { valid: false, errors: ["layout must be an object"], warnings };
  }
  if (layout.schemaVersion !== HUD_LAYOUT_SCHEMA_VERSION) errors.push(`schemaVersion must be ${HUD_LAYOUT_SCHEMA_VERSION}`);
  if (!layout.gameId) errors.push("gameId is required");
  if (knownGameIds && layout.gameId && !knownGameIds.includes(layout.gameId)) errors.push(`unknown gameId ${layout.gameId}`);
  if (!isPlainObject(layout.base?.regions)) errors.push("base.regions is required");

  const checkRegionId = (regionId, path) => {
    if (!knownRegionIds || knownRegionIds.includes(regionId)) return;
    const message = `${path} uses unknown region id ${regionId}`;
    if (source === "repo") errors.push(message);
    else warnings.push(message);
  };

  for (const [regionId, region] of Object.entries(layout.base?.regions || {})) {
    checkRegionId(regionId, `base.regions.${regionId}`);
    validateRegion(region, `base.regions.${regionId}`, errors);
  }
  for (const [profileId, profile] of Object.entries(layout.profiles || {})) {
    if (!isPlainObject(profile.match)) warnings.push(`profiles.${profileId}.match is missing; fallback matching will still be deterministic`);
    for (const [regionId, region] of Object.entries(profile.regions || {})) {
      checkRegionId(regionId, `profiles.${profileId}.regions.${regionId}`);
      validateRegion({ ...(layout.base?.regions?.[regionId] || {}), ...region }, `profiles.${profileId}.regions.${regionId}`, errors);
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function createHudLayoutExport({ gameId, layout, layouts = null, appVersion = "", buildId = "" } = {}) {
  const games = layouts || (gameId && layout ? { [gameId]: layout } : {});
  return {
    schemaVersion: HUD_LAYOUT_SCHEMA_VERSION,
    layoutVersion: "export",
    exportedAt: new Date().toISOString(),
    appVersion,
    buildId,
    games: clone(games),
  };
}

export function validateHudLayoutExport(exported, options = {}) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(exported)) return { valid: false, errors: ["export must be an object"], warnings };
  if (exported.schemaVersion !== HUD_LAYOUT_SCHEMA_VERSION) errors.push(`schemaVersion must be ${HUD_LAYOUT_SCHEMA_VERSION}`);
  const games = exported.games || (exported.gameId ? { [exported.gameId]: exported } : null);
  if (!isPlainObject(games) || !Object.keys(games).length) errors.push("export.games is required");
  for (const [gameId, layout] of Object.entries(games || {})) {
    if (options.knownGameIds && !options.knownGameIds.includes(gameId)) errors.push(`unknown exported gameId ${gameId}`);
    const result = validateHudLayout(layout, { ...options, source: options.source || "import" });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
  return { valid: errors.length === 0, errors, warnings };
}
