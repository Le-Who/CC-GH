// Network timing only: requests still reach the real fixture server and retain
// their original production response bytes, headers and service-worker rules.
export function createResourceGate() {
  let prefixes = [];
  const pending = new Set();
  const matches = (path, values) => values.some(prefix => path.startsWith(prefix));
  return {
    hold(values) { prefixes = [...new Set([...prefixes, ...values])]; },
    wait(path) {
      if (!matches(path, prefixes)) return Promise.resolve();
      return new Promise(resolve => pending.add({ path, resolve }));
    },
    release(values = prefixes) {
      prefixes = prefixes.filter(prefix => !values.includes(prefix));
      for (const request of pending) if (!matches(request.path, prefixes)) {
        pending.delete(request); request.resolve();
      }
    },
    pending() { return [...pending].map(request => request.path); },
  };
}
