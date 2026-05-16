import React, { useEffect, useMemo, useRef, useState } from "react";
import { useHudLayout } from "../hud-layout/index.js";
import { HudEditorInspector } from "./HudEditorInspector.jsx";
import { HudEditorToolbar } from "./HudEditorToolbar.jsx";

const TEXT = {
  showEditor: "Show editor",
};

function snap(value, enabled, gridSize) {
  if (!enabled || gridSize <= 1) return value;
  return Math.round(value / gridSize) * gridSize;
}

function regionCanDrag(record, region) {
  if (!region || region.mode === "reserveOnly") return false;
  return record?.capabilities?.draggable !== false;
}

function movePatchForRegion(region, dx, dy, { snapEnabled, gridSize }) {
  if (!region) return {};
  if (region.mode === "dock") {
    const edge = region.edge || "bottom";
    const delta = edge === "top" ? dy : edge === "bottom" ? -dy : edge === "left" ? dx : -dx;
    return { offset: snap((Number(region.offset) || 0) + delta, snapEnabled, gridSize) };
  }
  return {
    x: snap((Number(region.x) || 0) + dx, snapEnabled, gridSize),
    y: snap((Number(region.y) || 0) + dy, snapEnabled, gridSize),
  };
}

function HudRegionBox({ hud, regionId, record, locked, snapEnabled, gridSize, showLabels }) {
  const dragRef = useRef(null);
  const region = hud.resolvedLayout.regions?.[regionId];
  const selected = hud.selectedRegionId === regionId;
  const canDrag = !locked && regionCanDrag(record, region);
  const rect = record?.rect;
  if (!rect || region?.visible === false) return null;
  const fineTarget = record?.capabilities?.mode === "freeform" || record?.capabilities?.asset;
  const boxZ = fineTarget
    ? selected ? 2147483006 : 2147483004
    : selected ? 2147483003 : 2147483001;

  const beginDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    hud.setSelectedRegionId(regionId);
    if (!canDrag) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startRegion: { ...region },
      frame: 0,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onMove = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    cancelAnimationFrame(drag.frame);
    drag.frame = requestAnimationFrame(() => {
      hud.patchRegion(regionId, movePatchForRegion(drag.startRegion, dx, dy, { snapEnabled, gridSize }), { transient: true });
    });
  };

  const endDrag = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    cancelAnimationFrame(drag.frame);
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    hud.patchRegion(regionId, movePatchForRegion(drag.startRegion, dx, dy, { snapEnabled, gridSize }));
    dragRef.current = null;
  };

  return (
    <button
      type="button"
      className={`hud-editor-region-box${selected ? " selected" : ""}${canDrag ? " draggable" : ""}`}
      style={{
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${Math.max(44, rect.width)}px`,
        height: `${Math.max(44, rect.height)}px`,
        zIndex: boxZ,
      }}
      data-hud-region-box={regionId}
      onPointerDown={beginDrag}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {showLabels && <span>{regionId}</span>}
    </button>
  );
}

function HudEditorGuides({ hud, showGrid, showSafeAreas, showPlayfield, showThumbZones }) {
  const safe = hud.viewport.safeAreaInsets;
  const pixi = hud.pixiSafeArea;
  return (
    <div className="hud-editor-guides" aria-hidden="true">
      {showGrid && <div className="hud-editor-grid" />}
      {showSafeAreas && (
        <>
          <div className="hud-editor-safe top" style={{ height: `${safe.top}px` }} />
          <div className="hud-editor-safe bottom" style={{ height: `${safe.bottom}px` }} />
          <div className="hud-editor-safe left" style={{ width: `${safe.left}px` }} />
          <div className="hud-editor-safe right" style={{ width: `${safe.right}px` }} />
        </>
      )}
      {showPlayfield && (
        <div
          className="hud-editor-pixi-reserve"
          style={{
            top: `${pixi.top}px`,
            right: `${pixi.right}px`,
            bottom: `${pixi.bottom}px`,
            left: `${pixi.left}px`,
          }}
        />
      )}
      {showThumbZones && (
        <>
          <div className="hud-editor-thumb-zone left" />
          <div className="hud-editor-thumb-zone right" />
        </>
      )}
    </div>
  );
}

export function HudEditorOverlay() {
  const hud = useHudLayout();
  const [locked, setLocked] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [gridSize, setGridSize] = useState(8);
  const [showGrid, setShowGrid] = useState(false);
  const [showSafeAreas, setShowSafeAreas] = useState(true);
  const [showPlayfield, setShowPlayfield] = useState(true);
  const [showThumbZones, setShowThumbZones] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [exportText, setExportText] = useState("");
  const [importText, setImportText] = useState("");

  const regionEntries = useMemo(() => Object.entries(hud.registeredRegions), [hud.registeredRegions]);

  useEffect(() => {
    if (!hud.editorVisible) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (hud.selectedRegionId) hud.setSelectedRegionId(null);
        else hud.closeEditor();
        return;
      }
      if (!hud.selectedRegionId || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault();
      const step = event.altKey ? 1 : event.shiftKey ? 16 : snapEnabled ? gridSize : 4;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      const region = hud.resolvedLayout.regions?.[hud.selectedRegionId];
      hud.patchRegion(hud.selectedRegionId, movePatchForRegion(region, dx, dy, { snapEnabled: false, gridSize }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [gridSize, hud, snapEnabled]);

  if (!hud.editorVisible) return null;

  const exportJson = (scope) => {
    const text = JSON.stringify(hud.exportLayouts(scope), null, 2);
    setExportText(text);
    return text;
  };

  const copyJson = async () => {
    const text = exportText || exportJson("current");
    try {
      await navigator.clipboard?.writeText(text);
      hud.setEditorMessage("Copied HUD layout JSON");
    } catch {
      hud.setEditorMessage("Copy failed; JSON is still visible in the inspector");
    }
  };

  const importJson = (text) => {
    const result = hud.importLayouts(text);
    if (result.valid) setExportText("");
  };

  return (
    <div className="hud-editor-root" data-testid="hud-editor-root" onPointerDown={(event) => event.stopPropagation()}>
      <HudEditorGuides hud={hud} showGrid={showGrid} showSafeAreas={showSafeAreas} showPlayfield={showPlayfield} showThumbZones={showThumbZones} />
      <div className="hud-editor-region-layer">
        {regionEntries.map(([regionId, record]) => (
          <HudRegionBox
            key={regionId}
            hud={hud}
            regionId={regionId}
            record={record}
            locked={locked}
            snapEnabled={snapEnabled}
            gridSize={gridSize}
            showLabels={showLabels}
          />
        ))}
      </div>
      {chromeVisible ? (
        <>
          <HudEditorToolbar
            hud={hud}
            locked={locked}
            setLocked={setLocked}
            snapEnabled={snapEnabled}
            setSnapEnabled={setSnapEnabled}
            gridSize={gridSize}
            setGridSize={setGridSize}
            showGrid={showGrid}
            setShowGrid={setShowGrid}
            showSafeAreas={showSafeAreas}
            setShowSafeAreas={setShowSafeAreas}
            showPlayfield={showPlayfield}
            setShowPlayfield={setShowPlayfield}
            showThumbZones={showThumbZones}
            setShowThumbZones={setShowThumbZones}
            showLabels={showLabels}
            setShowLabels={setShowLabels}
            onExportCurrent={() => exportJson("current")}
            onExportAll={() => exportJson("all")}
            onCopyJson={copyJson}
            onImportText={importJson}
            onHideChrome={() => setChromeVisible(false)}
          />
          <HudEditorInspector
            hud={hud}
            exportText={exportText}
            importText={importText}
            setImportText={setImportText}
            onImportText={importJson}
          />
        </>
      ) : (
        <button type="button" className="hud-editor-restore" onClick={() => setChromeVisible(true)}>
          {TEXT.showEditor}
        </button>
      )}
      {hud.editorMessage && <div className="hud-editor-message">{hud.editorMessage}</div>}
    </div>
  );
}
