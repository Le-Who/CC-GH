/** Three authored geometry keys only: stand / sit / curl. No rendered art or
 * transition clip is generated. R3 style remains REJECTED. R2 leg anatomy is immutable.
 */
import { REST_CHAINS } from '../motion-r2/walk-solver.mjs';
const EPS = 1e-10;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map((v) => v * k);
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => Math.hypot(...v);
const unit = (v) => mul(v, 1 / norm(v));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rad = (d) => d * Math.PI / 180;
const deg = (r) => r * 180 / Math.PI;
const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

export const REST_SPINE_POINTS = deepFreeze([[-0.78, 0, 0.68], [-0.43, 0, 0.73], [-0.06, 0, 0.77], [0.32, 0, 0.82]]);
export const REST_HEAD = deepFreeze({ center: [0.61, -0.015, 1.15], forward: unit([0.93, -0.368, 0]), up: [0, 0, 1] });
export const CUSHION = deepFreeze({ center: [-.1, 0, 0], width: 2.8, depth: 2.4, topZ: 0.18 });
const SPINE_NAMES = ['pelvis', 'lumbar', 'chest'];
const SPINE_LENGTHS = REST_SPINE_POINTS.slice(1).map((p, i) => norm(sub(p, REST_SPINE_POINTS[i])));
const REST_PITCHES = REST_SPINE_POINTS.slice(1).map((p, i) => Math.atan2(p[2] - REST_SPINE_POINTS[i][2], p[0] - REST_SPINE_POINTS[i][0]));
const NECK_LENGTH = norm(sub(REST_HEAD.center, REST_SPINE_POINTS[3]));
const REST_FACE_YAW = Math.atan2(REST_HEAD.forward[1], REST_HEAD.forward[0]);

// Axes are right-handed: x=forward along bone, y=lateral, z=up.
export function frameFromYawPitch(origin, yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  return { origin: [...origin], forward: [cy * cp, sy * cp, sp], side: [-sy, cy, 0],
    up: [-cy * sp, -sy * sp, cp], rotation: { yaw, pitch, roll: 0 } };
}
function localVector(v, frame) { return [dot(v, frame.forward), dot(v, frame.side), dot(v, frame.up)]; }
function worldVector(v, frame) { return add(add(mul(frame.forward, v[0]), mul(frame.side, v[1])), mul(frame.up, v[2])); }
function yawRotate(v, yaw) { return [v[0] * Math.cos(yaw) - v[1] * Math.sin(yaw), v[0] * Math.sin(yaw) + v[1] * Math.cos(yaw), v[2]]; }
function frameBetween(a, b) {
  const d = sub(b, a);
  return frameFromYawPitch(a, Math.atan2(d[1], d[0]), Math.atan2(d[2], Math.hypot(d[0], d[1])));
}
const REST_FRAMES = REST_PITCHES.map((p, i) => frameFromYawPitch(REST_SPINE_POINTS[i], 0, p));
const REST_NECK_OFFSET = localVector(sub(REST_HEAD.center, REST_SPINE_POINTS[3]), REST_FRAMES[2]);
const REST_HIP_OFFSETS = deepFreeze(Object.fromEntries(Object.entries(REST_CHAINS).map(([id, rest]) => {
  const index = rest.family === 'fore' ? 3 : 0;
  const frameIndex = rest.family === 'fore' ? 2 : 0;
  return [id, { anchor: rest.family === 'fore' ? 'chest' : 'pelvis', endpointIndex: index,
    localOffset: localVector(sub(rest.hip, REST_SPINE_POINTS[index]), REST_FRAMES[frameIndex]) }];
})));

export const KEY_POSE_SPECS = deepFreeze({
  stand: { pelvis: [-0.78, 0, 0.86], yawPitchDeg: REST_PITCHES.map((p) => [0, deg(p)]),
    headYawDeg: deg(REST_FACE_YAW), headPitchDeg: 0, eyeClose: 0 },
  sit: { pelvis: [-0.78, 0, 0.60], yawPitchDeg: [[0, 30], [0, 28], [0, 12]],
    headYawDeg: deg(REST_FACE_YAW), headPitchDeg: -5, eyeClose: 0.15 },
  curl: { pelvis: [-0.50, 0.15, 0.62], yawPitchDeg: [[15, 0], [-45, 0], [-105, 10]],
    // Independent neck tuck continuing the C, with unchanged rest neck length.
    neckYawPitchDeg: [-155, 10], headYawDeg: -90, headPitchDeg: -20, eyeClose: 1,
    pawTargets: { foreNear: [-0.25, -0.52, 0.18], foreFar: [0.11, -0.62, 0.18],
      hindNear: [-0.64, -0.05, 0.18], hindFar: [-0.60, 0.45, 0.18] },
  },
});

/** 3D fixed-length solve with an anatomical world guide already including bend sign.
 * The guide and paw/ankle orientation rotate with the corresponding body frame yaw.
 */
export function solveGuidedIK(hip, target, upperLength, lowerLength, kneeGuide) {
  const d = sub(target, hip), r = norm(d);
  const min = Math.abs(upperLength - lowerLength), max = upperLength + lowerLength;
  const reachable = r >= min - EPS && r <= max + EPS;
  const axis = r > EPS ? mul(d, 1 / r) : [0, 0, -1];
  let guide = sub(kneeGuide, mul(axis, dot(kneeGuide, axis)));
  const guideDegenerate = norm(guide) < EPS;
  if (guideDegenerate) {
    const alternate = Math.abs(axis[2]) < .9 ? [0, 0, 1] : [0, 1, 0];
    guide = sub(alternate, mul(axis, dot(alternate, axis)));
  }
  guide = unit(guide);
  const solvedR = clamp(r, Math.max(EPS, min), max);
  const along = (upperLength ** 2 - lowerLength ** 2 + solvedR ** 2) / (2 * solvedR);
  const across = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const knee = add(add(hip, mul(axis, along)), mul(guide, across));
  const ankle = reachable ? [...target] : add(hip, mul(axis, solvedR));
  return { knee, ankle, reachable, requestedDistance: r, minimumReach: min, maximumReach: max,
    innerReachMargin: r - min, outerReachMargin: max - r, reachError: norm(sub(ankle, target)),
    guideDegenerate, kneePlaneGuide: guide };
}

export function sampleKeyPose(name) {
  const spec = KEY_POSE_SPECS[name];
  if (!spec) throw new RangeError(`Unknown authored key pose: ${name}`);
  const points = [[...spec.pelvis]];
  const spine = {};
  const frames = [];
  for (let i = 0; i < 3; i += 1) {
    const [yawDeg, pitchDeg] = spec.yawPitchDeg[i];
    const frame = frameFromYawPitch(points[i], rad(yawDeg), rad(pitchDeg));
    const tail = add(points[i], mul(frame.forward, SPINE_LENGTHS[i]));
    frames.push(frame); points.push(tail);
    spine[SPINE_NAMES[i]] = { head: points[i], tail, up: frame.up, forward: frame.forward,
      length: SPINE_LENGTHS[i], frame,
      parentLocalAxes: i === 0 ? null : {
        forward: localVector(frame.forward, frames[i - 1]), side: localVector(frame.side, frames[i - 1]),
        up: localVector(frame.up, frames[i - 1]),
      } };
  }
  const neckVector = spec.neckYawPitchDeg
    ? mul(frameFromYawPitch(points[3], ...spec.neckYawPitchDeg.map(rad)).forward, NECK_LENGTH)
    : worldVector(REST_NECK_OFFSET, frames[2]);
  const headCenter = add(points[3], neckVector);
  const neckFrame = frameBetween(points[3], headCenter);
  spine.neck = { head: points[3], tail: headCenter, up: neckFrame.up, forward: neckFrame.forward,
    length: NECK_LENGTH, frame: neckFrame };
  const headFrame = frameFromYawPitch(headCenter, rad(spec.headYawDeg), rad(spec.headPitchDeg));
  const limbs = {};
  for (const [id, rest] of Object.entries(REST_CHAINS)) {
    const binding = REST_HIP_OFFSETS[id];
    const frame = frames[rest.family === 'fore' ? 2 : 0];
    const hip = add(points[binding.endpointIndex], worldVector(binding.localOffset, frame));
    const requestedPaw = spec.pawTargets?.[id] ? [...spec.pawTargets[id]] : add(rest.paw, [0, 0, CUSHION.topZ]);
    const yaw = frame.rotation.yaw;
    const ankleOffset = yawRotate(rest.ankleOffset, yaw);
    const requestedAnkle = add(requestedPaw, ankleOffset);
    const kneeGuide = yawRotate([rest.bend, 0, 0], yaw);
    const ik = solveGuidedIK(hip, requestedAnkle, rest.upperLength, rest.lowerLength, kneeGuide);
    const ankle = ik.ankle;
    const paw = ik.reachable ? requestedPaw : sub(ankle, ankleOffset);
    const upperFrame = frameBetween(hip, ik.knee), lowerFrame = frameBetween(ik.knee, ankle);
    const pawFrame = frameFromYawPitch(paw, yaw, 0);
    const contact = ik.reachable && Math.abs(paw[2] - CUSHION.topZ) <= EPS;
    limbs[id] = { hip, knee: ik.knee, ankle, paw,
      worldHip: [...hip], worldKnee: [...ik.knee], worldAnkle: [...ankle], worldPaw: [...paw],
      pawForward: pawFrame.forward, pawUp: pawFrame.up, ankleOffset, requestedPaw, requestedAnkle,
      kneeGuide, hipBinding: binding, anchorFrame: frame,
      rotations: { upper: upperFrame.rotation, lower: lowerFrame.rotation, paw: pawFrame.rotation },
      frames: { upper: upperFrame, lower: lowerFrame, paw: pawFrame },
      contact, supportId: `cushion:${name === 'curl' ? 'curled' : 'initial'}:${id}`,
      upperLength: rest.upperLength, lowerLength: rest.lowerLength,
      reachable: ik.reachable, reachError: ik.reachError,
      innerReachMargin: ik.innerReachMargin, outerReachMargin: ik.outerReachMargin,
      guideDegenerate: ik.guideDegenerate,
    };
  }
  return { name, root: [0, 0, 0], spine, spineEndpoints: points,
    head: { center: headCenter, worldCenter: [...headCenter], forward: headFrame.forward,
      up: headFrame.up, frame: headFrame, rotation: headFrame.rotation },
    limbs, eyeClose: spec.eyeClose, reachable: Object.values(limbs).every((l) => l.reachable),
    globalScale: 1, skinContactValidated: false, visualStyleStatus: 'REJECTED' };
}

export function buildKeyPosePack() {
  const restSpine = Object.fromEntries(SPINE_NAMES.map((name, i) => [name, {
    head: REST_SPINE_POINTS[i], tail: REST_SPINE_POINTS[i + 1],
    up: REST_FRAMES[i].up, forward: REST_FRAMES[i].forward, length: SPINE_LENGTHS[i], frame: REST_FRAMES[i],
  }]));
  const neckFrame = frameBetween(REST_SPINE_POINTS[3], REST_HEAD.center);
  restSpine.neck = { head: REST_SPINE_POINTS[3], tail: REST_HEAD.center,
    up: neckFrame.up, forward: neckFrame.forward, length: NECK_LENGTH, frame: neckFrame };
  return { version: 1, motionRevision: 'rest-r1-static-keys-paw-binding-r3', sourceLegAnatomy: 'R2',
    visualStyleStatus: 'REJECTED', scope: 'Three static FK/IK keys only. No full timeline or transition validation.',
    coordinateSystem: '+X forward, +Z up. Rest bones are original flat-floor coordinates. Pose joints include cushion elevation; armature root stays [0,0,0].',
    angleUnits: 'radians unless property ends in Deg', frameAxes: 'forward=x, side=y, up=z; orthonormal right-handed',
    cushion: CUSHION, restSpine, restHead: REST_HEAD, restLimbs: REST_CHAINS,
    hipBindings: REST_HIP_OFFSETS, authoredSpecs: KEY_POSE_SPECS,
    headTuckAuthorship: 'Curl keeps neck length fixed; neck yaw/pitch -155/10 deg and head facing -90/-20 deg independently tuck the head.',
    targetChanges: [{limb:'foreFar',pose:'curl',old:[.04,-.60,.10],current:[.11,-.62,.18],reason:'Separate tucked forepaw footprints; all paws elevated uniformly to the thicker .18 cushion seat.'}],
    poseCalibration: { reason: 'First evaluated skin penetrated cushion by .0653 for sit and .1061 for curl; adjust spine, never scale body or move fixed paws.', originalSitPelvis: [-.9,0,.42], originalCurlPelvis: [-.5,.15,.43] },
    warnings: ['Revised pelvis heights await independent mesh clearance check.',
      'Joint centers above the cushion do not establish mesh contact or exclude skin intersection.',
      'Rest-to-pose deformation is articulated FK/IK; globalScale is always 1.'],
    transitionContract: {
      status: 'PLANNED ONLY; awaits static geometry/skin review before trajectory solving',
      standToSit: 'Keep all four original support anchors fixed while articulating pelvis/spine.',
      curlTuckOrder: ['hindNear', 'foreNear', 'foreFar', 'hindFar'], maxSimultaneouslyLiftedPaws: 1,
      eachTuckPhases: ['lift from current support', 'move toward curled support', 'lower and land before lifting next paw'],
      bodyMotion: 'Interleave reach-checked pelvis/spine turns with the single-paw phases; no support interpolation.',
      authoredTrajectorySamples: 0,
    },
    poses: ['stand', 'sit', 'curl'].map(sampleKeyPose),
  };
}
