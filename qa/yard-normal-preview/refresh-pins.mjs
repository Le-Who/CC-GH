/** File-only deterministic pin refresh for this candidate; never publishes/runs CI. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {sha} from './closure.mjs';
const root=path.resolve(import.meta.dirname,'../..'),here=import.meta.dirname;
const parent='e48f1b2dc63a9a5d96ec3e8654feb7e9d801adef',branch='qa/yard-coherent-scene-20261006';
assert.deepEqual(process.argv.slice(2),['--write'],'Explicit file-only --write required');
assert.notEqual(process.env.GITHUB_ACTIONS,'true','Reviewed CI consumes immutable pins');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
assert.equal(git(['rev-parse','HEAD']),parent,'Refresh only the uncommitted exact-base candidate');
const blob=p=>execFileSync('git',['show',parent+':'+p],{cwd:root,maxBuffer:16*1024*1024});
const write=(name,value)=>fs.writeFile(path.join(here,name),JSON.stringify(value,null,2)+'\n');
const prior=JSON.parse(blob('qa/yard-normal-preview/source-pin.json'));
const additions=['assets/planter-t2.glb','planter-interaction.mjs','prototype/planter-inspection-pose.mjs','world-scale.mjs'].map(p=>'src/games/companion-yard-v2/pip-prototype/'+p);
const files=[];
for(const p of [...new Set([...prior.files.map(r=>r.path),...additions])].sort()){
 const b=await fs.readFile(path.join(root,p));let before=null;
 if(!additions.includes(p))before=sha(blob(p));
 files.push({path:p,status:before===null?'add':before===sha(b)?'inherited':'modify',bytes:b.length,sha256:sha(b),beforeSha256:before});
}
await write('source-pin.json',{format:'yard-coherent-source-packet/v1',baseHead:parent,baselineSourceManifestSHA256:sha(blob('qa/yard-normal-preview/source-pin.json')),baselineNativeRun:'37455723940',files,fileCount:files.length,changedFileCount:files.filter(r=>r.status!=='inherited').length,totalBytes:files.reduce((n,r)=>n+r.bytes,0),mode:'local review candidate; no publication, merge or deployment'});
const updatedWorkflow='.github/workflows/yard-normal-preview-check.yml';
const parentWorkflows=git(['ls-tree','-r','--name-only',parent,'.github/workflows']).split('\n').sort().map(p=>{
 const b=blob(p),text=b.toString('utf8'),start=text.indexOf('\non:')+1,tail=text.slice(start),end=tail.slice(1).search(/\n[^ #\n]/);
 return{path:p,gitBlob:git(['rev-parse',parent+':'+p]),sha256:sha(b),bytes:b.length,triggerSummary:end<0?tail:tail.slice(0,end+1),firesOnReviewedInitialPush:false};
});
await write('workflow-audit.json',{parent,branch,event:'push on initial branch creation; no PR or workflow_dispatch',parentWorkflows,existingWorkflowsTriggered:0,jobs:1,timeoutMinutes:10,browserSeconds:230,artifactBytes:8*1024*1024,retentionDays:3,runAttemptMustEqual:1,automaticRetries:0,deploys:false,serverWrites:false,secrets:false,newCredentials:false,review:'All 13 inherited workflow identities are pinned. Twelve unrelated workflows stay unchanged. Only the existing QA workflow targets this new exact branch; one first-creation job fires. No PR, dispatch, deployment, cache or rerun.',updatedWorkflow,updatedWorkflowsTriggered:1,parentWorkflowTree:git(['rev-parse',parent+':.github/workflows'])});
const qaFiles=[];
async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(['work','results','__pycache__'].includes(e.name))continue;const p=path.join(dir,e.name);assert(!e.isSymbolicLink());if(e.isDirectory())await walk(p);else if(e.name!=='packet-pin.json')qaFiles.push(path.relative(root,p).replaceAll('\\','/'));}}
await walk(here);qaFiles.push(updatedWorkflow);qaFiles.sort();
const publicationPaths=[...files.filter(r=>r.status!=='inherited').map(r=>r.path),...git(['diff','--name-only',parent,'--','qa/yard-normal-preview',updatedWorkflow]).split('\n').filter(Boolean),...git(['ls-files','--others','--exclude-standard','qa/yard-normal-preview']).split('\n').filter(p=>p&&!p.includes('/work/')&&!p.includes('/results/')&&!p.includes('/__pycache__/')),'qa/yard-normal-preview/packet-pin.json'];
const packetFiles=[];for(const p of qaFiles){const b=await fs.readFile(path.join(root,p));packetFiles.push({path:p,bytes:b.length,sha256:sha(b)});}
await write('packet-pin.json',{format:'coherent-yard-native-qa-packet/v1',parent,publicationPaths:[...new Set(publicationPaths)].sort(),files:packetFiles});
console.log(JSON.stringify({sourceFiles:files.length,changedSourceFiles:files.filter(r=>r.status!=='inherited').length,qaFiles:packetFiles.length,publicationPaths:new Set(publicationPaths).size,browserStarted:false,published:false}));
