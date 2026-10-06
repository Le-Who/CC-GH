import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {analyzeVideo} from './encoded-frames.mjs';
const read=name=>fs.readFile(new URL(name,import.meta.url),'utf8');
async function fixture({marker=true,gap=false,gapFrame=5,frames=14,occludedFrames=[],dimmedMagentaFrame=null,rawCyanFrame=null}={}){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'yard-encoded-qa-')),file=path.join(dir,'fixture.webm'),w=390,h=844,b=Buffer.alloc(w*h*3*frames);
 for(let f=0;f<frames;f++)for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=((f*h+y)*w+x)*3;if(gap&&f===gapFrame||occludedFrames.includes(f)){b[i]=166;b[i+1]=188;b[i+2]=106;}else{b[i]=(x*7+y*3)%256;b[i+1]=(x*3+y*5)%256;b[i+2]=(x+y*11)%256;}
  if(marker&&f>=2&&x<16&&y<16){const rgb=occludedFrames.includes(f)?[18,162,156]:f===dimmedMagentaFrame?[151,29,156]:f===rawCyanFrame?[0,255,255]:[255,0,255];for(let k=0;k<3;k++)b[i+k]=rgb[k];}
 }
 execFileSync('ffmpeg',['-v','error','-f','rawvideo','-pixel_format','rgb24','-video_size','390x844','-framerate','25','-i','pipe:0','-c:v','libvpx','-pix_fmt','yuv420p','-deadline','realtime','-cpu-used','8','-b:v','1M',file],{input:b,timeout:10000});return{file,close:()=>fs.rm(dir,{recursive:true,force:true})};
}
test('offline pipeline scans every frame from actual encoded readiness marker',async()=>{const f=await fixture();try{const r=await analyzeVideo(f.file);assert.equal(r.firstArmedFrame,2);assert.equal(r.decodedFrames,14);assert.equal(r.analyzedFrames,12);assert.equal(r.passed,true);}finally{await f.close();}});
test('a single encoded dropout fails even when its neighbors are intact',async()=>{const f=await fixture({gap:true});try{const r=await analyzeVideo(f.file);assert.equal(r.passed,false);assert.deepEqual(r.flatFrames.map(f=>f.frame),[5]);}finally{await f.close();}});
test('missing readiness marker cannot silently skip the record',async()=>{const f=await fixture({marker:false});try{await assert.rejects(()=>analyzeVideo(f.file),/No sustained post-readiness/);}finally{await f.close();}});
test('truncated post-ready observation fails closed',async()=>{const f=await fixture({frames:5});try{await assert.rejects(()=>analyzeVideo(f.file),/No sustained post-readiness/);}finally{await f.close();}});
test('prior actual negative control remains accurately labelled and hashed',async()=>{const p=JSON.parse(await read('./original-failure.json'));assert.equal(p.expectedFailure,true);assert.equal(p.passed,false);assert.equal(p.original.sha256,'ff54410518a69cebcdeda4d8b25d38e41ec5cd209825cd7f148bbd39103959d6');assert.deepEqual(p.flatFrames.map(f=>[f.frame,f.seconds]),[[117,4.68],[124,4.96]]);});
test('recording flow contains no screenshot or GPU readback calls',async()=>{const s=await read('./transitions.spec.mjs');assert(!/\.(screenshot|readPixels|captureStream|toDataURL|toBlob)\s*\(/.test(s));assert(!/\bcapture\s*\(/.test(s));assert(s.includes('await c?.close()'));assert(s.includes('await video.path()'));assert(s.includes('yard.buyGoodie'));assert(s.includes('cancel-placement'));assert(s.includes('commit-placement'));assert(s.includes("toBe('settled')"));});
test('finite workflow stays branch-bound, one-shot, unprivileged and capped',async()=>{const s=await read('../../.github/workflows/yard-placement-redraw.yml');assert(s.includes("branches: ['qa/yard-placement-redraw-20261006']"));assert(s.includes('github.run_attempt == 1'));assert(s.includes('github.event.created == true'));assert(s.includes('timeout-minutes: 10'));assert(s.includes('contents: read'));assert(s.includes('retention-days: 3'));assert(!/workflow_dispatch:|secrets\.|contents: write|pull_request:|deploy/i.test(s));assert.equal((s.match(/^  acceptance:/gm)||[]).length,1);});
test('HUD remains the existing full baseline test and browser retries are zero',async()=>{const s=await read('./config.mjs');assert(s.includes('**/yard-canonical-acceptance/hud.spec.mjs'));assert(s.includes('**/yard-placement-redraw/transitions.spec.mjs'));assert(s.includes('retries:0'));assert(s.includes('workers:1'));assert(s.includes('globalTimeout:220000'));});

test('native-backdrop cyan explicitly excludes only dialog-obscured encoded frames',async()=>{const f=await fixture({occludedFrames:[5,6]});try{const r=await analyzeVideo(f.file);assert.equal(r.passed,true);assert.equal(r.postArmFrames,12);assert.equal(r.dialogOccludedFrames,2);assert.equal(r.analyzedFrames,10);assert.deepEqual(r.intervals.map(i=>[i.visibility,i.firstFrame,i.lastFrame]),[['stage-visible',2,4],['dialog-occluded',5,6],['stage-visible',7,13]]);}finally{await f.close();}});
test('dimmed magenta means phase mismatch and fails instead of excluding a boundary',async()=>{const f=await fixture({dimmedMagentaFrame:5});try{await assert.rejects(()=>analyzeVideo(f.file),/Unrecognized post-arm encoded marker at frame 5/);}finally{await f.close();}});
test('raw cyan without the expected modal backdrop also fails closed',async()=>{const f=await fixture({rawCyanFrame:5});try{await assert.rejects(()=>analyzeVideo(f.file),/Unrecognized post-arm encoded marker at frame 5/);}finally{await f.close();}});

test('the first encoded frame after a dialog closes is measured and can fail',async()=>{const f=await fixture({occludedFrames:[5,6],gap:true,gapFrame:7});try{const r=await analyzeVideo(f.file);assert.equal(r.passed,false);assert.deepEqual(r.flatFrames.map(f=>f.frame),[7]);assert.equal(r.intervals.at(-1).firstFrame,7);}finally{await f.close();}});
