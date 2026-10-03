import { sha256 } from './sha256.mjs';
export const clone = (value) => structuredClone(value);
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export const digest = (value) => sha256(typeof value === 'string' ? value : canonical(value));
export function hash32(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
export const randomUnit = (seed) => (hash32(seed) % 100000) / 100000;
export const randomInt = (seed, lo, hi) => lo + hash32(seed) % (hi - lo + 1);
export const integer = (v) => Number.isSafeInteger(v) && v >= 0;
export function assertInteger(v, label) { if (!integer(v)) throw new TypeError(`${label} must be a nonnegative safe integer`); return v; }
export function addCount(map, id, amount) { put(map, id, assertInteger((lookup(map, id) || 0) + amount, `count ${id}`)); if (!map[id]) delete map[id]; }
export const legacyGiftId = (visit) => `gift_${visit.leavesAt.toString(36)}_${hash32(visit.visitId).toString(36)}`;

export const own = (object, key) => Object.hasOwn(object || {}, key);
export const lookup = (object, key) => own(object, key) ? object[key] : undefined;
export function put(object, key, value) { Object.defineProperty(object, key, { value, writable: true, enumerable: true, configurable: true }); return value; }
export const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
export function workingCopy(state) { return { ...state, player: clone(state.player), runtime: clone(state.runtime), migration: state.migration }; }
