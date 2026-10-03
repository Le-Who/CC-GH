import { createHash, randomUUID } from 'node:crypto';
import { GARDEN_R2_RELEASE_POLICY, GARDEN_R2_CATALOG_REVISION } from './catalog.js';
import { GardenR2Error, requireR2, migrateGardenR2, validateGardenR2Player, runGardenR2Command, publicGardenR2 } from './domain.js';

const WINDOW_MS = 72 * 3_600_000;
const MAX_STREAMS = 128;
const clone = value => structuredClone(value);
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export function gardenR2Hash(payload) { return createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex'); }
export const hasGardenR2State = player => Object.prototype.hasOwnProperty.call(player, '_gardenProgression');

// A corrupt/future private namespace must never masquerade as a legacy account.
export function gardenR2Snapshot(player) {
  if (!hasGardenR2State(player)) return null;
  try { return publicGardenR2(player); }
  catch (caught) {
    if (caught instanceof GardenR2Error) return { version: 1, blocked: true, error: caught.code };
    throw caught;
  }
}

function error(code, status = 409) { return { error: code, status }; }
function receiptResult(player, receipt, extra = {}) {
  return { ...receipt.result, ...extra, receiptConfirmed: true, clientActionId: receipt.clientActionId, gardenR2: publicGardenR2(player), gold: player.resources.gold };
}

/** Prepare one atomic player delta. Never mutate the caller on success or failure.
 * Caller must commit the allowed fields under withPlayerLock/OCC; never replace a
 * newer whole player object, and never replay via generic TTL receipts. */
export function executeGardenR2(player, payload, { now = Date.now(), clientActionId, enabled = GARDEN_R2_RELEASE_POLICY.enabled, makePlantId = randomUUID } = {}) {
  try {
    requireR2(enabled, 'GARDEN_R2_NOT_ENABLED', 409);
    requireR2(plain(payload) && Object.keys(payload).every(key => ['version', 'catalogRevision', 'accountId', 'command', 'input', 'expectedRevision', 'intent'].includes(key)), 'GARDEN_R2_ENVELOPE_INVALID', 400);
    requireR2(payload.version === 1 && payload.catalogRevision === GARDEN_R2_CATALOG_REVISION, 'GARDEN_R2_CLIENT_UPDATE_REQUIRED');
    requireR2(typeof player.id === 'string' && payload.accountId === player.id, 'GARDEN_R2_ACCOUNT_MISMATCH', 403);
    requireR2(Number.isSafeInteger(now) && now >= 0, 'GARDEN_R2_CLOCK_INVALID', 400);
    const intent = payload.intent;
    requireR2(plain(intent) && Object.keys(intent).every(key => ['streamId', 'sequence', 'createdAt'].includes(key)) && /^[a-zA-Z0-9_-]{16,64}$/.test(intent.streamId || '') && Number.isSafeInteger(intent.sequence) && intent.sequence >= 1 && Number.isSafeInteger(intent.createdAt), 'GARDEN_R2_INTENT_INVALID', 400);
    requireR2(clientActionId === `garden-r2:${intent.streamId}:${intent.sequence}`, 'GARDEN_R2_INTENT_ID_INVALID', 400);
    requireR2(intent.createdAt >= 0 && intent.createdAt <= now + 300_000, 'GARDEN_R2_INTENT_TIME_INVALID', 400);
    requireR2(Number.isSafeInteger(payload.expectedRevision) && payload.expectedRevision >= 0, 'GARDEN_R2_REVISION_INVALID', 400);
    const existing = player._gardenProgression;
    if (hasGardenR2State(player)) validateGardenR2Player(player);
    const record = existing?.streams?.[intent.streamId], hash = gardenR2Hash(payload);
    if (record && intent.sequence === record.sequence) {
      requireR2(record.hash === hash && record.clientActionId === clientActionId, 'GARDEN_R2_INTENT_CONFLICT');
      return { duplicate: true, ...receiptResult(player, record) };
    }
    requireR2(!record || intent.sequence > record.sequence, 'GARDEN_R2_INTENT_SUPERSEDED');
    requireR2(record ? intent.sequence === record.sequence + 1 : intent.sequence === 1 && now - intent.createdAt <= WINDOW_MS, 'GARDEN_R2_INTENT_AMBIGUOUS');
    requireR2(record || Object.keys(existing?.streams || {}).length < MAX_STREAMS, 'GARDEN_R2_ACCOUNTING_CAPACITY');
    requireR2(payload.expectedRevision === (existing?.revision || 0), 'GARDEN_R2_REVISION_CONFLICT');
    let next, result;
    if (payload.command === 'adopt') {
      requireR2(!hasGardenR2State(player), 'GARDEN_R2_ALREADY_ADOPTED');
      requireR2(plain(payload.input) && Object.keys(payload.input).every(key => ['legacyRevision', 'acknowledgedTotal'].includes(key)), 'GARDEN_R2_PAYLOAD_INVALID', 400);
      next = migrateGardenR2(player, { now, ...payload.input }); result = { migrated: true, goldDelta: 0 };
    } else {
      requireR2(existing, 'GARDEN_R2_ADOPTION_REQUIRED');
      next = clone(player);
      result = runGardenR2Command(next, payload.command, payload.input || {}, { now, makePlantId });
      result.goldDelta = next.resources.gold - player.resources.gold;
    }
    const state = next._gardenProgression;
    requireR2(Number.isSafeInteger(state.revision + 1), 'GARDEN_R2_AMOUNT_OVERFLOW');
    state.revision++;
    const receipt = { sequence: intent.sequence, hash, clientActionId, appliedAt: now, result: { ...result, revision: state.revision } };
    state.streams[intent.streamId] = receipt;
    return {
      ...receiptResult(next, receipt),
      commit: { garden: next.garden, gardenAccounting: next.gardenAccounting, gardenProgression: state, gold: next.resources.gold, stats: next.stats },
    };
  } catch (caught) {
    if (caught instanceof GardenR2Error) return error(caught.code, caught.status);
    throw caught;
  }
}

export function reconcileGardenR2(player, payload) {
  try {
    requireR2(plain(payload) && Object.keys(payload).every(key => ['accountId', 'streamId', 'sequence', 'clientActionId', 'payloadHash'].includes(key)), 'GARDEN_R2_PAYLOAD_INVALID', 400);
    requireR2(payload.accountId === player.id, 'GARDEN_R2_ACCOUNT_MISMATCH', 403);
    const { streamId, sequence, clientActionId, payloadHash } = payload;
    requireR2(/^[a-zA-Z0-9_-]{16,64}$/.test(streamId || '') && Number.isSafeInteger(sequence) && sequence > 0 && /^[a-f0-9]{64}$/.test(payloadHash || ''), 'GARDEN_R2_INTENT_INVALID', 400);
    requireR2(clientActionId === `garden-r2:${streamId}:${sequence}`, 'GARDEN_R2_INTENT_ID_INVALID', 400);
    if (hasGardenR2State(player)) validateGardenR2Player(player);
    const record = player._gardenProgression?.streams?.[streamId];
    // Stream tombstones are never evicted. Absence proves sequence 1 has not
    // committed; replay of a still-running request is deduplicated by OCC.
    if (!record) {
      requireR2(sequence === 1, 'GARDEN_R2_INTENT_AMBIGUOUS');
      return { applied: false, receiptConfirmed: true, expectedSequence: 1, gardenR2: gardenR2Snapshot(player), gold: player.resources.gold };
    }
    if (record.sequence === sequence) {
      requireR2(record.clientActionId === clientActionId && record.hash === payloadHash, 'GARDEN_R2_INTENT_CONFLICT');
      return { duplicate: true, ...receiptResult(player, record) };
    }
    if (record.sequence + 1 === sequence) return { applied: false, receiptConfirmed: true, expectedSequence: sequence, gardenR2: publicGardenR2(player), gold: player.resources.gold };
    return error('GARDEN_R2_INTENT_SUPERSEDED');
  } catch (caught) {
    if (caught instanceof GardenR2Error) return error(caught.code, caught.status);
    throw caught;
  }
}

export function gardenR2BlocksLegacy(player, action) {
  return hasGardenR2State(player) && String(action).startsWith('garden.') && !['garden.r2', 'garden.r2.reconcile', 'garden.reconcileIntent'].includes(action);
}
