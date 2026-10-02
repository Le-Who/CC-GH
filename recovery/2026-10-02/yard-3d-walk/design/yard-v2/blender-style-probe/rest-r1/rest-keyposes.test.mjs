import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { REST_CHAINS } from '../motion-r2/walk-solver.mjs';
import { REST_SPINE_POINTS, REST_HEAD, CUSHION, KEY_POSE_SPECS, sampleKeyPose,
  buildKeyPosePack, solveGuidedIK } from './rest-keyposes.mjs';
const pack = buildKeyPosePack();
const [stand, sit, curl] = pack.poses;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => Math.hypot(...v);
const distance = (a, b) => norm(sub(a, b));
const near = (a, b, epsilon = 1e-10) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const nearPoint = (a, b, epsilon = 1e-10) => near(distance(a, b), 0, epsilon);
const rotateYaw = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a), v[2]];
const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (norm(a) * norm(b)))));
const bendAngle = (leg) => angleBetween(sub(leg.knee, leg.hip), sub(leg.ankle, leg.knee));
const frameError = (f) => Math.max(Math.abs(norm(f.forward) - 1), Math.abs(norm(f.side) - 1),
  Math.abs(norm(f.up) - 1), Math.abs(dot(f.forward, f.side)), Math.abs(dot(f.forward, f.up)),
  Math.abs(dot(f.side, f.up)), Math.abs(dot(cross(f.forward, f.side), f.up) - 1));
const finiteTree = (v) => {
  if (typeof v === 'number') assert.ok(Number.isFinite(v));
  else if (v && typeof v === 'object') Object.values(v).forEach(finiteTree);
};

function keyAudit() {
  let maximumSpineLengthError = 0, maximumNeckLengthError = 0;
  let maximumUpperLengthError = 0, maximumLowerLengthError = 0, maximumFrameError = 0;
  let maximumHipBindingError = 0, maximumPawAnkleOffsetError = 0;
  let minimumJointCenterZ = Infinity, minimumCushionFootprintMargin = Infinity;
  let unreachableCount = 0;
  const nearInnerLimit = [];
  const poseMetrics = {};
  for (const pose of pack.poses) {
    for (const name of ['pelvis', 'lumbar', 'chest']) {
      const bone = pose.spine[name];
      maximumSpineLengthError = Math.max(maximumSpineLengthError, Math.abs(distance(bone.head, bone.tail) - pack.restSpine[name].length));
      maximumFrameError = Math.max(maximumFrameError, frameError(bone.frame));
    }
    maximumNeckLengthError = Math.max(maximumNeckLengthError,
      Math.abs(distance(pose.spine.neck.head, pose.spine.neck.tail) - pack.restSpine.neck.length));
    maximumFrameError = Math.max(maximumFrameError, frameError(pose.spine.neck.frame), frameError(pose.head.frame));
    let minInner = Infinity, minOuter = Infinity;
    for (const [id, limb] of Object.entries(pose.limbs)) {
      const rest = REST_CHAINS[id];
      if (!limb.reachable) unreachableCount += 1;
      maximumUpperLengthError = Math.max(maximumUpperLengthError, Math.abs(distance(limb.hip, limb.knee) - rest.upperLength));
      maximumLowerLengthError = Math.max(maximumLowerLengthError, Math.abs(distance(limb.knee, limb.ankle) - rest.lowerLength));
      minimumJointCenterZ = Math.min(minimumJointCenterZ, limb.hip[2], limb.knee[2], limb.ankle[2]);
      const frame = limb.anchorFrame;
      const offset = limb.hipBinding.localOffset;
      const anchor = pose.spineEndpoints[limb.hipBinding.endpointIndex];
      const reconstructed = add(anchor, add(add(mul(frame.forward, offset[0]), mul(frame.side, offset[1])), mul(frame.up, offset[2])));
      maximumHipBindingError = Math.max(maximumHipBindingError, distance(limb.hip, reconstructed));
      maximumPawAnkleOffsetError = Math.max(maximumPawAnkleOffsetError,
        distance(sub(limb.ankle, limb.paw), rotateYaw(rest.ankleOffset, limb.rotations.paw.yaw)));
      const yaw = limb.rotations.paw.yaw;
      const extentX = .21 * Math.abs(Math.cos(yaw)) + .165 * Math.abs(Math.sin(yaw));
      const extentY = .21 * Math.abs(Math.sin(yaw)) + .165 * Math.abs(Math.cos(yaw));
      minimumCushionFootprintMargin = Math.min(minimumCushionFootprintMargin,
        CUSHION.width / 2 - Math.abs(limb.paw[0]-CUSHION.center[0]) - extentX,
        CUSHION.depth / 2 - Math.abs(limb.paw[1]-CUSHION.center[1]) - extentY);
      minInner = Math.min(minInner, limb.innerReachMargin); minOuter = Math.min(minOuter, limb.outerReachMargin);
      if (limb.innerReachMargin < .02) nearInnerLimit.push({ pose: pose.name, limb: id, margin: limb.innerReachMargin,
        note: 'Reachable but tightly folded. Target kept as requested; skin/transition review required.' });
      for (const f of Object.values(limb.frames)) maximumFrameError = Math.max(maximumFrameError, frameError(f));
    }
    poseMetrics[pose.name] = { minimumInnerReachMargin: minInner, minimumOuterReachMargin: minOuter,
      frontHipZ: pose.limbs.foreNear.hip[2], hindHipZ: pose.limbs.hindNear.hip[2],
      hindKneeZ: pose.limbs.hindNear.knee[2], headCenter: pose.head.center,
      hindNearBendDegrees: bendAngle(pose.limbs.hindNear) * 180 / Math.PI,
      spineEndToEndDistance: distance(pose.spineEndpoints[0], pose.spineEndpoints[3]) };
  }
  return { scope: 'Three static skeletal keys only. No transition path, skin penetration, or production art pass.',
    visualStyleStatus: 'REJECTED', keyPoseCount: 3, limbSolutions: 12, unreachableCount,
    transitionSamples: 0, transitionReachValidated: false, skinContactValidated: false,
    maximumSpineLengthError, maximumNeckLengthError, maximumUpperLengthError, maximumLowerLengthError,
    maximumFrameError, maximumHipBindingError, maximumPawAnkleOffsetError,
    minimumJointCenterZ, cushionTopZ: CUSHION.topZ,
    minimumCushionFootprintMargin, footprintHalfExtents: [.21, .165],
    nearInnerLimit, poseMetrics,
  };
}
const audit = keyAudit();
const sourceFile = new URL('../motion-r2/walk-solver.mjs', import.meta.url);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const sourceHash = sha(await readFile(sourceFile));

test('static schema includes exactly stand/sit/curl, original rest bones and zero armature roots', () => {
  assert.deepEqual(pack.poses.map((p) => p.name), ['stand', 'sit', 'curl']);
  assert.deepEqual(Object.keys(pack.restSpine), ['pelvis', 'lumbar', 'chest', 'neck']);
  assert.deepEqual(pack.restSpine.pelvis.head, [-.78, 0, .68]);
  assert.deepEqual(pack.restSpine.chest.tail, [.32, 0, .82]);
  assert.deepEqual(pack.restSpine.neck.tail, [.61, -.015, 1.15]);
  for (const p of pack.poses) {
    assert.deepEqual(p.root, [0, 0, 0]); assert.equal(p.globalScale, 1);
    assert.equal(p.visualStyleStatus, 'REJECTED');
    for (const l of Object.values(p.limbs)) {
      nearPoint(l.hip, l.worldHip); nearPoint(l.knee, l.worldKnee);
      nearPoint(l.ankle, l.worldAnkle); nearPoint(l.paw, l.worldPaw);
    }
  }
  assert.equal(pack.transitionContract.authoredTrajectorySamples, 0);
  finiteTree(pack);
});

test('all three spine segments and the neck maintain exact rest lengths with continuous endpoints', () => {
  near(audit.maximumSpineLengthError, 0); near(audit.maximumNeckLengthError, 0);
  for (const p of pack.poses) {
    nearPoint(p.spine.pelvis.tail, p.spine.lumbar.head);
    nearPoint(p.spine.lumbar.tail, p.spine.chest.head);
    nearPoint(p.spine.chest.tail, p.spine.neck.head);
    nearPoint(p.spine.neck.tail, p.head.center);
  }
  near(audit.maximumFrameError, 0);
});

test('stand exactly reconstructs R2 rest chains and original spine/head raised by cushion top', () => {
  for (const [id, rest] of Object.entries(REST_CHAINS)) {
    for (const key of ['hip', 'knee', 'ankle', 'paw']) nearPoint(stand.limbs[id][key], add(rest[key], [0, 0, CUSHION.topZ]));
  }
  REST_SPINE_POINTS.forEach((p, i) => nearPoint(stand.spineEndpoints[i], add(p, [0, 0, CUSHION.topZ])));
  nearPoint(stand.head.center, add(REST_HEAD.center, [0, 0, CUSHION.topZ]));
  nearPoint(stand.head.forward, REST_HEAD.forward);
  nearPoint(stand.head.up, [0, 0, 1]);
});

test('hip anchors come only from their original offsets transformed by pelvis/chest frames', () => {
  near(audit.maximumHipBindingError, 0);
  for (const p of pack.poses) for (const [id, l] of Object.entries(p.limbs)) {
    assert.equal(l.hipBinding.anchor, REST_CHAINS[id].family === 'fore' ? 'chest' : 'pelvis');
    assert.deepEqual(l.hipBinding.localOffset, pack.hipBindings[id].localOffset);
  }
  assert.ok(distance(stand.limbs.foreNear.hip, sit.limbs.foreNear.hip) > .05);
  assert.ok(distance(stand.limbs.hindNear.hip, sit.limbs.hindNear.hip) > .20);
});

test('sit keeps the four support points fixed and truly folds the hind joints', () => {
  for (const id of Object.keys(REST_CHAINS)) {
    nearPoint(sit.limbs[id].paw, stand.limbs[id].paw);
    assert.equal(sit.limbs[id].supportId, stand.limbs[id].supportId);
    assert.equal(sit.limbs[id].contact, true);
  }
  assert.ok(audit.poseMetrics.sit.hindNearBendDegrees > audit.poseMetrics.stand.hindNearBendDegrees + 45);
  assert.ok(sit.limbs.hindNear.hip[2] > .53 && sit.limbs.hindNear.hip[2] < .63);
  assert.ok(sit.limbs.foreNear.hip[2] > .75);
});

test('curl is a genuinely articulated C with a separately tucked fixed-length neck/head', () => {
  const angles = Object.values(curl.spine).slice(0, 3).map((bone) => bone.frame.rotation.yaw * 180 / Math.PI);
  angles.forEach((a, i) => near(a, [15, -45, -105][i]));
  const curlAngle = angleBetween(curl.spine.pelvis.forward, curl.spine.chest.forward);
  const standAngle = angleBetween(stand.spine.pelvis.forward, stand.spine.chest.forward);
  assert.ok(curlAngle > standAngle + 1.5);
  assert.ok(audit.poseMetrics.curl.spineEndToEndDistance < audit.poseMetrics.stand.spineEndToEndDistance - .3);
  assert.ok(curl.head.center[2] < .85);
  assert.ok(curl.head.forward[2] < -.3);
  assert.equal(curl.eyeClose, 1);
  assert.equal(stand.eyeClose, 0);
});

test('all12 limbs retain R2 lengths; revised pelvis resolves the tight inner fold without moving paw targets', () => {
  assert.equal(audit.unreachableCount, 0);
  near(audit.maximumUpperLengthError, 0); near(audit.maximumLowerLengthError, 0);
  assert.equal(audit.nearInnerLimit.length, 0);
  assert.ok(curl.limbs.foreNear.innerReachMargin > .05);
  assert.deepEqual(curl.limbs.foreNear.paw, [-.25, -.52, .18]);
  assert.equal(pack.targetChanges.length, 1);
  for (const [id, target] of Object.entries(KEY_POSE_SPECS.curl.pawTargets)) nearPoint(curl.limbs[id].paw, target);
});

test('ankle offsets, paw facing and knee guides rotate with the appropriate body yaw', () => {
  near(audit.maximumPawAnkleOffsetError, 0);
  for (const p of pack.poses) for (const [id, l] of Object.entries(p.limbs)) {
    const yaw = l.anchorFrame.rotation.yaw;
    nearPoint(l.pawForward, rotateYaw([1, 0, 0], yaw));
    nearPoint(l.pawUp, [0, 0, 1]);
    nearPoint(l.kneeGuide, rotateYaw([REST_CHAINS[id].bend, 0, 0], yaw));
    nearPoint(sub(l.ankle, l.paw), rotateYaw(REST_CHAINS[id].ankleOffset, yaw));
    assert.equal(l.guideDegenerate, false);
  }
});

test('every contact and conservative paw footprint stays on/inside the cushion', () => {
  assert.ok(audit.minimumJointCenterZ >= CUSHION.topZ);
  assert.ok(audit.minimumCushionFootprintMargin > .20);
  for (const p of pack.poses) for (const l of Object.values(p.limbs)) {
    assert.equal(l.contact, true); near(l.paw[2], CUSHION.topZ);
    assert.ok(Math.abs(l.paw[0]) < 1.4); assert.ok(Math.abs(l.paw[1]) < 1.2);
  }
  assert.equal(audit.skinContactValidated, false);
  assert.equal(audit.transitionReachValidated, false);
});

test('key sampling is deterministic and unreachable guided solves never stretch bones', () => {
  assert.deepEqual(sampleKeyPose('curl'), curl);
  sampleKeyPose('sit'); assert.deepEqual(sampleKeyPose('stand'), stand);
  assert.throws(() => sampleKeyPose('full-clip'), RangeError);
  const rest = REST_CHAINS.foreNear;
  const ik = solveGuidedIK(rest.hip, [10, 4, 7], rest.upperLength, rest.lowerLength, [-1, 0, 0]);
  assert.equal(ik.reachable, false);
  near(distance(rest.hip, ik.knee), rest.upperLength);
  near(distance(ik.knee, ik.ankle), rest.lowerLength);
});

test('save the three keys and honest numeric audit without modifying R2 source', async () => {
  assert.equal(audit.unreachableCount, 0);
  assert.ok(audit.minimumCushionFootprintMargin > 0);
  const output = { ...pack, audit, sourceIntegrity: { r2SolverSha256: sourceHash } };
  const path = new URL('./rest-keyposes.json', import.meta.url);
  const tmp = new URL('./rest-keyposes.json.tmp', import.meta.url);
  await writeFile(tmp, JSON.stringify(output, null, 2) + '\n'); await rename(tmp, path);
  assert.equal(sha(await readFile(sourceFile)), sourceHash);
  console.log(JSON.stringify(audit));
});
