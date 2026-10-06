import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {packageEvidence,EVIDENCE_CAP,OUTER_ZIP_ALLOWANCE} from './package-evidence.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
async function fixture(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yard-evidence-zip-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const rawDir=path.join(dir,'raw');await fs.mkdir(rawDir);return{dir,rawDir};}
const run=(f,suffix,log=()=>{})=>packageEvidence({rawDir:f.rawDir,workDir:path.join(f.dir,'work-'+suffix),uploadDir:path.join(f.dir,'upload-'+suffix),metadata:{head:'a'.repeat(40)},log});

test('every original round-trips losslessly; ZIP is deterministic despite filesystem times',async t=>{
 const f=await fixture(t),sources={'browser.json':Buffer.from(JSON.stringify({observations:'same observed frame '.repeat(550000)})),'frame.png':randomBytes(160000),'original.webm':randomBytes(200000),'receipt.json':Buffer.from('{"acceptance":"FAILED_OR_INCOMPLETE"}\n')};for(const[name,b]of Object.entries(sources))await fs.writeFile(path.join(f.rawDir,name),b);
 const first=await run(f,'one');assert(first.ok);assert(first.summary.rawBytes>EVIDENCE_CAP);assert(first.uploadBytes+OUTER_ZIP_ALLOWANCE<=EVIDENCE_CAP);
 for(const name of Object.keys(sources))await fs.utimes(path.join(f.rawDir,name),1,1);const second=await run(f,'two');assert(second.ok);assert.deepEqual(await fs.readFile(first.archive),await fs.readFile(second.archive));assert.equal(first.summary.manifestSha256,second.summary.manifestSha256);
 const verified=JSON.parse(execFileSync('python3',['-c',`import sys,zipfile,json,hashlib,pathlib
z=zipfile.ZipFile(sys.argv[1]);m=json.loads(z.read('MANIFEST.sha256.json'));assert set(z.namelist())=={r['path'] for r in m['files']}|{'MANIFEST.sha256.json'}
for r in m['files']:
 b=z.read(r['path']);assert b==(pathlib.Path(sys.argv[2])/r['path']).read_bytes();assert len(b)==r['bytes'];assert hashlib.sha256(b).hexdigest()==r['sha256']
for i in z.infolist():assert i.date_time==(1980,1,1,0,0,0) and i.compress_type==zipfile.ZIP_DEFLATED
print(json.dumps({'files':len(m['files'])}))`,first.archive,f.rawDir],{encoding:'utf8'}));assert.equal(verified.files,Object.keys(sources).length);
 for(const[name,b]of Object.entries(sources))assert.equal(sha(await fs.readFile(path.join(f.rawDir,name))),sha(b));
 // Independently model an uncompressed outer artifact ZIP, including the two
 // uploaded short filenames. Deflate level0 includes its framing overhead.
 const outer=path.join(f.dir,'outer.zip');execFileSync('python3',['-c',`import zipfile,pathlib,sys
p=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED,compresslevel=0) as z:
 for f in sorted(p.iterdir()):z.write(f,arcname=f.name)`,path.join(f.dir,'upload-one'),outer]);assert((await fs.stat(outer)).size<=first.uploadBytes+OUTER_ZIP_ALLOWANCE);assert((await fs.stat(outer)).size<=EVIDENCE_CAP);
});

test('incompressible oversized evidence fails closed but emits a bounded explicit diagnostic and retains originals',async t=>{
 const f=await fixture(t),raw=randomBytes(EVIDENCE_CAP+65536),file=path.join(f.rawDir,'incompressible.bin');await fs.writeFile(file,raw);const logs=[],result=await run(f,'large',s=>logs.push(s));assert.equal(result.ok,false);assert.equal(result.summary.status,'OVER_CAP');assert.equal(result.summary.completeOriginalsStaged,false);assert(result.summary.transferBytesUpperBound>EVIDENCE_CAP);assert.deepEqual(await fs.readdir(path.join(f.dir,'upload-large')),['summary.json']);assert.equal(sha(await fs.readFile(file)),sha(raw));assert((await fs.stat(result.archive)).size>EVIDENCE_CAP);assert(logs.length===1&&logs[0].length<8192);assert.match(logs[0],/not be retrievable/);assert((await fs.stat(path.join(f.dir,'upload-large/summary.json'))).size<=8192);
});

test('unsafe evidence input also produces a failure summary and never claims complete evidence',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.rawDir,'MANIFEST.sha256.json'),'original reserved collision');const logs=[],result=await run(f,'bad',s=>logs.push(s));assert.equal(result.ok,false);assert.equal(result.summary.status,'PACKAGING_FAILED');assert.equal(result.summary.completeOriginalsStaged,false);assert.match(result.summary.error,/reserved/);assert.equal(await fs.readFile(path.join(f.rawDir,'MANIFEST.sha256.json'),'utf8'),'original reserved collision');assert.equal(logs.length,1);
});

test('workflow uploads diagnostic staging even if the cap step fails, without raising bounds',async()=>{
 const workflow=await fs.readFile(new URL('../../.github/workflows/yard-canonical-dynamic.yml',import.meta.url),'utf8'),source=await fs.readFile(new URL('./evidence.mjs',import.meta.url),'utf8');assert.match(workflow,/uses: actions\/upload-artifact@v7\n        if: always\(\)/);assert.match(workflow,/path: qa\/yard-canonical-acceptance\/upload\//);assert.match(workflow,/retention-days: 3/);assert.match(workflow,/compression-level: 0/);assert.match(source,/if\(!result.ok\)process.exitCode=1/);assert.match(source,/GITHUB_STEP_SUMMARY/);assert.equal(EVIDENCE_CAP,8388608);
});

test('near-cap incompressible success includes measured summary and conservative outer ZIP framing',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.rawDir,'near-cap.bin'),randomBytes(EVIDENCE_CAP-32768));const result=await run(f,'near');assert(result.ok);assert(result.summary.transferBytesUpperBound<=EVIDENCE_CAP);const outer=path.join(f.dir,'outer.zip');execFileSync('python3',['-I','-c',`import zipfile,pathlib,sys
p=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],'w',compression=zipfile.ZIP_DEFLATED,compresslevel=0) as z:
 for f in sorted(p.iterdir()):z.write(f,arcname=f.name)`,path.join(f.dir,'upload-near'),outer]);const actual=(await fs.stat(outer)).size;assert(actual<=result.summary.transferBytesUpperBound);assert(actual<=EVIDENCE_CAP);
});
