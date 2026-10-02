// Match the real Garden GameProvider <-> hub action bridge exactly.
export const GARDEN_ACTIONS = Object.freeze([
  'garden.goldDelta', 'garden.sync', 'garden.resetEconomy', 'garden.levelUp',
]);
const READ_PATHS = new Set(['/api/config', '/api/player/snapshot']);
export const isGardenPreviewRequest = (path, body) => READ_PATHS.has(path) || (
  path === '/api/player/mutate' && GARDEN_ACTIONS.includes(body?.action)
);
export const isGardenAssetRequest = (input, init = {}, origin) => {
  try {
    const value = typeof input === 'string' || input instanceof URL ? input : input.url;
    const url = new URL(value, origin);
    const method = String(init?.method || input?.method || 'GET').toUpperCase();
    return method === 'GET' && url.origin === origin && !url.username && !url.password && (
      /^\/assets\/[a-zA-Z0-9_/-]+\.(?:js|css|woff2|mp3|ogg|wav|m4a)$/.test(url.pathname) ||
      /^\/(?:assets|assets-runtime)\/manifest\.json$/.test(url.pathname) ||
      /^\/games\/garden-v2\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.webp$/i.test(url.pathname) ||
      url.pathname === '/games/garden-shelf/assets_transparent.png'
    );
  } catch { return false; }
};
