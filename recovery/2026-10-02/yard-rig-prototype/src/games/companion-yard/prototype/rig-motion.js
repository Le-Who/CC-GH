/**
 * Pure screen-projected cat rig. No renderer, ticker, random state, or game events.
 * All coordinates are world units; screen y increases downward. Angles are radians.
 */
const EPS = 1e-8;
const MAX_DISTANCE = 1e12;
const point = (x, y) => ({ x, y });
const add = (a, b) => point(a.x + b.x, a.y + b.y);
const sub = (a, b) => point(a.x - b.x, a.y - b.y);
const mul = (a, n) => point(a.x * n, a.y * n);
const length = (a) => Math.hypot(a.x, a.y);
const mix = (a, b, u) => a + (b - a) * u;
const mixPoint = (a, b, u) => point(mix(a.x, b.x, u), mix(a.y, b.y, u));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
const smooth = (u) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };
const wrap = (n) => ((n % 1) + 1) % 1;
const angle = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
const validPoint = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.y);
const safePoint = (p, fallback = point(0, 0)) => validPoint(p)
  ? point(clamp(p.x, -MAX_DISTANCE, MAX_DISTANCE), clamp(p.y, -MAX_DISTANCE, MAX_DISTANCE))
  : point(fallback.x, fallback.y);

export const DEFAULT_RIG = Object.freeze({
  direction: Object.freeze({ x: 0.96, y: 0.28 }),
  speed: 56,
  strideLength: 56,
  stanceRatio: 0.64,
  liftHeight: 14,
  bodyHeight: 45,
  halfBodyLength: 34,
  halfTrackWidth: 13,
  upperLegLength: 28,
  lowerLegLength: 29,
  ankleOffset: Object.freeze({ x: -6, y: -8 }),
});

/** Touchdown sequence: far hind -> far fore -> near hind -> near fore. */
export const RIG_LIMBS = Object.freeze([
  Object.freeze({ id: 'farHind', family: 'hind', side: 'far', offset: 0, bend: -1, depth: 10 }),
  Object.freeze({ id: 'farFore', family: 'fore', side: 'far', offset: 0.25, bend: 1, depth: 13 }),
  Object.freeze({ id: 'nearHind', family: 'hind', side: 'near', offset: 0.5, bend: -1, depth: 50 }),
  Object.freeze({ id: 'nearFore', family: 'fore', side: 'near', offset: 0.75, bend: 1, depth: 53 }),
]);

export const PLAY_TIMING = Object.freeze({
  anticipationEndMs: 360,
  liftEndMs: 640,
  contactMs: 900,
  touchEndMs: 980,
  recoveryEndMs: 1500,
  durationMs: 1800,
});

/**
 * Fixed-length two-link IK. Unreachable requests are explicitly marked and
 * clamped; consumers must never claim contact with requestedTarget in that case.
 */
export function solveTwoBoneIK(hip, target, upperLength, lowerLength, bend = 1) {
  const start = safePoint(hip);
  const requestedTarget = safePoint(target, start);
  const upper = clamp(finite(upperLength, 1), 0.001, 1e5);
  const lower = clamp(finite(lowerLength, 1), 0.001, 1e5);
  const delta = sub(requestedTarget, start);
  const distance = length(delta);
  const minReach = Math.abs(upper - lower);
  const maxReach = upper + lower;
  const reachable = distance >= minReach - EPS && distance <= maxReach + EPS;
  // Coincident equal-length links have a defined, deterministic fold.
  if (distance < EPS && minReach < EPS) {
    const knee = add(start, point((bend < 0 ? -1 : 1) * upper, 0));
    return { hip: start, knee, foot: { ...start }, requestedTarget, reachable,
      upperLength: upper, lowerLength: lower, upperAngle: angle(start, knee),
      lowerAngle: angle(knee, start), reachError: distance };
  }
  const axis = distance < EPS ? point(0, 1) : mul(delta, 1 / distance);
  const reach = clamp(distance, Math.max(minReach, EPS), maxReach);
  const foot = add(start, mul(axis, reach));
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach);
  const across = Math.sqrt(Math.max(0, upper * upper - along * along));
  const normal = point(-axis.y, axis.x);
  const knee = add(add(start, mul(axis, along)), mul(normal, across * (bend < 0 ? -1 : 1)));
  return { hip: start, knee, foot, requestedTarget, reachable,
    upperLength: upper, lowerLength: lower, upperAngle: angle(start, knee),
    lowerAngle: angle(knee, foot), reachError: length(sub(foot, requestedTarget)) };
}

function settings(options) {
  const scale = clamp(finite(options.scale, 1), 0.1, 10);
  const rawDirection = safePoint(options.direction, DEFAULT_RIG.direction);
  const norm = length(rawDirection);
  const direction = norm > EPS ? mul(rawDirection, 1 / norm) : { ...DEFAULT_RIG.direction };
  const speed = clamp(finite(options.speed, options.speed === undefined ? DEFAULT_RIG.speed : 0), 0, 2000);
  const localAnkleOffset = safePoint(options.ankleOffset, DEFAULT_RIG.ankleOffset);
  const ankleOffset = point(clamp(localAnkleOffset.x, -100, 100) * scale,
    clamp(localAnkleOffset.y, -100, 100) * scale);
  return {
    scale, direction, side: point(-direction.y, direction.x), ankleOffset,
    origin: safePoint(options.origin), speed,
    strideLength: clamp(finite(options.strideLength, DEFAULT_RIG.strideLength * scale), 16 * scale, 56 * scale),
    stanceRatio: clamp(finite(options.stanceRatio, DEFAULT_RIG.stanceRatio), 0.55, 0.7),
    liftHeight: clamp(finite(options.liftHeight, DEFAULT_RIG.liftHeight * scale), 0, 20 * scale),
  };
}

function localPoint(root, config, along, across = 0, elevation = 0) {
  return add(add(root, mul(config.direction, along * config.scale)),
    add(mul(config.side, across * config.scale), point(0, -elevation * config.scale)));
}

function keyPose(keys, phase) {
  const t = clamp(phase, keys[0][0], keys[keys.length - 1][0]);
  let i = 1;
  while (i < keys.length - 1 && t > keys[i][0]) i += 1;
  const [ta, a] = keys[i - 1];
  const [tb, b] = keys[i];
  const u = smooth((t - ta) / (tb - ta));
  return Object.fromEntries(Object.keys(a).map((name) => [name, mix(a[name], b[name], u)]));
}

const WALK_POSES = [
  [0, { pelvis: 0.4, shoulder: -0.3, neck: 0, head: -0.025, tail: -0.08 }],
  [0.125, { pelvis: -0.7, shoulder: 0.8, neck: 0.7, head: 0.015, tail: 0.02 }],
  [0.25, { pelvis: 0.2, shoulder: 1.1, neck: 0.3, head: 0.025, tail: 0.08 }],
  [0.375, { pelvis: 0.9, shoulder: -0.5, neck: -0.5, head: -0.01, tail: 0.03 }],
  [0.5, { pelvis: 0.4, shoulder: -0.3, neck: 0, head: -0.025, tail: -0.08 }],
  [0.625, { pelvis: -0.7, shoulder: 0.8, neck: 0.7, head: 0.015, tail: 0.02 }],
  [0.75, { pelvis: 0.2, shoulder: 1.1, neck: 0.3, head: 0.025, tail: 0.08 }],
  [0.875, { pelvis: 0.9, shoulder: -0.5, neck: -0.5, head: -0.01, tail: 0.03 }],
  [1, { pelvis: 0.4, shoulder: -0.3, neck: 0, head: -0.025, tail: -0.08 }],
];
const PLAY_POSES = [
  [0, { shift: 0, pelvis: 0, shoulder: 0, neck: 0, head: 0, tail: 0 }],
  [360, { shift: -3, pelvis: -4, shoulder: -6, neck: 1, head: -0.12, tail: 0.16 }],
  [640, { shift: -2, pelvis: -4, shoulder: -6, neck: 0, head: 0.02, tail: 0.2 }],
  [900, { shift: 4, pelvis: -2, shoulder: -3, neck: -3, head: 0.18, tail: -0.12 }],
  [980, { shift: 4, pelvis: -2, shoulder: -3, neck: -3, head: 0.18, tail: -0.12 }],
  [1250, { shift: -1, pelvis: -2, shoulder: -2, neck: -1, head: 0.06, tail: -0.05 }],
  [1500, { shift: 0, pelvis: 0, shoulder: 0, neck: 0, head: 0, tail: 0 }],
  [1800, { shift: 0, pelvis: 0, shoulder: 0, neck: 0, head: 0, tail: 0 }],
];

function bodyPose(root, config, pose) {
  const shiftedRoot = add(root, mul(config.direction, (pose.shift || 0) * config.scale));
  const pelvis = localPoint(shiftedRoot, config, -34, 0, 43 + pose.pelvis);
  const shoulder = localPoint(shiftedRoot, config, 34, 0, 45 + pose.shoulder);
  const neck = localPoint(shiftedRoot, config, 48, 0, 52 + pose.shoulder + pose.neck);
  const headAngle = Math.atan2(config.direction.y, config.direction.x) + pose.head;
  return { pelvis, shoulder, neck, headAngle, shiftedRoot,
    torso: { position: mixPoint(pelvis, shoulder, 0.5), rotation: angle(pelvis, shoulder),
      length: length(sub(shoulder, pelvis)), width: 128 * config.scale, height: 66 * config.scale },
  };
}

function hipFor(limb, body, config) {
  return add(limb.family === 'fore' ? body.shoulder : body.pelvis,
    mul(config.side, (limb.side === 'near' ? 13 : -13) * config.scale));
}

function restingFoot(limb, root, config) {
  return localPoint(root, config, limb.family === 'fore' ? 36 : -34, limb.side === 'near' ? 13 : -13);
}

function solveLimb(limb, body, config, footTarget, metadata) {
  // The paw contact socket and ankle cuff are different points on a rigid paw.
  // Local +x points toward the toes; local +y points below the paw. This offset
  // follows fixed foot orientation, never the animated shin angle.
  const ankleOffset = add(mul(config.direction, config.ankleOffset.x),
    mul(config.side, config.ankleOffset.y));
  const requestedAnkleTarget = add(footTarget, ankleOffset);
  const ik = solveTwoBoneIK(hipFor(limb, body, config), requestedAnkleTarget,
    DEFAULT_RIG.upperLegLength * config.scale, DEFAULT_RIG.lowerLegLength * config.scale, limb.bend);
  const ankle = ik.foot;
  const foot = sub(ankle, ankleOffset);
  const planted = metadata.phase === 'stance' && ik.reachable;
  return { ...limb, ...ik, ...metadata, ankle, foot, ankleOffset, requestedAnkleTarget,
    requestedTarget: { ...footTarget }, planted,
    footAngle: Math.atan2(config.direction.y, config.direction.x),
    joints: limb.family === 'fore'
      ? { shoulder: ik.hip, elbow: ik.knee, wrist: ankle }
      : { hip: ik.hip, knee: ik.knee, ankle },
    contact: { kind: planted ? 'ground' : metadata.phase === 'touch' && ik.reachable ? 'toy' : 'none',
      position: foot, planted },
  };
}

function walkLimbs(root, body, config, distance, isResting) {
  return RIG_LIMBS.map((limb) => {
    if (isResting) return solveLimb(limb, body, config, restingFoot(limb, root, config), {
      phase: 'stance', cycleIndex: 0, localPhase: 0, supportId: `${limb.id}:rest`,
      ground: restingFoot(limb, root, config), height: 0,
    });
    const cycles = distance / config.strideLength - limb.offset;
    const cycleIndex = Math.floor(cycles);
    const localPhase = cycles - cycleIndex;
    const touchdownDistance = (cycleIndex + limb.offset) * config.strideLength;
    const touchdownRoot = add(config.origin, mul(config.direction, touchdownDistance));
    // Root travels from behind this fixed point to ahead of it during stance.
    const planted = add(restingFoot(limb, touchdownRoot, config),
      mul(config.direction, config.strideLength * config.stanceRatio / 2));
    const isStance = localPhase < config.stanceRatio;
    const q = isStance ? 0 : (localPhase - config.stanceRatio) / (1 - config.stanceRatio);
    const ground = isStance ? planted : add(planted, mul(config.direction, config.strideLength * smooth(q)));
    // Quartic clearance has zero vertical velocity at both ground contacts.
    const height = isStance ? 0 : config.liftHeight * 16 * q * q * (1 - q) * (1 - q);
    return solveLimb(limb, body, config, add(ground, point(0, -height)), {
      phase: isStance ? 'stance' : 'swing', cycleIndex, localPhase,
      supportId: isStance ? `${limb.id}:${cycleIndex}` : null,
      touchdownDistance, ground, height,
    });
  });
}

function playPhase(t) {
  if (t < PLAY_TIMING.anticipationEndMs) return 'anticipation';
  if (t < PLAY_TIMING.liftEndMs) return 'lift';
  if (t < PLAY_TIMING.contactMs) return 'reach';
  if (t < PLAY_TIMING.touchEndMs) return 'touch';
  if (t < PLAY_TIMING.recoveryEndMs) return 'recovery';
  return t < PLAY_TIMING.durationMs ? 'settle' : 'complete';
}

function playMotion(t, root, body, config, options) {
  const activeLimb = RIG_LIMBS.find((limb) => limb.id === 'nearFore');
  const rest = restingFoot(activeLimb, root, config);
  const target = safePoint(options.mouseContact ?? options.target,
    localPoint(root, config, 60, 13, 6));
  const touchBody = bodyPose(root, config, keyPose(PLAY_POSES, PLAY_TIMING.contactMs));
  const touchIK = solveLimb(activeLimb, touchBody, config, target, {});
  const canTouch = touchIK.reachable;
  const reaction = canTouch ? smooth((t - PLAY_TIMING.contactMs) / 360) : 0;
  const displacement = mul(config.direction, 14 * config.scale * reaction);
  const mouseContact = add(target, displacement);
  const raised = add(add(rest, mul(config.direction, -6 * config.scale)), point(0, -19 * config.scale));
  const atRecoveryStart = add(target, mul(config.direction,
    canTouch ? 14 * config.scale * smooth((PLAY_TIMING.touchEndMs - PLAY_TIMING.contactMs) / 360) : 0));
  let paw = rest;
  if (t >= PLAY_TIMING.anticipationEndMs && t < PLAY_TIMING.liftEndMs) {
    paw = mixPoint(rest, raised, smooth((t - 360) / 280));
  } else if (t >= PLAY_TIMING.liftEndMs && t < PLAY_TIMING.contactMs) {
    paw = mixPoint(raised, target, smooth((t - 640) / 260));
  } else if (t >= PLAY_TIMING.contactMs && t < PLAY_TIMING.touchEndMs) {
    paw = mouseContact;
  } else if (t >= PLAY_TIMING.touchEndMs && t < PLAY_TIMING.recoveryEndMs) {
    const q = (t - 980) / 520;
    paw = mixPoint(atRecoveryStart, rest, smooth(q));
    paw.y -= 12 * config.scale * 16 * q * q * (1 - q) * (1 - q);
  }
  const limbs = RIG_LIMBS.map((limb) => {
    const moving = limb.id === activeLimb.id && t >= 360 && t < 1500;
    const footTarget = moving ? paw : restingFoot(limb, root, config);
    return solveLimb(limb, body, config, footTarget, {
      phase: moving ? (playPhase(t) === 'touch' ? 'touch' : 'reach') : 'stance',
      supportId: moving ? null : `${limb.id}:play-support`,
      ground: moving ? null : footTarget, height: moving ? Math.max(0, rest.y - paw.y) : 0,
    });
  });
  const nearFore = limbs.find((limb) => limb.id === activeLimb.id);
  const touching = playPhase(t) === 'touch' && canTouch && nearFore.reachable;
  return { limbs,
    contact: { limbId: activeLimb.id, atMs: PLAY_TIMING.contactMs, target,
      currentTarget: mouseContact, reachable: canTouch, active: touching, hasOccurred: canTouch && t >= 900 },
    mouse: { position: mouseContact, contactPoint: mouseContact, displacement,
      rotation: reaction * 0.32, reacting: canTouch && t > 900 && t < 1260, reactionProgress: reaction },
  };
}

function attachment(id, kind, start, end, depth, extra = {}) {
  return { id, kind, position: { ...start }, end: { ...end }, rotation: angle(start, end),
    length: length(sub(end, start)), depth, pivot: { x: 0, y: 0.5 }, ...extra };
}

function assemble(body, limbs, config, pose) {
  const directionAngle = Math.atan2(config.direction.y, config.direction.x);
  const tailBase = add(body.pelvis, add(mul(config.direction, -8 * config.scale), point(0, -7 * config.scale)));
  const tailJoints = [tailBase];
  const tailAngles = [directionAngle + Math.PI + 0.45 + pose.tail,
    directionAngle + Math.PI + 0.85 + pose.tail * 1.3,
    directionAngle + Math.PI + 1.5 + pose.tail * 1.5];
  [25, 22, 18].forEach((span, i) => {
    tailJoints.push(add(tailJoints[i], mul(point(Math.cos(tailAngles[i]), Math.sin(tailAngles[i])), span * config.scale)));
  });
  const attachments = [
    attachment('torso', 'torso', body.pelvis, body.shoulder, 30, {
      position: body.torso.position, pivot: { x: 0.5, y: 0.5 },
      width: body.torso.width, height: body.torso.height,
    }),
    attachment('head', 'head', body.neck,
      add(body.neck, mul(point(Math.cos(body.headAngle), Math.sin(body.headAngle)), 35 * config.scale)), 40,
      { pivot: { x: 0.28, y: 0.72 }, width: 70 * config.scale, height: 78 * config.scale }),
    attachment('tail', 'tail', tailBase, tailJoints[1], 20, { joints: tailJoints, rotations: tailAngles, width: 45 * config.scale, height: 94 * config.scale }),
  ];
  const tailSegments = tailJoints.slice(0, 3).map((start, i) =>
    attachment(`tail.${i}`, 'tailSegment', start, tailJoints[i + 1], 20 + i));
  for (const limb of limbs) {
    attachments.push(attachment(`${limb.id}.upper`, 'upperLeg', limb.hip, limb.knee, limb.depth,
      { limbId: limb.id, family: limb.family }));
    attachments.push(attachment(`${limb.id}.lower`, 'lowerLeg', limb.knee, limb.ankle, limb.depth + 1,
      { limbId: limb.id, family: limb.family }));
    attachments.push(attachment(`${limb.id}.paw`, 'paw', limb.foot,
      add(limb.foot, mul(config.direction, 12 * config.scale)), limb.depth + 2, {
        limbId: limb.id, family: limb.family, pivot: { x: 0.70, y: 0.98 },
        width: 17 * config.scale, height: 11 * config.scale,
      }));
  }
  attachments.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  return { attachments, drawOrder: attachments.map((part) => part.id),
    tail: { base: tailBase, joints: tailJoints, angles: tailAngles, segments: tailSegments },
    head: { position: body.neck, rotation: body.headAngle, gaze: add(body.neck,
      mul(point(Math.cos(body.headAngle), Math.sin(body.headAngle)), 45 * config.scale)) },
  };
}

/**
 * tMs is elapsed clip time. speed is world units/sec, never a phase multiplier.
 * For changing speeds, pass cumulative path distance; caller integrates it once.
 * Without distance, this samples a constant-speed straight walk. Play is one-shot.
 */
export function sampleRig(tMs, options = {}) {
  const config = settings(options);
  const timeMs = clamp(finite(tMs, 0), 0, 1e12);
  const mode = options.mode === 'play' ? 'play' : 'walk';
  const hasDistance = Number.isFinite(options.distance);
  const distance = mode === 'play' ? 0 : clamp(hasDistance ? options.distance : timeMs * config.speed / 1000, 0, MAX_DISTANCE);
  const root = add(config.origin, mul(config.direction, distance));
  const phase = wrap(distance / config.strideLength);
  const isResting = mode === 'walk' && config.speed === 0 && !hasDistance;
  const pose = mode === 'play' ? keyPose(PLAY_POSES, timeMs) :
    isResting ? { pelvis: 0, shoulder: 0, neck: 0, head: 0, tail: 0 } : keyPose(WALK_POSES, phase);
  const body = bodyPose(root, config, pose);
  const play = mode === 'play' ? playMotion(timeMs, root, body, config, options) : null;
  const limbs = play ? play.limbs : walkLimbs(root, body, config, distance, isResting);
  const parts = assemble(body, limbs, config, pose);
  const contact = play?.contact ?? null;
  return {
    mode, timeMs, root, distance, direction: config.direction, speed: config.speed,
    scale: config.scale, strideLength: config.strideLength, stanceRatio: config.stanceRatio,
    ankleOffset: config.ankleOffset,
    gaitPhase: phase, phase: play ? playPhase(timeMs) : isResting ? 'idle' : 'walk',
    complete: mode === 'play' && timeMs >= PLAY_TIMING.durationMs,
    body, limbs, ...parts, contact, mouse: play?.mouse ?? null,
    // An exact-time marker is useful for offline proofs; runtime uses eventsBetween.
    events: contact?.reachable && timeMs === PLAY_TIMING.contactMs
      ? [{ type: 'paw-contact', limbId: 'nearFore', atMs: PLAY_TIMING.contactMs, position: { ...contact.target } }] : [],
    reachable: limbs.every((limb) => limb.reachable),
  };
}

/** Replay-safe interval event lookup: (previousMs, currentMs], no hidden state. */
export function rigEventsBetween(previousMs, currentMs, options = {}) {
  if (options.mode !== 'play' || !Number.isFinite(previousMs) || !Number.isFinite(currentMs)
    || currentMs < previousMs || previousMs >= PLAY_TIMING.contactMs || currentMs < PLAY_TIMING.contactMs) return [];
  return sampleRig(PLAY_TIMING.contactMs, { ...options, mode: 'play' }).events;
}
