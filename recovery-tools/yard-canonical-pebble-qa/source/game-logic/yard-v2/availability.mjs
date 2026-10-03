/** Bounded release capabilities, independent of catalog ownership or exact source prices.
 * Unavailable owned items remain recoverable. HTTP callers cannot override this policy. */
import {YARD_FOODS,YARD_GOODIES,YARD_REMODELS} from './catalog.mjs';
import {clone} from './util.mjs';
export const YARD_AVAILABILITY_REVISION='mika-persistent-food-bindings/r3';
const GOODS=new Set(['yarn_mouse','sun_cushion','leaf_pot']);
const unavailable=reason=>({ok:false,code:'YARD_BINDING_REQUIRED',reason});
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const ownBinding=(map,id)=>record(map)&&Object.hasOwn(map,id)&&record(map[id])?map[id]:null;
const stillId=value=>typeof value==='string'&&value.trim().length>0;
export function foodBindingReady(id,mediaRegistry) {
  const binding=ownBinding(mediaRegistry?.foodBindings,id);
  return Object.hasOwn(YARD_FOODS,id)&&binding?.presentationReady===true
    &&stillId(binding.filledStillId)&&stillId(binding.emptyStillId);
}
export function bowlBindingReady(id,mediaRegistry) {
  const binding=ownBinding(mediaRegistry?.bowlBindings,id),anchor=binding?.anchor;
  return binding?.presentationReady===true&&record(anchor)
    &&[anchor.x,anchor.y].every(v=>Number.isFinite(v)&&v>=0&&v<=100);
}
/** Shared by helper refill and visit admission. Saved data never grants a binding. */
export function foodRefillPolicy({foodId,bowl,mediaRegistry}) {
  if(!foodBindingReady(foodId,mediaRegistry))return unavailable('FOOD_PRESENTATION_UNAVAILABLE');
  if(!bowlBindingReady(bowl?.id,mediaRegistry))return unavailable('BOWL_PRESENTATION_UNAVAILABLE');
  return {ok:true};
}
export function goodieBindingReady(id,mediaRegistry) {
  return GOODS.has(id)&&(mediaRegistry?.bindings||[]).some(b=>b.goodieId===id&&b.playbackReady===true
    &&b.requiredPhases?.length&&b.requiredPhases.every(p=>b.validatedPhases?.includes(p)));
}
export function releaseActionPolicy({action,payload,player,mediaRegistry}) {
  if (['yard.buyFood','yard.setFood'].includes(action) && Object.hasOwn(YARD_FOODS,payload.foodId)
    && !foodBindingReady(payload.foodId,mediaRegistry)) return unavailable('FOOD_PRESENTATION_UNAVAILABLE');
  if(action==='yard.setFood'&&!bowlBindingReady(String(payload.bowlId||'bowl-1'),mediaRegistry))
    return unavailable('BOWL_PRESENTATION_UNAVAILABLE');
  if (['yard.buyGoodie','yard.placeGoodie'].includes(action) && !goodieBindingReady(payload.goodieId,mediaRegistry)) return unavailable('GOODIE_PRESENTATION_UNAVAILABLE');
  if (action==='yard.fixGoodie') {
    const p=player.yard.placedGoodies.find(p=>p.slotId===String(payload.slotId||'')||p.goodieId===payload.goodieId);
    if(p&&!goodieBindingReady(p.goodieId,mediaRegistry))return unavailable('GOODIE_PRESENTATION_UNAVAILABLE');
  }
  if (action==='yard.setRemodel' && payload.remodelId!=='meadow') return unavailable('REMODEL_PRESENTATION_UNAVAILABLE');
  if (action==='yard.buyExpansion') return unavailable('SECOND_BOWL_PRESENTATION_UNAVAILABLE');
  return {ok:true};
}
const capability=(ready,reason)=>({buy:ready,place:ready,fix:ready,...(ready?{}:{blockedReason:reason})});
export function supportedYardBindings(mediaRegistry) {
  const bowlIds=[...new Set(['bowl-1','bowl-2',...Object.keys(record(mediaRegistry?.bowlBindings)?mediaRegistry.bowlBindings:{})])];
  const anyBowlReady=bowlIds.some(id=>bowlBindingReady(id,mediaRegistry));
  return {
    revision:YARD_AVAILABILITY_REVISION,
    foods:Object.fromEntries(Object.keys(YARD_FOODS).map(id=>{
      const ready=foodBindingReady(id,mediaRegistry),binding=ownBinding(mediaRegistry?.foodBindings,id);
      return[id,{buy:ready,set:ready&&anyBowlReady,presentationReady:ready,
        ...(ready?{filledStillId:binding.filledStillId,emptyStillId:binding.emptyStillId}:{}),
        ...(!ready?{blockedReason:'FOOD_PRESENTATION_UNAVAILABLE'}:!anyBowlReady?{blockedReason:'BOWL_PRESENTATION_UNAVAILABLE'}:{})}];
    })),
    bowls:Object.fromEntries(bowlIds.map(id=>{
      const ready=bowlBindingReady(id,mediaRegistry);
      return[id,{set:ready,autoRefill:ready,presentationReady:ready,
        ...(ready?{anchor:clone(mediaRegistry.bowlBindings[id].anchor)}:{blockedReason:'BOWL_PRESENTATION_UNAVAILABLE'})}];
    })),
    goodies:Object.fromEntries(Object.keys(YARD_GOODIES).map(id=>[id,{...capability(goodieBindingReady(id,mediaRegistry),'GOODIE_PRESENTATION_UNAVAILABLE'),pickup:true,move:true,
      visitAdmission:'server-preflight',mediaBindings:(mediaRegistry?.bindings||[]).filter(b=>b.goodieId===id).map(b=>({id:b.id,visitorId:b.visitorId,activityIds:clone(b.activityIds),conditions:clone(b.conditions),playbackReady:b.playbackReady}))}])),
    remodels:Object.fromEntries(Object.keys(YARD_REMODELS).map(id=>[id,{select:id==='meadow',...(id==='meadow'?{}:{blockedReason:'REMODEL_PRESENTATION_UNAVAILABLE'})}])),
    expansion:{buy:false,blockedReason:'SECOND_BOWL_PRESENTATION_UNAVAILABLE'},
    inventoryOnly:['alchemy_living_arbor','alchemy_echo_chimes'],
    notes:['Availability does not remove ownership or authorize a visitor.','Existing placements are never relocated by this policy.'],
  };
}
// Explicit pure-test binding: never selected from payload, HTTP or a client feature flag.
export const sourceCatalogActionPolicy=()=>({ok:true});
