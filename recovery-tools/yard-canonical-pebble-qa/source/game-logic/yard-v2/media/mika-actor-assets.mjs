/** Frozen source descriptors for the one currently validated actor. */
import clips from './clip-contracts.json' with {type:'json'};
import turns from './turn-contracts.json' with {type:'json'};
import contract from './ground-footprints.json' with {type:'json'};
import { GROUND_REST } from './ground-rest.mjs';
import { SETTLED_MOUSE } from './settled-mouse.mjs';
import { MIKA_ACTOR_PROFILE } from '../actor-profiles.mjs';
import { deepFreeze } from '../util.mjs';
export const MIKA_ACTOR_ASSETS=deepFreeze({clips,turns,groundRest:GROUND_REST,settledMouse:SETTLED_MOUSE,
  groundFootprints:{revision:MIKA_ACTOR_PROFILE.ground.revision,contract}});
