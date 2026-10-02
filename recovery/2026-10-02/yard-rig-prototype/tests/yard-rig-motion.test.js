import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_RIG, RIG_LIMBS, PLAY_TIMING, sampleRig, rigEventsBetween, solveTwoBoneIK,
} from '../src/games/companion-yard/prototype/rig-motion.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const near = (actual, expected, tolerance = 1e-8) => assert.ok(
  Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} within ${tolerance}`,
);
const nearPoint = (a, b, tolerance = 1e-8) => near(distance(a, b), 0, tolerance);
const limb = (rig, id) => rig.limbs.find((part) => part.id === id);
const finiteTree = (node) => {
  if (typeof node === 'number') assert.ok(Number.isFinite(node), `Nonfinite value: ${node}`);
  else if (node && typeof node === 'object') Object.values(node).forEach(finiteTree);
};

function checkBones(rig) {
  assert.equal(rig.limbs.length, 4);
  assert.equal(new Set(rig.limbs.map((part) => part.id)).size, 4);
  for (const part of rig.limbs) {
    near(distance(part.hip, part.knee), DEFAULT_RIG.upperLegLength * rig.scale);
    near(distance(part.knee, part.ankle), DEFAULT_RIG.lowerLegLength * rig.scale);
    assert.equal(part.reachable, true, `${rig.mode} ${rig.timeMs}: ${part.id} unreachable`);
    near(part.reachError, 0);
    nearPoint(part.foot, part.requestedTarget);
    nearPoint(part.ankle, part.requestedAnkleTarget);
  }
}

test('walk feet remain fixed in world coordinates for each full support interval', () => {
  const supports = new Map();
  let comparisons = 0;
  for (let t = 0; t <= 3100; t += 5) {
    const rig = sampleRig(t, { origin: { x: 220, y: 120 } });
    for (const part of rig.limbs.filter((part) => part.phase === 'stance')) {
      assert.equal(part.planted, true);
      assert.equal(part.contact.kind, 'ground');
      nearPoint(part.foot, part.ground);
      if (supports.has(part.supportId)) {
        nearPoint(part.foot, supports.get(part.supportId));
        comparisons += 1;
      } else supports.set(part.supportId, part.foot);
    }
  }
  assert.ok(supports.size >= 12);
  assert.ok(comparisons > 1000);
});

test('four evenly spaced touchdowns use a cat lateral-sequence walk', () => {
  assert.deepEqual(RIG_LIMBS.map((part) => [part.id, part.offset]), [
    ['farHind', 0], ['farFore', 0.25], ['nearHind', 0.5], ['nearFore', 0.75],
  ]);
  for (const part of RIG_LIMBS) {
    const t = (1 + part.offset) * 1000;
    const before = limb(sampleRig(t - 0.001), part.id);
    const after = limb(sampleRig(t + 0.001), part.id);
    assert.equal(before.phase, 'swing');
    assert.equal(after.phase, 'stance');
    nearPoint(before.foot, after.foot, 1e-6);
  }
});

test('speed changes cycle duration and root distance together without changing stride', () => {
  for (const speed of [14, 28, 56, 112, 280]) {
    const rig = sampleRig(47000 / speed, { speed });
    const reference = sampleRig(47000 / 56, { speed: 56 });
    near(rig.distance, 47);
    nearPoint(rig.root, reference.root);
    near(rig.gaitPhase, reference.gaitPhase);
    assert.deepEqual(rig.limbs, reference.limbs);
    assert.deepEqual(rig.body, reference.body);
  }
  for (const speed of [14, 56, 112]) {
    const a = sampleRig(0, { speed });
    const b = sampleRig(1000 * DEFAULT_RIG.strideLength / speed, { speed });
    near(distance(a.root, b.root), DEFAULT_RIG.strideLength);
    for (const id of RIG_LIMBS.map((part) => part.id)) {
      near(distance(limb(a, id).foot, limb(b, id).foot), DEFAULT_RIG.strideLength);
    }
  }
});

test('custom stride still uses distance/stride, and cumulative distance supports variable speed', () => {
  for (const strideLength of [24, 40, 56]) {
    const rig = sampleRig(9999, { strideLength, distance: strideLength * 1.375, speed: 80 });
    near(rig.gaitPhase, 0.375);
    assert.equal(limb(rig, 'farHind').phase, 'stance');
    checkBones(rig);
  }
  const slow = sampleRig(123, { speed: 3, distance: 83 });
  const fast = sampleRig(456, { speed: 200, distance: 83 });
  const paused = sampleRig(9876, { speed: 0, distance: 83 });
  assert.deepEqual(slow.limbs, fast.limbs);
  assert.deepEqual(slow.body, paused.body);
  assert.deepEqual(slow.limbs, paused.limbs);
});

test('four limbs, reachable endpoints and fixed link lengths survive full walk/play sweeps', () => {
  for (const scale of [0.5, 1, 2]) {
    for (const mode of ['walk', 'play']) {
      for (let t = 0; t <= 2100; t += 13) checkBones(sampleRig(t, { mode, scale }));
    }
  }
});

test('swing clearance has real lift and smooth ground endpoints', () => {
  const start = DEFAULT_RIG.stanceRatio * 1000;
  const middle = (DEFAULT_RIG.stanceRatio + (1 - DEFAULT_RIG.stanceRatio) / 2) * 1000;
  const a = limb(sampleRig(start), 'farHind');
  const b = limb(sampleRig(middle), 'farHind');
  const c = limb(sampleRig(1000), 'farHind');
  near(a.height, 0);
  near(b.height, DEFAULT_RIG.liftHeight);
  near(c.height, 0);
  near(distance(a.ground, c.ground), DEFAULT_RIG.strideLength);
  assert.equal(b.phase, 'swing');
  near(b.ground.y - b.foot.y, DEFAULT_RIG.liftHeight);
  assert.equal(b.planted, false);
});

test('at least twelve distinct articulated poses; torso/head/tail do not just translate together', () => {
  const poses = Array.from({ length: 12 }, (_, index) => sampleRig(index * 1000 / 12));
  const signatures = poses.map((rig) => rig.limbs.map((part) =>
    `${part.upperAngle.toFixed(4)},${part.lowerAngle.toFixed(4)}`).join(';'));
  assert.equal(new Set(signatures).size, 12);
  const lowerAngles = poses.map((rig) => limb(rig, 'nearFore').lowerAngle);
  assert.ok(Math.max(...lowerAngles) - Math.min(...lowerAngles) > 0.5);
  assert.ok(new Set(poses.map((rig) => rig.head.rotation.toFixed(4))).size >= 3);
  assert.ok(new Set(poses.map((rig) => rig.tail.angles[0].toFixed(4))).size >= 3);
  assert.ok(new Set(poses.map((rig) => rig.body.torso.rotation.toFixed(4))).size >= 3);
});

test('play keeps three support feet fixed while the near forepaw lifts, reaches and recovers', () => {
  const initial = sampleRig(0, { mode: 'play' });
  const supported = ['farHind', 'farFore', 'nearHind'];
  for (let t = 0; t <= 1800; t += 10) {
    const rig = sampleRig(t, { mode: 'play' });
    nearPoint(rig.root, initial.root);
    for (const id of supported) {
      nearPoint(limb(rig, id).foot, limb(initial, id).foot);
      assert.equal(limb(rig, id).planted, true);
    }
  }
  nearPoint(limb(sampleRig(359, { mode: 'play' }), 'nearFore').foot, limb(initial, 'nearFore').foot);
  assert.ok(distance(limb(sampleRig(640, { mode: 'play' }), 'nearFore').foot, limb(initial, 'nearFore').foot) > 15);
  const recovered = sampleRig(1800, { mode: 'play' });
  nearPoint(limb(recovered, 'nearFore').foot, limb(initial, 'nearFore').foot);
  assert.equal(recovered.complete, true);
  assert.equal(sampleRig(100000, { mode: 'play' }).phase, 'complete');
});

test('mouse reaction begins at actual paw contact, and the touching paw follows its surface', () => {
  const before = sampleRig(899, { mode: 'play' });
  const touch = sampleRig(900, { mode: 'play' });
  const hold = sampleRig(950, { mode: 'play' });
  assert.equal(before.mouse.reactionProgress, 0);
  assert.equal(before.contact.active, false);
  assert.equal(touch.phase, 'touch');
  assert.equal(touch.contact.active, true);
  assert.equal(touch.events.length, 1);
  nearPoint(limb(touch, 'nearFore').foot, touch.contact.target);
  nearPoint(limb(hold, 'nearFore').foot, hold.mouse.contactPoint);
  assert.equal(limb(hold, 'nearFore').contact.kind, 'toy');
  assert.ok(hold.mouse.reactionProgress > 0);
  const customTarget = { x: 59, y: 18 };
  const custom = sampleRig(900, { mode: 'play', target: customTarget });
  assert.equal(custom.contact.reachable, true);
  nearPoint(limb(custom, 'nearFore').foot, customTarget);
});

test('interval contact lookup catches skipped frames once, and rejects rewind/nonplay intervals', () => {
  for (const step of [1000 / 30, 1000 / 60, 1000 / 120, 700, 2000]) {
    let count = 0;
    for (let previous = 0; previous < 1800; previous += step) {
      count += rigEventsBetween(previous, previous + step, { mode: 'play' }).length;
    }
    assert.equal(count, 1);
  }
  assert.equal(rigEventsBetween(900, 950, { mode: 'play' }).length, 0);
  assert.equal(rigEventsBetween(1000, 0, { mode: 'play' }).length, 0);
  assert.equal(rigEventsBetween(0, 2000, { mode: 'walk' }).length, 0);
  assert.equal(rigEventsBetween(0, 2000, { mode: 'play' })[0].atMs, PLAY_TIMING.contactMs);
});

test('unreachable mouse target never produces a false contact or toy reaction', () => {
  const options = { mode: 'play', target: { x: 1000, y: 1000 } };
  const rig = sampleRig(950, options);
  assert.equal(rig.contact.reachable, false);
  assert.equal(rig.contact.active, false);
  assert.equal(rig.contact.hasOccurred, false);
  assert.equal(rig.mouse.reactionProgress, 0);
  assert.equal(limb(rig, 'nearFore').contact.kind, 'none');
  assert.equal(rigEventsBetween(0, 1800, options).length, 0);
});

test('paw orientation is independent of shin angle and render depth is stable', () => {
  const initial = sampleRig(0);
  assert.equal(initial.attachments.length, 15); // 4x3 limb parts + torso/head/whole tail
  const upperIds = initial.attachments.filter((part) => part.kind === 'upperLeg').map((part) => part.id);
  assert.equal(upperIds.length, 4);
  for (let t = 0; t < 2000; t += 23) {
    const rig = sampleRig(t);
    assert.deepEqual(rig.drawOrder, initial.drawOrder);
    for (const part of rig.limbs) {
      const paw = rig.attachments.find((attachment) => attachment.id === `${part.id}.paw`);
      near(paw.rotation, part.footAngle);
      nearPoint(paw.position, part.foot);
      assert.deepEqual(Object.keys(part.joints), part.family === 'fore'
        ? ['shoulder', 'elbow', 'wrist'] : ['hip', 'knee', 'ankle']);
    }
  }
});

test('sampling/restart are deterministic and input objects are not mutated', () => {
  const options = Object.freeze({ mode: 'play', origin: Object.freeze({ x: 350, y: 200 }) });
  const first = sampleRig(920, options);
  sampleRig(870, { mode: 'walk' });
  sampleRig(1800, options);
  assert.deepEqual(sampleRig(920, options), first);
  assert.deepEqual(sampleRig(0, options), sampleRig(0, options));
  const events = rigEventsBetween(850, 940, options);
  assert.deepEqual(events, rigEventsBetween(850, 940, options));
});

test('zero/negative/nonfinite speeds stand still; undefined speed uses the default', () => {
  for (const speed of [0, -1, NaN, Infinity, -Infinity, null, 'fast']) {
    const a = sampleRig(0, { speed });
    const b = sampleRig(1e6, { speed });
    assert.equal(a.phase, 'idle');
    nearPoint(a.root, b.root);
    assert.deepEqual(a.limbs, b.limbs);
    assert.equal(b.limbs.filter((part) => part.planted).length, 4);
  }
  near(sampleRig(1000).distance, DEFAULT_RIG.speed);
});

test('all sampled outputs remain finite for invalid optional inputs and large times', () => {
  for (const time of [-100, NaN, Infinity, -Infinity, 0, 9876, Number.MAX_VALUE]) {
    for (const mode of ['walk', 'play']) {
      finiteTree(sampleRig(time, { mode, speed: NaN, scale: Infinity,
        direction: { x: NaN, y: Infinity }, origin: { x: Infinity, y: 0 },
        target: { x: NaN, y: 0 }, ankleOffset: { x: NaN, y: Infinity }, strideLength: 0, stanceRatio: Infinity }));
      finiteTree(sampleRig(time, { mode }));
    }
  }
});

test('IK clamps unreachable targets without stretching either segment', () => {
  for (const target of [{ x: 200, y: 100 }, { x: 0, y: 0 }, { x: 30, y: 20 }]) {
    const ik = solveTwoBoneIK({ x: 0, y: 0 }, target, 28, 29, -1);
    near(distance(ik.hip, ik.knee), 28);
    near(distance(ik.knee, ik.foot), 29);
    finiteTree(ik);
  }
  assert.equal(solveTwoBoneIK({ x: 0, y: 0 }, { x: 100, y: 0 }, 28, 29).reachable, false);
  const folded = solveTwoBoneIK({ x: 0, y: 0 }, { x: 0, y: 0 }, 20, 20);
  near(distance(folded.hip, folded.knee), 20);
  near(distance(folded.knee, folded.foot), 20);
  assert.equal(folded.reachable, true);
});


test('ankle cuff is a rigid paw-local offset while the contact point stays on the ground or toy', () => {
  for (const mode of ['walk', 'play']) {
    for (const scale of [0.5, 1, 2]) {
      for (let t = 0; t <= 1800; t += 37) {
        const rig = sampleRig(t, { mode, scale });
        for (const part of rig.limbs) {
          const expectedOffset = {
            x: (DEFAULT_RIG.ankleOffset.x * rig.direction.x - DEFAULT_RIG.ankleOffset.y * rig.direction.y) * scale,
            y: (DEFAULT_RIG.ankleOffset.x * rig.direction.y + DEFAULT_RIG.ankleOffset.y * rig.direction.x) * scale,
          };
          nearPoint(part.ankle, { x: part.foot.x + expectedOffset.x, y: part.foot.y + expectedOffset.y });
          nearPoint(part.ankleOffset, expectedOffset);
          near(distance(part.ankle, part.foot), 10 * scale);
          const lower = rig.attachments.find((attachment) => attachment.id === `${part.id}.lower`);
          const paw = rig.attachments.find((attachment) => attachment.id === `${part.id}.paw`);
          nearPoint(lower.position, part.knee);
          nearPoint(lower.end, part.ankle);
          near(lower.length, DEFAULT_RIG.lowerLegLength * scale);
          nearPoint(paw.position, part.foot);
          nearPoint(part.contact.position, part.foot);
          assert.deepEqual(paw.pivot, { x: 0.70, y: 0.98 });
          nearPoint(part.family === 'fore' ? part.joints.wrist : part.joints.ankle, part.ankle);
        }
      }
    }
  }
});

test('a configured ankle offset rotates with fixed paw heading and scales with the skeleton', () => {
  const ankleOffset = Object.freeze({ x: -4, y: -7 });
  const direction = { x: 0.8, y: 0.6 };
  const scale = 1.5;
  const expectedOffset = { x: (-4 * 0.8 + 7 * 0.6) * scale, y: (-4 * 0.6 - 7 * 0.8) * scale };
  for (const t of [0, 250, 700, 900, 1200]) {
    const rig = sampleRig(t, { mode: 'play', scale, direction, ankleOffset });
    for (const part of rig.limbs) nearPoint(part.ankleOffset, expectedOffset);
    checkBones(rig);
  }
  assert.deepEqual(ankleOffset, { x: -4, y: -7 });
});

test('zero ankle offset explicitly preserves the legacy coincident IK endpoint geometry', () => {
  for (const mode of ['walk', 'play']) {
    for (const t of [0, 150, 640, 900, 980, 1300, 1800]) {
      const rig = sampleRig(t, { mode, ankleOffset: { x: 0, y: 0 } });
      for (const part of rig.limbs) {
        const legacy = solveTwoBoneIK(part.hip, part.requestedTarget, part.upperLength, part.lowerLength, part.bend);
        nearPoint(part.ankle, part.foot);
        nearPoint(part.knee, legacy.knee);
        nearPoint(part.foot, legacy.foot);
        near(part.upperAngle, legacy.upperAngle);
        near(part.lowerAngle, legacy.lowerAngle);
      }
      checkBones(rig);
    }
  }
});
