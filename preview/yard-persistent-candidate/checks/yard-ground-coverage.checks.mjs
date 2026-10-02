import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-ground-coverage.test.mjs",import.meta.url));
