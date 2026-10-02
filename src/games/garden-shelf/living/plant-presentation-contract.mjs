// DOM-independent presentation constraints; no game mutations or timers here.
export function intersectRects(a,b){
 const left=Math.max(a.left,b.left),top=Math.max(a.top,b.top),right=Math.min(a.right,b.right),bottom=Math.min(a.bottom,b.bottom);
 return right>left&&bottom>top?{left,top,right,bottom,width:right-left,height:bottom-top}:null;
}
export function fitArtwork(rect,aspect,padding=.04){
 if(!Number.isFinite(aspect)||aspect<=0||padding<0||padding>=.5)throw new RangeError('invalid artwork fit');
 const availableWidth=rect.width*(1-padding*2),availableHeight=rect.height*(1-padding*2);
 const height=Math.min(availableHeight,availableWidth/aspect),width=height*aspect;
 const left=rect.left+(rect.width-width)/2,top=rect.bottom-rect.height*padding-height;
 return {left,top,right:left+width,bottom:top+height,width,height};
}
export function normalizePhase(phase){return Number.isInteger(phase)?Math.min(3,Math.max(0,phase)):0;}
export function visualEvents(previous,next){
 if(!previous||previous.id!==next.id)return [];
 const events=[];
 if(Number.isFinite(next.lastWatered)&&next.lastWatered>Math.max(0,Number(previous.lastWatered)||0))events.push('water');
 if(normalizePhase(next.phase)>normalizePhase(previous.phase))events.push('grow');
 return events;
}
export class BoundedTextureLedger{
 constructor(limit=12){if(!Number.isInteger(limit)||limit<1)throw new RangeError('texture limit');this.limit=limit;this.entries=new Map();}
 touch(key,value){this.entries.delete(key);this.entries.set(key,value);}
 evict(protectedKeys=new Set()){
  const removed=[];
  for(const [key,value]of this.entries){if(this.entries.size<=this.limit)break;if(protectedKeys.has(key))continue;this.entries.delete(key);removed.push([key,value]);}
  return removed;
 }
 clear(){const old=[...this.entries];this.entries.clear();return old;}
}
