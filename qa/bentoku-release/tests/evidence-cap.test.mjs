import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {verifyOriginalBundle,EVIDENCE_CAP} from '../evidence-bundle.mjs';
import {readEvidenceZip} from '../../../scripts/yard-development-receipt.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
test('complete9MiB original round-trips above the old cap; corruption still fails closed',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ccgh-bentoku-evidence-'));
 assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('ccgh-bentoku-evidence-'));
 try{
  const raw=path.join(root,'raw');await fs.mkdir(raw);const original=randomBytes(9*1024*1024);await fs.writeFile(path.join(raw,'opaque.bin'),original);
  const manifest=Buffer.from(JSON.stringify({format:'yard-lossless-evidence/v1',files:[{path:'opaque.bin',bytes:original.length,sha256:sha(original)}]})+'\n');await fs.writeFile(path.join(root,'manifest.json'),manifest);
  const python=process.platform==='win32'?'python':'python3';
  execFileSync(python,['-I',path.resolve('qa/bentoku-release/evidence-zip.py'),raw,path.join(root,'manifest.json'),path.join(root,'evidence.zip')],{timeout:15000});
  const inner=await fs.readFile(path.join(root,'evidence.zip'));
  const summary={status:'PACKAGED',completeOriginalsStaged:true,retentionDays:3,capBytes:EVIDENCE_CAP,archiveBytes:inner.length,archiveSha256:sha(inner),manifestSha256:sha(manifest),originalCount:1};
  summary.transferBytesUpperBound=inner.length+8192;assert(summary.transferBytesUpperBound<EVIDENCE_CAP);await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(summary));
  execFileSync(python,['-I','-c',"import pathlib,sys,zipfile;d=pathlib.Path(sys.argv[1]);z=zipfile.ZipFile(d/'outer.zip','w');z.write(d/'evidence.zip','evidence.zip');z.write(d/'summary.json','summary.json');z.close()",root],{timeout:15000});
  const outer=await fs.readFile(path.join(root,'outer.zip'));assert(outer.length>8*1024*1024&&outer.length<EVIDENCE_CAP);
  const result=verifyOriginalBundle(outer);assert.deepEqual(result.files['opaque.bin'],original);
  assert.throws(()=>readEvidenceZip(outer));assert.throws(()=>verifyOriginalBundle(outer.subarray(0,-1)));
  const corrupt=Buffer.from(outer);corrupt[100]^=1;assert.throws(()=>verifyOriginalBundle(corrupt));
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
