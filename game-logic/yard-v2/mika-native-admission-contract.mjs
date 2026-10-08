/** Identity inspection for decoded JSON/data objects only. Even a recognized
 * descriptor is unqualified for saved visits. No planner, replay, persistence,
 * or enable option exists. JavaScript Proxies are outside this input contract:
 * reflection can execute their traps; this is not a hostile-object sandbox. */
import {MIKA_NATIVE_PROFILE} from './mika-native-profile.mjs';

// Traverse only the fixed expected shape, never stringify or clone caller data.
// This rejects extra fields, accessors, symbols, custom prototypes and cycles
// without evaluating getters or accepting client-supplied activation flags.
function exactDescriptor(value, expected) {
  if (expected === null || typeof expected !== 'object') return value === expected;
  if (value === null || typeof value !== 'object') return false;
  const array = Array.isArray(expected), proto = Object.getPrototypeOf(value);
  if (array ? !Array.isArray(value) || proto !== Array.prototype
    : Array.isArray(value) || (proto !== Object.prototype && proto !== null)) return false;
  const keys = Reflect.ownKeys(value), expectedKeys = Reflect.ownKeys(expected);
  if (keys.length !== expectedKeys.length || keys.some(key => !expectedKeys.includes(key))) return false;
  return expectedKeys.every(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value')
      && (descriptor.enumerable || (array && key === 'length'))
      && exactDescriptor(descriptor.value, expected[key]);
  });
}

export function validateMikaNativeIdentity(input) {
  let recognized = false;
  try {
    recognized = exactDescriptor(input, {
      identity: MIKA_NATIVE_PROFILE.identity, sources: MIKA_NATIVE_PROFILE.sources,
      geometry: MIKA_NATIVE_PROFILE.geometry, binding: null,
    });
  } catch { /* Uninspectable values are never an identity or admission. */ }
  return Object.freeze({identityRecognized: recognized,
    code: recognized ? 'MIKA_NATIVE_IDENTITY_RECOGNIZED' : 'MIKA_NATIVE_IDENTITY_MISMATCH'});
}

export function evaluateMikaNativeAdmission(input) {
  const identity = validateMikaNativeIdentity(input);
  return Object.freeze({
    state: 'unqualified', identityRecognized: identity.identityRecognized,
    code: identity.identityRecognized ? 'MIKA_NATIVE_SAVED_VISIT_UNQUALIFIED' : identity.code,
    prepared: false, ready: false, admission: false, savedVisitReady: false, admissionEnabled: false,
  });
}
