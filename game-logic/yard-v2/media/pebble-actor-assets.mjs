import combined from './pebble/combined-binding.json' with {type:'json'};
import stride from './pebble/authored-stride.json' with {type:'json'};
import ground from './pebble/ground-motion.json' with {type:'json'};
import {deepFreeze} from '../util.mjs';
export const PEBBLE_ACTOR_ASSETS=deepFreeze({combined,stride,ground});
