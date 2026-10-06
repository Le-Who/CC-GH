import clips from './clip-contracts.json' with { type: 'json' };
import { SETTLED_MOUSE } from './settled-mouse.mjs';
export const MIKA_CLIPS = Object.freeze({ ...clips, ...(SETTLED_MOUSE ? { [SETTLED_MOUSE.id]: SETTLED_MOUSE } : {}) });
