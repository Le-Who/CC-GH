import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, rename, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { WALK_CONFIG, R1_REFERENCE, REST_CHAINS, sampleWalk, solveLegIK, buildWalkSamples } from './walk-solver.mjs';

const tolerance = 1e-10;
const distance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const near = (a, b, message = '') => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} != ${b}`);
const nearPoint = (a, b, message = '') => near(distance(a, b), 0, message);
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const names = ['foreNear', 'hindFar', 'foreFar', 'hindNear'];
// Render-cadence comparison: 48 poses. Dense reach/support validation below is separate.
const twoCycles = Array.from({ length: 48 }, (_, i) => sampleWalk(i / WALK_CONFIG.fps));
const finiteTree = (value) => {
  if (typeof value === 'number') assert.ok(Number.isFinite(value));
  else if (value && typeof value === 'object') Object.values(value).forEach(finiteTree);
};

function numericalAudit() {
  const supportPositions = new Map();
  let maximumStanceFootDrift = 0;
  let maximumUpperLengthError = 0;
  let maximumLowerLengthError = 0;
  let maximumContactTargetError = 0;
  let maximumPawAnkleOffsetError = 0;
  let minimumPawZ = Infinity;
  let maximumPawZ = -Infinity;
  let minimumBodyBob = Infinity;
  let maximumBodyBob = -Infinity;
  let unreachableCount = 0;
  let closestReach = { margin: Infinity };
  let stanceSamples = 0;
  let swingSamples = 0;
  for (const [sampleIndex, sample] of twoCycles.entries()) {
    minimumBodyBob = Math.min(minimumBodyBob, sample.bodyBob);
    maximumBodyBob = Math.max(maximumBodyBob, sample.bodyBob);
    for (const [id, limb] of Object.entries(sample.limbs)) {
      const rest = REST_CHAINS[id];
      maximumUpperLengthError = Math.max(maximumUpperLengthError, Math.abs(distance(limb.hip, limb.knee) - rest.upperLength));
      maximumLowerLengthError = Math.max(maximumLowerLengthError, Math.abs(distance(limb.knee, limb.ankle) - rest.lowerLength));
      maximumContactTargetError = Math.max(maximumContactTargetError, distance(limb.worldPaw, limb.requestedWorldPaw));
      maximumPawAnkleOffsetError = Math.max(maximumPawAnkleOffsetError, distance(sub(limb.ankle, limb.paw), rest.ankleOffset));
      minimumPawZ = Math.min(minimumPawZ, limb.worldPaw[2]);
      maximumPawZ = Math.max(maximumPawZ, limb.worldPaw[2]);
      if (!limb.reachable) unreachableCount += 1;
      if (limb.reachMargin < closestReach.margin) closestReach = {
        sampleIndex, frameWithinCycle: sampleIndex % 24 + 1, timeSeconds: sample.timeSeconds,
        limb: id, margin: limb.reachMargin, requestedDistance: limb.requestedDistance,
        maximumReach: limb.maximumReach,
      };
      if (limb.stage === 'stance') {
        stanceSamples += 1;
        if (supportPositions.has(limb.supportId)) {
          maximumStanceFootDrift = Math.max(maximumStanceFootDrift,
            distance(limb.worldPaw, supportPositions.get(limb.supportId)));
        } else supportPositions.set(limb.supportId, limb.worldPaw);
      } else swingSamples += 1;
    }
  }
  let maximumLocalCycleClosureError = 0;
  let maximumTwoCyclePoseDifference = 0;
  for (let i = 0; i < 24; i += 1) {
    const first = twoCycles[i];
    const second = twoCycles[i + 24];
    for (const id of names) for (const key of ['hip', 'knee', 'ankle', 'paw']) {
      const error = distance(first.limbs[id][key], second.limbs[id][key]);
      maximumTwoCyclePoseDifference = Math.max(maximumTwoCyclePoseDifference, error);
      if (i === 0) maximumLocalCycleClosureError = Math.max(maximumLocalCycleClosureError, error);
    }
  }
  return {
    motionRevision: 'R2', baselineMotionRevision: 'R1', visualStyleStatus: 'REJECTED',
    selectedStride: WALK_CONFIG.stride, requiredReachMargin: WALK_CONFIG.requiredReachMargin,
    scope: 'MOTION R2 numerical geometry only. R1 is frozen. No skin, rendered image, animation aesthetics, or production art validation.',
    sampledCycles: 2, sampledPoses: twoCycles.length, limbsPerPose: 4,
    intervalSeconds: 1 / WALK_CONFIG.fps, renderedSamples: 24,
    stanceSamples, swingSamples, distinctSupportIntervals: supportPositions.size,
    unreachableCount, closestReach,
    maximumStanceFootDrift, maximumUpperLengthError, maximumLowerLengthError,
    maximumContactTargetError, maximumPawAnkleOffsetError,
    minimumPawZ, maximumPawZ, minimumBodyBob, maximumBodyBob,
    maximumLocalCycleClosureError, maximumTwoCyclePoseDifference,
  };
}
const audit = numericalAudit();

function denseNumericalAudit() {
  const intervalsPerCycle = WALK_CONFIG.denseIntervalsPerCycle;
  const supports = new Map();
  let closestReach = { margin: Infinity };
  let unreachableCount = 0;
  let maximumStanceFootDrift = 0;
  let maximumUpperLengthError = 0;
  let maximumLowerLengthError = 0;
  let maximumPawAnkleOffsetError = 0;
  let minimumPawZ = Infinity;
  let maximumPawZ = -Infinity;
  const perLimbMinimumReachMargin = Object.fromEntries(names.map((id) => [id, Infinity]));
  for (let i = 0; i <= intervalsPerCycle * 2; i += 1) {
    const sample = sampleWalk(i * WALK_CONFIG.cycleSeconds / intervalsPerCycle);
    for (const [id, limb] of Object.entries(sample.limbs)) {
      const rest = REST_CHAINS[id];
      if (!limb.reachable) unreachableCount += 1;
      perLimbMinimumReachMargin[id] = Math.min(perLimbMinimumReachMargin[id], limb.reachMargin);
      if (limb.reachMargin < closestReach.margin) closestReach = {
        limb: id, timeSeconds: sample.timeSeconds, phase: sample.phase,
        margin: limb.reachMargin, requestedDistance: limb.requestedDistance,
        maximumReach: limb.maximumReach,
      };
      maximumUpperLengthError = Math.max(maximumUpperLengthError, Math.abs(distance(limb.hip, limb.knee) - rest.upperLength));
      maximumLowerLengthError = Math.max(maximumLowerLengthError, Math.abs(distance(limb.knee, limb.ankle) - rest.lowerLength));
      maximumPawAnkleOffsetError = Math.max(maximumPawAnkleOffsetError, distance(sub(limb.ankle, limb.paw), rest.ankleOffset));
      minimumPawZ = Math.min(minimumPawZ, limb.worldPaw[2]);
      maximumPawZ = Math.max(maximumPawZ, limb.worldPaw[2]);
      if (limb.stage === 'stance') {
        const prior = supports.get(limb.supportId);
        if (prior) maximumStanceFootDrift = Math.max(maximumStanceFootDrift, distance(prior, limb.worldPaw));
        else supports.set(limb.supportId, limb.worldPaw);
      }
    }
  }
  return {
    intervalsPerCycle, sampledCycles: 2, sampledPosesIncludingEndpoint: intervalsPerCycle * 2 + 1,
    phaseResolution: 1 / intervalsPerCycle, timeResolutionSeconds: WALK_CONFIG.cycleSeconds / intervalsPerCycle,
    requiredReachMargin: WALK_CONFIG.requiredReachMargin, closestReach, perLimbMinimumReachMargin,
    unreachableCount, maximumStanceFootDrift, maximumUpperLengthError, maximumLowerLengthError,
    maximumPawAnkleOffsetError, minimumPawZ, maximumPawZ,
  };
}
const denseAudit = denseNumericalAudit();
audit.densePhaseGrid = denseAudit;
audit.selection = {
  attemptedStrides: [0.64], selectedStride: 0.64, allRequestedKneeCentersUsed: true,
  additionalBoneTuning: false, requiredMargin: 0.02,
  measuredDenseMinimumMargin: denseAudit.closestReach.margin,
  result: 'Selected requested upper bound .64; dense reach margin exceeds .02 without further anatomy tuning',
};


test('authored chains, lengths and bend branches reproduce the supplied rest geometry', () => {
  assert.deepEqual(Object.keys(REST_CHAINS), names);
  assert.deepEqual(REST_CHAINS.foreNear.hip, [0.36, -0.265, 0.67]);
  assert.deepEqual(REST_CHAINS.foreNear.paw, [0.68, -0.265, 0]);
  assert.deepEqual(REST_CHAINS.foreFar.ankle, [0.53, 0.265, 0.14]);
  assert.deepEqual(REST_CHAINS.hindNear.knee, [-0.59, -0.265, 0.44]);
  for (const rest of Object.values(REST_CHAINS)) {
    near(rest.upperLength, distance(rest.hip, rest.knee));
    near(rest.lowerLength, distance(rest.knee, rest.ankle));
    nearPoint(add(rest.paw, rest.ankleOffset), rest.ankle);
    const ik = solveLegIK(rest.hip, rest.ankle, rest.upperLength, rest.lowerLength, rest.bend);
    assert.equal(ik.reachable, true);
    nearPoint(ik.knee, rest.knee);
    nearPoint(ik.ankle, rest.ankle);
  }
});

test('schema has exactly 24 numbered render samples and actor-local/world positions', () => {
  const data = buildWalkSamples();
  assert.equal(data.version, 1);
  assert.equal(data.fps, 20);
  assert.equal(data.cycleSeconds, 1.2);
  assert.equal(data.stride, 0.64);
  assert.equal(data.motionRevision, 'R2');
  assert.equal(data.baselineMotionRevision, 'R1');
  assert.equal(data.visualStyleStatus, 'REJECTED');
  assert.equal(data.samples.length, 24);
  assert.equal(data.samples[0].phase, 0);
  near(data.samples[23].timeSeconds, 1.15);
  near(data.samples[23].phase, 23 / 24);
  for (const [i, sample] of data.samples.entries()) {
    assert.equal(sample.frame, i + 1);
    assert.deepEqual(Object.keys(sample.limbs), names);
    for (const limb of Object.values(sample.limbs)) {
      nearPoint(add(limb.hip, sample.root), limb.worldHip);
      nearPoint(add(limb.knee, sample.root), limb.worldKnee);
      nearPoint(add(limb.ankle, sample.root), limb.worldAnkle);
      nearPoint(add(limb.paw, sample.root), limb.worldPaw);
    }
  }
});

test('all support targets and actual world paws remain fixed throughout each stance interval', () => {
  assert.ok(audit.stanceSamples > 100);
  assert.ok(audit.distinctSupportIntervals >= 8);
  near(audit.maximumStanceFootDrift, 0);
  near(audit.maximumContactTargetError, 0);
  for (const sample of twoCycles) for (const limb of Object.values(sample.limbs)) {
    assert.equal(limb.contact, limb.stage === 'stance');
    if (limb.contact) {
      assert.equal(typeof limb.supportId, 'string');
      near(limb.worldPaw[2], 0);
    } else assert.equal(limb.supportId, null);
  }
});

test('the requested stride is reachable with fixed authored upper and lower lengths', () => {
  assert.equal(audit.unreachableCount, 0);
  near(audit.maximumUpperLengthError, 0);
  near(audit.maximumLowerLengthError, 0);
  assert.ok(audit.closestReach.margin > 0);
  assert.ok(audit.closestReach.margin >= WALK_CONFIG.requiredReachMargin);
  assert.equal(audit.closestReach.limb, 'foreFar');
  for (const sample of twoCycles) {
    assert.equal(sample.reachable, true);
    for (const limb of Object.values(sample.limbs)) near(limb.reachError, 0);
  }
});

test('paws never penetrate ground and cuffs maintain the given rigid offsets', () => {
  assert.ok(audit.minimumPawZ >= 0);
  assert.ok(audit.maximumPawZ <= 0.09 + tolerance);
  assert.ok(audit.maximumPawZ > 0.089);
  near(audit.maximumPawAnkleOffsetError, 0);
  for (const sample of twoCycles) for (const [id, limb] of Object.entries(sample.limbs)) {
    nearPoint(sub(limb.worldAnkle, limb.worldPaw), REST_CHAINS[id].ankleOffset);
  }
});

test('root travels exactly one stride per cycle and accumulated distance owns animation phase', () => {
  for (let i = 0; i < 24; i += 1) {
    const first = twoCycles[i];
    const second = twoCycles[i + 24];
    near(second.root[0] - first.root[0], 0.64);
    near(second.phase, first.phase);
    near(first.root[1], 0);
    near(first.root[2], 0);
  }
  const reference = twoCycles[7];
  const overridden = sampleWalk(999, { distance: reference.distance });
  near(overridden.phase, reference.phase);
  nearPoint(overridden.root, reference.root);
  assert.deepEqual(overridden.limbs, reference.limbs);
});

test('all hips share a downward bounded gait-linked bob', () => {
  assert.ok(audit.minimumBodyBob >= -0.028 - tolerance);
  assert.ok(audit.maximumBodyBob <= 0);
  near(audit.minimumBodyBob, -0.028);
  for (const sample of twoCycles) for (const [id, limb] of Object.entries(sample.limbs)) {
    near(limb.hip[2] - REST_CHAINS[id].hip[2], sample.bodyBob);
    near(limb.hip[0], REST_CHAINS[id].hip[0]);
    near(limb.hip[1], REST_CHAINS[id].hip[1]);
  }
});

test('fore elbows stay on the -X bend branch and hind knees on the +X branch', () => {
  for (const sample of twoCycles) for (const [id, limb] of Object.entries(sample.limbs)) {
    const [dx, , dz] = sub(limb.ankle, limb.hip);
    const [kx, , kz] = sub(limb.knee, limb.hip);
    const signedBend = dx * kz - dz * kx;
    assert.ok(signedBend * REST_CHAINS[id].bend > 0, `${id} changed bend branch`);
  }
});

test('phase offsets, four-leg anatomy and deterministic local cycle closure are preserved', () => {
  assert.deepEqual(WALK_CONFIG.phaseOffsets, { foreNear: 0, hindFar: 0.25, foreFar: 0.5, hindNear: 0.75 });
  for (const [id, offset] of Object.entries(WALK_CONFIG.phaseOffsets)) {
    const atTouchdown = twoCycles[Math.round(offset * 24)];
    near(atTouchdown.limbs[id].phase, 0);
    assert.equal(atTouchdown.limbs[id].contact, true);
  }
  near(audit.maximumLocalCycleClosureError, 0);
  near(audit.maximumTwoCyclePoseDifference, 0);
  near(twoCycles[0].bodyBob, twoCycles[24].bodyBob);
  finiteTree(twoCycles);
  assert.deepEqual(sampleWalk(0), twoCycles[0]);
});

test('unreachable requests are reported and clamped instead of extending bones', () => {
  const rest = REST_CHAINS.foreFar;
  const target = add(rest.hip, [1, 0, -0.53]);
  const ik = solveLegIK(rest.hip, target, rest.upperLength, rest.lowerLength, rest.bend);
  assert.equal(ik.reachable, false);
  assert.ok(ik.reachMargin < 0);
  assert.ok(ik.reachError > 0.4);
  near(distance(rest.hip, ik.knee), rest.upperLength);
  near(distance(ik.knee, ik.ankle), rest.lowerLength);
  near(ik.reachError, ik.requestedDistance - ik.maximumReach);
});


test('dense phase grid preserves supports, sole height and at least .02 reach margin', () => {
  assert.equal(denseAudit.sampledPosesIncludingEndpoint, 9601);
  assert.equal(denseAudit.unreachableCount, 0);
  assert.ok(denseAudit.closestReach.margin >= 0.02);
  assert.ok(denseAudit.closestReach.margin < audit.closestReach.margin,
    'Dense audit must capture the between-render-frame worst reach');
  assert.ok(denseAudit.minimumPawZ >= 0);
  assert.ok(denseAudit.maximumPawZ <= 0.09 + tolerance);
  for (const key of ['maximumStanceFootDrift', 'maximumUpperLengthError', 'maximumLowerLengthError',
    'maximumPawAnkleOffsetError']) near(denseAudit[key], 0, key);
  for (const margin of Object.values(denseAudit.perLimbMinimumReachMargin)) assert.ok(margin >= 0.02);
});

test('only the explicitly requested knee centers change; frozen R1 source and samples are intact', async () => {
  const sha256 = (data) => createHash('sha256').update(data).digest('hex');
  assert.equal(sha256(await readFile(new URL('../walk-solver.mjs', import.meta.url))), R1_REFERENCE.solverSha256);
  assert.equal(sha256(await readFile(new URL('../walk-samples.json', import.meta.url))), R1_REFERENCE.samplesSha256);
  assert.equal(R1_REFERENCE.stride, 0.32);
  assert.equal(WALK_CONFIG.stride, 0.64);
  for (const [id, rest] of Object.entries(REST_CHAINS)) {
    const previous = R1_REFERENCE.rest[id];
    for (const key of ['hip', 'ankle', 'paw', 'ankleOffset']) assert.deepEqual(rest[key], previous[key]);
    assert.deepEqual(rest.knee, rest.family === 'fore'
      ? [0.28, rest.hip[1], 0.40] : [-0.59, rest.hip[1], 0.44]);
    near(rest.upperLength, distance(rest.hip, rest.knee));
    near(rest.lowerLength, distance(rest.knee, rest.ankle));
    assert.equal(rest.nominalPawX, previous.nominalPawX);
    assert.equal(rest.bend, previous.bend);
  }
});

test('writes the bounded numerical audit alongside the exact render samples', async () => {
  assert.equal(audit.sampledPoses, 48);
  assert.equal(audit.unreachableCount, 0);
  assert.equal(denseAudit.unreachableCount, 0);
  assert.ok(denseAudit.closestReach.margin >= WALK_CONFIG.requiredReachMargin);
  assert.ok(denseAudit.minimumPawZ >= 0);
  assert.ok(audit.minimumPawZ >= 0);
  assert.ok(audit.closestReach.margin > 0);
  for (const key of ['maximumStanceFootDrift', 'maximumUpperLengthError', 'maximumLowerLengthError',
    'maximumContactTargetError', 'maximumPawAnkleOffsetError', 'maximumLocalCycleClosureError',
    'maximumTwoCyclePoseDifference']) near(audit[key], 0, key);
  const artifact = { ...buildWalkSamples(), audit };
  const destination = new URL('./walk-samples.json', import.meta.url);
  const temporary = new URL('./walk-samples.json.tmp', import.meta.url);
  await writeFile(temporary, `${JSON.stringify(artifact, null, 2)}\n`);
  await rename(temporary, destination);
  const saved = JSON.parse(await readFile(destination, 'utf8'));
  assert.equal(saved.samples.length, 24);
  assert.deepEqual(saved.audit, audit);
  console.log(JSON.stringify(audit));
});
