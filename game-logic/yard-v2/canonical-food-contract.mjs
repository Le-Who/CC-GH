/** Derived authoritative food state. Loaded only with Yard geometry. */
export * from './canonical-food-protocol.mjs';
import {CANONICAL_FOOD_CONTRACT as descriptor,CANONICAL_FOOD_LOCATION,canonicalFoodOverlap} from './canonical-food-protocol.mjs';
import itemProtocol from './canonical-item-protocol.json' with {type:'json'};
import {integer} from './util.mjs';
import {canonicalStorageValid} from './canonical-locations.mjs';
const same=(value,scope)=>Object.entries(scope).every(([k,v])=>value?.[k]===v);
/** Fixed gameplay geometry deliberately is not a draggable HUD/legacy yardBowls anchor. */
export function selectCanonicalFoodState(snapshot){
 const no=(reason,extra={})=>({available:false,state:null,reason,...extra});
 const runtime=snapshot?.yardRuntime,cap=runtime?.foodLocationCapabilities;
 if(runtime?.version!==1||runtime.status!=='ready'||runtime.error||!same(cap,CANONICAL_FOOD_LOCATION)
  ||cap.descriptorId!==descriptor.id||cap.enabled!==true||cap.coordinateSpace!==descriptor.coordinateSpace
  ||cap.presentationReady!==false||cap.runtimeActivated!==false||cap.visitAdmission!==false||!same(cap.storageLocation,itemProtocol.location))return no('CANONICAL_FOOD_LOCATION_DISABLED');
 const rows=runtime.canonicalPlacements;
 if(!canonicalStorageValid(rows,snapshot?.yard?.placedGoodies||[]))return no('CANONICAL_AUTHORITATIVE_LAYOUT_INVALID');
 const occupiedSlotIds=rows.filter(p=>canonicalFoodOverlap(p.x,p.y)).map(p=>p.slotId);
 if(occupiedSlotIds.length)return no('CANONICAL_FOOD_SOCKET_OCCUPIED',{occupiedSlotIds});
 const bowls=snapshot?.yard?.bowls;
 if(!Array.isArray(bowls))return no('CANONICAL_BOWL_UNAVAILABLE');
 const matches=bowls.filter(b=>b?.id===descriptor.bowlId);
 if(matches.length!==1)return no(matches.length?'CANONICAL_BOWL_DUPLICATE':'CANONICAL_BOWL_UNAVAILABLE');
 const bowl=matches[0],foodId=bowl.foodId;
 // Never turn an unknown, malformed or stale filled state into supported empty art.
 if(foodId===null&&bowl.servings===0)return {available:true,state:'empty',bowlId:descriptor.bowlId,socketId:descriptor.socketId};
 if(!['kibble','berry_plate','bonito_bowl'].includes(foodId))return no('CANONICAL_FOOD_UNSUPPORTED');
 if(!integer(bowl.servings)||bowl.servings<1||!integer(bowl.placedAt)||!integer(bowl.expiresAt)||bowl.expiresAt<=bowl.placedAt)return no('CANONICAL_BOWL_STATE_INVALID');
 return {available:true,state:foodId,bowlId:descriptor.bowlId,socketId:descriptor.socketId};
}
