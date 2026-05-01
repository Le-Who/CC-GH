import PixiGameHost from "./PixiGameHost.jsx";
import { useAppI18n } from "../app/i18n.jsx";
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
  const { t } = useAppI18n();
  const buildScene = SCENE_BUILDERS[sceneKey];
  if (!buildScene) {
    return <div className="loading-panel">{t("app.unknownGameRuntime")}</div>;
  }
  return <PixiGameHost sceneKey={sceneKey} buildScene={buildScene} sceneState={sceneState} />;
}
