import React, { useRef } from "react";
import {
  ArrowLeftRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileInput,
  Grid2X2,
  Lock,
  RotateCw,
  Trash2,
  Unlock,
  X,
} from "lucide-react";

const TEXT = {
  actualViewport: "Actual viewport",
  aspectRatio: "AR",
  close: "Close",
  copyJson: "Copy JSON",
  devicePixelRatio: "DPR",
  edit: "Edit",
  exportAll: "Export all",
  exportGame: "Export game",
  grid: "Grid",
  hidePanels: "Hide panels",
  importJson: "Import JSON",
  labels: "Labels",
  locked: "Locked",
  pixi: "Pixi",
  preset: "Preset",
  preview: "Preview",
  previewFrame: "Preview frame",
  resetAll: "Reset all",
  resetGame: "Reset game",
  resetProfile: "Reset profile",
  resetRegion: "Reset region",
  rotate: "Rotate",
  safe: "Safe",
  snap: "Snap",
  thumb: "Thumb",
};

function ToolbarButton({ icon: Icon, children, active = false, title, ...props }) {
  return (
    <button
      type="button"
      className={`hud-editor-button${active ? " active" : ""}`}
      title={title || children}
      aria-label={title || children}
      {...props}
    >
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  );
}

export function HudEditorToolbar({
  hud,
  locked,
  setLocked,
  snapEnabled,
  setSnapEnabled,
  gridSize,
  setGridSize,
  showGrid,
  setShowGrid,
  showSafeAreas,
  setShowSafeAreas,
  showPlayfield,
  setShowPlayfield,
  showThumbZones,
  setShowThumbZones,
  showLabels,
  setShowLabels,
  onExportCurrent,
  onExportAll,
  onCopyJson,
  onImportText,
  onHideChrome,
}) {
  const fileInputRef = useRef(null);
  const viewport = hud.viewport;
  const activePreset = hud.previewPresets.find((preset) => preset.id === hud.previewPresetId) || hud.previewPresets[0];
  const rotatedPreset = hud.previewPresets.find((preset) => preset.width === activePreset?.height && preset.height === activePreset?.width);

  const handleImportFile = async (event) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    onImportText(await file.text());
  };

  return (
    <div className="hud-editor-toolbar" data-testid="hud-editor-toolbar">
      <div className="hud-editor-toolbar-meta">
        <strong>{hud.activeGameId}</strong>
        <span>{viewport.activeProfileId}</span>
        <span>{viewport.orientation}</span>
        <span>{TEXT.actualViewport} {viewport.layoutViewport.width}x{viewport.layoutViewport.height}</span>
        {viewport.previewViewport && <span>{TEXT.previewFrame} {viewport.previewViewport.width}x{viewport.previewViewport.height}</span>}
        <span>{TEXT.aspectRatio} {viewport.aspectRatio.toFixed(2)}</span>
        <span>{TEXT.devicePixelRatio} {viewport.devicePixelRatio}</span>
      </div>
      <div className="hud-editor-toolbar-row">
        <label className="hud-editor-field compact">
          <span>{TEXT.preset}</span>
          <select
            value={hud.previewPresetId}
            onChange={(event) => {
              hud.setPreviewPresetId(event.target.value);
              hud.setPreviewEnabled(true);
            }}
          >
            {hud.previewPresets.map((preset) => (
              <option key={preset.id} value={preset.id}>{preset.label}</option>
            ))}
          </select>
        </label>
        <ToolbarButton
          icon={RotateCw}
          onClick={() => {
            if (rotatedPreset) {
              hud.setPreviewPresetId(rotatedPreset.id);
              hud.setPreviewEnabled(true);
            }
          }}
          disabled={!rotatedPreset}
        >
          {TEXT.rotate}
        </ToolbarButton>
        <ToolbarButton icon={ArrowLeftRight} active={hud.previewEnabled} onClick={() => hud.setPreviewEnabled(!hud.previewEnabled)}>
          {TEXT.preview}
        </ToolbarButton>
        <ToolbarButton icon={locked ? Lock : Unlock} active={locked} onClick={() => setLocked(!locked)}>
          {locked ? TEXT.locked : TEXT.edit}
        </ToolbarButton>
        <ToolbarButton icon={Grid2X2} active={snapEnabled} onClick={() => setSnapEnabled(!snapEnabled)}>
          {TEXT.snap}
        </ToolbarButton>
        <label className="hud-editor-field tiny">
          <span>{TEXT.grid}</span>
          <select value={gridSize} onChange={(event) => setGridSize(Number(event.target.value))}>
            {[1, 2, 4, 8, 12, 16, 24].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <ToolbarButton icon={showGrid ? Eye : EyeOff} active={showGrid} onClick={() => setShowGrid(!showGrid)}>
          {TEXT.grid}
        </ToolbarButton>
        <ToolbarButton icon={showSafeAreas ? Eye : EyeOff} active={showSafeAreas} onClick={() => setShowSafeAreas(!showSafeAreas)}>
          {TEXT.safe}
        </ToolbarButton>
        <ToolbarButton icon={showPlayfield ? Eye : EyeOff} active={showPlayfield} onClick={() => setShowPlayfield(!showPlayfield)}>
          {TEXT.pixi}
        </ToolbarButton>
        <ToolbarButton icon={showThumbZones ? Eye : EyeOff} active={showThumbZones} onClick={() => setShowThumbZones(!showThumbZones)}>
          {TEXT.thumb}
        </ToolbarButton>
        <ToolbarButton icon={showLabels ? Eye : EyeOff} active={showLabels} onClick={() => setShowLabels(!showLabels)}>
          {TEXT.labels}
        </ToolbarButton>
        <ToolbarButton icon={EyeOff} onClick={onHideChrome}>
          {TEXT.hidePanels}
        </ToolbarButton>
      </div>
      <div className="hud-editor-toolbar-row">
        <ToolbarButton icon={Download} onClick={onExportCurrent}>{TEXT.exportGame}</ToolbarButton>
        <ToolbarButton icon={Download} onClick={onExportAll}>{TEXT.exportAll}</ToolbarButton>
        <ToolbarButton icon={Copy} onClick={onCopyJson}>{TEXT.copyJson}</ToolbarButton>
        <ToolbarButton icon={FileInput} onClick={() => fileInputRef.current?.click()}>{TEXT.importJson}</ToolbarButton>
        <input ref={fileInputRef} className="hud-editor-file-input" type="file" accept="application/json,.json" onChange={handleImportFile} />
        <ToolbarButton icon={Trash2} onClick={() => hud.resetSelectedRegion()} disabled={!hud.selectedRegionId}>{TEXT.resetRegion}</ToolbarButton>
        <ToolbarButton icon={Trash2} onClick={() => hud.resetProfile()}>{TEXT.resetProfile}</ToolbarButton>
        <ToolbarButton icon={Trash2} onClick={() => hud.resetGame()}>{TEXT.resetGame}</ToolbarButton>
        <ToolbarButton icon={Trash2} onClick={() => hud.resetAll()}>{TEXT.resetAll}</ToolbarButton>
        <ToolbarButton icon={X} onClick={hud.closeEditor}>{TEXT.close}</ToolbarButton>
      </div>
    </div>
  );
}
