import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Application, Assets } from "pixi.js";
import { assetUrl, loadRuntimeAssetManifest, resolveAssetSourceList } from "./assetBundles.js";
import { useAppI18n } from "../app/i18n.jsx";
import { HudEditableRegion, useHudLayout, useHudRegion } from "../app/hud-layout/index.js";
import { setGameGestureActive } from "../platform/telegram.js";
import { warmPixiAssetBundle } from "./pixiAssetBundles.js";
import { match3RenderResolution, resizeMatch3Renderer } from "../games/match3/match3RenderBudget.js";

const PIXI_ASSET_REGION_IDS = {
  blox: ["bloxBackgroundAsset", "bloxBoardFrameAsset", "bloxTrayPanelAsset"],
  match3: ["match3BackgroundAsset", "match3BoardFrameAsset"],
  merge: ["mergeTableAsset", "mergeBoardFrameAsset"],
};

function destroyPixiApp(app, preserveSharedTextures = false) {
  if (!app) return;
  try {
    // Assets owns cached textures across v2 game exits and remounts.
    // Destroy scene objects without invalidating loader-cached texture promises.
    app.destroy({ removeView: true }, { children: true, texture: !preserveSharedTextures, textureSource: !preserveSharedTextures });
  } catch (err) {
    console.warn("Pixi app destroy skipped", err);
  }
}

function readPublishedAssetLayouts(host) {
  const raw = host?.querySelector?.("canvas")?.dataset?.hudAssetLayouts || "{}";
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function PixiAssetRegionLayer({ sceneKey, hostRef }) {
  const hudLayout = useHudLayout();
  const regionIds = PIXI_ASSET_REGION_IDS[sceneKey] || [];
  const [assetLayouts, setAssetLayouts] = useState({});

  useEffect(() => {
    if (!hudLayout.editorEnabled || regionIds.length === 0) {
      setAssetLayouts({});
      return undefined;
    }
    let lastSignature = "";
    const sync = () => {
      const host = hostRef.current;
      const raw = host?.querySelector?.("canvas")?.dataset?.hudAssetLayouts || "{}";
      if (raw === lastSignature) return;
      lastSignature = raw;
      setAssetLayouts(readPublishedAssetLayouts(host));
    };
    sync();
    const interval = window.setInterval(sync, 180);
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener?.("resize", sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener?.("resize", sync);
    };
  }, [hostRef, hudLayout.editorEnabled, regionIds.length, sceneKey]);

  if (!hudLayout.editorEnabled || regionIds.length === 0) return null;
  return (
    <div className="pixi-hud-asset-layer" aria-hidden="true">
      {regionIds.map((regionId) => {
        const rect = assetLayouts[regionId];
        if (!rect) return null;
        return (
          <HudEditableRegion
            key={regionId}
            id={regionId}
            as="div"
            className="pixi-hud-asset-region"
            style={{
              left: `${rect.left}px`,
              top: `${rect.top}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
            }}
          />
        );
      })}
    </div>
  );
}

export default function PixiGameHost({ sceneKey, buildScene, sceneState, className = "", isolated = false, assetUrls = null, assetKeys = null, loadingFallback = null, errorFallback = null }) {
  const { t } = useAppI18n();
  const containerRef = useRef(null);
  const hudLayout = useHudLayout();
  const pixiReserveRegion = useHudRegion("pixiPlayfieldReserve", { ref: containerRef });
  const layoutSafeArea = hudLayout.pixiSafeArea || { top: 0, bottom: 0, left: 0, right: 0 };
  const reserveSignature = `${layoutSafeArea.top}:${layoutSafeArea.bottom}:${layoutSafeArea.left}:${layoutSafeArea.right}`;
  const effectiveSceneState = useMemo(() => ({
    ...(sceneState || {}),
    hudLayout: hudLayout.resolvedLayout,
    layoutSafeArea,
    hudReserves: layoutSafeArea,
    topReserve: layoutSafeArea.top,
    bottomReserve: layoutSafeArea.bottom,
    leftReserve: layoutSafeArea.left,
    rightReserve: layoutSafeArea.right,
  }), [hudLayout.resolvedLayout, layoutSafeArea, sceneState]);
  const appRef = useRef(null);
  const sceneRef = useRef(null);
  const stateRef = useRef(effectiveSceneState);
  const updateFrameRef = useRef(0);
  const activePointerRef = useRef(null);
  const captureTargetRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

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
        // Only the textured Match3 scene has a backing-pixel budget. Pixi's
        // screen and pointer coordinates remain in the same CSS-pixel space.
        if (sceneKey === "match3") resizeMatch3Renderer(app.renderer, { width, height }, window.devicePixelRatio);
        else app.renderer?.resize?.(width, height);
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
  }, [sceneKey]);

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
        setReady(false);
        app = new Application();
        const size = containerRef.current.getBoundingClientRect();
        await app.init({
          resizeTo: containerRef.current,
          backgroundAlpha: 0,
          antialias: sceneKey !== "match3",
          autoDensity: true,
          resolution: sceneKey === "match3"
            ? match3RenderResolution(size.width, size.height, window.devicePixelRatio)
            : Math.min(window.devicePixelRatio || 1, 2),
          preference: "webgl",
          powerPreference: "high-performance",
        });
        app.ticker.maxFPS = 60;
        if (cancelled) {
          destroyPixiApp(app, isolated);
          return;
        }
        appRef.current = app;
        containerRef.current.appendChild(app.canvas);
        if (assetUrls) await Assets.load(assetUrls.map(assetUrl));
        else await warmPixiAssetBundle(sceneKey, { force: true });
        // Retained semantic art must resolve through the same production manifest
        // that scenes use, rather than preloading a mismatched legacy URL.
        if (assetKeys?.length) {
          const manifest = await loadRuntimeAssetManifest();
          await Assets.load(assetKeys.map((key) => ({ alias: key, src: resolveAssetSourceList(key, manifest) })));
        }
        if (cancelled) {
          destroyPixiApp(app, isolated);
          return;
        }
        // Async init/assets can outlive the shell's initial layout. An observer
        // notification before appRef exists cannot apply the final pixel budget.
        if (sceneKey === "match3") resizeMatch3Renderer(app.renderer, containerRef.current.getBoundingClientRect(), window.devicePixelRatio);
        // Scene builders consume the initial state and draw once; avoid an immediate duplicate redraw.
        sceneRef.current = buildScene(app, stateRef.current);
        if (sceneKey === "match3" && !stateRef.current.match3?.gameActive) {
          app.stop();
          app.render();
        }
        setReady(true);
      } catch (err) {
        console.error(`Pixi scene ${sceneKey} failed`, err);
        setFailed(true);
      }
    }

    mount();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(updateFrameRef.current);
      updateFrameRef.current = 0;
      sceneRef.current?.destroy?.();
      sceneRef.current = null;
      appRef.current = null;
      destroyPixiApp(app, isolated);
      setGameGestureActive(false);
    };
  }, [sceneKey, buildScene, assetUrls, assetKeys, isolated]);

  // Blox redraws its hit targets. Commit its controls and rendered transforms
  // together so a fast second tap cannot hit the gap before the next Pixi tick.
  useLayoutEffect(() => {
    stateRef.current = effectiveSceneState;
    if (sceneKey !== "blox" || !sceneRef.current) return;
    sceneRef.current.update?.(effectiveSceneState);
    appRef.current?.render?.();
  }, [effectiveSceneState, sceneKey]);

  // Match3's paused board stays mounted behind its dialog and Home. Rendering
  // it every tick saturates software WebGL and delays navigation/focus events.
  // State and resize updates still render once; Resume restarts the same scene.
  const match3Playing = effectiveSceneState.match3?.gameActive === true;
  useLayoutEffect(() => {
    if (sceneKey !== "match3" || !ready || !appRef.current) return;
    if (match3Playing) appRef.current.start();
    else appRef.current.stop();
  }, [match3Playing, ready, sceneKey]);

  useEffect(() => {
    if (!sceneRef.current || sceneKey === "blox") return undefined;
    window.cancelAnimationFrame(updateFrameRef.current);
    updateFrameRef.current = window.requestAnimationFrame(() => {
      updateFrameRef.current = 0;
      sceneRef.current?.update?.(stateRef.current);
      if (sceneKey === "match3" && !appRef.current?.ticker.started) appRef.current?.render?.();
    });
    return () => {
      window.cancelAnimationFrame(updateFrameRef.current);
      updateFrameRef.current = 0;
    };
  }, [effectiveSceneState, sceneKey]);

  useEffect(() => {
    if (!sceneRef.current) return undefined;
    const frame = window.requestAnimationFrame(() => {
      if (typeof sceneRef.current?.resize === "function") sceneRef.current.resize(stateRef.current);
      else sceneRef.current?.update?.(stateRef.current);
      appRef.current?.render?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [reserveSignature]);

  return (
    <div
      ref={pixiReserveRegion.ref}
      className={`${isolated ? "arcade-canvas" : "pixi-host"} ${className}`}
      data-no-nav-swipe="true"
      data-hud-reserve-top={layoutSafeArea.top}
      data-hud-reserve-bottom={layoutSafeArea.bottom}
      data-hud-reserve-left={layoutSafeArea.left}
      data-hud-reserve-right={layoutSafeArea.right}
      style={{
        "--hud-safe-top": `${layoutSafeArea.top}px`,
        "--hud-safe-bottom": `${layoutSafeArea.bottom}px`,
        "--hud-safe-left": `${layoutSafeArea.left}px`,
        "--hud-safe-right": `${layoutSafeArea.right}px`,
      }}
      onPointerDown={beginGesture}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onLostPointerCapture={endGesture}
    >
      {!ready && !failed && loadingFallback}
      {failed && (errorFallback || <div className="pixi-fallback">{t("app.rendererUnavailable")}</div>)}
      <PixiAssetRegionLayer sceneKey={sceneKey} hostRef={containerRef} />
    </div>
  );
}
