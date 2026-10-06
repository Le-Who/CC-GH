/** Frozen reconstructed art contracts. Inventory is independent of release. */
import willowGround from './foxes-r2/willow-ground.json' with {type:'json'};
import willowStride from './foxes-r2/willow-stride.json' with {type:'json'};
import willowClips from './foxes-r2/willow-combined.json' with {type:'json'};
import starlitGround from './foxes-r2/starlit-ground.json' with {type:'json'};
import starlitStride from './foxes-r2/starlit-stride.json' with {type:'json'};
import starlitClips from './foxes-r2/starlit-combined.json' with {type:'json'};
import basilGround from './turtles-r2/basil-ground.json' with {type:'json'};
import basilStride from './turtles-r2/basil-stride.json' with {type:'json'};
import basilClips from './turtles-r2/basil-conditions.json' with {type:'json'};
import sageGround from './turtles-r2/sage-ground.json' with {type:'json'};
import sageStride from './turtles-r2/sage-stride.json' with {type:'json'};
import sageClips from './turtles-r2/sage-conditions.json' with {type:'json'};
import moon from './shared-props/r2-evidence/moon-source-identities.json' with {type:'json'};
import fountain from './shared-props/r2-evidence/fountain-source-contract.json' with {type:'json'};
import {deepFreeze} from '../util.mjs';
export const FAMILY_ACTOR_IDS=Object.freeze(['willow','starlit','basil','sage']);
export const FAMILY_ASSETS=deepFreeze({
 willow:{ground:willowGround,stride:willowStride,clips:willowClips,prop:moon,goodieId:'moon_lamp',family:'fox',activities:{peek:['willow-listen-new-r7','willow-listen-worn-r7','willow-listen-broken-r7']}},
 starlit:{ground:starlitGround,stride:starlitStride,clips:starlitClips,prop:moon,goodieId:'moon_lamp',family:'fox',activities:{watch:['starlit-watch-new-r6','starlit-watch-worn-r6','starlit-watch-broken-r6'],glow:['starlit-glow-new-r7']}},
 basil:{ground:basilGround,stride:basilStride,clips:basilClips,prop:fountain,goodieId:'fountain_bowl',family:'turtle',activities:{'watch-right':['basil-fountain-new','basil-fountain-worn','basil-fountain-broken']}},
 sage:{ground:sageGround,stride:sageStride,clips:sageClips,prop:fountain,goodieId:'fountain_bowl',family:'turtle',activities:{'watch-right':['sage-fountain-new','sage-fountain-worn','sage-fountain-broken']}},
});
