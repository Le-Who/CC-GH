import PixiGameHost from "./PixiGameHost.jsx";
import {
  buildBloxScene,
  buildBubboScene,
  buildFarmScene,
  buildMatch3Scene,
  buildMergeScene,
} from "./scenes.js";

const SCENE_BUILDERS = {
  farm: buildFarmScene,
  blox: buildBloxScene,
  match3: buildMatch3Scene,
  bubbo: buildBubboScene,
  merge: buildMergeScene,
};

export default function LazyPixiSceneHost({ sceneKey, sceneState }) {
  const buildScene = SCENE_BUILDERS[sceneKey];
  if (!buildScene) {
    return <div className="loading-panel">Unknown game runtime</div>;
  }
  return <PixiGameHost sceneKey={sceneKey} buildScene={buildScene} sceneState={sceneState} />;
}
