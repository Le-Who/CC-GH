import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-authored-stride.test.mjs",import.meta.url));
