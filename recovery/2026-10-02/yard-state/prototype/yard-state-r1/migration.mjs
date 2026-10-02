import { createDefaultYardState } from '../../design/yard-v2/baseline-47519/game-logic/yard.js';
import { BASELINE_SHA, YARD_GOODIES, YARD_VISITORS, LEGACY_ROOM_GOODIE_MAP } from './catalog.mjs';
import { clone, digest, integer, assertInteger, legacyGiftId, lookup, put, deepFreeze, workingCopy } from './util.mjs';
export const FOUNDATION_FORMAT = 'isolated-yard-foundation/v1';
export function ownership(yard = {}) {
  const counts = { ...(yard.goodieInventory || {}) };
  for (const p of yard.placedGoodies || []) put(counts, p.goodieId, (lookup(counts, p.goodieId) || 0) + 1);
  return counts;
}
export function walletSnapshot(player = {}) {
  return { resources: clone(player.resources), yardCurrencies: clone(player.yard?.currencies),
    mergeAlchemyEssence: player.merge?.alchemyEssence };
}
function operationalIssues(yard) {
  const issues = [];
  for (const key of ['placedGoodies', 'bowls', 'activeVisitors', 'pendingGifts']) if (!Array.isArray(yard[key])) issues.push({ code: 'MISSING_ARRAY', key });
  for (const key of ['currencies', 'foodInventory', 'goodieInventory', 'petbook', 'mementos']) if (!yard[key] || typeof yard[key] !== 'object' || Array.isArray(yard[key])) issues.push({ code: 'MISSING_OBJECT', key });
  for (const key of ['treats', 'shinyTreats']) if (!integer(yard.currencies?.[key])) issues.push({ code: 'INVALID_CURRENCY', key });
  for (const field of ['foodInventory', 'goodieInventory']) for (const [id, count] of Object.entries(yard[field] || {})) {
    if (!integer(count)) issues.push({ code: 'INVALID_COUNT', field, id });
  }
  return issues;
}
export function migratePlayerSnapshot(input, { now, seed } = {}) {
  assertInteger(now, 'migration now');
  if (input?.format === FOUNDATION_FORMAT && input.player && input.runtime && input.migration?.receipt) {
    if (input.runtime.version !== 1) throw new Error('Unsupported future runtime version; preserve raw backup and quarantine');
    return workingCopy(input);
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Expected a complete player JSON snapshot');
  const rawBackup = deepFreeze(clone(input)), player = clone(input), importedLegacyRoom = [];
  if (player.yard && (typeof player.yard !== 'object' || Array.isArray(player.yard))) throw new TypeError('Malformed Yard must be quarantined, not reset');
  if (!player.yard || typeof player.yard !== 'object' || Array.isArray(player.yard)) {
    // Starter grant is only for an absent Yard. Existing Yard is never normalized or default-filled.
    player.yard = createDefaultYardState(now, { pet: player.pet || {}, room: {} });
    const room = player.room || {};
    const ids = new Set([...(Array.isArray(room.inventory) ? room.inventory : []),
      ...(Array.isArray(room.roomInventory) ? room.roomInventory : []),
      ...(Array.isArray(room.decorations) ? room.decorations : [])]);
    for (const id of ids) if (LEGACY_ROOM_GOODIE_MAP[id]) {
      const goodieId = LEGACY_ROOM_GOODIE_MAP[id];
      player.yard.goodieInventory[goodieId] = (player.yard.goodieInventory[goodieId] || 0) + 1;
      importedLegacyRoom.push({ decorationId: id, goodieId, quantity: 1 });
    }
    // No guessed placement restoration: old room positions remain in raw data and all mapped ownership is retained unplaced.
  }
  const yard = player.yard;
  const cursor = integer(yard.lastSimulatedAt) ? yard.lastSimulatedAt : now;
  const issues = operationalIssues(yard);
  const giftLedger = {}, visits = {};
  for (const gift of yard.pendingGifts || []) {
    if (!gift?.id) { issues.push({ code: 'GIFT_ID_MISSING' }); continue; }
    if (lookup(giftLedger, gift.id)) issues.push({ code: 'DUPLICATE_GIFT_ID', id: gift.id });
    put(giftLedger, gift.id, { status: 'earned', source: 'legacy-pending', original: clone(gift) });
  }
  for (const visit of yard.activeVisitors || []) {
    if (!visit.visitId || lookup(visits, visit.visitId) || !integer(visit.arrivedAt) || !integer(visit.leavesAt)) {
      issues.push({ code: 'AMBIGUOUS_LEGACY_VISIT', visit: clone(visit) }); continue;
    }
    const supported = !!lookup(YARD_VISITORS, visit.visitorId) && !!lookup(YARD_GOODIES, visit.goodieId);
    const elapsedBeforeCursor = visit.leavesAt <= cursor;
    const giftId = legacyGiftId(visit);
    put(visits, visit.visitId, { source: 'legacy', original: clone(visit), visitId: visit.visitId,
      slotId: visit.slotId, activityId: visit.activityId, giftId,
      arrivedAt: visit.arrivedAt, leavesAt: visit.leavesAt,
      releaseAt: visit.arrivedAt + Math.ceil((visit.leavesAt - visit.arrivedAt) * .84),
      status: !supported ? 'unsupported-legacy' : elapsedBeforeCursor ? 'historical-unknown' : 'active',
      timeline: null, route: null });
    if (elapsedBeforeCursor) issues.push({ code: 'HISTORICAL_OUTCOME_UNKNOWN', visitId: visit.visitId,
      note: 'Retained in backup/history; no speculative second gift is minted.' });
  }
  const receipt = { baselineSha: BASELINE_SHA, inputSha256: digest(input), migratedAt: now,
    existingYardPreservedExactly: !!input.yard, oldYardCreated: !input.yard,
    walletsBefore: walletSnapshot(input), walletsAfter: walletSnapshot(player),
    ownershipBefore: ownership(input.yard), ownershipAfter: ownership(yard),
    pendingGiftCountBefore: input.yard?.pendingGifts?.length || 0, pendingGiftCountAfter: yard.pendingGifts?.length || 0,
    importedLegacyRoom, automaticLegacyPlacement: false,
    notes: ['No arrays or unknown fields truncated. Existing player/yard/merge fields are copied exactly.',
      'Prototype runtime and receipts live outside the production player payload.',
      'Merge crafted/pending hints are preserved but never interpreted as guaranteed visits.'] };
  return { format: FOUNDATION_FORMAT, player,
    runtime: { version: 1, seed: String(seed ?? player.id ?? player.username ?? 'yard'), cursorMs: cursor,
      nextOpportunityAt: (Math.floor(cursor / 3600000) + 1) * 3600000,
      visits, giftLedger, actionReceipts: {}, events: [], migrationIssues: issues },
    migration: deepFreeze({ rawBackup, receipt }) };
}
export function restoreRawInput(envelope, externalBackup = null) {
  const raw = envelope.migration.rawBackup ?? externalBackup?.rawSnapshot;
  if (raw === undefined) throw new Error('Original snapshot lives in the external immutable backup store');
  if (digest(raw) !== envelope.migration.receipt.inputSha256) throw new Error('Backup integrity mismatch');
  return clone(raw);
}
