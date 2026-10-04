import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {CANDIDATE_SOURCE_PINS,candidateSource,assertEightCandidateBuild,assertEightCandidateApi,EIGHT_IDS,CANDIDATE_DIST} from './helpers/yard-eight-player-candidate.mjs';
import {actorAtlasPages,attributedDraw} from './helpers/yard-eight-atlas-attribution.mjs';
const root=resolve(import.meta.dirname,'..'),read=path=>readFileSync(resolve(root,path),'utf8');
const env={CI:'true',NODE_ENV:'test',YARD_EIGHT_PLAYER_CANDIDATE_TEST:'1',YARD_PLAYER_API_TEST:'1',YARD_V2_PG_TEST:'1',YARD_V2_PG_TARGET:'integrated',DEV_AUTH_ENABLED:'true',DATABASE_URL:'postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci',REDIS_URL:'',NODE_OPTIONS:'',YARD_CANDIDATE_CI:'',YARD_PLAYER_WIRING_TEST:''};
test('eight actor fixture is opt-in, disposable, loopback and rejects inherited loaders',()=>{
 assert.doesNotThrow(()=>assertEightCandidateBuild(env));assert.doesNotThrow(()=>assertEightCandidateApi(env));
 for(const patch of [{CI:'false'},{NODE_ENV:'production'},{YARD_EIGHT_PLAYER_CANDIDATE_TEST:''},{NODE_OPTIONS:'--import malicious.mjs'},{YARD_PLAYER_WIRING_TEST:'1'},{YARD_CANDIDATE_CI:'1'}])assert.throws(()=>assertEightCandidateBuild({...env,...patch}));
 for(const patch of [{YARD_PLAYER_API_TEST:''},{DEV_AUTH_ENABLED:'false'},{DATABASE_URL:'postgres://prod:prod@host:5432/prod'},{REDIS_URL:'redis://host'}])assert.throws(()=>assertEightCandidateApi({...env,...patch}));
});
test('exact six source modules change readiness only; modified source is rejected',()=>{
 const counts=[1,1,1,2,1,4];assert.equal(Object.keys(CANDIDATE_SOURCE_PINS).length,6);
 for(const [index,path]of Object.keys(CANDIDATE_SOURCE_PINS).entries()){
  const source=read(path),pattern=/(\b(?:enabled|accepted|playbackReady)"?\s*:\s*)false/g;
  assert.equal([...source.matchAll(pattern)].length,counts[index]);assert.equal(candidateSource(path,source),source.replace(pattern,'$1true'));
  assert.throws(()=>candidateSource(path,source+'\n'),/Unreviewed candidate source/);
 }
 assert.equal(candidateSource('game-logic/yard-v2/availability.mjs',read('game-logic/yard-v2/availability.mjs')),null);
 assert.ok(!read('vite.config.js').includes('yard-eight-player'));assert.ok(!read('server.js').includes('YARD_EIGHT_PLAYER_CANDIDATE_TEST'));
});
test('actual candidate registry and source preflight keep wear, food and activity restrictions',()=>{
 const script=`
 import assert from 'node:assert/strict';
 const {getYardServerOptions}=await import('./game-logic/yard-v2/yard-media.mjs');
 const {YARD_ACTOR_PROFILES}=await import('./game-logic/yard-v2/released-actor-profiles.mjs');
 const {YARD_PROP_PROFILES}=await import('./game-logic/yard-v2/released-prop-profiles.mjs');
 const {createAdmissionPolicy}=await import('./game-logic/yard-v2/orchestrator.mjs');
 const {candidate}=await import('./tests/helpers/yard-eight-domain-fixtures.mjs');
 const {YARD_GOODIES}=await import('./game-logic/yard-v2/catalog.mjs');
 const {getYardGoodieActivities}=await import('./game-logic/yard-v2/catalog.mjs');
 const options=getYardServerOptions(),policy=createAdmissionPolicy(options);
 assert.deepEqual(Object.keys(options.actorProfiles),${JSON.stringify(EIGHT_IDS)});assert.deepEqual(options.actorProfiles,YARD_ACTOR_PROFILES);
 assert.deepEqual(Object.keys(YARD_PROP_PROFILES),['yarn_mouse','sun_cushion','leaf_pot','snack_table','moon_lamp','fountain_bowl']);
 for(const id of ['pip','starlit'])for(const mult of [1,2]){const q=candidate(id,{uses:YARD_GOODIES[id==='pip'?'snack_table':'moon_lamp'].durability*mult,...(id==='starlit'?{activityId:'glow'}:{})}),before=JSON.stringify(q);assert.equal(policy(q).ok,false);assert.equal(JSON.stringify(q),before);}
 for(const condition of ['worn','broken'])assert.ok(!getYardGoodieActivities(YARD_GOODIES.moon_lamp,condition).some(a=>a.id==='glow'));
 for(const [id,foodId]of [['sage','kibble'],['starlit','berry_plate']]){const q=candidate(id);q.bowl.foodId=foodId;assert.equal(policy(q).code,'REQUIRED_PROP_OR_FOOD_UNAVAILABLE');}
 console.log('Exact eight profiles; unchanged condition/activity/food guards');`;
 const result=spawnSync(process.execPath,['--import','./tests/helpers/yard-eight-player-loader.mjs','--input-type=module','-e',script],{cwd:root,env:{...process.env,...env},encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
 assert.equal(result.status,0,result.stderr||result.error?.message);assert.match(result.stdout,/Exact eight profiles/);
});
test('fixture server fails before database import unless explicitly guarded',()=>{
 const result=spawnSync(process.execPath,['tests/helpers/yard-eight-player-server.mjs'],{cwd:root,env:{...process.env,YARD_EIGHT_PLAYER_CANDIDATE_TEST:'',NODE_OPTIONS:''},encoding:'utf8',timeout:5000});assert.notEqual(result.status,0);assert.match(result.stderr,/Explicit isolated eight-actor test required/);assert.doesNotMatch(result.stderr,/ERR_MODULE_NOT_FOUND/);
});
test('all eight actual production adapters accept exact candidate media and attribution',()=>{
 const r=spawnSync(process.execPath,['--import','./tests/helpers/yard-eight-player-loader.mjs','tests/helpers/yard-eight-media-checks.mjs'],{cwd:root,env:{...process.env,...env},encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024});assert.equal(r.status,0,r.stderr||r.error?.message);assert.equal((r.stdout.match(/Production adapter and exact atlas mapping verified:/g)||[]).length,8);
});
test('family pixels are attributed by exact physical page and crop, never a shared-root prefix',()=>{
 const manifest=id=>JSON.parse(read(`recovery-tools/yard-family-frozen/assets/yard-family/${id}/runtime-media.json`));
 const willow=actorAtlasPages(manifest('willow'),'/assets/yard-family/willow/'),starlit=actorAtlasPages(manifest('starlit'),'/assets/yard-family/starlit/');
 const path=Object.keys(willow).find(p=>p.includes('willow-listen-new')),p=willow[path][0],index=p.offset;
 const row={url:`http://127.0.0.1${path}?yard-media=source`,sourceCrop:[index%p.cols*p.tileWidth,Math.floor(index/p.cols)*p.tileHeight,p.tileWidth,p.tileHeight],changedOpaquePixels:16};
 assert.ok(path.startsWith('/assets/yard-fox/'));assert.equal(attributedDraw(row,willow),true);assert.equal(attributedDraw(row,starlit),false);
 assert.equal(attributedDraw({...row,sourceCrop:[-1,0,p.tileWidth,p.tileHeight]},willow),false);assert.equal(attributedDraw({...row,changedOpaquePixels:0},willow),false);
});
test('real integration is bounded, separate from production artifacts and required in CI',()=>{
 const config=read('playwright.yard-eight-player.config.js'),spec=read('tests/yard-eight-player-e2e/player.spec.js'),ci=read('.github/workflows/ci.yml');
 assert.match(config,/workers:1,retries:0/);assert.match(config,/globalTimeout:14\*60\*1000/);assert.match(config,/reuseExistingServer:false/);
 assert.match(read('vite.yard-eight-player-candidate.config.js'),/outDir:CANDIDATE_DIST/);assert.notEqual(CANDIDATE_DIST,'dist');
 assert.match(spec,/window\.__yardEightDrawWitness/);assert.match(read('tests/helpers/yard-eight-canvas-witness.mjs'),/changedOpaquePixels/);
 for(const prohibited of [/route\.fulfill/,/page\.clock/,/useGameHub\.getState/,/setSnapshot/,/sourceCatalogActionPolicy/])assert.doesNotMatch(spec,prohibited);
 assert.match(ci,/yard-eight-player:/);assert.match(ci,/needs: \[test, browser, touch, mochi, yard-eight-player, yard-player\]/);
 assert.match(ci,/playwright test --config playwright\.yard-eight-player\.config\.js/);assert.match(ci,/yard-eight-player-fixtures\.mjs --all/);
 assert.doesNotMatch(ci,/path: dist-yard-eight-player-candidate/);
});
