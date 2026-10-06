import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {sha} from './closure.mjs';
const here=import.meta.dirname,root=process.argv.includes('--local')?path.resolve(process.argv[process.argv.indexOf('--local')+1]):path.resolve(here,'../..');
const pin=JSON.parse(await fs.readFile(path.join(here,'source-pin.json'))),packet=JSON.parse(await fs.readFile(path.join(here,'packet-pin.json')));
for(const row of pin.files){const b=await fs.readFile(path.join(root,row.path));assert.equal(b.length,row.bytes,row.path);assert.equal(sha(b),row.sha256,row.path);}
for(const row of packet.files){const b=await fs.readFile(path.resolve(here,'../..',row.path));assert.equal(b.length,row.bytes,row.path);assert.equal(sha(b),row.sha256,row.path);}
if(!process.argv.includes('--local')){
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 assert.equal(git(['rev-parse','HEAD^']),packet.parent,'Wrong immutable parent');
 const changed=git(['diff','--name-only','HEAD^','HEAD']).split('\n').sort();
 const expected=[...packet.publicationPaths].sort();
 assert.deepEqual(changed,expected,'Unexpected publication delta');
 const audit=JSON.parse(await fs.readFile(path.join(here,'workflow-audit.json')));
 for(const r of audit.parentWorkflows){const parentBytes=execFileSync('git',['show','HEAD^:'+r.path],{cwd:root});assert.equal(sha(parentBytes),r.sha256,'Unexpected parent workflow');if(r.path!==audit.updatedWorkflow){const b=await fs.readFile(path.join(root,r.path));assert.equal(sha(b),r.sha256,'Unrelated workflow changed');}}
 assert.equal(process.env.GITHUB_REF,'refs/heads/'+audit.branch);assert.equal(process.env.GITHUB_RUN_ATTEMPT,'1');
 const event=JSON.parse(await fs.readFile(process.env.GITHUB_EVENT_PATH));assert.equal(process.env.GITHUB_EVENT_NAME,'push');assert.equal(event.created,true);assert.equal(event.after,process.env.GITHUB_SHA);assert(!event.forced&&!event.deleted);
}
console.log(JSON.stringify({sourceFiles:pin.files.length,packetFiles:packet.files.length,mode:process.argv.includes('--local')?'LOCAL_FILE_VERIFICATION_ONLY':'FIRST_CREATION_GITHUB_VERIFIED',browserStarted:false}));
