/** Mutation controls run only on disposable copies; reviewed application files stay untouched. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {verifyProductionUntouched} from '../verify-production.mjs';
import {verifyBoundaryTransfer} from '../verify-boundary-transfer.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const relativeContract='preview/yard-persistent-candidate/base-contract.json';
const sourceContract=JSON.parse(readFileSync(resolve(root,relativeContract)));
const temp=mkdtempSync(resolve(tmpdir(),'yard-closed-guard-'));
const copy=path=>{mkdirSync(dirname(resolve(temp,path)),{recursive:true});cpSync(resolve(root,path),resolve(temp,path),{recursive:true});};
copy('game-logic');
for(const row of [...sourceContract.productionFiles,...sourceContract.reviewedPlayerWiringChangeSet.closedRolloutFiles])copy(row.path);
for(const row of sourceContract.reviewedRollbackGuardChangeSet.files)copy(row.path);
for(const row of sourceContract.reviewedPresentationChangeSet.files)copy(row.path);
for(const path of [relativeContract,'preview/yard-persistent-candidate/history','preview/yard-persistent-candidate/overrides/routes/player.js','preview/yard-persistent-candidate/overrides/src/game-state/useGameHub.js','evidence/yard-player-rollout-file-delta.json'])copy(path);
test.after(()=>rmSync(temp,{recursive:true,force:true}));
const check=()=>verifyProductionUntouched({rootDir:temp});
function assertSemanticFailure(reason) {
  // Exercise the real closed defaults independently even when provenance now
  // catches a forged pin earlier. Never replace semantic negatives with hashes.
  const result=spawnSync(process.execPath,[resolve(root,'preview/yard-persistent-candidate/verify-closed-rollout.mjs'),temp],{
    cwd:temp,encoding:'utf8',timeout:30000,env:{...process.env,NODE_OPTIONS:'',DATABASE_URL:'',REDIS_URL:'',YARD_CANDIDATE_CI:'',YARD_PLAYER_WIRING_TEST:''},
  });
  assert.equal(result.error,undefined);assert.notEqual(result.status,0,'Changed closed semantics must fail in a fresh native process');
  assert.match(result.stderr+'\n'+result.stdout,reason);
}
function mutation(path,change,{repin=false}={}){
  const file=resolve(temp,path),before=readFileSync(file),contractFile=resolve(temp,relativeContract),contractBefore=readFileSync(contractFile);
  const after=Buffer.from(change(before.toString('utf8')));assert.notDeepEqual(after,before,'Negative control must actually change its target');
  writeFileSync(file,after);
  if(repin){
    const contract=JSON.parse(contractBefore),pin=[...contract.productionFiles,...contract.reviewedPlayerWiringChangeSet.closedRolloutFiles].find(row=>row.path===path);assert.ok(pin);
    const fingerprint={bytes:after.length,sha256:createHash('sha256').update(after).digest('hex')};Object.assign(pin,fingerprint);
    const opsFile=contract.reviewedRollbackGuardChangeSet.files.find(row=>row.path===path);if(opsFile)Object.assign(opsFile,fingerprint);
    const transition=contract.reviewedRollbackGuardChangeSet.transitions.find(row=>row.path===path);if(transition)transition.after=fingerprint;
    const presentationFile=contract.reviewedPresentationChangeSet.files.find(row=>row.path===path);if(presentationFile)Object.assign(presentationFile,fingerprint);
    const presentationTransition=contract.reviewedPresentationChangeSet.transitions.find(row=>row.path===path);if(presentationTransition)presentationTransition.after=fingerprint;
    writeFileSync(contractFile,JSON.stringify(contract));
  }
  return()=>{writeFileSync(file,before);writeFileSync(contractFile,contractBefore);};
}
test('reviewed closed defaults and wiring, rollback and presentation transition proofs pass',()=>{
  const result=check();assert.equal(result.rolloutEnabled,false);assert.equal(result.migratedYard,'read-only');assert.deepEqual(result.releasedActors,['mika']);
  assert.equal(result.boundary.reviewedProductionTransitions,9);assert.equal(result.boundary.unchangedProductionPins,15);
  assert.equal(result.boundary.presentationGuard.reviewedPinTransitions,4);assert.equal(result.boundary.presentationGuard.reviewedFiles,11);
  assert.equal(result.boundary.rollbackGuard.reviewedPinTransitions,2);assert.equal(result.boundary.rollbackGuard.reviewedFiles,8);
  const store=result.boundary.historicalProvenance.find(row=>row.path==='src/game-state/useGameHub.js');assert.equal(store.preIntegrationMatchesOriginal,false,'Inherited stale evidence must stay disclosed');
});
test('changed rollout bytes fail the protected hash before semantic verification',()=>{
  const restore=mutation('game-logic/yard-v2/release-policy.mjs',s=>s.replace('enabled: false','enabled: true'));
  try{assert.throws(check,/Production path differs.*release-policy/);}finally{restore();}
});
const controls=[
  ['player rollout','game-logic/yard-v2/release-policy.mjs',s=>s.replace('enabled: false','enabled: true'),/Player rollout must remain closed/],
  ['activation predecessor','game-logic/yard-v2/release-policy.mjs',s=>s.replace('requiredClosedPredecessor: null','requiredClosedPredecessor: {}'),/must not contain an activation predecessor/],
  ['legacy predecessor identity','game-logic/yard-v2/release-policy.mjs',s=>s.replace('729955b34481c629980e5a04606a88531d9ba1691e69312c9dcd366571e4380d','0'.repeat(64)),/Historical legacy identity must remain exact/],
  ...[['mochi','mochi'],['pebble','pebble'],['pip','pip'],['family','Family']].map(([id,label])=>[`${id} acceptance`,`game-logic/yard-v2/${id}-actor-profile.mjs`,s=>s.replace(/(["']?accepted["']?\s*:\s*)false/,'$1true'),new RegExp(`${label} acceptance must remain closed`)]),
  ['pip playback','game-logic/yard-v2/pip-actor-profile.mjs',s=>s.replace('"playbackReady": false','"playbackReady": true'),/pip playback must remain closed/],
  ...['willow','starlit','basil','sage'].map(id=>[`${id} playback`,'game-logic/yard-v2/media/family-actor-profiles.json',s=>{const data=JSON.parse(s);data[id].playbackReady=true;return JSON.stringify(data);},new RegExp(`${id} playback must remain closed`)]),
  ['released registry','game-logic/yard-v2/released-actor-profiles.mjs',s=>s.replace(':ACTOR_PROFILES;',':Object.freeze({...ACTOR_PROFILES,unexpected:ACTOR_PROFILES.mika});'),/unexpected/],
  ['wrapper fallback','src/games/companion-yard-v2/YardReleaseGame.jsx',s=>s.replace("const View=mode==='persistent'?Persistent:Legacy;",'const View=Persistent;'),/Wrapper must retain guarded legacy fallback/],
];
for(const [name,path,change,reason]of controls)test(`blindly repinning ${name} cannot pass the closed semantic guard`,()=>{
  const restore=mutation(path,change,{repin:true});try{assert.throws(check,/Presentation transfer must preserve/);assertSemanticFailure(reason);}finally{restore();}
});
test('boundary verifier rejects a rewritten unrelated production pin',()=>{
  const before=readFileSync(resolve(temp,relativeContract));const data=JSON.parse(before);data.productionFiles.find(row=>row.path==='src/App.jsx').sha256='0'.repeat(64);writeFileSync(resolve(temp,relativeContract),JSON.stringify(data));
  try{assert.throws(()=>verifyBoundaryTransfer({rootDir:temp}),/src\/App\.jsx|Presentation transfer/);}finally{writeFileSync(resolve(temp,relativeContract),before);}
});
test('archived evidence corruption cannot be treated as a fresh successful transition',()=>{
  const path='preview/yard-persistent-candidate/history/pre-player-rollout/production/routes/player.js',restore=mutation(path,s=>s+'\n');
  try{assert.throws(()=>verifyBoundaryTransfer({rootDir:temp}),/history\/pre-player-rollout/);}finally{restore();}
});
test('blindly repinning unrelated package edits cannot pass the chained reviewed transitions',()=>{
  const restore=mutation('package.json',s=>{const data=JSON.parse(s);data.dependencies.unreviewed='1.0.0';return JSON.stringify(data);},{repin:true});
  try{assert.throws(check,/Presentation files must retain independently reviewed identities/);}finally{restore();}
});
test('approved ops patch provenance cannot be silently replaced',()=>{
  const restore=mutation('preview/yard-persistent-candidate/history/pre-rollback-guard/approved-ops.patch',s=>s+'\n');
  try{assert.throws(check,/pre-rollback-guard\/approved-ops.patch/);}finally{restore();}
});

for(const path of ['src/App.jsx','src/app/gameChunks.jsx','src/index.css'])test(`blindly repinning ${path} cannot invent reviewed presentation approval`,()=>{
  const restore=mutation(path,s=>s+'\n/* unreviewed */\n',{repin:true});
  try{assert.throws(check,/Presentation files must retain independently reviewed identities/);}finally{restore();}
});
test('presentation archive corruption cannot be relabeled as the reviewed prior state',()=>{
  const path='preview/yard-persistent-candidate/history/pre-entry-presentation/production/src/App.jsx';
  const restore=mutation(path,s=>s+'\n');
  try{assert.throws(check,/history\/pre-entry-presentation\/production\/src\/App/);}finally{restore();}
});
test('the approved presentation patch cannot be silently replaced',()=>{
  const restore=mutation('preview/yard-persistent-candidate/history/pre-entry-presentation/approved-flash.patch',s=>s+'\n');
  try{assert.throws(check,/history\/pre-entry-presentation\/approved-flash.patch/);}finally{restore();}
});
test('dropping a reviewed browser assertion file fails the presentation proof',()=>{
  const file=resolve(temp,relativeContract),before=readFileSync(file),contract=JSON.parse(before);
  contract.reviewedPresentationChangeSet.files=contract.reviewedPresentationChangeSet.files.filter(row=>row.path!=='tests/e2e/game-entry-flash.spec.js');
  writeFileSync(file,JSON.stringify(contract));
  try{assert.throws(check,/Presentation files must retain independently reviewed identities/);}finally{writeFileSync(file,before);}
});
