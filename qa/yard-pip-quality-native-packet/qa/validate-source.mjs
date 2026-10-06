/** Only source files/symlinks and Node tests. No build, browser or listener. */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {installedPaths} from './ci-contract.mjs';
const p=installedPaths();assert.equal(JSON.parse(await fs.readFile(path.join(p.results,'preflight.json'))).status,'PREFLIGHT_PASSED');
await fs.mkdir(p.validation);
async function sparse(source,target,overlay){
  const src=await fs.readdir(source).catch(()=>[]),changes=await fs.readdir(overlay).catch(()=>[]);
  for(const name of new Set([...src,...changes])){
    if(['.git','dist'].includes(name))continue;
    const a=path.join(source,name),b=path.join(target,name),c=path.join(overlay,name),change=await fs.lstat(c).catch(()=>null);
    if(change?.isDirectory()){await fs.mkdir(b);await sparse(a,b,c);}
    else if(change?.isFile())await fs.copyFile(c,b);
    else{const stat=await fs.stat(a);await fs.symlink(a,b,stat.isDirectory()?'dir':'file');}
  }
}
await sparse(p.root,p.validation,path.join(p.packet,'source-overlay'));
execFileSync(process.execPath,['--preserve-symlinks','--preserve-symlinks-main','--import','./tests/yard-pip-register-vendor.mjs','--test','--test-concurrency=1','tests/yard-pip-quality-probe.test.mjs'],{cwd:p.validation,stdio:'inherit',timeout:45000});
execFileSync(process.execPath,['--test','--test-concurrency=1',path.join(p.packet,'qa/harness.test.mjs'),path.join(p.packet,'qa/ci.test.mjs'),path.join(p.root,'qa/yard-canonical-acceptance/package-evidence.test.mjs')],{cwd:p.root,env:{...process.env,YARD_QUALITY_SOURCE_ROOT:p.root},stdio:'inherit',timeout:60000});
