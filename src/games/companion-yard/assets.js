import { assetUrl, loadRuntimeAssetManifest, runtimeAssetSrc } from "../../game-runtime/assetBundles.js";

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

function splitManifests(manifest, runtimeManifest) {
  if (manifest?.manual || manifest?.runtime) {
    return {
      manual: manifest.manual || null,
      runtime: runtimeManifest || manifest.runtime || null,
    };
  }
  return { manual: manifest || null, runtime: runtimeManifest || null };
}

export function companionYardRuntimeAssetKey(type, id) {
  return `companionYard.${cleanId(type)}.${cleanId(id)}`;
}

export function resolveCompanionYardAsset(manifest, type, id, runtimeManifest = null) {
  const { manual, runtime } = splitManifests(manifest, runtimeManifest);
  const companionYard = manual?.graphics?.games?.companionYard || {};
  const bucket = companionYard?.[type];

  if (bucket && typeof bucket === "object" && !Array.isArray(bucket)) {
    const mapped = bucket[id];
    if (typeof mapped === "string" && mapped.trim()) return mapped;
  }

  if (typeof bucket === "string" && bucket.trim()) {
    return joinAssetPath(bucket, id);
  }

  const generated = runtimeAssetSrc(runtime, companionYardRuntimeAssetKey(type, id));
  if (generated) return generated;

  return assetUrl(companionYardFallbackAssetPath(type, id));
}

export async function loadCompanionYardManifest(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") return null;
  const [manual, runtime] = await Promise.all([
    fetchImpl("/assets/manifest.json", { cache: "no-cache" })
      .then((response) => (response?.ok ? response.json() : null))
      .catch(() => null),
    loadRuntimeAssetManifest(fetchImpl),
  ]);
  return { manual, runtime };
}
