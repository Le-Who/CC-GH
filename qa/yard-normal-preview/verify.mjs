import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {sha} from './closure.mjs';

const here=import.meta.dirname,args=process.argv.slice(2),local=args[0]==='--local';
assert(local?args.length===2:args.length===0,'Usage: verify.mjs [--local SOURCE_ROOT]');
const root=local?path.resolve(args[1]):path.resolve(here,'../..');
const pin=JSON.parse(await fs.readFile(path.join(here,'source-pin.json')));
const packet=JSON.parse(await fs.readFile(path.join(here,'packet-pin.json')));
const audit=JSON.parse(await fs.readFile(path.join(here,'workflow-audit.json')));
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
assert.equal(pin.baseHead,packet.parent);assert.equal(audit.parent,packet.parent);
for(const row of pin.files){
 const b=await fs.readFile(path.join(root,row.path));assert.equal(b.length,row.bytes,row.path);assert.equal(sha(b),row.sha256,row.path);
}
for(const row of packet.files){
 const b=await fs.readFile(path.resolve(here,'../..',row.path));assert.equal(b.length,row.bytes,row.path);assert.equal(sha(b),row.sha256,row.path);
}
assert.equal(new Set(pin.files.map(r=>r.path)).size,pin.files.length,'Duplicate source pin');
assert.equal(new Set(packet.files.map(r=>r.path)).size,packet.files.length,'Duplicate QA pin');
assert.equal(audit.existingWorkflowsTriggered,0);assert.equal(audit.updatedWorkflowsTriggered,1);
assert.equal(audit.jobs,1);assert.equal(audit.timeoutMinutes,10);assert.equal(audit.runAttemptMustEqual,1);assert.equal(audit.automaticRetries,0);
for(const field of['deploys','serverWrites','secrets','newCredentials'])assert.equal(audit[field],false);
const workflow=await fs.readFile(path.join(root,audit.updatedWorkflow),'utf8');
assert(workflow.includes("branches: ['"+audit.branch+"']"));
assert(!/^  (pull_request|workflow_dispatch|schedule|workflow_run|workflow_call):/m.test(workflow),'Extra workflow trigger');
assert(workflow.includes('if: github.run_attempt == 1 && github.event.created == true && github.event.forced == false'));
assert(workflow.includes('runs-on: ubuntu-24.04'));assert(workflow.includes('timeout-minutes: 10'));
assert(workflow.includes('package-manager-cache: false'));assert(workflow.includes('NODE_ENV: production'));
assert(workflow.includes('retention-days: 3'));assert(workflow.includes('8*1024*1024'));
if(!local){
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(git(['rev-parse','HEAD^']),packet.parent,'Wrong immutable parent');
 const changed=git(['diff','--name-only','HEAD^','HEAD']).split('\n').sort();
 assert.deepEqual(changed,[...packet.publicationPaths].sort(),'Unexpected publication delta');
 const sourceDelta=pin.files.filter(r=>r.status!=='inherited').map(r=>r.path).sort();
 assert.deepEqual(changed.filter(p=>!p.startsWith('qa/yard-normal-preview/')&&p!==audit.updatedWorkflow),sourceDelta,'Source delta not covered by exact pins');
 const parentPaths=git(['ls-tree','-r','--name-only','HEAD^','.github/workflows']).split('\n').sort();
 assert.deepEqual(parentPaths,audit.parentWorkflows.map(r=>r.path).sort(),'Parent workflow inventory changed');
 for(const r of audit.parentWorkflows){
  const parentBytes=execFileSync('git',['show','HEAD^:'+r.path],{cwd:root});assert.equal(sha(parentBytes),r.sha256,'Unexpected parent workflow');
  if(r.path!==audit.updatedWorkflow){const b=await fs.readFile(path.join(root,r.path));assert.equal(sha(b),r.sha256,'Unrelated workflow changed');}
 }
 for(const row of pin.files){
  if(row.beforeSha256===null){assert.equal(row.status,'add');continue;}
  assert.equal(sha(execFileSync('git',['show','HEAD^:'+row.path],{cwd:root,maxBuffer:16*1024*1024})),row.beforeSha256,'Unexpected source parent: '+row.path);
 }
 assert.equal(process.env.GITHUB_REF,'refs/heads/'+audit.branch);assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
 const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH));
 assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(event.created,true);assert.equal(event.after,process.env.GITHUB_SHA);assert(!event.forced&&!event.deleted);
}
console.log(JSON.stringify({sourceFiles:pin.files.length,changedSourceFiles:pin.changedFileCount,packetFiles:packet.files.length,mode:local?'LOCAL_FILE_VERIFICATION_ONLY':'FIRST_CREATION_GITHUB_VERIFIED',browserStarted:false}));
