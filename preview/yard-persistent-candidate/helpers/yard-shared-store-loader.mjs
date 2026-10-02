if(process.env.YARD_CANDIDATE_CI!=='1'||process.env.NODE_ENV!=='test')throw new Error('Explicit candidate test mode required');
/** Dependency-free tests execute the real stores and API client. This small vanilla
 * store substitute covers get/set/subscribe only; it does not validate React/Zustand
 * rendering. IDB is deliberately unavailable so the real localStorage fallback runs.
 * Fetch is closed by default; individual tests must supply an in-memory response. */
import { registerHooks } from 'node:module';
globalThis.fetch = async () => { throw new Error('Network forbidden in shared-store test'); };
const sources = {
  zustand: `export function create(initialize) {
    let state; const listeners = new Set();
    const getState = () => state;
    const setState = (partial, replace) => {
      const next = typeof partial === 'function' ? partial(state) : partial;
      if (Object.is(next, state)) return;
      const previous = state;
      state = (replace ?? (typeof next !== 'object' || next === null)) ? next : Object.assign({}, state, next);
      for (const listener of listeners) listener(state, previous);
    };
    const store = selector => selector ? selector(state) : state;
    Object.assign(store, { getState, setState, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); } });
    state = initialize(setState, getState, store); return store;
  }`,
  idb: `export async function get(){throw Error('IDB unavailable');} export async function set(){throw Error('IDB unavailable');}`,
  audio: `export const audioManager = {play(){}};`,
  telegram: `export function haptic(){} export function getTelegramAuthData(){return '';}`,
};
registerHooks({
  resolve(specifier, context, next) {
    const key = specifier === 'zustand' ? 'zustand' : specifier === 'idb-keyval' ? 'idb'
      : /\/audioManager\.js$/.test(specifier) ? 'audio' : /\/platform\/telegram\.js$/.test(specifier) ? 'telegram' : null;
    return key ? {shortCircuit:true,url:`yard-shared-test:${key}`} : next(specifier, context);
  },
  load(url, context, next) {
    return url.startsWith('yard-shared-test:') ? {shortCircuit:true,format:'module',source:sources[url.slice('yard-shared-test:'.length)]} : next(url, context);
  },
});
