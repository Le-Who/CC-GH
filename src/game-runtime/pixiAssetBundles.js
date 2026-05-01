import { Assets } from "pixi.js";
import {
  GAME_ASSET_BUNDLES,
  loadRuntimeAssetManifest,
  resolveAssetSourceList,
} from "./assetBundles.js";

const warming = new Map();
const registeredBundles = new Set();

function sceneBundleKeys(sceneKey, manifest) {
  return manifest?.bundles?.[`pixi.${sceneKey}`] || GAME_ASSET_BUNDLES[sceneKey] || [];
}

function pixiBundleAssets(sceneKey, manifest) {
  return sceneBundleKeys(sceneKey, manifest).map((key) => ({
    alias: key,
    src: resolveAssetSourceList(key, manifest),
  }));
}

export function warmPixiAssetBundle(sceneKey) {
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
