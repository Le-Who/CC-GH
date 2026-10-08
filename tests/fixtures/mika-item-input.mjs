import {resolveYardDisplay} from '../../game-logic/yard-v2/legacy-presentation.mjs';
import {MIKA_ITEM_FOOTPRINTS,MIKA_SCENE_ENTRY} from '../../game-logic/yard-v2/mika-item-geometry.mjs';
import {foodVesselExclusion} from '../../game-logic/yard-v2/food-media.mjs';
export function mikaItemFixture(rows = [{slotId: 'mouse-1', goodieId: 'yarn_mouse', x: 64, y: 54, condition: 'new'}]) {
  const snapshot = {player: {id: 'native-item-account'},
    yard: {remodel: 'meadow', placedGoodies: structuredClone(rows), bowls: [{id: 'bowl-1'}], goodieInventory: {yarn_mouse: 3}},
    yardRuntime: {version: 1, revision: 'persistent-mika/r1', status: 'ready', mutable: true,
      visits: [], reservations: [], canonicalPlacements: [], display: {ok: true, issues: []}}};
  const projected=resolveYardDisplay(snapshot.yard,{scene:{entry:MIKA_SCENE_ENTRY,footprints:MIKA_ITEM_FOOTPRINTS,exclusions:[foodVesselExclusion()]}});
  snapshot.yardRuntime.display={ok:projected.ok,issues:projected.issues,placements:projected.placements};
  const view = {yard: snapshot.yard, props: rows.map(row => ({...row, supported: true, drawStandalone: true,
    reserved: false, transform: {...row, rotationZ: row.rotationZ ?? 0}})), pets: [], legacy: []};
  return {snapshot, view};
}
