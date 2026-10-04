/** One exact release's read-only image, public health and CLOSED CI receipts. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync,existsSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,isAbsolute} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const A_COMMIT='962323817b77eff1a4a20be71b38f8d462b9054f';
export const A_TREE='0e872a180c5f8d8f0983ea651b1aa865252d359e';
export const A_DEPLOY_RUN=37190465940;
export const IMAGE_REPOSITORY='ghcr.io/le-who/cc-gh';
export const HEALTH_URL='https://games.tri.mom/api/health';
export const QA_REF='refs/heads/qa/yard-closed-a-inspection';
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateTarget(value){
 assert.ok(value&&typeof value==='object'&&!Array.isArray(value));
 assert.deepEqual(Object.keys(value).sort(),['format','imageDigest','runAttempt']);
 assert.equal(value.format,'yard-closed-a-inspection/v1');
 assert.match(value.imageDigest,/^sha256:[a-f0-9]{64}$/,'Actual immutable A image digest required');
 assert.ok(Number.isSafeInteger(value.runAttempt)&&value.runAttempt>0,'Actual completed deploy attempt required');
 return {buildId:A_COMMIT,tree:A_TREE,imageDigest:value.imageDigest,ciReceipt:{runId:A_DEPLOY_RUN,runAttempt:value.runAttempt,workflowPath:'.github/workflows/deploy.yml'}};
}
export function sanitizeImage(image,target){
 assert.match(image?.Id,/^sha256:[a-f0-9]{64}$/);assert.ok(Array.isArray(image.RepoDigests));
 const pinned=`${IMAGE_REPOSITORY}@${target.imageDigest}`;assert.ok(image.RepoDigests.includes(pinned),'Registry digest does not identify inspected image');
 assert.equal(image.Config?.Labels?.['org.opencontainers.image.revision'],A_COMMIT);
 assert.ok(Array.isArray(image.Config.Env));assert.deepEqual(image.Config.Env.filter(v=>typeof v==='string'&&v.startsWith('APP_BUILD_ID=')),[`APP_BUILD_ID=${A_COMMIT}`]);
 return {Id:image.Id,RepoDigests:[pinned],Config:{Labels:{'org.opencontainers.image.revision':A_COMMIT},Env:[`APP_BUILD_ID=${A_COMMIT}`]}};
}
export function sanitizeCompatibility(value){
 assert.equal(value?.format,'cc-gh-yard-release-compatibility/v1');assert.equal(value.buildId,A_COMMIT);
 assert.equal(value.policyRevision,'yard-player-rollout/closed-r1');assert.equal(value.playerRolloutEnabled,false);assert.equal(value.closedQuarantineVerified,true);
 assert.ok(Array.isArray(value.readableStorageFormats)&&value.readableStorageFormats.includes('yard-persistent/v1'));assert.equal(value.requiredClosedPredecessor,null);
 return {format:value.format,buildId:value.buildId,policyRevision:value.policyRevision,playerRolloutEnabled:false,closedQuarantineVerified:true,readableStorageFormats:['yard-persistent/v1'],requiredClosedPredecessor:null};
}
export function sanitizeHealth(value){
 assert.equal(value?.status,'ok','Public A health is not healthy');assert.equal(value.postgres,true);assert.equal(value.buildId,A_COMMIT,'Public endpoint is not exact A');
 return {status:value.status,postgres:true,buildId:value.buildId};
}
export async function readPublicHealth(fetchImpl=fetch){
 // No insecure TLS setting, redirects, fallback host or request credential.
 const response=await fetchImpl(HEALTH_URL,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/json'}});
 assert.equal(response.status,200,'Public health request failed');const bytes=await response.text();assert.ok(Buffer.byteLength(bytes)<=32768,'Oversized health response');
 return sanitizeHealth(JSON.parse(bytes));
}
export function validateExecution(env){
 assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_REF,QA_REF);assert.equal(env.GITHUB_REPOSITORY?.toLowerCase(),'le-who/cc-gh');
 for(const key of ['GITHUB_SHA'])assert.match(env[key]||'',/^[a-f0-9]{40}$/);
 for(const key of ['GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT'])assert.match(env[key]||'',/^[1-9][0-9]*$/);
 for(const key of ['NODE_OPTIONS','NODE_TLS_REJECT_UNAUTHORIZED','DEV_AUTH_ENABLED','DATABASE_URL','REDIS_URL','TELEGRAM_BOT_TOKEN','YARD_PLAYER_WIRING_TEST','YARD_CANDIDATE_CI','YARD_EIGHT_PLAYER_CANDIDATE_TEST'])assert.ok(!env[key],`Unexpected execution option: ${key}`);
}
const command=(exe,args,options={})=>{
 try{return execFileSync(exe,args,{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024,...options});}
 catch{throw Error(`Bounded ${exe} operation failed`);}
};
export function ownedContainerId(cid,container,imageId,ownedName){
 assert.match(cid,/^[a-f0-9]{64}$/,'Invalid owned container CID');assert.equal(container?.Id,cid);assert.equal(container.Image,imageId);assert.equal(container.Config?.Labels?.['ccgh.yard-inspection-owner'],ownedName,'Container is not owned by this invocation');
 return cid;
}
export function probeArguments(imageId,ownedName,cidFile){
 assert.match(imageId,/^sha256:[a-f0-9]{64}$/);assert.match(ownedName,/^ccgh-yard-inspect-[1-9][0-9]*-[1-9][0-9]*$/);
 assert.ok(typeof cidFile==='string'&&isAbsolute(cidFile));
 return ['run','--cidfile',cidFile,'--label',`ccgh.yard-inspection-owner=${ownedName}`,'--name',ownedName,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--entrypoint','node',imageId,'scripts/yard-release-compatibility.mjs'];
}
async function collect(target,sourceRoot,output){
 validateExecution(process.env);assert.ok(process.env.GITHUB_TOKEN,'Existing ephemeral GitHub token required');
 assert.equal(command('git',['rev-parse','HEAD'],{cwd:sourceRoot}).trim(),A_COMMIT);assert.equal(command('git',['rev-parse','HEAD^{tree}'],{cwd:sourceRoot}).trim(),A_TREE);
 assert.equal(command('git',['status','--porcelain','--untracked-files=all'],{cwd:sourceRoot}),'');
 assert.ok(!existsSync(output),'Use a new external evidence directory');
 const {verifyGithubClosedReceipt}=await import(pathToFileURL(resolve(sourceRoot,'scripts/yard-closed-ci-receipt.mjs')).href);
 const {BROWSER_GROUPS}=await import(pathToFileURL(resolve(sourceRoot,'scripts/browser-ci-groups.mjs')).href);
 const receipt=await verifyGithubClosedReceipt({receipt:target.ciReceipt,closedCommit:A_COMMIT,browserGroups:Object.keys(BROWSER_GROUPS),token:process.env.GITHUB_TOKEN});
 const inspected=JSON.parse(command('docker',['image','inspect',`${IMAGE_REPOSITORY}@${target.imageDigest}`]));assert.ok(Array.isArray(inspected)&&inspected.length===1);
 const image=sanitizeImage(inspected[0],target),ownedName=`ccgh-yard-inspect-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
 const scratch=mkdtempSync(resolve(tmpdir(),'ccgh-yard-a-probe-')),cidFile=resolve(scratch,'created.cid');let compatibility;
 try{compatibility=sanitizeCompatibility(JSON.parse(command('docker',probeArguments(image.Id,ownedName,cidFile))));}
 finally{
  try{if(existsSync(cidFile)){
   const cid=readFileSync(cidFile,'utf8').trim();assert.match(cid,/^[a-f0-9]{64}$/);
   const containers=JSON.parse(command('docker',['inspect',cid]));assert.ok(Array.isArray(containers)&&containers.length===1);
   const ownedId=ownedContainerId(cid,containers[0],image.Id,ownedName);command('docker',['rm','-f','-v',ownedId]);
  }}finally{rmSync(scratch,{recursive:true,force:true});}
 }
 const health=await readPublicHealth();
 const files={'A-image.json':image,'A-compatibility.json':compatibility,'A-health.json':health,'A-ci-receipt-verified.json':receipt,
  'A-closed-inputs.json':{buildId:A_COMMIT,imageDigest:target.imageDigest,image,compatibility,ciReceipt:target.ciReceipt}};
 mkdirSync(output,{recursive:false});const manifest=[];
 for(const [name,value]of Object.entries(files)){const bytes=JSON.stringify(value,null,2)+'\n';writeFileSync(resolve(output,name),bytes,{flag:'wx'});manifest.push({name,bytes:Buffer.byteLength(bytes),sha256:sha256(bytes)});}
 const result={format:'yard-closed-a-inspection-receipt/v1',status:'verified',source:{buildId:A_COMMIT,tree:A_TREE,imageDigest:target.imageDigest,deployRun:A_DEPLOY_RUN,deployAttempt:target.ciReceipt.runAttempt},
  collection:{repository:'le-who/cc-gh',qaCommit:process.env.GITHUB_SHA,runId:Number(process.env.GITHUB_RUN_ID),runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT),capturedAt:new Date().toISOString()},
  publicHealth:{url:HEALTH_URL,verifiedTls:true,redirectsAllowed:false},files:manifest,
  scope:'Pristine image metadata/in-memory quarantine probe, public health, and authoritative completed CLOSED CI only. Existing final pre-switch guard still binds the live container to this image; this is not activation or real B acceptance.'};
 writeFileSync(resolve(output,'INSPECTION-RECEIPT.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:'verified',buildId:A_COMMIT,imageDigest:target.imageDigest,deployRun:A_DEPLOY_RUN,requiredJobs:receipt.jobs.length,files:6}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  const [mode,targetPath,sourceRoot,output]=process.argv.slice(2);assert.ok(['--validate-target','--collect'].includes(mode));
  validateExecution(process.env);const target=validateTarget(JSON.parse(readFileSync(resolve(targetPath),'utf8')));
  if(mode==='--validate-target'){
   assert.equal(process.argv.length,4);if(process.env.GITHUB_OUTPUT)for(const [key,value]of Object.entries({commit:A_COMMIT,digest:target.imageDigest,run_attempt:target.ciReceipt.runAttempt}))appendFileSync(process.env.GITHUB_OUTPUT,`${key}=${value}\n`);
   console.log(JSON.stringify({buildId:A_COMMIT,deployRun:A_DEPLOY_RUN,imageDigest:target.imageDigest}));
  }else{assert.equal(process.argv.length,6);await collect(target,resolve(sourceRoot),resolve(output));}
 }catch(error){console.error(`A inspection blocked: ${error.message}`);process.exitCode=1;}
}
