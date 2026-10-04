import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

const root=fileURLToPath(new URL('../../',import.meta.url));
const base='2b721dc1f7520289366d1838185c6242c60fcb79';
const paths=['src/game-state/useGameHub.js','routes/player.js'];
const temporary=mkdtempSync(resolve(tmpdir(),'cc-gh-boundary-transfer-'));
const left=resolve(temporary,'left'),right=resolve(temporary,'right');
function baseline(path) {
  const result=spawnSync('git',['show',`${base}:${path}`],{cwd:root,windowsHide:true});
  assert.equal(result.status,0,result.stderr?.toString());return result.stdout;
}
function delta(a,b) {
  writeFileSync(left,a);writeFileSync(right,b);
  const result=spawnSync('git',['-c','core.autocrlf=false','diff','--no-index','--unified=0','--',left,right],{cwd:root,encoding:'utf8',windowsHide:true});
  assert.ok(result.status===0||result.status===1,result.stderr);
  return result.stdout.split('\n').filter(line => /^[+-]/.test(line)&&!/^([+]{3}|[-]{3}) /.test(line)).join('\n');
}
try {
  const evidence=paths.map(path => {
    const overlay=`preview/yard-persistent-candidate/overrides/${path}`;
    const originalDelta=delta(baseline(path),baseline(overlay));
    const transferredDelta=delta(readFileSync(resolve(root,path)),readFileSync(resolve(root,overlay)));
    assert.equal(transferredDelta,originalDelta,`${path}: original Yard edits changed during shared-boundary transfer`);
    return {path,yardDeltaSha256:createHash('sha256').update(originalDelta).digest('hex')};
  });
  console.log(JSON.stringify({base,originalYardEditsPreserved:true,evidence},null,2));
} finally {
  for(const file of [left,right]) { try { unlinkSync(file); } catch(error) { if(error.code!=='ENOENT')throw error; } }
  rmdirSync(temporary);
}
