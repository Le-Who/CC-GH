import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { REST_CHAINS, WALK_CONFIG, sampleWalk, solveLegIK } from '../motion-r2/walk-solver.mjs';
import { INTERACTION, sampleInteraction, rootDistanceAt, solveSpatialIK, eventsBetween,
  buildInteractionSamples, groundedPawToyClearance } from './interaction-solver.mjs';

const EPS = 1e-9;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const length = (v) => Math.hypot(...v);
const distance = (a, b) => length(sub(a, b));
const near = (a, b, epsilon = EPS) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const nearPoint = (a, b, epsilon = EPS) => near(distance(a, b), 0, epsilon);
const names = Object.keys(REST_CHAINS);
const artifact = buildInteractionSamples();
const finiteTree = (v) => {
  if (typeof v === 'number') assert.ok(Number.isFinite(v));
  else if (v && typeof v === 'object') Object.values(v).forEach(finiteTree);
};

function denseAudit() {
  const supports = new Map();
  let unreachableCount = 0;
  let minimumInnerReachMargin = Infinity;
  let closestReach = { margin: Infinity };
  let maximumUpperLengthError = 0;
  let maximumLowerLengthError = 0;
  let maximumStanceFootDrift = 0;
  let maximumPawAnkleOffsetError = 0;
  let maximumToySocketContactError = 0;
  let minimumPawZ = Infinity;
  let minimumMouseHeightScale = Infinity;
  let maximumMouseHeightScale = -Infinity;
  let groundedSupportFailuresDuringReach = 0;
  let minimumGroundedPawToyClearance = Infinity;
  let closestGroundedPawToToy = null;
  let toyContactSamples = 0;
  const steps = Math.round(INTERACTION.durationSeconds * INTERACTION.denseSamplesPerSecond);
  for (let i = 0; i <= steps; i += 1) {
    const s = sampleInteraction(i / INTERACTION.denseSamplesPerSecond);
    minimumMouseHeightScale = Math.min(minimumMouseHeightScale, s.mouse.compression);
    maximumMouseHeightScale = Math.max(maximumMouseHeightScale, s.mouse.compression);
    if (s.time >= INTERACTION.attentionEnd && s.time < INTERACTION.recoveryEnd
      && Object.values(s.limbs).filter((l) => l.contact).length !== 3) groundedSupportFailuresDuringReach += 1;
    for (const [id, limb] of Object.entries(s.limbs)) {
      const rest = REST_CHAINS[id];
      if (!limb.reachable) unreachableCount += 1;
      minimumInnerReachMargin = Math.min(minimumInnerReachMargin, limb.innerReachMargin);
      if (limb.reachMargin < closestReach.margin) closestReach = { limb: id, time: s.time,
        phaseName: s.phaseName, margin: limb.reachMargin, requestedDistance: limb.requestedDistance,
        maximumReach: limb.maximumReach };
      maximumUpperLengthError = Math.max(maximumUpperLengthError, Math.abs(distance(limb.worldHip, limb.worldKnee) - rest.upperLength));
      maximumLowerLengthError = Math.max(maximumLowerLengthError, Math.abs(distance(limb.worldKnee, limb.worldAnkle) - rest.lowerLength));
      maximumPawAnkleOffsetError = Math.max(maximumPawAnkleOffsetError, distance(sub(limb.worldAnkle, limb.worldPaw), rest.ankleOffset));
      minimumPawZ = Math.min(minimumPawZ, limb.worldPaw[2]);
      if (limb.contact) {
        const clearance = groundedPawToyClearance(limb.worldPaw, s.mouse).signedSeparation;
        if (clearance < minimumGroundedPawToyClearance) {
          minimumGroundedPawToyClearance = clearance;
          closestGroundedPawToToy = { limb: id, time: s.time, worldPaw: limb.worldPaw,
            toyCenter: s.mouse.worldCenter, clearance };
        }
        if (supports.has(limb.supportId)) maximumStanceFootDrift = Math.max(maximumStanceFootDrift,
          distance(supports.get(limb.supportId), limb.worldPaw));
        else supports.set(limb.supportId, limb.worldPaw);
      }
      if (limb.toyContact) {
        toyContactSamples += 1;
        maximumToySocketContactError = Math.max(maximumToySocketContactError,
          distance(limb.worldPaw, s.mouse.contactSocket));
      }
    }
  }
  let maximumBoundaryJointDifference = 0;
  const boundaries = [1.5, 2.1, 2.5, 2.8, 3.35, 3.40, 3.50, 3.7, 4.2, 4.8, 6.3];
  for (const t of boundaries) {
    const a = sampleInteraction(t - 1e-7);
    const b = sampleInteraction(t + 1e-7);
    for (const id of names) for (const key of ['worldHip', 'worldKnee', 'worldAnkle', 'worldPaw']) {
      maximumBoundaryJointDifference = Math.max(maximumBoundaryJointDifference,
        distance(a.limbs[id][key], b.limbs[id][key]));
    }
  }
  return { revision: INTERACTION.revision, sourceMotionRevision: 'R2', visualStyleStatus: 'REJECTED',
    scope: 'Numerical world-space joints/contact sockets only. Actual skinned sole/toy geometry must be measured in Blender.',
    skinnedContactValidated: false, fps: 20, renderFrames: 128, denseSamples: steps + 1,
    denseTimeStep: 1 / INTERACTION.denseSamplesPerSecond, unreachableCount, closestReach, minimumInnerReachMargin,
    maximumUpperLengthError, maximumLowerLengthError, maximumStanceFootDrift, maximumPawAnkleOffsetError,
    minimumGroundedPawToyClearance, closestGroundedPawToToy,
    collisionProxy: { pawHalfExtents: [.21, .165], toyHalfExtents: [.301, .13],
      meaning: 'Oriented XY rectangles including mouse nose, rotated by mouse.rotationZ; positive SAT-axis separation, not actual mesh distance',
      calibration: INTERACTION.collisionCalibration },
    minimumPawZ, groundedSupportFailuresDuringReach, toyContactSamples, maximumToySocketContactError,
    minimumMouseHeightScale, maximumMouseHeightScale, maximumBoundaryJointDifference,
    boundaryDifferenceIntervalSeconds: 2e-7, tapTime: 3.35, tapFrame: 68,
    emittedEventCount: eventsBetween(0, INTERACTION.durationSeconds).length,
    stopRootDistance: rootDistanceAt(2.1), exitRootDistance: rootDistanceAt(6.3),
  };
}
const audit = denseAudit();

// Snapshot immutable motion source hashes before tests; the interaction imports but never modifies R2.
const baselinePaths = ['../motion-r2/walk-solver.mjs', '../motion-r2/walk-samples.json'];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const r2Hashes = await Promise.all(baselinePaths.map(async (path) => sha(await readFile(new URL(path, import.meta.url)))));

test('128-frame schema supplies the Blender fields and exact contact frame', () => {
  assert.equal(artifact.samples.length, 128);
  assert.equal(artifact.fps, 20);
  assert.equal(artifact.durationSeconds, 6.4);
  assert.equal(artifact.contactFrame, 68);
  assert.equal(artifact.loop, false);
  assert.equal(artifact.visualStyleStatus, 'REJECTED');
  assert.equal(artifact.samples[67].time, 3.35);
  assert.equal(artifact.samples[67].frame, 68);
  assert.equal(artifact.samples[127].time, 6.35);
  for (const [i, s] of artifact.samples.entries()) {
    assert.equal(s.frame, i + 1);
    assert.equal(typeof s.phaseName, 'string');
    assert.equal(typeof s.mouse.rotationZ, 'number');
    assert.equal(s.bodyShift.length, 3);
    for (const id of names) {
      for (const [local, world] of [['hip', 'worldHip'], ['knee', 'worldKnee'], ['ankle', 'worldAnkle'], ['paw', 'worldPaw']]) {
        nearPoint(add(s.limbs[id][local], s.root), s.limbs[id][world]);
      }
    }
  }
  finiteTree(artifact);
});

test('root uses continuous speed ramps, stops at .96 and walks out to1.92', () => {
  for (const [t, d] of [[0, 0], [1.5, 0.8], [2.1, 0.96], [4.2, 0.96], [4.8, 1.12], [6.3, 1.92]]) near(rootDistanceAt(t), d);
  for (const t of [2.2, 2.5, 3.35, 4.1]) near(rootDistanceAt(t), 0.96);
  const velocity = (t) => (rootDistanceAt(t + 1e-5) - rootDistanceAt(t - 1e-5)) / 2e-5;
  near(velocity(1.0), INTERACTION.speed, 1e-6);
  near(velocity(2.1), 0, 1e-5);
  near(velocity(4.2), 0, 1e-5);
  near(velocity(5.2), INTERACTION.speed, 1e-6);
  for (const s of artifact.samples) near(s.phase, ((s.distance / WALK_CONFIG.stride) % 1 + 1) % 1);
});

test('dense real3D length, reach, fixed support, sole height and contact constraints hold', () => {
  assert.equal(audit.denseSamples, 12801);
  assert.equal(audit.unreachableCount, 0);
  assert.ok(audit.closestReach.margin >= 0.02);
  assert.ok(audit.minimumInnerReachMargin > 0.02);
  assert.ok(audit.minimumPawZ >= 0);
  for (const key of ['maximumUpperLengthError', 'maximumLowerLengthError', 'maximumStanceFootDrift',
    'maximumPawAnkleOffsetError', 'maximumToySocketContactError']) near(audit[key], 0);
  assert.equal(audit.groundedSupportFailuresDuringReach, 0);
});

test('align lowers only hindNear; the other three anchors remain fixed', () => {
  const stop = sampleInteraction(2.1);
  assert.equal(stop.limbs.hindNear.stage, 'align-lower');
  near(stop.limbs.hindNear.phase, 0.75);
  for (const t of [2.1, 2.2, 2.3, 2.4, 2.5]) {
    const s = sampleInteraction(t);
    for (const id of ['foreNear', 'hindFar', 'foreFar']) {
      nearPoint(s.limbs[id].worldPaw, stop.limbs[id].worldPaw);
      assert.equal(s.limbs[id].contact, true);
    }
    assert.ok(s.limbs.hindNear.worldPaw[2] >= 0);
  }
  nearPoint(sampleInteraction(2.5).limbs.hindNear.worldPaw, [0.25, -0.265, 0]);
  assert.equal(Object.values(sampleInteraction(2.5).limbs).filter((l) => l.contact).length, 4);
});

test('lateral body shift keeps all support paws fixed without flattening bone Y coordinates', () => {
  const a = sampleInteraction(2.5);
  const b = sampleInteraction(2.8);
  nearPoint(b.bodyShift, [0.035, 0.02, -0.02]);
  for (const id of names) {
    near(b.limbs[id].worldHip[1] - a.limbs[id].worldHip[1], 0.02);
    nearPoint(b.limbs[id].worldPaw, a.limbs[id].worldPaw);
    assert.ok(Math.abs(b.limbs[id].worldKnee[1] - b.limbs[id].worldAnkle[1]) > 0.001);
    near(distance(b.limbs[id].worldHip, b.limbs[id].worldKnee), REST_CHAINS[id].upperLength);
    near(distance(b.limbs[id].worldKnee, b.limbs[id].worldAnkle), REST_CHAINS[id].lowerLength);
  }
});

test('3D guide solve agrees with R2 in the XZ plane and reports impossible3D targets', () => {
  for (const rest of Object.values(REST_CHAINS)) {
    const a = solveLegIK(rest.hip, rest.ankle, rest.upperLength, rest.lowerLength, rest.bend);
    const b = solveSpatialIK(rest.hip, rest.ankle, rest.upperLength, rest.lowerLength, rest.bend);
    nearPoint(a.knee, b.knee); nearPoint(a.ankle, b.ankle);
    const far = solveSpatialIK(rest.hip, add(rest.hip, [2, 1, -2]), rest.upperLength, rest.lowerLength, rest.bend);
    assert.equal(far.reachable, false);
    near(distance(rest.hip, far.knee), rest.upperLength);
    near(distance(far.knee, far.ankle), rest.lowerLength);
  }
});

test('tap is exact at frame68; mouse stays unchanged before it and compresses to .90 after it', () => {
  for (const t of [0, 2.8, 3.2, 3.349999]) {
    const s = sampleInteraction(t);
    nearPoint(s.mouse.worldCenter, INTERACTION.mouseCenter);
    nearPoint(s.mouse.displacement, [0, 0, 0]);
    near(s.mouse.compression, 1); near(s.mouse.rotationZ, 0);
    assert.equal(s.events.length, 0);
  }
  const tap = sampleInteraction(3.35);
  nearPoint(tap.limbs.foreNear.worldPaw, [1.9, -0.265, 0.217]);
  assert.equal(tap.events.length, 1);
  assert.equal(tap.limbs.foreNear.toyContact, true);
  assert.equal(tap.events[0].skinnedContactValidated, false);
  assert.equal(tap.events[0].contactReference, 'authored paw anchor; actual skinned geometry validated separately');
  assert.equal(tap.events[0].authoredAnchorReached, true);
  const press = sampleInteraction(3.4);
  near(press.mouse.compression, 0.90);
  near(press.limbs.foreNear.worldPaw[2], 0.195);
  nearPoint(press.limbs.foreNear.worldPaw, press.mouse.contactSocket);
  assert.ok(press.mouse.rotationZ > 0);
  near(sampleInteraction(4.2).mouse.compression, 1);
  assert.equal(audit.minimumMouseHeightScale, 0.9);
  assert.equal(audit.maximumMouseHeightScale, 1);
});

test('three support feet remain rooted while the acting paw reaches and recoils', () => {
  const stand = sampleInteraction(2.5);
  for (const t of [2.8, 3.0, 3.35, 3.4, 3.5, 3.7, 4.0, 4.199]) {
    const s = sampleInteraction(t);
    for (const id of ['hindNear', 'hindFar', 'foreFar']) {
      nearPoint(s.limbs[id].worldPaw, stand.limbs[id].worldPaw);
      assert.equal(s.limbs[id].contact, true);
    }
  }
  nearPoint(sampleInteraction(4.2).limbs.foreNear.worldPaw, stand.limbs.foreNear.worldPaw);
  assert.ok(sampleInteraction(3.6).limbs.foreNear.worldPaw[2] > 0.217, 'Recoil includes real upward paw clearance');
});

test('resume preserves original stance anchors and rebuilds hindNear swing from aligned ground', () => {
  const start = sampleInteraction(4.2);
  const mid = sampleInteraction(4.5);
  const end = sampleInteraction(4.8);
  nearPoint(start.limbs.hindNear.worldPaw, [0.25, -0.265, 0]);
  assert.equal(start.limbs.hindNear.stage, 'resume-swing');
  assert.ok(mid.limbs.hindNear.worldPaw[2] > 0);
  const normal = sampleWalk(0, { distance: 1.12 });
  nearPoint(end.limbs.hindNear.worldPaw, normal.limbs.hindNear.worldPaw);
  assert.equal(end.limbs.hindNear.contact, true);
  for (const [id, liftoff] of Object.entries(artifact.resumeLiftoffDistances)) {
    for (const s of artifact.samples.filter((s) => s.time >= 4.2 && s.distance < liftoff)) {
      nearPoint(s.limbs[id].worldPaw, start.limbs[id].worldPaw);
      assert.equal(s.limbs[id].contact, true);
    }
  }
});

test('stage transitions have no positional snaps and the terminal hold does not restart', () => {
  assert.ok(audit.maximumBoundaryJointDifference < 1e-5);
  const a = sampleInteraction(6.3);
  const b = sampleInteraction(6.4);
  nearPoint(a.root, b.root);
  assert.deepEqual(a.limbs, b.limbs);
  assert.equal(b.complete, true);
  assert.equal(sampleInteraction(99).phaseName, 'complete');
  assert.deepEqual(sampleInteraction(0), sampleInteraction(0));
});

test('eventsBetween emits one event across skipped forward partitions and none on rewind', () => {
  for (const step of [0.05, 0.2, 0.71, 1.3, 3.5, 6.4]) {
    let count = 0;
    for (let t = 0; t < 6.4; t += step) count += eventsBetween(t, Math.min(6.4, t + step)).length;
    assert.equal(count, 1);
  }
  assert.equal(eventsBetween(3.35, 6.4).length, 0);
  assert.equal(eventsBetween(4.0, 3.0).length, 0);
  assert.equal(eventsBetween(NaN, 6.4).length, 0);
  assert.equal(eventsBetween(3.349, 3.351)[0].atSeconds, 3.35);
});

test('an unreachable requested toy socket produces no false tap or mouse response', () => {
  const options = { mouseContact: [10, -0.265, 4] };
  const s = sampleInteraction(3.4, options);
  assert.equal(s.geometricTapReachable, false);
  assert.equal(s.limbs.foreNear.toyContact, false);
  assert.equal(eventsBetween(0, 6.4, options).length, 0);
  nearPoint(s.mouse.worldCenter, INTERACTION.mouseCenter);
  nearPoint(s.mouse.displacement, [0, 0, 0]);
  near(s.mouse.compression, 1);
  near(s.mouse.rotationZ, 0);
});

test('released toy rolls clear of every grounded paw before walk-out without changing press calibration', () => {
  for (const t of [3.35, 3.4, 3.45, 3.5]) {
    const s = sampleInteraction(t);
    const p = Math.max(0, Math.min(1, (t - 3.35) / 0.65));
    near(s.mouse.displacement[0], 0.08 * p * p * (3 - 2 * p));
    near(s.mouse.displacement[1], 0);
  }
  nearPoint(sampleInteraction(3.9).mouse.displacement, [0.13, -0.38, 0]);
  nearPoint(sampleInteraction(4.2).mouse.worldCenter, [2.14, -0.645, 0.11]);
  const before = sampleInteraction(3.5 - 1e-7).mouse.worldCenter;
  const after = sampleInteraction(3.5 + 1e-7).mouse.worldCenter;
  assert.ok(distance(before, after) < 1e-6);
  const speedLeft = sub(sampleInteraction(3.5).mouse.worldCenter, sampleInteraction(3.5 - 1e-5).mouse.worldCenter).map((v) => v / 1e-5);
  const speedRight = sub(sampleInteraction(3.5 + 1e-5).mouse.worldCenter, sampleInteraction(3.5).mouse.worldCenter).map((v) => v / 1e-5);
  nearPoint(speedLeft, speedRight, 0.0002);
  assert.ok(audit.minimumGroundedPawToyClearance > 0.06);
  assert.equal(audit.closestGroundedPawToToy.limb, 'foreNear');
});

test('nose-aware oriented footprint detects the former pre-contact overlap and the calibrated gap', () => {
  const stand = sampleInteraction(2.5);
  const paw = stand.limbs.foreNear.worldPaw;
  nearPoint(paw, [1.4376, -0.265, 0]);
  const old = { ...stand.mouse, worldCenter: [1.91, -0.265, 0.11], rotationZ: 0 };
  assert.ok(groundedPawToyClearance(paw, old).signedSeparation < 0);
  assert.equal(groundedPawToyClearance(paw, old).separated, false);
  const current = groundedPawToyClearance(paw, stand.mouse);
  near(current.signedSeparation, 0.0614);
  assert.equal(current.separated, true);
  nearPoint(INTERACTION.contactSocket, [1.90, -0.265, 0.217]);
  nearPoint(INTERACTION.mouseCenter, [2.01, -0.265, 0.11]);
  nearPoint(sub(INTERACTION.contactSocket, INTERACTION.mouseCenter), [-0.11, 0, 0.107]);
  near(INTERACTION.collisionCalibration.authoredPawAnchorRelativeRootX, 0.94);
});

test('save exact render samples with numerical audit while keeping R2 files unchanged', async () => {
  assert.equal(audit.unreachableCount, 0);
  near(audit.maximumStanceFootDrift, 0);
  near(audit.maximumUpperLengthError, 0);
  near(audit.maximumLowerLengthError, 0);
  assert.equal(audit.emittedEventCount, 1);
  assert.ok(audit.minimumGroundedPawToyClearance > 0.06);
  assert.ok(audit.maximumBoundaryJointDifference < 1e-5);
  const final = { ...artifact, audit, sourceIntegrity: Object.fromEntries(baselinePaths.map((path, i) => [path, r2Hashes[i]])) };
  const file = new URL('./interaction-samples.json', import.meta.url);
  const tmp = new URL('./interaction-samples.json.tmp', import.meta.url);
  await writeFile(tmp, JSON.stringify(final, null, 2) + '\n');
  await rename(tmp, file);
  for (let i = 0; i < baselinePaths.length; i += 1) {
    assert.equal(sha(await readFile(new URL(baselinePaths[i], import.meta.url))), r2Hashes[i]);
  }
  console.log(JSON.stringify(audit));
});
