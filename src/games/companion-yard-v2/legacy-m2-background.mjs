/** Exact released M2 plate. One scene-owned bitmap, never a second CSS/DOM decode. */
export const LEGACY_M2_BACKGROUND=Object.freeze({
 url:'/assets/yard-mika/background.webp',canvas:[1374,1145],decodedBytes:1374*1145*4,
 encodedBytes:549070,sha256:'ac1b2c8c963a3c417fc3d02b2db0410aa89c60c6452b54170db62fa1001f0721',verifySourceBytes:true,
 sourceCommit:'6b80c9a2cca146e20afcaced6a34a035c30c13aa',
});
export function legacyBackgroundRect(width,height){
 if(![width,height].every(x=>Number.isFinite(x)&&x>0))throw Error('Invalid legacy stage');
 // The original .cy-background used object-fit:cover; object-position:52% 50%.
 const scale=Math.max(width/1374,height/1145),w=1374*scale,h=1145*scale;
 return{x:(width-w)*.52,y:(height-h)*.5,width:w,height:h};
}
export function drawLegacyBackground(ctx,image,width,height){
 if(!image)throw Error('Canonical M2 background is not ready');
 const r=legacyBackgroundRect(width,height);ctx.drawImage(image,r.x,r.y,r.width,r.height);
}
