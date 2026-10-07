import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {here,sourceRoot,assetRoot,resolveSource} from './config.mjs';
const require=createRequire(path.join(process.env.YARD_DEPENDENCY_ROOT||assetRoot,'package.json'));
const {chromium}=require('@playwright/test');
const capture=JSON.parse(await fs.readFile(path.join(here,'capture-plan.json'))),out=process.env.YARD_VISUAL_OUTPUT||path.join(here,'native-evidence');await fs.mkdir(out,{recursive:true});
const sourcePins=JSON.parse(await fs.readFile(path.join(here,'source-provenance.json'))),assetPins=JSON.parse(await fs.readFile(path.join(here,'asset-provenance.json')));
const expectedSources=new Map([...sourcePins.baseline,...sourcePins.overlay,...assetPins.assets].map(row=>[row.path,row.sha256]));
for(const [relative,expected]of expectedSources){const actual=createHash('sha256').update(await fs.readFile(resolveSource(relative))).digest('hex');assert.equal(actual,expected,'Source changed before native capture: '+relative);}
const served=new Map(),errors=[],metrics=[];
const mime=file=>file.endsWith('.json')?'application/json':file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':file.endsWith('.html')?'text/html':file.endsWith('.png')?'image/png':'application/octet-stream';
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});
async function open(viewport,video=false){const {deviceScaleFactor,...size}=viewport,context=await browser.newContext({viewport:size,deviceScaleFactor,isMobile:true,hasTouch:true,...(video?{recordVideo:{dir:path.join(out,'raw-video'),size}}:{})}),page=await context.newPage();
 page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
 await page.route('**/*',async route=>{const u=new URL(route.request().url());if(u.pathname==='/favicon.ico'){await route.fulfill({status:204,body:''});return;}try{assert.equal(u.origin,'https://yard-qualification.invalid');const file=u.pathname.startsWith('/source/')?resolveSource(decodeURIComponent(u.pathname.slice(8))):path.join(here,u.pathname==='/'?'index.html':path.basename(u.pathname));const body=await fs.readFile(file);if(u.pathname.startsWith('/source/'))assert.equal(createHash('sha256').update(body).digest('hex'),expectedSources.get(decodeURIComponent(u.pathname.slice(8))),'Unpinned or changed native source');served.set(u.pathname,{file,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')});await route.fulfill({status:200,contentType:mime(file),body});}catch(e){errors.push(`${u.pathname}: ${e.message}`);await route.fulfill({status:404,body:'Unavailable qualification input'});}});
 await page.goto('https://yard-qualification.invalid/');try{await page.waitForFunction(()=>window.savedVisitQA?.ready,{},{timeout:25000});}catch(e){throw Error(`${e.message}; ${errors.join('; ')}`);}return {context,page};}
async function seek(page,at){await page.evaluate(at=>window.savedVisitQA.seek(at),at);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const d=await page.evaluate(()=>window.savedVisitQA.diagnostics());assert.equal(d.drawn,true);assert.equal(d.renderer.canonicalFood.selection.state,'kibble');assert(d.rgba.fits);return d;}
try{
 for(const viewport of capture.viewports){const id=`${viewport.width}x${viewport.height}-dpr${viewport.deviceScaleFactor}`,{context,page}=await open(viewport);try{
  for(const [name,at]of capture.samples){metrics.push({viewport:id,name,...await seek(page,at)});await page.screenshot({path:path.join(out,`${id}-${name}.png`)});}
  const at=capture.samples.find(([n])=>n==='retreat-mid')[1];await seek(page,at);const initial=await page.screenshot();await page.evaluate(at=>{for(let i=0;i<100;i++)window.savedVisitQA.seek(at);},at);const repeated=await page.screenshot();assert(initial.equals(repeated),'Repeated same-time native pixels drift');
  for(const [,time]of [...capture.samples].reverse())await seek(page,time);await seek(page,at);const scrubbed=await page.screenshot();assert(initial.equals(scrubbed),'Scrubbed native pixels drift');
  await page.evaluate(()=>window.savedVisitQA.fresh());await seek(page,at);const fresh=await page.screenshot();assert(initial.equals(fresh),'Fresh renderer native pixels differ');
  await fs.writeFile(path.join(out,`${id}-same-time-reference.png`),initial);metrics.push({viewport:id,repeat100Pixels:true,scrubPixels:true,freshPixels:true});
 }finally{await context.close();}}
 const viewport=capture.viewports[1];for(const clip of capture.clips){const {context,page}=await open(viewport,true),video=page.video();try{await seek(page,clip.from);await page.evaluate(({from,to})=>window.savedVisitQA.play(from,to),clip);await page.waitForFunction(()=>!window.savedVisitQA.running,{},{timeout:clip.to-clip.from+15000});const d=await page.evaluate(()=>window.savedVisitQA.diagnostics());metrics.push({clip,...d});}finally{await context.close();}await video.saveAs(path.join(out,`${clip.name}-1x.webm`));}
 assert.deepEqual(errors,[]);
}finally{await browser.close();await fs.writeFile(path.join(out,'native-report.json'),JSON.stringify({scope:capture.scope,metrics,errors,served:[...served.entries()]},null,2)+'\n');}
