/** Explicit development image acceptance. Never changes an application capability. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {appendFileSync,mkdirSync,statSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID,randomInt} from 'node:crypto';
import {createDefaultPlayer} from '../../game-logic/player.js';
import {initializeReleasedPlayerYard} from '../../game-logic/yard-v2/player-release.mjs';
import {canonicalStorageValid} from '../../game-logic/yard-v2/canonical-locations.mjs';
import {PRODUCTION_PORTS,FIXTURE_BOT_TOKEN,DATABASE_URL} from './yard-production-guard.mjs';
export {PRODUCTION_PORTS,FIXTURE_BOT_TOKEN,DATABASE_URL};
export const PREDECESSOR='6b80c9a2cca146e20afcaced6a34a035c30c13aa',BRANCH='qa/yard-development-entry-20261007';
export const CAPS=Object.freeze({jobMinutes:10,browserMs:220000,artifactBytes:8388608,retentionDays:3,retries:0,actionMs:5000,replyMs:10000,checkpointBytes:131072});
export const CHECKS=Object.freeze(['reviewed-source-inventory','normal-production-image','authenticated-capability-policy','canonical-placement-storage-v2','economy-inventory','lost-response-exactly-once','pending-intent-account-fences','receipt-security','occupied-food-socket','warm-client-update','mobile-functional','mobile-visual','app-only-failure-rollback','prior-image-v2-quarantine-preserves-bytes']);
export const sha=b=>createHash('sha256').update(b).digest('hex');
export function assertDevelopmentEnvironment(env=process.env){
 assert.equal(env.YARD_DEVELOPMENT_IMAGE_ACCEPTANCE,'1');assert.equal(env.CI,'true');assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_REF,'refs/heads/'+BRANCH);assert.equal(env.GITHUB_REPOSITORY?.toLowerCase(),'le-who/cc-gh');assert.match(env.GITHUB_SHA||'',/^[a-f0-9]{40}$/);
 for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','DOCKER_CONFIG','NODE_OPTIONS','DEV_AUTH_ENABLED','TELEGRAM_BOT_TOKEN','DATABASE_URL','REDIS_URL','YARD_CANDIDATE_CI','YARD_CANONICAL_API_TEST','YARD_PLAYER_API_TEST','YARD_PLAYER_WIRING_TEST','YARD_PRODUCTION_ACCEPTANCE'])assert(!env[key],'Inherited runtime override forbidden: '+key);
 return env.GITHUB_SHA;
}
export function assertImageInputs(input){
 assert.equal(input.repository,'ghcr.io/le-who/cc-gh');assert.equal(input.predecessor.commit,PREDECESSOR);
 for(const row of [input.predecessor,input.candidate]){assert.match(row.commit,/^[a-f0-9]{40}$/);assert.match(row.tree,/^[a-f0-9]{40}$/);assert.match(row.imageDigest,/^sha256:[a-f0-9]{64}$/);assert.match(row.imageId,/^sha256:[a-f0-9]{64}$/);}assert.notEqual(input.candidate.commit,PREDECESSOR);return input;
}
export function assertCurrentCapabilities(body){
 const r=body.yardRuntime,c=r?.itemPlacementCapabilities,f=r?.foodLocationCapabilities;
 assert.equal(r?.status,'ready');assert.equal(r.mutable,true);assert.equal(c?.enabled,true);assert.equal(c.geometryRevision,'pip-garden-t2-food-r2');assert.equal(c.actionNoncePrefix,'yard-v2:canonical-v2/');assert.equal(c.maxPlacements,2);assert.equal(c.visitAdmission,false);assert.equal(f?.enabled,true);assert.equal(f.runtimeActivated,false);assert.equal(f.presentationReady,false);assert.equal(f.visitAdmission,false);assert.equal(r.developmentRelease?.enabled,true);assert.equal(r.developmentRelease.productionAccepted,false);assert.equal(r.developmentRelease.canonicalVisitAdmission,false);return body;
}
export async function auth(f){const {sign}=await import('@tma.js/init-data-node');return sign({user:{id:Number(f.externalId),first_name:'Disposable development fixture'}},FIXTURE_BOT_TOKEN,new Date());}
export const headers=async f=>({Authorization:'tma '+await auth(f)});
export const origin=mode=>'http://127.0.0.1:'+PRODUCTION_PORTS[mode];
export function fixture({occupied=false,ownedPots=0}={}){
 assert([0,1,2].includes(ownedPots));const now=Date.now(),id='acct:'+randomUUID(),externalId=String(9000000000000+randomInt(0,1000000000)),p=createDefaultPlayer(id,'Disposable development fixture',now);
 p._onboarded=true;p._version=randomUUID();p.yard.currencies={...p.yard.currencies,treats:280,shinyTreats:2};p.yard.goodieInventory=ownedPots?{leaf_pot:ownedPots}:{};p.yard.placedGoodies=[];p.yard.activeVisitors=[];p.yard.foodInventory={};p.yard.pendingGifts=[];p.yard.bowls=p.yard.bowls.map(b=>({...b,foodId:null,servings:0}));
 if(occupied){assert.equal(ownedPots,1);p.yard.goodieInventory={};assert.equal(initializeReleasedPlayerYard(p,{now}).status,200);p._yardV2.version=2;p._yardV2.runtime.canonicalPlacements=[{locationId:'pip-garden',locationVersion:1,geometryRevision:'pip-garden-t2-r1',slotId:'canonical:owned-overlap',goodieId:'leaf_pot',itemGeometryRevision:'yard-succulent-T2',x:80,y:82,condition:'new',uses:0,placedAt:now}];assert(canonicalStorageValid(p._yardV2.runtime.canonicalPlacements,p.yard.placedGoodies));}
 return {id,externalId,initial:p,setup:occupied?'explicit owned saved-row overlap fixture; not a migration or placement acceptance claim':'plain player; normal HTTP owns migration and commands'};
}
export async function insertFixture(sql,f,runId){assert.match(runId,/^[a-f0-9-]{36}$/);await sql.begin(async tx=>{await tx`INSERT INTO accounts(id,display_name,profile) VALUES(${f.id},'Disposable development fixture',${{yardDevelopmentFixture:runId}})`;await tx`INSERT INTO account_identities(provider,external_id,account_id,profile) VALUES('telegram',${f.externalId},${f.id},${{yardDevelopmentFixture:runId}})`;await tx`INSERT INTO players(id,data) VALUES(${f.id},${f.initial})`;});}
export async function saved(sql,f,runId){const[row]=await sql`SELECT p.data,a.profile AS owner FROM players p JOIN accounts a ON a.id=p.id JOIN account_identities i ON i.account_id=p.id WHERE p.id=${f.id} AND i.provider='telegram' AND i.external_id=${f.externalId}`;assert.equal(row?.owner?.yardDevelopmentFixture,runId);return row.data;}
export function createLedger(file,identity){const rows=[];return {rows,async record(row){rows.push({at:new Date().toISOString(),...row});const bytes=Buffer.from(JSON.stringify({identity,events:rows},null,2)+'\n');assert(bytes.length<=CAPS.checkpointBytes,'Diagnostic ledger cap exceeded; never drop prior events');await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.next',bytes);await fs.rename(file+'.next',file);}};}
export async function checkpoint(page,ledger,step,phase,extra={}){await ledger.record({step,phase,...extra});if(!page)return;let timer;const pending=page.evaluate(()=>{const s=window.__yardPipIntegration?.snapshot()?.scene,rect=e=>{if(!e)return null;const b=e.getBoundingClientRect();return {text:e.textContent,disabled:!!e.disabled,visible:!!e.getClientRects().length,x:b.x,y:b.y,width:b.width,height:b.height};};return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},dialogOpen:document.querySelector('.cy-dialog')?.open??false,status:rect(document.querySelector('[data-hud-region="yardVisitStatus"][role="status"]')),buttons:[...document.querySelectorAll('[data-yard-action]')].filter(e=>e.getClientRects().length).map(e=>({action:e.dataset.yardAction,...rect(e)})),scene:s?{phase:s.phase,itemEditing:s.itemEditing,itemActionPending:s.itemActionPending,canonicalFood:s.canonicalFood,foodRenderer:s.renderer?.canonicalFood?{enabled:s.renderer.canonicalFood.enabled,pending:s.renderer.canonicalFood.pending,selection:s.renderer.canonicalFood.selection,binding:s.renderer.canonicalFood.binding?{visible:s.renderer.canonicalFood.binding.visible,state:s.renderer.canonicalFood.binding.state}:null,ledger:s.renderer.canonicalFood.ledger?{limits:s.renderer.canonicalFood.ledger.limits,total:s.renderer.canonicalFood.ledger.total,peak:s.renderer.canonicalFood.ledger.peak}:null}:null,ghost:s.lastFrame?.ghost,records:s.canonicalRecords,actorRoot:s.dynamicSample?.world?.root}:null};});pending.catch(()=>{});try{const observation=await Promise.race([pending,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('DOM diagnostic deadline')),1500);})]);await ledger.record({step,phase:'observation',observation});}catch(error){await ledger.record({step,phase:'diagnostic-unavailable',error:String(error)});}finally{clearTimeout(timer);}}
export async function step(page,ledger,name,action){await checkpoint(page,ledger,name,'started');try{const value=await action();await checkpoint(page,ledger,name,'passed');return value;}catch(error){await checkpoint(page,ledger,name,'failed',{error:String(error)});throw error;}}

/** Only successful named cases can establish a check; failed worker evidence stays sticky. */
export function requiredCheckClaims(api,native){
 assert.equal(api?.status,'passed');assert.equal(native?.status,'passed');assert(Array.isArray(api.cases)&&api.cases.length===1);assert(Array.isArray(native.cases)&&native.cases.length===4);
 assert.deepEqual(api.cases.map(c=>c.name),['api-and-warm']);assert.deepEqual(native.cases.map(c=>c.name).sort(),['current-v2-pending','occupied-320x568','occupied-390x844','occupied-568x320']);
 const assignments={'authenticated-capability-policy':['api-and-warm'],'warm-client-update':['api-and-warm'],'canonical-placement-storage-v2':['current-v2-pending'],'economy-inventory':['current-v2-pending'],'lost-response-exactly-once':['current-v2-pending'],'pending-intent-account-fences':['current-v2-pending'],'receipt-security':['current-v2-pending'],'prior-image-v2-quarantine-preserves-bytes':['current-v2-pending'],'occupied-food-socket':['occupied-320x568','occupied-390x844','occupied-568x320'],'mobile-functional':['occupied-320x568','occupied-390x844','occupied-568x320']};
 const all=[...api.cases,...native.cases];for(const[name,cases]of Object.entries(assignments))for(const id of cases){const row=all.find(c=>c.name===id);assert.equal(row?.status,'passed');assert(row.checks.includes(name),'Missing successful case for '+name);}
 assert(Array.isArray(native.captures)&&native.captures.length===10);assert.equal(new Set(native.captures).size,10);assert.deepEqual(native.captures.slice().sort(),["current-v2-recovered-390x844.png", "occupied-320x568-decor.png", "occupied-320x568-escaped.png", "occupied-320x568-food.png", "occupied-390x844-decor.png", "occupied-390x844-escaped.png", "occupied-390x844-food.png", "occupied-568x320-decor.png", "occupied-568x320-escaped.png", "occupied-568x320-food.png"]);
 return CHECKS.map(name=>({name,status:name==='mobile-visual'?'review-required':'passed',kind:['reviewed-source-inventory','app-only-failure-rollback'].includes(name)?'reviewed-source-and-mocked-release-guard':name==='mobile-visual'?'unaltered-native-originals-await-independent-review':'fresh-exact-image-api-or-browser',evidence:name==='reviewed-source-inventory'?['source-inventory.json']:name==='normal-production-image'?['image-identity.json']:name==='app-only-failure-rollback'?['release-smoke.tap','release-guard-prior.tap','release-guard-prior.json']:name==='mobile-visual'?native.captures:assignments[name]?.includes('api-and-warm')?['api-proof.json']:['native-proof.json'],cases:assignments[name]||[],attempts:1}));
}

export const RELEASE_SMOKE_NAMES=Object.freeze(["shell success changes only app image/build identity and preserves original compose/env", "shell during-switch performs actual healthy predecessor rollback", "shell stale-public performs actual healthy predecessor rollback", "a later invocation refuses unresolved daemon work despite a stale healthy predecessor", "signal immediately after clearing a verified candidate marker cannot start an unmarked rollback"]);
export function assertTap(bytes,count,names){const text=bytes.toString();for(const [key,value]of Object.entries({tests:count,pass:count,fail:0,cancelled:0,skipped:0}))assert(new RegExp(`^# ${key} ${value}$`,'m').test(text),`Wrong TAP ${key}`);if(names)assert.deepEqual([...text.matchAll(/^# Subtest: (.+)$/gm)].map(m=>m[1]).sort(),names.slice().sort());}

// Tolerance applies only to projection of a requested pointer target. Durable
// command, stored row, receipt and replay comparisons remain exact.
export const POINTER_TARGET_EPSILON=0.0001;
export function projectedTargetMatches(point,target){return !!point&&['x','y'].every(k=>Number.isFinite(point[k])&&Number.isFinite(target[k])&&Math.abs(point[k]-target[k])<=POINTER_TARGET_EPSILON);}
export function assertStoredPlacement(row,command,target){
 const payload=command?.payload;assert(projectedTargetMatches(payload,target),'Dispatched command missed requested pointer target');
 for(const key of ['x','y','slotId','locationId','locationVersion'])assert.equal(row?.[key],payload[key],'Stored placement differs from dispatched '+key);
 assert.equal(payload.geometryRevision,'pip-garden-t2-food-r2');assert.equal(row.geometryRevision,'pip-garden-t2-r1');assert.equal(row.itemGeometryRevision,'yard-succulent-T2');assert.equal(row.goodieId,'leaf_pot');if(payload.goodieId!==undefined)assert.equal(row.goodieId,payload.goodieId);return row;
}
export function assertNativeFoodPresentation(scene){
 assert(scene.peakRgba<=67108864);assert(scene.knownCPUBufferPeak<=16777216);
 const state=scene.canonicalFood,renderer=scene.renderer?.canonicalFood;assert(state&&renderer);assert.equal(renderer.enabled,true);assert.equal(renderer.pending,0);assert.equal(state.loading,false);assert.equal(state.reentryRequired,false);assert.equal(state.reserved,true);
 if(state.available===false){
  assert.equal(state.state,null);assert.equal(state.reason,'CANONICAL_FOOD_SOCKET_OCCUPIED');assert(Array.isArray(state.occupiedSlotIds)&&state.occupiedSlotIds.length>0);
  for(const selected of [state.render,renderer.selection]){assert.equal(selected?.available,false);assert.equal(selected.state,null);assert.equal(selected.reason,state.reason);assert.deepEqual(selected.occupiedSlotIds,state.occupiedSlotIds);}
  assert(renderer.binding===null||renderer.binding?.visible===false,'Occupied food must not be rendered');
 }else{
  assert.equal(state.available,true);assert(['empty','kibble','berry_plate','bonito_bowl'].includes(state.state));
  for(const selected of [state.render,renderer.selection]){assert.equal(selected?.available,true);assert.equal(selected.state,state.state);}
  assert.equal(renderer.binding?.visible,true);assert.equal(renderer.binding.state,state.state);assert(renderer.ledger,'Available rendered food requires its resource ledger');
 }
 if(renderer.ledger)for(const[key,limit]of Object.entries({rgba:67108864,knownCPU:16777216,estimatedGPU:12582912})){assert.equal(renderer.ledger.limits[key],limit);assert(renderer.ledger.total[key]<=limit&&renderer.ledger.peak[key]<=limit);}
 return {available:state.available,state:state.state,reason:state.reason??null,occupiedSlotIds:state.occupiedSlotIds??[],visible:renderer.binding?.visible??false,ledgerPresent:!!renderer.ledger};
}

/** Diagnostics only: no lifecycle override or forced worker/process exit. */
export function createWorkerLifecycle(file,identity){
 mkdirSync(path.dirname(file),{recursive:true});return (event,details={})=>{const row=JSON.stringify({at:new Date().toISOString(),pid:process.pid,identity,event,...details})+'\n';assert(Buffer.byteLength(row)<=2048);let bytes=0;try{bytes=statSync(file).size;}catch(error){if(error.code!=='ENOENT')throw error;}assert(bytes+Buffer.byteLength(row)<=32768,'Worker lifecycle evidence cap');appendFileSync(file,row);};
}
export function pausedActorWorld(scene){
 assert.equal(scene?.itemEditing,true);assert(scene.pauseReasons?.includes('item-editor'));assert.equal(scene.renderer?.paused,true);
 const world=scene.dynamicSample?.world;assert(scene.lastFrame?.ghost?.slotId,'Rendered editor frame required');assert.deepEqual(scene.lastFrame.root,world?.root,'Rendered editor root must match the current paused sample');assert(world&&['x','y','z'].every(k=>Number.isFinite(world.root?.[k]))&&Number.isFinite(world.heading),'Finite actual paused actor pose required');
 assert(world.feet&&Object.keys(world.feet).length>=2);for(const foot of Object.values(world.feet)){assert(['x','y','z'].every(k=>Number.isFinite(foot.position?.[k])));assert(Array.isArray(foot.solePolygon)&&foot.solePolygon.length>=3&&foot.solePolygon.every(p=>['x','y','z'].every(k=>Number.isFinite(p[k]))));}
 return structuredClone(world);
}
export function immutableIntent(item){assert(item&&Number.isFinite(item.createdAt)&&Number.isFinite(item.intentServerTime));return structuredClone(Object.fromEntries(['accountId','action','payload','clientActionId','intentServerTime','createdAt'].map(k=>[k,item[k]])));}
export function assertIntentCommand(item,command){const intent=immutableIntent(item);for(const key of ['accountId','action','payload','clientActionId','intentServerTime'])assert.deepEqual(intent[key],command[key]);return intent;}
