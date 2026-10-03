/** Garden commands own only Garden and the shared gold balance, never a whole
 * hub snapshot. Revision orders Garden; syncSeq/serverTime order shared gold. */
const record = value => value && typeof value === "object" && !Array.isArray(value);
const counter = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const account = snapshot => snapshot?.player?.id ?? snapshot?.accountId;
const revision = snapshot => counter(snapshot?.gardenR2?.revision);
const blocked = snapshot => snapshot?.gardenR2?.blocked === true;
const hasAuthority = snapshot => blocked(snapshot) || revision(snapshot) !== null;
const sequence = snapshot => counter(snapshot?.player?.syncSeq ?? snapshot?.syncSeq);

export function isGardenR2Action(action) {
  return action === "garden.r2" || action === "garden.r2.reconcile";
}

export function gardenR2AccountMatches(current, incoming, expectedAccountId = account(current)) {
  if (typeof expectedAccountId !== "string" || !expectedAccountId || account(current) !== expectedAccountId) return false;
  const ids = [incoming?.player?.id, incoming?.accountId, incoming?.gardenR2?.accountId].filter(value => value != null);
  return ids.length > 0 && ids.every(value => value === expectedAccountId);
}

/** Sequence takes precedence over wall time (and is stamped after commit). */
export function compareSnapshotFreshness(incoming, current) {
  const nextSeq = sequence(incoming), prevSeq = sequence(current);
  if (nextSeq !== null && prevSeq !== null && nextSeq !== prevSeq) return Math.sign(nextSeq - prevSeq);
  const nextTime = counter(incoming?.serverTime), prevTime = counter(current?.serverTime);
  if (nextTime !== null && prevTime !== null && nextTime !== prevTime) return Math.sign(nextTime - prevTime);
  return 0;
}

function sameObservation(a, b) {
  return sequence(a) === sequence(b) && counter(a?.serverTime) === counter(b?.serverTime);
}

function replaceGold(snapshot, gold) {
  return {
    ...snapshot,
    resources: { ...snapshot.resources, gold },
    ...(snapshot.inventory ? { inventory: {
      ...snapshot.inventory, rewards: { ...snapshot.inventory.rewards, gold },
    } } : {}),
  };
}

function mergeObservation(current, incoming) {
  const next = {};
  const nextTime = counter(incoming?.serverTime), prevTime = counter(current?.serverTime);
  if (nextTime !== null && (prevTime === null || nextTime >= prevTime)) next.serverTime = nextTime;
  const nextSeq = sequence(incoming), prevSeq = sequence(current);
  if (nextSeq !== null && (prevSeq === null || nextSeq >= prevSeq)) next.player = { ...current.player, syncSeq: nextSeq };
  return next;
}

/** Return current unchanged for foreign, incomplete or stale Garden responses.
 * requestSnapshot is optional evidence that an unversioned realtime gold update
 * arrived while a command was in flight; never roll that balance back. */
export function mergeGardenR2Snapshot(current, incoming, { accountId = account(current), requestSnapshot } = {}) {
  if (!gardenR2AccountMatches(current, incoming, accountId)) return current;
  const freshness = compareSnapshotFreshness(incoming, current);
  // A fail-closed public projection is authoritative even without a readable
  // revision. Surface the blocker, never import its possibly corrupt economy.
  if (blocked(incoming)) {
    return freshness < 0 ? current : { ...current, gardenR2: incoming.gardenR2, ...mergeObservation(current, incoming) };
  }
  if (!record(incoming?.garden) || revision(incoming) === null) return current;
  if (blocked(current) && freshness <= 0) return current;
  const nextRev = revision(incoming), prevRev = revision(current);
  if (prevRev !== null && nextRev < prevRev) return current;
  if (prevRev === nextRev) {
    const nextNow = counter(incoming.gardenR2.serverNow), prevNow = counter(current.gardenR2.serverNow);
    if (freshness < 0 || (nextNow !== null && prevNow !== null && nextNow < prevNow)) return current;
  }
  let next = {
    ...current,
    garden: incoming.garden,
    gardenR2: incoming.gardenR2,
    ...mergeObservation(current, incoming),
  };
  if (typeof incoming.gardenR2Available === "boolean" && freshness >= 0) next.gardenR2Available = incoming.gardenR2Available;
  const unversionedGoldChange = requestSnapshot && account(requestSnapshot) === accountId
    && current.resources?.gold !== requestSnapshot.resources?.gold && sameObservation(current, requestSnapshot);
  const gold = incoming.resources?.gold;
  if (counter(gold) !== null && freshness >= 0 && !unversionedGoldChange) next = replaceGold(next, gold);
  return next;
}

/** Legacy/full-snapshot callers keep their contract, but an adopted Garden can
 * never be demoted by an older in-flight response from any game. Explicit
 * account replacement remains possible through applySnapshot. */
export function protectGardenR2Snapshot(current, incoming) {
  if (!hasAuthority(current) || !gardenR2AccountMatches(current, incoming)) return incoming;
  const gardenView = mergeGardenR2Snapshot(current, incoming);
  return {
    ...replaceGold(incoming, gardenView.resources?.gold),
    garden: gardenView.garden,
    gardenR2: gardenView.gardenR2,
    ...(typeof gardenView.gardenR2Available === "boolean" ? { gardenR2Available: gardenView.gardenR2Available } : {}),
    ...mergeObservation(incoming, current),
  };
}
