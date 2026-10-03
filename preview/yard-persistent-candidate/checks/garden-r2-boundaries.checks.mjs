import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL('../../../tests/garden-r2-routes.test.mjs',import.meta.url));
await import(new URL('../../../tests/garden-r2-store.test.mjs',import.meta.url));
