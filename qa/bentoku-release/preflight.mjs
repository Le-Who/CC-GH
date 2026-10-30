/** Bounded caller of the existing app-only lane, on the actual live source. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assertDevelopmentEnvironment, assertTap, sha, CHECKS} from './image-helpers.mjs';
export const IMAGE_SOURCE_TEST_COUNT=79, INTERACTION_SOURCE_TEST_COUNT=19;
const OUT=path.resolve('test-results/yard-development');
const git=(...args)=>execFileSync('git',args,{timeout:15000,encoding:'utf8'}).trim();
const load=async name=>JSON.parse(await fs.readFile('qa/bentoku-release/'+name,'utf8'));
const save=async(name,value)=>fs.writeFile(path.join(OUT,name),JSON.stringify(value,null,2)+'\n');
export async function preflight(){
 const head=assertDevelopmentEnvironment(),s=await load('source.json'),m=await load('manifest.json');
 assert.equal(git('rev-parse','HEAD'),head);assert.equal(git('rev-parse','HEAD^'),s.qualifiedSource);
 assert.equal(git('rev-parse',s.liveBase.commit+'^{tree}'),s.liveBase.tree);
 assert.equal(git('status','--porcelain','--untracked-files=no'),'');
 assert.equal(process.env.GITHUB_EVENT_NAME,'push');
 const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
 assert.equal(event.created,true);assert.equal(event.forced,false);assert.equal(event.deleted,false);assert.equal(event.after,head);
 const delta=git('diff','--name-only',s.qualifiedSource,'HEAD').split('\n').filter(Boolean).sort();
 assert.deepEqual(delta,m.acceptanceOnlyPaths.slice().sort());
 assert(delta.every(p=>p.startsWith('qa/bentoku-release/')||p==='.github/workflows/bentoku-image.yml'));
 for(const [p,hash]of Object.entries(m.files))assert.equal(sha(await fs.readFile(p)),hash,'Source pin: '+p);
 assert.equal(sha(await fs.readFile('Dockerfile')),m.dockerfileSha256);
 for(const p of ['Dockerfile','pnpm-lock.yaml','server.js','docker-compose.yml'])
  assert.equal(git('rev-parse',head+':'+p),git('rev-parse',s.liveBase.commit+':'+p),p+' must preserve actual live bytes');
 const product=git('diff-tree','--no-commit-id','--raw','--no-abbrev','-r',s.liveBase.commit,s.qualifiedSource).split('\n').filter(Boolean).map(line=>{
  const match=line.match(/^:(\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) (\w)\t(.+)$/);assert(match);
  return {path:match[6],before:{mode:match[1],objectId:match[3]},after:{mode:match[2],objectId:match[4]},status:match[5]};
 });assert.deepEqual(product,s.sourceChanges);
 assert.equal(sha(execFileSync('git',['show',s.historical.controller+':.github/workflows/yard-development-activate.yml'])),s.historical.workflowSha256);
 assert.equal(sha(await fs.readFile('qa/bentoku-release/historical-candidate-receipt.json')),s.historical.candidateReceiptSha256);
 assert.equal(sha(await fs.readFile('qa/bentoku-release/predecessor-receipt.json')),s.predecessorReceiptSha256);
 const pins=await load('controller-source.json');for(const row of pins.files)
  assert.equal(sha(await fs.readFile('qa/bentoku-release/'+row.path)),row.sha256);
 // GitHub metadata confirms only historical provenance. It cannot replace host preflight.
 assert(process.env.GH_TOKEN,'Read-only Actions metadata token required');
 async function api(route){const r=await fetch('https://api.github.com/repos/Le-Who/CC-GH/'+route,{headers:{Authorization:'Bearer '+process.env.GH_TOKEN,Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(10000)});assert.equal(r.status,200,'Historical metadata HTTP status');return r.json();}
 for(const [id,commit]of [[s.historical.imageRun,s.liveBase.commit],[s.historical.activationRun,s.historical.controller]]){
  const r=await api('actions/runs/'+id);assert.equal(r.repository.id,1162268629);assert.equal(r.head_sha,commit);assert.equal(r.run_attempt,1);assert.equal(r.status,'completed');assert.equal(r.conclusion,'success');
 }
 const jobs=await api('actions/runs/'+s.historical.activationRun+'/jobs?filter=all&per_page=100'),job=jobs.jobs.find(j=>j.id===s.historical.activationJob);
 assert.equal(job?.conclusion,'success');assert(job.steps.every(step=>['success','skipped'].includes(step.conclusion)));
 await fs.mkdir(OUT,{recursive:true});
 await fs.copyFile('qa/bentoku-release/predecessor-receipt.json',path.join(OUT,'predecessor-active-receipt.json'));
 await save('source-inventory.json',{status:'passed',head,tree:git('rev-parse','HEAD^{tree}'),liveBase:s.liveBase,integrationParent:s.qualifiedSource,sourceChanges:product,acceptanceOnlyPaths:delta,manifestSha256:sha(await fs.readFile('qa/bentoku-release/manifest.json')),historical:s.historical,controllerSource:pins,scope:'Bentoku on exact current live base; unchanged backend, dependencies, Dockerfile and app-only release mechanisms. Historical successful activation is provenance; fresh host verification remains required.'});
 return {head,m:{...m,predecessor:s.liveBase,priorGreen:{commit:s.liveBase.commit,imageRun:s.historical.imageRun,activationRun:s.historical.activationRun},workflowTrustBoundary:'Exact one-shot first push; source closure and GitHub metadata verified; image and deployment each require independent receipts'}};
}
export async function verifyFreshControllerProof(){
 const files={'activation-controller.log':await fs.readFile(path.join(OUT,'activation-controller.log')),'activation-controller-compose.json':await fs.readFile(path.join(OUT,'activation-controller-compose.json')),'activation-controller-formatter.log':await fs.readFile(path.join(OUT,'activation-controller-formatter.log'))};
 assertTap(files['activation-controller.log'],64);
 const compose=JSON.parse(files['activation-controller-compose.json']);assert.equal(compose.syntheticOnly,true);assert.equal(compose.sameEffectivePredecessor,true);for(const k of ['bareBaseRejected','imageIdFormRejected','unrelatedEnvironmentDriftRejected','portDriftRejected'])assert.equal(compose[k],true);
 assert.match(files['activation-controller-formatter.log'].toString(),/14/);assert.match(files['activation-controller-formatter.log'].toString(),/7/);
 const source=await load('controller-source.json');
 await save('activation-controller-source.json',source);
 await save('activation-controller-proof.json',{status:'passed',head:process.env.GITHUB_SHA,runId:process.env.GITHUB_RUN_ID,runAttempt:1,controllerTests:64,source,originals:Object.entries(files).map(([name,bytes])=>({name,bytes:bytes.length,sha256:sha(bytes)})),scope:'Fresh rebound app-only controller mechanism tests and actual synthetic Compose configuration; no claim of host activation'});
}
export async function bentokuClaim(head){
 const p=await loadEvidence('bentoku-proof.json');assert.equal(p.status,'passed');assert.equal(p.head,head);
 assert.deepEqual(p.cases.map(c=>c.viewport),['320x568','390x844','568x320']);
 assert(p.cases.every(c=>c.status==='passed'&&c.placed&&c.paused&&c.resumed));assert.equal(p.reloadPreserved,true);
 return {name:'bentoku-launch',status:'passed',kind:'fresh-exact-image-and-live-Vercel-browser',attempts:1,cases:p.cases.map(c=>c.viewport),evidence:['bentoku-proof.json',...p.captures]};
}
async function loadEvidence(name){return JSON.parse(await fs.readFile(path.join(OUT,name),'utf8'));}
