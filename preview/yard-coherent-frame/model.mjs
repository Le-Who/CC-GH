import {createCalibratedProjection,conservativeMaskStrips} from '../../src/games/companion-yard-v2/scene-layout.mjs';
import {getYardPlayzoneRows} from '../../game-logic/yard-playzones.js';
import {perimeterPlacements} from './environment-perimeter.mjs';
export const MAX_BYTES=32*1024*1024;
export const SOURCE_SHA='df1eae7125bbbc74f7bddc0aff8c87c017aa63be803a56377021978885b12fa6';
export const maskStrips=()=>conservativeMaskStrips(getYardPlayzoneRows('meadow'));
export function validateInputs(layout,frame){
 if(frame.sourceRigSha256!==SOURCE_SHA||frame.sourceFrame!==101||frame.sourceTimeMs!==4000||frame.pixelsPerWorld!==96||frame.placementWorldXY.some((n,i)=>n!==[40,40][i]))throw Error('Unexpected frozen source frame');
 if(frame.cameraDirection.some((n,i)=>n!==layout.calibration.cameraDirection[i])||layout.calibration.unitsPerWorld!==8)throw Error('Frame/camera calibration mismatch');
 const quads=maskStrips().map(r=>[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}]);
 if(JSON.stringify(quads)!==JSON.stringify(layout.maskWorldPolygons))throw Error('Source mask identity mismatch');
 if(layout.worldAnchors.entry.x!==90||layout.worldAnchors.entry.y!==68||layout.worldAnchors.bowl.x!==25||layout.worldAnchors.bowl.y!==83)throw Error('World anchors changed');return true;
}
export function sceneLayout(input,width,height){
 const id=width>height?'landscape754':width<355?'portrait320':'portrait390',preset=input.viewports.find(v=>v.id===id);if(!preset)throw Error('Missing measured layout');
 const scale=Math.min(width/preset.width,height/preset.height),offset={x:(width-preset.width*scale)/2,y:(height-preset.height*scale)/2};
 const point=p=>({x:offset.x+p.x*scale,y:offset.y+p.y*scale});const box=r=>({...r,...point(r),width:r.width*scale,height:r.height*scale});
 const projection=createCalibratedProjection(input.calibration,{width,height,artScale:preset.scale*scale,artOffset:point(preset.offset)});
 return{preset:id,width,height,projection,architectureScale:preset.architectureScaleRelative390*scale,facade:box(preset.facade),door:box(preset.facade.openingBounds),gateHalves:preset.gate.halves.map(box),gateBounds:box(preset.gate.fullImageBounds),gateOpening:preset.gate.clearOpeningCss*scale,visualPassage:box(preset.gate.visualPassageKeepClearRect),entryClearance:preset.entryClearancePolygon.map(point),bowlExclusion:preset.bowlExclusionPolygon.map(point),maskPolygons:input.maskWorldPolygons.map(p=>p.map(projection.project)),anchors:Object.fromEntries(Object.entries(input.worldAnchors).map(([k,p])=>[k,projection.project(p)]))};
}
export function frameRect(frame,layout){const p=layout.projection.project({x:40,y:40}),scale=layout.projection.ppu/frame.pixelsPerWorld;return{x:p.x-frame.pivotPx[0]*scale,y:p.y-frame.pivotPx[1]*scale,width:frame.canvas[0]*scale,height:frame.canvas[1]*scale,scale,pivot:p};}
export function foliagePlacements(layout){const ratio=layout.architectureScale,rows=perimeterPlacements(maskStrips(),layout.projection.project,{spacing:Math.max(10,18*ratio)}),kept=[];for(const r of rows){if(kept.some(k=>Math.hypot(r.point.x-k.point.x,r.point.y-k.point.y)<Math.max(4,7*ratio)))continue;kept.push(r);}return kept.map(r=>({...r,x:r.point.x+r.outward.x*6*ratio-23*ratio,y:r.point.y+r.outward.y*6*ratio-8.8046875*ratio,width:46*ratio,height:17.609375*ratio}));}
export function coverRect(w,h,iw,ih){const s=Math.max(w/iw,h/ih);return{x:(w-iw*s)/2,y:(h-ih*s)/2,width:iw*s,height:ih*s,scale:s};}
