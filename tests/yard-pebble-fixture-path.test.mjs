import test from 'node:test';import assert from 'node:assert/strict';
import {resolvePebbleFixturePath} from '../scripts/yard-pebble-fixture-path.mjs';
const allowedSources=new Set(['src/scene.mjs','game-logic/contract.json']),root='/fixture/root/';
const path=pathname=>resolvePebbleFixturePath({root,pathname,allowedSources});
test('CI root normalization accepts valid source and public paths even with a trailing slash',()=>{
 assert.equal(path('/__yard_qa__/index.html').path,'/fixture/root/index.html');assert.equal(path('/__yard_qa__/').path,'/fixture/root/index.html');
 assert.equal(path('/__yard_source__/src/scene.mjs').path,'/fixture/root/source/src/scene.mjs');
 assert.equal(path('/assets/yard-pebble/atlases/walk-0-00.webp').path,'/fixture/root/public/assets/yard-pebble/atlases/walk-0-00.webp');
 assert.equal(path('/assets/yard-mika/background.webp').mime,'image/webp');
});
test('CI helper rejects traversal, cross-namespace escapes, malformed encodings and unlisted files without a socket',()=>{
 for(const p of ['/__yard_qa__/../fixture.json','/__yard_qa__/%2e%2e%2fsecret.json','/__yard_source__/../fixture.json','/__yard_source__/src/private.mjs',
 '/assets/yard-pebble/%2e%2e%2fyard-mika%2fbackground.webp','/assets/yard-pebble/%2fetc%2fsecret.json','/assets/yard-pebble/%ZZ.webp','/assets/yard-pip/thing.webp','/assets/yard-pebble/a.exe'])assert.equal(path(p),null,p);
});
test('review collector separates phone JSON/screenshots from all screenshots and omits traces',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {collectPebbleDiagnostics}=await import('../scripts/collect-yard-pebble-diagnostics.mjs');const folder=await mkdtemp(join(tmpdir(),'pebble-diagnostics-'));
 try{await mkdir(join(folder,'artifacts'));const path=n=>join(folder,'artifacts',n);
  for(const n of ['evidence.json','phone.png','desktop.png','trace.zip'])await writeFile(path(n),n==='evidence.json'?'{}':'synthetic collector fixture');
  await writeFile(join(folder,'results.json'),JSON.stringify({stats:{expected:1,unexpected:0},suites:[{title:'Synthetic test',specs:[{tests:[{results:[{attachments:[{name:'evidence',path:path('evidence.json'),contentType:'application/json'},{name:'yard-320x568-rest',path:path('phone.png'),contentType:'image/png'},{name:'yard-1280x720-rest',path:path('desktop.png'),contentType:'image/png'},{name:'trace',path:path('trace.zip'),contentType:'application/zip'}]}]}]}]}]}));
  const r=await collectPebbleDiagnostics(folder);assert.equal(r['compact-diagnostics'].files,3);assert.equal(r['viewport-frames'].files,2);assert.ok(r['compact-diagnostics'].bytes<28*1048576);
  const index=JSON.parse(await readFile(join(folder,'viewport-frames/INDEX.json'),'utf8'));assert.equal(index.files.some(f=>f.name.includes('trace')),false);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('review collector decodes inline Playwright JSON and PNG bodies',async()=>{
 const {mkdtemp,writeFile,readFile,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const {collectPebbleDiagnostics}=await import('../scripts/collect-yard-pebble-diagnostics.mjs');const folder=await mkdtemp(join(tmpdir(),'pebble-inline-diagnostics-'));
 const diagnostic=JSON.stringify({pageErrors:[],requestFailures:[],httpErrors:[],consoleErrors:[]}),phone=Buffer.from([137,80,78,71,13,10,26,10,0,255]),desktop=Buffer.from([137,80,78,71,13,10,26,10,1,254]);
 try{const attachment=(name,contentType,body)=>({name,contentType,body:Buffer.from(body).toString('base64')});
  await writeFile(join(folder,'results.json'),JSON.stringify({stats:{expected:1,unexpected:0},suites:[{title:'Inline test',specs:[{tests:[{results:[{attachments:[
   attachment('pebble-boot-diagnostics','application/json',diagnostic),attachment('yard-320x568-rest','image/png',phone),attachment('yard-1280x720-rest','image/png',desktop),attachment('trace','application/zip','excluded')
  ]}]}]}]}]}));
  const r=await collectPebbleDiagnostics(folder);assert.equal(r['compact-diagnostics'].files,3);assert.equal(r['viewport-frames'].files,2);
  assert.equal(await readFile(join(folder,'compact-diagnostics/000-pebble-boot-diagnostics.json'),'utf8'),diagnostic);
  assert.deepEqual(await readFile(join(folder,'compact-diagnostics/001-yard-320x568-rest.png')),phone);
  assert.deepEqual(await readFile(join(folder,'viewport-frames/002-yard-1280x720-rest.png')),desktop);
  const index=JSON.parse(await readFile(join(folder,'compact-diagnostics/INDEX.json'),'utf8'));assert.equal(index.files.some(f=>f.name.includes('trace')),false);
  assert.deepEqual(index.files[1].titles,['Inline test']);
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('base64-heavy results are sanitized and all real evidence survives bounded shards',async()=>{
 const {mkdtemp,writeFile,readFile,readdir,stat,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createHash}=await import('node:crypto');
 const {collectPebbleDiagnostics}=await import('../scripts/collect-yard-pebble-diagnostics.mjs');const folder=await mkdtemp(join(tmpdir(),'pebble-large-inline-'));
 const digest=b=>createHash('sha256').update(b).digest('hex'),expected=new Map(),attachments=[];
 try{for(let i=0;i<5;i++){const body=Buffer.alloc(6*1048576,i+1),name=`yard-${i===0?'320x568':'1280x720'}-frame-${i}`;expected.set(name,digest(body));attachments.push({name,contentType:'image/png',body:body.toString('base64')});}
  const diagnostic=JSON.stringify({pageErrors:[],requestFailures:[],evidence:'all source labels remain'});attachments.push({name:'full-diagnostics',contentType:'application/json',body:Buffer.from(diagnostic).toString('base64')});
  const raw={stats:{expected:12,unexpected:0,flaky:0},suites:[{title:'Actual-shape large test',specs:[{tests:[{results:[{status:'passed',duration:123,attachments}]}]}]}]};
  await writeFile(join(folder,'results.json'),JSON.stringify(raw));assert.ok((await stat(join(folder,'results.json'))).size>28*1048576);
  const result=await collectPebbleDiagnostics(folder);assert.equal(result['viewport-frames'].files,5);assert.equal(result['viewport-frames'].shards.length,2);
  const summary=JSON.parse(await readFile(join(folder,'compact-diagnostics/results.json'),'utf8'));assert.deepEqual(summary.stats,raw.stats);
  const outcome=summary.suites[0].specs[0].tests[0].results[0];assert.equal(outcome.status,'passed');assert.equal(outcome.duration,123);
  assert.ok(outcome.attachments.every(a=>!Object.hasOwn(a,'body')&&a.sha256&&a.reviewFiles.length));
  assert.ok((await stat(join(folder,'compact-diagnostics/results.json'))).size<16384);
  const seen=new Map();for(const shard of result['viewport-frames'].shards){let bytes=0;for(const file of await readdir(shard.directory))bytes+=(await stat(join(shard.directory,file))).size;assert.ok(bytes<=28*1048576);assert.equal(bytes,shard.bytes);
   const index=JSON.parse(await readFile(join(shard.directory,'INDEX.json'),'utf8'));for(const file of index.files)seen.set(file.attachment,digest(await readFile(join(shard.directory,file.name))));}
  assert.deepEqual(seen,expected);assert.equal(await readFile(join(folder,'compact-diagnostics/005-full-diagnostics.json'),'utf8'),diagnostic);
  assert.ok(result['compact-diagnostics'].shards.every(s=>s.bytes<=28*1048576));
 }finally{await rm(folder,{recursive:true,force:true});}
});

test('every bounded Pebble review shard has its own unconditional CI upload',async()=>{
 const {readFile}=await import('node:fs/promises'),{validatePebbleShardUploadCoverage,PEBBLE_REVIEW_SHARDS}=await import('../scripts/collect-yard-pebble-diagnostics.mjs');
 const workflow=await readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');assert.equal(PEBBLE_REVIEW_SHARDS.length,8);assert.equal(validatePebbleShardUploadCoverage(workflow),true);
 assert.throws(()=>validatePebbleShardUploadCoverage(workflow.replace('path: test-results-yard-pebble/viewport-frames-04/','path: missing/')),/upload coverage/);
});
