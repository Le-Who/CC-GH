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
