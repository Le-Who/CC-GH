import test from 'node:test';
import assert from 'node:assert/strict';
import calibration from '../src/games/companion-yard-v2/mika-qa/mika-p2-calibration.json' with {type: 'json'};
import envelope from '../src/games/companion-yard-v2/mika-qa/mika-p2-skin-envelope.json' with {type: 'json'};
import {mikaItemFixture} from './fixtures/mika-item-input.mjs';
import {bindMikaPersistedItems, planMikaItemArrival} from '../src/games/companion-yard-v2/mika-qa/mika-item-approach.mjs';
import {sampleMikaYardQaCruise, polygonHitsBox} from '../src/games/companion-yard-v2/mika-qa/mika-yard-route.mjs';
import {createProjection} from '../src/games/companion-yard-v2/projection.mjs';

const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
function prepare(x, y, viewport) {
  const f = mikaItemFixture([{slotId: 'current-item', goodieId: 'yarn_mouse', x, y, condition: 'new'}]);
  const bound = bindMikaPersistedItems(f.snapshot, f.view);
  const projection = viewport && createProjection(...viewport);
  const options = projection ? {acceptSweep: (sweep, vertical) => sweep.every(point =>
    [vertical.min, vertical.max].every(z => {
      const p = projection.project({...point, z});
      return p.x >= 3 && p.y >= 3 && p.x <= viewport[0] - 3 && p.y <= viewport[1] - 3;
    }))} : {};
  return {...f, bound, candidate: planMikaItemArrival(bound, calibration, envelope, options)};
}

test('three current item positions admit the whole arrival and idle in unchanged normal cameras', () => {
  const terminalRoots = new Set();
  for (const [x, y] of [[64, 54], [70, 70], [60, 45]]) {
    for (const viewport of [[320, 420], [390, 650], [844, 252]]) {
      const {bound, candidate} = prepare(x, y, viewport);
      assert.equal(candidate.ok, true, `${x},${y} ${viewport}: ${candidate.reason}`);
      assert.equal(candidate.action, 'finite-item-arrival');
      assert.equal(candidate.durationSeconds, 6);
      assert.equal(candidate.interactionReady, false);
      for (const box of bound.binding.layout.obstacles) assert.equal(polygonHitsBox(candidate.plan.sweep, box), false);
      const sample = t => {
        const result = sampleMikaYardQaCruise(candidate.plan, bound.binding.layout, t);
        assert.equal(result.status, 'ready', `${x},${y} at ${t}`);
        return result.sample;
      };
      for (let frame = 0; frame <= 360; frame++) sample(frame / 60);
      const stopped = sample(4.9), final = sample(6);
      assert.ok(distance(stopped.root.position, final.root.position) < 1e-10);
      assert.equal(stopped.root.heading, final.root.heading);
      for (const [id, foot] of Object.entries(final.contacts)) {
        assert.equal(foot.contact, true, id);
        assert.ok(distance(foot.paw, sample(5.6).contacts[id].paw) < 1e-10);
      }
      const end = sampleMikaYardQaCruise(candidate.plan, bound.binding.layout, 6).position;
      const dx = x - end.x, dy = y - end.y;
      assert.ok((Math.cos(final.root.heading) * dx + Math.sin(final.root.heading) * dy) / Math.hypot(dx, dy) >= Math.cos(Math.PI / 6));
      terminalRoots.add(JSON.stringify(final.root.position));
      assert.deepEqual(sample(4.25), sample(4.25));
      assert.deepEqual(sampleMikaYardQaCruise(candidate.plan, bound.binding.layout, 6.001), {status: 'complete'});
    }
  }
  assert.ok(terminalRoots.size >= 3);
});

test('placed native root, body and all paw transforms remain continuous at the four-second seam', () => {
  const {bound, candidate} = prepare(64, 54);
  assert.equal(candidate.ok, true);
  const h = 1e-5, at = t => sampleMikaYardQaCruise(candidate.plan, bound.binding.layout, t).sample;
  const a = at(4 - h), b = at(4), c = at(4 + h);
  assert.ok(Math.abs(distance(a.root.position, b.root.position) / h - .74) < 1e-5);
  assert.ok(Math.abs(distance(b.root.position, c.root.position) / h - .74) < 1e-5);
  for (const name of Object.keys(b.boneMatrices)) {
    const left = a.boneMatrices[name].flat(), seam = b.boneMatrices[name].flat(), right = c.boneMatrices[name].flat();
    assert.ok(Math.max(...seam.map((value, i) => Math.abs(value - left[i])),
      ...right.map((value, i) => Math.abs(value - seam[i]))) < .001, name);
  }
  for (const id of Object.keys(b.contacts)) {
    assert.ok(distance(a.contacts[id].paw, b.contacts[id].paw) < .001, id);
    assert.ok(distance(b.contacts[id].paw, c.contacts[id].paw) < .001, id);
  }
});

test('arrival cancels on current target relocation and never resumes an old idle; clipped placement still declines', () => {
  const {bound, candidate} = prepare(64, 54);
  assert.equal(sampleMikaYardQaCruise(candidate.plan, bound.binding.layout, 4.4).status, 'ready');
  const changed = structuredClone(bound.binding.layout); changed.obstacles.find(box => box.id === 'current-item').x++;
  assert.deepEqual(sampleMikaYardQaCruise(candidate.plan, changed, 4.5), {status: 'aborted', reason: 'LAYOUT_CHANGED'});
  assert.deepEqual(sampleMikaYardQaCruise(candidate.plan, bound.binding.layout, 5.8), {status: 'aborted', reason: 'LAYOUT_CHANGED'});
  assert.equal(prepare(42, 62, [320, 420]).candidate.ok, false);
});
