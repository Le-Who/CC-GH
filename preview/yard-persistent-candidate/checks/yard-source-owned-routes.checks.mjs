import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-source-owned-routes.test.mjs",import.meta.url));
