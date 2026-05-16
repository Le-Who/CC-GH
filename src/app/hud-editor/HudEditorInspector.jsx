import React, { useMemo } from "react";
import { hudLayoutRegistry } from "../hud-layout/registry.js";

const ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

const EDGES = ["top", "right", "bottom", "left"];
const DIRECTIONS = ["horizontal", "vertical", "row", "column"];
const ALIGNMENTS = ["start", "center", "end", "stretch"];
const TEXT = {
  clear: "Clear",
  exportJson: "Export JSON",
  group: "Group",
  importJson: "Import JSON",
  importPasted: "Validate and import pasted JSON",
  label: "Label",
  noRegion: "No region selected",
  noRegionHint: "Tap a region box to inspect it",
  profile: "Profile",
  source: "Source",
};

function NumberField({ label, value, onChange, step = 1 }) {
  return (
    <label className="hud-editor-field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
    </label>
  );
}

function SelectField({ label, value, options, onChange }) {
  return (
    <label className="hud-editor-field">
      <span>{label}</span>
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function ToggleField({ label, value, onChange }) {
  return (
    <label className="hud-editor-toggle">
      <input type="checkbox" checked={value !== false} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function regionSource(hud, regionId) {
  const profileId = hud.resolvedLayout.activeProfileId;
  if (hud.localOverrides?.[hud.activeGameId]?.profiles?.[profileId]?.regions?.[regionId]) return "local profile";
  if (hud.localOverrides?.[hud.activeGameId]?.base?.regions?.[regionId]) return "local base";
  if (hud.repoLayout?.profiles?.[profileId]?.regions?.[regionId]) return "repo profile";
  if (hud.repoLayout?.base?.regions?.[regionId]) return "repo base";
  return "fallback";
}

function buildWarnings(hud, regionId, rect) {
  const warnings = [];
  const viewport = hud.viewport;
  const region = hud.resolvedLayout.regions?.[regionId] || {};
  if (hud.localOverrides?.[hud.activeGameId]) warnings.push("Local override active");
  if (!hud.repoLayout?.profiles?.[viewport.activeProfileId]?.regions?.[regionId]) warnings.push("Missing profile override; inherited from base/fallback");
  if (rect) {
    if (rect.left < -1 || rect.right > viewport.layoutViewport.width + 1 || rect.top < -1 || rect.bottom > viewport.layoutViewport.height + 1) {
      warnings.push("Region outside actual viewport");
    }
    if (viewport.width <= 360 && rect.right > viewport.width) warnings.push("Horizontal scroll risk at small width");
  }
  if (region.mode === "reserveOnly" && !region.affectsPixiSafeArea) warnings.push("Reserve-only region should be checked against Pixi safe area");
  return warnings;
}

export function HudEditorInspector({ hud, exportText, importText, setImportText, onImportText }) {
  const regionId = hud.selectedRegionId;
  const region = regionId ? hud.resolvedLayout.regions?.[regionId] : null;
  const definition = regionId ? hudLayoutRegistry.games[hud.activeGameId]?.regions?.[regionId] || hudLayoutRegistry.common.regions?.[regionId] : null;
  const record = regionId ? hud.registeredRegions[regionId] : null;
  const warnings = useMemo(() => (regionId ? buildWarnings(hud, regionId, record?.rect) : []), [hud, record?.rect, regionId]);

  const patch = (next) => hud.patchRegion(regionId, next);

  return (
    <aside className="hud-editor-inspector" data-testid="hud-editor-inspector">
      <div className="hud-editor-inspector-header">
        <div>
          <strong>{regionId || TEXT.noRegion}</strong>
          <span>{region ? region.mode : TEXT.noRegionHint}</span>
        </div>
        {regionId && <button type="button" onClick={() => hud.setSelectedRegionId(null)}>{TEXT.clear}</button>}
      </div>
      {region && (
        <>
          <dl className="hud-editor-region-meta">
            <div><dt>{TEXT.label}</dt><dd>{definition?.editorLabel || regionId}</dd></div>
            <div><dt>{TEXT.group}</dt><dd>{definition?.editorGroup || "Custom"}</dd></div>
            <div><dt>{TEXT.source}</dt><dd>{regionSource(hud, regionId)}</dd></div>
            <div><dt>{TEXT.profile}</dt><dd>{hud.resolvedLayout.activeProfileId}</dd></div>
          </dl>
          {definition?.notes && <p className="hud-editor-note">{definition.notes}</p>}
          {warnings.length > 0 && (
            <div className="hud-editor-warnings">
              {warnings.map((warning) => <span key={warning}>{warning}</span>)}
            </div>
          )}
          <div className="hud-editor-fields">
            <ToggleField label="Visible" value={region.visible} onChange={(visible) => patch({ visible })} />
            <NumberField label="zIndex" value={region.zIndex} onChange={(zIndex) => patch({ zIndex })} />
            {(definition?.capabilities?.asset || region.scale != null || region.opacity != null || region.rotation != null) && (
              <>
                <NumberField label="scale" value={region.scale ?? 1} onChange={(scale) => patch({ scale })} step={0.05} />
                <NumberField label="opacity" value={region.opacity ?? 1} onChange={(opacity) => patch({ opacity })} step={0.05} />
                <NumberField label="rotation" value={region.rotation ?? 0} onChange={(rotation) => patch({ rotation })} />
              </>
            )}
            {region.mode === "anchored" && (
              <>
                <SelectField label="Anchor" value={region.anchor || "top-center"} options={ANCHORS} onChange={(anchor) => patch({ anchor })} />
                <NumberField label="x" value={region.x || 0} onChange={(x) => patch({ x })} />
                <NumberField label="y" value={region.y || 0} onChange={(y) => patch({ y })} />
                <NumberField label="width" value={region.width} onChange={(width) => patch({ width })} />
                <NumberField label="height" value={region.height} onChange={(height) => patch({ height })} />
                <NumberField label="minWidth" value={region.minWidth} onChange={(minWidth) => patch({ minWidth })} />
                <NumberField label="maxWidth" value={region.maxWidth} onChange={(maxWidth) => patch({ maxWidth })} />
                <NumberField label="minHeight" value={region.minHeight} onChange={(minHeight) => patch({ minHeight })} />
                <NumberField label="maxHeight" value={region.maxHeight} onChange={(maxHeight) => patch({ maxHeight })} />
              </>
            )}
            {region.mode === "dock" && (
              <>
                <SelectField label="Edge" value={region.edge || "bottom"} options={EDGES} onChange={(edge) => patch({ edge })} />
                <NumberField label="offset" value={region.offset || 0} onChange={(offset) => patch({ offset })} />
                <NumberField label="thickness" value={region.thickness} onChange={(thickness) => patch({ thickness })} />
                <NumberField label="reserve" value={region.reserve} onChange={(reserve) => patch({ reserve })} />
                <SelectField label="alignment" value={region.alignment || "center"} options={ALIGNMENTS} onChange={(alignment) => patch({ alignment })} />
                <NumberField label="maxWidth" value={region.maxWidth} onChange={(maxWidth) => patch({ maxWidth })} />
                <NumberField label="maxHeight" value={region.maxHeight} onChange={(maxHeight) => patch({ maxHeight })} />
              </>
            )}
            {(region.mode === "flow" || region.mode === "stack") && (
              <>
                <NumberField label="x" value={region.x || 0} onChange={(x) => patch({ x })} />
                <NumberField label="y" value={region.y || 0} onChange={(y) => patch({ y })} />
                <SelectField label="direction" value={region.direction || "horizontal"} options={DIRECTIONS} onChange={(direction) => patch({ direction })} />
                <NumberField label="gap" value={region.gap || 0} onChange={(gap) => patch({ gap })} />
                <ToggleField label="Wrap" value={region.wrap} onChange={(wrap) => patch({ wrap })} />
                <SelectField label="alignment" value={region.alignment || "center"} options={ALIGNMENTS} onChange={(alignment) => patch({ alignment })} />
                <NumberField label="order" value={region.order} onChange={(order) => patch({ order })} />
                <NumberField label="maxRows" value={region.maxRows} onChange={(maxRows) => patch({ maxRows })} />
                <NumberField label="maxColumns" value={region.maxColumns} onChange={(maxColumns) => patch({ maxColumns })} />
              </>
            )}
            {region.mode === "custom" && (
              <>
                <NumberField label="x" value={region.x || 0} onChange={(x) => patch({ x })} />
                <NumberField label="y" value={region.y || 0} onChange={(y) => patch({ y })} />
                <NumberField label="width" value={region.width} onChange={(width) => patch({ width })} />
                <NumberField label="height" value={region.height} onChange={(height) => patch({ height })} />
              </>
            )}
            {region.mode === "freeform" && (
              <>
                <NumberField label="x" value={region.x || 0} onChange={(x) => patch({ x })} />
                <NumberField label="y" value={region.y || 0} onChange={(y) => patch({ y })} />
                <NumberField label="width" value={region.width} onChange={(width) => patch({ width })} />
                <NumberField label="height" value={region.height} onChange={(height) => patch({ height })} />
              </>
            )}
            {(region.mode === "reserveOnly" || definition?.capabilities?.affectsPixiSafeArea) && (
              <>
                <NumberField label="topReserve" value={region.topReserve || 0} onChange={(topReserve) => patch({ topReserve })} />
                <NumberField label="bottomReserve" value={region.bottomReserve || 0} onChange={(bottomReserve) => patch({ bottomReserve })} />
                <NumberField label="leftReserve" value={region.leftReserve || 0} onChange={(leftReserve) => patch({ leftReserve })} />
                <NumberField label="rightReserve" value={region.rightReserve || 0} onChange={(rightReserve) => patch({ rightReserve })} />
              </>
            )}
          </div>
        </>
      )}
      <div className="hud-editor-json-panel">
        <label className="hud-editor-field wide">
          <span>{TEXT.exportJson}</span>
          <textarea readOnly value={exportText} placeholder="Use Export game or Export all." />
        </label>
        <label className="hud-editor-field wide">
          <span>{TEXT.importJson}</span>
          <textarea value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="Paste a HUD layout export." />
        </label>
        <button type="button" className="hud-editor-primary" onClick={() => onImportText(importText)} disabled={!importText.trim()}>
          {TEXT.importPasted}
        </button>
      </div>
    </aside>
  );
}
