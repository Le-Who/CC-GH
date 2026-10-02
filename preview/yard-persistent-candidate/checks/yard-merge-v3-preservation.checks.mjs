import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-merge-v3-preservation.test.mjs",import.meta.url));
