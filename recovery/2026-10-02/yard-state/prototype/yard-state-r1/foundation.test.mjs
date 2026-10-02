import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createDefaultPlayer } from '../../design/yard-v2/baseline-47519/game-logic/player.js';
import { simulateYardState as legacySimulate, normalizeYardState as legacyNormalize,
  applyYardActionToState as legacyAction } from '../../design/yard-v2/baseline-47519/game-logic/yard.js';
import { YARD_GOODIES, YARD_VISITORS, YARD_REMODELS, getYardGoodieCapacity,
  INVENTORY_ONLY_GOODS, LEGACY_ROOM_GOODIE_MAP } from './catalog.mjs';
import { migratePlayerSnapshot, restoreRawInput, ownership, walletSnapshot } from './migration.mjs';
import { advanceYard, applyPrototypeAction, isReserved, visitPhase } from './simulation.mjs';
import { validateLayout, footprint, buildNavigation, approachPoint } from './geometry.mjs';
import { clone, digest } from './util.mjs';
const H = 3600000, M = 60000;
const baseline = () => createDefaultPlayer('fixture', 'Fixture', 0);
function fixture(seed = 'stable') {
  let state = migratePlayerSnapshot(baseline(), { now: 0, seed });
  for (const [action, payload] of [
    ['yard.placeGoodie', { slotId: 'mouse', goodieId: 'yarn_mouse', x: 35, y: 62 }],
    ['yard.placeGoodie', { slotId: 'cushion', goodieId: 'sun_cushion', x: 68, y: 66 }],
    ['yard.setFood', { foodId: 'kibble' }],
  ]) {
    const result = applyPrototypeAction(state, action, payload, { now: 0 });
    assert.equal(result.status, 200, JSON.stringify(result.details)); state = result.state;
  }
  return state;
}
const sumVisits = (yard) => Object.values(yard.petbook).reduce((n, p) => n + p.visits, 0);
const initial = fixture();
const report = { scope: 'Isolated pure-state foundation, not production/API/game integration', baselineSha: '47519ad79796f4b3dfefd2a5f1bfb73cb08a6e86' };

test('exact baseline blob provenance and real factories are available without editing source', async () => {
  for (const filename of ['provenance.json', 'dependency-provenance.json', 'integration-provenance.json']) {
    const root = new URL('../../design/yard-v2/baseline-47519/', import.meta.url);
    const manifest = JSON.parse(await readFile(new URL(filename, root), 'utf8'));
    for (const row of manifest.files) {
      const bytes = await readFile(new URL(row.path, root));
      assert.equal(bytes.length, row.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256);
      assert.equal(createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest('hex'), row.gitBlobSha);
    }
  }
  assert.equal(baseline().schemaVersion, 11);
  assert.equal(Object.keys(YARD_VISITORS).length, 8);
  assert.equal(Object.keys(YARD_GOODIES).length, 11);
  for (const id of ['moon_lamp', 'fountain_bowl', 'cloud_bed', 'book_nook']) assert.equal(YARD_GOODIES[id].id, id);
});

test('source regression: baseline90-minute catchup changes outcomes with polling, new clock does not', () => {
  const source = clone(initial.player.yard);
  const one = legacySimulate(source, 90 * M, {}, 'audit');
  let partitioned = source;
  for (let i = 1; i <= 90; i++) partitioned = legacySimulate(partitioned, i * M, {}, 'audit');
  assert.equal(sumVisits(one), 2); assert.equal(sumVisits(partitioned), 4);
  const fixedOne = advanceYard(initial, 90 * M);
  let fixedMany = initial;
  for (let i = 1; i <= 90; i++) fixedMany = advanceYard(fixedMany, i * M);
  assert.deepEqual(fixedMany, fixedOne);
  report.legacy90MinuteVisits = { oneRequest: 2, minutePolling: 4 };
  report.fixed90MinuteVisits = { oneRequest: sumVisits(fixedOne.player.yard), minutePolling: sumVisits(fixedMany.player.yard), entireEnvelopeEqual: true };
});

test('catchup/reload and arbitrary partitions give identical events, gifts, resources and history', () => {
  const end = 12 * H;
  const once = advanceYard(initial, end);
  let sliced = JSON.parse(JSON.stringify(initial));
  const times = [1, 19 * M, H, H + 777, 91 * M, 2 * H, 4 * H, 7 * H + 17, end];
  for (const at of times) sliced = JSON.parse(JSON.stringify(advanceYard(sliced, at)));
  assert.deepEqual(sliced, once);
  assert.deepEqual(advanceYard(once, end), once);
  assert.throws(() => advanceYard(once, end - 1), /rewind/);
  assert.deepEqual(initial.migration.rawBackup, baseline());
});

test('mid-interaction reload resumes the same reserved visit rather than creating a new visit', () => {
  const state = advanceYard(initial, H);
  assert.ok(Object.keys(state.runtime.visits).length > 0);
  const visit = Object.values(state.runtime.visits)[0];
  const at = visit.timeline.interactAt + 1000;
  const active = advanceYard(state, at), reloaded = JSON.parse(JSON.stringify(active));
  assert.equal(visitPhase(reloaded.runtime.visits[visit.visitId], at), 'interaction');
  assert.deepEqual(advanceYard(reloaded, at + 1000), advanceYard(active, at + 1000));
  assert.equal(Object.keys(reloaded.runtime.visits).length, Object.keys(active.runtime.visits).length);
});

test('food admission remains probabilistic, and ownership/project crafting never guarantees a visit', () => {
  let denied = false, accepted = false;
  for (let i = 0; i < 12; i++) {
    const result = advanceYard(fixture(`probability-${i}`), H);
    const n = Object.keys(result.runtime.visits).length;
    denied ||= n === 0; accepted ||= n > 0;
  }
  assert.ok(denied && accepted);
  const player = baseline();
  player.yard.goodieInventory.alchemy_living_arbor = 4;
  player.yard.goodieInventory.alchemy_echo_chimes = 6;
  player.merge.projects = { unlockedIds: ['living_arbor', 'echo_chimes'], selectedId: 'echo_chimes', crafted: { living_arbor: 4, echo_chimes: 6 } };
  const migrated = migratePlayerSnapshot(player, { now: 0 });
  const result = advanceYard(migrated, 72 * H);
  assert.equal(Object.keys(result.runtime.visits).length, 0);
  assert.equal(result.player.yard.goodieInventory.alchemy_living_arbor, 4);
  assert.deepEqual(result.player.merge, player.merge);
});

test('each admitted visitor has a reachable route, exclusive socket and correct prop capacity', () => {
  const state = advanceYard(initial, 8 * H);
  for (const record of Object.values(state.runtime.visits)) {
    assert.ok(record.route.points.length >= 2);
    assert.ok(record.route.length >= 0);
    assert.ok(record.timeline.alignAt > record.arrivedAt);
    assert.ok(record.timeline.interactAt < record.releaseAt);
  }
  for (let t = 0; t <= 8 * H; t += 5 * M) {
    const at = advanceYard(initial, t);
    const active = Object.values(at.runtime.visits).filter((r) => isReserved(r, t));
    assert.equal(new Set(active.map((r) => `${r.slotId}:${r.activityId}`)).size, active.length);
    for (const placed of at.player.yard.placedGoodies) {
      assert.ok(active.filter((r) => r.slotId === placed.slotId).length <= getYardGoodieCapacity(YARD_GOODIES[placed.goodieId]));
    }
  }
});

test('semantic gifts are earned once at departure, regardless of skipped renders and repeat advancement', () => {
  const completed = advanceYard(initial, 8 * H);
  const visits = Object.values(completed.runtime.visits);
  assert.ok(visits.length > 0);
  assert.equal(completed.player.yard.pendingGifts.length, visits.length);
  assert.equal(new Set(completed.player.yard.pendingGifts.map((g) => g.id)).size, visits.length);
  for (const record of visits) {
    const gift = completed.player.yard.pendingGifts.find((g) => g.id === record.giftId);
    assert.equal(gift.createdAt, record.leavesAt);
    assert.equal(record.status, 'completed');
  }
  assert.deepEqual(advanceYard(completed, 8 * H), completed);
  report.giftExactlyOnceVisits = visits.length;
});

test('source-compatible legacy active visit produces the same reward and gift ID without duplication', () => {
  const yard = legacySimulate(clone(initial.player.yard), H, {}, 'audit');
  assert.ok(yard.activeVisitors.length > 0);
  for (const b of yard.bowls) Object.assign(b, { foodId: null, servings: 0, placedAt: null, expiresAt: null });
  const end = Math.max(...yard.activeVisitors.map((v) => v.leavesAt));
  const expected = legacySimulate(yard, end, {}, 'audit');
  const p = baseline(); p.yard = clone(yard);
  const actual = advanceYard(migratePlayerSnapshot(p, { now: H }), end);
  assert.deepEqual(actual.player.yard.pendingGifts, expected.pendingGifts);
  assert.equal(actual.player.yard.activeVisitors.length, 0);
});

test('claims are idempotent across reload and a different later claim nonce cannot pay the same gifts twice', () => {
  const completed = advanceYard(initial, 8 * H);
  const expected = completed.player.yard.pendingGifts.reduce((a, g) => ({ treats: a.treats + g.treats, shinyTreats: a.shinyTreats + g.shinyTreats }), { treats: 0, shinyTreats: 0 });
  const originalWallet = walletSnapshot(completed.player);
  const claim = applyPrototypeAction(completed, 'yard.collectGifts', {}, { now: 8 * H, actionId: 'claim-one' });
  assert.equal(claim.status, 200);
  assert.equal(claim.state.player.yard.currencies.treats, originalWallet.yardCurrencies.treats + expected.treats);
  const replay = applyPrototypeAction(JSON.parse(JSON.stringify(claim.state)), 'yard.collectGifts', {}, { now: 8 * H, actionId: 'claim-one' });
  assert.equal(replay.extras.replayed, true);
  assert.deepEqual(replay.state, claim.state);
  const another = applyPrototypeAction(claim.state, 'yard.collectGifts', {}, { now: 8 * H, actionId: 'claim-two' });
  assert.equal(another.extras.receipt.collected.gifts, 0);
  assert.deepEqual(another.state.player.resources, completed.player.resources);
  assert.deepEqual(another.state.player.merge, completed.player.merge);
});

test('105 pending gifts and110 album photos are preserved, unlike the baseline caps', () => {
  const p = baseline(), ids = Object.keys(YARD_VISITORS);
  p.yard.pendingGifts = Array.from({ length: 105 }, (_, i) => ({ id: `legacy-gift-${i}`, visitorId: ids[i % ids.length], treats: i + 1,
    shinyTreats: i % 3 === 0 ? 1 : 0, mementoId: null, createdAt: i }));
  p.yard.album.photos = Array.from({ length: 110 }, (_, i) => ({ id: `photo-${i}`, visitorId: ids[i % ids.length], goodieId: 'sun_cushion',
    pose: 'nap', remodel: 'meadow', capturedAt: i, caption: 'legacy album', favorite: i === 0 }));
  p.yard.album.favoritePhotoId = 'photo-0';
  const normalized = legacyNormalize(p.yard, {}, 0);
  assert.equal(normalized.pendingGifts.length, 100); assert.equal(normalized.album.photos.length, 80);
  const migrated = migratePlayerSnapshot(p, { now: 0 });
  assert.deepEqual(migrated.player, p);
  assert.equal(migrated.player.yard.pendingGifts.length, 105); assert.equal(migrated.player.yard.album.photos.length, 110);
  const result = applyPrototypeAction(migrated, 'yard.collectGifts', {}, { now: 0, actionId: 'all-105' });
  assert.equal(result.extras.receipt.collected.gifts, 105);
  assert.equal(result.state.player.yard.currencies.treats, p.yard.currencies.treats + p.yard.pendingGifts.reduce((n, g) => n + g.treats, 0));
  assert.deepEqual(restoreRawInput(result.state), p);
  report.historyPreservation = { pendingGifts: 105, albumPhotos: 110, baselineCaps: [100, 80] };
});

test('migration retains every visitor/goodie/remodel, quantities, wallets and unknown nested fields without aliasing', () => {
  const p = baseline();
  p.resources.gold = 123456; p.resources.gachaTokens = 789; p.merge.alchemyEssence = 4567;
  p.merge.exchangeClaims = { '2026-10-01': { verifiedLegacyOffer: 3 } };
  p.yard.currencies.treats = 987654; p.yard.currencies.shinyTreats = 321;
  p.yard.goodieInventory = Object.fromEntries(Object.keys(YARD_GOODIES).map((id, i) => [id, i + 1000]));
  p.yard.goodieInventory.alchemy_living_arbor = 5; p.yard.goodieInventory.alchemy_echo_chimes = 6;
  p.yard.goodieInventory.futureUnknownGoodie = 17;
  p.yard.petbook = Object.fromEntries(Object.keys(YARD_VISITORS).map((id) => [id, { visits: 1234, firstSeenAt: 1, lastSeenAt: 2,
    favoriteGoodies: { book_nook: 50 }, mementoReceived: true }]));
  p.yard.mementos = Object.fromEntries(Object.values(YARD_VISITORS).map((v) => [v.id, { id: v.memento.id, visitorId: v.id, name: v.memento.name, receivedAt: 2 }]));
  p.yard.expansion.level = 2; p.yard.remodel = 'tea_house'; p.yard.ownedRemodels = Object.keys(YARD_REMODELS);
  // Explicit synthetic forward-compatibility sentinels, not claimed legacy contract fields.
  p.futureExtension = { nested: [null, { untouched: 'opaque' }] }; p.yard.futureExtension = { receipts: ['opaque-existing-value'] };
  const migrated = migratePlayerSnapshot(p, { now: 0 });
  assert.deepEqual(migrated.player, p); assert.deepEqual(restoreRawInput(migrated), p);
  assert.deepEqual(walletSnapshot(migrated.player), walletSnapshot(p));
  assert.deepEqual(ownership(migrated.player.yard), ownership(p.yard));
  assert.deepEqual(migratePlayerSnapshot(migrated, { now: 99 }), migrated);
  migrated.player.futureExtension.nested[1].untouched = 'changed'; assert.equal(p.futureExtension.nested[1].untouched, 'opaque');
});

test('legacy room transfer preserves raw room data and avoids duplicate grants for repeated ownership IDs', () => {
  const p = baseline(); delete p.yard;
  p.room.inventory = Object.keys(LEGACY_ROOM_GOODIE_MAP);
  p.room.roomInventory = ['deco_chair']; p.room.decorations = ['deco_chair', 'deco_bed'];
  const result = migratePlayerSnapshot(p, { now: 0 });
  for (const id of Object.values(LEGACY_ROOM_GOODIE_MAP)) assert.equal(result.player.yard.goodieInventory[id], 1);
  assert.deepEqual(result.player.room, p.room);
  assert.equal(result.player.yard.placedGoodies.length, 0);
  assert.equal(result.migration.receipt.automaticLegacyPlacement, false);
  assert.deepEqual(restoreRawInput(result), p);
});

test('Merge six-project contract retains exact owned inventory counts and blocks only unsupported placement', async () => {
  const contracts = JSON.parse(await readFile(new URL('../../design/yard-v2/merge-contract-recovered/projects-contract.json', import.meta.url), 'utf8'));
  assert.equal(contracts.projects.length, 6);
  assert.deepEqual(contracts.projects.filter((p) => p.output.newId).map((p) => p.output.itemId).sort(), [...INVENTORY_ONLY_GOODS].sort());
  assert.equal(contracts.contract.visitorGranted, false);
  const p = baseline(); for (const project of contracts.projects) p.yard.goodieInventory[project.output.itemId] = 3;
  let state = migratePlayerSnapshot(p, { now: 0 });
  for (const goodieId of INVENTORY_ONLY_GOODS) {
    const result = applyPrototypeAction(state, 'yard.placeGoodie', { goodieId, slotId: goodieId, x: 50, y: 60 }, { now: 0 });
    assert.equal(result.status, 400); assert.match(result.error, /owned-inventory-only/);
    assert.equal(result.state.player.yard.goodieInventory[goodieId], 3);
  }
});

test('move-to-exact-overlap reproduces baseline200 but the new footprint validator rejects without moving', () => {
  const raw = clone(initial.player.yard);
  const old = legacyAction(raw, 'yard.moveGoodie', { slotId: 'cushion', x: 35, y: 62 }, {}, 'audit', { now: 0 });
  assert.equal(old.status, 200);
  const result = applyPrototypeAction(initial, 'yard.moveGoodie', { slotId: 'cushion', x: 35, y: 62 }, { now: 0 });
  assert.equal(result.status, 400);
  assert.ok(result.details.some((e) => e.code === 'FOOTPRINT_COLLISION'));
  assert.deepEqual(result.state.player.yard.placedGoodies, initial.player.yard.placedGoodies);
  assert.deepEqual(ownership(result.state.player.yard), ownership(initial.player.yard));
  report.exactOverlapMove = { baselineStatus: 200, prototypeStatus: 400 };
});

test('placement tests full footprints, entry exclusions and topology rather than just center points', () => {
  const edge = applyPrototypeAction(initial, 'yard.moveGoodie', { slotId: 'mouse', x: 4, y: 48 }, { now: 0 });
  assert.equal(edge.status, 400); assert.ok(edge.details.some((e) => e.code === 'FOOTPRINT_OUTSIDE_PLAYZONE'));
  const gate = applyPrototypeAction(initial, 'yard.moveGoodie', { slotId: 'mouse', x: 50, y: 92 }, { now: 0 });
  assert.equal(gate.status, 400); assert.ok(gate.details.some((e) => e.code === 'EXCLUSION_COLLISION'));
  const blocked = validateLayout(initial.player.yard, { exclusions: [{ x: 0, y: 80, width: 100, height: 4 }] });
  assert.equal(blocked.ok, false); assert.ok(blocked.errors.some((e) => e.code === 'PROP_UNREACHABLE'));
  const noAdmissions = advanceYard(initial, 2 * H, { scene: { exclusions: [{ x: 0, y: 80, width: 100, height: 4 }] } });
  assert.equal(Object.keys(noAdmissions.runtime.visits).length, 0);
  assert.equal(noAdmissions.player.yard.bowls[0].servings, initial.player.yard.bowls[0].servings);
});

test('valid routes clear all obstacles and active reservations prevent move/pickup', () => {
  const layout = validateLayout(initial.player.yard); assert.equal(layout.ok, true);
  const nav = buildNavigation(initial.player.yard);
  for (const activities of Object.values(layout.routes)) for (const route of Object.values(activities)) {
    for (let i = 1; i < route.points.length; i++) assert.equal(nav.segment(route.points[i - 1], route.points[i]), true);
  }
  const active = advanceYard(initial, H); const record = Object.values(active.runtime.visits)[0];
  assert.ok(isReserved(record, H));
  for (const action of ['yard.moveGoodie', 'yard.pickupGoodie']) {
    const result = applyPrototypeAction(active, action, { slotId: record.slotId, x: 35, y: 70 }, { now: H });
    assert.equal(result.status, 400); assert.match(result.error, /reserved/);
  }
});

test('clock work cap and malformed migration are explicit failures, never silent truncation/reset', () => {
  const before = digest(initial);
  assert.throws(() => advanceYard(initial, 100 * H, { maxEvents: 2 }), /budget/);
  assert.equal(digest(initial), before);
  const p = baseline(); p.yard.pendingGifts = [{ id: 'duplicate', treats: 2, shinyTreats: 0 }, { id: 'duplicate', treats: 2, shinyTreats: 0 }];
  const migrated = migratePlayerSnapshot(p, { now: 0 });
  assert.deepEqual(migrated.player, p);
  assert.throws(() => advanceYard(migrated, H), /DUPLICATE_GIFT_ID/);
});

test('gift/action IDs that match Object prototype names cannot bypass claims or mutate prototypes', () => {
  const p = baseline(); p.yard.pendingGifts = [{ id: '__proto__', visitorId: 'mika_cat', treats: 5, shinyTreats: 0, mementoId: null, createdAt: 0 }];
  const s = migratePlayerSnapshot(p, { now: 0 });
  const claimed = applyPrototypeAction(s, 'yard.collectGifts', {}, { now: 0, actionId: 'toString' });
  assert.equal(claimed.status, 200); assert.equal(claimed.extras.receipt.collected.treats, 5);
  assert.equal(claimed.state.player.yard.currencies.treats, p.yard.currencies.treats + 5);
  assert.ok(Object.hasOwn(claimed.state.runtime.giftLedger, '__proto__'));
  assert.ok(Object.hasOwn(claimed.state.runtime.actionReceipts, 'toString'));
  assert.equal(Object.prototype.status, undefined);
});

test('persist a concise validation report for checkpoint review', async () => {
  report.currencyIsolation = ['player.resources.gold', 'player.resources.gachaTokens', 'player.yard.currencies.treats',
    'player.yard.currencies.shinyTreats', 'player.merge.alchemyEssence'];
  report.preservedCatalogCounts = { visitors: 8, goodies: 11, mergeProjectOutputs: 6, inventoryOnlyNewGoodies: 2 };
  report.integrationStatus = 'NOT INTEGRATED: proposed sidecar envelope/schema and scene adapters require review';
  await writeFile(new URL('./VALIDATION.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
});
