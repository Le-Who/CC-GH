/** Run in a prepared isolated candidate checkout after independent source review. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const base='67d68fec4b750c5ead5b759ebbfec3239d6f3da5',dir='qa/yard-placement-redraw',self=dir+'/reviewed-source.json';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();assert.equal(git('rev-parse','HEAD'),base,'Seal only on the exact uncommitted parent');
const list=JSON.parse(await fs.readFile(dir+'/allowed-files.json','utf8'));assert.equal(new Set(list.files).size,list.files.length);assert(list.files.includes(self));assert.equal(list.finalized,true,'Coordinator must explicitly finalize the exact reviewed warm+redraw+QA allowlist');
const files=[];for(const p of list.files.slice().sort()){assert(!p.startsWith('/')&&!p.split('/').includes('..'));if(p===self)continue;const b=await fs.readFile(p);files.push({path:p,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
const actual=execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{encoding:'utf8'}).trimEnd().split('\n').filter(Boolean).map(r=>r.slice(3)).filter(p=>p!=='node_modules'&&p!==self).sort();assert.deepEqual(actual,list.files.filter(p=>p!==self).sort(),'No extra/missing modified or untracked files may enter the packet');
await fs.writeFile(self,JSON.stringify({base,baseTree:git('rev-parse',base+'^{tree}'),files,limits:{branch:'qa/yard-placement-redraw-20261006',jobMinutes:10,artifactBytes:8388608,retentionDays:3,retries:0}},null,2)+'\n');console.log(JSON.stringify({files:files.length,manifest:self}));
