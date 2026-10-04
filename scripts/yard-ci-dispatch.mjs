/** Exact tree routing for CLOSED A and its narrowly promoted ACTIVE B. */
import assert from 'node:assert/strict';
import {readFileSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const buildExtensionUrl=new URL('./yard-active-build-transition.mjs',import.meta.url);
assert.equal(createHash('sha256').update(readFileSync(buildExtensionUrl)).digest('hex'),'247708d4e599d2772584a65d0d79cf817243f41009ad06f049fa89e8903d11f8','Reviewed build extension bytes changed');
const buildExtension=await import(buildExtensionUrl.href);
import {ACTIVE_CONTRACT_PATH,PROMOTED_PATHS,verifyPromotionContract,verifyActiveRuntime} from './yard-active-contract.mjs';
export const CLOSED_VERIFIERS=Object.freeze(['preview/yard-persistent-candidate/base-contract.json','preview/yard-persistent-candidate/verify-production.mjs','preview/yard-persistent-candidate/verify-closed-rollout.mjs','preview/yard-persistent-candidate/checks/closed-rollout-guard.checks.mjs']);
export const ADDED_PROMOTION_PATHS=Object.freeze([ACTIVE_CONTRACT_PATH,
 ...PROMOTED_PATHS.map(path=>`preview/yard-persistent-candidate/history/pre-activation/promoted-inputs/${path}`),
 ...CLOSED_VERIFIERS.map(path=>`preview/yard-persistent-candidate/history/pre-activation/closed-verification/${path}`)]);
export const FULL_PROMOTION_PATHS=Object.freeze([...PROMOTED_PATHS,...ADDED_PROMOTION_PATHS]);
const fullCommit=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
function git(root,args){const r=spawnSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout;}
export function parseGitTree(text){
 const entries=new Map();for(const row of text.split('\0').filter(Boolean)){
  const match=/^(\d{6}) (blob|tree|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(row);assert.ok(match,'Malformed Git tree entry');
  const [,mode,type,objectId,path]=match;assert.ok(!entries.has(path),'Duplicate Git path');entries.set(path,{mode,type,objectId});
 }return entries;
}
export function assertExactPromotionTree(before,after){
 const build=buildExtension.normalizeBuildTree(before,after);({before,after}=build);
 const expected=new Set(FULL_PROMOTION_PATHS),changed=[];
 assert.equal(expected.size,21);
 for(const path of new Set([...before.keys(),...after.keys()])){
  const a=before.get(path),b=after.get(path);if(JSON.stringify(a)===JSON.stringify(b))continue;
  assert.ok(expected.has(path),`Unrelated tree change outside promotion: ${path}`);changed.push(path);
  if(PROMOTED_PATHS.includes(path)){
   assert.ok(a&&b,`Existing promotion file must remain present: ${path}`);assert.equal(a.type,'blob');assert.equal(b.type,'blob');assert.ok(['100644','100755'].includes(a.mode));assert.equal(b.mode,a.mode,`Promotion file mode changed: ${path}`);
  }else{
   assert.equal(a,undefined,`Promotion evidence must be newly added: ${path}`);assert.equal(b?.type,'blob');assert.equal(b?.mode,'100644',`Regular new evidence file required: ${path}`);
  }
 }
 assert.deepEqual(changed.sort(),[...FULL_PROMOTION_PATHS].sort(),'Every exact promotion file must change, with no extra path');
 return {changedFiles:21,reviewedBuildToolingFiles:build.buildChanged,reviewedAcceptanceToolingFiles:build.acceptanceChanged,reviewedPlayerUiFiles:build.playerUiChanged,totalChangedFiles:21+build.changed,unchangedFiles:before.size-PROMOTED_PATHS.length-build.existingChanged};
}
export function assertCleanReleaseCheckout(root){
 assert.equal(git(root,['status','--porcelain=v1','--untracked-files=all']),'','Committed release boundary rejects dirty or untracked files');
}
export function verifyGitPromotionBoundary({rootDir,closedCommit,activeCommit,closedTree}){
 assert.ok(fullCommit(closedCommit)&&fullCommit(activeCommit)&&fullCommit(closedTree),'Exact A/B commit and A tree required');
 assertCleanReleaseCheckout(rootDir);assert.equal(git(rootDir,['rev-parse','HEAD']).trim(),activeCommit,'The checked working tree must be B');
 assert.notEqual(activeCommit,closedCommit,'Activation must be a later commit');
 assert.equal(git(rootDir,['rev-parse',`${closedCommit}^{tree}`]).trim(),closedTree);
 const ancestor=spawnSync('git',['merge-base','--is-ancestor',closedCommit,activeCommit],{cwd:rootDir,encoding:'utf8'});assert.equal(ancestor.status,0,'Closed A must be an ancestor of B');
 const before=parseGitTree(git(rootDir,['ls-tree','-rz','--full-tree',closedCommit]));
 const after=parseGitTree(git(rootDir,['ls-tree','-rz','--full-tree',activeCommit]));
 const buildProof=buildExtension.verifyBuildTransition({rootDir,closedCommit});
 return {...assertExactPromotionTree(before,after),closedCommit,activeCommit,closedTree,buildProof};
}
export function verifyClosedSource(rootDir,expectedCommit){
 assert.ok(fullCommit(expectedCommit));assertCleanReleaseCheckout(rootDir);
 assert.equal(git(rootDir,['rev-parse','HEAD']).trim(),expectedCommit,'CLOSED suites must run on their declared A commit');
 const tree=parseGitTree(git(rootDir,['ls-tree','-rz','--full-tree','HEAD']));assert.ok(!tree.has(ACTIVE_CONTRACT_PATH),'Closed checkout cannot contain an ACTIVE contract');
 const result=spawnSync(process.execPath,[resolve(rootDir,'preview/yard-persistent-candidate/verify-production.mjs')],{cwd:rootDir,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024,
  env:{...process.env,NODE_OPTIONS:'',DATABASE_URL:'',REDIS_URL:'',YARD_CANDIDATE_CI:'',YARD_PLAYER_WIRING_TEST:'',YARD_EIGHT_PLAYER_CANDIDATE_TEST:''}});
 assert.equal(result.status,0,result.stderr||result.error?.message);const verified=JSON.parse(result.stdout);
 assert.equal(verified.rolloutEnabled,false);assert.equal(verified.sourceAcceptance,'closed');assert.deepEqual(verified.releasedActors,['mika']);
 return {mode:'CLOSED',sourceCommit:expectedCommit,fullContract:verified};
}
export async function planYardRelease(rootDir){
 assert.ok(!process.env.NODE_OPTIONS&&!process.env.YARD_PLAYER_WIRING_TEST&&!process.env.YARD_EIGHT_PLAYER_CANDIDATE_TEST&&!process.env.YARD_CANDIDATE_CI,'No inherited policy loader allowed');
 assertCleanReleaseCheckout(rootDir);const head=git(rootDir,['rev-parse','HEAD']).trim(),tree=parseGitTree(git(rootDir,['ls-tree','-rz','--full-tree','HEAD']));
 if(!tree.has(ACTIVE_CONTRACT_PATH)){const closed=verifyClosedSource(rootDir,head);return {mode:'CLOSED',closed_ref:head,active_ref:head,closed_digest:'',contract_hash:'',reuse_closed:'false',closed};}
 const contract=JSON.parse(readFileSync(resolve(rootDir,ACTIVE_CONTRACT_PATH),'utf8')),closed=contract.inputs?.closed;
 const boundary=verifyGitPromotionBoundary({rootDir,closedCommit:closed?.buildId,activeCommit:head,closedTree:contract.closedTree});
 const promotion=verifyPromotionContract({rootDir}),runtime=await verifyActiveRuntime(rootDir);
 return {mode:'ACTIVE',closed_ref:closed.buildId,active_ref:head,closed_digest:closed.imageDigest,contract_hash:runtime.contractSha256,reuse_closed:Object.hasOwn(closed,'ciReceipt')?'true':'false',boundary,promotion,runtime};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [command,argument]=process.argv.slice(2),root=process.cwd();assert.ok(['--plan','--verify-active','--assert-closed-ref'].includes(command));
  if(command==='--assert-closed-ref')console.log(JSON.stringify(verifyClosedSource(root,argument)));
  else{assert.equal(argument,undefined);const result=await planYardRelease(root);if(command==='--verify-active')assert.equal(result.mode,'ACTIVE');
   if(command==='--plan'&&process.env.GITHUB_OUTPUT)for(const key of ['mode','closed_ref','active_ref','closed_digest','contract_hash','reuse_closed'])appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${result[key]}\n`);
   console.log(JSON.stringify(result));
  }
 }catch(e){console.error(`Yard CI dispatch blocked: ${e.message}`);process.exitCode=1;}
}
