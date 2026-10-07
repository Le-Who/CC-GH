import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const root=process.cwd(),output=path.resolve('test-results/bubbo-boundary',process.argv.includes('--diagnostic')?'diagnostic':'matrix');
const require=createRequire(path.join(process.env.BUBBO_DEPENDENCY_ROOT||root,'package.json'));
const {build}=require('esbuild'),{chromium}=require('@playwright/test');
await fs.mkdir(output,{recursive:true});
await build({entryPoints:['qa/bubbo-boundary/entry.jsx'],bundle:true,format:'esm',outdir:output,metafile:true,nodePaths:[path.join(process.env.BUBBO_DEPENDENCY_ROOT||root,'node_modules')],define:{'process.env.NODE_ENV':'"production"'},write:true}).then(result=>fs.writeFile(path.join(output,'build-inputs.json'),JSON.stringify(result.metafile,null,2)));
if(process.argv.includes('--build-only'))process.exit(0);
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{})});
const checks=[],errors=[];
const matrix=process.argv.includes('--diagnostic')?[[390,844]]:[[320,568],[360,800],[390,844],[414,896],[568,320],[844,390],[768,1024],[1024,768],[1280,720]];
try{for(const [width,height] of matrix){
 const id=`${width}x${height}`,context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,isMobile:true,hasTouch:true,recordVideo:{dir:path.join(output,'video'),size:{width,height}}}),page=await context.newPage();
 page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{
   window.fieldEvidence={lines:[],reactionFrames:[],maxScale:1};
   const proto=CanvasRenderingContext2D.prototype,move=proto.moveTo,stroke=proto.stroke,draw=proto.drawImage,clear=proto.clearRect;
   proto.clearRect=function(...args){this.__tokenIndex=0;return clear.apply(this,args);};
   proto.moveTo=function(x,y){this.__start={x,y};return move.call(this,x,y);};
   proto.stroke=function(){if(this.canvas.matches('.bb-field')&&this.strokeStyle==='#ff9a88')window.fieldEvidence.lines=[this.__start];return stroke.call(this);};
   proto.drawImage=function(image,...args){
     const g=this.canvas.dataset.bubboGeometry?JSON.parse(this.canvas.dataset.bubboGeometry):null;
     if(g&&/\/(mint|sky|coral|amber|berry)\.webp/.test(image.src||'')){
       const fx=JSON.parse(this.canvas.dataset.bubboFx||'{}');
       this.__tokenIndex=(this.__tokenIndex||0)+1;
       if(fx.reactions>0&&this.__tokenIndex<=window.bubboQA.tokenCount){const scale=args.at(-1)/(g.cell*.99);window.fieldEvidence.maxScale=Math.max(window.fieldEvidence.maxScale,scale);if(scale>1+1e-9&&window.fieldEvidence.reactionFrames.length<100)window.fieldEvidence.reactionFrames.push({time:performance.now(),reactions:fx.reactions,scale,transform:[this.getTransform().a,this.getTransform().b,this.getTransform().c,this.getTransform().d]});}
     }
     return draw.call(this,image,...args);
   };
 });
 await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   try{
     assert.equal(u.origin,'https://bubbo-qa.invalid');
     if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/entry.css"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>'});
     if(u.pathname==='/favicon.ico')return route.fulfill({status:204,body:''});
     const asset=u.pathname.startsWith('/games/bubbo-v2/');
     assert(asset||['/entry.js','/entry.css'].includes(u.pathname));
     assert(!u.pathname.includes('..'));
     const file=asset?path.join(root,'public',u.pathname):path.join(output,u.pathname.slice(1));
     await route.fulfill({body:await fs.readFile(file),contentType:asset?'image/webp':u.pathname.endsWith('.css')?'text/css':'text/javascript'});
   }catch(error){errors.push(u.pathname+': '+error.message);await route.fulfill({status:404,body:'Missing test asset'});}
 });
 async function capture(name){
   const d=await page.evaluate(()=>({diagnostics:window.bubboQA?.diagnostics(),evidence:window.fieldEvidence,scrollWidth:document.documentElement.scrollWidth}));
   await fs.writeFile(path.join(output,`${id}-${name}.json`),JSON.stringify({errors,...d},null,2));
   await fs.writeFile(path.join(output,`${id}-${name}.html`),await page.content());
   await page.screenshot({path:path.join(output,`${id}-${name}.png`)});
   return d;
 }
 try{
   await page.goto('https://bubbo-qa.invalid');
   await page.waitForFunction(()=>document.querySelector('.bb-field')?.dataset.ready==='true');
   await capture('diagnostic');
   for(const [name,row,pressure,loses] of [['above',8,.999,false],['at',9,0,true],['below',9,.001,true]]){
     await page.evaluate(([r,p])=>window.bubboQA.setBoundary(r,p),[row,pressure]);
     await page.waitForTimeout(50);
     const captured=await capture(name),d=captured.diagnostics,g=d.geometry;
     assert.equal(d.danger,loses);
     assert.equal(captured.evidence.lines.length,1,'real dashed line was painted');
     assert(Math.abs(captured.evidence.lines[0].y-g.dangerY)<1e-8);
     const bottom=Math.max(...d.occupied.map(cell=>cell.y+g.radius));
     assert.equal(bottom>=g.dangerY-1e-8,loses);
     assert.equal(d.computed.transform,'none');
     assert(Math.abs(d.rect.width-g.width)<1,'CSS width uses same source geometry');
     assert(Math.abs(d.rect.height-g.height)<1,'CSS height uses same source geometry');
     assert(captured.scrollWidth<=width,'no horizontal scroll');
     checks.push({viewport:id,name,danger:d.danger,bottom,line:g.dangerY});
   }
   await page.evaluate(()=>window.bubboQA.reset());
   const field=page.locator('.bb-field');await field.focus();await field.press('Space');
   await page.waitForFunction(()=>window.fieldEvidence.reactionFrames.length>0&&window.fieldEvidence.maxScale>1);
   const shot=await capture('shot');
   assert(shot.evidence.maxScale>1&&shot.evidence.maxScale<=1.0251);
   assert(shot.evidence.reactionFrames.every(f=>f.reactions>0&&f.reactions<=6));
   await page.waitForFunction(()=>JSON.parse(document.querySelector('.bb-field').dataset.bubboFx).reactions===0);
   await page.emulateMedia({reducedMotion:'reduce'});
   await field.press('Space');await page.waitForFunction(()=>window.bubboQA.diagnostics().shots===2);
   const reduced=await capture('reduced');assert.equal(reduced.diagnostics.fx.reactions,0);
   checks.push({viewport:id,name:'actual-flight-and-local-reaction',maxScale:shot.evidence.maxScale,frames:shot.evidence.reactionFrames.length});
 }catch(error){await capture('failure').catch(()=>{});throw error;}finally{await context.close();}
}assert.deepEqual(errors,[]);}finally{await browser.close();await fs.writeFile(path.join(output,'report.json'),JSON.stringify({scope:'Real BubboField, composeBubbo, original art, actual flight and engine. Boundary states injected for exact predicate checks. Does not claim full app/controller/backend QA.',checks,errors},null,2));}
