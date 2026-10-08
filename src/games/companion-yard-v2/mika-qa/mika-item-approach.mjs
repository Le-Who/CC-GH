/** A bounded native approach candidate on the normal persisted meadow. This is
 * read-only presentation, not a saved visit, interaction, reservation or award. */
import {MIKA_ITEM_FOOTPRINTS} from '../../../../game-logic/yard-v2/mika-item-geometry.mjs';
import {foodVesselExclusion} from '../../../../game-logic/yard-v2/food-media.mjs';
import {canonical, deepFreeze} from '../../../../game-logic/yard-v2/util.mjs';
import mask from './meadow-mask.json' with {type: 'json'};
import {planMikaYardQaCruise} from './mika-yard-route.mjs';

const fail = reason => ({ok: false, reason});
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 128;
const finitePoint = row => [row?.x, row?.y].every(n => Number.isFinite(n) && n >= 0 && n <= 100);

/** Accept the existing publicPersistentYard snapshot only. Never substitute
 * inventory counts, canonical Pip placements or presentation recovery anchors
 * for a currently placed, uniquely identified native-space item. */
export function bindMikaPersistedItems(snapshot, view) {
  const yard = snapshot?.yard, runtime = snapshot?.yardRuntime;
  if (!text(snapshot?.player?.id) || runtime?.version !== 1 || runtime.revision !== 'persistent-mika/r1'
    || runtime.status !== 'ready' || runtime.mutable !== true || runtime.storageVersion === 3
    || runtime.canonicalVisitProtocol || !Array.isArray(runtime.canonicalPlacements) || runtime.canonicalPlacements.length
    || !Array.isArray(runtime.visits) || runtime.visits.length || !Array.isArray(runtime.reservations) || runtime.reservations.length
    || runtime.display?.ok !== true || !Array.isArray(runtime.display.issues) || runtime.display.issues.length)
    return fail('NATIVE_ITEM_RUNTIME_UNSUPPORTED');
  if (yard?.remodel !== 'meadow' || !Array.isArray(yard.placedGoodies) || yard.placedGoodies.length > 14
    || !Array.isArray(yard.bowls) || yard.bowls.length > 1 || yard.bowls.some(b => b?.id !== 'bowl-1'))
    return fail('NATIVE_ITEM_LOCATION_UNSUPPORTED');
  if (!Array.isArray(view?.props) || view.props.length !== yard.placedGoodies.length || view.pets?.length
    || view.legacy?.length || view.yard?.remodel !== yard.remodel) return fail('NATIVE_ITEM_PRESENTATION_MISMATCH');
  const slots = new Set(), items = [], obstacles = [{id: 'fixed:bowl-1', ...foodVesselExclusion()}];
  for (const row of yard.placedGoodies) {
    const shape = Object.hasOwn(MIKA_ITEM_FOOTPRINTS, row?.goodieId) ? MIKA_ITEM_FOOTPRINTS[row.goodieId] : null;
    if (!shape || !text(row.slotId) || slots.has(row.slotId) || !finitePoint(row)
      || row.condition !== 'new' || !Number.isFinite(row.rotationZ ?? 0)) return fail('NATIVE_ITEM_PLACEMENT_UNSUPPORTED');
    slots.add(row.slotId);
    const presented = view.props.filter(prop => prop.slotId === row.slotId);
    if (presented.length !== 1 || presented[0].goodieId !== row.goodieId || presented[0].supported !== true
      || presented[0].drawStandalone !== true || presented[0].reserved === true
      || presented[0].condition !== row.condition || presented[0].transform?.x !== row.x
      || presented[0].transform?.y !== row.y || (presented[0].transform?.rotationZ ?? 0) !== (row.rotationZ ?? 0))
      return fail('NATIVE_ITEM_PRESENTATION_MISMATCH');
    const rotationZ = row.rotationZ ?? 0, c = Math.abs(Math.cos(rotationZ)), s = Math.abs(Math.sin(rotationZ));
    const width = c * shape.width + s * shape.height, height = s * shape.width + c * shape.height;
    const box = {id: row.slotId, goodieId: row.goodieId, condition: row.condition,
      x: row.x - width / 2, y: row.y - height / 2, width, height};
    items.push({slotId: row.slotId, goodieId: row.goodieId, x: row.x, y: row.y, rotationZ, condition: row.condition, box});
    obstacles.push(box);
  }
  items.sort((a, b) => a.slotId.localeCompare(b.slotId));
  obstacles.sort((a, b) => a.id.localeCompare(b.id));
  const binding = {accountId: snapshot.player.id,
    location: {id: 'released-meadow-mask/v1', unitsPerSource: 8, domain: [0, 0, 100, 100]}, items,
    layout: {remodel: 'meadow', maskRows: mask.rows, obstacles}};
  return {ok: true, binding: deepFreeze(binding), key: canonical(binding)};
}

const distanceToBox = (point, box) => Math.hypot(
  Math.max(box.x - point.x, 0, point.x - box.x - box.width),
  Math.max(box.y - point.y, 0, point.y - box.y - box.height));
function bodyGap(body, box) {
  let gap = Math.min(...body.map(point => distanceToBox(point, box)));
  for (const x of [box.x, box.x + box.width]) for (const y of [box.y, box.y + box.height]) {
    for (let index = 0; index < body.length; index++) {
      const a = body[index], b = body[(index + 1) % body.length], dx = b.x - a.x, dy = b.y - a.y;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)));
      gap = Math.min(gap, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
    }
  }
  return gap;
}

/** End near, outside and facing a real item. The whole native body must clear
 * all source-owned obstacles. Exhaustion blocks instead of changing the route
 * or falling back to a decorative cruise. No stop/interaction clip is implied. */
export function planMikaItemApproach(bound, calibration, envelope, {acceptSweep = () => true} = {}) {
  if (!bound?.ok || !bound.binding?.items?.length) return fail('NATIVE_ITEM_TARGET_UNAVAILABLE');
  for (const target of bound.binding.items) {
    // At most 64 nearby start candidates, translated with the current item.
    // The original native sweep, mask and obstacle checks still decide safety.
    const candidateStarts = [36, 42, 48, 54].flatMap(radius => Array.from({length: 16}, (_, index) => {
      const angle = index * Math.PI / 8;
      return {x: target.x + radius * Math.cos(angle), y: target.y + radius * Math.sin(angle)};
    })).filter(finitePoint);
    const plan = planMikaYardQaCruise(bound.binding.layout, calibration, envelope, {acceptSweep, candidateStarts,
      acceptCandidate({start, end, heading, endBody}) {
        const dx = target.x - end.x, dy = target.y - end.y, distance = Math.hypot(dx, dy);
        const gap = bodyGap(endBody, target.box);
        return gap > 0 && gap <= 8 && distance > 0
          && Math.hypot(target.x - start.x, target.y - start.y) - distance >= 10
          && (Math.cos(heading) * dx + Math.sin(heading) * dy) / distance >= Math.cos(Math.PI / 6);
      }});
    if (plan.ok) return {ok: true, plan, target, bindingKey: bound.key,
      action: 'finite-item-approach', durationSeconds: 4, interactionReady: false};
  }
  return fail('NO_CLEAR_NATIVE_ITEM_APPROACH');
}
