import { Assets } from "pixi.js";

export const GAME_ASSET_BUNDLES = {
  bubbo: [
    "/games/bubbo-bubbo/images/background-tile.png",
    "/games/bubbo-bubbo/images/bubble-blue.png",
    "/games/bubbo-bubbo/images/bubble-green.png",
    "/games/bubbo-bubbo/images/bubble-red.png",
    "/games/bubbo-bubbo/images/bubble-yellow.png",
    "/games/bubbo-bubbo/images/cannon-main.png",
  ],
  match3: [
    "/games/puzzling-potions/images/piece-dragon.png",
    "/games/puzzling-potions/images/piece-frog.png",
    "/games/puzzling-potions/images/piece-newt.png",
    "/games/puzzling-potions/images/piece-snake.png",
    "/games/puzzling-potions/images/piece-spider.png",
    "/games/puzzling-potions/images/piece-yeti.png",
    "/games/puzzling-potions/images/shelf-block.png",
    "/games/puzzling-potions/images/special-blast.png",
    "/games/puzzling-potions/images/special-column.png",
    "/games/puzzling-potions/images/special-colour.png",
    "/games/puzzling-potions/images/special-row.png",
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
