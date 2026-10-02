import {requireCandidateMode} from '../guard.mjs';
requireCandidateMode();
await import(new URL("../../../tests/yard-presentation-compatibility.test.mjs",import.meta.url));
