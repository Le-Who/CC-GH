import React from "react";
import { GameLoadBoundary, preloadPixiSceneHost } from "./PixiScene.jsx";
import { useAppI18n } from "./i18n.jsx";
export const PIXI_TABS = new Set(["blox", "match3", "merge", "bubbo"]);
const gameLoaders = {
  garden: () => import("../games/garden-shelf/GardenShelfGame"),
  blox: () => import("../games/blox/BloxGame.jsx"),
  match3: () => import("../games/match3/Match3Game.jsx"),
  merge: () => import("../games/merge/MergeGame.jsx"),
  bubbo: () => import("../games/bubbo/BubboGame.jsx"),
  trivia: () => import("../games/trivia/TriviaGame.jsx"),
  room: () => import("../games/companion-yard/CompanionYardGame.jsx"),
};
const gameComponents = Object.fromEntries(
  Object.entries(gameLoaders).map(([tabId, loader]) => [tabId, React.lazy(loader)]),
);
export function preloadGameTab(tabId) {
  gameLoaders[tabId]?.();
  if (PIXI_TABS.has(tabId)) preloadPixiSceneHost();
}
export function ActiveGame({ activeTab }) {
  const { t } = useAppI18n();
  const GameComponent = gameComponents[activeTab] || gameComponents.room;
  return (
    <GameLoadBoundary key={activeTab}>
      <React.Suspense fallback={<div className="loading-panel">{t("app.loadingGame")}</div>}>
        <GameComponent />
      </React.Suspense>
    </GameLoadBoundary>
  );
}
