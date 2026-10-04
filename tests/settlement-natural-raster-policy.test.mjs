import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isApprovedOpaqueLandscape } from '../scripts/lib/settlement-natural-raster-policy.mjs';

test('only the two exact reviewed opaque exports use natural-color classification', () => {
 for (const file of ['world-map-archipelago-base.webp', 'expedition-thumb-drowned-ruins.webp']) {
  const path = `ui/illustrated-v2/${file}`;
  const bytes = readFileSync(new URL(`../public/games/settlement/${path}`, import.meta.url));
  const hash = createHash('sha256').update(bytes).digest('hex');
  assert.equal(isApprovedOpaqueLandscape(path, hash, false), true);
  assert.equal(isApprovedOpaqueLandscape(path, hash, true), false);
  assert.equal(isApprovedOpaqueLandscape(path, hash, undefined), false);
  assert.equal(isApprovedOpaqueLandscape(path, '0'.repeat(64), false), false);
  assert.equal(isApprovedOpaqueLandscape(`other/${file}`, hash, false), false);
 }
 assert.equal(isApprovedOpaqueLandscape('ui/illustrated-v2/navigation-tile.webp', '0'.repeat(64), false), false);
});
test('runtime auditor retains the original color and trimmed-bounds checks', () => {
 const source = readFileSync(new URL('../scripts/settlement-assets.mjs', import.meta.url), 'utf8');
 assert.match(source, /isApprovedOpaqueLandscape\(relativeAsset, raw.sha256, hasTransparentPixels\(raw.data\)\)/);
 assert.match(source, /naturalOpaqueColor \? 0 : countChromaLeaks\(raw.data\)/);
 assert.match(source, /requireTightBounds && !tight/);
 assert.match(source, /g > 150 && r < 170 && b < 170 && \(g - Math.max\(r, b\)\) > 35/);
});
