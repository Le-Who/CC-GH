export function mikaItemFixture(rows = [{slotId: 'mouse-1', goodieId: 'yarn_mouse', x: 64, y: 54, condition: 'new'}]) {
  const snapshot = {player: {id: 'native-item-account'},
    yard: {remodel: 'meadow', placedGoodies: structuredClone(rows), bowls: [{id: 'bowl-1'}], goodieInventory: {yarn_mouse: 3}},
    yardRuntime: {version: 1, revision: 'persistent-mika/r1', status: 'ready', mutable: true,
      visits: [], reservations: [], canonicalPlacements: [], display: {ok: true, issues: []}}};
  const view = {yard: snapshot.yard, props: rows.map(row => ({...row, supported: true, drawStandalone: true,
    reserved: false, transform: {...row, rotationZ: row.rotationZ ?? 0}})), pets: [], legacy: []};
  return {snapshot, view};
}
