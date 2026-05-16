function clone(value) {
  if (value == null || typeof value !== "object") return value;
  return structuredClone(value);
}

function ensureGame(next, gameId) {
  next[gameId] ||= { profiles: {} };
  next[gameId].profiles ||= {};
  return next[gameId];
}

function ensureProfile(game, profileId) {
  game.profiles[profileId] ||= { regions: {} };
  game.profiles[profileId].regions ||= {};
  return game.profiles[profileId];
}

export function applyRegionPatch(overrides, gameId, profileId, regionId, patch) {
  const next = clone(overrides || {}) || {};
  const game = ensureGame(next, gameId);
  const profile = ensureProfile(game, profileId);
  profile.regions[regionId] = {
    ...(profile.regions[regionId] || {}),
    ...(patch || {}),
  };
  return next;
}

export function resetRegionOverride(overrides, gameId, profileId, regionId) {
  const next = clone(overrides || {}) || {};
  const regions = next[gameId]?.profiles?.[profileId]?.regions;
  if (regions) delete regions[regionId];
  return next;
}

export function resetProfileOverrides(overrides, gameId, profileId) {
  const next = clone(overrides || {}) || {};
  if (next[gameId]?.profiles) delete next[gameId].profiles[profileId];
  return next;
}

export function resetGameOverrides(overrides, gameId) {
  const next = clone(overrides || {}) || {};
  delete next[gameId];
  return next;
}

export function shouldRenderHudEditor({ enabled = false, editorEnabled = false } = {}) {
  return !!(enabled || editorEnabled);
}
