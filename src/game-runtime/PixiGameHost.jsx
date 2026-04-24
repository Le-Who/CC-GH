import React, { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { setGameGestureActive } from "../platform/telegram.js";

export default function PixiGameHost({ sceneKey, buildScene, sceneState, className = "" }) {
  const containerRef = useRef(null);
  const appRef = useRef(null);
  const sceneRef = useRef(null);
  const stateRef = useRef(sceneState);
  const [failed, setFailed] = useState(false);

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
          app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
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
      app?.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
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
      onPointerLeave={() => setGameGestureActive(false)}
    >
      {failed && <div className="pixi-fallback">Renderer unavailable</div>}
    </div>
  );
}
