import { FOUNDATION_FORMAT, migratePlayerSnapshot, operationalIssues } from './migration.mjs';
import { clone, digest, deepFreeze, lookup, put, integer } from './util.mjs';
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
function validRuntime(runtime) {
  if (typeof runtime.seed!=='string'||!Array.isArray(runtime.events)||!object(runtime.actionReceipts)) return false;
  if(Object.hasOwn(runtime,'legacyPlacementAnchors')&&(!object(runtime.legacyPlacementAnchors)
    ||runtime.legacyPlacementAnchors.format!=='yard-legacy-display-anchors/v1'||!object(runtime.legacyPlacementAnchors.items)))return false;
  for (const key of ['commandReceipts','propCommitReceipts'])
    if (Object.hasOwn(runtime,key)&&!object(runtime[key])) return false;
  if (Object.values(runtime.giftLedger).some(row=>!object(row)||!['earned','claimed'].includes(row.status))) return false;
  for (const [id,row] of Object.entries(runtime.visits)) {
    if (!object(row)||row.visitId!==id||!object(row.original)||typeof row.slotId!=='string'
      ||!['active','completed','unsupported-legacy','historical-unknown'].includes(row.status)
      ||![row.arrivedAt,row.leavesAt,row.releaseAt].every(integer)
      ||row.leavesAt<=row.arrivedAt||row.releaseAt<row.arrivedAt||row.releaseAt>row.leavesAt) return false;
  }
  return true;
}
export function dispatchInput(payload, options) {
  let reason = null;
  if (!object(payload)) reason = 'MALFORMED_PLAYER';
  else if (payload.format?.startsWith?.('isolated-yard-foundation/')) {
    if (payload.format !== FOUNDATION_FORMAT || payload.runtime?.version !== 1) reason = 'FUTURE_OR_UNSUPPORTED_YARD_VERSION';
    else if (!object(payload.player) || !object(payload.runtime.visits) || !object(payload.runtime.giftLedger)
      || !Array.isArray(payload.runtime.migrationIssues) || !(payload.migration?.receipt || payload.migration?.backupId)
      || payload.player.schemaVersion !== 11) reason = 'MALFORMED_ENVELOPE';
    else if (!object(payload.player.yard) || Object.hasOwn(payload.player.yard,'schemaVersion') || operationalIssues(payload.player.yard).length || !validRuntime(payload.runtime)
      || !integer(payload.runtime.cursorMs) || !integer(payload.runtime.nextOpportunityAt)
      || payload.runtime.nextOpportunityAt <= payload.runtime.cursorMs) reason = 'MALFORMED_OPERATIONAL_STATE';
    else return { status: 200, mode: 'prototype', state: payload };
  } else if (payload.schemaVersion !== 11) reason = integer(payload.schemaVersion) && payload.schemaVersion > 11
    ? 'FUTURE_PLAYER_VERSION' : 'LEGACY_PLAYER_MIGRATION_OR_REVIEW_REQUIRED';
  else if (payload.yard && (!object(payload.yard) || Object.hasOwn(payload.yard, 'schemaVersion'))) reason = 'MALFORMED_OR_UNSUPPORTED_YARD_VERSION';
  const backupDigest = () => digest({ payloadType: typeof payload, payload });
  const backup = () => deepFreeze({ id: `quarantine-${backupDigest()}`, sha256: backupDigest(), rawSnapshot: clone(payload) });
  if (reason) return { status: 409, mode: 'quarantine-readonly', reason, backup: backup(), mutationsAllowed: false };
  try {
    const state = migratePlayerSnapshot(payload, options);
    const blocking = state.runtime.migrationIssues.filter((i) => i.code !== 'HISTORICAL_OUTCOME_UNKNOWN');
    if (blocking.length) return { status: 422, mode: 'quarantine-readonly', reason: 'MALFORMED_YARD_DATA', issues: blocking,
      state, backup: backup(), mutationsAllowed: false };
    return { status: 200, mode: 'legacy-migration', state };
  } catch (error) {
    return { status: 422, mode: 'quarantine-readonly', reason: 'MIGRATION_REVIEW_REQUIRED', detail: error.message,
      backup: backup(), mutationsAllowed: false };
  }
}
