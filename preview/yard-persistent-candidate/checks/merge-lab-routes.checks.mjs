import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/merge-lab-routes.test.mjs",import.meta.url));
