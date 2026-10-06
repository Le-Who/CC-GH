/** Compact outcome receipt; an over-budget or missing gate never uploads as success. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const out=path.join(import.meta.dirname,'results');await fs.mkdir(out,{recursive:true});
const stages=Object.fromEntries(['PREFLIGHT','DEPENDENCIES','HARNESS','BUILD','BROWSER'].map(name=>[name,process.env[name+'_OUTCOME']??'unknown']));
const reused=JSON.parse(await fs.readFile(path.join(out,'reused.json'),'utf8').catch(()=>'{"verified":false}'));
const receipt={reused:reused.verified?{runIds:reused.runs.map(r=>r.runId),scope:reused.scope,browserReused:false}:null,head:process.env.GITHUB_SHA,stages,acceptance:reused.verified&&Object.values(stages).every(v=>v==='success')?'MECHANICAL_GATES_PASSED_VISUAL_REVIEW_REQUIRED':'FAILED_OR_INCOMPLETE',limits:{jobMinutes:10,artifactBytes:8388608,retentionDays:3,retries:0},excluded:['production activation or deployment','real-device GPU/FPS','trusted native Telegram WebView events','subjective visual acceptance'],files:[]};
for(const e of await fs.readdir(out,{withFileTypes:true})){assert(e.isFile()&&!e.isSymbolicLink(),'Only bounded evidence files allowed');if(e.name==='receipt.json')continue;const b=await fs.readFile(path.join(out,e.name));receipt.files.push({path:e.name,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
await fs.writeFile(path.join(out,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
const bytes=receipt.files.reduce((n,r)=>n+r.bytes,0)+(await fs.stat(path.join(out,'receipt.json'))).size;
assert(bytes<=8388608,`Evidence ${bytes} bytes exceeds 8 MiB; original files retained in job, upload refused`);
console.log(JSON.stringify({acceptance:receipt.acceptance,artifactBytes:bytes,retentionDays:3}));
