import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { VISIBLE_GAME_IDS } from "../gameRegistry.js";
import {
  EXACT_PREVIEW_PRESETS,
  createHudViewportSnapshot,
  getPreviewPreset,
  isHudEditorEnabled,
  readSafeAreaInsetsFromDocument,
} from "./profiles.js";
import { HUD_LAYOUT_DEFAULTS, getDefaultHudLayout } from "./defaultLayouts/index.js";
import {
  createHudLayoutExport,
  getPixiSafeAreaFromHudLayout,
  mergeHudLayout,
  resolveHudLayout,
  validateHudLayoutExport,
} from "./resolver.js";
import { getHudRegionDefinition, hudLayoutRegistry } from "./registry.js";
import {
  HUD_EDITOR_ENABLED_KEY,
  HUD_LAYOUT_OVERRIDES_KEY,
  HUD_PREVIEW_PRESET_KEY,
  readJsonStorage,
  readStorageValue,
  removeStorageValue,
  writeJsonStorage,
  writeStorageValue,
} from "./storage.js";
import {
  applyRegionPatch,
  resetGameOverrides,
  resetProfileOverrides,
  resetRegionOverride,
  shouldRenderHudEditor,
} from "../hud-editor/editorState.js";

const HudLayoutContext = createContext(null);

function getSearchParam(name) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

function readInitialEditorEnabled() {
  if (typeof window === "undefined") return false;
  return isHudEditorEnabled({
    search: window.location.search,
    localStorageValue: readStorageValue(HUD_EDITOR_ENABLED_KEY, null),
  });
}

function readInitialPreviewEnabled() {
  if (typeof window === "undefined") return false;
  const value = getSearchParam("hudPreview");
  return value === "1" || value === "true";
}

function readInitialPreviewPreset() {
  if (typeof window === "undefined") return "390x844";
  const queryPreset = getSearchParam("hudPreset");
  if (getPreviewPreset(queryPreset)) return queryPreset;
  const storedPreset = readStorageValue(HUD_PREVIEW_PRESET_KEY, "390x844");
  return getPreviewPreset(storedPreset) ? storedPreset : "390x844";
}

function browserViewportSnapshot(previewViewport = null) {
  if (typeof window === "undefined") {
    return createHudViewportSnapshot({ layoutWidth: 390, layoutHeight: 844, previewViewport });
  }
  return createHudViewportSnapshot({
    layoutWidth: window.innerWidth || document.documentElement?.clientWidth || 390,
    layoutHeight: window.innerHeight || document.documentElement?.clientHeight || 844,
    visualViewport: window.visualViewport || null,
    previewViewport,
    devicePixelRatio: window.devicePixelRatio || 1,
    safeAreaInsets: readSafeAreaInsetsFromDocument(document),
  });
}

function useHudViewportMonitor({ previewEnabled, previewPresetId }) {
  const previewPreset = previewEnabled ? getPreviewPreset(previewPresetId) : null;
  const [viewport, setViewport] = useState(() => browserViewportSnapshot(previewPreset));

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setViewport(browserViewportSnapshot(previewPreset));
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener?.("resize", update);
    window.visualViewport?.addEventListener?.("scroll", update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener?.("resize", update);
      window.visualViewport?.removeEventListener?.("scroll", update);
    };
  }, [previewPreset?.id, previewPreset?.width, previewPreset?.height]);

  return viewport;
}

function mergeRepoLayoutWithOverrides(repoLayout, overrides) {
  if (!overrides) return repoLayout;
  return mergeHudLayout(repoLayout, overrides);
}

function createEmptyRegionRecord(ref, capabilities) {
  return {
    ref,
    capabilities: capabilities || null,
    rect: null,
  };
}

export function HudLayoutProvider({ gameId, appVersion = "", buildId = "", children }) {
  const [editorEnabled, setEditorEnabled] = useState(readInitialEditorEnabled);
  const [previewEnabled, setPreviewEnabled] = useState(readInitialPreviewEnabled);
  const [previewPresetId, setPreviewPresetIdState] = useState(readInitialPreviewPreset);
  const viewport = useHudViewportMonitor({ previewEnabled: previewEnabled && editorEnabled, previewPresetId });
  const [localOverrides, setLocalOverrides] = useState(() => readJsonStorage(HUD_LAYOUT_OVERRIDES_KEY, {}));
  const [transientOverrides, setTransientOverrides] = useState({});
  const [registeredRegions, setRegisteredRegions] = useState({});
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [editorMessage, setEditorMessage] = useState("");
  const saveTimerRef = useRef(0);

  const repoLayout = getDefaultHudLayout(gameId);
  const resolvedLayout = useMemo(() => resolveHudLayout({
    repoLayout,
    viewport,
    localOverrides: localOverrides?.[gameId],
    transientOverrides: transientOverrides?.[gameId],
    allowLocalOverrides: editorEnabled,
  }), [editorEnabled, gameId, localOverrides, repoLayout, transientOverrides, viewport]);
  const pixiSafeArea = useMemo(() => getPixiSafeAreaFromHudLayout(resolvedLayout), [resolvedLayout]);

  const setPreviewPresetId = useCallback((presetId) => {
    const next = getPreviewPreset(presetId) ? presetId : "390x844";
    setPreviewPresetIdState(next);
    writeStorageValue(HUD_PREVIEW_PRESET_KEY, next);
  }, []);

  useEffect(() => {
    if (!editorEnabled) return undefined;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      writeJsonStorage(HUD_LAYOUT_OVERRIDES_KEY, localOverrides);
    }, 180);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [editorEnabled, localOverrides]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const onKeyDown = (event) => {
      const dev = import.meta.env?.DEV === true;
      if (!dev || !event.ctrlKey || !event.altKey || event.code !== "KeyH") return;
      event.preventDefault();
      setEditorEnabled((value) => {
        const next = !value;
        writeStorageValue(HUD_EDITOR_ENABLED_KEY, next ? "true" : "false");
        return next;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const registerRegion = useCallback((regionId, { ref, capabilities } = {}) => {
    if (!regionId) return () => {};
    setRegisteredRegions((current) => ({
      ...current,
      [regionId]: createEmptyRegionRecord(ref, capabilities),
    }));
    return () => {
      setRegisteredRegions((current) => {
        if (!current[regionId]) return current;
        const next = { ...current };
        delete next[regionId];
        return next;
      });
    };
  }, []);

  const measureRegions = useCallback(() => {
    setRegisteredRegions((current) => {
      let changed = false;
      const next = {};
      for (const [regionId, record] of Object.entries(current)) {
        const node = record.ref?.current || null;
        const rect = node?.getBoundingClientRect?.();
        const nextRect = rect ? {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
        } : null;
        const previous = record.rect;
        if (
          !previous !== !nextRect ||
          (previous && nextRect && (
            Math.round(previous.x) !== Math.round(nextRect.x) ||
            Math.round(previous.y) !== Math.round(nextRect.y) ||
            Math.round(previous.width) !== Math.round(nextRect.width) ||
            Math.round(previous.height) !== Math.round(nextRect.height)
          ))
        ) {
          changed = true;
        }
        next[regionId] = { ...record, rect: nextRect };
      }
      return changed ? next : current;
    });
  }, []);

  useEffect(() => {
    if (!editorEnabled) return undefined;
    const scanDataRegions = () => {
      if (typeof document === "undefined") return;
      const nodes = document.querySelectorAll("[data-hud-region]");
      setRegisteredRegions((current) => {
        let changed = false;
        const next = { ...current };
        nodes.forEach((node) => {
          const regionId = node.getAttribute("data-hud-region");
          if (!regionId || next[regionId]) return;
          const definition = getHudRegionDefinition(gameId, regionId);
          next[regionId] = createEmptyRegionRecord({ current: node }, definition?.capabilities || null);
          changed = true;
        });
        return changed ? next : current;
      });
    };
    let frame = 0;
    const update = () => {
      scanDataRegions();
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measureRegions);
    };
    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener?.("resize", update);
    window.visualViewport?.addEventListener?.("scroll", update);
    const interval = window.setInterval(update, 700);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearInterval(interval);
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener?.("resize", update);
      window.visualViewport?.removeEventListener?.("scroll", update);
    };
  }, [editorEnabled, gameId, measureRegions, resolvedLayout]);

  const patchRegion = useCallback((regionId, patch, { profileId = resolvedLayout.activeProfileId, transient = false } = {}) => {
    if (!regionId || !profileId) return;
    if (transient) {
      setTransientOverrides((current) => ({
        ...current,
        [gameId]: {
          ...(current[gameId] || {}),
          regions: {
            ...(current[gameId]?.regions || {}),
            [regionId]: {
              ...(current[gameId]?.regions?.[regionId] || {}),
              ...patch,
            },
          },
        },
      }));
      return;
    }
    setTransientOverrides((current) => {
      if (!current[gameId]?.regions?.[regionId]) return current;
      const nextGame = {
        ...current[gameId],
        regions: { ...(current[gameId].regions || {}) },
      };
      delete nextGame.regions[regionId];
      return { ...current, [gameId]: nextGame };
    });
    setLocalOverrides((current) => applyRegionPatch(current, gameId, profileId, regionId, patch));
  }, [gameId, resolvedLayout.activeProfileId]);

  const resetSelectedRegion = useCallback((profileId = resolvedLayout.activeProfileId) => {
    if (!selectedRegionId) return;
    setLocalOverrides((current) => resetRegionOverride(current, gameId, profileId, selectedRegionId));
  }, [gameId, resolvedLayout.activeProfileId, selectedRegionId]);

  const resetProfile = useCallback((profileId = resolvedLayout.activeProfileId) => {
    setLocalOverrides((current) => resetProfileOverrides(current, gameId, profileId));
  }, [gameId, resolvedLayout.activeProfileId]);

  const resetGame = useCallback(() => {
    setLocalOverrides((current) => resetGameOverrides(current, gameId));
  }, [gameId]);

  const resetAll = useCallback(() => {
    setLocalOverrides({});
    setTransientOverrides({});
    removeStorageValue(HUD_LAYOUT_OVERRIDES_KEY);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorEnabled(false);
    writeStorageValue(HUD_EDITOR_ENABLED_KEY, "false");
  }, []);

  const openEditor = useCallback(() => {
    setEditorEnabled(true);
    writeStorageValue(HUD_EDITOR_ENABLED_KEY, "true");
  }, []);

  const getPromotableLayout = useCallback((targetGameId) => {
    const layout = getDefaultHudLayout(targetGameId);
    return mergeRepoLayoutWithOverrides(layout, localOverrides?.[targetGameId]);
  }, [localOverrides]);

  const exportLayouts = useCallback((scope = "current") => {
    const layouts = scope === "all"
      ? Object.fromEntries(VISIBLE_GAME_IDS.map((id) => [id, getPromotableLayout(id)]))
      : { [gameId]: getPromotableLayout(gameId) };
    return createHudLayoutExport({ layouts, appVersion, buildId });
  }, [appVersion, buildId, gameId, getPromotableLayout]);

  const importLayouts = useCallback((text, { mode = "replace" } = {}) => {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      const message = `Import rejected: ${error.message}`;
      setEditorMessage(message);
      return { valid: false, errors: [message], warnings: [] };
    }
    const validation = validateHudLayoutExport(parsed, {
      knownRegionIds: hudLayoutRegistry.allRegionIds,
      knownGameIds: VISIBLE_GAME_IDS,
      source: "import",
    });
    if (!validation.valid) {
      setEditorMessage(`Import rejected: ${validation.errors[0] || "invalid layout export"}`);
      return validation;
    }
    setLocalOverrides((current) => {
      const next = mode === "replace" ? { ...current } : structuredClone(current || {});
      for (const [id, layout] of Object.entries(parsed.games || {})) {
        if (!VISIBLE_GAME_IDS.includes(id)) continue;
        next[id] = mergeHudLayout(getDefaultHudLayout(id), layout);
      }
      return next;
    });
    setEditorMessage(validation.warnings.length ? validation.warnings.join("\n") : "Imported layout JSON");
    return validation;
  }, []);

  const value = useMemo(() => ({
    activeGameId: gameId,
    appVersion,
    buildId,
    editorEnabled,
    editorVisible: shouldRenderHudEditor({ editorEnabled }),
    editorMessage,
    setEditorMessage,
    openEditor,
    closeEditor,
    previewEnabled,
    setPreviewEnabled,
    previewPresetId,
    setPreviewPresetId,
    previewPresets: EXACT_PREVIEW_PRESETS,
    viewport,
    repoLayout,
    resolvedLayout,
    pixiSafeArea,
    localOverrides,
    registeredRegions,
    selectedRegionId,
    setSelectedRegionId,
    registerRegion,
    measureRegions,
    patchRegion,
    resetSelectedRegion,
    resetProfile,
    resetGame,
    resetAll,
    exportLayouts,
    importLayouts,
    getPromotableLayout,
  }), [
    appVersion,
    buildId,
    closeEditor,
    editorEnabled,
    editorMessage,
    exportLayouts,
    gameId,
    getPromotableLayout,
    importLayouts,
    localOverrides,
    measureRegions,
    openEditor,
    patchRegion,
    pixiSafeArea,
    previewEnabled,
    previewPresetId,
    registerRegion,
    repoLayout,
    resetAll,
    resetGame,
    resetProfile,
    resetSelectedRegion,
    resolvedLayout,
    selectedRegionId,
    setPreviewPresetId,
    viewport,
    registeredRegions,
  ]);

  return <HudLayoutContext.Provider value={value}>{children}</HudLayoutContext.Provider>;
}

export function useHudLayout() {
  const context = useContext(HudLayoutContext);
  if (!context) {
    return {
      activeGameId: null,
      editorEnabled: false,
      editorVisible: false,
      viewport: createHudViewportSnapshot({ layoutWidth: 390, layoutHeight: 844 }),
      resolvedLayout: resolveHudLayout({ repoLayout: null, viewport: { width: 390, height: 844 } }),
      pixiSafeArea: { top: 0, bottom: 0, left: 0, right: 0 },
      registerRegion: () => () => {},
      patchRegion: () => {},
      setSelectedRegionId: () => {},
    };
  }
  return context;
}

export function useHudViewport() {
  return useHudLayout().viewport;
}
