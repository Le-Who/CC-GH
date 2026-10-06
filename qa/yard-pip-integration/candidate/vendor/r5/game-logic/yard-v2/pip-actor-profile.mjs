/** Closed Pip snack candidate. This module registers no actor. */
import {deepFreeze} from './util.mjs';
export const PIP_ACTOR_REFERENCE=deepFreeze({"id":"pip","revision":"pip-actor/r2-snack"});
export const PIP_ACTOR_PROFILE=deepFreeze({
  "id": "pip",
  "revision": "pip-actor/r2-snack",
  "visitorId": "pip_hamster",
  "playbackReady": true,
  "unitsPerWorld": 8,
  "sourceSampleMs": 40,
  "locomotion": {
    "revision": "pip-four-beat-walk/r1",
    "sampling": "authored-root-rows",
    "strideWorld": 0.24,
    "cycleMs": 800,
    "phaseSamples": [
      0,
      0.05,
      0.1,
      0.15,
      0.2,
      0.25,
      0.3,
      0.35,
      0.4,
      0.45,
      0.5,
      0.55,
      0.6,
      0.65,
      0.7,
      0.75,
      0.8,
      0.85,
      0.9,
      0.95
    ],
    "facings": [
      0,
      2,
      4,
      6
    ],
    "canonicalPhase": 0,
    "rampDistanceQuanta": 0,
    "rampReferenceSamples": 20,
    "turnRoutePreferenceMs": 320
  },
  "turns": {
    "durations": {
      "2": 1920,
      "4": 3840
    },
    "entryPhase": 0,
    "exitPhase": 0,
    "variants": [
      "0:-1:2",
      "0:1:2",
      "0:1:4",
      "2:-1:2",
      "2:1:2",
      "2:1:4",
      "4:-1:2",
      "4:1:2",
      "4:1:4",
      "6:-1:2",
      "6:1:2",
      "6:1:4"
    ]
  },
  "ground": {
    "revision": "pip-actual-ground/r1:00e99607038ae89eae12beffa75086316a7c25a5790e20cb95f29947a9f1b549",
    "phaseStarts": [
      0
    ]
  },
  "interactions": {
    "pip-snack-combined-r1": {
      "goodieId": "snack_table",
      "restMode": "anchored-composite",
      "restClipId": "pip-snack-combined-r1",
      "loop": {
        "startMs": 17920,
        "endMs": 19200,
        "frames": 32,
        "fps": 25
      }
    }
  }
});
export const PIP_RELEASE_GATE=deepFreeze({
  "accepted": true,
  "completed": [
    "independent-hamster-source",
    "own-40ms-locomotion-and-turns",
    "source-owned-snack-table",
    "solid-mesh-clearance-and-tabletop-support",
    "authored-back-away-and-rest-loop"
  ],
  "pending": [
    "candidate-full-visit-and-bounded-cache-browser-QA",
    "canonical-server-and-shared-scene-integration",
    "multi-actor-browser-QA",
    "worn-broken-and-other-legacy-interactions",
    "release-review"
  ]
});

export const PIP_MEDIA_REVISION="pip-snack-runtime/r1:4cbbc98b805e422520a08a3445df695305542776898bc42a7e46b6cc6ad447d1";
