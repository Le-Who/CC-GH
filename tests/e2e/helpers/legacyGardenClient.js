/** Test-only model of a cached client that does not understand R2 discovery.
 * Requests, mutations, receipts, errors and all economic data remain real.
 * An adopted or blocked R2 projection is never hidden. No production imports. */
export function installLegacyGardenDiscoveryBridge() {
  if (globalThis.fetch.legacyGardenDiscoveryBridge) return;
  const originalFetch = globalThis.fetch.bind(globalThis);
  const hideDiscovery = snapshot => snapshot?.player?.id && snapshot.gardenR2 === null
    && snapshot.gardenR2Available === true ? { ...snapshot, gardenR2Available: false } : snapshot;
  const fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = new URL(typeof args[0] === 'string' || args[0] instanceof URL ? args[0] : args[0].url, location.href);
    if (url.origin !== location.origin || !['/api/player/snapshot', '/api/player/mutate'].includes(url.pathname)) return response;
    let body;
    try { body = await response.clone().json(); } catch { return response; }
    const next = url.pathname === '/api/player/snapshot' ? hideDiscovery(body)
      : body?.snapshot && hideDiscovery(body.snapshot) !== body.snapshot ? { ...body, snapshot: hideDiscovery(body.snapshot) } : body;
    if (next === body) return response;
    const headers = new Headers(response.headers);
    headers.delete('content-length'); headers.delete('content-encoding');
    return new Response(JSON.stringify(next), { status: response.status, statusText: response.statusText, headers });
  };
  fetch.legacyGardenDiscoveryBridge = true;
  globalThis.fetch = fetch;
}

export const useLegacyGardenClient = page => page.addInitScript(installLegacyGardenDiscoveryBridge);
