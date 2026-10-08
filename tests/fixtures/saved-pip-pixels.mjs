/** Screenshot evidence, separate from Object3D.visible and source bounds.
 * The qualified Pip asset has an orange coat. Require a connected body-sized
 * patch within the current source-owned full-volume box, not isolated food
 * crumbs or an orange HUD icon outside the stage. */
function connectedPixels({data,width,height,channels},box,predicate){
 const left=Math.max(0,Math.floor(box.left)),top=Math.max(0,Math.floor(box.top));
 const right=Math.min(width,Math.ceil(box.right)),bottom=Math.min(height,Math.ceil(box.bottom));
 if(right<=left||bottom<=top)return {count:0,width:0,height:0};
 const w=right-left,h=bottom-top,mask=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=((y+top)*width+x+left)*channels,r=data[i],g=data[i+1],b=data[i+2];
  if(predicate(r,g,b))mask[y*w+x]=1;
 }
 let best={count:0,width:0,height:0};
 for(let i=0;i<mask.length;i++)if(mask[i]){
  mask[i]=0;const queue=[i];let count=0,minX=w,minY=h,maxX=0,maxY=0;
  for(let q=0;q<queue.length;q++){
   const j=queue[q],x=j%w,y=Math.floor(j/w);count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(nx>=0&&nx<w&&ny>=0&&ny<h&&mask[ny*w+nx]){mask[ny*w+nx]=0;queue.push(ny*w+nx);}
  }
  if(count>best.count)best={count,width:maxX-minX+1,height:maxY-minY+1,left:left+minX,top:top+minY,right:left+maxX+1,bottom:top+maxY+1};
 }
 return best;
}
export const orangeBodyPixels=(image,box)=>connectedPixels(image,box,(r,g,b)=>r>130&&r>g*1.18&&g>b*1.3&&b<130);
export const ceramicPixels=(image,box)=>connectedPixels(image,box,(r,g,b)=>r>140&&g>140&&b>120&&Math.abs(r-g)<45&&Math.abs(g-b)<45);
export async function savedPipScreenshotPixels(buffer,box,foodBox=null){
 const {default:sharp}=await import('sharp');
 const {data,info}=await sharp(buffer).removeAlpha().raw().toBuffer({resolveWithObject:true});
 return {...orangeBodyPixels({...info,data},box),food:foodBox?ceramicPixels({...info,data},foodBox):null,imageWidth:info.width,imageHeight:info.height};
}
