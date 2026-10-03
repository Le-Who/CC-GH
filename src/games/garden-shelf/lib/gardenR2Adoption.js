import { gardenLocalStateKey } from './gardenLocalState.js';
import { reconcileGardenCheckpoint } from './gardenTransactions.js';
const problem = error => ({ error });
/** Adoption is a boundary, never a reset. Unknown cache or unresolved legacy
 * earnings are held for review instead of guessed away. */
export async function prepareGardenR2Adoption({ accountId, storage, legacyCoordinator, readSnapshot, request, isCurrentAccount }) {
  if (!isCurrentAccount()) return problem('GARDEN_R2_ACCOUNT_CHANGED');
  const recovered = await legacyCoordinator.recover();
  if (recovered?.error || recovered?.pending) return recovered;
  if (!isCurrentAccount()) return problem('GARDEN_R2_ACCOUNT_CHANGED');
  let snapshot = readSnapshot();
  if (snapshot?.gardenR2) return { alreadyAdopted: true };
  let local = null;
  try {
    const raw = storage.getItem(gardenLocalStateKey(accountId));
    if (raw) {
      const record = JSON.parse(raw);
      if (record.version !== 1 || record.accountId !== accountId || !record.state || typeof record.state !== 'object' || !Array.isArray(record.state.plants)) return problem('GARDEN_R2_LEGACY_REVIEW_REQUIRED');
      local = record.state;
    }
  } catch { return problem('GARDEN_R2_STORAGE_UNAVAILABLE'); }
  if (!snapshot?.garden) return problem('GARDEN_R2_LEGACY_REVIEW_REQUIRED');
  if (local) {
    const server = snapshot.garden;
    if (!Number.isSafeInteger(local.totalGoldEarned) || local.totalGoldEarned < 0 || (local.economicRevision || 0) > (server.economicRevision || 0)) return problem('GARDEN_R2_LEGACY_REVIEW_REQUIRED');
    if (local.totalGoldEarned > (server.acknowledgedEarnedTotal ?? server.totalGoldEarned) && (local.economicRevision || 0) !== (server.economicRevision || 0)) return problem('GARDEN_R2_LEGACY_REVIEW_REQUIRED');
    // Only checkpoints with the same economy can carry unsynced progress.
    if (local.economyVersion !== server.economyVersion) return problem('GARDEN_R2_LEGACY_REVIEW_REQUIRED');
    const checkpoint = reconcileGardenCheckpoint(local, server);
    let acknowledged = server.acknowledgedEarnedTotal ?? server.totalGoldEarned;
    while (checkpoint.totalGoldEarned > acknowledged) {
      if (!isCurrentAccount()) return problem('GARDEN_R2_ACCOUNT_CHANGED');
      const result = await legacyCoordinator.execute('garden.creditEarned', { state: checkpoint, throughTotal: checkpoint.totalGoldEarned, expectedRevision: server.economicRevision || 0 });
      if (result?.error || result?.pending || result?.receiptConfirmed !== true) return result?.error ? result : problem('GARDEN_R2_REQUEST_UNCONFIRMED');
      snapshot = readSnapshot();
      if (snapshot?.gardenR2) return { alreadyAdopted: true };
      const next = snapshot?.garden?.acknowledgedEarnedTotal;
      if (!Number.isSafeInteger(next) || next <= acknowledged) return problem('GARDEN_R2_LEGACY_REVIEW_REQUIRED');
      acknowledged = next;
    }
    if (!isCurrentAccount()) return problem('GARDEN_R2_ACCOUNT_CHANGED');
    const result = await request('garden.sync', { state: { ...checkpoint, acknowledgedEarnedTotal: acknowledged } }, { silent: true, feedback: false });
    if (result?.error || result?.pending) return result;
    snapshot = readSnapshot();
  }
  if (!isCurrentAccount() || snapshot?.player?.id !== accountId) return problem('GARDEN_R2_ACCOUNT_CHANGED');
  if (snapshot?.gardenR2) return { alreadyAdopted: true };
  const garden = snapshot.garden;
  if (!Number.isSafeInteger(garden.economicRevision) || !Number.isSafeInteger(garden.acknowledgedEarnedTotal) || garden.totalGoldEarned !== garden.acknowledgedEarnedTotal) return problem('GARDEN_R2_LEGACY_REVIEW_REQUIRED');
  return { input: { legacyRevision: garden.economicRevision, acknowledgedTotal: garden.acknowledgedEarnedTotal } };
}
