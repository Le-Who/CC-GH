import { Assets } from "pixi.js";
import {
  GAME_ASSET_BUNDLES,
  loadRuntimeAssetManifest,
  resolveAssetSourceList,
} from "./assetBundles.js";

const warming = new Map();
const registeredBundles = new Set();
const expandedBundleKeys = new WeakMap();
const DEFERRED_SCENE_BUNDLES = new Set(["merge"]);

function sceneBundleKeys(sceneKey, manifest) {
  const manifestBundle = manifest?.bundles?.[`pixi.${sceneKey}`];
  if (typeof manifestBundle === "string") {
    if (!manifest || typeof manifest !== "object") return [];
    const cacheKey = `pixi.${sceneKey}:${manifestBundle}`;
    let cache = expandedBundleKeys.get(manifest);
    if (!cache) {
      cache = new Map();
      expandedBundleKeys.set(manifest, cache);
    } else if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const keys = Object.keys(manifest.assets || {}).filter((key) => key.startsWith(manifestBundle));
    cache.set(cacheKey, keys);
    return keys;
  }
  return manifestBundle || GAME_ASSET_BUNDLES[sceneKey] || [];
}

function pixiBundleAssets(sceneKey, manifest) {
  return sceneBundleKeys(sceneKey, manifest).map((key) => ({
    alias: key,
    src: resolveAssetSourceList(key, manifest),
  }));
}

export function warmPixiAssetBundle(sceneKey, options = {}) {
  const force = options.force === true;
  if (!force && DEFERRED_SCENE_BUNDLES.has(sceneKey)) return Promise.resolve(null);
  if (!warming.has(sceneKey)) {
    warming.set(sceneKey, loadRuntimeAssetManifest().then((manifest) => {
      const assets = pixiBundleAssets(sceneKey, manifest);
      if (!assets.length) return null;
      const bundleName = `ccgh.${sceneKey}`;
      if (!registeredBundles.has(bundleName)) {
        Assets.addBundle(bundleName, assets);
        registeredBundles.add(bundleName);
      }
      return Assets.loadBundle(bundleName);
    }).catch(() => null));
  }
  return warming.get(sceneKey);
}
