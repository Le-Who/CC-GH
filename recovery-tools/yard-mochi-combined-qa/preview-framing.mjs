/** Camera-only fitting of measured alpha bounds in this fixed QA fixture.
 * Logical yard anchors, geometry, source media and the production camera stay
 * untouched. One bound covers every sample, so seeking cannot move the camera. */
export function fitPreviewProjection(base,framing,inset=8){
 const b=framing.unionBoundsPx,scale=framing.pixelsPerWorld;
 if(b?.length!==4||!b.every(Number.isFinite)||!Number.isFinite(scale)||scale<=0
  ||b[2]<=b[0]||b[3]<=b[1]||base.width<=inset*2||base.height<=inset*2)throw Error('Measured preview framing required');
 const anchor={x:framing.relativeToYardAnchor[0],y:framing.relativeToYardAnchor[1]},origin=base.project(anchor);
 const ppu=Math.min(base.ppu,(base.width-2*inset)*scale/(b[2]-b[0]),(base.height-2*inset)*scale/(b[3]-b[1]));
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),ratio=ppu/base.ppu;
 const center={x:clamp(origin.x,inset-b[0]*ppu/scale,base.width-inset-b[2]*ppu/scale),
  y:clamp(origin.y,inset-b[1]*ppu/scale,base.height-inset-b[3]*ppu/scale)};
 return{width:base.width,height:base.height,ppu,
  project(p){const q=base.project(p);return{x:center.x+(q.x-origin.x)*ratio,y:center.y+(q.y-origin.y)*ratio};},
  unproject(p){return base.unproject({x:origin.x+(p.x-center.x)/ratio,y:origin.y+(p.y-center.y)/ratio});}};
}
export function spriteVisibleBounds(bounds,pivot,pixelsPerWorld,anchor,projection){
 const q=projection.project(anchor),scale=projection.ppu/pixelsPerWorld;
 return{left:q.x+(bounds[0]-pivot[0])*scale,top:q.y+(bounds[1]-pivot[1])*scale,
  right:q.x+(bounds[2]-pivot[0])*scale,bottom:q.y+(bounds[3]-pivot[1])*scale};
}
