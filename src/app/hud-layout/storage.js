export const HUD_EDITOR_ENABLED_KEY = "ccgh:hud-editor-enabled";
export const HUD_LAYOUT_OVERRIDES_KEY = "ccgh:hud-layout-overrides:v1";
export const HUD_PREVIEW_PRESET_KEY = "ccgh:hud-preview-preset";

function canUseLocalStorage(storage = globalThis.localStorage) {
  return !!storage && typeof storage.getItem === "function" && typeof storage.setItem === "function";
}

export function readJsonStorage(key, fallback = null, storage = globalThis.localStorage) {
  if (!canUseLocalStorage(storage)) return fallback;
  try {
    const raw = storage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writeJsonStorage(key, value, storage = globalThis.localStorage) {
  if (!canUseLocalStorage(storage)) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorageValue(key, storage = globalThis.localStorage) {
  if (!storage || typeof storage.removeItem !== "function") return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function readStorageValue(key, fallback = null, storage = globalThis.localStorage) {
  if (!storage || typeof storage.getItem !== "function") return fallback;
  try {
    return storage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeStorageValue(key, value, storage = globalThis.localStorage) {
  if (!storage || typeof storage.setItem !== "function") return false;
  try {
    storage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}
