import { createGardenPreviewPlayer } from './fixtures.js';
import { isGardenPreviewRequest } from './request-policy.js';
import { GARDEN_PREVIEW_VERSION } from './version.js';

export const GARDEN_PREVIEW_NOTICE = 'LOCAL GARDEN SIMULATION: rewards and saves live only in memory; nothing reaches a server.';
export function createGardenPreviewBackend({ applyAction, buildSnapshot, fixture = 'progress', forceError = false, now = Date.now } = {}) {
  const player = createGardenPreviewPlayer(fixture, now());
  const receipts = new Map();
  const pending = new Map();
  const tag = value => ({ ...value, _offlinePreview: true, _previewNotice: GARDEN_PREVIEW_NOTICE });
  const copy = value => structuredClone(value);
  return {
    async request(path, body) {
      if (!isGardenPreviewRequest(path, body)) return tag({ error: 'GARDEN_PREVIEW_ENDPOINT_BLOCKED', _httpStatus: 403 });
      if (path === '/api/config') return tag({ devAuthEnabled: false, buildId: GARDEN_PREVIEW_VERSION, appVersion: 'GARDEN LOCAL DEMO' });
      // Explicit launcher-only failure injection never modifies engine behavior.
      if (forceError) return tag({ error: 'GARDEN_PREVIEW_FORCED_ERROR: developer fixture; choose a normal fixture or clear forced error in the launcher', _httpStatus: 503 });
      if (path === '/api/player/snapshot') return copy(tag(buildSnapshot(player)));
      const { action, payload = {}, clientActionId } = body;
      const fingerprint = JSON.stringify({ action, payload });
      if (clientActionId && receipts.has(clientActionId)) {
        const receipt = receipts.get(clientActionId);
        return receipt.fingerprint === fingerprint
          ? copy(tag({ ...receipt.body, snapshot: buildSnapshot(player), duplicate: true }))
          : tag({ error: 'Local Garden action conflict', _httpStatus: 409 });
      }
      if (clientActionId && pending.has(clientActionId)) {
        const previous = pending.get(clientActionId);
        if (previous.fingerprint !== fingerprint) return tag({ error: 'Local Garden action conflict', _httpStatus: 409 });
        const result = await previous.promise;
        return copy(result.error ? result : { ...result, snapshot: buildSnapshot(player), duplicate: true });
      }
      const run = async () => {
        const result = await applyAction(player, action, copy(payload), { now: now(), yardNow: now() });
        if (result.status === 200 && clientActionId) {
          receipts.set(clientActionId, { fingerprint, body: copy(result.body) });
          if (receipts.size > 200) receipts.delete(receipts.keys().next().value);
        }
        return copy(tag({ ...result.body, ...(result.status !== 200 ? { _httpStatus: result.status } : {}) }));
      };
      const promise = run();
      if (clientActionId) pending.set(clientActionId, { fingerprint, promise });
      try { return await promise; }
      finally { if (clientActionId) pending.delete(clientActionId); }
    },
  };
}
