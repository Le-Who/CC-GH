/** Separate inactive canonical domain. Never accepts or converts saved M2 XY. */
export const CLEAN_STAGE_MIN=Object.freeze({width:280,height:192});
export const supportsCleanViewport=(width,height)=>Number.isFinite(width)&&Number.isFinite(height)&&width>=CLEAN_STAGE_MIN.width&&height>=CLEAN_STAGE_MIN.height;
export function createCleanProjection(descriptor,width,height){
 if(descriptor.id!=='pip-clean-garden-prototype-v1'||![width,height].every(x=>Number.isFinite(x)&&x>0))throw Error('Invalid clean-location viewport');
 const c=descriptor.camera,scale=Math.min(width/390,1),left=(width-390*scale)/2,top=height>=648*scale?(height-648*scale)/2:Math.max(height-648*scale,Math.min(0,height/2-362*scale));
 if(!supportsCleanViewport(width,height))throw Error('Prototype stage requires at least 280×192 CSS pixels');
 const project=p=>{
  const q=[p.x-c.projectionOriginCanonical[0],p.y-c.projectionOriginCanonical[1],p.z??0].map(x=>x/8);
  return{x:left+scale*(c.projectionOriginCss[0]+q.reduce((s,v,i)=>s+v*c.right[i],0)*c.pixelsPerSceneUnitCss),y:top+scale*(c.projectionOriginCss[1]+q.reduce((s,v,i)=>s+v*c.down[i],0)*c.pixelsPerSceneUnitCss)};
 };
 return{width,height,scale,sourcePixelsPerCss:c.pixelsPerSceneUnitCss*1.5*scale,project,
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
 const objects=[{id:'Pip-R1',...projectedBox(projection,root,12,18)},{id:'planter',...projectedBox(projection,{x:placement[0],y:placement[1]},5.5,11)}];
 for(const box of objects){
  const a=projection.art;if(box.x<a.x||box.y<a.y||box.right>a.x+a.width||box.bottom>a.y+a.height)throw Error('Prototype visual leaves the calibrated artwork');
  for(const e of projection.exclusions)if(box.x<e.right&&box.right>e.x&&box.y<e.bottom&&box.bottom>e.y)throw Error('Unsupported fixed foreground overlap: '+e.id);
 }
 return{policy:'shared-depth-Pip-planter; fixed-shell-overlap-refused',objects};
}
