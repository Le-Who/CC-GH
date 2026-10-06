/** Final reviewed additions only. No commit, publication or dispatch. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {BASE,BASE_TREE,PREFIX,WORKFLOW,git,allowedPath} from './ci-contract.mjs';
import {sha} from './overlay.mjs';
assert.equal(process.argv[2],'--reviewed-final-source','Final coordinator review acknowledgment required');
const root=path.resolve(import.meta.dirname,'../../..');assert.equal(process.cwd(),root);assert.equal(git(root,['rev-parse','HEAD']),BASE,'Seal only the reviewed additions on exact parent');assert.equal(git(root,['rev-parse','HEAD^{tree}']),BASE_TREE);
const allowlist=JSON.parse(await fs.readFile(path.join(root,PREFIX,'file-allowlist.json'))),target=PREFIX+'/reviewed-source.json';assert(allowlist.every(allowedPath));assert(allowlist.includes(target)&&allowlist.includes(WORKFLOW));
const changed=[...new Set([...git(root,['diff','--name-only',BASE]).split('\n'),...git(root,['ls-files','--others','--exclude-standard']).split('\n')])].filter(Boolean).filter(p=>p!==target).sort();
assert.deepEqual(changed,allowlist.filter(p=>p!==target).sort(),'Only exact reviewed additions may be sealed');
const files=[];for(const file of changed){assert.equal(git(root,['ls-tree',BASE,'--',file]),'','Every existing file is protected');const st=await fs.lstat(path.join(root,file));assert(st.isFile()&&!st.isSymbolicLink());const b=await fs.readFile(path.join(root,file));files.push({path:file,bytes:b.length,sha256:sha(b)});}
const rows=execFileSync('git',['ls-tree','-rz','--full-tree',BASE],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
await fs.writeFile(path.join(root,target),JSON.stringify({format:'pip-grounding-ci-reviewed-source/v1',base:BASE,baseTree:BASE_TREE,protectedEntryCount:rows.length,protectedGitEntriesSha256:sha(Buffer.from(rows.join('\0')+'\0')),files},null,2)+'\n');
console.log(JSON.stringify({status:'SEALED_SOURCE_ONLY',files:files.length+1,base:BASE,publication:false,nativeRun:false}));
