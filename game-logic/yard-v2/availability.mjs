/** Bounded release capabilities, independent of catalog ownership or exact source prices.
 * Unavailable owned items remain recoverable. HTTP callers cannot override this policy. */
import {YARD_FOODS,YARD_GOODIES,YARD_REMODELS} from './catalog.mjs';
import {clone} from './util.mjs';
export const YARD_AVAILABILITY_REVISION='mika-persistent-bindings/r1';
const GOODS=new Set(['yarn_mouse','sun_cushion']);
const unavailable=reason=>({ok:false,code:'YARD_BINDING_REQUIRED',reason});
export function goodieBindingReady(id,mediaRegistry) {
  return GOODS.has(id)&&(mediaRegistry?.bindings||[]).some(b=>b.goodieId===id&&b.playbackReady===true
    &&b.requiredPhases?.length&&b.requiredPhases.every(p=>b.validatedPhases?.includes(p)));
}
export function releaseActionPolicy({action,payload,player,mediaRegistry}) {
  if (['yard.buyFood','yard.setFood'].includes(action) && Object.hasOwn(YARD_FOODS,payload.foodId) && payload.foodId!=='kibble') return unavailable('FOOD_PRESENTATION_UNAVAILABLE');
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
  return {
    revision:YARD_AVAILABILITY_REVISION,
    foods:Object.fromEntries(Object.keys(YARD_FOODS).map(id=>[id,{buy:id==='kibble',set:id==='kibble',...(id==='kibble'?{}:{blockedReason:'FOOD_PRESENTATION_UNAVAILABLE'})}])),
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
