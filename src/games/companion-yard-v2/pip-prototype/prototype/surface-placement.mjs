import{GARDEN_RASTER}from'../resources.mjs';

/** Camera and raster belong to the garden, never to an animated object.
 * A fixed reference raster avoids both moving world sampling and a second,
 * changing fractional CSS sampling phase. Layout may translate/uniformly scale
 * the whole artwork without changing any world-to-raster matrix.
 */
export function validateGardenViewport(viewport){
 const {x,y,width,height,pixelsPerRenderUnit,anchorRender,anchorRaster}=viewport??{};
 if(![x,y,width,height,pixelsPerRenderUnit,anchorRaster?.x,anchorRaster?.y].every(Number.isFinite)||!Array.isArray(anchorRender)||anchorRender.length!==3||!anchorRender.every(Number.isFinite)||width<=0||height<=0||width>GARDEN_RASTER.width||height>GARDEN_RASTER.height||pixelsPerRenderUnit<=0||Math.abs(width/GARDEN_RASTER.width-height/GARDEN_RASTER.height)>1e-12)throw Error('Explicit bounded garden viewport required');
 return{x,y,width,height,pixelsPerRenderUnit,anchorRender:[...anchorRender],anchorRaster:{...anchorRaster}};
}
export function configureGardenCamera(camera,direction,viewport){
 const {anchorRender,anchorRaster,pixelsPerRenderUnit:ppu}=viewport;
 camera.position.set(...anchorRender).add(direction);camera.lookAt(...anchorRender);
 camera.left=-anchorRaster.x/ppu;camera.right=(GARDEN_RASTER.width-anchorRaster.x)/ppu;
 camera.top=anchorRaster.y/ppu;camera.bottom=-(GARDEN_RASTER.height-anchorRaster.y)/ppu;
 camera.near=.01;camera.far=100;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
}
export function gardenSurfaceRect(viewport,rootGLTF,camera){
 const projected=rootGLTF.clone().project(camera);
 return{x:viewport.x,y:viewport.y,width:viewport.width,height:viewport.height,
  rootInSurface:{x:(projected.x+1)*viewport.width/2,y:(1-projected.y)*viewport.height/2}};
}

/** The direct DOM surface uses the identical orthographic drawImage rectangle.
 * Only the final presentation changes. No scene-Y sorting or camera change.
 */
export function projectedSurfaceRect(rootGLTF,camera,size,point){
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))throw Error('Projected root required');
  const projected=rootGLTF.clone().project(camera);
  const px=(projected.x+1)*size.widthCss/2,py=(1-projected.y)*size.heightCss/2;
  return{x:point.x-px,y:point.y-py,width:size.widthCss,height:size.heightCss,rootInSurface:{x:px,y:py}};
}

/** Map logical Canvas2D coordinates through its actual backing/CSS transform.
 * This includes the frozen pilot's border and rounded HiDPI backing, rather
 * than assuming that a logical drawing unit is exactly one displayed pixel.
 */
export function canvasRectToCSS(rect,{a=1,b=0,c=0,d=1,e=0,f=0,
  backingWidth,backingHeight,contentWidth,contentHeight,offsetLeft=0,offsetTop=0}){
  if(b!==0||c!==0||![a,d,backingWidth,backingHeight,contentWidth,contentHeight].every(v=>Number.isFinite(v)&&v>0))throw Error('Expected positive axis-aligned fixture transform');
  if(![e,f,offsetLeft,offsetTop,rect.x,rect.y,rect.width,rect.height].every(Number.isFinite))throw Error('Invalid surface rectangle');
  const sx=contentWidth/backingWidth,sy=contentHeight/backingHeight;
  return{x:offsetLeft+(rect.x*a+e)*sx,y:offsetTop+(rect.y*d+f)*sy,width:rect.width*a*sx,height:rect.height*d*sy};
}

export function presentDirectSurface(canvas,host,rect,alpha=1){
  if(!host?.appendChild)throw Error('Direct presentation host required');
  if(canvas.parentNode!==host)host.appendChild(canvas);
  Object.assign(canvas.style,{position:'absolute',display:'block',left:`${rect.x}px`,top:`${rect.y}px`,
    width:`${rect.width}px`,height:`${rect.height}px`,opacity:String(Math.max(0,Math.min(1,alpha))),
    pointerEvents:'none',background:'transparent',border:'0',borderRadius:'0',padding:'0',margin:'0'});
  canvas.dataset.pipSurface='direct';
}
