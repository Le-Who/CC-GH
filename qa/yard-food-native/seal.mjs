/** Coordinator-only local sealing after reviewed product+QA overlays have been applied. No run or publication. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {inheritedServicePin,INHERITED_SERVICE} from './inherited-source.mjs';
import {BASE,HISTORICAL_BASE,DIR,LIMITS} from './identity.mjs';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim(),self=DIR+'/reviewed-source.json';assert.equal(git('rev-parse','HEAD'),BASE);
const allow=JSON.parse(await fs.readFile(DIR+'/allowed-files.json','utf8'));assert.equal(allow.finalized,true,'Independent source review must finalize the literal allowlist');assert.equal(new Set(allow.files).size,allow.files.length);assert(allow.files.includes(self));
const files=[];for(const p of allow.files.slice().sort()){assert(!p.startsWith('/')&&!p.split('/').includes('..'));if(p===self)continue;const b=await fs.readFile(p);files.push({path:p,bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
const actual=execFileSync('git',['status','--porcelain=v1','--untracked-files=all'],{encoding:'utf8'}).trimEnd().split('\n').filter(Boolean).map(r=>r.slice(3)).filter(p=>p!=='node_modules'&&p!==self).sort();assert.deepEqual(actual,allow.files.filter(p=>p!==self).sort());
assert.equal(git('rev-parse',BASE+'^'),HISTORICAL_BASE);const bytes=await fs.readFile(INHERITED_SERVICE),parent=execFileSync('git',['show',BASE+':'+INHERITED_SERVICE]);assert.deepEqual(bytes,parent);const inherited=[inheritedServicePin(parent)];
await fs.writeFile(self,JSON.stringify({base:BASE,historicalBase:HISTORICAL_BASE,inherited,baseTree:git('rev-parse',BASE+'^{tree}'),files,limits:LIMITS},null,2)+'\n');console.log(JSON.stringify({manifest:self,files:files.length,qualification:'SEALED_NOT_EXECUTED'}));
