import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { matchesExpectedExpedition, selectAndStartExpedition } from '../src/games/settlement/settlementExpeditionActions.js';

test('start waits for durable selection and receives the expected route', async () => {
  let release;
  const selected = new Promise(resolve => { release = resolve; });
  const starts = [];
  const result = selectAndStartExpedition('drowned-ruins', () => selected, id => { starts.push(id); return true; });
  await Promise.resolve();
  assert.deepEqual(starts, []);
  release();
  assert.equal(await result, true);
  assert.deepEqual(starts, ['drowned-ruins']);
});
test('failed selection cannot start an expedition', async () => {
  let starts = 0;
  assert.equal(await selectAndStartExpedition('ancient-forest', () => false, () => ++starts), false);
  await assert.rejects(selectAndStartExpedition('ancient-forest', () => Promise.reject(Error('storage failure')), () => ++starts));
  assert.equal(starts, 0);
});
test('stale target is rejected without breaking the existing no-argument API', () => {
  assert.equal(matchesExpectedExpedition('ancient-forest', 'drowned-ruins'), false);
  assert.equal(matchesExpectedExpedition('drowned-ruins', 'drowned-ruins'), true);
  assert.equal(matchesExpectedExpedition('ancient-forest'), true);
});
test('UI uses authoritative locks, blocks duplicate sends and respects save readiness', () => {
  const ui = readFileSync(new URL('../src/games/settlement/SettlementWorldMapScreen.jsx', import.meta.url), 'utf8');
  assert.equal(ui.split('!worldExpeditionUnlocked(expedition, stage)').length - 1, 2);
  assert.ok(ui.includes('if (sending.current || !persistenceReady) return;'));
  assert.ok(ui.includes('event.target !== event.currentTarget'));
  assert.ok(ui.includes('disabled={busy || active || pending || !persistenceReady}'));
  assert.ok(ui.includes('await selectAndStartExpedition'));
});
test('store guards expected selection within the existing serialized command', () => {
  const store = readFileSync(new URL('../src/games/settlement/useSettlementStore.js', import.meta.url), 'utf8');
  assert.ok(store.includes('startSelectedExpedition: (expectedExpeditionId = null)'));
  assert.ok(store.includes('if (!matchesExpectedExpedition(state.selectedExpeditionId, expectedExpeditionId)) return false;'));
});
test('research displays actual effects rather than seeded progress or unapplied bonuses', () => {
  const ui = readFileSync(new URL('../src/games/settlement/SettlementResearchTreeScreen.jsx', import.meta.url), 'utf8');
  assert.ok(!ui.includes('selectedNode.benefits'));
  assert.ok(!ui.includes('selectedNode.description'));
  assert.ok(!ui.includes('selectedNode.progress'));
  assert.ok(!ui.includes('node.progress'));
  assert.ok(ui.includes('activeResearch?.nodeId === node.id ? activeResearch : null'));
  assert.ok(ui.includes('formatClockDuration(nodeRemainingMs)'));
  assert.ok(ui.includes('Boolean(activeResearch)'));
  assert.ok(ui.includes('12 + (selectedActive ? activeResearch.toLevel'));
  assert.ok(ui.includes('Производственные и складские бонусы пока не подключены.'));
});
