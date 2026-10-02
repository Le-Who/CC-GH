/** PROPOSED server boundary only. No production route/db writes. Existing
 * playerManager._version OCC must atomically commit the resulting state+receipts.
 */
import { FOUNDATION_FORMAT, migratePlayerSnapshot, operationalIssues } from './migration.mjs';
import { advanceYard, applyPrototypeAction, visitPhase } from './simulation.mjs';
import { clone, digest, deepFreeze, lookup, put, integer } from './util.mjs';
export const STORE_FORMAT = 'isolated-yard-store/v1';
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function dispatchInput(payload, options) {
  let reason = null;
  if (!object(payload)) reason = 'MALFORMED_PLAYER';
  else if (payload.format?.startsWith?.('isolated-yard-foundation/')) {
    if (payload.format !== FOUNDATION_FORMAT || payload.runtime?.version !== 1) reason = 'FUTURE_OR_UNSUPPORTED_YARD_VERSION';
    else if (!object(payload.player) || !object(payload.runtime.visits) || !object(payload.runtime.giftLedger)
      || !Array.isArray(payload.runtime.migrationIssues) || !(payload.migration?.receipt || payload.migration?.backupId)
      || payload.player.schemaVersion !== 11) reason = 'MALFORMED_ENVELOPE';
    else if (!object(payload.player.yard) || operationalIssues(payload.player.yard).length
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
export function splitForStorage(state, version = 'prototype:0') {
  if (state?.format !== FOUNDATION_FORMAT || state.runtime?.version !== 1) throw new Error('Unsupported state cannot be stored as v1');
  const sha256 = state.migration.inputSha256 || state.migration.receipt?.inputSha256;
  const backupId = state.migration.backupId || `raw-${sha256}`;
  const backup = state.migration.rawBackup === undefined ? null : deepFreeze({ id: backupId, sha256,
    rawSnapshot: state.migration.rawBackup, receipt: state.migration.receipt });
  return { backup,
    record: { format: STORE_FORMAT, version, state: { ...state,
      player: clone(state.player), runtime: clone(state.runtime),
      migration: { backupId, receiptId: state.migration.receiptId || `receipt-${sha256}`, inputSha256: sha256 } }, commandReceipts: {} } };
}
export function readView(state) {
  return { prototype: true, cursorMs: state.runtime.cursorMs, player: clone(state.player),
    visits: Object.values(state.runtime.visits).filter((r) => r.status === 'active').map((r) => ({
      visitId: r.visitId, phase: visitPhase(r, state.runtime.cursorMs), slotId: r.slotId, activityId: r.activityId,
      route: clone(r.route), timeline: clone(r.timeline) })) };
}
/** Plans one mutation/snapshot against an opaque OCC token. The returned proposal
 * is not a commit. Commit with UPDATE..WHERE _version=expectedVersion (or equivalent)
 * before returning its snapshot or executing an after-commit/outbox effect.
 */
export function planCommand(record, command, { now, scene } = {}) {
  if (record?.format !== STORE_FORMAT || record.state?.format !== FOUNDATION_FORMAT || record.state?.runtime?.version !== 1) {
    return { status: 409, error: 'UNSUPPORTED_STORED_VERSION', quarantine: true, rawBackup: clone(record) };
  }
  if (typeof command.actionId !== 'string' || !command.actionId) return { status: 400, error: 'ACTION_ID_REQUIRED' };
  const dispatched = dispatchInput(record.state, { now });
  if (dispatched.status !== 200) return { status: dispatched.status, error: dispatched.reason, quarantine: true, backup: dispatched.backup };
  const requestHash = digest({ action: command.action, payload: command.payload || {} });
  const existing = lookup(record.commandReceipts, command.actionId);
  if (existing) {
    if (existing.requestHash !== requestHash) return { status: 409, error: 'ACTION_ID_PAYLOAD_CONFLICT' };
    return { status: existing.status, replayed: true, receipt: clone(existing), view: readView(record.state), proposal: null };
  }
  const legacyReceipts = (record.state.player._actionReceipts?.items || [])
    .filter((r) => r.clientActionId === command.actionId);
  if (legacyReceipts.length) {
    const legacyHash = Buffer.from(requestHash, 'hex').toString('base64url');
    if (legacyReceipts.some((r) => r.payloadHash !== legacyHash || r.action !== command.action)) {
      return { status: 409, error: 'LEGACY_ACTION_ID_PAYLOAD_CONFLICT' };
    }
    return { status: 200, replayed: true, legacyReplay: true, proposal: null,
      receipt: clone(legacyReceipts.at(-1)), view: readView(record.state) };
  }
  // Receipts pruned by the old72h/200 policy cannot be recovered. Never silently
  // reinterpret an unknown legacy nonce as a fresh claim in the new protocol.
  if (!/^yard-v2:[A-Za-z0-9_.:-]{1,112}$/.test(command.actionId)) {
    return { status: 409, error: 'LEGACY_NONCE_REQUIRES_NEW_PROTOCOL_INTENT' };
  }
  if (command.expectedVersion !== record.version) return { status: 409, error: 'OCC_CONFLICT', actualVersion: record.version };
  let nextState, extras, status;
  // OCC retry can observe a later committed cursor than this request's initially captured server time.
  const effectiveNow = Math.max(now, record.state.runtime.cursorMs);
  if (command.action === 'snapshot') { nextState = advanceYard(record.state, effectiveNow, { scene }); extras = {}; status = 200; }
  else {
    const result = applyPrototypeAction(record.state, command.action, command.payload || {}, { now: effectiveNow, scene, actionId: command.actionId });
    nextState = result.state; extras = result.extras || { error: result.error, details: result.details }; status = result.status;
  }
  const nextVersion = `prototype:${digest(`${record.version}:${command.actionId}:${requestHash}:${now}`).slice(0, 24)}`;
  const receipt = { actionId: command.actionId, action: command.action, requestHash, at: effectiveNow, requestedServerNow: now,
    versionBefore: record.version, versionAfter: nextVersion, status, extras: clone(extras) };
  const nextRecord = { ...record, version: nextVersion, state: nextState, commandReceipts: { ...record.commandReceipts } };
  put(nextRecord.commandReceipts, command.actionId, receipt);
  return { status, receipt, view: readView(nextState),
    proposal: { expectedVersion: record.version, nextRecord }, committed: false };
}
/** Test-only CAS reference implementation; never a substitute for durable server OCC. */
export class MemoryCAS {
  constructor(record) { this.record = clone(record); }
  read() { return clone(this.record); }
  commit(proposal) {
    if (!proposal || this.record.version !== proposal.expectedVersion) return false;
    this.record = clone(proposal.nextRecord); return true;
  }
}
