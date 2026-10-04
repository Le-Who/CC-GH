import {createCalibratedProjection, conservativeMaskStrips} from '../../src/games/companion-yard-v2/scene-layout.mjs';
export const ANCHORS = Object.freeze({entry:Object.freeze({x:90,y:68}),bowl:Object.freeze({x:25,y:83}),fountain:Object.freeze({x:40,y:40})});
export const MAX_BYTES=64*1024*1024;
export function frameAt(elapsedMs){if(!Number.isFinite(elapsedMs))throw Error('Invalid source clock');return Math.min(25,Math.floor(Math.max(0,Math.min(1000,elapsedMs))/40));}
export function workingSet(clip,index){const page=clip.pages.find(p=>index>=p.first&&index<p.first+p.count);if(!page)throw Error('Missing native frame');const next=clip.pages.find(p=>p.first===page.first+page.count);return{visible:[{clip,index}],next:next?[{clip,index:next.first}]:[]};}
export function fitProjection(calibration,width,height){const artScale=Math.min(width/calibration.artSize.width,height/calibration.artSize.height);return createCalibratedProjection(calibration,{width,height,artScale,artOffset:{x:(width-calibration.artSize.width*artScale)/2,y:(height-calibration.artSize.height*artScale)/2}});}
export function validateClip(clip,calibration){
 if(clip.probeOnly!==true||clip.frameCount!==26||clip.fps!==25||clip.durationMs!==1000||clip.endpointInclusive!==true||clip.loop!==false)throw Error('Native probe timing mismatch');
 if(clip.sourceRigSha256!=='df1eae7125bbbc74f7bddc0aff8c87c017aa63be803a56377021978885b12fa6'||clip.cameraDirection.some((n,i)=>n!==calibration.cameraDirection[i]))throw Error('Source/camera mismatch');
 if(clip.frames.some((r,i)=>r.index!==i||r.sourceFrame!==101+i||r.sourceAtMs!==4000+i*40||r.atMs!==i*40))throw Error('Native source row mismatch');
 for(const p of clip.pages)if(p.width*p.height*4!==p.decodedBytes||p.decodedBytes>8*1024*1024)throw Error('Atlas page budget mismatch');
 return true;
}
export function groundGuides(rows,projection){return conservativeMaskStrips(rows).map(r=>[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}].map(projection.project));}
