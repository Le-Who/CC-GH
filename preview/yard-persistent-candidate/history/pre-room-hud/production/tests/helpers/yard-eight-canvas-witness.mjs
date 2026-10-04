/** Read-only browser API observation; no scene/store hooks or substituted pixels. */
export function installEightCanvasWitness(){
 const blobs=new WeakMap(),bitmaps=new WeakMap(),canvases=new WeakMap(),rows=[];let canvasCounter=0;
 const originalBlob=Response.prototype.blob,originalBitmap=globalThis.createImageBitmap,originalDraw=CanvasRenderingContext2D.prototype.drawImage;
 Response.prototype.blob=async function(...args){const blob=await originalBlob.apply(this,args);blobs.set(blob,this.url);return blob;};
 globalThis.createImageBitmap=async function(...args){const bitmap=await originalBitmap.apply(this,args);if(blobs.has(args[0]))bitmaps.set(bitmap,blobs.get(args[0]));return bitmap;};
 Object.defineProperty(window,'__yardEightDrawWitness',{value:rows,writable:false});
 CanvasRenderingContext2D.prototype.drawImage=function(...args){
  if(!canvases.has(this.canvas))canvases.set(this.canvas,{id:++canvasCounter,seen:new Set()});const canvas=canvases.get(this.canvas);
  const url=bitmaps.get(args[0]),sample=args.length===9&&url&&new URL(url).pathname.startsWith('/assets/yard-')&&!canvas.seen.has(url)&&rows.length<128;
  let before,rect;
  if(sample){const m=this.getTransform(),[,,,,,dx,dy,dw,dh]=args;
   const x=Math.max(0,Math.floor(dx*m.a+m.e)),y=Math.max(0,Math.floor(dy*m.d+m.f));
   rect={x,y,width:Math.max(0,Math.min(this.canvas.width-x,Math.ceil(dw*m.a))),height:Math.max(0,Math.min(this.canvas.height-y,Math.ceil(dh*m.d)))};
   if(rect.width&&rect.height)before=this.getImageData(rect.x,rect.y,rect.width,rect.height).data;
  }
  const result=originalDraw.apply(this,args);
  if(before){const after=this.getImageData(rect.x,rect.y,rect.width,rect.height).data;let changedOpaquePixels=0;
   for(let i=0;i<after.length;i+=4)if(after[i+3]&&(after[i]!==before[i]||after[i+1]!==before[i+1]||after[i+2]!==before[i+2]||after[i+3]!==before[i+3]))changedOpaquePixels++;
   if(changedOpaquePixels>=16){canvas.seen.add(url);rows.push({url,canvasId:canvas.id,sourceCrop:args.slice(1,5),destination:args.slice(5),rect,changedOpaquePixels,at:performance.now()});}
  }
  return result;
 };
}
