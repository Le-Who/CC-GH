export const HUD_PROFILE_DEFINITIONS = [
  {
    id: "phone-small-portrait",
    label: "Phone small portrait",
    match: { orientation: "portrait", maxWidth: 360 },
    fallbackRank: 10,
  },
  {
    id: "phone-tall-portrait",
    label: "Phone tall portrait",
    match: { orientation: "portrait", maxWidth: 430, minHeight: 880 },
    fallbackRank: 20,
  },
  {
    id: "phone-default-portrait",
    label: "Phone default portrait",
    match: { orientation: "portrait", maxWidth: 430 },
    fallbackRank: 30,
  },
  {
    id: "tablet-portrait",
    label: "Tablet portrait",
    match: { orientation: "portrait", minWidth: 600 },
    fallbackRank: 40,
  },
  {
    id: "phone-landscape",
    label: "Phone landscape",
    match: { orientation: "landscape", maxHeight: 480 },
    fallbackRank: 50,
  },
  {
    id: "tablet-landscape",
    label: "Tablet landscape",
    match: { orientation: "landscape", minWidth: 760, maxWidth: 1099, maxHeight: 900 },
    fallbackRank: 60,
  },
  {
    id: "desktop-landscape",
    label: "Desktop landscape",
    match: { orientation: "landscape", minWidth: 1100 },
    fallbackRank: 70,
  },
];

export const EXACT_PREVIEW_PRESETS = [
  { id: "320x568", label: "320x568 portrait", width: 320, height: 568 },
  { id: "568x320", label: "568x320 landscape", width: 568, height: 320 },
  { id: "390x844", label: "390x844 portrait", width: 390, height: 844 },
  { id: "844x390", label: "844x390 landscape", width: 844, height: 390 },
  { id: "414x896", label: "414x896 portrait", width: 414, height: 896 },
  { id: "896x414", label: "896x414 landscape", width: 896, height: 414 },
  { id: "768x1024", label: "768x1024 tablet portrait", width: 768, height: 1024 },
  { id: "1024x768", label: "1024x768 tablet landscape", width: 1024, height: 768 },
  { id: "1280x720", label: "1280x720 desktop landscape", width: 1280, height: 720 },
];

const PROFILE_BY_ID = Object.fromEntries(HUD_PROFILE_DEFINITIONS.map((profile) => [profile.id, profile]));
const PRESET_BY_ID = Object.fromEntries(EXACT_PREVIEW_PRESETS.map((preset) => [preset.id, preset]));

function finiteNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function detectHudOrientation({ width, height } = {}) {
  const w = finiteNumber(width);
  const h = finiteNumber(height);
  return w >= h ? "landscape" : "portrait";
}

function matchesConstraint(value, min, max) {
  if (min != null && value < Number(min)) return false;
  if (max != null && value > Number(max)) return false;
  return true;
}

export function profileMatchesViewport(profile, viewport = {}) {
  if (!profile) return false;
  const width = Math.max(1, finiteNumber(viewport.width));
  const height = Math.max(1, finiteNumber(viewport.height));
  const orientation = viewport.orientation || detectHudOrientation({ width, height });
  const aspectRatio = finiteNumber(viewport.aspectRatio, width / height);
  const match = profile.match || {};
  if (match.orientation && match.orientation !== orientation) return false;
  return (
    matchesConstraint(width, match.minWidth, match.maxWidth) &&
    matchesConstraint(height, match.minHeight, match.maxHeight) &&
    matchesConstraint(aspectRatio, match.minAspectRatio, match.maxAspectRatio)
  );
}

function nearestSameOrientation(viewport = {}) {
  const width = Math.max(1, finiteNumber(viewport.width));
  const height = Math.max(1, finiteNumber(viewport.height));
  const orientation = viewport.orientation || detectHudOrientation({ width, height });
  const sameOrientation = HUD_PROFILE_DEFINITIONS.filter((profile) => profile.match?.orientation === orientation);
  if (!sameOrientation.length) return null;
  return sameOrientation
    .map((profile) => {
      const match = profile.match || {};
      const targetWidth = finiteNumber(match.maxWidth ?? match.minWidth, width);
      const targetHeight = finiteNumber(match.maxHeight ?? match.minHeight, height);
      const distance = Math.abs(width - targetWidth) + Math.abs(height - targetHeight) + (profile.fallbackRank || 0) * 0.01;
      return { profile, distance };
    })
    .sort((left, right) => left.distance - right.distance || left.profile.id.localeCompare(right.profile.id))[0]?.profile || null;
}

export function selectHudViewportProfile(viewport = {}, profiles = HUD_PROFILE_DEFINITIONS) {
  const width = Math.max(1, finiteNumber(viewport.width));
  const height = Math.max(1, finiteNumber(viewport.height));
  const normalized = {
    ...viewport,
    width,
    height,
    orientation: viewport.orientation || detectHudOrientation({ width, height }),
    aspectRatio: finiteNumber(viewport.aspectRatio, width / height),
  };
  const exact = profiles.find((profile) => profileMatchesViewport(profile, normalized));
  if (exact) return exact;
  const nearest = nearestSameOrientation(normalized);
  if (nearest) return nearest;
  return PROFILE_BY_ID["phone-default-portrait"];
}

export function semanticProfileForPreviewPreset(presetId) {
  const preset = PRESET_BY_ID[presetId];
  if (!preset) return null;
  return selectHudViewportProfile({
    width: preset.width,
    height: preset.height,
    orientation: detectHudOrientation(preset),
    aspectRatio: preset.width / preset.height,
  }).id;
}

export function parseCssPixelValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const trimmed = String(value || "").trim();
  if (!trimmed) return 0;
  if (/^-?\d+(\.\d+)?px$/.test(trimmed)) return Number(trimmed.slice(0, -2));
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  return 0;
}

export function readSafeAreaInsetsFromStyle(style) {
  const read = (name) => parseCssPixelValue(style?.getPropertyValue?.(name));
  return {
    top: read("--safe-top"),
    bottom: read("--safe-bottom"),
    left: read("--safe-left"),
    right: read("--safe-right"),
  };
}

export function readSafeAreaInsetsFromDocument(doc = globalThis.document) {
  if (!doc?.documentElement || typeof globalThis.getComputedStyle !== "function") {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  return readSafeAreaInsetsFromStyle(globalThis.getComputedStyle(doc.documentElement));
}

export function createHudViewportSnapshot({
  layoutWidth,
  layoutHeight,
  visualViewport = null,
  previewViewport = null,
  devicePixelRatio = 1,
  safeAreaInsets = { top: 0, bottom: 0, left: 0, right: 0 },
} = {}) {
  const baseWidth = Math.max(1, Math.round(finiteNumber(layoutWidth, 1)));
  const baseHeight = Math.max(1, Math.round(finiteNumber(layoutHeight, 1)));
  const profileWidth = Math.max(1, Math.round(finiteNumber(previewViewport?.width, baseWidth)));
  const profileHeight = Math.max(1, Math.round(finiteNumber(previewViewport?.height, baseHeight)));
  const orientation = detectHudOrientation({ width: profileWidth, height: profileHeight });
  const aspectRatio = profileWidth / profileHeight;
  const activeProfile = selectHudViewportProfile({ width: profileWidth, height: profileHeight, orientation, aspectRatio });
  const visualWidth = Math.max(1, Math.round(finiteNumber(visualViewport?.width, baseWidth)));
  const visualHeight = Math.max(1, Math.round(finiteNumber(visualViewport?.height, baseHeight)));
  const keyboardShrink = baseHeight - visualHeight;
  const keyboardLikelyVisible = orientation === "portrait" && keyboardShrink > Math.max(24, baseHeight * 0.03);
  return {
    width: profileWidth,
    height: profileHeight,
    layoutViewport: { width: baseWidth, height: baseHeight },
    visualViewport: {
      width: visualWidth,
      height: visualHeight,
      offsetTop: finiteNumber(visualViewport?.offsetTop),
      offsetLeft: finiteNumber(visualViewport?.offsetLeft),
    },
    previewViewport: previewViewport ? { width: profileWidth, height: profileHeight, id: previewViewport.id || "" } : null,
    orientation,
    aspectRatio,
    devicePixelRatio: finiteNumber(devicePixelRatio, 1),
    safeAreaInsets: {
      top: Math.max(0, finiteNumber(safeAreaInsets?.top)),
      bottom: Math.max(0, finiteNumber(safeAreaInsets?.bottom)),
      left: Math.max(0, finiteNumber(safeAreaInsets?.left)),
      right: Math.max(0, finiteNumber(safeAreaInsets?.right)),
    },
    keyboardLikelyVisible,
    activeProfileId: activeProfile.id,
  };
}

export function isHudEditorEnabled({ search = "", localStorageValue = null } = {}) {
  const params = new URLSearchParams(String(search || "").startsWith("?") ? String(search).slice(1) : String(search || ""));
  if (params.get("hudEditor") === "0") return false;
  if (params.get("hudEditor") === "1" || params.get("hudEditor") === "true") return true;
  return localStorageValue === "true" || localStorageValue === "1";
}

export function getPreviewPreset(presetId) {
  return PRESET_BY_ID[presetId] || null;
}
