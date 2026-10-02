import repoLayout from '../../app/hud-layout/defaultLayouts/garden.json' with { type: 'json' };
export function resolveGardenComposition({
  width,
  height,
  hudLayout = {},
  safe = {}
}) {
  const spec = {
    ...repoLayout.base.regions.gardenComposition,
    ...hudLayout.regions?.gardenComposition
  };
  const insets = Object.fromEntries(['left', 'right', 'top', 'bottom'].map(k => [k, Math.max(0, Number(safe[k]) || 0)]));
  const w = Math.max(1, width - insets.left - insets.right),
    h = Math.max(1, height - insets.top - insets.bottom);
  const compact = w < spec.compactWidth || h < spec.compactHeight,
    padding = compact ? spec.compactPadding : spec.padding,
    gap = spec.gap;
  const aw = Math.max(1, w - padding * 2),
    ah = Math.max(1, h - padding * 2),
    landscape = w >= spec.landscapeMinWidth && w >= h;
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
    spotWidth: (rackWidth - 2 * spec.spotGap) / 3,
    spotGap: spec.spotGap,
    rowHeight: compact ? spec.compactRowHeight : spec.rowHeight,
    plantHeight: compact ? spec.compactPlantHeight : spec.plantHeight,
    headerHeight,
    shelfHeight: landscape ? ah : Math.max(1, ah - headerHeight - gap),
    shelfWidth,
    dialogMax: spec.dialogMax
  };
}
