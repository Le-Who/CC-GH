import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-rebase-shared.test.mjs",import.meta.url));
