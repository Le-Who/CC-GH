import combined from './pip/snack-combined-binding.json' with {type:'json'};
import stride from './pip/authored-stride.json' with {type:'json'};
import ground from './pip/ground-motion.json' with {type:'json'};
import {deepFreeze} from '../util.mjs';
export const PIP_ACTOR_ASSETS=deepFreeze({combined,stride,ground});
