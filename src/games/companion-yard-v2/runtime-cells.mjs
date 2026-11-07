/** Storage calibration only. Native canvases, pivots, source roots and time stay intact. */
export const RUNTIME_CELL_FORMAT='yard-runtime-cells/v1';
export const RUNTIME_CELL_RECIPE=Object.freeze({safeEdgePx:10,atlasGutterPx:2,imageSmoothingQuality:'low'});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const ints=(value,length)=>Array.isArray(value)&&value.length===length&&value.every(Number.isSafeInteger);
const fail=()=>{throw Error('Invalid lossless runtime crop calibration');};
export function validateRuntimeCells(clip,{physicalPages=new Map(),baseURL='https://yard.invalid/'}={}){
 const cells=clip.runtimeCells;
 if(cells?.format!==RUNTIME_CELL_FORMAT||cells.safeEdgePx!==10||cells.atlasGutterPx!==2||cells.imageSmoothingQuality!=='low'||cells.frames?.length!==clip.frameCount)fail();
 const used=new Set();
 for(const [index,frame]of cells.frames.entries()){
  const page=clip.pages[frame.pageIndex],rect=frame.atlasRect,origin=frame.cropOriginPx,size=frame.cropSize,alpha=frame.alphaBounds;
  if(frame.index!==index||!Number.isSafeInteger(frame.pageIndex)||!page||!ints(rect,4)||!ints(origin,2)||!ints(size,2)||!ints(alpha,4))fail();
  const [sx,sy,w,h]=rect,[ox,oy]=origin,[left,top,right,bottom]=alpha;
  if(w<=20||h<=20||!same(size,[w,h])||ox<0||oy<0||ox+w>clip.canvas[0]||oy+h>clip.canvas[1]
   ||!same([left,top,right,bottom],[ox+10,oy+10,ox+w-10,oy+h-10])||right<=left||bottom<=top
   ||sx<2||sy<2||sx+w+2>page.width||sy+h+2>page.height
   ||!same(frame.runtimePivotPx,[clip.pivotPx[0]-ox,clip.pivotPx[1]-oy])
   ||!frame.runtimePivotPx.every(Number.isFinite)||!hash(frame.nativeRgbaSha256)||!hash(frame.croppedRgbaSha256)
   ||frame.reembeddedRgbaSha256!==frame.nativeRgbaSha256||frame.safeEdgeRgbaZero!==true||frame.discardedRgbaZero!==true)fail();
  if(typeof page.src!=='string'||!page.src||!ints([page.width,page.height],2)||page.width<=0||page.height<=0)fail();
  // Page indices are logical slots. The decoder owns one resolved URL, even
  // when several page rows or actor clips refer to the same physical image.
  const owner=new URL(page.src,baseURL).href,known=physicalPages.get(owner);
  if(known&&(known.width!==page.width||known.height!==page.height))fail();
  const storage=known||{width:page.width,height:page.height,rectangles:new Map()};
  const key=rect.join(','),identity=JSON.stringify([clip.canvas,clip.pivotPx,clip.pixelsPerWorld,clip.sourceOrigin??null,clip.cameraDirection??null,origin,size,frame.runtimePivotPx,alpha,frame.nativeRgbaSha256,frame.croppedRgbaSha256]);
  if(storage.rectangles.has(key)){if(storage.rectangles.get(key).identity!==identity)fail();}
  else{
   for(const prior of storage.rectangles.values()){const [x,y,pw,ph]=prior.rect;if(!(sx>=x+pw+2||x>=sx+w+2||sy>=y+ph+2||y>=sy+h+2))fail();}
   storage.rectangles.set(key,{identity,rect});
  }
  physicalPages.set(owner,storage);
  used.add(frame.pageIndex);
 }
 if(used.size!==clip.pages.length)fail();
 return cells;
}
export function runtimeCellDrawArguments(frame,image,anchor,ppu,nativePPU){
 const [sx,sy,w,h]=frame.atlasRect,scale=ppu/nativePPU;
 if(!Number.isFinite(scale)||scale<=0||![anchor.x,anchor.y,...frame.runtimePivotPx].every(Number.isFinite)||sx+w>image.width||sy+h>image.height)fail();
 return[image,sx,sy,w,h,anchor.x-frame.runtimePivotPx[0]*scale,anchor.y-frame.runtimePivotPx[1]*scale,w*scale,h*scale];
}
/** Export-time byte proof. Runtime admission uses its reviewed, hash-bound receipt;
 * it never creates a second RGBA canvas just to inspect every lazy atlas page. */
export function verifyRuntimeCropPixels(nativePixels,croppedPixels,canvas,frame){
 const [nw,nh]=canvas,[ox,oy]=frame.cropOriginPx,[w,h]=frame.cropSize;
 if(!ints(canvas,2)||nativePixels.length!==nw*nh*4||croppedPixels.length!==w*h*4||ox<0||oy<0||ox+w>nw||oy+h>nh)fail();
 let left=nw,top=nh,right=0,bottom=0;
 for(let y=0;y<nh;y++)for(let x=0;x<nw;x++){
  const inside=x>=ox&&x<ox+w&&y>=oy&&y<oy+h,from=(y*nw+x)*4,to=((y-oy)*w+x-ox)*4;
  if(nativePixels[from+3]){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
  for(let c=0;c<4;c++)if(nativePixels[from+c]!== (inside?croppedPixels[to+c]:0))fail();
  if(inside&&(x<ox+10||x>=ox+w-10||y<oy+10||y>=oy+h-10))for(let c=0;c<4;c++)if(nativePixels[from+c]!==0)fail();
 }
 if(!same([left,top,right,bottom],frame.alphaBounds))fail();
 return true;
}
