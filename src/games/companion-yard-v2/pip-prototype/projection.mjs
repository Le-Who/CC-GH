import{RENDER_UNITS_TO_CANONICAL,CANONICAL_PER_SCENE_UNIT}from'./world-scale.mjs';
import{GARDEN_RASTER}from'./resources.mjs';
/** Separate inactive canonical domain. Never accepts or converts saved M2 XY. */
export const CLEAN_STAGE_MIN=Object.freeze({width:280,height:192});
export const supportsCleanViewport=(width,height)=>Number.isFinite(width)&&Number.isFinite(height)&&width>=CLEAN_STAGE_MIN.width&&height>=CLEAN_STAGE_MIN.height;
export function createCleanProjection(descriptor,width,height,{focus=null,framing='focus',contextPoints=[]}={}){
 if(descriptor.id!=='pip-clean-garden-prototype-v1'||![width,height].every(x=>Number.isFinite(x)&&x>0))throw Error('Invalid clean-location viewport');
 const c=descriptor.camera,scale=Math.min(width/390,1),left=(width-390*scale)/2;let top=height>=648*scale?(height-648*scale)/2:Math.max(height-648*scale,Math.min(0,height/2-362*scale));
 if(!supportsCleanViewport(width,height))throw Error('Prototype stage requires at least 280×192 CSS pixels');
 // Only the camera crop changes for a saved item. World scale and camera basis stay fixed.
 if(focus&&[focus.x,focus.y].every(Number.isFinite)){
  const q=[focus.x-c.projectionOriginCanonical[0],focus.y-c.projectionOriginCanonical[1],5.5].map(v=>v/CANONICAL_PER_SCENE_UNIT);
  const center=(c.projectionOriginCss[1]+q.reduce((sum,v,i)=>sum+v*c.down[i],0)*c.pixelsPerSceneUnitCss)*scale;
  const artHeight=descriptor.background.height/descriptor.background.width*390*scale;
  top=height>=artHeight?(height-artHeight)/2:Math.max(height-artHeight,Math.min(0,height/2-center));
 }
 // Top-biased framing reveals as much upper decoration as the usable stage
 // allows while keeping the selected item and fixed gameplay context visible.
 // This changes only the shared CSS crop; the camera/raster and world stay fixed.
 if(framing==='top-biased'){
  const points=[focus,...contextPoints].filter(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y));
  const bottoms=points.map(p=>{
   const q=[p.x-c.projectionOriginCanonical[0],p.y-c.projectionOriginCanonical[1],p.z??0].map(v=>v/CANONICAL_PER_SCENE_UNIT);
   return(c.projectionOriginCss[1]+q.reduce((sum,v,i)=>sum+v*c.down[i],0)*c.pixelsPerSceneUnitCss+(p.paddingCss??24))*scale;
  });
  const artHeight=descriptor.background.height/descriptor.background.width*390*scale;
  top=Math.max(Math.min(0,height-artHeight),Math.min(0,height-Math.max(0,...bottoms)));
 }
 const project=p=>{
  const q=[p.x-c.projectionOriginCanonical[0],p.y-c.projectionOriginCanonical[1],p.z??0].map(x=>x/CANONICAL_PER_SCENE_UNIT);
  return{x:left+scale*(c.projectionOriginCss[0]+q.reduce((s,v,i)=>s+v*c.right[i],0)*c.pixelsPerSceneUnitCss),y:top+scale*(c.projectionOriginCss[1]+q.reduce((s,v,i)=>s+v*c.down[i],0)*c.pixelsPerSceneUnitCss)};
 };
 // Exact inverse at z=0 of this same orthographic basis, including CSS crop.
 const unprojectGround=p=>{
  if(!Number.isFinite(p?.x)||!Number.isFinite(p?.y))return null;
  const sx=((p.x-left)/scale-c.projectionOriginCss[0])/c.pixelsPerSceneUnitCss;
  const sy=((p.y-top)/scale-c.projectionOriginCss[1])/c.pixelsPerSceneUnitCss;
  const determinant=c.right[0]*c.down[1]-c.right[1]*c.down[0];
  if(!Number.isFinite(determinant)||Math.abs(determinant)<1e-12)throw Error('Non-invertible clean ground projection');
  return{x:c.projectionOriginCanonical[0]+CANONICAL_PER_SCENE_UNIT*(sx*c.down[1]-sy*c.right[1])/determinant,
   y:c.projectionOriginCanonical[1]+CANONICAL_PER_SCENE_UNIT*(sy*c.right[0]-sx*c.down[0])/determinant};
 };
 const referencePixelsPerRenderUnit=c.pixelsPerSceneUnitCss*(RENDER_UNITS_TO_CANONICAL/CANONICAL_PER_SCENE_UNIT);
 const renderViewport={x:left,y:top,width:GARDEN_RASTER.width*scale,height:GARDEN_RASTER.height*scale,
  pixelsPerRenderUnit:referencePixelsPerRenderUnit,anchorRaster:{x:c.projectionOriginCss[0],y:c.projectionOriginCss[1]},
  anchorRender:[c.projectionOriginCanonical[0]/RENDER_UNITS_TO_CANONICAL,(c.projectionOriginCanonical[2]??0)/RENDER_UNITS_TO_CANONICAL,-c.projectionOriginCanonical[1]/RENDER_UNITS_TO_CANONICAL]};
 return{width,height,scale,unprojectGround,renderViewport,actorUnitsPerSource:descriptor.sourceToCanonical,sourcePixelsPerCss:referencePixelsPerRenderUnit*scale,project,
  art:{x:left,y:top,width:390*scale,height:descriptor.background.height/descriptor.background.width*390*scale},
  exclusions:descriptor.foregroundExclusions.map(row=>({id:row.id,x:left+Math.min(...row.sourceScreenCss.map(p=>p[0]))*scale,y:top+Math.min(...row.sourceScreenCss.map(p=>p[1]))*scale,right:left+Math.max(...row.sourceScreenCss.map(p=>p[0]))*scale,bottom:top+Math.max(...row.sourceScreenCss.map(p=>p[1]))*scale}))};
}
function projectedBox(projection,center,radius,height){
 const points=[];for(const x of[-radius,radius])for(const y of[-radius,radius])for(const z of[0,height])points.push(projection.project({x:center.x+x,y:center.y+y,z:(center.z??0)+z}));
 return{x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
}
export function assertCleanComposition(projection,root,placement){
 // Conservative full-volume bounds, not ground-point/screen-Y sorting.
 // Only planter geometry shares the depth buffer. Fixed shell overlap is rejected.
 const objects=[{id:'Pip-R1',...projectedBox(projection,root,projection.actorUnitsPerSource,1.5*projection.actorUnitsPerSource)},{id:'planter',...projectedBox(projection,{x:placement[0],y:placement[1]},5.5,11)}];
 for(const box of objects){
  const a=projection.art;if(box.x<a.x||box.y<a.y||box.right>a.x+a.width||box.bottom>a.y+a.height)throw Error('Prototype visual leaves the calibrated artwork');
  for(const e of projection.exclusions)if(box.x<e.right&&box.right>e.x&&box.y<e.bottom&&box.bottom>e.y)throw Error('Unsupported fixed foreground overlap: '+e.id);
 }
 return{policy:'shared-depth-Pip-planter; fixed-shell-overlap-refused',objects};
}
