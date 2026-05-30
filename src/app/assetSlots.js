function pct(value) {
  const rounded = Math.round(value * 10000) / 100;
  return `${rounded}%`;
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function assetSlotStyle(slot, reference) {
  const width = numeric(reference?.width);
  const height = numeric(reference?.height);
  if (!slot || width <= 0 || height <= 0) return {};

  return {
    position: "absolute",
    left: pct(numeric(slot.x) / width),
    top: pct(numeric(slot.y) / height),
    width: pct(numeric(slot.width) / width),
    height: pct(numeric(slot.height) / height),
  };
}

export function assetSlotVars(slots, reference, prefix = "--asset-slot") {
  const width = numeric(reference?.width);
  const height = numeric(reference?.height);
  if (!slots || width <= 0 || height <= 0) return {};

  return Object.fromEntries(Object.entries(slots).flatMap(([name, slot]) => ([
    [`${prefix}-${name}-x`, pct(numeric(slot.x) / width)],
    [`${prefix}-${name}-y`, pct(numeric(slot.y) / height)],
    [`${prefix}-${name}-w`, pct(numeric(slot.width) / width)],
    [`${prefix}-${name}-h`, pct(numeric(slot.height) / height)],
  ])));
}
