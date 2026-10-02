import repoLayout from '../../app/hud-layout/defaultLayouts/garden.json' with { type: 'json' };
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
export function resolveGardenComposition({
  width,
  height,
  hudLayout = {},
  safe = {}
}) {
  const defaults = repoLayout.base.regions.gardenComposition;
  // Measurements may briefly disappear during tab/orientation changes. Invalid
  // editor inputs must not turn the whole Garden grid into NaN CSS values.
  const overrides = hudLayout?.regions?.gardenComposition || {};
  const spec = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key,
    typeof fallback === 'number' ? Math.max(0, finite(overrides[key] ?? fallback, fallback)) : overrides[key] ?? fallback
  ]));
  width = Math.max(1, finite(width, 1));
  height = Math.max(1, finite(height, 1));
  const insets = Object.fromEntries(['left', 'right', 'top', 'bottom'].map(k => [k, Math.max(0, finite(safe?.[k], 0))]));
  const w = Math.max(1, width - insets.left - insets.right),
    h = Math.max(1, height - insets.top - insets.bottom);
  const compact = w < spec.compactWidth || h < spec.compactHeight,
    padding = compact ? spec.compactPadding : spec.padding,
    gap = spec.gap;
  const aw = Math.max(1, w - padding * 2),
    ah = Math.max(1, h - padding * 2),
    // A short safe frame still uses the side rail if three 44px targets fit.
    // Preserve the configured breakpoint for taller layouts.
    sideFitWidth = spec.railMin + padding * 2 + gap + 3 * 44 + 2 * spec.spotGap,
    landscape = w >= h && (w >= spec.landscapeMinWidth || (h < spec.compactHeight && w >= sideFitWidth));
  const rail = landscape ? Math.max(spec.railMin, Math.min(spec.railMax, aw * spec.railRatio)) : aw;
  const shelfWidth = landscape ? Math.max(1, aw - rail - gap) : aw,
    rackWidth = Math.min(spec.rackMax, shelfWidth);
  const headerHeight = spec.nameHeight + spec.metricHeight + spec.headerGap;
  return {
    width,
    height,
    insets,
    compact,
    landscape,
    padding,
    gap,
    rail,
    rackWidth,
    spotWidth: Math.max(1, (rackWidth - 2 * spec.spotGap) / 3),
    spotGap: spec.spotGap,
    rowHeight: compact ? spec.compactRowHeight : spec.rowHeight,
    plantHeight: compact ? spec.compactPlantHeight : spec.plantHeight,
    headerHeight,
    shelfHeight: landscape ? ah : Math.max(1, ah - headerHeight - gap),
    shelfWidth,
    dialogMax: spec.dialogMax
  };
}
