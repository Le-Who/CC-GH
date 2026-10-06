/** Run once, only AFTER a human/parent review of the final integrated delta. No dispatch. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
assert.equal(process.argv[2],'--reviewed-final-source','Explicit final source review acknowledgment required');
const base='cc23a6f2f0f58eda6b21f7950f285e30dde3656e',target='qa/yard-canonical-acceptance/reviewed-source.json';
const tracked=execFileSync('git',['diff','--name-only',base],{encoding:'utf8'}).trim().split('\n');
const added=execFileSync('git',['ls-files','--others','--exclude-standard'],{encoding:'utf8'}).trim().split('\n');
const paths=[...new Set([...tracked,...added])].filter(p=>p&&p!==target&&!p.startsWith('qa/yard-canonical-acceptance/work/')&&!p.startsWith('qa/yard-canonical-acceptance/results/')&&p!=='node_modules').sort();
const files=[];for(const path of paths){assert(!path.endsWith('.log')&&!path.endsWith('.patch'),'Only reviewed source belongs in final delta: '+path);let deleted=false,b;try{b=await fs.readFile(path);}catch(error){if(error.code!=='ENOENT')throw error;deleted=true;b=execFileSync('git',['show',`${base}:${path}`]);}files.push({path,...(deleted?{deleted:true}:{}),bytes:b.length,sha256:createHash('sha256').update(b).digest('hex')});}
await fs.writeFile(target,JSON.stringify({format:'yard-canonical-reviewed-source/v1',base,files},null,2)+'\n');
console.log(`Sealed ${files.length} changed files; commit this manifest with exactly those files. No acceptance was run.`);
