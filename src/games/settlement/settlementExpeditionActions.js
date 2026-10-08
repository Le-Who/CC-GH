// Selection persistence may be asynchronous. Never launch a stale route.
export function matchesExpectedExpedition(selectedId, expectedId = null) {
  return expectedId == null || selectedId === expectedId;
}
export async function selectAndStartExpedition(id, select, start) {
  if (await select(id) === false) return false;
  return start(id);
}
