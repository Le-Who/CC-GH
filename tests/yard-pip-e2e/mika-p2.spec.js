import {test,expect} from '@playwright/test';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import path from 'node:path';
const out=path.join(process.cwd(),'test-results-mika-p2/compact');
const views=[{width:320,height:568,dpr:1},{width:390,height:844,dpr:2},{width:844,height:390,dpr:1}];
for(const view of views)test(`Mika pinned Three source ${view.width}x${view.height} DPR${view.dpr}`,async({browser,baseURL},info)=>{
 const context=await browser.newContext({baseURL,viewport:{width:view.width,height:view.height},deviceScaleFactor:view.dpr,isMobile:true,hasTouch:true,recordVideo:{dir:info.outputPath('video'),size:{width:view.width,height:view.height}}});
 const page=await context.newPage(),video=page.video(),errors=[],warnings=[],rows=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());else if(m.type()==='warning')warnings.push(m.text());});page.on('requestfailed',r=>errors.push(`${r.url()} ${r.failure()?.errorText}`));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 try{for(const variant of ['p2','mirror','entry']){
  const r=await page.goto(`/__pip_qa__/mika-p2/index.html?variant=${variant}`);expect(r.status()).toBe(200);await page.waitForFunction(()=>window.mikaQA?.ready);
  const spec=await page.evaluate(async()=>{const j=await(await fetch('./expected.json')).json();return j.variants[new URL(location.href).searchParams.get('variant')];});
  for(const p of spec.poses){const d=await page.evaluate(t=>window.mikaQA.seek(t),p.time);expect(d.sha256).toBe(spec.sha256);expect(d.bones).toBe(22);expect(d.skinMeshes).toBe(25);expect(d.bodyHasVertexColor).toBe(true);expect(d.bodyUsesVertexColor).toBe(true);expect(d.customCoatOrPoseDriver).toBe(false);expect(d.pose.maxError).toBeLessThan(.001);expect(d.pose.rootError).toBeLessThan(.00001);expect(d.errors).toEqual([]);expect(d.horizontalOverflow).toBe(false);for(const v of d.pose.bounds.min)expect(v).toBeGreaterThan(-1);for(const v of d.pose.bounds.max)expect(v).toBeLessThan(1);rows.push(d);
   if([spec.poses[0].time,spec.poses[Math.floor(spec.poses.length/2)].time,spec.poses.at(-1).time].includes(p.time))await info.attach(`${variant}-${p.time}s`,{body:await page.screenshot(),contentType:'image/png'});
  }
  // Same immutable P2 pose under default, no-shadow and ground-only reception.
  // This diagnoses surface banding without changing the GLB, camera or lights.
  if(variant==='p2'){
   const reference=await page.evaluate(()=>window.mikaQA.seek(0));
   for(const mode of ['on','off','ground-only']){
    const probe=await page.evaluate(mode=>window.mikaQA.setShadowMode(mode),mode);
    expect(probe.shadowMode).toBe(mode);expect(probe.sha256).toBe(reference.sha256);expect(probe.pose.points).toEqual(reference.pose.points);
    await info.attach(`p2-0s-shadow-${mode}`,{body:await page.screenshot(),contentType:'image/png'});
   }
   await page.evaluate(()=>window.mikaQA.setShadowMode('on'));
  }
  // Seek backwards and repeat, then use a real clock at 1x. No phase/root reset during playback.
  const t=spec.poses[2].time,a=await page.evaluate(t=>window.mikaQA.seek(t),t);await page.evaluate(()=>window.mikaQA.seek(0));const b=await page.evaluate(t=>window.mikaQA.seek(t),t);expect(b.pose.points).toEqual(a.pose.points);
  await page.evaluate(()=>{window.mikaQA.seek(0);window.mikaQA.play();});await expect.poll(()=>page.evaluate(()=>window.mikaQA.diagnostics().at),{timeout:(spec.duration+8)*1000,intervals:[100]}).toBeGreaterThanOrEqual(spec.duration-.001);expect((await page.evaluate(()=>window.mikaQA.diagnostics())).errors).toEqual([]);
 }
 expect(errors).toEqual([]);await page.reload();await page.waitForFunction(()=>window.mikaQA?.ready);expect((await page.evaluate(()=>window.mikaQA.diagnostics())).sha256).toBe(rows.at(-1).sha256);
 }catch(error){await info.attach('failure-screen',{body:await page.screenshot(),contentType:'image/png'});await info.attach('failure-context',{body:Buffer.from(JSON.stringify({url:page.url(),errors,warnings,rows},null,2)),contentType:'application/json'});throw error;}
 finally{await mkdir(out,{recursive:true});await writeFile(path.join(out,`${view.width}x${view.height}-dpr${view.dpr}.json`),JSON.stringify({errors,warnings,rows},null,2));await context.close();if(video)await copyFile(await video.path(),path.join(out,`${view.width}x${view.height}-1x.webm`));}
});
