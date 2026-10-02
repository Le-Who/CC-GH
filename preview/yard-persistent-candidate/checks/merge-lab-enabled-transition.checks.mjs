import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/merge-lab-enabled-transition.test.mjs",import.meta.url));
