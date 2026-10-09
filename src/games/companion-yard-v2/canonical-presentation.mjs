import {canonicalItemState} from '../../game-state/canonicalYardItems.mjs';
import {selectCanonicalFoodState} from '../../../game-logic/yard-v2/canonical-food-contract.mjs';
import {CANONICAL_VISIT_PRESENTATION_PROTOCOL} from '../../../game-logic/yard-v2/canonical-visit-placement-contract.mjs';
import {YARD_VISITORS} from '../../../game-logic/yard-catalog.js';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const record=value=>object(value)?{...value}:{};
const records=value=>Array.isArray(value)?value.filter(object).map(value=>({...value})):[];
const array=value=>Array.isArray(value)?[...value]:[];
const rowFields=['placedGoodies','pendingGifts','bowls','activeVisitors'];
const mapFields=['currencies','goodieInventory','foodInventory','petbook','mementos','dailyLetter','companion','helper','album','expansion'];
const validRows=value=>Array.isArray(value)&&value.every(object);
const validYard=yard=>object(yard)
  &&rowFields.every(key=>yard[key]===undefined||validRows(yard[key]))
  &&mapFields.every(key=>yard[key]===undefined||object(yard[key]))
  &&['notes','ownedRemodels'].every(key=>yard[key]===undefined||Array.isArray(yard[key]))
  &&(yard.petbook===undefined||Object.values(yard.petbook).every(object))
  &&(yard.album?.photos===undefined||validRows(yard.album.photos));
const validRuntime=runtime=>object(runtime)
  &&['visits','canonicalPlacements','canonicalVisits'].every(key=>runtime[key]===undefined||validRows(runtime[key]))
  &&(runtime.supportedActions===undefined||Array.isArray(runtime.supportedActions)&&runtime.supportedActions.every(value=>typeof value==='string'))
  &&(runtime.supportedBindings===undefined||object(runtime.supportedBindings));

/** Display-only copy. Unknown save fields remain untouched in the snapshot;
 * malformed collections cannot become an iterable UI or a writable state. */
function yardDisplay(value){
  const yard=record(value);
  for(const key of rowFields)yard[key]=records(yard[key]);
  for(const key of mapFields)yard[key]=record(yard[key]);
  yard.petbook=Object.fromEntries(Object.entries(yard.petbook).filter(([,value])=>object(value)));
  yard.album={...yard.album,photos:records(yard.album.photos)};
  yard.ownedRemodels=array(yard.ownedRemodels);
  yard.notes=array(yard.notes);
  return yard;
}

function knownRuntime(runtime){
  if(runtime?.version!==1)return false;
  if(runtime.storageVersion===3)return runtime.canonicalVisitProtocol===CANONICAL_VISIT_PRESENTATION_PROTOCOL;
  return runtime.canonicalVisitProtocol===undefined
    &&(runtime.storageVersion===undefined||[1,2].includes(runtime.storageVersion));
}

/** The clean scene consumes current data and advertised capabilities only.
 * It does not sample historical sprite plans, recover old prop geometry, spawn
 * visitors, authorize commands, advance clocks, or change saved player data.
 * The live scene owner supplies rendered pets and media/interaction readiness. */
export function canonicalYardPresentation(snapshot,now){
  const source=snapshot?.yardRuntime,yard=yardDisplay(snapshot?.yard);
  const runtime=object(source)?{...source,visits:records(source.visits),
    supportedActions:array(source.supportedActions),supportedBindings:record(source.supportedBindings)}:null;
  const shape=validYard(snapshot?.yard),known=knownRuntime(source);
  const ready=shape&&known&&validRuntime(source)&&source.status==='ready'&&!source.error;
  const canonicalState=shape?canonicalItemState(snapshot):{available:false,records:null,status:'unavailable'};
  const props=canonicalState.available?records(canonicalState.records):[];
  const time=[now,source?.serverNow,snapshot?.serverTime].find(Number.isFinite)??0;
  const mutable=ready&&source.mutable===true&&source.actionProtocol==='yard-v2:';
  return {
    yard,runtime,now:time,mutable,readOnly:!mutable,
    mediaReady:false,itemMutable:false,canonicalItems:true,
    canonicalSavedVisits:known&&source.storageVersion===3,
    canonicalState:{...canonicalState,records:canonicalState.available?props:null},
    canonicalFood:shape?selectCanonicalFoodState(snapshot):{available:false,state:null,reason:'CANONICAL_AUTHORITATIVE_LAYOUT_INVALID'},
    props,pets:[],legacy:[],plans:{},
    pendingGifts:yard.pendingGifts,bowls:yard.bowls,currencies:yard.currencies,
    goodieInventory:yard.goodieInventory,foodInventory:yard.foodInventory,
    notes:yard.notes,dailyLetter:yard.dailyLetter,petbook:yard.petbook,mementos:yard.mementos,album:yard.album,
    issues:[...array(source?.issues),...array(source?.display?.issues)],
    capabilities:{
      // These remain server advertisements. Readiness and the existing command
      // guards, not this projection, decide whether a specific action is usable.
      actions:runtime?.supportedActions??[],bindings:runtime?.supportedBindings??{},
      itemPlacement:record(source?.itemPlacementCapabilities),
      foodLocation:record(source?.foodLocationCapabilities),
      foodActions:record(source?.canonicalFoodActions),
      inventoryActions:record(source?.canonicalInventoryActions),
      pickupActions:record(source?.canonicalPickupActions),
      nativeCheckpoint:record(source?.nativeMikaCheckpointCapabilities),
    },
  };
}

export function canonicalVisibleStatus(view,t=key=>key){
  if(!view?.mutable&&!view?.itemMutable)return t('yard.persistent.status.readOnly');
  if(view.pendingGifts?.length)return t('yard.persistent.status.gifts',{count:view.pendingGifts.length});
  const pet=view.pets?.[0];
  if(pet){
    const name=Object.hasOwn(YARD_VISITORS,pet.visitorId)?YARD_VISITORS[pet.visitorId].name:t('yard.visitor');
    return t('yard.persistent.status.visiting',{name});
  }
  if(view.issues?.length)return t('yard.persistent.status.items');
  if(view.bowls?.some(b=>b?.foodId&&b.servings>0))return t('yard.persistent.status.food');
  return t('yard.persistent.status.empty');
}
