/** Fixed presentation only. Persisted XY, source contracts and domain masks are untouched. */
import layout from './scene45-layout.json' with {type:'json'};
import {createCalibratedProjection,conservativeMaskStrips} from './scene-layout.mjs';
import {getYardPlayzoneRows} from '../../../game-logic/yard-playzones.js';
export const PRESENTATION_CAMERA_DIRECTION=Object.freeze([5.66,-8,9.799775507632814]);
export const SCENE45_REVISION='yard-cottage10-elevation45-original-azimuth-v1';
export function createSceneProjection(width,height){
 const id=width>height?'landscape754':width<355?'portrait320':'portrait390',preset=layout.viewports.find(p=>p.id===id);
 const scale=Math.min(width/preset.width,height/preset.height),offset={x:(width-preset.width*scale)/2,y:(height-preset.height*scale)/2};
 const base=createCalibratedProjection(layout.calibration,{width,height,artScale:preset.scale*scale,artOffset:{x:offset.x+preset.offset.x*scale,y:offset.y+preset.offset.y*scale}});
 const points=conservativeMaskStrips(getYardPlayzoneRows('meadow')).flatMap(r=>[[r.x,r.y],[r.x+r.width,r.y],[r.x+r.width,r.y+r.height],[r.x,r.y+r.height]].map(([x,y])=>base.project({x,y})));
 const center={x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,y:(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2},factor=layout.worldScale;
 return{...base,preset:id,backgroundArchitecturePpu:layout.backgroundArchitecturePpuByPreset?.[id]!=null?layout.backgroundArchitecturePpuByPreset[id]*scale:base.ppu*factor,backgroundArchitectureOffset:offset,cameraDirection:PRESENTATION_CAMERA_DIRECTION,ppu:base.ppu*factor,
  project(position){const p=base.project(position);return{x:center.x+(p.x-center.x)*factor,y:center.y+(p.y-center.y)*factor};},
  unproject(p){return base.unproject({x:center.x+(p.x-center.x)/factor,y:center.y+(p.y-center.y)/factor});}};
}
export function sourcePixelRect(meta,anchor,projection){
 const size=meta.canvas,pivot=meta.pivotPx,ppu=meta.pixelsPerWorld??meta.worldPixelScale;
 if(size?.length!==2||!size.every(n=>Number.isSafeInteger(n)&&n>0)||pivot?.length!==2||!pivot.every(Number.isFinite)||!Number.isFinite(ppu)||ppu<=0)throw Error('Verified native canvas, pivot and scale required');
 const point=projection.project(anchor),scale=projection.ppu/ppu;
 return{x:point.x-pivot[0]*scale,y:point.y-pivot[1]*scale,width:size[0]*scale,height:size[1]*scale,scale,pivot:point};
}
