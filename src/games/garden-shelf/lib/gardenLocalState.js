export const GARDEN_LOCAL_STATE_PREFIX = 'game_hub_garden_state_v1:';

export function gardenLocalStateKey(accountId) {
  return typeof accountId === 'string' && accountId
    ? `${GARDEN_LOCAL_STATE_PREFIX}${encodeURIComponent(accountId)}`
    : null;
}

/** A verified server snapshot is authoritative, including an empty Garden.
 * Browser caches are recovery copies, never automatic sources of earned gold.
 * In particular, the unscoped legacy terrarium_save has no provable owner.
 */
export function selectGardenInitialState(accountId, serverState) {
  return gardenLocalStateKey(accountId) && serverState && typeof serverState === 'object' && !Array.isArray(serverState)
    ? serverState
    : null;
}

/** Read-only recovery access. The production startup path does not call this. */
export function readGardenLocalState(storage, accountId) {
  const key = gardenLocalStateKey(accountId);
  if (!key) return null;
  try {
    const saved = JSON.parse(storage.getItem(key) || 'null');
    return saved?.version === 1 && saved.accountId === accountId && saved.state && typeof saved.state === 'object' && !Array.isArray(saved.state)
      ? saved.state
      : null;
  } catch {
    return null;
  }
}

export function writeGardenLocalState(storage, accountId, state) {
  const key = gardenLocalStateKey(accountId);
  if (!key || !state || typeof state !== 'object' || Array.isArray(state)) return false;
  try {
    const { gold: _sharedGold, ...garden } = state;
    storage.setItem(key, JSON.stringify({ version: 1, accountId, state: garden }));
    return true;
  } catch {
    return false;
  }
}
