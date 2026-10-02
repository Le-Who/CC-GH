import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-persistent-presentation.test.mjs",import.meta.url));
