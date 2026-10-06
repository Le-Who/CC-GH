/** Selected cottage10 source-pixel composition; no gate/ring or new artwork. */
export function createCottageLayer(image,createSurface){
 const layer=createSurface(448,448),mask=createSurface(448,448),m=mask.getContext('2d');m.fillStyle='#fff';m.shadowColor='#fff';m.shadowBlur=8;m.beginPath();
 [[0,0],[142,0],[150,50],[191,66],[287,165],[310,235],[357,274],[385,357],[327,409],[220,430],[80,408],[0,369]].forEach(([x,y],i)=>i?m.lineTo(x,y):m.moveTo(x,y));m.closePath();m.fill();
 const c=layer.getContext('2d');c.drawImage(image,0,0,448,448,0,0,448,448);c.globalCompositeOperation='destination-in';c.drawImage(mask,0,0);c.globalCompositeOperation='source-over';mask.width=mask.height=0;return layer;
}
export function environmentRects(projection,ground,cottage){
 const {width,height,ppu}=projection;
 if(width<=height){const scale=Math.max(width/cottage.width,height/cottage.height)*1.35;return{plate:{id:'cottage',x:0,y:0,width:cottage.width*scale,height:cottage.height*scale},layer:null};}
 const scale=Math.max(width/ground.width,height/ground.height),ratio=(projection.backgroundArchitecturePpu??ppu)/(30.96409928478869*.90),cottageScale=(648/1536)*1.35*ratio;
 return{plate:{id:'ground',x:(width-ground.width*scale)/2,y:(height-ground.height*scale)/2,width:ground.width*scale,height:ground.height*scale},layer:{x:projection.backgroundArchitectureOffset?.x??0,y:projection.backgroundArchitectureOffset?.y??0,width:448*cottageScale,height:448*cottageScale}};
}
export function drawEnvironment(ctx,projection,images,layer){const {plate,layer:rect}=environmentRects(projection,images.ground,images.cottage);ctx.drawImage(images[plate.id],plate.x,plate.y,plate.width,plate.height);if(rect)ctx.drawImage(layer,rect.x,rect.y,rect.width,rect.height);}
