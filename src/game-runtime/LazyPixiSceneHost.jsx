import React, { useEffect, useState } from "react";
import { useAppI18n } from "../app/i18n.jsx";

const SCENE_RUNTIME_LOADERS = {
  farm: () => Promise.all([
    import("./PixiGameHost.jsx"),
    import("./scenes/farmScene.js"),
  ]).then(([host, scene]) => ({ PixiGameHost: host.default, buildScene: scene.buildFarmScene })),
  blox: () => Promise.all([
    import("./PixiGameHost.jsx"),
    import("./scenes/bloxScene.js"),
  ]).then(([host, scene]) => ({ PixiGameHost: host.default, buildScene: scene.buildBloxScene })),
  match3: () => Promise.all([
    import("./PixiGameHost.jsx"),
    import("./scenes/match3Scene.js"),
  ]).then(([host, scene]) => ({ PixiGameHost: host.default, buildScene: scene.buildMatch3Scene })),
  bubbo: () => Promise.all([
    import("./PixiGameHost.jsx"),
    import("./scenes/bubboScene.js"),
  ]).then(([host, scene]) => ({ PixiGameHost: host.default, buildScene: scene.buildBubboScene })),
  merge: () => Promise.all([
    import("./PixiGameHost.jsx"),
    import("./scenes/mergeScene.js"),
  ]).then(([host, scene]) => ({ PixiGameHost: host.default, buildScene: scene.buildMergeScene })),
};

const runtimeCache = new Map();

export function preloadPixiSceneRuntime(sceneKey) {
  const loader = SCENE_RUNTIME_LOADERS[sceneKey];
  if (!loader) return Promise.resolve(null);
  if (!runtimeCache.has(sceneKey)) {
    runtimeCache.set(sceneKey, loader());
  }
  return runtimeCache.get(sceneKey);
}

export default function LazyPixiSceneHost({ sceneKey, sceneState }) {
  const { t } = useAppI18n();
  const [runtime, setRuntime] = useState(null);
  const [failed, setFailed] = useState(false);
  const canLoadScene = !!SCENE_RUNTIME_LOADERS[sceneKey];

  useEffect(() => {
    let cancelled = false;
    setRuntime(null);
    setFailed(false);
    preloadPixiSceneRuntime(sceneKey)
      .then((nextRuntime) => {
        if (!cancelled) setRuntime(nextRuntime);
      })
      .catch((err) => {
        console.error(`Pixi runtime ${sceneKey} failed to load`, err);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sceneKey]);

  if (!canLoadScene) {
    return <div className="loading-panel">{t("app.unknownGameRuntime")}</div>;
  }
  if (failed) {
    return <div className="loading-panel game-load-error">{t("app.gameLoadErrorTitle")}</div>;
  }
  if (!runtime) {
    return <div className="loading-panel">{t("app.loadingGameRuntime")}</div>;
  }
  const PixiGameHost = runtime.PixiGameHost;
  return <PixiGameHost sceneKey={sceneKey} buildScene={runtime.buildScene} sceneState={sceneState} />;
}
