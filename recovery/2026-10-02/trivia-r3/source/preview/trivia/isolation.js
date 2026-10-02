import { installIsolation } from '../isolation.js';

export function installTriviaIsolation(target = window) {
  if (target.location.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.location.hostname)) {
    throw new Error('Trivia preview requires its loopback HTTP static server on port 4185. See the launcher README.');
  }
  installIsolation(target);
  // The real data adapters already use Maps. Fail closed on accidental direct
  // browser persistence so future presentation code cannot escape that contract.
  for (const name of ['indexedDB', 'caches']) {
    Object.defineProperty(target, name, { value: undefined, configurable: false, writable: false });
  }
  if (target.navigator.serviceWorker) {
    Object.defineProperty(target.navigator.serviceWorker, 'register', {
      value: () => Promise.reject(new Error('OFFLINE_PREVIEW_PERSISTENCE_BLOCKED')),
      configurable: false,
      writable: false,
    });
  }
  if (target.document) {
    Object.defineProperty(target.document, 'cookie', { get: () => '', set: () => {}, configurable: false });
  }
}
