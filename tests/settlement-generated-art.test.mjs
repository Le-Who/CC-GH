import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { UI_ASSETS, ALL_PIXI_ASSETS } from '../src/games/settlement/assetRegistry.js';
import { SETTLEMENT_CARD_MATERIAL, settlementFrameMaterial } from '../src/games/settlement/settlementIllustratedMaterials.js';
import { makeUvNineSlice } from '../src/games/settlement/settlementNineSlice.js';
const root = new URL('../', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8');
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
