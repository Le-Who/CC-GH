import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL('../../../tests/merge-lab-transport.test.mjs',import.meta.url));
