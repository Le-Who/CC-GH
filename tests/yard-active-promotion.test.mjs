import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,symlinkSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {ACTIVE_CONTRACT_PATH,ACTIVE_REVISION,SOURCE_PINS,MEDIA_PINS,PROMOTED_PATHS,fingerprint,validateActivationInputs,promoteExactBytes,verifyPromotionContract} from '../scripts/yard-active-contract.mjs';
import {assemblePromotion,verifyEffectiveParity,preparePromotion} from '../scripts/yard-active-promotion.mjs';

// This override selects read-only test inputs, never a production policy.
const root=resolve(process.env.YARD_PROMOTION_TEST_SOURCE_ROOT||process.cwd());
const git=args=>{const r=spawnSync('git',args,{cwd:root,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr.toString());return r.stdout;};
const buildId=git(['rev-parse','HEAD']).toString().trim(),closedTree=git(['rev-parse','HEAD^{tree}']).toString().trim();
const original=path=>git(['cat-file','blob',`${buildId}:${path}`]);
// Fabricated identities exist only in these in-memory unit inputs. No overlay,
// image, acceptance receipt or production input file is created by these tests.
const fixtureInputs=()=>({format:'yard-active-inputs/v1',repository:'le-who/cc-gh',closed:{buildId,imageDigest:'sha256:'+'1'.repeat(64),
 image:{Id:'sha256:'+'2'.repeat(64),RepoDigests:['ghcr.io/le-who/cc-gh@sha256:'+'1'.repeat(64)],Config:{Labels:{'org.opencontainers.image.revision':buildId},Env:['UNRELATED_VALUE=not-persisted']}},
 compatibility:{format:'cc-gh-yard-release-compatibility/v1',buildId,policyRevision:'yard-player-rollout/closed-r1',playerRolloutEnabled:false,readableStorageFormats:['yard-persistent/v1'],closedQuarantineVerified:true,requiredClosedPredecessor:null}},
 acceptance:{reviewReference:'test-fixture:review-only',...Object.fromEntries(['nativeDuration','eightPlayer','geometryEquivalence'].map(kind=>[kind,{reference:`test-fixture:${kind}`,artifactSha256:'3'.repeat(64),sourceCommit:kind==='nativeDuration'?'b92c84d685a1221cf6fdbde41624c901bc8b2f8f':buildId,...(kind==='eightPlayer'?{runId:37181170572}:{})}]))}});
const assembled=()=>assemblePromotion({read:original,inputs:fixtureInputs(),closedTree});
const check=({contract,files})=>verifyPromotionContract({rootDir:root,contract,read:path=>files.has(path)?Buffer.from(files.get(path)):readFileSync(resolve(root,path))});

test('missing verified inputs and activation predecessors fail closed',()=>{
 for(const value of [undefined,{}, {format:'yard-active-inputs/v1'}])assert.throws(()=>validateActivationInputs(value));
 for(const change of [d=>delete d.closed,d=>d.closed.imageDigest='latest',d=>d.closed.compatibility.playerRolloutEnabled=true,d=>d.closed.compatibility.closedQuarantineVerified=false,d=>d.closed.image.RepoDigests=[],d=>d.closed.image.RepoDigests=d.closed.image.RepoDigests[0],d=>d.closed.compatibility.readableStorageFormats='yard-persistent/v1',d=>d.closed.image.Config.Labels['org.opencontainers.image.revision']='f'.repeat(40),d=>delete d.acceptance.reviewReference,d=>delete d.acceptance.nativeDuration.artifactSha256,d=>d.acceptance.eightPlayer.runId=1]){
  const data=fixtureInputs();change(data);assert.throws(()=>validateActivationInputs(data));
 }
 assert.throws(()=>promoteExactBytes('game-logic/yard-v2/release-policy.mjs',original('game-logic/yard-v2/release-policy.mjs'),null),/No placeholder/);
});
test('only six exact source modules and two manifest wrappers can be promoted',()=>{
 assert.equal(Object.keys(SOURCE_PINS).length,6);assert.equal(Object.keys(MEDIA_PINS).length,2);
 for(const path of PROMOTED_PATHS){const before=original(path),after=promoteExactBytes(path,before,fixtureInputs().closed);assert.notEqual(after,before.toString());assert.throws(()=>promoteExactBytes(path,Buffer.concat([before,Buffer.from('\n')]),fixtureInputs().closed),/Closed bytes changed/);}
 assert.throws(()=>promoteExactBytes('game-logic/yard-v2/availability.mjs','',fixtureInputs().closed),/Unreviewed promotion path/);
});
test('Mochi and Pebble promotion preserves every nested source and pixel descriptor',()=>{
 for(const path of Object.keys(MEDIA_PINS)){
  const before=JSON.parse(original(path)),after=JSON.parse(promoteExactBytes(path,original(path),fixtureInputs().closed));
  assert.equal(after.playbackReady,true);assert.equal(after.runtimeActivated,path.includes('yard-mochi/'));
  assert.deepEqual({...after,playbackReady:false,runtimeActivated:false},before);
  if(path.includes('yard-mochi/'))for(const source of Object.values(after.sourceMedia)){assert.equal(source.playbackReady,false);assert.equal(source.runtimeActivated,false);}
 }
});
test('assembly archives exact closed controls, sanitizes image inputs and contains no policy bypass',()=>{
 const {contract,files}=assembled();assert.equal(files.size,21);assert.deepEqual(contract.transitions.map(r=>r.path),PROMOTED_PATHS);
 assert.equal(contract.closedVerification.length,4);assert.equal(contract.closures.length,5);assert.ok(files.has(ACTIVE_CONTRACT_PATH));
 assert.equal(contract.inputs.closed.image.Config.Env,undefined);
 const policy=String(files.get('game-logic/yard-v2/release-policy.mjs'));assert.ok(policy.includes(`revision: '${ACTIVE_REVISION}'`));assert.ok(policy.includes('enabled: true'));assert.ok(policy.includes(`"buildId":"${buildId}"`));assert.ok(policy.includes('requiredClosedPredecessor: Object.freeze('));assert.doesNotMatch(policy,/process\.env|location\.|URLSearchParams/);
 for(const path of PROMOTED_PATHS)assert.deepEqual(files.get(`preview/yard-persistent-candidate/history/pre-activation/promoted-inputs/${path}`),original(path));
});
test('actual frozen source/media closures and their historical Git identities remain verifiable',()=>{
 const result=check(assembled());assert.equal(result.mode,'ACTIVE');assert.equal(result.transitions,8);assert.ok(result.historicalClosureFiles>=978);
});
for(const [name,mutate]of [
 ['enabled gate closed again',({files})=>{const p='game-logic/yard-v2/release-policy.mjs';files.set(p,String(files.get(p)).replace('enabled: true','enabled: false'));}],
 ['partial actor readiness',({files})=>{const p='game-logic/yard-v2/media/family-actor-profiles.json',d=JSON.parse(files.get(p));d.sage.playbackReady=false;files.set(p,JSON.stringify(d));}],
 ['wrong metadata promotion',({files})=>{const p='public/assets/yard-pebble/runtime-media.json',d=JSON.parse(files.get(p));d.runtimeActivated=true;files.set(p,JSON.stringify(d));}],
 ['rewritten historical source',({files})=>{const p='preview/yard-persistent-candidate/history/pre-activation/promoted-inputs/game-logic/yard-v2/pip-actor-profile.mjs';files.set(p,Buffer.concat([files.get(p),Buffer.from('\n')]));}],
 ['wrong closed tree',({contract})=>{contract.closedTree='0'.repeat(40);}],
 ['missing accepted proof',({contract})=>{delete contract.inputs.acceptance.geometryEquivalence;}],
 ['missing transition',({contract})=>{contract.transitions.pop();}],
 ['closed mode relabel',({contract})=>{contract.mode='CLOSED';}],
])test(`ACTIVE contract rejects ${name} even if current hashes are repinned`,()=>{
 const prepared=assembled();mutate(prepared);for(const row of prepared.contract.transitions)row.after=fingerprint(prepared.files.get(row.path));assert.throws(()=>check(prepared));
});
test('rewriting a closure and its contract pin cannot replace historical evidence',()=>{
 const p=assembled(),row=p.contract.closures[0],data=JSON.parse(readFileSync(resolve(root,row.path)));data.files=data.files.slice(1);const text=JSON.stringify(data);p.files.set(row.path,text);row.fingerprint=fingerprint(text);assert.throws(()=>check(p),/Closure must belong/);
});
test('public preparation rejects an unverified checkout before any output write',async()=>{
 const inputs=fixtureInputs();inputs.closed.buildId='f'.repeat(40);inputs.closed.image.Config.Labels['org.opencontainers.image.revision']=inputs.closed.buildId;inputs.closed.compatibility.buildId=inputs.closed.buildId;
 await assert.rejects(()=>preparePromotion({sourceRoot:root,inputs,outputDir:resolve('/tmp','yard-must-not-be-written')}),/verified closed image commit/);
});
test('an outside symlink parent cannot direct preparation into the closed checkout',async()=>{
 const temporary=mkdtempSync(resolve(tmpdir(),'yard-promotion-parent-')),name='forbidden-'+temporary.split('/').at(-1),link=resolve(temporary,'closed-link'),inside=resolve(root,name);
 try{
  symlinkSync(root,link,'dir');assert.equal(existsSync(inside),false);
  await assert.rejects(()=>preparePromotion({sourceRoot:root,inputs:fixtureInputs(),outputDir:resolve(link,name)}),/Output must be outside the source checkout/);
  assert.equal(existsSync(inside),false,'No overlay may be created through the parent symlink');assert.equal(existsSync(resolve(link,name)),false);
 }finally{rmSync(temporary,{recursive:true,force:true});}
});
test('promoted defaults equal passed candidate profiles, registry, plans and native receipt outcomes',()=>{
 const parity=verifyEffectiveParity({sourceRoot:root,files:assembled().files});assert.equal(parity.actors.length,8);assert.equal(parity.planCount,24);assert.equal(parity.nativeCount,8);
});
