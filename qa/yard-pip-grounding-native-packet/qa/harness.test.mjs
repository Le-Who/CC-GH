import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';
import {W,H,BYTES,assemble,exact,sameOpaqueCoverage,separatedPropMask,composite,stableGardenBackground} from './pixels.mjs';
import {assertLaunch,LIMITS,motionReceipt} from './run.mjs';
import {qualityFixture} from './fixture.mjs';
import {createOverlay} from './overlay.mjs';
import {installBoundedDiagnostics,serializeBoundedReport,REPORT_RESERVE_BYTES,utf8Prefix} from './diagnostics.mjs';
const root=process.env.YARD_GROUNDING_SOURCE_ROOT,packet=path.resolve(import.meta.dirname,'..');
test('launch rejects local/unapproved and repeated attempts; 10min/8MiB/3days fixed scope',()=>{
  assert.throws(()=>assertLaunch({}),/explicitly admitted/);
  const env={GITHUB_ACTIONS:'true',GITHUB_RUN_ATTEMPT:'1',YARD_PIP_GROUNDING_NATIVE:'1',GITHUB_SHA:'a'.repeat(40)};
  assert.doesNotThrow(()=>assertLaunch(env));for(const p of[{GITHUB_RUN_ATTEMPT:'2'},{YARD_PIP_GROUNDING_NATIVE:'0'},{GITHUB_SHA:'main'}])assert.throws(()=>assertLaunch({...env,...p}));
  assert.deepEqual(LIMITS,{jobMinutes:10,browserSeconds:240,artifactBytes:8388608,retentionDays:3,retries:0});
});
test('row assembly rejects gaps, ordering, wrong sizes and short coverage, exact comparison keeps all bytes',()=>{
  const rows=[];for(let y=0;y<H;y+=16){const n=Math.min(16,H-y);rows.push({y,rows:n,width:W,height:H,rowOrder:'bottom-up',encoding:'output-encoded premultiplied RGBA8',dataBase64:Buffer.alloc(W*n*4,y%256).toString('base64')});}
  const a=assemble(rows);assert.equal(a.length,BYTES);assert.deepEqual(exact(a,a),{passed:true,comparedBytes:1010880,mismatches:0});
  const b=Buffer.from(a);b[BYTES-1]^=1;assert.equal(exact(a,b).mismatches,1);
  assert.throws(()=>assemble(rows.slice(1)));assert.throws(()=>assemble(rows.slice(0,-1)));assert.throws(()=>assemble([{...rows[0],rows:17},...rows.slice(1)]));
});
test('transparent composite flips native rows once and preserves premultiplied values',()=>{
 const a=Buffer.alloc(BYTES);a[(7*W+7)*4]=100;a[(7*W+7)*4+3]=255;
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
test('narrow overlay keeps original resources and scene, excludes the rejected filter',{skip:!root},async()=>{
  const {map}=await createOverlay(path.resolve(root),packet),entry=path.join(root,'src/games/companion-yard-v2/scene-entry.mjs');
  assert.match(map.get(entry),/VITE_YARD_PIP_PREVIEW==='true'/);assert.match(map.get(entry),/qa\/yard-pip-grounding-native\/browser-entry/);
  assert.equal(map.has(path.join(root,'src/games/companion-yard-v2/pip-prototype/resources.mjs')),false);
  assert.equal(map.has(path.join(root,'src/games/companion-yard-v2/pip-prototype/yard-pip-scene.mjs')),false);
  assert.equal([...map.keys()].some(p=>p.includes('pip-quality-')),false);
  const fixture=await qualityFixture(path.resolve(root));assert.deepEqual(fixture.yardRuntime.canonicalPlacements.map(r=>[r.x,r.y]),[[98,118],[72,145]]);
  const run=await fs.readFile(new URL('./run.mjs',import.meta.url),'utf8');assert.doesNotMatch(run,/http\.createServer|\.listen\(|video\.delete|video\.saveAs/);assert.match(run,/scale:'device'/);assert.match(run,/browser.contexts\(\).length,0/);
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

test('whole-raster opaque coverage rejects added/removed actor or T2 support while admitting low-alpha contact changes',()=>{
 const a=Buffer.alloc(BYTES);for(let i=0;i<100;i++)a[i*4+3]=255;const b=Buffer.from(a);b[500*4+3]=160;assert(sameOpaqueCoverage(a,b).passed);
 b[500*4+3]=255;assert.equal(sameOpaqueCoverage(a,b).addedOpaquePixels,1);assert.equal(sameOpaqueCoverage(a,b).passed,false);
 b[500*4+3]=0;b[10*4+3]=0;assert.equal(sameOpaqueCoverage(a,b).removedOpaquePixels,1);assert.equal(sameOpaqueCoverage(a,b).passed,false);
 b[10*4+3]=254;assert.equal(sameOpaqueCoverage(a,b).opaqueAlphaChanges,1);assert.equal(sameOpaqueCoverage(a,b).passed,false);
});

test('both maximum bounded motion traces remain separate lossless originals without overflowing report metadata',()=>{
 const motion={trace:Array.from({length:32},()=>({world:{root:{x:123.456789,y:123.456789,z:0},detail:'x'.repeat(2000)}})),traceOmitted:100,rendered:500,sample:{world:{moving:false}},timeScale:1,syntheticPoseInjection:false};
 const baseline=motionReceipt(motion,'baseline-motion-trace.json'),candidate=motionReceipt(motion,'grounded-motion-trace.json');
 assert.equal(baseline.traceSamples,32);assert.equal(baseline.traceOmitted,100);assert.equal(baseline.traceStoredLosslessly,true);assert.equal(Object.hasOwn(baseline,'trace'),false);assert.equal(motion.trace.length,32);
 const report=installBoundedDiagnostics({format:'test',status:'RUNNING',errors:[],console:[],owners:[{heldAndCost:'x'.repeat(65536)},{motion:baseline},{motion:candidate}]});
 const serialized=serializeBoundedReport(report);assert.equal(serialized.reduced,false);assert(serialized.bytes.length<REPORT_RESERVE_BYTES);
 assert.throws(()=>motionReceipt({...motion,trace:[...motion.trace,{}]},'baseline-motion-trace.json'));
});
