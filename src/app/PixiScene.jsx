import React from "react";
import { RotateCcw, Zap } from "lucide-react";
import { PanelButton } from "./shell.jsx";
import { AppI18nContext, useAppI18n } from "./i18n.jsx";
const loadPixiSceneHost = () => import("../game-runtime/LazyPixiSceneHost.jsx");
const LazyPixiSceneHost = React.lazy(loadPixiSceneHost);
export function preloadPixiSceneHost() {
  return loadPixiSceneHost();
}
export class GameLoadBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Game chunk failed to load", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <AppI18nContext.Consumer>
        {({ t }) => (
          <div className="loading-panel game-load-error">
            <strong>{t("app.gameLoadErrorTitle")}</strong>
            <span>{t("app.gameLoadErrorBody")}</span>
            <div className="button-row">
              <PanelButton icon={RotateCcw} onClick={() => this.setState({ failed: false })}>{t("common.retry")}</PanelButton>
              <PanelButton icon={Zap} subtle onClick={() => window.location.reload()}>{t("common.refresh")}</PanelButton>
            </div>
          </div>
        )}
      </AppI18nContext.Consumer>
    );
  }
}

export function PixiScene({ sceneKey, sceneState }) {
  const { t } = useAppI18n();
  return (
    <GameLoadBoundary key={sceneKey}>
      <React.Suspense fallback={<div className="loading-panel">{t("app.loadingGameRuntime")}</div>}>
        <LazyPixiSceneHost sceneKey={sceneKey} sceneState={sceneState} />
      </React.Suspense>
    </GameLoadBoundary>
  );
}
