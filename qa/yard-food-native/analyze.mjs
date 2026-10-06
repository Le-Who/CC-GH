/** Offline encoded scope only; no screenshots, retiming, interpolation or manufactured pass. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeVideo} from '../yard-placement-redraw/encoded-frames.mjs';
const out=path.resolve(import.meta.dirname,'../yard-canonical-acceptance/results'),name='food-interactions-native.webm';await fs.mkdir(out,{recursive:true});let evidence;
try{
 const bytes=await fs.readFile(path.join(out,name)),decoded=await analyzeVideo(path.join(out,name)),browser=JSON.parse(await fs.readFile(path.join(out,'browser.json'),'utf8'));
 const expected=['stage-visible','dialog-occluded','stage-visible','dialog-occluded','stage-visible','dialog-occluded','stage-visible','dialog-occluded','stage-visible'];
 const intervalGate=JSON.stringify(decoded.intervals.map(i=>i.visibility))===JSON.stringify(expected)&&decoded.intervals.at(-1).frames>=10&&decoded.dialogOccludedFrames>0&&decoded.postArmFrames===decoded.analyzedFrames+decoded.dialogOccludedFrames;
 const eventGate=JSON.stringify(browser.food?.recording?.markerTransitions?.map(r=>r.dialogOpen))===JSON.stringify([false,true,false,true,false,true,false,true,false]);
 evidence={...decoded,file:name,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,passed:decoded.passed&&intervalGate&&eventGate,intervalGate,eventGate,qualification:'The unaltered clip includes startup. After its explicit readiness marker, every encoded frame is classified; only stage-visible intervals are measured for whole-stage flat/dropout failures. Four native dialogs are reported as occluded. This detector does not establish food presence, contact, art quality, collision at every video frame, physical-device timing or full-stay behavior.'};
}catch(error){evidence={file:name,passed:false,error:String(error),qualification:'Missing, malformed, unarmed or mismatched original recording fails closed.'};}
await fs.writeFile(path.join(out,'food-encoded-video.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({passed:evidence.passed,analyzedFrames:evidence.analyzedFrames,dialogOccludedFrames:evidence.dialogOccludedFrames,flatFrames:evidence.flatFrames?.length,error:evidence.error}));if(!evidence.passed)process.exitCode=1;
