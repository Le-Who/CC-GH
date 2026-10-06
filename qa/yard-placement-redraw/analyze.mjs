import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {analyzeVideo} from './encoded-frames.mjs';
const out=path.resolve(import.meta.dirname,'../yard-canonical-acceptance/results'),file=path.join(out,'redraw-transitions-native.webm');
let evidence;
try{const bytes=await fs.readFile(file);evidence={...await analyzeVideo(file),file:path.basename(file),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};}
catch(error){evidence={file:path.basename(file),passed:false,error:String(error),qualification:'Missing, malformed or unarmed native video fails closed.'};}
await fs.writeFile(path.join(out,'encoded-video.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({passed:evidence.passed,analyzedFrames:evidence.analyzedFrames,flatFrames:evidence.flatFrames?.map(r=>({frame:r.frame,seconds:r.seconds})),error:evidence.error}));
assert.equal(evidence.passed,true,'The continuous recorded transition has missing or flat encoded stage frames');
