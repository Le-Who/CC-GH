import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {W,H,BYTES,assemble,exact,exteriorDiff,separatedPropMask,composite,stableGardenBackground} from './pixels.mjs';
import {assertLaunch,LIMITS} from './run.mjs';
import {qualityFixture} from './fixture.mjs';
import {createOverlay} from './overlay.mjs';
import {installBoundedDiagnostics,serializeBoundedReport,REPORT_RESERVE_BYTES,utf8Prefix} from './diagnostics.mjs';
const root=process.env.YARD_QUALITY_SOURCE_ROOT,packet=path.resolve(import.meta.dirname,'..');
test('launch rejects local/unapproved and repeated attempts; 10min/8MiB/3days fixed scope',()=>{
  assert.throws(()=>assertLaunch({}),/explicitly admitted/);
  const env={GITHUB_ACTIONS:'true',GITHUB_RUN_ATTEMPT:'1',YARD_PIP_QUALITY_NATIVE:'1',GITHUB_SHA:'a'.repeat(40)};
  assert.doesNotThrow(()=>assertLaunch(env));for(const p of[{GITHUB_RUN_ATTEMPT:'2'},{YARD_PIP_QUALITY_NATIVE:'0'},{GITHUB_SHA:'main'}])assert.throws(()=>assertLaunch({...env,...p}));
  assert.deepEqual(LIMITS,{jobMinutes:10,browserSeconds:240,artifactBytes:8388608,retentionDays:3,retries:0});
});
test('row assembly rejects gaps, ordering, wrong sizes and short coverage, exact comparison keeps all bytes',()=>{
  const rows=[];for(let y=0;y<H;y+=16){const n=Math.min(16,H-y);rows.push({y,rows:n,width:W,height:H,rowOrder:'bottom-up',encoding:'output-encoded premultiplied RGBA8',dataBase64:Buffer.alloc(W*n*4,y%256).toString('base64')});}
  const a=assemble(rows);assert.equal(a.length,BYTES);assert.deepEqual(exact(a,a),{passed:true,comparedBytes:1010880,mismatches:0});
  const b=Buffer.from(a);b[BYTES-1]^=1;assert.equal(exact(a,b).mismatches,1);
  assert.throws(()=>assemble(rows.slice(1)));assert.throws(()=>assemble(rows.slice(0,-1)));assert.throws(()=>assemble([{...rows[0],rows:17},...rows.slice(1)]));
});
test('exterior gate catches expansion, support loss and detail changes; transparent composite flips once',()=>{
  const a=Buffer.alloc(BYTES);for(let y=5;y<10;y++)for(let x=5;x<10;x++){const p=(y*W+x)*4;a[p]=100;a[p+3]=255;}
  assert(exteriorDiff(a,a).passed);
  for(const [index,value]of[[3,1],[(7*W+7)*4,99],[(5*W+5)*4+3,0]]){const b=Buffer.from(a);b[index]=value;assert.equal(exteriorDiff(a,b).passed,false);}
  const light=composite(a,255),dark=composite(a,0);assert.equal(light[0],255);assert.equal(dark[0],0);assert.equal(dark[((H-1-7)*W+7)*3],100);
});
test('fixed-prop proof rejects empty/actor-overlapped masks and catches regional changes',()=>{
  const props=Buffer.alloc(BYTES),actor=Buffer.alloc(BYTES);assert.throws(()=>separatedPropMask(props,actor));
  for(let y=10;y<20;y++)for(let x=10;x<20;x++)props[(y*W+x)*4+3]=255;
  const {mask,pixels}=separatedPropMask(props,actor);assert.equal(pixels,100);assert(exact(props,props,mask).passed);
  const changed=Buffer.from(props);changed[(15*W+15)*4]=1;assert.equal(exact(props,changed,mask).passed,false);
  assert.throws(()=>separatedPropMask(props,props));
});
test('garden screenshot check catches actual fixed-background changes outside native alpha',()=>{
  const s={info:{width:W,height:H,channels:3},data:Buffer.alloc(W*H*3,64)},t={info:s.info,data:Buffer.from(s.data)},raw=Buffer.alloc(BYTES),geometry={stageCSS:{x:0,y:0,width:W,height:H},canvasCSS:{x:0,y:0,width:W,height:H}};
  assert(stableGardenBackground(s,t,raw,geometry).passed);t.data[0]++;assert.equal(stableGardenBackground(s,t,raw,geometry).passed,false);
});
test('QA overlay uses current unchanged modules, literal optional seam, real scene and bounded page buffers',{skip:!root},async()=>{
  const {map,plugin}=await createOverlay(path.resolve(root),packet),entry=path.join(root,'src/games/companion-yard-v2/scene-entry.mjs');
  assert.match(map.get(entry),/VITE_YARD_PIP_PREVIEW==='true'/);assert.match(map.get(entry),/qa\/yard-pip-quality-native\/browser-entry/);
  assert.equal(plugin.resolveId('./pip-quality-copy.mjs',path.join(root,'src/games/companion-yard-v2/pip-prototype/prototype/optional-pip-renderer.mjs')),path.join(root,'src/games/companion-yard-v2/pip-prototype/prototype/pip-quality-copy.mjs'));
  const fixture=await qualityFixture(path.resolve(root));assert.equal(fixture.yardRuntime.canonicalPlacements.length,2);assert.deepEqual(fixture.yardRuntime.canonicalPlacements.map(r=>[r.x,r.y]),[[98,118],[72,145]]);
  const probe=map.get(path.join(root,'tests/yard-pip-quality-browser-probe.mjs'));assert.match(probe,/MIN_OPAQUE_ACTOR_PIXELS = 64/);assert.match(probe,/OPAQUE_ACTOR_ALPHA_BYTE = 230/);assert.match(probe,/new Uint8Array\(WIDTH \* CHUNK_ROWS \* 4\)/);assert.doesNotMatch(probe,/new Uint8Array\(WIDTH \* HEIGHT/);
  const run=await fs.readFile(new URL('./run.mjs',import.meta.url),'utf8');assert.doesNotMatch(run,/http\.createServer|\.listen\(|retry|recordVideo/);assert.match(run,/scale:'device'/);assert.match(run,/report\.identity\.comparedBytes,BYTES/);
});
test('4,200 page errors remain count/UTF-8 bounded and preserve first fatal after overflow',()=>{
  const report=installBoundedDiagnostics({format:'test',status:'FAILED_OR_INCOMPLETE',limits:LIMITS,phases:{identity:'not-run'},errors:[],console:[],captures:[]});
  for(let n=0;n<4200;n++)report.errors.push({type:'pageerror',message:'x'.repeat(2048)});
  report.errors.push({type:'fatal',message:'Original identity failure',stack:'stack'});
  for(let n=0;n<100;n++)report.console.push({type:'warning',text:'🐹'.repeat(2048)});
  report.console.push({type:'error',text:'Late error must still fail clean gate'});
  assert.equal(report.diagnosticLimits.errors.seen,4201);assert(report.diagnosticLimits.errors.omitted>4100);
  assert(report.errors.length<=48);assert(report.diagnosticLimits.errors.retainedUTF8Bytes<=24576);
  assert.equal(report.firstFatal.message,'Original identity failure');assert.equal(report.diagnosticLimits.console.errorEventsSeen,1);
  assert(report.diagnosticLimits.console.retainedUTF8Bytes<=8192);
  const result=serializeBoundedReport(report);assert(result.bytes.length<=REPORT_RESERVE_BYTES);assert.equal(result.reduced,false);
  const parsed=JSON.parse(result.bytes);assert(parsed.diagnosticLimits.errors.omitted>4100);assert.equal(parsed.firstFatal.message,'Original identity failure');
});
test('oversized snapshots are reduced before write; Unicode and escaped controls obey UTF-8 allowance',()=>{
  const report=installBoundedDiagnostics({format:'test',status:'RUNNING',limits:LIMITS,errors:[],console:[],captures:[],failureSnapshot:{untrusted:'🐹'.repeat(3000000)}});
  report.errors.push({type:'fatal',message:'\n'.repeat(10000)});
  const result=serializeBoundedReport(report);assert.equal(result.reduced,true);assert(result.bytes.length<=REPORT_RESERVE_BYTES);
  const parsed=JSON.parse(result.bytes);assert.equal(parsed.status,'FAILED_OR_INCOMPLETE');assert(parsed.omittedDetail.fields.includes('failureSnapshot'));assert(parsed.omittedDetail.originalUTF8Bytes>8388608);
  assert(Buffer.byteLength(JSON.stringify(parsed.firstFatal))<=4096);assert.equal(Buffer.byteLength(utf8Prefix('🐹'.repeat(9),7)),4);
});
