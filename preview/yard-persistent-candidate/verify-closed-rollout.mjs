/** Verify actual exported production defaults without overlays or test loaders. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

export async function verifyClosedRollout(rootDir=fileURLToPath(new URL('../../',import.meta.url))) {
  const load=path=>import(pathToFileURL(resolve(rootDir,path)).href);
  const {YARD_PLAYER_RELEASE_POLICY:policy,usesPersistentYard}=await load('game-logic/yard-v2/release-policy.mjs');
  assert.equal(policy.enabled,false,'Player rollout must remain closed');
  assert.ok(Object.isFrozen(policy));
  assert.equal(policy.requiredClosedPredecessor,null,'Closed contract must not contain an activation predecessor');
  assert.deepEqual(policy.requiredLegacyPredecessor,{buildId:'84d252d4bee6ed75fe8d32c07ebdef4c9270c629',imageDigest:'sha256:729955b34481c629980e5a04606a88531d9ba1691e69312c9dcd366571e4380d'},'Historical legacy identity must remain exact');
  assert.ok(Object.isFrozen(policy.requiredLegacyPredecessor));
  assert.equal(usesPersistentYard({yard:{enabled:true}}),false);
  for(const marker of [null,{version:99}])assert.equal(usesPersistentYard({_yardV2:marker}),true,'Every stored marker must remain quarantined');
  const {yardReleasePresentation}=await load('src/games/companion-yard-v2/release-presentation.mjs');
  assert.equal(yardReleasePresentation({}),'legacy');
  for(const runtime of [{version:1,mutable:false},{version:99,mutable:true}])assert.equal(yardReleasePresentation({yardRuntime:runtime}),'read-only');
  const {initializeReleasedPlayerYard,executeReleasedYardAction,inspectReleasedYardGrantTarget,releasedYardSnapshot}=await load('game-logic/yard-v2/player-release.mjs');
  const held={_yardV2:null,yard:{opaque:['preserved']}},before=structuredClone(held);
  assert.equal(initializeReleasedPlayerYard(held,{now:0,simulate:true}).status,409);
  assert.equal(executeReleasedYardAction(held,'yard.collectGifts',{},{}).status,409);
  assert.equal(inspectReleasedYardGrantTarget(held).status,409);
  assert.equal(releasedYardSnapshot(held,{now:0}).yardRuntime.mutable,false);
  assert.deepEqual(held,before);
  const actors=[];
  for(const [name,prefix]of [['mochi','MOCHI'],['pebble','PEBBLE'],['pip','PIP']]){
    const module=await load(`game-logic/yard-v2/${name}-actor-profile.mjs`);
    assert.equal(module[`${prefix}_RELEASE_GATE`].accepted,false,`${name} acceptance must remain closed`);
    actors.push(module[`${prefix}_ACTOR_PROFILE`]);
  }
  const {FAMILY_RELEASE_GATE,FAMILY_ACTOR_PROFILES}=await load('game-logic/yard-v2/family-actor-profile.mjs');
  assert.equal(FAMILY_RELEASE_GATE.accepted,false,'Family acceptance must remain closed');
  actors.push(...Object.values(FAMILY_ACTOR_PROFILES));
  assert.equal(actors.length,7);
  for(const actor of actors)assert.equal(actor.playbackReady,false,`${actor.id} playback must remain closed`);
  const {YARD_ACTOR_PROFILES}=await load('game-logic/yard-v2/released-actor-profiles.mjs');
  assert.deepEqual(Object.keys(YARD_ACTOR_PROFILES),['mika']);
  const {getYardServerOptions}=await load('game-logic/yard-v2/yard-media.mjs');
  const {getMikaServerOptions,MIKA_SCENE}=await load('game-logic/yard-v2/mika-media.mjs');
  const server=getYardServerOptions();
  assert.deepEqual(Object.keys(server.actorProfiles),['mika']);
  assert.deepEqual(server.mediaRegistry,getMikaServerOptions().mediaRegistry,'Closed sources must not change the admitted registry');
  for(const binding of server.sourceRegistry.bindings.filter(b=>b.visitorId!=='mika_cat'))assert.equal(binding.playbackReady,false);
  const {YARD_PROP_PROFILES,YARD_RELEASED_SCENE}=await load('game-logic/yard-v2/released-prop-profiles.mjs');
  assert.deepEqual(Object.keys(YARD_PROP_PROFILES).sort(),['sun_cushion','yarn_mouse']);
  assert.equal(YARD_RELEASED_SCENE,MIKA_SCENE);
  const chunks=readFileSync(resolve(rootDir,'src/app/gameChunks.jsx'),'utf8');
  assert.match(chunks,/room: \(\) => import\("\.\.\/games\/companion-yard-v2\/YardReleaseGame\.jsx"\)/);
  const wrapper=readFileSync(resolve(rootDir,'src/games/companion-yard-v2/YardReleaseGame.jsx'),'utf8');
  assert.ok(wrapper.includes("React.lazy(()=>import('../companion-yard/CompanionYardGame.jsx'))"));
  assert.ok(wrapper.includes("yardReleasePresentation(state.snapshot)"));
  assert.ok(wrapper.includes("if(mode==='read-only')return <section"));
  assert.ok(wrapper.includes("const View=mode==='persistent'?Persistent:Legacy;"),'Wrapper must retain guarded legacy fallback');
  return {rolloutEnabled:false,migratedYard:'read-only',releasedActors:['mika'],sourceAcceptance:'closed'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await verifyClosedRollout(process.argv[2])));
