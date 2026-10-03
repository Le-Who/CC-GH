import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL('../../../tests/realtime-account-boundaries.test.mjs',import.meta.url));
