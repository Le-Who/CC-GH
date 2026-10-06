/** Preparation-safe static/functional guards; no database, browser, listener or decoder starts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {REQUIRED_ORIGINALS,verifyRequiredEvidence,readEvidenceJSON} from './required-evidence.mjs';
import {fixtureServiceSource,SERVICE_SIGNATURES} from './source-gate.mjs';
import {assertCanonicalPgEnvironment} from '../../tests/helpers/yard-canonical-pg-guard.mjs';
import {BASE,BRANCH,LIMITS} from './identity.mjs';
const read=p=>fs.readFile(new URL(p,import.meta.url),'utf8'),digest=s=>createHash('sha256').update(s).digest('hex');
const env={YARD_CANONICAL_PG_TEST:'1',YARD_V2_PG_TEST:'1',YARD_V2_PG_TARGET:'integrated',CI:'true',NODE_ENV:'test',DATABASE_URL:'postgres://ccgh_merge_ci:ccgh_merge_ci@127.0.0.1:5432/ccgh_merge_ci',REDIS_URL:'',NODE_OPTIONS:'',YARD_CANDIDATE_CI:'',YARD_CANONICAL_API_TEST:'',YARD_PLAYER_API_TEST:'',YARD_PLAYER_WIRING_TEST:''};
test('exact trusted options seam fails on source drift and alters only three function prologues',async()=>{
 const source=await read('../../game-logic/yard-v2/service.mjs'),url=new URL('./fixture-options.mjs',import.meta.url).href,patched=fixtureServiceSource(source,digest(source),url);
 assert.equal(patched.split('options=__foodFixtureOptions(player,options);').length,4);
 let restored=patched.slice(patched.indexOf('\n')+1);for(const signature of SERVICE_SIGNATURES)restored=restored.replace(signature+'\n  options=__foodFixtureOptions(player,options);',signature);assert.equal(restored,source);
 assert.throws(()=>fixtureServiceSource(source+'\n',digest(source),url));assert.throws(()=>fixtureServiceSource(source,digest(source),'https://untrusted.invalid/options.mjs'));assert.throws(()=>fixtureServiceSource(source.replace(SERVICE_SIGNATURES[0],''),digest(source),url));
});
test('disposable destination/auth admission rejects live host, credentials overrides and missing API opt-in',()=>{
 assert.doesNotThrow(()=>assertCanonicalPgEnvironment(env));
 for(const patch of [{DATABASE_URL:env.DATABASE_URL.replace('127.0.0.1','production.example')},{DATABASE_URL:env.DATABASE_URL+'?ssl=true'},{PGHOST:'production.example'},{PGPASSWORD:'unexpected'},{NODE_OPTIONS:'--import wrong.mjs'},{DOTENV_CONFIG_PATH:'.env'},{YARD_PLAYER_WIRING_TEST:'1'},{YARD_CANONICAL_PG_TEST:''}])assert.throws(()=>assertCanonicalPgEnvironment({...env,...patch}));
 assert.throws(()=>assertCanonicalPgEnvironment(env,{api:true}));assert.doesNotThrow(()=>assertCanonicalPgEnvironment({...env,YARD_CANONICAL_API_TEST:'1',YARD_PLAYER_API_TEST:'1',DEV_AUTH_ENABLED:'true'},{api:true}));
});
test('finite workflow is one branch, first newly created push, one standard job, ten minutes, read permission and three-day originals',async()=>{
 const s=await read('../../.github/workflows/yard-food-native.yml');assert(s.includes(`branches: ['${BRANCH}']`));for(const token of ['github.run_attempt == 1','github.event.created == true','github.event.forced == false','runs-on: ubuntu-24.04','timeout-minutes: 10','contents: read','retention-days: 3','compression-level: 0','fetch-depth: 2','persist-credentials: false'])assert(s.includes(token),token);
 assert(!/workflow_dispatch:|secrets\.|contents: write|pull_request:|deploy/i.test(s));assert.equal((s.match(/^  acceptance:/gm)||[]).length,1);assert.equal(LIMITS.artifactBytes,8388608);assert.equal(LIMITS.retries,0);assert.equal(BASE,'32981e328fbfc7993eb08c3bfcf6eb7634dceb53');
});
test('baseline full HUD is unchanged and recorded call chain has no screenshot/readback capture',async()=>{
 const config=await read('./config.mjs');assert(config.includes('**/yard-canonical-acceptance/hud.spec.mjs'));assert(config.includes('**/yard-food-native/food.spec.mjs'));for(const token of ['workers:1','retries:0','globalTimeout:220000','reuseExistingServer:false'])assert(config.includes(token));
 for(const f of ['./recorded-flow.mjs','./browser.mjs']){const s=await read(f);assert(!/\.(screenshot|readPixels|captureStream|toDataURL|toBlob)\s*\(/.test(s));assert(!/\bcapture\s*\(/.test(s));}
 const recording=await read('./recorded-flow.mjs');assert(recording.includes('await c.close()'));assert(recording.includes('await video.path()'));assert(recording.includes('food-observed-motion.json'));assert(recording.includes("toBe('settled')"));
});
test('all raw evidence uses unchanged lossless packager and failure conditions cannot produce a green receipt',async()=>{
 const s=await read('./evidence.mjs');assert(s.includes("import {packageEvidence} from '../yard-canonical-acceptance/package-evidence.mjs'"));for(const token of ['matrix?.length===11','affectedHud?.length===6','nativeStateCaptures?.length===4','transactions?.length===12','encoded.passed===true','!passed||!result.ok'])assert(s.includes(token),token);
 const analysis=await read('./analyze.mjs');assert(analysis.includes("from '../yard-placement-redraw/encoded-frames.mjs'"));assert(analysis.includes('decoded.passed&&intervalGate&&eventGate'));assert(analysis.includes('startup'));assert(analysis.includes('dialog-occluded'));
});
test('current domain rollback and resource cases remain source/API checks, not fabricated native proof',async()=>{
 const suites=JSON.parse(await read('./source-suites.json')).tests;for(const f of ['tests/yard-canonical-food-location.test.mjs','tests/yard-canonical-food-api.test.mjs','tests/yard-canonical-food-outbox.test.mjs','tests/yard-canonical-food-renderer.test.mjs','tests/yard-canonical-food-host-navigation.test.mjs'])assert(suites.includes(f));
 const spec=await read('./food.spec.mjs');assert(!/route\.fulfill|setState\(|localStorage\.setItem|evaluate\([^]*performReliableAction/.test(spec));assert(spec.includes("route.abort('connectionfailed')"));assert(spec.includes('requiresUserDecision'));assert(spec.includes('canonical-v2'));
});

test('missing or empty mandatory originals fail completeness even when browser metadata claims success',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'food-evidence-complete-'));try{for(const name of REQUIRED_ORIGINALS)await fs.writeFile(path.join(dir,name),'qualification fixture');const browser={captures:['extra-claimed.webp'],food:{nativeStateCaptures:[{file:REQUIRED_ORIGINALS[11]}]}};await fs.writeFile(path.join(dir,'extra-claimed.webp'),'fixture');assert.equal((await verifyRequiredEvidence(dir,browser)).complete,true);
 const missing='food-state-kibble-390x844-dpr2-native.png';await fs.unlink(path.join(dir,missing));let check=await verifyRequiredEvidence(dir,browser);assert.equal(check.complete,false);assert(check.issues.some(r=>r.path===missing));await fs.writeFile(path.join(dir,missing),'fixture');await fs.writeFile(path.join(dir,'food-observed-motion.json'),'');check=await verifyRequiredEvidence(dir,browser);assert.equal(check.complete,false);assert(check.issues.some(r=>r.path==='food-observed-motion.json'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('truncated metadata becomes an explicit failure without destroying or hiding the raw original',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'food-evidence-malformed-'));try{const original='{"sections":{"food":';await fs.writeFile(path.join(dir,'browser.json'),original);const result=await readEvidenceJSON(dir,'browser.json');assert.equal(result.missingOrInvalid,true);assert.equal(result.sections,undefined);assert.equal(await fs.readFile(path.join(dir,'browser.json'),'utf8'),original);assert.equal((await verifyRequiredEvidence(dir,result)).complete,false);assert.equal((await readEvidenceJSON(dir,'missing.json')).missingOrInvalid,true);for(const text of ['null','[]','42','\"scalar\"']){await fs.writeFile(path.join(dir,'browser.json'),text);assert.equal((await readEvidenceJSON(dir,'browser.json')).missingOrInvalid,true);}
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
