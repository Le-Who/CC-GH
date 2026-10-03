import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-mochi-combined.test.mjs",import.meta.url));
