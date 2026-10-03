import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-atlas-working-set.test.mjs",import.meta.url));
