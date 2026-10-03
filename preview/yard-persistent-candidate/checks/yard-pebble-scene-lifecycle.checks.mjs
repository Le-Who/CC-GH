import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-pebble-scene-lifecycle.test.mjs",import.meta.url));
