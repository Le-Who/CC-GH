import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-mochi-scene-lifecycle.test.mjs",import.meta.url));
