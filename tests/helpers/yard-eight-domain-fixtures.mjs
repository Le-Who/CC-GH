import {createDefaultPlayer} from '../../game-logic/player.js';
import {YARD_VISITORS,YARD_GOODIES,YARD_FOODS,getYardGoodieActivities,getYardConditionProfile,getYardGoodieCapacity} from '../../game-logic/yard-v2/catalog.mjs';
import {matchingVisitorCandidates} from '../../game-logic/yard-v2/simulation.mjs';
import {hash32,randomUnit,randomInt,compareText} from '../../game-logic/yard-v2/util.mjs';
import {conditionAtUses} from '../../game-logic/yard-v2/family-media-source.mjs';
export const NOW=Date.UTC(2026,9,3,12),H=3600000;
export const EIGHT_FIXTURE_SPECS=Object.freeze({
 mika:{visitorId:'mika_cat',goodieId:'sun_cushion',activityId:'nap',foodId:'kibble',x:54,y:66},
 mochi:{visitorId:'mochi_bunny',goodieId:'yarn_mouse',activityId:'sniff',foodId:'berry_plate',x:50,y:50},
 pebble:{visitorId:'pebble_pup',goodieId:'leaf_pot',activityId:'sniff',foodId:'berry_plate',x:60,y:35},
 pip:{visitorId:'pip_hamster',goodieId:'snack_table',activityId:'nibble',foodId:'berry_plate',x:50,y:65},
 willow:{visitorId:'willow_fox',goodieId:'moon_lamp',activityId:'peek',foodId:'kibble',x:60,y:40},
 starlit:{visitorId:'starlit_fox',goodieId:'moon_lamp',activityId:'watch',foodId:'bonito_bowl',x:60,y:40},
 basil:{visitorId:'basil_turtle',goodieId:'fountain_bowl',activityId:'watch-right',foodId:'kibble',x:55,y:48},
 sage:{visitorId:'sage_turtle',goodieId:'fountain_bowl',activityId:'watch-right',foodId:'berry_plate',x:55,y:48},
});
export function oneYard(actorId,uses=0){const s=EIGHT_FIXTURE_SPECS[actorId];return{remodel:'meadow',expansion:{level:1},placedGoodies:[{slotId:'target',goodieId:s.goodieId,x:s.x,y:s.y,uses,condition:conditionAtUses(uses,YARD_GOODIES[s.goodieId].durability),rotationZ:0,futurePlacement:{preserve:actorId}}]};}
export function candidate(actorId,{at=NOW+H,minutes=110,uses=0,activityId=EIGHT_FIXTURE_SPECS[actorId].activityId,yard=oneYard(actorId,uses),placement=yard.placedGoodies[0]}={}){const s=EIGHT_FIXTURE_SPECS[actorId];return{at,leavesAt:at+minutes*60000,placement,yard,visitor:YARD_VISITORS[s.visitorId],goodie:YARD_GOODIES[s.goodieId],activity:{id:activityId},bowl:{id:'bowl-1',foodId:s.foodId},active:[],reserved:[]};}
// Search only seeds, never outcomes. Every returned witness is independently
// required to pass actual native simulation/admission in the tests and fixture.
export function nativeDrawForSeed(seed,s,condition,n=0){
 const at=NOW+H,key=`${seed}:opportunity:${at}:target:${n}`,g=YARD_GOODIES[s.goodieId],bowl={foodId:s.foodId};
 const pool=matchingVisitorCandidates(g,bowl,condition),chance=Math.max(.08,Math.min(.96,(pool.some(p=>p.strict)?.92:.42)*getYardConditionProfile(g,condition).attraction));
 if(randomUnit(`${key}:chance`)>=chance)return null;
 const strict=pool.filter(p=>p.strict);let visitor;
 if(strict.length&&randomUnit(`${key}:visitor:strict`)<.82)visitor=strict[hash32(`${key}:visitor:strict-pick`)%strict.length].visitor;
 else{let roll=randomUnit(`${key}:visitor`)*pool.reduce((n,p)=>n+p.weight,0);visitor=pool.at(-1)?.visitor;for(const p of pool){roll-=p.weight;if(roll<=0){visitor=p.visitor;break;}}}
 const available=getYardGoodieActivities(g,condition).sort((a,b)=>compareText(a.id,b.id)),preferred=available.filter(a=>visitor.poses.includes(a.pose)),activities=preferred.length?preferred:available;
 return{visitorId:visitor.id,activityId:activities[hash32(`${key}:activity`)%activities.length].id,minutes:randomInt(`${key}:duration`,45,110)};
}
export function findSeed(actorId,{uses=0,minutes,activityId=EIGHT_FIXTURE_SPECS[actorId].activityId,rejectSecond=false}={}){
 const s=EIGHT_FIXTURE_SPECS[actorId],condition=conditionAtUses(uses,YARD_GOODIES[s.goodieId].durability);
 for(let n=0;n<50000;n++){const seed=`yard-eight-${actorId}-${uses}-${minutes||'any'}-${n}`,d=nativeDrawForSeed(seed,s,condition);if(d?.visitorId!==s.visitorId||d.activityId!==activityId||minutes&&d.minutes!==minutes)continue;if(rejectSecond&&getYardGoodieCapacity(YARD_GOODIES[s.goodieId])>1&&nativeDrawForSeed(seed,s,condition,1))continue;return seed;}throw Error(`Native seed not found: ${actorId}/${uses}/${minutes}/${activityId}`);
}
export function nativePlayer(actorId,{uses=0,minutes,activityId,id,rejectSecond=false}={}){
 const s=EIGHT_FIXTURE_SPECS[actorId],seed=id||findSeed(actorId,{uses,minutes,activityId,rejectSecond}),p=createDefaultPlayer(seed,'Local acceptance',NOW);Object.assign(p.yard,oneYard(actorId,uses));
 p.yard.bowls[0]={id:'bowl-1',foodId:s.foodId,servings:1,placedAt:NOW,expiresAt:NOW+8*H};p.yard.futureEconomy={keep:actorId};
 p.futureAccount={unchanged:true};return p;
}
