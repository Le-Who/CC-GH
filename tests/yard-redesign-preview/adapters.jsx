/** UI-only deterministic fixture. No transport, live scene, successful mutations or release approval. */
import React,{useSyncExternalStore} from 'react';
import {YARD_FOODS,YARD_VISITORS} from '../../game-logic/yard-catalog.js';

export const fixtureScope='ui-only-fixed-fixture-no-live-scene-no-backend';
export const SUPPORTED_PROPS=['yarn_mouse','sun_cushion','leaf_pot','snack_table','moon_lamp','fountain_bowl'];
export const MIKA_CLIPS={};
export const MIKA_PLACEMENT_SUGGESTIONS={};
const params=new URLSearchParams(location.search),mode=params.get('state')||'full';
const now=Date.UTC(2026,9,4,12);
const yard={
  currencies:{treats:123456789,shinyTreats:987654321},
  bowls:[{id:'bowl-1',foodId:'berry_plate',servings:4},{id:'bowl-2',foodId:'bonito_bowl',servings:2}],
  foodInventory:{kibble:5,berry_plate:3,bonito_bowl:1},
  placedGoodies:SUPPORTED_PROPS.map((goodieId,i)=>({slotId:`fixture-item-${i}`,goodieId,x:20+i*9,y:40,condition:i===1?'worn':'new'})),
  goodieInventory:Object.fromEntries(SUPPORTED_PROPS.map((id,i)=>[id,i+1])),
  remodel:'meadow',ownedRemodels:['meadow'],expansion:{level:1},
  pendingGifts:[{treats:20,shinyTreats:1}],dailyLetter:{stamps:3},
  petbook:Object.fromEntries(Object.keys(YARD_VISITORS).map((id,i)=>[id,{visits:i+2}])),
  album:{photos:Object.keys(YARD_VISITORS).map((visitorId,i)=>({id:`fixture-photo-${i}`,visitorId,goodieId:SUPPORTED_PROPS[i%SUPPORTED_PROPS.length],pose:YARD_VISITORS[visitorId].poses[0],remodel:i%2?'moon_garden':'meadow',favorite:i===0}))},
  companion:{name:'Пушистый помощник',species:'cat'},helper:{unlocked:true,preferredFoodId:'kibble',autoRefill:true},
};
if(mode==='empty'){
  yard.placedGoodies=[];yard.goodieInventory={};yard.petbook={};yard.album.photos=[];yard.pendingGifts=[];
  yard.foodInventory={kibble:0,berry_plate:0,bonito_bowl:0};yard.currencies={treats:0,shinyTreats:0};
}
const yardRuntime={
  mutable:true,serverNow:now,
  supportedBindings:{
    bowls:{'bowl-1':{set:true}},
    foods:Object.fromEntries(Object.keys(YARD_FOODS).map(id=>[id,{set:true,buy:true}])),
    goodies:Object.fromEntries(SUPPORTED_PROPS.map(id=>[id,{place:true,buy:true}])),remodels:{meadow:{select:true}},
  },
  visits:mode==='empty'?[]:[{visitId:'fixture-visit-1',visitorId:'mika_cat',slotId:'fixture-item-0',reserved:true,source:'v2'}],
};
const state={
  snapshot:mode==='loading'?null:{yard,yardRuntime,serverTime:now},
  message:mode==='error'?'Не удалось связаться с сервером. Пример ошибки интерфейса.':'',pendingActions:[],
  setActiveGameShell(value){this.activeGameShell=value;},loadSnapshot(){return Promise.resolve();},
  performReliableAction(){
    document.body.dataset.blockedMutationAttempts=String(Number(document.body.dataset.blockedMutationAttempts||0)+1);
    return Promise.resolve({error:'UI-only fixture: this action was blocked; nothing was sent or saved.'});
  },
};
const subscribe=()=>()=>{};
export const useGameHub=selector=>useSyncExternalStore(subscribe,()=>selector(state));
useGameHub.getState=()=>state;

const translations={en:{},ru:{}};
export function registerAppTranslations(entries){for(const lang of ['en','ru'])Object.assign(translations[lang],entries[lang]);}
export function useAppI18n(){
  const language=params.get('lang')==='en'?'en':'ru';
  return{language,t:(key,values={})=>(translations[language][key]||translations.en[key]||key).replace(/\{(\w+)\}/g,(_,name)=>values[name]??'')};
}
export const playerFeedbackText=(_,message)=>message;
export function HudRegion({as='div',id,applyLayout,children,...props}){return React.createElement(as,{'data-hud-region':id,...props},children);}
export const HudEditableRegion=HudRegion;
export function openHome(){document.body.dataset.fixtureHomeClicked='true';}
export function courtyardPresentation(snapshot){
  const yard=snapshot?.yard||{},runtime=snapshot?.yardRuntime;
  return{yard,runtime,mutable:runtime?.mutable===true,bowls:yard.bowls||[],pendingGifts:yard.pendingGifts||[],props:yard.placedGoodies||[],pets:[],legacy:[],issues:[]};
}
export function visibleStatus(_view,t){return t('yard.persistent.status.food');}
// These fixture outcomes exercise the actual UI's explanations, never geometry correctness.
export function checkPlacement(){
  const reason={outside:'FOOTPRINT_OUTSIDE_PLAYZONE',collision:'FOOTPRINT_COLLISION',exclusion:'EXCLUSION_COLLISION',reserved:'VISITOR_PATH_RESERVED',occupied:'PROP_RESERVED',unreachable:'PROP_UNREACHABLE',entry:'ENTRY_BLOCKED'}[params.get('placement')];
  return reason?{ok:false,errors:[{code:reason}]}:{ok:true,errors:[]};
}
export function createCourtyardScene(){return{
  update(){},dispose(){},setGhost(){},point(){return null;},hit(){return null;},
  offsetPoint(point,delta){return{x:point.x+delta.x,y:point.y+delta.y};},
};}
