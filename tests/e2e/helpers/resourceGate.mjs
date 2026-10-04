// Network timing only: requests still reach the real fixture server and retain
// their original production response bytes, headers and service-worker rules.
// One delayed image leaves HTTP/1.1 connections for fonts, modules and APIs.
export const ART_RESPONSE_HOLD_LIMIT = 1;
const imagePath = path => /\.(?:png|webp|avif|gif|jpe?g|svg)$/i.test(path);
export function createResourceGate() {
  let prefixes = [], artPrefixes = [];
  const pending = new Set();
  const matches = (path, values) => values.some(prefix => path.startsWith(prefix));
  return {
    hold(values) { prefixes = [...new Set([...prefixes, ...values])]; },
    holdArt(values) { artPrefixes = [...new Set([...artPrefixes, ...values])]; },
    wait(path) {
      const kind = matches(path, prefixes) ? 'explicit'
        : imagePath(path) && matches(path, artPrefixes)
          && [...pending].filter(request => request.kind === 'art').length < ART_RESPONSE_HOLD_LIMIT ? 'art' : null;
      if (!kind) return Promise.resolve();
      return new Promise(resolve => pending.add({ path, kind, resolve }));
    },
    release(values = [...prefixes, ...artPrefixes]) {
      prefixes = prefixes.filter(prefix => !values.includes(prefix));
      artPrefixes = artPrefixes.filter(prefix => !values.includes(prefix));
      for (const request of pending) if (!matches(request.path, request.kind === 'art' ? artPrefixes : prefixes)) {
        pending.delete(request); request.resolve();
      }
    },
    pending() { return [...pending].map(request => request.path); },
  };
}
