import { installIsolation } from '../isolation.js';
import { isGardenAssetRequest } from './request-policy.js';
export function installGardenIsolation(target = window) {
  if (target.location.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(target.location.hostname)) {
    throw new Error('Garden preview requires its loopback HTTP static server. See the launcher README.');
  }
  installIsolation(target);
  const fetch = target.fetch.bind(target);
  target.fetch = (input, init) => isGardenAssetRequest(input, init, target.location.origin)
    ? fetch(input, init)
    : Promise.reject(new Error('GARDEN_PREVIEW_NETWORK_BLOCKED'));
  const open = target.XMLHttpRequest.prototype.open;
  target.XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (!isGardenAssetRequest(url, { method }, target.location.origin)) throw new Error('GARDEN_PREVIEW_NETWORK_BLOCKED');
    return open.call(this, method, url, ...rest);
  };
  for (const name of ['indexedDB', 'caches']) Object.defineProperty(target, name, { value: undefined, configurable: false, writable: false });
  if (target.navigator.serviceWorker) Object.defineProperty(target.navigator.serviceWorker, 'register', {
    value: () => Promise.reject(new Error('GARDEN_PREVIEW_PERSISTENCE_BLOCKED')), configurable: false, writable: false,
  });
  if (target.document) Object.defineProperty(target.document, 'cookie', { get: () => '', set: () => {}, configurable: false });
}
