import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL('../../../tests/yard-intrinsic-prop-identity.test.mjs',import.meta.url));
