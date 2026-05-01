import React, { useEffect, useRef, useState } from "react";
import { Application } from "pixi.js";
import { useAppI18n } from "../app/i18n.jsx";
import { setGameGestureActive } from "../platform/telegram.js";
import { warmPixiAssetBundle } from "./pixiAssetBundles.js";

function destroyPixiApp(app) {
  if (!app) return;
  try {
    app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true });
  } catch (err) {
    console.warn("Pixi app destroy skipped", err);
  }
}

export default function PixiGameHost({ sceneKey, buildScene, sceneState, className = "" }) {
  const { t } = useAppI18n();
  const containerRef = useRef(null);
  const appRef = useRef(null);
  const sceneRef = useRef(null);
  const stateRef = useRef(sceneState);
  const activePointerRef = useRef(null);
  const captureTargetRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const release = () => {
      activePointerRef.current = null;
      captureTargetRef.current = null;
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

  useEffect(() => {
    let resizeFrame = 0;
    let lastWidth = 0;
    let lastHeight = 0;
    const syncSize = () => {
      window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        const app = appRef.current;
        const container = containerRef.current;
        if (!app || !container) return;
        const rect = container.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        if (width === lastWidth && height === lastHeight) return;
        lastWidth = width;
        lastHeight = height;
        app.renderer?.resize?.(width, height);
        if (typeof sceneRef.current?.resize === "function") {
          sceneRef.current.resize(stateRef.current);
        } else {
          sceneRef.current?.update?.(stateRef.current);
        }
        app.render?.();
      });
    };

    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(syncSize) : null;
    if (observer && containerRef.current) observer.observe(containerRef.current);
    window.addEventListener("resize", syncSize);
    window.visualViewport?.addEventListener?.("resize", syncSize);
    return () => {
      window.cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
      window.removeEventListener("resize", syncSize);
      window.visualViewport?.removeEventListener?.("resize", syncSize);
    };
  }, []);

  const beginGesture = (event) => {
    activePointerRef.current = event.pointerId;
    const target = typeof event.target?.setPointerCapture === "function" ? event.target : event.currentTarget;
    captureTargetRef.current = target;
    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture is best effort in older embedded browsers.
    }
    setGameGestureActive(true);
  };

  const endGesture = (event) => {
    if (activePointerRef.current !== null && activePointerRef.current !== event.pointerId) return;
    activePointerRef.current = null;
    const target = captureTargetRef.current || event.currentTarget;
    captureTargetRef.current = null;
    try {
      target.releasePointerCapture?.(event.pointerId);
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
      onLostPointerCapture={endGesture}
    >
      {failed && <div className="pixi-fallback">{t("app.rendererUnavailable")}</div>}
    </div>
  );
}
