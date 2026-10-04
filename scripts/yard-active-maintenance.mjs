/** Compatible maintenance kernel. No release is authorized by this module.
 * The approved record hash must come from an independently approved release
 * record, never from the candidate, an environment flag, or a computed default. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {verifyMaintenanceBootstrap} from './yard-maintenance-bootstrap.mjs';

export const RECORD_PATH='game-logic/yard-v2/maintenance-release-contract.json';
export const CHECKS=Object.freeze(['ordinary-build','active-runtime','cross-game','predecessor-candidate-predecessor','durability-replay','service-worker','storage-compatibility']);
const repository='le-who/cc-gh',sha=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),commit=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value),digest=value=>typeof value==='string'&&/^sha256:[a-f0-9]{64}$/.test(value);
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const blobId=bytes=>createHash('sha1').update(`blob ${Buffer.byteLength(bytes)}\0`).update(bytes).digest('hex');
const keys=(value,expected)=>{assert.ok(value&&typeof value==='object'&&!Array.isArray(value));assert.deepEqual(Object.keys(value).sort(),[...expected].sort());};
function ownedPath(path){assert.equal(typeof path,'string');assert.ok(path.length<500&&/^[A-Za-z0-9_.\/-]+$/.test(path)&&!path.startsWith('/')&&!path.split('/').some(x=>!x||x==='.'||x==='..'||x==='.git'),'Invalid owned source path');}
// This version handles compatible game maintenance. Release machinery, package
// changes and storage migrations need their own separately reviewed evolution.
export function protectedPath(path){return path===RECORD_PATH||path.startsWith('.github/')||path.startsWith('preview/yard-persistent-candidate/')||path.startsWith('recovery-tools/')||path.startsWith('migrations/')||path.startsWith('game-logic/yard-v2/')||path.startsWith('public/assets/yard-')||path.startsWith('scripts/')||/^tests\/(helpers\/)?yard-/.test(path)||/^playwright\./.test(path)||/^vite\./.test(path)||['Dockerfile','.dockerignore','.npmrc','.nvmrc','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','postcss.config.js','docker-compose.yml','db.js'].includes(path);}
function object(row){if(row===null)return;keys(row,['mode','type','objectId']);assert.ok(['100644','100755'].includes(row.mode));assert.equal(row.type,'blob');assert.ok(commit(row.objectId));}
export function parseMaintenanceRecord(bytes,approvedRecordSha256){
 assert.ok(sha(approvedRecordSha256),'Independent approved record hash required');assert.equal(sha256(bytes),approvedRecordSha256,'Candidate record differs from independently approved bytes');
 const record=JSON.parse(bytes);keys(record,['format','repository','anchor','predecessor','storage','affectedGames','changes',...(Object.hasOwn(record,'bootstrapSha256')?['bootstrapSha256']:[])]);
 if(Object.hasOwn(record,'bootstrapSha256'))assert.ok(sha(record.bootstrapSha256));
 assert.equal(record.format,'cc-gh-yard-active-maintenance/v1');assert.equal(record.repository,repository);
 keys(record.anchor,['commit','tree','imageDigest','contractSha256','closedBuildId','closedImageDigest']);
 const a=record.anchor;assert.ok(commit(a.commit)&&commit(a.tree)&&digest(a.imageDigest)&&sha(a.contractSha256)&&commit(a.closedBuildId)&&digest(a.closedImageDigest));
 keys(record.predecessor,['commit','tree','imageDigest','imageId','compatibilitySha256','acceptanceReceiptSha256']);
 const p=record.predecessor;assert.ok(commit(p.commit)&&commit(p.tree)&&digest(p.imageDigest)&&digest(p.imageId)&&sha(p.compatibilitySha256)&&sha(p.acceptanceReceiptSha256));
 assert.notEqual(p.commit,a.closedBuildId,'Maintenance predecessor must be ACTIVE');
 keys(record.storage,['format','mode']);assert.equal(record.storage.format,'yard-persistent/v1');assert.equal(record.storage.mode,'same-format-no-migration');
 assert.ok(Array.isArray(record.affectedGames)&&(record.affectedGames.length>0||record.bootstrapSha256)&&record.affectedGames.length<=12);
 assert.ok(record.affectedGames.every(x=>['settlement','blox','merge','match3','room','yard','garden','home','cross-game'].includes(x)));assert.equal(new Set(record.affectedGames).size,record.affectedGames.length);
 assert.ok(Array.isArray(record.changes)&&(record.changes.length>0||record.bootstrapSha256)&&record.changes.length<=100,'Bounded reviewed change set required');
 if(record.changes.length)assert.ok(record.affectedGames.length,'Changed code requires affected games');
 const paths=[];for(const row of record.changes){keys(row,['path','before','after']);ownedPath(row.path);assert.ok(!protectedPath(row.path),`Separate protocol/storage review required: ${row.path}`);object(row.before);object(row.after);assert.ok(row.before||row.after);assert.notDeepEqual(row.before,row.after);if(row.before&&row.after)assert.equal(row.before.mode,row.after.mode,'Mode changes require separate review');paths.push(row.path);}
 assert.equal(new Set(paths).size,paths.length,'Duplicate reviewed path');assert.deepEqual(paths,[...paths].sort(),'Review inventory must be sorted');
 return record;
}
export function verifyMaintenanceTree({recordBytes,approvedRecordSha256,before,after,facts,bootstrapBytes,approvedBootstrapSha256}){
 const record=parseMaintenanceRecord(recordBytes,approvedRecordSha256),p=record.predecessor,a=record.anchor;
 assert.equal(facts.clean,true,'Release checkout must be clean, including untracked files');assert.ok(commit(facts.candidateCommit)&&commit(facts.candidateTree));assert.notEqual(facts.candidateCommit,p.commit);
 assert.equal(facts.predecessorCommit,p.commit);assert.equal(facts.predecessorTree,p.tree);assert.equal(facts.anchorCommit,a.commit);assert.equal(facts.anchorTree,a.tree);
 assert.equal(facts.predecessorIsAncestor,true);assert.equal(facts.anchorIsAncestor,true);
 assert.ok(before instanceof Map&&after instanceof Map);assert.deepEqual(after.get(RECORD_PATH),{mode:'100644',type:'blob',objectId:blobId(recordBytes)},'Exact approved record must be in candidate tree');
 if(before.has(RECORD_PATH)){assert.equal(before.get(RECORD_PATH).mode,'100644');assert.equal(before.get(RECORD_PATH).type,'blob');}
 const bootstrap=record.bootstrapSha256?verifyMaintenanceBootstrap({bytes:bootstrapBytes,expectedSha256:approvedBootstrapSha256,record,before,after}):[];
 if(!record.bootstrapSha256)assert.ok(bootstrapBytes===undefined&&approvedBootstrapSha256===undefined,'Unexpected bootstrap authority refused');
 const actual=[];for(const path of new Set([...before.keys(),...after.keys()])){if(path===RECORD_PATH||bootstrap.includes(path))continue;const prior=before.get(path)||null,next=after.get(path)||null;if(JSON.stringify(prior)!==JSON.stringify(next))actual.push({path,before:prior,after:next});}
 actual.sort((x,y)=>x.path<y.path?-1:x.path>y.path?1:0);assert.deepEqual(actual,record.changes,'Full tree differs outside the exact reviewed change set');
 return {status:'source-verified',candidateCommit:facts.candidateCommit,candidateTree:facts.candidateTree,predecessorCommit:p.commit,anchorCommit:a.commit,changedFiles:actual.length,bootstrapFiles:bootstrap.length,recordSha256:approvedRecordSha256};
}
function git(root,args){const result=spawnSync('git',args,{cwd:root,encoding:'utf8',timeout:15000,maxBuffer:16*1024*1024});assert.equal(result.status,0,result.stderr||result.error?.message);return result.stdout;}
function tree(root,revision){const map=new Map();for(const line of git(root,['ls-tree','-rz','--full-tree',revision]).split('\0').filter(Boolean)){const match=/^(\d{6}) (blob|tree|commit) ([a-f0-9]{40})\t([\s\S]+)$/.exec(line);assert.ok(match);const [,mode,type,objectId,path]=match;assert.ok(!map.has(path));map.set(path,{mode,type,objectId});}return map;}
export function inspectMaintenanceSource(root,approvedRecordSha256,bootstrap={}){
 const recordBytes=readFileSync(resolve(root,RECORD_PATH)),r=parseMaintenanceRecord(recordBytes,approvedRecordSha256),head=git(root,['rev-parse','HEAD']).trim();
 const anchorContract=JSON.parse(git(root,['show',`${r.anchor.commit}:game-logic/yard-v2/active-release-contract.json`]));
 assert.equal(anchorContract.format,'yard-active-contract/v1');assert.equal(anchorContract.mode,'ACTIVE');assert.equal(sha256(JSON.stringify(anchorContract)),r.anchor.contractSha256);
 assert.equal(anchorContract.inputs?.closed?.buildId,r.anchor.closedBuildId);assert.equal(anchorContract.inputs.closed.imageDigest,r.anchor.closedImageDigest);
 const ancestor=(first,last)=>spawnSync('git',['merge-base','--is-ancestor',first,last],{cwd:root,timeout:15000}).status===0;
 return verifyMaintenanceTree({recordBytes,approvedRecordSha256,...bootstrap,before:tree(root,r.predecessor.commit),after:tree(root,head),facts:{clean:git(root,['status','--porcelain=v1','--untracked-files=all'])==='',candidateCommit:head,candidateTree:git(root,['rev-parse','HEAD^{tree}']).trim(),predecessorCommit:r.predecessor.commit,predecessorTree:git(root,['rev-parse',`${r.predecessor.commit}^{tree}`]).trim(),anchorCommit:r.anchor.commit,anchorTree:git(root,['rev-parse',`${r.anchor.commit}^{tree}`]).trim(),predecessorIsAncestor:ancestor(r.predecessor.commit,head),anchorIsAncestor:ancestor(r.anchor.commit,r.predecessor.commit)}});
}
function image(value,buildId,requiredDigest){assert.ok(value&&digest(value.Id));assert.ok(Array.isArray(value.RepoDigests)&&value.RepoDigests.includes(`ghcr.io/${repository}@${requiredDigest}`));assert.equal(value.Config?.Labels?.['org.opencontainers.image.revision'],buildId);assert.deepEqual(value.Config?.Cmd,['node','server.js']);assert.ok(Array.isArray(value.Config.Env));const environment=Object.fromEntries(value.Config.Env.map(row=>{assert.equal(typeof row,'string');const split=row.indexOf('=');assert.ok(split>0);return [row.slice(0,split),row.slice(split+1)];}));assert.equal(environment.NODE_ENV,'production');assert.equal(environment.APP_BUILD_ID,buildId);for(const name of ['NODE_OPTIONS','DEV_AUTH_ENABLED','YARD_PLAYER_WIRING_TEST','YARD_CANDIDATE_CI','YARD_EIGHT_PLAYER_CANDIDATE_TEST'])assert.ok(!environment[name]);}
function sameStorage(capability){assert.ok(Array.isArray(capability?.readableStorageFormats));assert.deepEqual(capability.readableStorageFormats,['yard-persistent/v1']);}
export function verifyMaintenanceRollback({recordBytes,approvedRecordSha256,candidateBuildId,candidateDigest,candidateImage,candidate,previousImage,previous,previousHealth,previousCompatibilityBytes,acceptedPredecessorReceiptBytes,persistentYardRows}){
 const record=parseMaintenanceRecord(recordBytes,approvedRecordSha256),p=record.predecessor;
 assert.ok(commit(candidateBuildId)&&candidateBuildId!==p.commit&&digest(candidateDigest));assert.ok(Number.isSafeInteger(persistentYardRows)&&persistentYardRows>=0);
 image(candidateImage,candidateBuildId,candidateDigest);image(previousImage,p.commit,p.imageDigest);assert.equal(previousImage.Id,p.imageId);
 assert.equal(previousHealth?.status,'ok');assert.equal(previousHealth.buildId,p.commit);assert.equal(previousHealth.postgres,true);
 // The caller must obtain these exact bytes from the immutable image command
 // and the authoritative receipt adapter. A hash match alone is not that adapter.
 assert.equal(sha256(previousCompatibilityBytes),p.compatibilitySha256);assert.deepEqual(JSON.parse(previousCompatibilityBytes),previous);
 assert.equal(sha256(acceptedPredecessorReceiptBytes),p.acceptanceReceiptSha256);
 const receipt=JSON.parse(acceptedPredecessorReceiptBytes);assert.equal(receipt.format,'cc-gh-yard-accepted-active/v1');assert.equal(receipt.repository,repository);assert.equal(receipt.repositoryId,1162268629);assert.equal(receipt.status,'accepted');
 assert.deepEqual(receipt.release,{commit:p.commit,tree:p.tree,imageDigest:p.imageDigest,imageId:p.imageId});assert.deepEqual(receipt.initialActivation,record.anchor);
 for(const kind of ['acceptance','deployment']){const proof=receipt[kind];assert.ok(Number.isSafeInteger(proof?.runId)&&proof.runId>0);assert.ok(Number.isSafeInteger(proof.runAttempt)&&proof.runAttempt>0);assert.equal(proof.status,'completed');assert.equal(proof.conclusion,'success');assert.equal(proof.headCommit,p.commit);assert.ok(sha(proof.artifactSha256));}
 assert.equal(previous.buildId,p.commit);assert.equal(previous.playerRolloutEnabled,true);sameStorage(previous);
 assert.equal(candidate?.format,'cc-gh-yard-release-compatibility/v2');assert.equal(candidate.buildId,candidateBuildId);assert.equal(candidate.playerRolloutEnabled,true);sameStorage(candidate);
 assert.deepEqual(candidate.writableStorageFormats,['yard-persistent/v1']);assert.equal(candidate.storageMigration,'none');
 assert.deepEqual(candidate.initialActivation,record.anchor);assert.deepEqual(candidate.requiredActivePredecessor,{buildId:p.commit,imageDigest:p.imageDigest});assert.equal(candidate.maintenanceRecordSha256,approvedRecordSha256);
 if(p.commit===record.anchor.commit){
  assert.equal(p.tree,record.anchor.tree);assert.equal(p.imageDigest,record.anchor.imageDigest);
  assert.equal(previous.format,'cc-gh-yard-release-compatibility/v1');assert.deepEqual(previous.requiredClosedPredecessor,{buildId:record.anchor.closedBuildId,imageDigest:record.anchor.closedImageDigest});
 }else{
  assert.equal(previous.format,'cc-gh-yard-release-compatibility/v2');assert.deepEqual(previous.initialActivation,record.anchor);assert.deepEqual(previous.writableStorageFormats,['yard-persistent/v1']);assert.equal(previous.storageMigration,'none');
 }
 return {status:'rollback-compatible',phase:'active-maintenance',candidateBuildId,previousBuildId:p.commit,anchorCommit:record.anchor.commit,persistentYardRows};
}
/** Only consumes results independently collected by the trusted CI adapter. */
export function assertMaintenanceChecks({recordBytes,approvedRecordSha256,candidateCommit,candidateTree,candidateDigest,checks}){
 const record=parseMaintenanceRecord(recordBytes,approvedRecordSha256);assert.ok(commit(candidateCommit)&&commit(candidateTree)&&digest(candidateDigest));assert.ok(Array.isArray(checks));
 const required=[...CHECKS,...record.affectedGames.map(game=>`game:${game}`)].sort();assert.deepEqual(checks.map(x=>x.name).sort(),required,'Complete maintenance acceptance inventory required');
 for(const check of checks){assert.equal(check.status,'completed');assert.equal(check.conclusion,'success');assert.equal(check.candidateCommit,candidateCommit);assert.equal(check.candidateTree,candidateTree);assert.equal(check.candidateDigest,candidateDigest);assert.equal(check.predecessorCommit,record.predecessor.commit);assert.equal(check.predecessorDigest,record.predecessor.imageDigest);assert.equal(check.recordSha256,approvedRecordSha256);assert.equal(check.attempts,1,'Retries must not conceal a failing maintenance case');}
 return {status:'checks-verified',checks:required.length};
}
