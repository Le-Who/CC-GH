/** Deterministic technical interaction prototype. The R3 visual style is REJECTED.
 * R2 rest anatomy/lengths are reused unchanged. Numerical contact is not skin QA.
 */
import { REST_CHAINS, WALK_CONFIG, sampleWalk, solveLegIK } from '../motion-r2/walk-solver.mjs';
const EPS = 1e-10;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, k) => a.map((v) => v * k);
const norm = (v) => Math.hypot(...v);
const distance = (a, b) => norm(sub(a, b));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (q) => { const u = clamp(q, 0, 1); return u * u * (3 - 2 * u); };
const lerp = (a, b, q) => a.map((v, i) => v + (b[i] - v) * q);
const arc = (q) => 16 * q * q * (1 - q) * (1 - q);
const deepFreeze = (o) => { Object.values(o).forEach((v) => { if (v && typeof v === 'object') deepFreeze(v); }); return Object.freeze(o); };

export const INTERACTION = deepFreeze({
  revision: 'interaction-r1', fps: 20, sampleCount: 128, durationSeconds: 6.4,
  speed: 0.64 / 1.2, stride: 0.64, stopDistance: 0.96, exitDistance: 1.92,
  decelerationStart: 1.5, stopTime: 2.1, alignEnd: 2.5, attentionEnd: 2.8,
  tapTime: 3.35, pressPeak: 3.40, pressEnd: 3.50,
  unshiftStart: 3.7, recoveryEnd: 4.2, accelerationEnd: 4.8, walkEnd: 6.3,
  bodyWeightShift: [0.035, 0.02, -0.02],
  contactSocket: [1.90, -0.265, 0.217], // Authored PAW anchor calibrated against separate Blender skin measurements
  mouseCenter: [2.01, -0.265, 0.11], // stopDistance + 1.05; +.10 actual-mesh nose clearance calibration
  mouseKick: [0.08, 0, 0], mouseKickDuration: 0.65,
  mouseReleaseDisplacement: [0.13, -0.38, 0], mouseRollEnd: 3.9,
  groundedPawHalfExtents: [0.21, 0.165], toyHalfExtents: [0.301, 0.13],
  collisionCalibration: {
    reason: 'Actual mouse nose reaches centerX-.301; previous initial toy position overlapped standing paw toe before reach.',
    previousMouseCenter: [1.91, -0.265, 0.11], previousPawAnchor: [1.80, -0.265, 0.217],
    worldShift: [0.10, 0, 0], currentMouseCenter: [2.01, -0.265, 0.11],
    currentPawAnchor: [1.90, -0.265, 0.217], authoredPawAnchorRelativeRootX: 0.94,
    unchanged: 'Root path, all stand targets, R2 rest anatomy, paw-anchor Z calibration, and calibrated tap/press relative paw-toy anchor',
    proxy: 'Oriented XY rectangles; paw halfX=.21/halfY=.165, toy halfX=.301/halfY=.13 with rotationZ',
  },
  minimumMouseHeightScale: 0.90, contactPressDepth: 0.022,
  reachArcHeight: 0.08, returnArcHeight: 0.11,
  resumeSwingDistance: 0.16, actingLimb: 'foreNear', aligningLimb: 'hindNear',
  denseSamplesPerSecond: 2000,
});

/** Generalized fixed-length solve: unchanged R2 XZ solve when coplanar;
 * otherwise choose the knee plane using a world +X guide and the same bend sign.
 * This allows torso Y shift while every supporting paw remains fixed in world.
 */
export function solveSpatialIK(hip, requestedAnkle, upperLength, lowerLength, bend) {
  if (Math.abs(requestedAnkle[1] - hip[1]) <= EPS) return solveLegIK(hip, requestedAnkle, upperLength, lowerLength, bend);
  const delta = sub(requestedAnkle, hip);
  const requestedDistance = norm(delta);
  const minimumReach = Math.abs(upperLength - lowerLength);
  const maximumReach = upperLength + lowerLength;
  const reachable = requestedDistance >= minimumReach - EPS && requestedDistance <= maximumReach + EPS;
  const axis = requestedDistance > EPS ? mul(delta, 1 / requestedDistance) : [0, 0, -1];
  let perpendicular = sub([1, 0, 0], mul(axis, axis[0]));
  if (norm(perpendicular) < EPS) perpendicular = sub([0, 1, 0], mul(axis, axis[1]));
  perpendicular = mul(perpendicular, 1 / norm(perpendicular));
  const r = clamp(requestedDistance, Math.max(EPS, minimumReach), maximumReach);
  const along = (upperLength ** 2 - lowerLength ** 2 + r ** 2) / (2 * r);
  const across = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const knee = add(add(hip, mul(axis, along)), mul(perpendicular, across * (bend < 0 ? -1 : 1)));
  const ankle = reachable ? [...requestedAnkle] : add(hip, mul(axis, r));
  return { knee, ankle, reachable, requestedDistance, minimumReach, maximumReach,
    reachMargin: maximumReach - requestedDistance, innerReachMargin: requestedDistance - minimumReach,
    reachError: distance(ankle, requestedAnkle), upperLength, lowerLength };
}

function rawRootDistanceAt(t) {
  const time = clamp(Number.isFinite(t) ? t : 0, 0, INTERACTION.durationSeconds);
  const c = INTERACTION;
  if (time <= c.decelerationStart) return c.speed * time;
  if (time < c.stopTime) {
    const q = time - c.decelerationStart;
    return c.speed * c.decelerationStart + c.speed * (q - q * q / (2 * 0.6));
  }
  if (time <= c.recoveryEnd) return c.stopDistance;
  if (time < c.accelerationEnd) {
    const q = time - c.recoveryEnd;
    return c.stopDistance + c.speed * q * q / (2 * 0.6);
  }
  if (time < c.walkEnd) return c.stopDistance + c.speed * 0.3 + c.speed * (time - c.accelerationEnd);
  return c.exitDistance;
}

// Snap only floating-point noise around authored quarter-cycle boundaries.
// In particular, .96 + .16 must land on hindNear touchdown rather than a
// 1e-16-before-touchdown swing classification at the acceleration endpoint.
export function rootDistanceAt(t) {
  const d = rawRootDistanceAt(t);
  const quarter = Math.round(d / INTERACTION.stride * 4) / 4;
  return Math.abs(d / INTERACTION.stride - quarter) < 1e-12 ? quarter * INTERACTION.stride : d;
}

const STOP_POSE = sampleWalk(INTERACTION.stopTime, { distance: INTERACTION.stopDistance });
const STAND_TARGETS = deepFreeze(Object.fromEntries(Object.entries(STOP_POSE.limbs).map(([id, limb]) => [id,
  id === INTERACTION.aligningLimb ? [INTERACTION.stopDistance - 0.71, -0.265, 0] : [...limb.worldPaw],
])));
const RESUME_TOUCHDOWN = sampleWalk(0, { distance: INTERACTION.stopDistance + INTERACTION.resumeSwingDistance })
  .limbs[INTERACTION.aligningLimb].worldPaw;
const RESUME_LIFTOFF_DISTANCES = deepFreeze(Object.fromEntries(Object.entries(STOP_POSE.limbs)
  .filter(([id]) => id !== INTERACTION.aligningLimb)
  .map(([id, limb]) => [id, INTERACTION.stopDistance + (WALK_CONFIG.stanceRatio - limb.phase) * WALK_CONFIG.stride])));

function bodyWeightAt(t) {
  return smooth((t - INTERACTION.alignEnd) / (INTERACTION.attentionEnd - INTERACTION.alignEnd))
    * (1 - smooth((t - INTERACTION.unshiftStart) / (INTERACTION.recoveryEnd - INTERACTION.unshiftStart)));
}
function bodyShiftAt(t) { return mul(INTERACTION.bodyWeightShift, bodyWeightAt(t)); }
function phaseNameAt(t) {
  if (t < INTERACTION.decelerationStart) return 'walk-in';
  if (t < INTERACTION.stopTime) return 'decelerate';
  if (t < INTERACTION.alignEnd) return 'align';
  if (t < INTERACTION.attentionEnd) return 'attention';
  if (t < INTERACTION.tapTime) return 'reach';
  if (t < INTERACTION.pressEnd) return 'tap-press';
  if (t < INTERACTION.unshiftStart) return 'recoil';
  if (t < INTERACTION.recoveryEnd) return 'recover';
  if (t < INTERACTION.accelerationEnd) return 'accelerate';
  if (t < INTERACTION.walkEnd) return 'walk-out';
  return 'complete';
}

function contactTarget(options) {
  const p = options.mouseContact;
  return Array.isArray(p) && p.length === 3 && p.every(Number.isFinite) ? [...p] : [...INTERACTION.contactSocket];
}
function canReachContact(target) {
  const rest = REST_CHAINS[INTERACTION.actingLimb];
  const root = [INTERACTION.stopDistance, 0, 0];
  const hip = add(add(rest.hip, root), INTERACTION.bodyWeightShift);
  return solveSpatialIK(hip, add(target, rest.ankleOffset), rest.upperLength, rest.lowerLength, rest.bend).reachable;
}
function mouseAt(t, target, canTap) {
  let press = 0;
  if (canTap && t >= INTERACTION.tapTime && t < INTERACTION.pressEnd) {
    press = t <= INTERACTION.pressPeak
      ? smooth((t - INTERACTION.tapTime) / (INTERACTION.pressPeak - INTERACTION.tapTime))
      : 1 - smooth((t - INTERACTION.pressPeak) / (INTERACTION.pressEnd - INTERACTION.pressPeak));
  }
  const compression = 1 - (1 - INTERACTION.minimumMouseHeightScale) * press;
  const kick = canTap ? smooth((t - INTERACTION.tapTime) / INTERACTION.mouseKickDuration) : 0;
  let displacement = mul(INTERACTION.mouseKick, kick);
  let rotationZ = 0.10 * kick;
  // Keep the calibrated small press reaction unchanged through release. After
  // release, a C1 Hermite recoil rolls the toy sideways out of the paw lane.
  if (canTap && t > INTERACTION.pressEnd) {
    const releasePhase = (INTERACTION.pressEnd - INTERACTION.tapTime) / INTERACTION.mouseKickDuration;
    const releaseKick = smooth(releasePhase);
    const releaseRate = 6 * releasePhase * (1 - releasePhase) / INTERACTION.mouseKickDuration;
    const duration = INTERACTION.mouseRollEnd - INTERACTION.pressEnd;
    const q = clamp((t - INTERACTION.pressEnd) / duration, 0, 1);
    const h00 = 2 * q ** 3 - 3 * q ** 2 + 1;
    const h10 = q ** 3 - 2 * q ** 2 + q;
    const h01 = -2 * q ** 3 + 3 * q ** 2;
    displacement = INTERACTION.mouseKick.map((v, i) =>
      h00 * v * releaseKick + h10 * duration * v * releaseRate + h01 * INTERACTION.mouseReleaseDisplacement[i]);
    rotationZ = h00 * 0.10 * releaseKick + h10 * duration * 0.10 * releaseRate + h01 * 0.10;
  }
  const worldCenter = add(INTERACTION.mouseCenter, displacement);
  worldCenter[2] *= compression;
  const offset = sub(target, INTERACTION.mouseCenter);
  const contactSocket = [
    worldCenter[0] + offset[0] * Math.cos(rotationZ) - offset[1] * Math.sin(rotationZ),
    worldCenter[1] + offset[0] * Math.sin(rotationZ) + offset[1] * Math.cos(rotationZ),
    target[2] - INTERACTION.contactPressDepth * press,
  ];
  return { worldCenter, compression, displacement, rotationZ, contactSocket, reacting: canTap && t > INTERACTION.tapTime && t < INTERACTION.mouseRollEnd,
    responseAuthorizedByGeometricTap: canTap && t >= INTERACTION.tapTime,
    contactReference: 'authored paw anchor; actual skinned geometry validated separately',
    compressionConvention: 'Height multiplier: 1 at rest, minimum .90. Skinned geometry validation remains external.' };
}

function interactionFoot(id, t, travel, walk, target, canTap, mouse) {
  const base = walk.limbs[id];
  if (t < INTERACTION.stopTime) return { paw: base.worldPaw, stage: base.stage,
    supportId: base.supportId, contact: base.contact };
  if (t >= INTERACTION.recoveryEnd) {
    const resumedDistance = travel - INTERACTION.stopDistance;
    if (id === INTERACTION.aligningLimb && resumedDistance < INTERACTION.resumeSwingDistance) {
      const q = clamp(resumedDistance / INTERACTION.resumeSwingDistance, 0, 1);
      const paw = lerp(STAND_TARGETS[id], RESUME_TOUCHDOWN, smooth(q));
      paw[2] += WALK_CONFIG.liftHeight * arc(q);
      return { paw, stage: 'resume-swing', supportId: null, contact: false };
    }
    if (id !== INTERACTION.aligningLimb && travel < RESUME_LIFTOFF_DISTANCES[id]) {
      return { paw: STAND_TARGETS[id], stage: 'stance', supportId: STOP_POSE.limbs[id].supportId, contact: true };
    }
    return { paw: base.worldPaw, stage: base.stage, supportId: base.supportId, contact: base.contact };
  }
  if (id === INTERACTION.aligningLimb && t < INTERACTION.alignEnd) {
    const q = smooth((t - INTERACTION.stopTime) / (INTERACTION.alignEnd - INTERACTION.stopTime));
    return { paw: lerp(STOP_POSE.limbs[id].worldPaw, STAND_TARGETS[id], q),
      stage: 'align-lower', supportId: null, contact: false };
  }
  if (id === INTERACTION.actingLimb && t >= INTERACTION.attentionEnd) {
    if (t < INTERACTION.tapTime) {
      const q = (t - INTERACTION.attentionEnd) / (INTERACTION.tapTime - INTERACTION.attentionEnd);
      const paw = lerp(STAND_TARGETS[id], target, smooth(q));
      paw[2] += INTERACTION.reachArcHeight * arc(q);
      return { paw, stage: 'reach', supportId: null, contact: false };
    }
    if (t < INTERACTION.pressEnd) return { paw: mouse.contactSocket, stage: 'toy-contact',
      supportId: null, contact: false, toyContact: canTap };
    const start = mouseAt(INTERACTION.pressEnd, target, canTap).contactSocket;
    const q = (t - INTERACTION.pressEnd) / (INTERACTION.recoveryEnd - INTERACTION.pressEnd);
    const paw = lerp(start, STAND_TARGETS[id], smooth(q));
    paw[2] += INTERACTION.returnArcHeight * arc(q);
    return { paw, stage: t < INTERACTION.unshiftStart ? 'recoil' : 'recover', supportId: null, contact: false };
  }
  return { paw: STAND_TARGETS[id], stage: 'stance',
    supportId: id === INTERACTION.aligningLimb ? 'hindNear:interaction-align' : STOP_POSE.limbs[id].supportId,
    contact: true };
}

export function sampleInteraction(timeSeconds, options = {}) {
  const t = clamp(Number.isFinite(timeSeconds) ? timeSeconds : 0, 0, INTERACTION.durationSeconds);
  const travelled = rootDistanceAt(t);
  const walk = sampleWalk(t, { distance: travelled });
  const root = [...walk.root];
  const bodyBob = walk.bodyBob;
  const bodyShift = bodyShiftAt(t);
  const target = contactTarget(options);
  const canTap = canReachContact(target);
  const mouse = mouseAt(t, target, canTap);
  const limbs = {};
  for (const [id, rest] of Object.entries(REST_CHAINS)) {
    const intent = interactionFoot(id, t, travelled, walk, target, canTap, mouse);
    const hip = add(rest.hip, add(bodyShift, [0, 0, bodyBob]));
    const worldHip = add(root, hip);
    const requestedWorldPaw = [...intent.paw];
    const requestedWorldAnkle = add(requestedWorldPaw, rest.ankleOffset);
    const ik = solveSpatialIK(worldHip, requestedWorldAnkle, rest.upperLength, rest.lowerLength, rest.bend);
    const worldPaw = ik.reachable ? requestedWorldPaw : sub(ik.ankle, rest.ankleOffset);
    limbs[id] = {
      hip, knee: sub(ik.knee, root), ankle: sub(ik.ankle, root), paw: sub(worldPaw, root),
      worldHip, worldKnee: ik.knee, worldAnkle: ik.ankle, worldPaw, requestedWorldPaw, requestedWorldAnkle,
      stage: intent.stage, phase: walk.limbs[id].phase,
      contact: intent.contact && ik.reachable, supportId: intent.supportId,
      toyContact: Boolean(intent.toyContact) && ik.reachable && distance(worldPaw, mouse.contactSocket) <= EPS,
      reachable: ik.reachable, reachError: ik.reachError, requestedDistance: ik.requestedDistance,
      minimumReach: ik.minimumReach, maximumReach: ik.maximumReach,
      reachMargin: ik.reachMargin, innerReachMargin: ik.requestedDistance - ik.minimumReach,
      upperLength: rest.upperLength, lowerLength: rest.lowerLength,
    };
  }
  const actor = limbs[INTERACTION.actingLimb];
  const eventReady = canTap && actor.toyContact && distance(actor.worldPaw, mouse.contactSocket) <= EPS;
  const event = { id: 'mika-interaction-r1-paw-tap', type: 'paw-tap', atSeconds: INTERACTION.tapTime,
    limbId: INTERACTION.actingLimb, worldContact: [...target], worldPawAnchor: [...target], authoredAnchorReached: true,
    contactReference: 'authored paw anchor; actual skinned geometry validated separately',
    skinnedContactValidated: false, visualStyleStatus: 'REJECTED' };
  return { time: t, timeSeconds: t, phase: walk.phase, phaseName: phaseNameAt(t), distance: travelled,
    root, bodyBob, bodyShift, attention: bodyWeightAt(t), limbs, mouse,
    geometricTapReachable: canTap, reachable: Object.values(limbs).every((limb) => limb.reachable),
    events: t === INTERACTION.tapTime && eventReady ? [event] : [],
    complete: t >= INTERACTION.walkEnd,
  };
}

/** Half-open interval query (t0,t1], stateless. Rewinds/nonfinite inputs emit none.
 * The caller owns one monotonic event cursor per action instance. No economy hooks.
 */
export function eventsBetween(t0, t1, options = {}) {
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 < t0
    || t0 >= INTERACTION.tapTime || t1 < INTERACTION.tapTime) return [];
  return sampleInteraction(INTERACTION.tapTime, options).events;
}


/** Conservative oriented XY footprint separation. Positive means disjoint OBBs;
 * negative means proxy overlap. This is a SAT-axis gap, not a mesh distance.
 * Supporting paws face +X; the mouse footprint follows its actual rotationZ.
 */
export function groundedPawToyClearance(worldPaw, mouse) {
  const c = Math.cos(mouse.rotationZ);
  const s = Math.sin(mouse.rotationZ);
  const toyX = [c, s];
  const toyY = [-s, c];
  const axes = [[1, 0], [0, 1], toyX, toyY];
  const delta = [mouse.worldCenter[0] - worldPaw[0], mouse.worldCenter[1] - worldPaw[1]];
  const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
  const gaps = axes.map((axis) => {
    const pawRadius = INTERACTION.groundedPawHalfExtents[0] * Math.abs(axis[0])
      + INTERACTION.groundedPawHalfExtents[1] * Math.abs(axis[1]);
    const toyRadius = INTERACTION.toyHalfExtents[0] * Math.abs(dot2(axis, toyX))
      + INTERACTION.toyHalfExtents[1] * Math.abs(dot2(axis, toyY));
    return Math.abs(dot2(delta, axis)) - pawRadius - toyRadius;
  });
  const signedSeparation = Math.max(...gaps);
  return { signedSeparation, separated: signedSeparation > 0, axisGaps: gaps };
}

export function buildInteractionSamples(options = {}) {
  const contactFrame = Math.round(INTERACTION.tapTime * INTERACTION.fps) + 1;
  return { version: 1, motionRevision: INTERACTION.revision, sourceMotionRevision: 'R2',
    visualStyleStatus: 'REJECTED', purpose: 'Technical world-contact prototype only; no economy/production integration or skinned-contact guarantee.',
    fps: INTERACTION.fps, durationSeconds: INTERACTION.durationSeconds, sampleCount: INTERACTION.sampleCount,
    cycleSeconds: WALK_CONFIG.cycleSeconds, stride: WALK_CONFIG.stride, loop: false,
    contactFrame, contactTimeSeconds: INTERACTION.tapTime, rest: REST_CHAINS, parameters: INTERACTION,
    coordinateSystem: '+X forward, +Z up; hip/knee/ankle/paw actor-local; add root for world coordinates',
    notes: ['Lateral weight shift uses full 3D IK with the R2 +X knee guide and unchanged bone lengths.',
      '6.3..6.4 is a terminal held pose at the end of walk-out; this clip is not a seamless loop.',
      'mouse.compression is height scale 1..0.90; authored paw anchor .217 presses to .195, not a claimed toy surface.',
      'After t3.50 release, toy displacement reaches [.13,-.38,0] by t3.90, outside the near paw lane.',
      'Ground collision proxy uses oriented rectangles: paw half extents [.21,.165], mouse [.301,.13] including its nose.',
      'Explicit calibration shifts initial mouse/paw-anchor X +.10: center2.01, anchor1.90; root and stand feet unchanged.',
      'Numerical paw-anchor reach is separate from actual skinned paw/toy mesh contact.'],
    standTargets: STAND_TARGETS, resumeLiftoffDistances: RESUME_LIFTOFF_DISTANCES,
    events: eventsBetween(0, INTERACTION.durationSeconds, options),
    samples: Array.from({ length: INTERACTION.sampleCount }, (_, i) => ({ frame: i + 1,
      ...sampleInteraction(i / INTERACTION.fps, options) })),
  };
}
