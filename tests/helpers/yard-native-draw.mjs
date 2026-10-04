/** Seed search only. Every selected witness must pass actual simulation later.
 * Includes the native geometry-filtered activity pool, never forces an outcome. */
import {matchingVisitorCandidates} from '../../game-logic/yard-v2/simulation.mjs';
import {getYardGoodieActivities,getYardConditionProfile,YARD_GOODIES} from '../../game-logic/yard-v2/catalog.mjs';
import {validateLayout} from '../../game-logic/yard-v2/geometry.mjs';
import {hash32,randomUnit,randomInt,compareText} from '../../game-logic/yard-v2/util.mjs';
export function nativeDrawContext({yard,placement,foodId,scene,at,occupiedActivities=[]}){
 const geometry=validateLayout(yard,scene);if(!geometry.ok)return{ok:false,errors:geometry.errors};
 const goodie=YARD_GOODIES[placement.goodieId],condition=placement.condition;
 const activities=getYardGoodieActivities(goodie,condition).filter(a=>geometry.routes[placement.slotId]?.[a.id]&&!occupiedActivities.includes(a.id)).sort((a,b)=>compareText(a.id,b.id));
 const pool=matchingVisitorCandidates(goodie,{foodId},condition),strict=pool.filter(p=>p.strict);
 return{ok:true,slotId:placement.slotId,at,activities,pool,strict,chance:Math.max(.08,Math.min(.96,(strict.length?.92:.42)*getYardConditionProfile(goodie,condition).attraction))};
}
export function drawNativeSeed(seed,context,n=0){
 if(!context.ok||!context.activities.length||!context.pool.length)return null;
 const {at,slotId,pool,strict,activities,chance}=context,key=`${seed}:opportunity:${at}:${slotId}:${n}`;
 if(randomUnit(`${key}:chance`)>=chance)return null;
 let visitor;if(strict.length&&randomUnit(`${key}:visitor:strict`)<.82)visitor=strict[hash32(`${key}:visitor:strict-pick`)%strict.length].visitor;
 else{let roll=randomUnit(`${key}:visitor`)*pool.reduce((n,p)=>n+p.weight,0);visitor=pool.at(-1).visitor;for(const p of pool){roll-=p.weight;if(roll<=0){visitor=p.visitor;break;}}}
 const preferred=activities.filter(a=>visitor.poses.includes(a.pose)),available=preferred.length?preferred:activities;
 return{visitorId:visitor.id,activityId:available[hash32(`${key}:activity`)%available.length].id,minutes:randomInt(`${key}:duration`,45,110)};
}
