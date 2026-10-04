/** Reviewed code-owned release contract. No network, policy injection or writes. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

export const ACTIVE_CONTRACT_PATH='game-logic/yard-v2/active-release-contract.json';
export const ACTIVE_REVISION='yard-player-rollout/active-r1';
export const ACTORS=Object.freeze(['mika','mochi','pebble','pip','willow','starlit','basil','sage']);
export const PROPS=Object.freeze(['yarn_mouse','sun_cushion','leaf_pot','snack_table','moon_lamp','fountain_bowl']);
export const SOURCE_PINS=Object.freeze({
 'game-logic/yard-v2/release-policy.mjs':'dad5d515d329b4f73d8deed7ef5d48ad15541782e94db0b19f2d90362d5f9eec',
 'game-logic/yard-v2/mochi-actor-profile.mjs':'412b43826c380e3f0d3b1d37f30d3b5059bc140d589809e3e539029a06bc4313',
 'game-logic/yard-v2/pebble-actor-profile.mjs':'0af9977bbc35da9d9cc7e6120502bf431b093525ca7f1e5b3f24d90d8b562200',
 'game-logic/yard-v2/pip-actor-profile.mjs':'818796394a7c91182eebdf4a14243089edcdc90f558f68aeb29e41154f185ddc',
 'game-logic/yard-v2/family-actor-profile.mjs':'607ea60757995eb66c97261061d49c6f4db1fe2a1221c4656ec91ca0f13c1cb5',
 'game-logic/yard-v2/media/family-actor-profiles.json':'6a1bcd9b79891243e86cd2dc47e0af5e2d6f05a4798dfd99391db8184f052bd8',
});
export const MEDIA_PINS=Object.freeze({
 'public/assets/yard-mochi/runtime-media.json':'41dd78f72df7726393a1dca31ffe16ed67c774badf29d7fab7b514c208cbc859',
 'public/assets/yard-pebble/runtime-media.json':'c7828a7b760100ff972218607a245dadd0590de6d3d1cab1153ae50df71d3578',
});
export const PROMOTED_PATHS=Object.freeze([...Object.keys(SOURCE_PINS),...Object.keys(MEDIA_PINS)]);
export const fingerprint=bytes=>({bytes:Buffer.byteLength(bytes),sha256:createHash('sha256').update(bytes).digest('hex')});
const sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const commit=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
const digest=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
const reference=value=>typeof value==='string'&&value.trim()===value&&value.length>=8&&value.length<=2000&&!/[\r\n]/.test(value);
export function safePath(root,path){
 assert.equal(typeof path,'string');assert.ok(path&&!isAbsolute(path)&&!path.split('/').some(p=>!p||p==='.'||p==='..'),'Relative owned file required');
 const target=resolve(root,path),local=relative(root,target);assert.ok(local&&!local.startsWith('..')&&!isAbsolute(local));return target;
}
export function validateActivationInputs(input){
 assert.equal(input?.format,'yard-active-inputs/v1','Explicit reviewed activation inputs required');
 assert.equal(input.repository,'le-who/cc-gh','Exact reviewed repository required');
 const closed=input.closed,image=closed?.image,cap=closed?.compatibility;
 assert.ok(commit(closed?.buildId)&&digest(closed?.imageDigest),'Verified closed build and registry digest required');
 assert.ok(digest(image?.Id));assert.ok(Array.isArray(image.RepoDigests)&&image.RepoDigests.includes(`ghcr.io/${input.repository}@${closed.imageDigest}`),'Immutable repository image identity array required');
 assert.equal(image.Config?.Labels?.['org.opencontainers.image.revision'],closed.buildId);
 assert.equal(cap?.format,'cc-gh-yard-release-compatibility/v1');assert.equal(cap.buildId,closed.buildId);assert.equal(cap.policyRevision,'yard-player-rollout/closed-r1');
 assert.equal(cap.playerRolloutEnabled,false,'Predecessor must be closed');assert.equal(cap.closedQuarantineVerified,true,'Closed quarantine proof required');
 assert.ok(Array.isArray(cap.readableStorageFormats)&&cap.readableStorageFormats.includes('yard-persistent/v1'),'Storage format array required');assert.equal(cap.requiredClosedPredecessor,null);
 const evidence=input.acceptance;assert.ok(reference(evidence?.reviewReference),'Explicit acceptance review reference required');
 for(const kind of ['nativeDuration','eightPlayer','geometryEquivalence']){
  const row=evidence[kind];assert.ok(reference(row?.reference)&&sha(row?.artifactSha256)&&commit(row?.sourceCommit),`Reviewed ${kind} evidence identity required`);
 }
 assert.equal(evidence.nativeDuration.sourceCommit,'b92c84d685a1221cf6fdbde41624c901bc8b2f8f','Accepted historical native evidence must retain its original source identity');
 assert.equal(evidence.eightPlayer.runId,37181170572,'Use the explicitly accepted 59-case run; new evidence needs a reviewed tool update');
 return {repository:input.repository,closed:{buildId:closed.buildId,imageDigest:closed.imageDigest,imageId:image.Id,
  compatibilitySha256:fingerprint(JSON.stringify(cap)).sha256},acceptance:structuredClone(evidence)};
}
export function promoteExactBytes(path,bytes,closed){
 const expected=SOURCE_PINS[path]||MEDIA_PINS[path];assert.ok(expected,`Unreviewed promotion path: ${path}`);
 assert.equal(fingerprint(bytes).sha256,expected,`Closed bytes changed: ${path}`);
 const text=Buffer.isBuffer(bytes)?bytes.toString('utf8'):bytes;
 if(Object.hasOwn(MEDIA_PINS,path)){
  const data=JSON.parse(text);assert.equal(data.playbackReady,false);assert.equal(data.runtimeActivated,false);
  return JSON.stringify({...data,playbackReady:true,...(path.includes('yard-mochi/')?{runtimeActivated:true}:{})});
 }
 let output=text.replace(/(\b(?:enabled|accepted|playbackReady)"?\s*:\s*)false/g,'$1true');
 if(path.endsWith('/release-policy.mjs')){
  assert.ok(commit(closed?.buildId)&&digest(closed?.imageDigest),'No placeholder predecessor permitted');
  assert.equal(output.split("revision: 'yard-player-rollout/closed-r1'").length,2);
  assert.equal(output.split('requiredClosedPredecessor: null').length,2);
  output=output.replace("revision: 'yard-player-rollout/closed-r1'",`revision: '${ACTIVE_REVISION}'`)
   .replace('requiredClosedPredecessor: null',`requiredClosedPredecessor: Object.freeze(${JSON.stringify({buildId:closed.buildId,imageDigest:closed.imageDigest})})`);
 }
 return output;
}
export function verifyPromotionContract({rootDir,contract=JSON.parse(readFileSync(safePath(rootDir,ACTIVE_CONTRACT_PATH),'utf8')),read=path=>readFileSync(safePath(rootDir,path))}){
 assert.equal(contract.format,'yard-active-contract/v1');assert.equal(contract.mode,'ACTIVE');assert.equal(contract.revision,ACTIVE_REVISION);
 const inputs=validateActivationInputs(contract.inputs);assert.equal(contract.closedTree?.length,40);assert.ok(commit(contract.closedTree));
 const git=args=>{const r=spawnSync('git',args,{cwd:rootDir,maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr?.toString()||r.error?.message);return r.stdout;};
 assert.equal(git(['rev-parse',`${inputs.closed.buildId}^{tree}`]).toString().trim(),contract.closedTree,'Closed Git tree identity differs');
 const closedBytes=path=>git(['cat-file','blob',`${inputs.closed.buildId}:${path}`]);
 assert.deepEqual(contract.transitions.map(row=>row.path),PROMOTED_PATHS,'Exactly six source and two metadata transitions required');
 for(const row of contract.transitions){
  assert.equal(row.before.sha256,SOURCE_PINS[row.path]||MEDIA_PINS[row.path]);
  assert.equal(row.archive,`preview/yard-persistent-candidate/history/pre-activation/promoted-inputs/${row.path}`);
  const before=read(row.archive),after=read(row.path);assert.deepEqual(fingerprint(before),row.before,row.archive);assert.deepEqual(fingerprint(closedBytes(row.path)),row.before,'Original promotion bytes must belong to the closed image commit');
  const expected=promoteExactBytes(row.path,before,inputs.closed);assert.equal(Buffer.from(after).toString('utf8'),expected,`Only exact reviewed promotion allowed: ${row.path}`);
  assert.deepEqual(fingerprint(after),row.after,row.path);
 }
 const required=['preview/yard-persistent-candidate/base-contract.json','preview/yard-persistent-candidate/verify-production.mjs','preview/yard-persistent-candidate/verify-closed-rollout.mjs','preview/yard-persistent-candidate/checks/closed-rollout-guard.checks.mjs'];
 assert.deepEqual(contract.closedVerification.map(row=>row.original),required);
 for(const row of contract.closedVerification){assert.equal(row.archive,`preview/yard-persistent-candidate/history/pre-activation/closed-verification/${row.original}`);assert.deepEqual(fingerprint(read(row.archive)),row.fingerprint,row.archive);assert.deepEqual(fingerprint(closedBytes(row.original)),row.fingerprint,'Closed verifier must belong to the predecessor commit');}
 assert.equal(contract.closures.length,5);
 const closurePaths=['mochi','pebble','pip','eight'].map(id=>`recovery-tools/yard-canonical-${id}-qa/SOURCE-CLOSURE.json`).concat('recovery-tools/yard-canonical-eight-qa/MEDIA-CLOSURE.json');
 assert.deepEqual(contract.closures.map(row=>row.path),closurePaths);
 const audited=new Map();
 for(const row of contract.closures){
  const bytes=read(row.path);assert.deepEqual(fingerprint(bytes),row.fingerprint,row.path);assert.deepEqual(fingerprint(closedBytes(row.path)),row.fingerprint,'Closure must belong to the predecessor commit');
  const data=JSON.parse(bytes);assert.equal(data.runtimeActivated,false);assert.ok(Array.isArray(data.files)&&data.files.length>0);
  for(const file of data.files){const path=file.repositoryPath||file.path;safePath(rootDir,path);const key=path+':'+file.sha256;if(audited.has(key))continue;
   const changed=contract.transitions.find(t=>t.path===path),actual=read(changed?changed.archive:path);
   assert.equal(fingerprint(actual).sha256,file.sha256,`Historical closure mismatch: ${path}`);if(file.bytes!==undefined)assert.equal(actual.length,file.bytes,path);audited.set(key,true);
  }
 }
 return {status:'verified',mode:'ACTIVE',revision:ACTIVE_REVISION,closedBuildId:inputs.closed.buildId,transitions:8,historicalClosureFiles:audited.size,
  acceptanceReference:inputs.acceptance.reviewReference,contractSha256:fingerprint(JSON.stringify(contract)).sha256};
}
export async function verifyActiveRuntime(rootDir){
 const load=path=>import(pathToFileURL(safePath(rootDir,path)).href);
 const {YARD_PLAYER_RELEASE_POLICY:p}=await load('game-logic/yard-v2/release-policy.mjs');
 const contract=JSON.parse(readFileSync(safePath(rootDir,ACTIVE_CONTRACT_PATH),'utf8'));
 assert.equal(contract.format,'yard-active-contract/v1');assert.equal(contract.mode,'ACTIVE');assert.equal(contract.revision,ACTIVE_REVISION);validateActivationInputs(contract.inputs);
 assert.equal(p.enabled,true);assert.equal(p.revision,ACTIVE_REVISION);assert.ok(Object.isFrozen(p));
 assert.deepEqual(p.requiredClosedPredecessor,{buildId:contract.inputs.closed.buildId,imageDigest:contract.inputs.closed.imageDigest});assert.ok(Object.isFrozen(p.requiredClosedPredecessor));
 const {YARD_ACTOR_PROFILES:actors}=await load('game-logic/yard-v2/released-actor-profiles.mjs');
 const {YARD_PROP_PROFILES:props}=await load('game-logic/yard-v2/released-prop-profiles.mjs');
 const {getYardServerOptions}=await load('game-logic/yard-v2/yard-media.mjs');const options=getYardServerOptions();
 assert.deepEqual(Object.keys(actors),ACTORS);assert.deepEqual(options.actorProfiles,actors);assert.deepEqual(Object.keys(props),PROPS);
 assert.equal(options.mediaRegistry.bindings.length,10);assert.ok(Object.values(actors).every(p=>p.playbackReady===true));
 assert.ok(options.mediaRegistry.bindings.every(b=>b.playbackReady===true));
 return {actors:ACTORS,props:PROPS,bindings:10,policyRevision:p.revision,contractSha256:fingerprint(JSON.stringify(contract)).sha256};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{assert.equal(process.argv.length,3,'Usage: node scripts/yard-active-contract.mjs ROOT');const rootDir=resolve(process.argv[2]);
  assert.ok(!process.env.NODE_OPTIONS&&!process.env.YARD_PLAYER_WIRING_TEST&&!process.env.YARD_EIGHT_PLAYER_CANDIDATE_TEST,'No policy loader permitted');
  console.log(JSON.stringify({...verifyPromotionContract({rootDir}),runtime:await verifyActiveRuntime(rootDir)}));
 }catch(e){console.error(`ACTIVE verification failed: ${e.message}`);process.exitCode=1;}
}
