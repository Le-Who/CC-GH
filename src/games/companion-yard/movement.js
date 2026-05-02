import {
  clampYardPointToPlayzone,
  isYardGoodieBlocking,
  isYardVisitorPoseStationary,
} from "../../../game-logic.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mix(start, end, progress) {
  return start + (end - start) * progress;
}

function seedNumber(seed = "") {
  let hash = 2166136261;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hasPlacedPosition(placed = {}) {
  return Number.isFinite(Number(placed.x)) && Number.isFinite(Number(placed.y));
}

function getPlacedPosition(placed = {}, slotMap = new Map()) {
  if (hasPlacedPosition(placed)) {
    return {
      x: clamp(Number(placed.x), 6, 94),
      y: clamp(Number(placed.y), 6, 94),
    };
  }
  const slot = slotMap.get(placed.slotId);
  return {
    x: slot?.x || 50,
    y: slot?.y || 72,
  };
}

function getEntryPoint(edge, anchorX, anchorY) {
  if (edge === "right") return { x: 108, y: anchorY };
  if (edge === "top") return { x: anchorX, y: -8 };
  if (edge === "bottom") return { x: anchorX, y: 108 };
  return { x: -8, y: anchorY };
}

function lineIntersectsObstacle(start, end, obstacle) {
  const steps = 24;
  for (let index = 1; index < steps; index += 1) {
    const progress = index / steps;
    if (isPointInsideObstacle({
      x: mix(start.x, end.x, progress),
      y: mix(start.y, end.y, progress),
    }, obstacle)) {
      return true;
    }
  }
  return false;
}

function getAvoidanceWaypoint(start, end, obstacle) {
  const margin = 7;
  const horizontal = Math.abs(end.x - start.x) >= Math.abs(end.y - start.y);
  if (horizontal) {
    const above = obstacle.y - margin;
    const below = obstacle.y + obstacle.height + margin;
    const waypointY = Math.abs(start.y - above) <= Math.abs(start.y - below) ? above : below;
    return { x: clamp((obstacle.x + obstacle.width / 2), 4, 96), y: clamp(waypointY, 4, 96) };
  }
  const left = obstacle.x - margin;
  const right = obstacle.x + obstacle.width + margin;
  const waypointX = Math.abs(start.x - left) <= Math.abs(start.x - right) ? left : right;
  return { x: clamp(waypointX, 4, 96), y: clamp((obstacle.y + obstacle.height / 2), 4, 96) };
}

function pushPointOutsideObstacle(point, obstacle) {
  if (!isPointInsideObstacle(point, obstacle)) return point;
  const leftDistance = Math.abs(point.x - obstacle.x);
  const rightDistance = Math.abs(point.x - (obstacle.x + obstacle.width));
  const topDistance = Math.abs(point.y - obstacle.y);
  const bottomDistance = Math.abs(point.y - (obstacle.y + obstacle.height));
  const minDistance = Math.min(leftDistance, rightDistance, topDistance, bottomDistance);
  const margin = 1.5;

  if (minDistance === leftDistance) return { ...point, x: clamp(obstacle.x - margin, 3, 97) };
  if (minDistance === rightDistance) return { ...point, x: clamp(obstacle.x + obstacle.width + margin, 3, 97) };
  if (minDistance === topDistance) return { ...point, y: clamp(obstacle.y - margin, 5, 98) };
  return { ...point, y: clamp(obstacle.y + obstacle.height + margin, 5, 98) };
}

function avoidObstacleRects(point, obstacles = []) {
  return obstacles.reduce((current, obstacle) => pushPointOutsideObstacle(current, obstacle), point);
}

function routePoint(start, end, progress, obstacles = []) {
  const blocker = obstacles.find((obstacle) => lineIntersectsObstacle(start, end, obstacle));
  if (!blocker) {
    return {
      x: mix(start.x, end.x, progress),
      y: mix(start.y, end.y, progress),
    };
  }

  const waypoint = getAvoidanceWaypoint(start, end, blocker);
  const firstDistance = Math.hypot(waypoint.x - start.x, waypoint.y - start.y);
  const secondDistance = Math.hypot(end.x - waypoint.x, end.y - waypoint.y);
  const split = firstDistance / Math.max(1, firstDistance + secondDistance);

  if (progress <= split) {
    const local = split > 0 ? progress / split : 1;
    return {
      x: mix(start.x, waypoint.x, local),
      y: mix(start.y, waypoint.y, local),
    };
  }

  const local = (progress - split) / Math.max(0.001, 1 - split);
  return {
    x: mix(waypoint.x, end.x, local),
    y: mix(waypoint.y, end.y, local),
  };
}

export function isPointInsideObstacle(point = {}, obstacle = {}) {
  const x = Number(point.x);
  const y = Number(point.y);
  return Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= Number(obstacle.x || 0) &&
    x <= Number(obstacle.x || 0) + Number(obstacle.width || 0) &&
    y >= Number(obstacle.y || 0) &&
    y <= Number(obstacle.y || 0) + Number(obstacle.height || 0);
}

export function getYardObstacleRects(placedGoodies = [], goodies = {}, slotMap = new Map()) {
  return (placedGoodies || []).map((placed) => {
    const goodie = goodies[placed.goodieId];
    if (!isYardGoodieBlocking(goodie)) return null;
    const position = getPlacedPosition(placed, slotMap);
    const width = goodie.size === "large" ? 20 : 14;
    const height = goodie.size === "large" ? 16 : 12;
    return {
      slotId: placed.slotId,
      goodieId: placed.goodieId,
      x: clamp(position.x - width / 2, 0, 100),
      y: clamp(position.y - height / 2, 0, 100),
      width,
      height,
    };
  }).filter(Boolean);
}

export function getVisitorMotion(visit, anchor, activity, renderNow, options = {}) {
  const arrivedAt = Number(visit.arrivedAt) || renderNow;
  const leavesAt = Math.max(arrivedAt + 60_000, Number(visit.leavesAt) || arrivedAt + 60_000);
  const progress = clamp((renderNow - arrivedAt) / (leavesAt - arrivedAt), 0, 1);
  const playzoneId = options.playzoneId || "meadow";
  const playzoneMargin = Math.max(0, Number(options.playzoneMargin) || 0);
  const constrain = (point) => clampYardPointToPlayzone(playzoneId, point, { margin: playzoneMargin });
  const stationary = !!activity?.stationary ||
    activity?.kind === "lie" ||
    activity?.kind === "stationary" ||
    isYardVisitorPoseStationary(options.visitorInfo, visit.pose || activity?.pose);
  const activityScale = Number.isFinite(Number(options.activityScale)) ? Number(options.activityScale) : 1;
  const activityX = (Number(activity?.x) || 0) * activityScale;
  const activityY = activity?.kind === "lie" ? 0 : (Number(activity?.y) || 0) * activityScale;
  const basePoint = constrain({
    x: clamp(anchor?.x || 50, 0, 100),
    y: clamp(anchor?.y || 70, 0, 100),
  });
  const offsetPoint = {
    x: clamp(basePoint.x + activityX, 3, 97),
    y: clamp(basePoint.y + activityY, 5, 98),
  };
  const rawAnchor = {
    x: clamp((anchor?.x || 50) + activityX, 0, 100),
    y: clamp((anchor?.y || 70) + activityY, 0, 100),
  };
  const anchorPoint = stationary ? offsetPoint : constrain(rawAnchor);
  const routeAnchor = stationary ? basePoint : anchorPoint;
  const anchorX = anchorPoint.x;
  const anchorY = anchorPoint.y;
  const routeX = routeAnchor.x;
  const routeY = routeAnchor.y;
  const edgePoint = constrain(getEntryPoint(visit.entryEdge, routeX, routeY));
  const exitPoint = constrain(getEntryPoint(visit.exitEdge || visit.entryEdge, routeX, routeY));
  const seed = seedNumber(visit.motionSeed || visit.visitId);
  const roam = stationary ? 0 : Number(activity?.roam || 0);
  const obstacles = Array.isArray(options.obstacles) ? options.obstacles : [];
  const pinnedToAnchor = !!options.pinToAnchor || (stationary && options.pinStationary !== false);

  if (pinnedToAnchor) {
    return {
      x: anchorX,
      y: anchorY,
      pose: visit.pose || activity?.pose || "sit",
      phase: "active",
      stationary: true,
      pinned: true,
    };
  }

  if (progress < 0.18) {
    const local = progress / 0.18;
    return {
      ...constrain(routePoint(edgePoint, { x: routeX, y: routeY }, local, obstacles)),
      pose: "walk",
      phase: "entering",
      stationary: false,
    };
  }

  if (progress > 0.84) {
    const local = (progress - 0.84) / 0.16;
    return {
      ...constrain(routePoint({ x: routeX, y: routeY }, exitPoint, local, obstacles)),
      pose: "walk",
      phase: "leaving",
      stationary: false,
    };
  }

  const rhythm = renderNow / (2300 + (seed % 900)) + seed;
  const roamX = Math.sin(rhythm) * roam;
  const roamY = Math.cos(rhythm * 0.7) * Math.min(3, roam);
  const activePoint = stationary
    ? { x: anchorX, y: anchorY }
    : constrain(avoidObstacleRects({
        x: clamp(anchorX + roamX, 3, 97),
        y: clamp(anchorY + roamY, 5, 98),
      }, obstacles));
  return {
    x: activePoint.x,
    y: activePoint.y,
    pose: visit.pose || activity?.pose || "sit",
    phase: "active",
    stationary,
  };
}
