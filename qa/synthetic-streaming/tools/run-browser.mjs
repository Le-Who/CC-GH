import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {capacity} from '../src/capacity.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.CI!=='true')throw Error('Browser fixture QA runs only in CI');
const root=fileURLToPath(new URL('../',import.meta.url));
const manifest=JSON.parse(await fs.readFile(path.join(root,'generated/manifest.json'),'utf8'));
const allowed=new Set(['index.html','generated/manifest.json','src/browser-harness.mjs','src/capacity.mjs',
  'src/encoded-prefetch.mjs','src/prefetched-atlas.mjs','vendor/r5/atlas.mjs','vendor/r5/runtime-cells.mjs',
  'vendor/r5/decoded-capacity.mjs',...manifest.pages.map(p=>p.src)]);
const serverCounts=new Map();
const server=http.createServer(async(req,res)=>{try{
  const u=new URL(req.url,'http://localhost'),relative=u.pathname==='/'?'index.html':u.pathname.slice(1);
  if(!allowed.has(relative)){res.writeHead(404);res.end();return;}
  const bytes=await fs.readFile(path.join(root,relative));
  if(relative.endsWith('.webp')) {
    const delay=Number(u.searchParams.get('delay')||0);assert.ok([0,8,80,240].includes(delay));
    const name=u.searchParams.get('case')||'proof';
    const c=serverCounts.get(name)||{requests:0,bytes:0,active:0,peak:0};serverCounts.set(name,c);
    c.active++;c.peak=Math.max(c.peak,c.active);
    await new Promise(r=>setTimeout(r,delay));c.active--;c.requests++;c.bytes+=bytes.length;
  }
  res.writeHead(200,{'Content-Type':relative.endsWith('.webp')?'image/webp':relative.endsWith('.json')?'application/json':relative.endsWith('.mjs')?'text/javascript':'text/html',
    'Content-Length':bytes.length,'Cache-Control':'no-store'});res.end(bytes);
}catch(error){res.writeHead(500);res.end(String(error));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
await fs.mkdir(path.join(root,'results'),{recursive:true});
const browser=await chromium.launch({headless:true});
const landscape={width:844,height:390,dpr:2},portrait={width:390,height:844,dpr:2};
const specs=[];
for(const [owners,alias,label] of [[1,false,'one-owner'],[8,true,'eight-aliases'],[8,false,'eight-distinct']])
  for(const fetchMs of [8,80])specs.push({...landscape,owners,alias,fetchMs,prefetch:true,name:`${label}-${fetchMs}ms-prefetch`});
specs.push({...landscape,owners:8,alias:false,fetchMs:8,prefetch:false,name:'eight-distinct-8ms-serial-baseline'},
  {...landscape,owners:8,alias:false,fetchMs:80,prefetch:false,name:'eight-distinct-80ms-serial-baseline'},
  {...landscape,owners:8,alias:false,fetchMs:240,prefetch:true,name:'eight-distinct-240ms-prefetch-stress'},
  {...portrait,owners:8,alias:false,fetchMs:80,prefetch:true,name:'portrait-eight-distinct-80ms-prefetch'});
const filter=process.env.SYNTHETIC_CASES?.split(',');
const results=[],pageErrors=[],abortedCases=[];
try {
  const proofContext=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  const proofPage=await proofContext.newPage();await proofPage.goto(origin);await proofPage.waitForFunction(()=>window.syntheticHarness);
  console.log('BROWSER_PIXEL_PROOF '+JSON.stringify(await proofPage.evaluate(()=>window.syntheticHarness.verifyBrowserPixels())));
  await proofContext.close();
  const profiles=[[390,844,2],[844,390,2],[1280,720,1],[1280,720,2],[390,844,3]].map(([w,h,d])=>capacity(w,h,d));
  assert.deepEqual(profiles.map(p=>p.fits),[true,true,true,false,false]);
  console.log('CAPACITY_PROOF '+JSON.stringify({profiles,rejectedBeforeCanvasAllocation:true,
    scope:'Shared reservations plus two backing stores plus sixteen capped pages; no HUD, real-actor or hardware claim'}));
  for(const spec of specs.filter(s=>!filter||filter.includes(s.name))) {
    const context=await browser.newContext({viewport:{width:spec.width,height:spec.height},deviceScaleFactor:spec.dpr,isMobile:true,hasTouch:true});
    const page=await context.newPage();page.on('pageerror',error=>pageErrors.push({case:spec.name,message:error.message}));
    await page.goto(origin);await page.waitForFunction(()=>window.syntheticHarness);
    console.log('CASE_START '+spec.name);
    try {
    const result=await page.evaluate(spec=>window.syntheticHarness.runCase(spec),spec);
    result.server=serverCounts.get(spec.name);results.push(result);
    await fs.writeFile(path.join(root,'results',`${spec.name}.json`),JSON.stringify(result,null,2));
    const {events,sourceWindowSamples,readyEvents,...summary}=result;
    console.log('CASE_RESULT '+JSON.stringify(summary));
    // Preserve timing evidence in text logs rather than uploading an artifact.
    console.log('WINDOW_SAMPLES '+JSON.stringify({name:spec.name,samples:sourceWindowSamples}));
    console.log('READY_LATENCIES '+JSON.stringify({name:spec.name,readyEvents}));
    }catch(error){const failure={name:spec.name,message:error.message,sourceWindowsNotClaimed:true};abortedCases.push(failure);console.log('CASE_ABORT '+JSON.stringify(failure));}
    finally{await context.close();}
  }
  const nominal=results.filter(r=>r.prefetch&&r.fetchMs<=80);
  const report={testFixtureOnly:true,browserVersion:browser.version(),sourceCommit:process.env.GITHUB_SHA,
    hardware:'standard Ubuntu GitHub runner Chromium; phone viewport emulation only',
    noRealActors:true,noArtApproval:true,noProductionActivation:true,noFullHUDClaim:true,
    correctnessPassed:abortedCases.length===0&&pageErrors.length===0&&results.every(r=>r.errors.length===0),
    nominalDeadlineQualificationPassed:abortedCases.length===0&&nominal.every(r=>r.noPendingActorSamples&&r.allSourceWindowsDrawn),
    stressExcludedFromPassCriteria:true,serialBaselineExcludedFromPassCriteria:true,
    pageErrors,abortedCases,results:results.map(({events,sourceWindowSamples,readyEvents,...r})=>r)};
  await fs.writeFile(path.join(root,'results/summary.json'),JSON.stringify(report,null,2));
  console.log('FINAL_REPORT '+JSON.stringify(report));
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
    `Synthetic fixtures only. Chromium ${report.browserVersion}.\n\nCorrectness: ${report.correctnessPassed?'PASS':'FAIL'}; nominal zero-pending/deadline criterion: ${report.nominalDeadlineQualificationPassed?'PASS':'FAIL'}.\n\n`+
    report.results.map(r=>`${r.name}: drawn ${r.distinctWindowsDrawn}/${r.expectedSourceWindows}; never sampled ${r.windowsNeverSampled}; sampled never ready ${r.sampledWindowsNeverReady}; pending actor samples ${r.pendingActorSamples}; pending ticks ${r.pendingTicks}; warmup ${r.warmupMs.toFixed(1)} ms.\n`).join('\n'));
  // The stress case is measurement, not a forced pass. Nominal deadline failures
  // make the check red and remain in the immutable run logs.
  if(!report.correctnessPassed||!report.nominalDeadlineQualificationPassed)process.exitCode=1;
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
