import geometry from './plant-geometry.json' with { type: 'json' };
import { fitArtwork } from './plant-presentation-contract.mjs';

export const plantGeometry = geometry.assets;
const cohorts = new Map();
for (const asset of Object.values(plantGeometry)) {
  if (asset.type === 'empty') continue;
  const list = cohorts.get(asset.type) || [];
  list.push(asset); cohorts.set(asset.type, list);
}

/** Source-space support anchors, independent of transparent margins and foliage. */
export function fitPotArtwork(asset, { centerX, baselineY, potWidth }) {
  const scale = potWidth / (asset.pot.width * asset.sourceSize.width);
  const width = asset.sourceSize.width * scale, height = asset.sourceSize.height * scale;
  const left = centerX - asset.pot.centerX * width;
  const top = baselineY - asset.pot.baseY * height;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

function limits(asset) {
  const { pot: p, paintedBounds: b, sourceSize: s } = asset;
  return {
    above: (p.baseY - b.y) * s.height / (p.width * s.width),
    below: Math.max(0, b.y + b.height - p.baseY) * s.height / (p.width * s.width),
    left: (p.centerX - b.x) / p.width,
    right: (b.x + b.width - p.centerX) / p.width,
  };
}

export function shelfPotWidth(type, slot, { potRatio = .54, canopyRatio = 1 } = {}) {
  const family = cohorts.get(type);
  if (!family?.length) return slot.width * .3;
  const extents = family.map(limits);
  // One diameter per species across every growth phase. New leaves do not
  // change the pot's scale; only the genuinely painted canopy constrains it.
  return Math.min(slot.width * potRatio,
    slot.height / Math.max(...extents.map(e => e.above)),
    slot.width * canopyRatio / (2 * Math.max(...extents.flatMap(e => [e.left, e.right]))));
}

export function fitPlantArtwork(key, slot, { shelf = false, potRatio, canopyRatio } = {}) {
  const asset = plantGeometry[key];
  if (!asset) throw new Error(`Missing plant geometry: ${key}`);
  if (!shelf) return fitArtwork(slot, asset.sourceSize.width / asset.sourceSize.height);
  const potWidth = key === 'pot.webp' ? Math.min(50, slot.width * .3)
    : shelfPotWidth(asset.type, slot, { potRatio, canopyRatio });
  return fitPotArtwork(asset, { centerX: slot.left + slot.width / 2, baselineY: slot.bottom, potWidth });
}

export function shelfHangingSpace(width, height) {
  const slot = { width, height };
  return Math.max(0, ...[...cohorts].map(([type, assets]) =>
    shelfPotWidth(type, slot) * Math.max(...assets.map(asset => limits(asset).below))));
}

export function textureFrame(rect, union) {
  return [(rect.left - union.left) / union.width, (rect.top - union.top) / union.height,
    rect.width / union.width, rect.height / union.height];
}

export function unionArtwork(a, b) {
  const left = Math.min(a.left, b.left), top = Math.min(a.top, b.top);
  const right = Math.max(a.right, b.right), bottom = Math.max(a.bottom, b.bottom);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function artworkForNode(node, key, slot = node.getBoundingClientRect()) {
  return fitPlantArtwork(key, slot, { shelf: !!node.closest?.('.gs2-plant-target') });
}

export function placeStaticPlant(node, key) {
  const image = node?.querySelector('img');
  if (!image) return;
  const slot = node.getBoundingClientRect(), fit = artworkForNode(node, key, slot);
  Object.assign(image.style, { position: 'absolute', left: `${fit.left - slot.left}px`, top: `${fit.top - slot.top}px`,
    width: `${fit.width}px`, height: `${fit.height}px`, maxWidth: 'none', objectFit: 'fill', margin: '0' });
  const spot = node.closest?.('.gs2-spot');
  if (spot) {
    const canopyTop = fit.top + plantGeometry[key].paintedBounds.y * fit.height;
    spot.style.setProperty('--gs2-name-offset', `${Math.max(0, canopyTop - slot.top - 6)}px`);
  }
}
