import test from 'node:test';
import assert from 'node:assert/strict';
import {bindMikaPersistedItems, planMikaItemApproach} from '../src/games/companion-yard-v2/mika-qa/mika-item-approach.mjs';
import {sampleMikaYardQaCruise, polygonHitsBox} from '../src/games/companion-yard-v2/mika-qa/mika-yard-route.mjs';
import calibration from '../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json' with {type: 'json'};
import envelope from '../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json' with {type: 'json'};
import {createProjection} from '../src/games/companion-yard-v2/projection.mjs';

import {mikaItemFixture as fixture} from './fixtures/mika-item-input.mjs';

test('native binding reads current placed identity and shipped geometry without mutating inventory or snapshots', () => {
  const {snapshot, view} = fixture(), before = structuredClone(snapshot);
  const bound = bindMikaPersistedItems(snapshot, view);
  assert.equal(bound.ok, true, bound.reason);
  assert.equal(bound.binding.items[0].slotId, 'mouse-1');
  assert.deepEqual(bound.binding.location, {id: 'released-meadow-mask/v1', unitsPerSource: 8, domain: [0, 0, 100, 100]});
  assert.equal(bound.binding.items[0].box.width, 8.8);
  assert.deepEqual(snapshot, before);
  assert.equal(Object.isFrozen(bound.binding.items[0].box), true);
});

test('repositioned current items select different reachable finite approaches facing the item', () => {
  const ends = new Set();
  for (const [goodieId, x, y, rotationZ] of [
    ['yarn_mouse', 64, 54, 0], ['yarn_mouse', 42, 62, 0], ['yarn_mouse', 70, 70, Math.PI / 2],
    ['sun_cushion', 70, 70, 0],
  ]) {
    const {snapshot, view} = fixture([{slotId: 'target', goodieId, x, y, rotationZ, condition: 'new'}]);
    const bound = bindMikaPersistedItems(snapshot, view), candidate = planMikaItemApproach(bound, calibration, envelope);
    assert.equal(candidate.ok, true, `${goodieId} ${x},${y}: ${candidate.reason}`);
    assert.equal(candidate.interactionReady, false);
    for (const box of bound.binding.layout.obstacles) assert.equal(polygonHitsBox(candidate.plan.sweep, box), false);
    for (const t of [0, .1, .7, 1.23, 2.67, 3.999, 4, 1.23, 0])
      assert.equal(sampleMikaYardQaCruise(candidate.plan, bound.binding.layout, t).status, 'ready');
    const end = sampleMikaYardQaCruise(candidate.plan, bound.binding.layout, 4), heading = end.sample.root.heading;
    const dx = x - end.position.x, dy = y - end.position.y;
    assert.ok((Math.cos(heading) * dx + Math.sin(heading) * dy) / Math.hypot(dx, dy) >= Math.cos(Math.PI / 6));
    ends.add(JSON.stringify(end.position));
  }
  assert.equal(ends.size, 4);
});

test('Pip space, visitors, stale presentations, unknown props and ambiguous placements fail closed', () => {
  const mutations = [
    (s) => { s.yardRuntime.storageVersion = 3; },
    (s) => { s.yardRuntime.canonicalVisitProtocol = 'yard-canonical-visit/v1'; },
    (s) => { s.yardRuntime.canonicalPlacements.push({slotId: 'pip', goodieId: 'leaf_pot', x: 150, y: 170}); },
    (s) => { s.yardRuntime.visits.push({visitorId: 'pip_hamster', renderCompatible: false}); },
    (s) => { s.yardRuntime.reservations.push({slotId: 'mouse-1'}); },
    (s) => { s.yardRuntime.status = 'review-required'; },
    (s) => { s.yard.placedGoodies[0].x++; },
    (s) => { s.yard.placedGoodies[0].goodieId = 'leaf_pot'; },
    (s) => { s.yard.placedGoodies.push({...s.yard.placedGoodies[0]}); },
    (s) => { s.yard.bowls.push({id: 'bowl-2'}); },
    (s) => { s.yard.placedGoodies[0].condition = 'worn'; },
    (s, v) => { v.props[0].transform.rotationZ = .1; },
    (s, v) => { v.props[0].drawStandalone = false; },
  ];
  for (const mutate of mutations) {
    const {snapshot, view} = fixture(); mutate(snapshot, view);
    assert.equal(bindMikaPersistedItems(snapshot, view).ok, false);
  }
  const empty = fixture([]), bound = bindMikaPersistedItems(empty.snapshot, empty.view);
  assert.equal(bound.ok, true);
  assert.equal(planMikaItemApproach(bound, calibration, envelope).reason, 'NATIVE_ITEM_TARGET_UNAVAILABLE');
});

test('moving or picking up a target changes its binding; stale route cancels without implicit replan', () => {
  const first = fixture(), bound = bindMikaPersistedItems(first.snapshot, first.view);
  const candidate = planMikaItemApproach(bound, calibration, envelope);
  assert.equal(candidate.ok, true);
  const next = fixture([{slotId: 'mouse-1', goodieId: 'yarn_mouse', x: 42, y: 62, condition: 'new'}]);
  const moved = bindMikaPersistedItems(next.snapshot, next.view);
  assert.notEqual(moved.key, bound.key);
  assert.deepEqual(sampleMikaYardQaCruise(candidate.plan, moved.binding.layout, 1), {status: 'aborted', reason: 'LAYOUT_CHANGED'});
  assert.equal(sampleMikaYardQaCruise(candidate.plan, bound.binding.layout, 1).status, 'aborted');
  const picked = fixture([]); assert.notEqual(bindMikaPersistedItems(picked.snapshot, picked.view).key, bound.key);
});

test('a viewport or complete obstacle veto cannot fall back to the unbound cruise', () => {
  const f = fixture(), bound = bindMikaPersistedItems(f.snapshot, f.view);
  assert.deepEqual(planMikaItemApproach(bound, calibration, envelope, {acceptSweep: () => false}),
    {ok: false, reason: 'NO_CLEAR_NATIVE_ITEM_APPROACH'});
  const blocked = structuredClone(bound);
  blocked.binding.layout.obstacles.push({id: 'block-all', x: 0, y: 0, width: 100, height: 100});
  assert.equal(planMikaItemApproach(blocked, calibration, envelope).ok, false);
});

test('a reachable but portrait-clipped target and the crowded default layout decline without changing camera or obstacles', () => {
  for (const rows of [
    [{slotId: 'target', goodieId: 'yarn_mouse', x: 42, y: 62, condition: 'new'}],
    [{slotId: 'mouse', goodieId: 'yarn_mouse', x: 45, y: 45, condition: 'new'},
      {slotId: 'cushion', goodieId: 'sun_cushion', x: 54, y: 66, condition: 'new'}],
  ]) {
    const f = fixture(rows), bound = bindMikaPersistedItems(f.snapshot, f.view), before = JSON.stringify(bound);
    for (const [width, height] of [[320, 420], [390, 650]]) {
      const projection = createProjection(width, height);
      const candidate = planMikaItemApproach(bound, calibration, envelope, {acceptSweep: (sweep, vertical) =>
        sweep.every(point => [vertical.min, vertical.max].every(z => {
          const p = projection.project({...point, z});
          return p.x >= 3 && p.y >= 3 && p.x <= width - 3 && p.y <= height - 3;
        }))});
      assert.deepEqual(candidate, {ok: false, reason: 'NO_CLEAR_NATIVE_ITEM_APPROACH'});
      assert.equal(JSON.stringify(bound), before);
    }
  }
});
