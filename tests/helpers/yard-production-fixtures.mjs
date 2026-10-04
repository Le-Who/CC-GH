/** Plain legacy save inputs. The production HTTP service owns migration/admission. */
import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import {createDefaultPlayer} from '../../game-logic/player.js';
import {getYardServerOptions} from '../../game-logic/yard-v2/yard-media.mjs';
import {nativeDrawContext,drawNativeSeed} from './yard-native-draw.mjs';
import {assertProductionAcceptance} from './yard-production-guard.mjs';
export const SPECS=Object.freeze({
 mika:{visitorId:'mika_cat',goodieId:'sun_cushion',activityId:'nap',foodId:'kibble',x:54,y:66},
 mochi:{visitorId:'mochi_bunny',goodieId:'yarn_mouse',activityId:'sniff',foodId:'berry_plate',x:50,y:50},
 pebble:{visitorId:'pebble_pup',goodieId:'leaf_pot',activityId:'sniff',foodId:'berry_plate',x:60,y:35},
 pip:{visitorId:'pip_hamster',goodieId:'snack_table',activityId:'nibble',foodId:'berry_plate',x:50,y:65},
 willow:{visitorId:'willow_fox',goodieId:'moon_lamp',activityId:'peek',foodId:'kibble',x:60,y:40},
 starlit:{visitorId:'starlit_fox',goodieId:'moon_lamp',activityId:'watch',foodId:'bonito_bowl',x:60,y:40},
 basil:{visitorId:'basil_turtle',goodieId:'fountain_bowl',activityId:'watch-right',foodId:'kibble',x:55,y:48},
 sage:{visitorId:'sage_turtle',goodieId:'fountain_bowl',activityId:'watch-right',foodId:'berry_plate',x:55,y:48},
});
const HOUR=3600000;
export function productionFixture(actor=null){
 assertProductionAcceptance();
 const now=Date.now(),opportunity=Math.floor(now/HOUR)*HOUR;
 let id=`acct:${randomUUID()}`,p=createDefaultPlayer(id,'Disposable Yard production fixture',now);
 p._onboarded=true;p._version=randomUUID();p.yard.currencies={treats:5000,shinyTreats:100};
 p.yard.placedGoodies=[];p.yard.pendingGifts=[{id:`fixture-gift-${randomUUID()}`,visitorId:'mika_cat',treats:17,shinyTreats:0,createdAt:now}];
 p.yard.productionFixture={preserve:'unknown yard input'};
 if(actor){
  const s=SPECS[actor];assert.ok(s);p.yard.lastSimulatedAt=opportunity-1;
  p.yard.placedGoodies=[{slotId:'target',goodieId:s.goodieId,x:s.x,y:s.y,uses:0,condition:'new',rotationZ:0}];
  p.yard.bowls[0]={id:'bowl-1',foodId:s.foodId,servings:1,placedAt:opportunity-1,expiresAt:opportunity+8*HOUR};
  const context=nativeDrawContext({yard:p.yard,placement:p.yard.placedGoodies[0],foodId:s.foodId,scene:getYardServerOptions().scene,at:opportunity});
  assert.ok(context.ok,'Actual released geometry required');let selected=false;
  for(let n=0;n<50000;n++){
   const candidate=`acct:${randomUUID()}`,draw=drawNativeSeed(candidate,context);
   if(draw?.visitorId===s.visitorId&&draw.activityId===s.activityId&&draw.minutes>=100){id=candidate;selected=true;break;}
  }
  assert.ok(selected,'Current-hour native seed search exhausted; never force an outcome');p.id=id;
 }
 assert.equal(Object.hasOwn(p,'_yardV2'),false,'No authored runtime/plan fixture allowed');
 return {id,externalId:String(9000000000000+randomInt(0,1000000000)),actor,opportunity,initial:p};
}
export async function insertFixture(sql,f,runId){
 assert.match(f.id,/^acct:[a-f0-9-]{36}$/);assert.match(f.externalId,/^900[0-9]{10}$/);assert.match(runId,/^[a-f0-9-]{36}$/);
 await sql.begin(async tx=>{
  await tx`INSERT INTO accounts(id,display_name,profile) VALUES(${f.id},'Disposable Yard production fixture',${{yardProductionFixture:runId}})`;
  await tx`INSERT INTO account_identities(provider,external_id,account_id,profile) VALUES('telegram',${f.externalId},${f.id},${{yardProductionFixture:runId}})`;
  await tx`INSERT INTO players(id,data) VALUES(${f.id},${f.initial})`;
 });
}
export async function readFixture(sql,f,runId){
 const [row]=await sql`SELECT p.data,a.profile AS owner FROM players p JOIN accounts a ON a.id=p.id JOIN account_identities i ON i.account_id=p.id WHERE p.id=${f.id} AND i.provider='telegram' AND i.external_id=${f.externalId}`;
 assert.equal(row?.owner?.yardProductionFixture,runId,'Refuse foreign fixture row');return row.data;
}
