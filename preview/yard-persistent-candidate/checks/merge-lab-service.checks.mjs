import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/merge-lab-service.test.mjs",import.meta.url));
