import React from "react";
import { GameLoadBoundary, preloadPixiSceneHost } from "./PixiScene.jsx";
import { useAppI18n } from "./i18n.jsx";
import { openHome } from "./homeNavigation.js";
// Only these current game presentations use Pixi. Bubbo v2 uses Canvas 2D;
// Merge v3 uses DOM. Legacy Merge still loads Pixi lazily when it renders.
export const PIXI_TABS = new Set(["blox", "match3"]);
const gameLoaders = {
  garden: () => import("../games/garden-shelf/GardenShelfGame"),
  blox: () => import("../games/blox/BloxGame.jsx"),
  match3: () => import("../games/match3/Match3Game.jsx"),
  merge: () => import("../games/merge/MergeGame.jsx"),
  bubbo: () => import("../games/bubbo/BubboGame.jsx"),
  trivia: () => import("../games/trivia/TriviaGame.jsx"),
  room: () => import("../games/companion-yard-v2/YardReleaseGame.jsx"),
  settlement: () => import("../games/settlement/SettlementGame.jsx"),
};
const gameComponents = Object.fromEntries(
  Object.entries(gameLoaders).map(([tabId, loader]) => [tabId, React.lazy(loader)]),
);
export function preloadGameTab(tabId) {
  gameLoaders[tabId]?.();
  if (PIXI_TABS.has(tabId)) preloadPixiSceneHost(tabId);
}
// Deliberately art-free: the game owns its artwork once its lazy module is ready.
// Never reuse the former Hub panel/button skins as a loading placeholder.
export function GameEntryFallback({ label, onRetry = null }) {
  const { t } = useAppI18n();
  return <div className="game-entry-status" role="status" aria-live="polite">
    <span>{label}</span>
    <div className="game-entry-actions">
      {onRetry && <button type="button" onClick={onRetry}>{t("common.retry")}</button>}
      <button type="button" onClick={openHome}>{t("nav.allGames")}</button>
    </div>
  </div>;
}
export function ActiveGame({ activeTab }) {
  const { t } = useAppI18n();
  const GameComponent = gameComponents[activeTab] || gameComponents.room;
  return (
    <GameLoadBoundary key={activeTab}>
      <React.Suspense fallback={<GameEntryFallback label={t("app.loadingGame")} />}>
        <GameComponent />
      </React.Suspense>
    </GameLoadBoundary>
  );
}
