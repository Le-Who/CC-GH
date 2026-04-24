import React, { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { setGameGestureActive } from "../platform/telegram.js";

export default function PixiGameHost({ sceneKey, buildScene, className = "" }) {
  const containerRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let app = null;
    let cleanupScene = null;
    let cancelled = false;

    async function mount() {
      if (!containerRef.current) return;
      try {
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
          app.destroy(true);
          return;
        }
        containerRef.current.appendChild(app.canvas);
        cleanupScene = buildScene(app);
      } catch (err) {
        console.error(`Pixi scene ${sceneKey} failed`, err);
        setFailed(true);
      }
    }

    mount();
    return () => {
      cancelled = true;
      cleanupScene?.();
      app?.destroy(true, { children: true, texture: true });
    };
  }, [sceneKey, buildScene]);

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
