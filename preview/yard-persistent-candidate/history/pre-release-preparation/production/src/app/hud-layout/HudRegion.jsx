import React, { forwardRef, useEffect, useMemo, useRef } from "react";
import { getHudLayoutCssVars, getHudRegionRuntimeStyle } from "./resolver.js";
import { getHudRegionDefinition } from "./registry.js";
import { useHudLayout } from "./HudLayoutContext.jsx";

const EMPTY_CAPABILITIES = {};

function assignRef(ref, value) {
  if (!ref) return;
  if (typeof ref === "function") ref(value);
  else ref.current = value;
}

function mergeRefs(...refs) {
  return (value) => refs.forEach((ref) => assignRef(ref, value));
}

export function useHudRegion(regionId, { ref = null, capabilities = null } = {}) {
  const localRef = useRef(null);
  const mergedRef = useMemo(() => mergeRefs(localRef, ref), [ref]);
  const {
    activeGameId: gameId,
    resolvedLayout,
    selectedRegionId,
    setSelectedRegionId,
    registerRegion,
  } = useHudLayout();
  const definition = getHudRegionDefinition(gameId, regionId);
  const regionLayout = resolvedLayout?.regions?.[regionId] || null;
  const regionCapabilities = capabilities || definition?.capabilities || EMPTY_CAPABILITIES;

  useEffect(() => {
    return registerRegion(regionId, {
      ref: localRef,
      capabilities: regionCapabilities,
    });
  }, [registerRegion, regionCapabilities, regionId]);

  return {
    ref: mergedRef,
    regionLayout,
    capabilities: regionCapabilities,
    definition,
    style: regionLayout ? getHudRegionRuntimeStyle(regionLayout) : {},
    cssVars: regionLayout ? getHudLayoutCssVars(regionLayout) : {},
    selected: selectedRegionId === regionId,
    select: () => setSelectedRegionId(regionId),
  };
}

export const HudRegion = forwardRef(function HudRegion({
  id,
  as: Tag = "div",
  children,
  className = "",
  style,
  capabilities = null,
  editable = false,
  applyLayout = true,
  ...props
}, forwardedRef) {
  const region = useHudRegion(id, { ref: forwardedRef, capabilities });
  const mergedStyle = applyLayout ? { ...region.style, ...style } : { ...region.cssVars, ...style };
  const sharedProps = {
    ...props,
    ref: region.ref,
    className: `${className}${className ? " " : ""}hud-region${editable ? " hud-editable-region" : ""}`.trim(),
    style: mergedStyle,
    "data-hud-region": id,
    "data-hud-mode": region.regionLayout?.mode || region.capabilities?.mode || undefined,
    "data-hud-selected": region.selected ? "true" : undefined,
  };
  if (Tag === "img" || Tag === "input") return <Tag {...sharedProps} />;
  return <Tag {...sharedProps}>{children}</Tag>;
});

export const HudEditableRegion = forwardRef(function HudEditableRegion(props, ref) {
  return <HudRegion {...props} ref={ref} editable />;
});

export function HudPreviewSurface({ children }) {
  const { editorVisible, previewEnabled, previewPresetId, previewPresets } = useHudLayout();
  const preset = previewPresets.find((item) => item.id === previewPresetId) || previewPresets[1];
  if (!editorVisible || !previewEnabled || !preset) return children;
  return (
    <div className="hud-preview-stage" data-hud-preview-stage="true">
      <div
        className="hud-preview-frame"
        data-hud-preview-frame="true"
        style={{ width: `${preset.width}px`, height: `${preset.height}px` }}
      >
        {children}
      </div>
    </div>
  );
}
