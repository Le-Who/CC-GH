import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-authored-routes.test.mjs",import.meta.url));
