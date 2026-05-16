import { VISIBLE_GAME_IDS } from "../src/app/gameRegistry.js";
import {
  EXACT_PREVIEW_PRESETS,
  semanticProfileForPreviewPreset,
} from "../src/app/hud-layout/profiles.js";
import { HUD_LAYOUT_DEFAULTS } from "../src/app/hud-layout/defaultLayouts/index.js";
import { hudLayoutRegistry } from "../src/app/hud-layout/registry.js";
import {
  createHudLayoutExport,
  getPixiSafeAreaFromHudLayout,
  resolveHudLayout,
  validateHudLayout,
  validateHudLayoutExport,
} from "../src/app/hud-layout/resolver.js";

const errors = [];
const warnings = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

function validateProfiles(gameId, layout) {
  check(layout.profiles?.["phone-default-portrait"], `${gameId}: missing phone-default-portrait profile`);
  check(layout.profiles?.["phone-landscape"], `${gameId}: missing phone-landscape profile`);
  for (const [profileId, profile] of Object.entries(layout.profiles || {})) {
    check(profile.match?.orientation === "portrait" || profile.match?.orientation === "landscape", `${gameId}.${profileId}: profile must declare portrait or landscape orientation`);
    if (profile.match?.minAspectRatio != null || profile.match?.maxAspectRatio != null) {
      check(Number.isFinite(Number(profile.match.minAspectRatio ?? profile.match.maxAspectRatio)), `${gameId}.${profileId}: aspect-ratio constraints must be numeric`);
    }
  }
}

function validateFallbacks(gameId, layout) {
  const portrait = resolveHudLayout({ repoLayout: layout, viewport: { width: 390, height: 844, orientation: "portrait", aspectRatio: 390 / 844 } });
  const landscape = resolveHudLayout({ repoLayout: layout, viewport: { width: 844, height: 390, orientation: "landscape", aspectRatio: 844 / 390 } });
  check(portrait.activeProfileId.includes("portrait"), `${gameId}: portrait viewport resolved to ${portrait.activeProfileId}`);
  check(landscape.activeProfileId.includes("landscape"), `${gameId}: landscape viewport resolved to ${landscape.activeProfileId}`);
  check(Object.keys(portrait.regions || {}).length > 0, `${gameId}: portrait merge produced no regions`);
  check(Object.keys(landscape.regions || {}).length > 0, `${gameId}: landscape merge produced no regions`);
}

function validatePixiReserves(gameId, layout) {
  if (!layout.base?.regions?.pixiPlayfieldReserve) return;
  const portrait = getPixiSafeAreaFromHudLayout(resolveHudLayout({ repoLayout: layout, viewport: { width: 390, height: 844 } }));
  const landscape = getPixiSafeAreaFromHudLayout(resolveHudLayout({ repoLayout: layout, viewport: { width: 844, height: 390 } }));
  check([portrait.top, portrait.bottom, portrait.left, portrait.right, landscape.top, landscape.bottom, landscape.left, landscape.right].every((value) => Number.isFinite(value) && value >= 0), `${gameId}: Pixi reserve values must be finite non-negative numbers`);
  warn(JSON.stringify(portrait) !== JSON.stringify(landscape), `${gameId}: Pixi reserves do not differ between portrait and landscape`);
}

for (const gameId of VISIBLE_GAME_IDS) {
  const layout = HUD_LAYOUT_DEFAULTS[gameId];
  check(!!layout, `${gameId}: missing default layout`);
  if (!layout) continue;
  const result = validateHudLayout(layout, {
    knownRegionIds: hudLayoutRegistry.allRegionIds,
    knownGameIds: VISIBLE_GAME_IDS,
    source: "repo",
  });
  errors.push(...result.errors.map((error) => `${gameId}: ${error}`));
  warnings.push(...result.warnings.map((warning) => `${gameId}: ${warning}`));
  check(layout.gameId === gameId, `${gameId}: gameId mismatch (${layout.gameId})`);
  check(Object.keys(layout.base?.regions || {}).length > 0, `${gameId}: missing base regions`);
  validateProfiles(gameId, layout);
  validateFallbacks(gameId, layout);
  validatePixiReserves(gameId, layout);
}

for (const preset of EXACT_PREVIEW_PRESETS) {
  check(!!semanticProfileForPreviewPreset(preset.id), `preview preset ${preset.id}: no semantic profile mapping`);
}

const exported = createHudLayoutExport({
  layouts: Object.fromEntries(VISIBLE_GAME_IDS.map((gameId) => [gameId, HUD_LAYOUT_DEFAULTS[gameId]])),
  appVersion: "validate",
});
const exportResult = validateHudLayoutExport(exported, {
  knownRegionIds: hudLayoutRegistry.allRegionIds,
  knownGameIds: VISIBLE_GAME_IDS,
  source: "repo",
});
errors.push(...exportResult.errors.map((error) => `export: ${error}`));
warnings.push(...exportResult.warnings.map((warning) => `export: ${warning}`));

if (warnings.length) {
  console.warn("[hud-layout] warnings:");
  for (const warning of warnings) console.warn(`- ${warning}`);
}

if (errors.length) {
  console.error("[hud-layout] validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[hud-layout] validated ${VISIBLE_GAME_IDS.length} visible game layouts and ${EXACT_PREVIEW_PRESETS.length} preview presets`);
