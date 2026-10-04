/** Read-only reuse of exact CLOSED A acceptance. Never substitutes for B checks. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {validateClosedCiReceipt,validateActivationInputs} from './yard-active-contract.mjs';
export const REPOSITORY='le-who/cc-gh';
export const REPOSITORY_ID=1162268629;
const sourceStep='Verify and report exact CLOSED acceptance source';
const successful=(item,label)=>{assert.equal(item?.status,'completed',`${label} incomplete`);assert.equal(item.conclusion,'success',`${label} did not succeed`);};
const integer=n=>Number.isSafeInteger(n)&&n>0;
export function closedJobInventory(browserGroups){
 assert.ok(Array.isArray(browserGroups)&&browserGroups.length&&new Set(browserGroups).size===browserGroups.length);
 assert.ok(browserGroups.every(group=>/^[a-z][a-z0-9-]*$/.test(group)));
 const rows=[
  ['Resolve exact CLOSED and ACTIVE source identities',['Verify committed release mode and full promotion boundary','Test dispatch negative controls']],
  ['test (24.x)',[sourceStep,'Run tests','Build Telegram Mini App client']],
  ['yard-player',[sourceStep,'Genuine Yard API, store, browser and PostgreSQL15 integration']],
  ...['small-phone','phone','landscape','desktop'].map(group=>[`Yard eight-player / ${group}`,[sourceStep,'Genuine eight-actor API store browser PostgreSQL15 acceptance']]),
  ['browser-plan',[sourceStep,'Discover every Chromium test before dispatching browser runners','Produce independent game and functional groups']],
  ...browserGroups.map(group=>[`Browser / ${group}`,[sourceStep,'Run assigned browser specs with original config and retries']]),
  ['touch',[sourceStep,'Run touch-specific and gesture regression tests']],
  ['mochi',[sourceStep,'Validate closed eight-species native witnesses and actual family media']],
  ['docker',['Verify Docker build','Verify final container Yard HTTP delivery']],
  ['Exact source release acceptance',['Require the complete mode-specific result set']],
 ];
 return {required:rows.map(([name,steps])=>({name,steps})),skipped:['ACTIVE ordinary imports','ACTIVE production image and rollback','Verify reused CLOSED acceptance']};
}
export function validateClosedRun({run,workflow,receipt,closedCommit}){
 validateClosedCiReceipt(receipt);assert.match(closedCommit,/^[a-f0-9]{40}$/);
 assert.equal(run?.id,receipt.runId);assert.equal(run.run_attempt,receipt.runAttempt,'Pinned attempt changed');
 assert.equal(typeof run.repository?.full_name,'string');assert.equal(run.repository.full_name.toLowerCase(),REPOSITORY);
 assert.equal(typeof run.head_repository?.full_name,'string');assert.equal(run.head_repository.full_name.toLowerCase(),REPOSITORY,'Fork evidence is not reusable');
 assert.equal(run.repository.id,REPOSITORY_ID,'Repository identity differs');assert.equal(run.head_repository.id,REPOSITORY_ID);
 assert.equal(run.head_sha,closedCommit,'Run did not test exact A');
 // With these events the reviewed default checkout and CLOSED ref both equal
 // head_sha. PR head_sha does not prove its merge checkout and is refused.
 assert.ok(['push','workflow_dispatch'].includes(run.event),'Exact-A push/dispatch evidence required; PR checkout is ambiguous');
 assert.equal(run.path,receipt.workflowPath);assert.ok(integer(run.workflow_id));
 assert.equal(workflow?.id,run.workflow_id);assert.equal(workflow.path,receipt.workflowPath);
 successful(run,'CLOSED workflow run');
 assert.equal(run.name,receipt.workflowPath.endsWith('/deploy.yml')?'VPS Deploy':'Game Hub CI');
 return receipt.workflowPath.endsWith('/deploy.yml')?'validate / ':'';
}
export function validateClosedJobs({jobs,run,workflow,receipt,closedCommit,browserGroups}){
 const prefix=validateClosedRun({run,workflow,receipt,closedCommit}),inventory=closedJobInventory(browserGroups),latest=new Map(),ids=new Set();
 assert.ok(Array.isArray(jobs)&&jobs.length,'No authoritative job inventory');
 for(const job of jobs){
  assert.ok(integer(job.id)&&!ids.has(job.id),'Duplicate/invalid job identity');ids.add(job.id);
  assert.equal(job.run_id,receipt.runId);assert.equal(job.head_sha,closedCommit,'Job source differs from A');
  assert.ok(integer(job.run_attempt)&&job.run_attempt<=receipt.runAttempt,'Job attempt outside pinned run');assert.equal(typeof job.name,'string');
  if(prefix&&!job.name.startsWith(prefix))continue;
  const name=prefix?job.name.slice(prefix.length):job.name,previous=latest.get(name);
  assert.ok(!previous||previous.run_attempt!==job.run_attempt,'Duplicate named job within one attempt');
  if(!previous||job.run_attempt>previous.run_attempt)latest.set(name,job);
 }
 const expected=new Set([...inventory.required.map(row=>row.name),...inventory.skipped]);
 assert.deepEqual([...latest.keys()].sort(),[...expected].sort(),'Complete exact CLOSED job/matrix inventory required');
 const accepted=[];
 for(const row of inventory.required){
  const job=latest.get(row.name);successful(job,row.name);assert.ok(Array.isArray(job.steps),'Missing job steps');
  for(const stepName of row.steps){const steps=job.steps.filter(step=>step.name===stepName);assert.equal(steps.length,1,`Missing/duplicate proof step ${row.name}: ${stepName}`);successful(steps[0],stepName);}
  accepted.push({name:row.name,id:job.id,attempt:job.run_attempt,url:`https://github.com/${REPOSITORY}/actions/runs/${receipt.runId}/job/${job.id}`});
 }
 for(const name of inventory.skipped){const job=latest.get(name);assert.equal(job.status,'completed');assert.equal(job.conclusion,'skipped',`${name} must be skipped in CLOSED A`);}
 return {status:'verified',repository:REPOSITORY,closedCommit,runId:receipt.runId,runAttempt:receipt.runAttempt,workflowPath:receipt.workflowPath,
  runUrl:`https://github.com/${REPOSITORY}/actions/runs/${receipt.runId}`,jobs:accepted};
}
export async function verifyGithubClosedReceipt({receipt,closedCommit,browserGroups,token,fetchImpl=fetch}){
 validateClosedCiReceipt(receipt);assert.equal(typeof token,'string');assert.ok(token.length,'Read-only GitHub job token required');
 const request=async path=>{
  assert.ok(path.startsWith(`/repos/${REPOSITORY}/actions/`));
  const response=await fetchImpl(`https://api.github.com${path}`,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28'}});
  assert.equal(response.status,200,`GitHub receipt read failed (${response.status})`);
  const text=await response.text();assert.ok(Buffer.byteLength(text)<=4*1024*1024,'Oversized GitHub metadata');return JSON.parse(text);
 };
 const runPath=`/repos/${REPOSITORY}/actions/runs/${receipt.runId}`,run=await request(runPath);
 const workflow=await request(`/repos/${REPOSITORY}/actions/workflows/${run.workflow_id}`);
 validateClosedRun({run,workflow,receipt,closedCommit});
 const attempt=await request(`${runPath}/attempts/${receipt.runAttempt}`);validateClosedRun({run:attempt,workflow,receipt,closedCommit});
 const jobs=[];let count;
 for(let page=1;page<=10;page++){
  const result=await request(`${runPath}/jobs?filter=all&per_page=100&page=${page}`);
  assert.ok(Number.isSafeInteger(result.total_count)&&result.total_count>0&&result.total_count<=1000);assert.ok(Array.isArray(result.jobs)&&result.jobs.length<=100);
  if(count===undefined)count=result.total_count;assert.equal(result.total_count,count,'Job inventory changed during read');jobs.push(...result.jobs);
  if(jobs.length===count)break;assert.ok(jobs.length<count&&result.jobs.length===100,'Incomplete job pagination');
 }
 assert.equal(jobs.length,count,'Incomplete job inventory');
 const result=validateClosedJobs({jobs,run,workflow,receipt,closedCommit,browserGroups});
 const finalRun=await request(runPath);validateClosedRun({run:finalRun,workflow,receipt,closedCommit});
 assert.equal(finalRun.updated_at,run.updated_at,'Run changed while evidence was read');return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  assert.equal(process.argv[2],'--verify');assert.equal(process.argv.length,4);
  assert.ok(!process.env.NODE_OPTIONS&&!process.env.YARD_CANDIDATE_CI&&!process.env.YARD_PLAYER_WIRING_TEST&&!process.env.YARD_EIGHT_PLAYER_CANDIDATE_TEST,'No inherited policy substitution');
  const contract=JSON.parse(readFileSync(resolve(process.argv[3]),'utf8'));validateActivationInputs(contract.inputs);
  assert.equal(contract.mode,'ACTIVE');const closed=contract.inputs.closed;validateClosedCiReceipt(closed.ciReceipt);
  const git=args=>{const r=spawnSync('git',args,{encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  assert.equal(git(['rev-parse','HEAD']),closed.buildId,'Receipt verifier must run from exact A');assert.equal(git(['rev-parse','HEAD^{tree}']),contract.closedTree);
  const {BROWSER_GROUPS}=await import('./browser-ci-groups.mjs');
  const result=await verifyGithubClosedReceipt({receipt:closed.ciReceipt,closedCommit:closed.buildId,browserGroups:Object.keys(BROWSER_GROUPS),token:process.env.GITHUB_TOKEN});
  result.closedTree=contract.closedTree;result.closedImageDigest=closed.imageDigest;
  result.workflowSha256=createHash('sha256').update(readFileSync(closed.ciReceipt.workflowPath)).digest('hex');
  result.reusableCiSha256=createHash('sha256').update(readFileSync('.github/workflows/ci.yml')).digest('hex');
  mkdirSync('artifacts',{recursive:true});writeFileSync('artifacts/yard-closed-ci-receipt.json',JSON.stringify(result,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`Reused successful CLOSED source ${closed.buildId}, tree ${contract.closedTree}, run ${result.runUrl} (attempt ${result.runAttempt}); ${result.jobs.length} required jobs verified. ACTIVE B has separate build/runtime/image/API/PG/cache checks.\n`);
  console.log(JSON.stringify(result));
 }catch(error){console.error(`CLOSED receipt reuse blocked: ${error.message}`);process.exitCode=1;}
}
