import { get as idbGet, set as idbSet } from "idb-keyval";
import { shouldUseDurableOutbox } from "./reliableActions.js";

const LEGACY_KEY = "game_hub_yard_outbox_v1";
const key = accountId => `game_hub_yard_outbox_v2:${encodeURIComponent(accountId)}`;
let writes = Promise.resolve();
const revisions = new Map();

function localValue(name) {
  const raw = globalThis.localStorage?.getItem(name);
  return raw == null ? undefined : JSON.parse(raw);
}

function validEnvelope(value, accountId) {
  return value == null || (value.version === 2 && value.accountId === accountId && Array.isArray(value.items)
    && value.items.every(item => item?.accountId === accountId && typeof item.clientActionId === "string" && item.clientActionId
      && shouldUseDurableOutbox(item.action) && item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)));
}

export async function readYardOutbox(accountId) {
  await writes;
  let idbValue, fallbackValue, idbUnavailable = false;
  try { idbValue = await idbGet(key(accountId)); } catch { idbUnavailable = true; }
  try { fallbackValue = localValue(key(accountId)); } catch { return { error: "OUTBOX_STORAGE_INVALID" }; }
  // A legacy journal has no reliable owner. Retain both copies unchanged for
  // explicit recovery; never adopt it merely because an account logged in.
  const retainedLegacyOutbox = [];
  try { const legacy = await idbGet(LEGACY_KEY); if (legacy != null) retainedLegacyOutbox.push({ storage: "idb", value: legacy }); } catch {}
  try { const raw = globalThis.localStorage?.getItem(LEGACY_KEY); if (raw != null) retainedLegacyOutbox.push({ storage: "local", raw }); } catch {}
  const values = [idbValue, fallbackValue].filter(value => value != null);
  // An unreadable IDB journal may already contain intents. An empty fallback
  // is not evidence that it is safe to replace that journal with a new one.
  if (!values.length) return idbUnavailable ? { error: "OUTBOX_STORAGE_UNAVAILABLE", retainedLegacyOutbox } : { items: [], retainedLegacyOutbox };
  if (values.some(value => !validEnvelope(value, accountId))) {
    return { error: "OUTBOX_STORAGE_INVALID", retainedLegacyOutbox };
  }
  // Once fallback has been used it remains authoritative. Future writes update
  // it first, so a recovered but older IDB copy cannot hide a pending intent.
  const value = fallbackValue ?? idbValue;
  revisions.set(accountId, Math.max(revisions.get(accountId) || 0, value.revision || 0));
  return { items: value.items, retainedLegacyOutbox };
}

export function writeYardOutbox(accountId, items) {
  const envelope = structuredClone({ version: 2, accountId, items });
  const pending = writes.then(async () => {
    envelope.revision = (revisions.get(accountId) || 0) + 1;
    revisions.set(accountId, envelope.revision);
    let fallback;
    try { fallback = localValue(key(accountId)); }
    catch { return { error: "OUTBOX_STORAGE_INVALID" }; }
    let current, idbUnavailable = false;
    try { current = await idbGet(key(accountId)); } catch { idbUnavailable = true; }
    // A failed read is not an empty journal. Only a previously verified local
    // fallback may be updated; leave the unread IDB copy intact for recovery.
    if (idbUnavailable && fallback == null) return { error: "OUTBOX_STORAGE_UNAVAILABLE" };
    // Recheck before overwriting too: another client may have written a future
    // or foreign envelope after this session hydrated its cached journal.
    if (!validEnvelope(fallback, accountId) || !validEnvelope(current, accountId)) return { error: "OUTBOX_STORAGE_INVALID" };
    if (fallback != null) {
      try { localStorage.setItem(key(accountId), JSON.stringify(envelope)); }
      catch { return { error: "OUTBOX_STORAGE_UNAVAILABLE" }; }
      if (!idbUnavailable) { try { await idbSet(key(accountId), envelope); } catch {} }
      return { success: true };
    }
    try { await idbSet(key(accountId), envelope); }
    catch {
      try {
        if (!globalThis.localStorage) throw Error("No durable storage");
        localStorage.setItem(key(accountId), JSON.stringify(envelope));
      } catch { return { error: "OUTBOX_STORAGE_UNAVAILABLE" }; }
    }
    return { success: true };
  });
  writes = pending.then(() => {}, () => {});
  return pending;
}
