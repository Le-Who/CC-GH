import React from "react";
import { RotateCcw, Zap } from "lucide-react";
import { PanelButton } from "./shell.jsx";
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
      <div className="loading-panel game-load-error">
        <strong>Game assets did not finish loading.</strong>
        <span>Check the connection, retry, or refresh to pick up the latest app version.</span>
        <div className="button-row">
          <PanelButton icon={RotateCcw} onClick={() => this.setState({ failed: false })}>Retry</PanelButton>
          <PanelButton icon={Zap} subtle onClick={() => window.location.reload()}>Refresh</PanelButton>
        </div>
      </div>
    );
  }
}

export function PixiScene({ sceneKey, sceneState }) {
  return (
    <GameLoadBoundary key={sceneKey}>
      <React.Suspense fallback={<div className="loading-panel">Loading game runtime</div>}>
        <LazyPixiSceneHost sceneKey={sceneKey} sceneState={sceneState} />
      </React.Suspense>
    </GameLoadBoundary>
  );
}

