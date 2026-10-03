/** Source-owned foreign obstacle geometry. A saved object or HTTP payload cannot
 * mint a trusted context, alter a footprint, or authorize a missing source. */
import pip from './media/pip/snack-combined-binding.json' with {type:'json'};
import pebble from './media/pebble/combined-binding.json' with {type:'json'};
import {INTRINSIC_PROP_SOURCES,intrinsicPropReadiness} from './intrinsic-props.mjs';
import {YARD_GOODIES} from './catalog.mjs';
import {clone,deepFreeze,digest} from './util.mjs';
const minted=new WeakSet();
function contract(c,{min,max,padding=0}){
 const u=c.unitsPerWorld,r=c.propRoot;
 if(!Object.hasOwn(YARD_GOODIES,c.goodieId)||c.geometryValidated!==true||c.staticProp!==true||u!==8||!c.sourceRigSha256||!c.revision)throw Error('Validated catalog prop source required');
 const footprint={width:2*(Math.max(Math.abs(min[0]-r[0]),Math.abs(max[0]-r[0]))+padding)*u,height:2*(Math.max(Math.abs(min[1]-r[1]),Math.abs(max[1]-r[1]))+padding)*u};
 if(!Object.values(footprint).every(n=>Number.isFinite(n)&&n>0&&n<=100))throw Error('Finite source obstacle required');
 return deepFreeze({goodieId:c.goodieId,visitorId:c.visitorId,bindingId:c.id,bindingRevision:c.revision,sourceRigSha256:c.sourceRigSha256,conditions:['new'],rotationZ:0,footprint});
}
export const SOURCE_PROP_OBSTACLES=deepFreeze({
 snack_table:contract(pip,{min:pip.propEnvelope.minimum,max:pip.propEnvelope.maximum}),
 leaf_pot:contract(pebble,{min:pebble.propBounds.min,max:pebble.propBounds.max,padding:.025}),
});
/** Call only with the effective trusted server admission registry. No registry
 * field provides dimensions; all geometry above derives from immutable source. */
export function createTrustedObstacleContext(mediaRegistry){
 const props={};for(const [id,c]of Object.entries(SOURCE_PROP_OBSTACLES)){
  const matches=(mediaRegistry?.bindings||[]).filter(b=>b.id===c.bindingId&&b.visitorId===c.visitorId&&b.goodieId===id&&b.revision===c.bindingRevision&&b.playbackReady===true&&b.requiredPhases?.length&&b.requiredPhases.every(p=>b.validatedPhases?.includes(p))&&b.conditions?.includes('new'));
  if(matches.length===1)props[id]=c;
 }
 const intrinsic=intrinsicPropReadiness(mediaRegistry);Object.assign(props,intrinsic.props);
 const context=deepFreeze({format:'yard-trusted-source-obstacles/v1',revision:digest(props),props,...(Object.keys(intrinsic.props).length?{providerProofs:intrinsic.proofs}:{})});minted.add(context);return context;
}
export const obstacleContextRevision=context=>context===undefined?null:minted.has(context)?context.revision:'untrusted-obstacle-context';
export function planningSceneWithObstacles(baseScene,yard,context){
 if(context===undefined)return{ok:true,scene:baseScene,receipt:null};
 if(!minted.has(context))return{ok:false,code:'UNTRUSTED_PROP_OBSTACLE_CONTEXT'};
 if(!Object.keys(context.props).length)return{ok:true,scene:baseScene,receipt:null};
 if(!Array.isArray(yard?.placedGoodies))return{ok:false,code:'PLACEMENT_CALIBRATION_UNAVAILABLE'};
 const footprints={...baseScene.footprints},foreign=[];
 for(const p of yard.placedGoodies){
  const known=Object.hasOwn(baseScene.footprints||{},p?.goodieId),c=Object.hasOwn(context.props,p?.goodieId)?context.props[p.goodieId]:null;
  if(!c){if(known)continue;return{ok:false,code:'PROP_OBSTACLE_SOURCE_UNAVAILABLE'};}
  if(typeof p.slotId!=='string'||!p.slotId||![p.x,p.y].every(Number.isFinite)||p.condition!=='new'||(p.rotationZ??0)!==0)return{ok:false,code:'PROP_OBSTACLE_STATE_UNSUPPORTED'};
  if(known)continue;
  footprints[p.goodieId]=clone(c.footprint);foreign.push({slotId:p.slotId,goodieId:p.goodieId,x:p.x,y:p.y,condition:p.condition,rotationZ:0,
   ...(Object.hasOwn(INTRINSIC_PROP_SOURCES,p.goodieId)?{intrinsicIdentity:c.identity,sourceGeometrySha256:c.sourceGeometrySha256}:{bindingId:c.bindingId,bindingRevision:c.bindingRevision,sourceRigSha256:c.sourceRigSha256}),footprint:clone(c.footprint)});
 }
 if(!foreign.length)return{ok:true,scene:baseScene,receipt:null};
 // These immutable supplemental obstacles affect planning, never the old
 // authored actor/interaction calibration or the stored placement itself.
 const placements=yard.placedGoodies.map(p=>({slotId:p.slotId,goodieId:p.goodieId,x:p.x,y:p.y,condition:p.condition,rotationZ:p.rotationZ??0}));
 return{ok:true,scene:deepFreeze({...clone(baseScene),footprints}),receipt:deepFreeze({version:1,contextRevision:context.revision,placementHash:digest(placements),foreign})};
}
/** A changed foreign prop source must not silently reuse an old mixed route.
 * Old plans without this optional receipt retain their existing compatibility.
 * This check only controls presentation; saved economics are never changed. */
export function propObstacleReceiptCompatible(plan,mediaRegistry){
 if(!Object.hasOwn(plan||{},'obstacleReceipt'))return true;
 const r=plan.obstacleReceipt;if(r?.version!==1||!Array.isArray(r.foreign)||!r.foreign.length||!/^[a-f0-9]{64}$/.test(r.contextRevision)||!/^[a-f0-9]{64}$/.test(r.placementHash))return false;
 const context=createTrustedObstacleContext(mediaRegistry),slots=new Set();
 return r.foreign.every(row=>{
  const c=Object.hasOwn(context.props,row?.goodieId)?context.props[row.goodieId]:null;
  if(!c||typeof row.slotId!=='string'||!row.slotId||slots.has(row.slotId)||![row.x,row.y].every(Number.isFinite)||row.condition!=='new'||row.rotationZ!==0)return false;
  slots.add(row.slotId);const sourceMatches=Object.hasOwn(INTRINSIC_PROP_SOURCES,row.goodieId)
   ?row.intrinsicIdentity===c.identity&&row.sourceGeometrySha256===c.sourceGeometrySha256&&context.providerProofs?.[row.goodieId]?.length>0
   :row.bindingId===c.bindingId&&row.bindingRevision===c.bindingRevision&&row.sourceRigSha256===c.sourceRigSha256;
  return sourceMatches&&row.footprint?.width===c.footprint.width&&row.footprint?.height===c.footprint.height;
 });
}
