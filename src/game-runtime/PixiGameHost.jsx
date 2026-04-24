import React, { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { setGameGestureActive } from "../platform/telegram.js";
import { warmPixiAssetBundle } from "./assetBundles.js";

function destroyPixiApp(app) {
  if (!app) return;
  try {
    app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
  } catch (err) {
    console.warn("Pixi app destroy skipped", err);
  }
}

export default function PixiGameHost({ sceneKey, buildScene, sceneState, className = "" }) {
  const containerRef = useRef(null);
  const appRef = useRef(null);
  const sceneRef = useRef(null);
  const stateRef = useRef(sceneState);
  const activePointerRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const release = () => {
      activePointerRef.current = null;
      setGameGestureActive(false);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
      document.removeEventListener("visibilitychange", release);
    };
  }, []);

  const beginGesture = (event) => {
    activePointerRef.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is best effort in older embedded browsers.
    }
    setGameGestureActive(true);
  };

  const endGesture = (event) => {
    if (activePointerRef.current !== null && activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Releasing an already released pointer is harmless.
    }
    setGameGestureActive(false);
  };

  useEffect(() => {
    let app = null;
    let cancelled = false;

    async function mount() {
      if (!containerRef.current) return;
      try {
        setFailed(false);
        app = new Application();
        await app.init({
          resizeTo: containerRef.current,
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: Math.min(window.devicePixelRatio || 1, 2),
          preference: "webgl",
          powerPreference: "high-performance",
        });
        app.ticker.maxFPS = 60;
        if (cancelled) {
          destroyPixiApp(app);
          return;
        }
        appRef.current = app;
        containerRef.current.appendChild(app.canvas);
        await warmPixiAssetBundle(sceneKey);
        if (cancelled) {
          destroyPixiApp(app);
          return;
        }
        sceneRef.current = buildScene(app, stateRef.current);
        sceneRef.current?.update?.(stateRef.current);
      } catch (err) {
        console.error(`Pixi scene ${sceneKey} failed`, err);
        setFailed(true);
      }
    }

    mount();
    return () => {
      cancelled = true;
      sceneRef.current?.destroy?.();
      sceneRef.current = null;
      appRef.current = null;
      destroyPixiApp(app);
      setGameGestureActive(false);
    };
  }, [sceneKey, buildScene]);

  useEffect(() => {
    stateRef.current = sceneState;
    sceneRef.current?.update?.(sceneState);
  }, [sceneState]);

  return (
    <div
      ref={containerRef}
      className={`pixi-host ${className}`}
      data-no-nav-swipe="true"
      onPointerDown={beginGesture}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      {failed && <div className="pixi-fallback">Renderer unavailable</div>}
    </div>
  );
}
