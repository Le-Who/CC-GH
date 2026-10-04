/** Short ACTIVE equivalents using ordinary production imports and built media. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyActiveRuntime,ACTORS} from './yard-active-contract.mjs';
export async function checkActiveYard(root){
 assert.ok(!process.env.NODE_OPTIONS&&!process.execArgv.some(a=>/^--(?:import|(?:experimental-)?loader)(?:=|$)/.test(a))&&!process.env.YARD_PLAYER_WIRING_TEST&&!process.env.YARD_EIGHT_PLAYER_CANDIDATE_TEST&&!process.env.YARD_CANDIDATE_CI,'Ordinary production imports required');
 const runtime=await verifyActiveRuntime(root),load=path=>import(pathToFileURL(resolve(root,path)).href);
 const {getYardServerOptions}=await load('game-logic/yard-v2/yard-media.mjs'),options=getYardServerOptions();
 const {createAdmissionPolicy}=await load('game-logic/yard-v2/orchestrator.mjs');const policy=createAdmissionPolicy(options);
 const {nativePlayer,candidate,NOW,H}=await load('tests/helpers/yard-eight-domain-fixtures.mjs');
 const {YARD_GOODIES}=await load('game-logic/yard-v2/catalog.mjs');
 const {initializeReleasedPlayerYard,executeReleasedYardAction,releasedYardSnapshot}=await load('game-logic/yard-v2/player-release.mjs');
 const {createActorMediaEntry}=await load('src/games/companion-yard-v2/actor-media.mjs');
 const {MIKA_CLIPS}=await load('game-logic/yard-v2/media/mika-clips.mjs');const {MIKA_ACTOR_REFERENCE}=await load('game-logic/yard-v2/actor-profiles.mjs');
 const {createMochiActorMediaEntry}=await load('src/games/companion-yard-v2/mochi-actor-media.mjs');
 const {createPebbleActorMediaEntry}=await load('src/games/companion-yard-v2/pebble-actor-media.mjs');
 const {createPipActorMediaEntry}=await load('src/games/companion-yard-v2/pip-actor-media.mjs');
 const {createFamilyActorMediaEntry}=await load('src/games/companion-yard-v2/family-actor-media.mjs');
 const witnesses=[];
 for(const id of ACTORS){
  const family=['willow','starlit','basil','sage'].includes(id),path=family?`assets/yard-family/${id}/runtime-media.json`:`assets/yard-${id}/runtime-media.json`;
  const manifest=JSON.parse(readFileSync(resolve(root,'dist',path))),args={assetBaseURL:new URL(path.replace('runtime-media.json',''),'http://127.0.0.1').href,profiles:options.actorProfiles};
  const construct=m=>id==='mika'?createActorMediaEntry(m,{...args,reference:MIKA_ACTOR_REFERENCE,clips:MIKA_CLIPS}):id==='mochi'?createMochiActorMediaEntry(m,args):id==='pebble'?createPebbleActorMediaEntry(m,args):id==='pip'?createPipActorMediaEntry(m,args):createFamilyActorMediaEntry(id,m,args);
  assert.equal(construct(manifest).profile.id,id);
  if(['mochi','pebble'].includes(id)){assert.equal(manifest.playbackReady,true);assert.equal(manifest.runtimeActivated,id==='mochi');assert.throws(()=>construct({...manifest,playbackReady:false}),/mismatch/);}
  if(id==='pip'||family){assert.equal(manifest.playbackReady,false);assert.equal(manifest.runtimeActivated,false);assert.throws(()=>construct({...manifest,playbackReady:true}),/mismatch|Frozen/);}
  if(id==='mochi'){const bad=structuredClone(manifest);bad.sourceMedia.combined.playbackReady=true;assert.throws(()=>construct(bad),/cannot activate/);}
  const p=nativePlayer(id),outside=structuredClone({resources:p.resources,garden:p.garden,merge:p.merge,futureAccount:p.futureAccount});
  assert.equal(initializeReleasedPlayerYard(p,{now:NOW}).status,200);const archive=JSON.stringify(p._yardV2.migration.rawBackup);
  assert.equal(initializeReleasedPlayerYard(p,{now:NOW+H,simulate:true}).status,200);assert.equal(JSON.stringify(p._yardV2.migration.rawBackup),archive);
  const visits=Object.values(p._yardV2.runtime.visits);assert.equal(visits.length,1,id);assert.equal(visits[0].original.visitorId,options.actorProfiles[id].visitorId);
  const snapshot=releasedYardSnapshot(p,{now:NOW+H});assert.equal(snapshot.yardRuntime.mutable,true);assert.equal(snapshot.yardRuntime.actionProtocol,'yard-v2:');assert.equal(snapshot.yardRuntime.visits[0].renderCompatible,true);
  const end=visits[0].leavesAt;assert.equal(initializeReleasedPlayerYard(p,{now:end,simulate:true}).status,200);assert.equal(p.yard.pendingGifts.length,1);
  const actionId=`yard-v2:active-equivalent-${id}`;assert.equal(executeReleasedYardAction(p,'yard.collectGifts',{}, {now:end,actionId}).status,200);
  const before=JSON.stringify(p);assert.equal(executeReleasedYardAction(p,'yard.collectGifts',{}, {now:end+1,actionId}).replayed,true);assert.equal(JSON.stringify(p),before);
  assert.deepEqual({resources:p.resources,garden:p.garden,merge:p.merge,futureAccount:p.futureAccount},outside);
  for(const [action,payload]of [['yard.buyExpansion',{}],['yard.setRemodel',{remodelId:'zen'}]])assert.equal(executeReleasedYardAction(p,action,payload,{now:end,actionId:`yard-v2:${id}-${action}`}).status,409);
  witnesses.push({id,visitId:visits[0].visitId,minutes:(visits[0].leavesAt-visits[0].arrivedAt)/60000});
 }
 for(const id of ['pip','starlit'])for(const mult of [1,2]){const base=candidate(id),uses=YARD_GOODIES[base.placement.goodieId].durability*mult,q=candidate(id,{uses,...(id==='starlit'?{activityId:'glow'}:{})}),before=JSON.stringify(q);assert.equal(policy(q).ok,false);assert.equal(JSON.stringify(q),before);}
 for(const id of ['willow','starlit','basil','sage'])for(const mult of [1,2]){const q=candidate(id),uses=YARD_GOODIES[q.placement.goodieId].durability*mult;assert.equal(policy(candidate(id,{uses})).ok,true);}
 for(const [id,foodId]of [['sage','kibble'],['starlit','berry_plate']]){const q=candidate(id);q.bowl.foodId=foodId;assert.equal(policy(q).code,'REQUIRED_PROP_OR_FOOD_UNAVAILABLE');}
 for(const marker of [null,{version:99,format:'future'}]){const p=nativePlayer('mika');p._yardV2=marker;const before=JSON.stringify(p);assert.equal(initializeReleasedPlayerYard(p,{now:NOW,simulate:true}).status,409);assert.equal(releasedYardSnapshot(p,{now:NOW}).yardRuntime.mutable,false);assert.equal(JSON.stringify(p),before);}
 return {status:'passed',scope:'Ordinary ACTIVE production defaults, built manifests, native domain and receipt equivalents; no HTTP/browser claim',runtime,witnesses};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{assert.equal(process.argv.length,2);console.log(JSON.stringify(await checkActiveYard(process.cwd())));}catch(e){console.error(`ACTIVE equivalents failed: ${e.message}`);process.exitCode=1;}}
