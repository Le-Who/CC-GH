import React, { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { setGameGestureActive } from "../platform/telegram.js";

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
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const release = () => setGameGestureActive(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);

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
          antialias: false,
          autoDensity: true,
          preference: "webgl",
          powerPreference: "high-performance",
        });
        if (cancelled) {
          destroyPixiApp(app);
          return;
        }
        appRef.current = app;
        containerRef.current.appendChild(app.canvas);
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
      onPointerDown={() => setGameGestureActive(true)}
      onPointerUp={() => setGameGestureActive(false)}
      onPointerCancel={() => setGameGestureActive(false)}
    >
      {failed && <div className="pixi-fallback">Renderer unavailable</div>}
    </div>
  );
}
