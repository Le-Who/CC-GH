import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-mochi-presentation.test.mjs",import.meta.url));
