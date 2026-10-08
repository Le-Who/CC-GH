import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const source = name => readFileSync(new URL(`../src/games/settlement/${name}`, import.meta.url), 'utf8');
test('illustrated material is imported after legacy Settlement styles', () => {
 const s = source('SettlementGame.jsx');
 assert.ok(s.indexOf("import './settlementIllustratedKit.css'") > s.indexOf("import './settlement.css'"));
});
test('live sheet art follows current production, order and growth context', () => {
 const s = source('SettlementPlayPanel.jsx');
 assert.match(s, /tab === 'orders' \? 'market-green'/);
 assert.match(s, /milestone\?\.buildingId/);
 assert.match(s, /trimmedAsset\(buildingAsset\(illustratedBuildingId/);
 assert.match(s, /state.levels\[illustratedBuildingId\]/);
 assert.match(s, /id="settlementCompactDetail"/);
});
test('constructed-building hero resolves authored art instead of synthetic record IDs', () => {
 const s = source('SettlementBuildingPanel.jsx');
 assert.match(s, /building.constructionItem\?\.assetBuildingId \?\? building.id/);
 assert.match(s, /trimmedAsset\(buildingAsset\(illustratedBuildingId, illustratedLevel\)\)/);
 assert.match(s, /onDemolish\?\.\(building.id\)/);
 assert.match(s, /onUpgrade\(building.id\)/);
});
test('nine-slice preserves frame geometry and compact thumbnails adapt to available panel width', () => {
 const s = source('settlementIllustratedKit.css');
 assert.match(s, /border-image-slice: 104 80 92 80 fill/);
 assert.match(s, /border-image-slice: 30 48 fill/);
 assert.match(s, /@container \(min-width: 340px\)/);
 assert.match(s, /min-height: 44px/);
 assert.doesNotMatch(s, /url\([^)]*qa-exports|data:image\/svg|position:\s*fixed|z-index:/);
});
