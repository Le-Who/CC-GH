import combined from './mochi/combined-binding.json' with {type:'json'};
import stride from './mochi/authored-stride.json' with {type:'json'};
import ground from './mochi/ground-motion.json' with {type:'json'};
import {deepFreeze} from '../util.mjs';
export const MOCHI_ACTOR_ASSETS=deepFreeze({combined,stride,ground});
