import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/garden-accounting-routes.test.js",import.meta.url));
