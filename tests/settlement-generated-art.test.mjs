import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { UI_ASSETS, ALL_PIXI_ASSETS } from '../src/games/settlement/assetRegistry.js';
import { SETTLEMENT_CARD_MATERIAL, settlementFrameMaterial } from '../src/games/settlement/settlementIllustratedMaterials.js';
import { makeUvNineSlice } from '../src/games/settlement/settlementNineSlice.js';
const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
test('decorative material never overrides positioned HUD region anchors', () => {
 const css = read('src/games/settlement/settlementFrameArt.css');
 const common = css.split('.settlement-game-root .settlement-illustrated-frame {')[1].split('}')[0];
 assert.doesNotMatch(common, /position\s*:/);
 assert.match(css, /\.settlement-illustrated-frame:not\(\.hud-region\)\s*\{\s*position: relative/);
});
test('cold-entry no-World-art check uses actual request observation even without ResourceTiming', () => {
 const source = read('scripts/verify-settlement-illustrated-ui.mjs');
 assert.match(source, /page.on\('request', request =>/);
 assert.match(source, /observedArtRequests.add\(url.pathname\)/);
 assert.match(source, /artDelivery.requestedPaths.every\(path => !\/world-map-\|expedition-thumb-\//);
 assert.match(source, /entry.status >= 200 && entry.status < 300 && entry.bodyBytes > 0/);
});
test('flex drawer footer returns to flow instead of covering upgrade controls', () => {
 const css = read('src/games/settlement/settlementIllustratedKit.css');
 assert.match(css, /> \.panel-footer\s*\{\s*position: static !important;\s*inset: auto !important/);
});
test('narrow council copy has a full column and landscape card grids stay compact', () => {
 const css = read('src/games/settlement/settlementIllustratedKit.css');
 assert.match(css, /\.council-bottom-grid\s*\{\s*grid-template-columns: minmax\(0, 1fr\) !important/);
 assert.match(css, /\.construction-card-v2\s*\{\s*min-height: 88px !important;\s*grid-template-rows: auto 32px auto/);
 assert.match(css, /\.research-tech-node\s*\{\s*min-height: 88px !important;\s*grid-column: auto !important;\s*grid-row: auto !important;\s*grid-template-columns: 32px minmax\(0, 1fr\)/);
 assert.match(css, /span:not\(\.research-node-icon-slot\):not\(\.settlement-frame-art\)/);
});
test('all eight runtime derivatives match their recorded hashes and byte budget', () => {
 const manifest = JSON.parse(read('assets-source/imagegen/settlement/illustrated-v2/runtime-export-manifest.json'));
 assert.equal(manifest.assets.length, 8);
 let total = 0;
 for (const item of manifest.assets) {
  const bytes = readFileSync(new URL(item.runtime, root));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), item.runtime_sha256);
  assert.equal(bytes.length, item.bytes);
  assert.match(item.source_sha256, /^[a-f0-9]{64}$/);
  assert.match(item.source_library_file_id, /^libfile_/);
  total += bytes.length;
 }
 assert.equal(total, manifest.total_bytes);
 assert.ok(total < 400000);
});
test('world imagery uses genuine runtime exports and never joins city Pixi preload', () => {
 for (const key of ['worldMapBase','worldMapCompass','worldThumbForest','worldThumbRuins','worldThumbVolcano','worldThumbIce']) {
  assert.ok(UI_ASSETS[key].includes('/ui/illustrated-v2/'));
  assert.ok(!ALL_PIXI_ASSETS.includes(UI_ASSETS[key]));
 }
 assert.ok(ALL_PIXI_ASSETS.every(url => !url.includes('/illustrated-v2/')));
 const source = read('src/games/settlement/SettlementWorldMapScreen.jsx');
 assert.match(source, /<img src=\{thumb\}[^>]+loading="lazy"[^>]+decoding="async"/);
 assert.doesNotMatch(source, /frameStyle\(thumb\)/);
});
test('card UV uses exact half-size coordinates and default control art stays distinct', () => {
 const pieces = makeUvNineSlice(SETTLEMENT_CARD_MATERIAL);
 assert.equal(pieces.length, 9);
 assert.deepEqual(pieces[0].source, { x: 0, y: 64.5, width: 48, height: 48 });
 assert.equal(settlementFrameMaterial(UI_ASSETS.researchStudyButtonIdle), null);
 assert.equal(settlementFrameMaterial(UI_ASSETS.worldExpeditionCardSelected), SETTLEMENT_CARD_MATERIAL);
});
test('material-capable catalog controls keep native button semantics and live selection', () => {
 const shared = read('src/games/settlement/settlementViewShared.jsx');
 assert.match(shared, /as: Tag = 'div'/);
 for (const [file, handler] of [['SettlementConstructionScreen.jsx','onSelectItem(item.id)'],['SettlementResearchTreeScreen.jsx','onSelectNode(node.id)']]) {
  const source = read(`src/games/settlement/${file}`);
  assert.match(source, /<HudFrame as="button"/);
  assert.ok(source.includes(handler));
  assert.match(source, /aria-pressed=/);
 }
});
