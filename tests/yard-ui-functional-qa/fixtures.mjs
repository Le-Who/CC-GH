/** Owned plain saves only. Ordinary C HTTP performs migration and admission. */
import assert from 'node:assert/strict';
import {randomUUID,randomInt} from 'node:crypto';
import postgres from 'postgres';
import {sign} from '@tma.js/init-data-node';
import {createDefaultPlayer} from '../../game-logic/player.js';
import {YARD_GOODIES} from '../../game-logic/yard-v2/catalog.mjs';
import {getYardServerOptions} from '../../game-logic/yard-v2/yard-media.mjs';
import {nativeDrawContext,drawNativeSeed} from '../helpers/yard-native-draw.mjs';
import {insertFixture,readFixture} from '../helpers/yard-production-fixtures.mjs';
import {assertUiFunctionalQa,origin,databaseURL,fixtureBotToken} from '../../scripts/yard-ui-functional-qa.mjs';

export async function createUiQaHarness(){
  const {commit}=assertUiFunctionalQa(),runId=process.env.YARD_UI_QA_RUN_ID;
  assert.match(runId||'',/^[a-f0-9-]{36}$/);
  const sql=postgres(databaseURL,{max:2,prepare:false});
  const observations=new WeakMap(),requests=[];
  try{const [db]=await sql`SELECT current_database() AS name,current_setting('server_version_num')::int AS version`;
    assert.equal(db.name,'ccgh_yard_production_ci');assert.ok(db.version>=150000&&db.version<160000);
  }catch(error){await sql.end({timeout:5});throw error;}
  const auth=f=>sign({user:{id:Number(f.externalId),first_name:'Disposable UI QA'}},fixtureBotToken,new Date());
  async function http(f,path,body){
    const observed=body?{command:structuredClone(body),startedAt:Date.now()}:null;if(observed)requests.push(observed);
    try{const response=await fetch(origin+path,{headers:{Authorization:`tma ${auth(f)}`,...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
      const result={status:response.status,body:await response.json()};if(observed)Object.assign(observed,result,{finishedAt:Date.now()});return result;
    }catch(error){if(observed)Object.assign(observed,{failure:String(error.message),finishedAt:Date.now()});throw error;}
  }
  async function seed(kind){
    assert.ok(['actions','unaffordable','reserved','lost','storage'].includes(kind));
    const now=Date.now(),opportunity=Math.floor(now/3600000)*3600000;
    let id=`acct:${randomUUID()}`;
    const p=createDefaultPlayer(id,'Disposable Yard UI QA',now);
    p._onboarded=true;p._version=randomUUID();
    p.yard.currencies={treats:10000,shinyTreats:500};p.yard.placedGoodies=[];
    p.yard.goodieInventory={};p.yard.foodInventory={kibble:3};
    p.yard.pendingGifts=[];p.yard.dailyLetter={...p.yard.dailyLetter,stamps:4,lastClaimedDate:null};
    p.yard.uiDiagnosticUnknown={preserve:'opaque saved input'};
    if(kind==='actions'){
      p.yard.placedGoodies=[{slotId:'repair-moon',goodieId:'moon_lamp',x:60,y:40,condition:'worn',uses:YARD_GOODIES.moon_lamp.durability,rotationZ:0,opaque:'keep'}];
      p.yard.pendingGifts=[{id:`ui-gift-${randomUUID()}`,visitorId:'mika_cat',treats:12,shinyTreats:1,createdAt:now}];
      p.yard.petbook.mika_cat={visits:1};p.yard.helper={...p.yard.helper,unlocked:true,autoRefill:false,preferredFoodId:'kibble'};
      p.yard.bowls.push({id:'bowl-2',foodId:null,servings:0,placedAt:null,expiresAt:null});
    }
    if(kind==='unaffordable')p.yard.currencies={treats:5000,shinyTreats:0};
    if(kind==='storage')p.yard.goodieInventory.sun_cushion=1;
    if(kind==='lost'){
      p.yard.pendingGifts=[{id:`ui-lost-gift-${randomUUID()}`,visitorId:'mika_cat',treats:17,shinyTreats:0,createdAt:now}];
      p.yard.album.photos=[0,1].map(i=>({id:`ui-saved-photo-${i}`,visitorId:'mika_cat',capturedAt:now,opaque:{preserve:i}}));
    }
    if(kind==='reserved'){
      p.yard.lastSimulatedAt=opportunity-1;
      p.yard.placedGoodies=[{slotId:'occupied-cushion',goodieId:'sun_cushion',x:54,y:66,uses:0,condition:'new',rotationZ:0}];
      p.yard.bowls[0]={id:'bowl-1',foodId:'kibble',servings:1,placedAt:opportunity-1,expiresAt:opportunity+8*3600000};
      const context=nativeDrawContext({yard:p.yard,placement:p.yard.placedGoodies[0],foodId:'kibble',scene:getYardServerOptions().scene,at:opportunity});
      assert.ok(context.ok,'Actual released geometry is required');let found=false;
      for(let n=0;n<50000;n++){
        const candidate=`acct:${randomUUID()}`,draw=drawNativeSeed(candidate,context);
        if(draw?.visitorId==='mika_cat'&&draw.activityId==='nap'&&draw.minutes>=100){id=candidate;found=true;break;}
      }
      assert.ok(found,'Native current-hour seed search exhausted');p.id=id;
    }
    assert.equal(Object.hasOwn(p,'_yardV2'),false,'Never author persistent runtime or media plans');
    const f={id,externalId:String(9000000000000+randomInt(0,1000000000)),kind,initial:structuredClone(p)};
    await insertFixture(sql,f,runId);return f;
  }
  async function saved(f){const startedAt=Date.now(),p=await readFixture(sql,f,runId);observations.set(p,{startedAt,finishedAt:Date.now()});return p;}
  return{origin,commit,runId,auth,seed,saved,
    requestsFor:f=>requests.filter(row=>row.command.accountId===f.id),
    readWindow:(before,after)=>({startedAt:observations.get(before).startedAt,finishedAt:observations.get(after).finishedAt}),
    snapshot:async f=>{const before=Date.now(),r=await http(f,'/api/player/snapshot'),after=Date.now();assert.equal(r.status,200);
      if(r.body.yardRuntime){assert.ok(r.body.yardRuntime.serverNow>=before-2000);assert.ok(r.body.yardRuntime.serverNow<=after+2000);}return r.body;},
    mutate:(f,data)=>http(f,'/api/player/mutate',data),close:()=>sql.end({timeout:5})};
}
