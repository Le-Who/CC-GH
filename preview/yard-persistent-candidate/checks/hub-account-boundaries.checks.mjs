import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL('../../../tests/hub-account-boundaries.test.mjs',import.meta.url));
