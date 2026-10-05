import {sha256} from './sha256.mjs';
export const clone = value => structuredClone(value);
export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}
export const digest = value => sha256(canonical(value));
export const requireThat = (ok, message) => { if (!ok) throw new TypeError(message); };
export const finite = Number.isFinite;
export const near = (a, b) => Math.abs(a - b) <= 1e-6;
export const same = (a, b) => canonical(a) === canonical(b);
export const vec = value => Array.isArray(value) && value.length === 3 && value.every(finite);
export const add = (a, b) => a.map((n, i) => n + b[i]);
export const sub = (a, b) => a.map((n, i) => n - b[i]);
export const mul = (a, n) => a.map(v => v * n);
export const nearVec = (a, b) => vec(a) && vec(b) && a.every((n, i) => near(n, b[i]));
export const cardinal = radians => ((Math.round(radians / (Math.PI / 4)) % 8) + 8) % 8;
export const sourceAtMs = row => Math.round(row.time * 1000);
