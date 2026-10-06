import combined from './media/pip/snack-combined-binding.json' with {type:'json'};
import {deepFreeze} from './util.mjs';
const b=combined.propEnvelope,r=combined.propRoot,u=combined.unitsPerWorld;
export const PIP_PROP_PROFILE=deepFreeze({goodieId:'snack_table',stillId:'pip:target-snack-table',conditions:['new'],rotationZ:0,
 footprint:{width:2*Math.max(Math.abs(b.minimum[0]-r[0]),Math.abs(b.maximum[0]-r[0]))*u,height:2*Math.max(Math.abs(b.minimum[1]-r[1]),Math.abs(b.maximum[1]-r[1]))*u}});
