/** Source-only native Mika identity. This does not register an actor, authorize
 * a visit, or adapt the existing Pip saved planner. No runtime entry imports it. */
import manifest from './mika-native-sources.json' with {type: 'json'};
import {deepFreeze, digest} from './util.mjs';

export const MIKA_NATIVE_SOURCES = deepFreeze(manifest);
export const MIKA_NATIVE_SOURCE_HASH = digest(MIKA_NATIVE_SOURCES);
export const MIKA_NATIVE_PROFILE = deepFreeze({
  identity: {
    profileId: 'native-mika-p2/r1', visitorId: 'mika_cat', actorId: 'Mika-P2',
    modelSha256: '2249774f8ced124451d3c46a8a69bc06a9889c7d9cc31c836a6dd868fd96f084',
    modelBytes: 3671320, boneCount: 22, rootOwner: 'navigation', unitsPerSource: 8,
  },
  sources: Object.fromEntries(MIKA_NATIVE_SOURCES.sources.map(({role, sha256}) => [role, sha256])),
  geometry: {id: 'released-meadow-mask/v1', domain: {min: [0, 0], max: [100, 100]}, unitsPerSource: 8},
  qualification: {
    scope: 'finite-qa-cruise-only', format: 'mika-normal-yard-qa-cruise/v1', durationSeconds: 4,
    savedPlanSerializable: false, arbitraryNavigation: false, actionTransitions: false,
  },
  savedVisitReady: false,
  admissionEnabled: false,
  supportedSavedBindings: [],
});
