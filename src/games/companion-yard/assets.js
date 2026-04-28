const COMPANION_YARD_ROOT = "/games/companion-yard";

function cleanId(id) {
  return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "");
}

function joinAssetPath(prefix, id) {
  const safeId = cleanId(id);
  const base = String(prefix || "").replace(/\/+$/, "");
  return `${base}/${safeId}.png`;
}

export function companionYardFallbackAssetPath(type, id) {
  return joinAssetPath(`${COMPANION_YARD_ROOT}/${cleanId(type)}`, id);
}

export function resolveCompanionYardAsset(manifest, type, id) {
  const companionYard = manifest?.graphics?.games?.companionYard || {};
  const bucket = companionYard?.[type];

  if (bucket && typeof bucket === "object" && !Array.isArray(bucket)) {
    const mapped = bucket[id];
    if (typeof mapped === "string" && mapped.trim()) return mapped;
  }

  if (typeof bucket === "string" && bucket.trim()) {
    return joinAssetPath(bucket, id);
  }

  return companionYardFallbackAssetPath(type, id);
}

export async function loadCompanionYardManifest(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") return null;
  try {
    const response = await fetchImpl("/assets/manifest.json", { cache: "no-cache" });
    if (!response?.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
