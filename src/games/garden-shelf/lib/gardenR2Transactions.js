import { GARDEN_R2_CATALOG_REVISION } from '../../../../game-logic/garden-r2/catalog.js';
export const GARDEN_R2_RECEIPT_WINDOW_MS = 72 * 3_600_000;
const coordinators = new Map();
const problem = error => ({ error, success: false });
const uncertain = result => !result || result.pending || ['NETWORK_ERROR', 'TIMEOUT', 'GARDEN_R2_REQUEST_UNCONFIRMED', 'GARDEN_R2_INTENT_AMBIGUOUS', 'GARDEN_R2_INTENT_CONFLICT', 'GARDEN_R2_INTENT_SUPERSEDED', 'GARDEN_R2_ACCOUNT_MISMATCH', 'GARDEN_R2_ACCOUNT_CHANGED'].includes(result.error) || Number(result._httpStatus) >= 500;
export const requiresGardenReload = error => ['CLIENT_UPDATE_REQUIRED', 'GARDEN_R2_CLIENT_UPDATE_REQUIRED', 'GARDEN_R2_VERSION_UNSUPPORTED'].includes(error);
export const isGardenR2Retryable = result => !requiresGardenReload(result?.error) && (['NETWORK_ERROR', 'TIMEOUT', 'GARDEN_R2_REQUEST_UNCONFIRMED', 'GARDEN_REQUEST_UNCONFIRMED', 'GARDEN_R2_REVISION_CONFLICT'].includes(result?.error) || Number(result?._httpStatus) >= 500);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
export async function hashGardenR2Payload(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonical(payload)));
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
}
/** One durable account-scoped intent, written before sending. No new command is
 * queued behind unresolved money; a recovered command is returned on its own. */
export function createGardenR2Coordinator({ accountId, storage, transport, reconcile, now = Date.now, uuid = () => globalThis.crypto.randomUUID(), hash = hashGardenR2Payload, withLock = fn => fn(), isCurrentAccount = () => true }) {
  if (!accountId) throw Error('Garden R2 requires a verified account');
  const key = `game_hub_garden_r2_intents_v1:${encodeURIComponent(accountId)}`;
  let tail = Promise.resolve();
  const read = () => {
    const raw = storage.getItem(key);
    if (!raw) return { version: 1, accountId, streamId: uuid(), nextSequence: 1, pending: null };
    const record = JSON.parse(raw);
    if (record.version !== 1 || record.accountId !== accountId || !/^[a-zA-Z0-9_-]{16,64}$/.test(record.streamId) || !Number.isSafeInteger(record.nextSequence) || record.nextSequence < 1) throw Error('Invalid Garden R2 journal');
    if (record.pending && (record.pending.payload?.accountId !== accountId || record.pending.payload.intent?.streamId !== record.streamId || record.pending.payload.intent?.sequence !== record.nextSequence || record.pending.clientActionId !== `garden-r2:${record.streamId}:${record.nextSequence}` || !/^[0-9a-f]{64}$/.test(record.pending.payloadHash))) throw Error('Invalid Garden R2 pending intent');
    return record;
  };
  const save = record => storage.setItem(key, JSON.stringify(record));
  const serial = fn => {
    const job = tail.catch(() => {}).then(() => withLock(fn)).catch(() => problem('GARDEN_R2_STORAGE_UNAVAILABLE'));
    tail = job; return job;
  };
  const acknowledge = (record, result) => {
    if (!isCurrentAccount() || result?.error || result?.pending || result?.receiptConfirmed !== true || result.clientActionId !== record.pending.clientActionId) return false;
    record.nextSequence++; record.pending = null; save(record); return true;
  };
  async function send(record) {
    if (!isCurrentAccount()) return problem('GARDEN_R2_ACCOUNT_CHANGED');
    if (!record.pending) return { success: true, noPending: true };
    const pending = record.pending;
    if (await hash(pending.payload) !== pending.payloadHash) return problem('GARDEN_R2_INTENT_CONFLICT');
    if (now() - pending.payload.intent.createdAt > GARDEN_R2_RECEIPT_WINDOW_MS) {
      let status;
      try { status = await reconcile({ accountId, streamId: pending.payload.intent.streamId, sequence: pending.payload.intent.sequence, clientActionId: pending.clientActionId, payloadHash: pending.payloadHash }); }
      catch { return problem('NETWORK_ERROR'); }
      if (!isCurrentAccount()) return problem('GARDEN_R2_ACCOUNT_CHANGED');
      if (acknowledge(record, status)) return status;
      if (status?.error || status?.applied !== false || status.receiptConfirmed !== true || status.expectedSequence !== pending.payload.intent.sequence) return status?.error ? status : problem('GARDEN_R2_INTENT_AMBIGUOUS');
      if (pending.payload.intent.sequence === 1) {
        // Durable server stream tombstones are never evicted: an absent first
        // sequence is proof of non-application, and its expired timestamp can no
        // longer commit. Archive the evidence before minting a fresh identity.
        const streamId = uuid();
        if (streamId === record.streamId || !/^[a-zA-Z0-9_-]{16,64}$/.test(streamId)) return problem('GARDEN_R2_STORAGE_UNAVAILABLE');
        storage.setItem(`${key}:archive:${pending.clientActionId}`, JSON.stringify({ accountId, archivedAt: now(), reason: 'proven-not-applied-expired', pending }));
        const payload = { ...pending.payload, intent: { streamId, sequence: 1, createdAt: Math.floor(now()) } };
        record.streamId = streamId; record.nextSequence = 1;
        record.pending = { payload, payloadHash: await hash(payload), clientActionId: `garden-r2:${streamId}:1` };
        save(record);
        return send(record);
      }
    }
    let result;
    try { result = await transport('garden.r2', pending.payload, { clientActionId: pending.clientActionId, durability: 'receipt', outbox: false, key: pending.clientActionId }); }
    catch { return problem('NETWORK_ERROR'); }
    if (!isCurrentAccount()) return problem('GARDEN_R2_ACCOUNT_CHANGED');
    if (acknowledge(record, result)) return result;
    if (!result?.error || result.pending) return problem('GARDEN_R2_REQUEST_UNCONFIRMED');
    if (!uncertain(result)) { record.pending = null; save(record); }
    return result;
  }
  return {
    key, inspect: read,
    recover: () => serial(() => send(read())),
    execute: (command, input = {}, expectedRevision = 0) => serial(async () => {
      if (!isCurrentAccount()) return problem('GARDEN_R2_ACCOUNT_CHANGED');
      const record = read();
      if (record.pending) return { ...await send(record), recoveredIntent: true };
      const payload = { version: 1, catalogRevision: GARDEN_R2_CATALOG_REVISION, accountId, command, input: structuredClone(input), expectedRevision, intent: { streamId: record.streamId, sequence: record.nextSequence, createdAt: Math.floor(now()) } };
      record.pending = { payload, payloadHash: await hash(payload), clientActionId: `garden-r2:${record.streamId}:${record.nextSequence}` };
      save(record);
      return send(record);
    }),
  };
}
export function getGardenR2Coordinator(accountId, transport, reconcile, isCurrentAccount, readServerTime = () => Date.now()) {
  if (!accountId) return null;
  if (coordinators.has(accountId)) return coordinators.get(accountId);
  const storage = { getItem: key => globalThis.localStorage.getItem(key), setItem: (key, value) => globalThis.localStorage.setItem(key, value) };
  const withLock = globalThis.navigator?.locks?.request ? fn => globalThis.navigator.locks.request(`garden-r2-accounting:${accountId}`, fn) : () => problem('GARDEN_R2_CROSS_TAB_LOCK_UNAVAILABLE');
  let serverAnchor = Number(readServerTime()) || Date.now(), localAnchor = performance.now();
  const now = () => {
    const stamp = Number(readServerTime());
    if (Number.isFinite(stamp) && stamp !== serverAnchor) { serverAnchor = stamp; localAnchor = performance.now(); }
    return Math.floor(serverAnchor + Math.max(0, performance.now() - localAnchor));
  };
  const coordinator = createGardenR2Coordinator({ accountId, storage, transport, reconcile, isCurrentAccount, now, withLock });
  coordinators.set(accountId, coordinator); return coordinator;
}
