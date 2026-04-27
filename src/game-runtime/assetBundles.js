import { Assets } from "pixi.js";

export function clientBuildId() {
  return globalThis.__APP_BUILD_ID__ || import.meta.env?.VITE_BUILD_ID || globalThis.__APP_VERSION__ || "";
}

export function assetUrl(path) {
  const buildId = clientBuildId();
  if (!buildId || !String(path).startsWith("/games/")) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}v=${encodeURIComponent(buildId)}`;
}

export const GAME_ASSET_BUNDLES = {
  bubbo: [
    assetUrl("/games/bubbo-bubbo/images/background-tile.png"),
    assetUrl("/games/bubbo-bubbo/images/bubble-blue.png"),
    assetUrl("/games/bubbo-bubbo/images/bubble-green.png"),
    assetUrl("/games/bubbo-bubbo/images/bubble-red.png"),
    assetUrl("/games/bubbo-bubbo/images/bubble-yellow.png"),
    assetUrl("/games/bubbo-bubbo/assets_bubbo_balls.png"),
    assetUrl("/games/bubbo-bubbo/images/bottom-tray.png"),
    assetUrl("/games/bubbo-bubbo/images/cannon-main.png"),
  ],
  match3: [
    assetUrl("/games/puzzling-potions/images/piece-dragon.png"),
    assetUrl("/games/puzzling-potions/images/piece-frog.png"),
    assetUrl("/games/puzzling-potions/images/piece-newt.png"),
    assetUrl("/games/puzzling-potions/images/piece-snake.png"),
    assetUrl("/games/puzzling-potions/images/piece-spider.png"),
    assetUrl("/games/puzzling-potions/images/piece-yeti.png"),
    assetUrl("/games/puzzling-potions/images/shelf-block.png"),
    assetUrl("/games/puzzling-potions/images/special-blast.png"),
    assetUrl("/games/puzzling-potions/images/special-column.png"),
    assetUrl("/games/puzzling-potions/images/special-colour.png"),
    assetUrl("/games/puzzling-potions/images/special-row.png"),
  ],
};

const warming = new Map();

export function warmPixiAssetBundle(sceneKey) {
  const assets = GAME_ASSET_BUNDLES[sceneKey];
  if (!assets?.length) return Promise.resolve();
  if (!warming.has(sceneKey)) {
    warming.set(sceneKey, Assets.load(assets).catch(() => null));
  }
  return warming.get(sceneKey);
}
