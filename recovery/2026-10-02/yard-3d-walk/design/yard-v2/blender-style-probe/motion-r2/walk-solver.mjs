/**
 * Bounded technical 3D walk MOTION R2 probe for the art-rejected R3 model.
 * No Blender/runtime/art dependencies; numerical validation is not visual QA.
 * +X forward, +Z up; local joint arrays are actor-local [x,y,z].
 */
const EPS = 1e-10;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const distance = (a, b) => Math.hypot(...sub(a, b));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const wrap = (n) => ((n % 1) + 1) % 1;
const smooth = (n) => { const u = clamp(n, 0, 1); return u * u * (3 - 2 * u); };
const deepFreeze = (object) => {
  Object.values(object).forEach((value) => { if (value && typeof value === 'object') deepFreeze(value); });
  return Object.freeze(object);
};

export const WALK_CONFIG = deepFreeze({
  version: 1, motionRevision: 'R2', baselineMotionRevision: 'R1',
  requiredReachMargin: 0.02, denseIntervalsPerCycle: 4800,
  fps: 20, sampleCount: 24, cycleSeconds: 1.2,
  stride: 0.64, stanceRatio: 0.68, liftHeight: 0.09, maxDownwardBob: 0.028,
  phaseOffsets: { foreNear: 0, hindFar: 0.25, foreFar: 0.5, hindNear: 0.75 },
});

export const R1_REFERENCE = deepFreeze({
  "motionRevision": "R1",
  "solverSha256": "7089f0900fcb8f795c868fc790173dbf489ce57ca389295da8ad1a279c9f0049",
  "samplesSha256": "20e4a75f04684d1aa7f8e4f8d503b066bd77d48cb0ef3b7a41fa03dc27a813dd",
  "stride": 0.32,
  "stanceRatio": 0.66,
  "liftHeight": 0.065,
  "maxDownwardBob": 0.012,
  "rest": {
    "foreNear": {
      "id": "foreNear",
      "family": "fore",
      "hip": [
        0.36,
        -0.265,
        0.67
      ],
      "knee": [
        0.43,
        -0.265,
        0.36
      ],
      "ankle": [
        0.61,
        -0.265,
        0.14
      ],
      "paw": [
        0.68,
        -0.265,
        0
      ],
      "nominalPawX": 0.58,
      "ankleOffset": [
        -0.07,
        0,
        0.14
      ],
      "phaseOffset": 0,
      "bend": -1,
      "upperLength": 0.3178049716414141,
      "lowerLength": 0.28425340807103794
    },
    "hindFar": {
      "id": "hindFar",
      "family": "hind",
      "hip": [
        -0.76,
        0.265,
        0.65
      ],
      "knee": [
        -0.69,
        0.265,
        0.44
      ],
      "ankle": [
        -0.8,
        0.265,
        0.15
      ],
      "paw": [
        -0.71,
        0.265,
        0
      ],
      "nominalPawX": -0.71,
      "ankleOffset": [
        -0.09,
        0,
        0.15
      ],
      "phaseOffset": 0.25,
      "bend": 1,
      "upperLength": 0.22135943621178658,
      "lowerLength": 0.31016124838541653
    },
    "foreFar": {
      "id": "foreFar",
      "family": "fore",
      "hip": [
        0.36,
        0.265,
        0.67
      ],
      "knee": [
        0.43,
        0.265,
        0.36
      ],
      "ankle": [
        0.53,
        0.265,
        0.14
      ],
      "paw": [
        0.6,
        0.265,
        0
      ],
      "nominalPawX": 0.5,
      "ankleOffset": [
        -0.07,
        0,
        0.14
      ],
      "phaseOffset": 0.5,
      "bend": -1,
      "upperLength": 0.3178049716414141,
      "lowerLength": 0.24166091947189144
    },
    "hindNear": {
      "id": "hindNear",
      "family": "hind",
      "hip": [
        -0.76,
        -0.265,
        0.65
      ],
      "knee": [
        -0.69,
        -0.265,
        0.44
      ],
      "ankle": [
        -0.8,
        -0.265,
        0.15
      ],
      "paw": [
        -0.71,
        -0.265,
        0
      ],
      "nominalPawX": -0.71,
      "ankleOffset": [
        -0.09,
        0,
        0.15
      ],
      "phaseOffset": 0.75,
      "bend": 1,
      "upperLength": 0.22135943621178658,
      "lowerLength": 0.31016124838541653
    }
  }
});

const authorChain = (id, family, hip, knee, ankle, paw, nominalPawX, ankleOffset) => ({
  id, family, hip, knee, ankle, paw, nominalPawX, ankleOffset,
  phaseOffset: WALK_CONFIG.phaseOffsets[id],
  // Branch sign uses the perpendicular [-axisZ,+axisX] in the XZ plane.
  bend: family === 'fore' ? -1 : 1,
  upperLength: distance(hip, knee), lowerLength: distance(knee, ankle),
});

export const REST_CHAINS = deepFreeze({
  foreNear: authorChain('foreNear', 'fore', [0.36, -0.265, 0.67], [0.28, -0.265, 0.40],
    [0.61, -0.265, 0.14], [0.68, -0.265, 0], 0.58, [-0.07, 0, 0.14]),
  hindFar: authorChain('hindFar', 'hind', [-0.76, 0.265, 0.65], [-0.59, 0.265, 0.44],
    [-0.80, 0.265, 0.15], [-0.71, 0.265, 0], -0.71, [-0.09, 0, 0.15]),
  foreFar: authorChain('foreFar', 'fore', [0.36, 0.265, 0.67], [0.28, 0.265, 0.40],
    [0.53, 0.265, 0.14], [0.60, 0.265, 0], 0.50, [-0.07, 0, 0.14]),
  hindNear: authorChain('hindNear', 'hind', [-0.76, -0.265, 0.65], [-0.59, -0.265, 0.44],
    [-0.80, -0.265, 0.15], [-0.71, -0.265, 0], -0.71, [-0.09, 0, 0.15]),
});

/** Fixed-length XZ-plane IK. Reports unreachable targets; never stretches links. */
export function solveLegIK(hip, requestedAnkle, upperLength, lowerLength, bend) {
  const dx = requestedAnkle[0] - hip[0];
  const dz = requestedAnkle[2] - hip[2];
  const requestedDistance = Math.hypot(dx, dz);
  const minimumReach = Math.abs(upperLength - lowerLength);
  const maximumReach = upperLength + lowerLength;
  const planeError = Math.abs(requestedAnkle[1] - hip[1]);
  const reachable = planeError <= EPS && requestedDistance >= minimumReach - EPS
    && requestedDistance <= maximumReach + EPS;
  const directionX = requestedDistance > EPS ? dx / requestedDistance : 0;
  const directionZ = requestedDistance > EPS ? dz / requestedDistance : -1;
  const solvedDistance = clamp(requestedDistance, Math.max(EPS, minimumReach), maximumReach);
  const along = (upperLength ** 2 - lowerLength ** 2 + solvedDistance ** 2) / (2 * solvedDistance);
  const across = Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2));
  const branch = bend < 0 ? -1 : 1;
  const knee = [
    hip[0] + directionX * along - directionZ * across * branch,
    hip[1],
    hip[2] + directionZ * along + directionX * across * branch,
  ];
  const ankle = reachable ? [...requestedAnkle] : [
    hip[0] + directionX * solvedDistance, hip[1], hip[2] + directionZ * solvedDistance,
  ];
  return {
    knee, ankle, reachable, requestedDistance, minimumReach, maximumReach,
    reachMargin: maximumReach - requestedDistance,
    reachError: distance(ankle, requestedAnkle), planeError,
    upperLength, lowerLength,
  };
}

/**
 * Pure sampling. Time fallback is constant speed stride/cycleSeconds.
 * An explicit accumulated distance overrides time for both phase and root.
 * Toe ground-contact and ankle cuff are distinct points on one rigid paw.
 */
export function sampleWalk(timeSeconds, options = {}) {
  const time = clamp(Number.isFinite(timeSeconds) ? timeSeconds : 0, 0, 1e6);
  const travelled = clamp(Number.isFinite(options.distance) ? options.distance
    : time * WALK_CONFIG.stride / WALK_CONFIG.cycleSeconds, 0, 1e6);
  const cycles = travelled / WALK_CONFIG.stride;
  const phase = wrap(cycles);
  const root = [travelled, 0, 0];
  // Two smooth downward load transfers per gait cycle; driven only by distance.
  const loadPhase = wrap(phase * 2);
  const bodyBob = -WALK_CONFIG.maxDownwardBob * 16 * loadPhase ** 2 * (1 - loadPhase) ** 2 || 0;
  const limbs = {};
  for (const [id, rest] of Object.entries(REST_CHAINS)) {
    const limbCycles = cycles - rest.phaseOffset;
    const cycleIndex = Math.floor(limbCycles);
    const localPhase = limbCycles - cycleIndex;
    const inStance = localPhase < WALK_CONFIG.stanceRatio;
    const touchdownDistance = (cycleIndex + rest.phaseOffset) * WALK_CONFIG.stride;
    const lead = WALK_CONFIG.stride * WALK_CONFIG.stanceRatio / 2;
    const q = inStance ? 0 : (localPhase - WALK_CONFIG.stanceRatio) / (1 - WALK_CONFIG.stanceRatio);
    const plantedX = touchdownDistance + rest.nominalPawX + lead;
    const requestedWorldPaw = [
      plantedX + (inStance ? 0 : WALK_CONFIG.stride * smooth(q)),
      rest.paw[1],
      inStance ? 0 : WALK_CONFIG.liftHeight * 16 * q ** 2 * (1 - q) ** 2,
    ];
    const requestedWorldAnkle = add(requestedWorldPaw, rest.ankleOffset);
    const hip = [rest.hip[0], rest.hip[1], rest.hip[2] + bodyBob];
    const worldHip = add(hip, root);
    const ik = solveLegIK(worldHip, requestedWorldAnkle, rest.upperLength, rest.lowerLength, rest.bend);
    const worldPaw = ik.reachable ? [...requestedWorldPaw] : sub(ik.ankle, rest.ankleOffset);
    limbs[id] = {
      hip, knee: sub(ik.knee, root), ankle: sub(ik.ankle, root), paw: sub(worldPaw, root),
      worldHip, worldKnee: ik.knee, worldAnkle: ik.ankle, worldPaw,
      requestedWorldPaw, requestedWorldAnkle,
      phase: localPhase, stage: inStance ? 'stance' : 'swing',
      contact: inStance && ik.reachable && Math.abs(worldPaw[2]) <= EPS,
      supportId: inStance ? `${id}:${cycleIndex}` : null,
      cycleIndex, touchdownDistance,
      reachable: ik.reachable, requestedDistance: ik.requestedDistance,
      minimumReach: ik.minimumReach, maximumReach: ik.maximumReach,
      reachMargin: ik.reachMargin, reachError: ik.reachError,
      upperLength: rest.upperLength, lowerLength: rest.lowerLength,
    };
  }
  return { timeSeconds: time, phase, distance: travelled, root, bodyBob, limbs,
    reachable: Object.values(limbs).every((limb) => limb.reachable) };
}

/** 24 samples: t=0,...,1.15; the t=1.2 closure pose is not a duplicate frame. */
export function buildWalkSamples() {
  return {
    version: WALK_CONFIG.version,
    motionRevision: WALK_CONFIG.motionRevision, baselineMotionRevision: WALK_CONFIG.baselineMotionRevision,
    visualStyleStatus: 'REJECTED', requiredReachMargin: WALK_CONFIG.requiredReachMargin,
    baseline: R1_REFERENCE,
    anatomyChanges: Object.fromEntries(Object.entries(REST_CHAINS).map(([id, rest]) => [id, {
      fromKnee: R1_REFERENCE.rest[id].knee, toKnee: rest.knee,
      fromUpperLength: R1_REFERENCE.rest[id].upperLength, toUpperLength: rest.upperLength,
      fromLowerLength: R1_REFERENCE.rest[id].lowerLength, toLowerLength: rest.lowerLength,
      fromUpperAngleXZ: Math.atan2(R1_REFERENCE.rest[id].knee[2] - R1_REFERENCE.rest[id].hip[2], R1_REFERENCE.rest[id].knee[0] - R1_REFERENCE.rest[id].hip[0]),
      toUpperAngleXZ: Math.atan2(rest.knee[2] - rest.hip[2], rest.knee[0] - rest.hip[0]),
      fromLowerAngleXZ: Math.atan2(R1_REFERENCE.rest[id].ankle[2] - R1_REFERENCE.rest[id].knee[2], R1_REFERENCE.rest[id].ankle[0] - R1_REFERENCE.rest[id].knee[0]),
      toLowerAngleXZ: Math.atan2(rest.ankle[2] - rest.knee[2], rest.ankle[0] - rest.knee[0]),
      reason: 'Explicitly approved knee-center revision; hip/ankle/paw rest positions unchanged',
    }])),
    purpose: 'MOTION R2 technical walk geometry only; R3 art remains visually rejected. R1 files are frozen and unchanged. No visual validation claimed.',
    coordinateSystem: '+X forward, +Z up; hip/knee/ankle/paw actor-local; add root for world coordinates',
    fps: WALK_CONFIG.fps, cycleSeconds: WALK_CONFIG.cycleSeconds, stride: WALK_CONFIG.stride,
    stanceRatio: WALK_CONFIG.stanceRatio, liftHeight: WALK_CONFIG.liftHeight,
    maxDownwardBob: WALK_CONFIG.maxDownwardBob, phaseOffsets: WALK_CONFIG.phaseOffsets,
    rest: REST_CHAINS,
    samples: Array.from({ length: WALK_CONFIG.sampleCount }, (_, i) => ({ frame: i + 1,
      ...sampleWalk(i / WALK_CONFIG.fps) })),
  };
}
