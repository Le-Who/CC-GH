import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-pebble-fixture-path.test.mjs",import.meta.url));
