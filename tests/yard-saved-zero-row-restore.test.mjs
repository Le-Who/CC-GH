import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareCanonicalSavedVisit, restoreCanonicalSavedVisit, canonicalSavedVisitRowsValid} from '../game-logic/yard-v2/canonical-saved-visit-bridge.mjs';
import {sampleR1SavedStay, r1SavedStayLayoutCompatible, r1SavedStayGeometry} from '../src/games/companion-yard-v2/pip-prototype/canonical-saved-stay.mjs';

const input = {
  candidate: {visitId: 'visit_v2_zero_row_restore', visitorId: 'pip_hamster', goodieId: 'leaf_pot', activityId: 'peek', slotId: 'canonical:a', arrivedAt: 1000, leavesAt: 1000 + 45 * 60000},
  rows: [{slotId: 'canonical:a', goodieId: 'leaf_pot', locationId: 'pip-garden', locationVersion: 1, geometryRevision: 'pip-garden-t2-r1', itemGeometryRevision: 'yard-succulent-T2', x: 98, y: 118, condition: 'new', uses: 0, placedAt: 1}],
  bowl: {id: 'bowl-1', foodId: 'kibble', servings: 4, placedAt: 1, expiresAt: 7200000},
};
const prepared = prepareCanonicalSavedVisit(input);
assert.equal(prepared.prepared, true, prepared.code);
const {record, plan} = prepared;

test('released last-item pickup keeps warm samples and cold source replay identical through departure', () => {
  const before = JSON.stringify(record);
  for (const now of [plan.releaseAt, plan.releaseAt + 1, plan.departureAt, plan.leavesAt - 1]) {
    const expected = sampleR1SavedStay(plan, now, {rows: record.after.rows});
    const warm = sampleR1SavedStay(plan, now, {rows: []});
    assert.deepEqual(warm, expected, `warm pickup at ${now}`);
    const cold = restoreCanonicalSavedVisit(JSON.parse(before), {rows: [], serverNow: now});
    assert.equal(cold.prepared, true, cold.code);
    assert.deepEqual(cold.plan, plan);
    assert.deepEqual(cold.sample, expected);
    assert.equal(cold.plan.leavesAt, input.candidate.leavesAt);
  }
  assert.equal(JSON.stringify(record), before);
  const terminal = restoreCanonicalSavedVisit(JSON.parse(before), {rows: [], serverNow: plan.leavesAt});
  assert.equal(terminal.prepared, true, terminal.code);
  assert.equal(terminal.sample.phase, 'departed');
  assert.equal(terminal.sample.sample, null);
});

test('real two-prop source plan does not inherit the sole-target removal allowance', () => {
  const two = structuredClone(input);
  two.rows.push({...two.rows[0], slotId: 'canonical:second', x: 70, y: 150});
  const preparedTwo = prepareCanonicalSavedVisit(two);
  assert.equal(preparedTwo.prepared, true, preparedTwo.code);
  const geometry = r1SavedStayGeometry();
  for (const rows of [[], [preparedTwo.record.after.rows[0]], [preparedTwo.record.after.rows[1]]]) {
    assert.equal(r1SavedStayLayoutCompatible(preparedTwo.plan, preparedTwo.plan.releaseAt, geometry, rows), false);
  }
});

test('zero current rows do not admit an empty visit or permit pre-release or untimed pickup', () => {
  assert.equal(canonicalSavedVisitRowsValid([]), false);
  assert.equal(prepareCanonicalSavedVisit({...input, rows: []}).prepared, false);
  assert.equal(sampleR1SavedStay(plan, plan.releaseAt - 1, {rows: []}).phase, 'unavailable');
  assert.equal(restoreCanonicalSavedVisit(record, {rows: [], serverNow: plan.releaseAt - 1}).prepared, false);
  assert.equal(restoreCanonicalSavedVisit(record, {rows: []}).prepared, false);
  for (const rows of [null, {}, [null]]) {
    assert.equal(restoreCanonicalSavedVisit(record, {rows, serverNow: plan.releaseAt}).prepared, false);
  }
});

test('removal allowance does not mask geometry, unrelated-row, or target-identity changes', () => {
  const geometry = r1SavedStayGeometry();
  const changedGeometry = structuredClone(geometry);
  changedGeometry.domain.min[0] += 1;
  assert.equal(r1SavedStayLayoutCompatible(plan, plan.releaseAt, changedGeometry, []), false);
  const differentTarget = structuredClone(plan);
  differentTarget.inspectionPlan.target.x += 1;
  assert.equal(r1SavedStayLayoutCompatible(differentTarget, plan.releaseAt, geometry, []), false);
  const anotherRow = {...record.after.rows[0], slotId: 'canonical:other'};
  assert.equal(r1SavedStayLayoutCompatible(plan, plan.releaseAt, geometry, [anotherRow]), false);
  const relocated = {...record.after.rows[0], x: record.after.rows[0].x + 1};
  assert.equal(r1SavedStayLayoutCompatible(plan, plan.releaseAt, geometry, [relocated]), false);
});

test('existing same-target wear compatibility remains monotonic and release-bounded', () => {
  const geometry = r1SavedStayGeometry();
  const nextUse = [{...record.after.rows[0], uses: record.after.rows[0].uses + 1}];
  assert.equal(r1SavedStayLayoutCompatible(plan, plan.releaseAt, geometry, nextUse), true);
  assert.equal(r1SavedStayLayoutCompatible(plan, plan.releaseAt - 1, geometry, nextUse), false);
  for (const uses of [0, 8, -1, 1.5]) {
    assert.equal(r1SavedStayLayoutCompatible(plan, plan.releaseAt, geometry, [{...nextUse[0], uses}]), false);
  }
});
