import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {sha} from './overlay.mjs';
export const BASE='2e28925ee2b235abeee01a48f03ede9cae211a3a',BASE_TREE='2085edce91144f22d1695a93630c52d3006647e3';
export const BRANCH='qa/yard-pip-quality-ab-20261006',PREFIX='qa/yard-pip-quality-native-packet',WORKFLOW='.github/workflows/yard-pip-quality-ab.yml';
export const git=(root,args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:15000}).trim();
export function ciPaths(root,runnerTemp){
  assert(path.isAbsolute(root)&&path.isAbsolute(runnerTemp),'Absolute repository and runner temporary directory required');
  const packet=path.join(root,PREFIX),build=path.join(runnerTemp,'yard-pip-quality-ab-20261006-build');
  assert(!build.startsWith(root+path.sep),'Build must remain outside checkout');
  return{root,packet,build,validation:path.join(runnerTemp,'yard-pip-quality-ab-20261006-source'),packageWork:path.join(runnerTemp,'yard-pip-quality-ab-20261006-package'),results:path.join(packet,'results'),upload:path.join(packet,'upload')};
}
export function installedPaths(){const root=path.resolve(import.meta.dirname,'../../..');assert.equal(process.cwd(),root,'Run from repository root');return ciPaths(root,process.env.RUNNER_TEMP);}
export function assertEvent(env,event){
  assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.equal(env.GITHUB_EVENT_NAME,'push');assert.equal(env.GITHUB_REF,'refs/heads/'+BRANCH);
  assert.equal(event.created,true);assert.equal(event.forced,false);assert.equal(event.deleted,false);assert.equal(event.after,env.GITHUB_SHA);assert.match(event.after,/^[a-f0-9]{40}$/);
  for(const key of['NODE_OPTIONS','DATABASE_URL','REDIS_URL','DEV_AUTH_ENABLED','TELEGRAM_BOT_TOKEN','YARD_CANONICAL_PG_TEST','YARD_QUALITY_SOURCE_ROOT'])assert(!env[key],'Unexpected inherited '+key);
}
export function allowedPath(p){return p===WORKFLOW||p.startsWith(PREFIX+'/')&&!/\/(?:results|upload)\//.test(p)&&!p.split('/').includes('..')&&!/\.(?:glb|png|webp|zip|mp4|webm|woff2?|ttf)$/i.test(p);}
export async function verifyPins(root,packet=path.join(root,PREFIX)){
  const pins=JSON.parse(await fs.readFile(path.join(packet,'base-files.json')));assert.equal(pins.length,4);
  for(const row of pins){const b=await fs.readFile(path.join(root,row.path));assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256,'Quality base changed: '+row.path);}
  return pins;
}
export async function verifyReviewedTree(root,manifest){
  assert.equal(manifest.base,BASE);assert.equal(manifest.baseTree,BASE_TREE);
  assert.equal(git(root,['rev-parse','HEAD^']),BASE);assert.equal(git(root,['rev-parse',BASE+'^{tree}']),BASE_TREE);
  assert.equal(git(root,['rev-list','--parents','-n','1','HEAD']).split(' ').length,2,'Exactly one parent required');
  const allowlist=JSON.parse(await fs.readFile(path.join(root,PREFIX,'file-allowlist.json')));
  assert(allowlist.every(allowedPath));assert.equal(new Set(allowlist).size,allowlist.length);
  const names=[...manifest.files.map(r=>r.path),PREFIX+'/reviewed-source.json'].sort();assert.deepEqual(names,[...allowlist].sort());
  const changed=git(root,['diff','--name-status',BASE,'HEAD']).split('\n').filter(Boolean).map(line=>{const[status,p]=line.split('\t');assert.equal(status,'A','All base files must stay unchanged');return p;}).sort();
  assert.deepEqual(changed,names);assert.deepEqual(changed.filter(p=>p.startsWith('.github/')),[WORKFLOW]);
  const tree=ref=>execFileSync('git',['ls-tree','-rz','--full-tree',ref],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
  const baseRows=tree(BASE),headProtected=tree('HEAD').filter(row=>!names.includes(row.split('\t')[1]));assert.deepEqual(headProtected,baseRows,'Every production, dependency, asset and existing QA tree entry must match the exact base');
  assert.equal(baseRows.length,manifest.protectedEntryCount);assert.equal(sha(Buffer.from(baseRows.join('\0')+'\0')),manifest.protectedGitEntriesSha256);
  for(const row of manifest.files){assert(allowedPath(row.path));const stat=await fs.lstat(path.join(root,row.path));assert(stat.isFile()&&!stat.isSymbolicLink());const b=await fs.readFile(path.join(root,row.path));assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256);}
  assert.equal(git(root,['status','--porcelain','--untracked-files=normal']),'','Checkout must be clean before installing dependencies');
  return{protectedEntryCount:baseRows.length,protectedGitEntriesSha256:manifest.protectedGitEntriesSha256,changedFiles:names};
}
export async function auditPushTriggers(root,newWorkflowText){
  const entries=await fs.readdir(path.join(root,'.github/workflows')),rows=[];
  for(const name of entries.filter(n=>/\.ya?ml$/.test(n))){
    const file='.github/workflows/'+name;if(file===WORKFLOW)continue;
    const text=await fs.readFile(path.join(root,file),'utf8'),on=text.match(/^on:\s*\n([\s\S]*?)(?=^\S|$(?![\s\S]))/m)?.[1]??'';
    const push=on.match(/^  push:\s*\n([\s\S]*?)(?=^  \S|$(?![\s\S]))/m)?.[1];
    if(!push){assert(!/^  push\s*:/m.test(on),'Unrecognized push syntax');rows.push({file,push:false});continue;}
    let branches;if(/branches:\s*\[/.test(push))branches=push.match(/branches:\s*\[([^\]]+)\]/)[1].split(',').map(v=>v.trim().replace(/^['"]|['"]$/g,''));
    else{assert(/branches:\s*\n/.test(push),'Push without explicit branches');branches=[...push.matchAll(/^\s+-\s+([^\n]+)$/gm)].map(m=>m[1].trim().replace(/^['"]|['"]$/g,''));}
    assert(branches.length);assert(branches.every(b=>!/[*!?{}]/.test(b)&&b!==BRANCH),'Another workflow could trigger on quality push');rows.push({file,push:true,branches});
  }
  assert.match(newWorkflowText,new RegExp("branches: \\['"+BRANCH+"'\\]"));assert(!/workflow_dispatch|pull_request|schedule:|workflow_call/.test(newWorkflowText));
  assert.match(newWorkflowText,/timeout-minutes: 10/);assert.match(newWorkflowText,/github\.run_attempt == 1.*github\.event\.created == true.*github\.event\.forced == false.*github\.event\.deleted == false/);
  assert(!/secrets\.|actions\/cache|environment:|deploy|services:/.test(newWorkflowText),'No deployment, secrets, cache or database service');
  return{branch:BRANCH,onlyWorkflow:WORKFLOW,existing:rows,processLaunches:0,listeners:0,browsers:0};
}
