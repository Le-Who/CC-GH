import { YARD_GOODIES, YARD_REMODELS, getYardGoodieActivities, isYardGoodieBlocking,
  getYardPlayzoneRows, INVENTORY_ONLY_GOODS, PLACEMENT_LIMITS } from './catalog.mjs';
import { lookup } from './util.mjs';
const EPS = 1e-8;
const MASKS = new Map(Object.keys(YARD_REMODELS).map((id) => [id, getYardPlayzoneRows(id)]));
export const DEFAULT_SCENE = Object.freeze({ grid: 2, actorRadius: 1.25,
  entry: Object.freeze({ x: 50, y: 94 }), entryClearance: 4, exclusions: Object.freeze([]) });
export function sceneConfig(options = {}) { return { ...DEFAULT_SCENE, ...options,
  entry: { ...DEFAULT_SCENE.entry, ...options.entry }, exclusions: options.exclusions || [] }; }
export function footprint(placed, options = {}) {
  const goodie = lookup(YARD_GOODIES, placed.goodieId);
  if (!goodie) return null;
  // 14x12 / 20x16 are exactly the old movement.js obstacle dimensions.
  // Reuse for exclusion footprints, including layable props; art-specific overrides are explicit scene inputs.
  const custom = options.footprints?.[placed.goodieId];
  const width = custom?.width ?? (goodie.size === 'large' ? 20 : 14);
  const height = custom?.height ?? (goodie.size === 'large' ? 16 : 12);
  return { x: placed.x - width / 2, y: placed.y - height / 2, width, height,
    slotId: placed.slotId, goodieId: placed.goodieId, blocksMovement: isYardGoodieBlocking(goodie) };
}
export function overlaps(a, b, margin = 0) {
  return a.x < b.x + b.width + margin && a.x + a.width + margin > b.x
    && a.y < b.y + b.height + margin && a.y + a.height + margin > b.y;
}
function rectInMask(rect, remodel) {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0
    || rect.x < 0 || rect.y < 0 || rect.x + rect.width > 100 || rect.y + rect.height > 100) return false;
  const rows = MASKS.get(remodel) || [];
  for (let row = Math.floor(rect.y / 2); row <= Math.ceil((rect.y + rect.height) / 2); row++) {
    if (!(rows[row] || []).some(([lo, hi]) => rect.x >= lo - EPS && rect.x + rect.width <= hi + EPS)) return false;
  }
  return true;
}
function blocked(point, rect, radius) {
  return point.x >= rect.x - radius && point.x <= rect.x + rect.width + radius
    && point.y >= rect.y - radius && point.y <= rect.y + rect.height + radius;
}
export function buildNavigation(yard, options = {}) {
  const scene = sceneConfig(options), radius = scene.actorRadius;
  const blockers = (yard.placedGoodies || []).map((p) => footprint(p, scene)).filter((r) => r?.blocksMovement).concat(scene.exclusions);
  const passable = (p) => rectInMask({ x: p.x - radius, y: p.y - radius, width: radius * 2, height: radius * 2 }, yard.remodel)
    && !blockers.some((r) => blocked(p, r, radius));
  const segment = (a, b) => {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.5));
    for (let i = 0; i <= n; i++) if (!passable({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n })) return false;
    return true;
  };
  const count = Math.floor(100 / scene.grid) + 1;
  const key = (x, y) => y * count + x;
  const coordinate = (id) => ({ x: (id % count) * scene.grid, y: Math.floor(id / count) * scene.grid });
  const allowed = new Set();
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) if (passable(coordinate(key(x, y)))) allowed.add(key(x, y));
  const nearest = (p, candidates) => [...candidates].map((id) => ({ id, p: coordinate(id) }))
    .filter((v) => Math.hypot(v.p.x - p.x, v.p.y - p.y) <= scene.grid * 1.5 && segment(p, v.p))
    .sort((a, b) => Math.hypot(a.p.x - p.x, a.p.y - p.y) - Math.hypot(b.p.x - p.x, b.p.y - p.y) || a.id - b.id)[0]?.id;
  const start = passable(scene.entry) ? nearest(scene.entry, allowed) : undefined;
  const parents = new Map(), queue = [];
  if (start !== undefined) { parents.set(start, null); queue.push(start); }
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i], x = id % count, y = Math.floor(id / count);
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= count || ny >= count) continue;
      const next = key(nx, ny);
      if (allowed.has(next) && !parents.has(next) && segment(coordinate(id), coordinate(next))) { parents.set(next, id); queue.push(next); }
    }
  }
  return { passable, segment, entryReachable: start !== undefined, reachableCells: parents.size,
    routeTo(target) {
      if (!passable(target)) return null;
      const end = nearest(target, parents.keys());
      if (end === undefined) return null;
      const points = [target]; let id = end;
      while (id !== null) { points.push(coordinate(id)); id = parents.get(id); }
      points.push(scene.entry); points.reverse();
      return { points, length: points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0) };
    },
  };
}
export function approachPoint(placed, activity, options = {}) {
  const scene = sceneConfig(options), box = footprint(placed, scene);
  let p = { x: placed.x + activity.x, y: placed.y + activity.y };
  if (box?.blocksMovement && blocked(p, box, scene.actorRadius)) {
    const m = scene.actorRadius + 0.5;
    const choices = [{ x: box.x - m, y: p.y }, { x: box.x + box.width + m, y: p.y },
      { x: p.x, y: box.y - m }, { x: p.x, y: box.y + box.height + m }];
    p = choices.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
  }
  return p;
}
export function validateLayout(yard, options = {}) {
  const scene = sceneConfig(options), errors = [], rows = yard.placedGoodies || [];
  if (!lookup(YARD_REMODELS, yard.remodel)) errors.push({ code: 'UNKNOWN_REMODEL', remodel: yard.remodel });
  const limit = PLACEMENT_LIMITS[yard.expansion?.level >= 2 ? 2 : 1];
  if (rows.length > limit) errors.push({ code: 'CAPACITY_EXCEEDED', limit });
  const slots = new Set(), boxes = [];
  const gate = { x: scene.entry.x - scene.entryClearance, y: scene.entry.y - scene.entryClearance,
    width: scene.entryClearance * 2, height: scene.entryClearance * 2 };
  for (const p of rows) {
    if (slots.has(p.slotId)) errors.push({ code: 'DUPLICATE_SLOT', slotId: p.slotId }); slots.add(p.slotId);
    const box = footprint(p, scene);
    if (!box) { errors.push({ code: INVENTORY_ONLY_GOODS.includes(p.goodieId) ? 'INVENTORY_ONLY' : 'UNKNOWN_GOODIE', slotId: p.slotId }); continue; }
    if (!rectInMask(box, yard.remodel)) errors.push({ code: 'FOOTPRINT_OUTSIDE_PLAYZONE', slotId: p.slotId });
    if ([gate, ...scene.exclusions].some((r) => overlaps(box, r))) errors.push({ code: 'EXCLUSION_COLLISION', slotId: p.slotId });
    for (const previous of boxes) if (overlaps(box, previous)) errors.push({ code: 'FOOTPRINT_COLLISION', slots: [p.slotId, previous.slotId] });
    boxes.push(box);
  }
  const routes = {};
  if (!errors.length) {
    const navigation = buildNavigation(yard, scene);
    if (!navigation.entryReachable) errors.push({ code: 'ENTRY_BLOCKED' });
    for (const p of rows) {
      routes[p.slotId] = {};
      for (const a of getYardGoodieActivities(YARD_GOODIES[p.goodieId], p.condition)) {
        const route = navigation.routeTo(approachPoint(p, a, scene));
        if (route) routes[p.slotId][a.id] = route;
      }
      if (!Object.keys(routes[p.slotId]).length) errors.push({ code: 'PROP_UNREACHABLE', slotId: p.slotId });
    }
  }
  return { ok: !errors.length, errors, routes };
}
