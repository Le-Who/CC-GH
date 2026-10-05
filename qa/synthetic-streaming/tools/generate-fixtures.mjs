// TEST FIXTURES ONLY. No artwork, source export, archive or external input.
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {verifyRuntimeCropPixels,validateRuntimeCells} from '../vendor/r5/runtime-cells.mjs';
if(process.env.GITHUB_ACTIONS!=='true'||process.env.CI!=='true')
  throw Error('Synthetic pixel generation is restricted to this CI workflow');
const out=new URL('../generated/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const counts=[4,4,4,...Array(15).fill(5),...Array(7).fill(4),3,3,4];
const pages=[],frames=[],proofs=[];
let index=0;
for(const [p,count] of counts.entries()) {
  const w=count===3?350:count===5?350:346;
  const h=count===3?268:count===5?192+(p%4)*6:234+(p%3)*12;
  const cols=count===5?1:count===3?3:p%2?count:2;
  const rows=Math.ceil(count/cols),width=cols*(w+2)+2,height=rows*(h+2)+2;
  assert.ok(width*height*4<=1572864);
  const pixels=Buffer.alloc(width*height*4),pageFrames=[];
  for(let f=0;f<count;f++,index++) {
    const sx=2+(f%cols)*(w+2),sy=2+Math.floor(f/cols)*(h+2);
    const ox=140+(index%3)*2,oy=150,canvas=[704,576];
    const crop=Buffer.alloc(w*h*4),native=Buffer.alloc(canvas[0]*canvas[1]*4);
    let state=(0x9e3779b9^(index*0x45d9f3b))>>>0;
    const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return state>>>0;};
    // Deterministic colored blocks plus contrasting diagonal/marker shapes.
    // The opaque interior touches the exact declared alpha bounds.
    for(let y=10;y<h-10;y++)for(let x=10;x<w-10;x++) {
      const q=(Math.floor(x/4)+Math.floor(y/4)*101+index*13)>>>0;
      const n=(Math.imul(q^0x51ed270b,0x45d9f3b)^(q>>>3))>>>0;
      const stripe=(x+2*y+index*7)%53<7;
      const off=(y*w+x)*4;
      crop[off]=(n&127)+(stripe?80:0);
      crop[off+1]=((n>>>9)&127)+(stripe?0:80);
      crop[off+2]=((n>>>17)&127)+40;
      crop[off+3]=255;
    }
    // A seed-derived asymmetric marker changes each temporal state.
    for(let y=18;y<30;y++)for(let x=18;x<18+16+(random()%16);x++) {
      const off=(y*w+x)*4;crop[off]=255;crop[off+1]=32;crop[off+2]=index*17%256;
    }
    for(let y=0;y<h;y++) {
      crop.copy(native,((oy+y)*canvas[0]+ox)*4,y*w*4,(y+1)*w*4);
      crop.copy(pixels,((sy+y)*width+sx)*4,y*w*4,(y+1)*w*4);
    }
    const reembedded=Buffer.alloc(native.length);
    for(let y=0;y<h;y++)crop.copy(reembedded,((oy+y)*canvas[0]+ox)*4,y*w*4,(y+1)*w*4);
    const frame={index:0,pageIndex:0,atlasRect:[sx,sy,w,h],cropOriginPx:[ox,oy],cropSize:[w,h],
      runtimePivotPx:[352-ox,500-oy],alphaBounds:[ox+10,oy+10,ox+w-10,oy+h-10],
      nativeRgbaSha256:hash(native),croppedRgbaSha256:hash(crop),
      reembeddedRgbaSha256:hash(reembedded),safeEdgeRgbaZero:true,discardedRgbaZero:true};
    assert.equal(frame.nativeRgbaSha256,frame.reembeddedRgbaSha256);
    assert.equal(verifyRuntimeCropPixels(native,crop,canvas,frame),true);
    const row={sourceIndex:index,sourceAtMs:index*50,pageIndex:p,canvas,pivotPx:[352,500],frame};
    frames.push(row);pageFrames.push(row);
  }
  const encoded=await sharp(pixels,{raw:{width,height,channels:4}}).webp({quality:90,alphaQuality:100,effort:4}).toBuffer();
  assert.ok(encoded.length<=256*1024);
  const decoded=await sharp(encoded).ensureAlpha().raw().toBuffer();
  assert.equal(decoded.length,pixels.length);
  let maxRGBError=0,rgbError=0,opaqueChannels=0,zeroAlphaPixels=0;
  for(let i=0;i<pixels.length;i+=4) {
    assert.equal(decoded[i+3],pixels[i+3],'Exact source alpha, edge and gutter verification');
    if(pixels[i+3]===0){zeroAlphaPixels++;continue;}
    for(let c=0;c<3;c++){const e=Math.abs(decoded[i+c]-pixels[i+c]);maxRGBError=Math.max(maxRGBError,e);rgbError+=e;opaqueChannels++;}
  }
  const sha256=hash(encoded),src=`generated/${sha256}.webp`;
  await fs.writeFile(new URL(`${sha256}.webp`,out),encoded,{flag:'wx'});
  const page={src,width,height,sha256,encodedBytes:encoded.length,decodedBytes:pixels.length,
    count,first:pageFrames[0].sourceIndex};pages.push(page);
  const physicalPages=new Map();
  for(const row of pageFrames)validateRuntimeCells({frameCount:1,canvas:row.canvas,pivotPx:row.pivotPx,
    pixelsPerWorld:100,pages:[page],runtimeCells:{format:'yard-runtime-cells/v1',safeEdgePx:10,
    atlasGutterPx:2,imageSmoothingQuality:'low',frames:[row.frame]}},{physicalPages});
  proofs.push({page:p,count,width,height,encodedBytes:encoded.length,sha256,zeroAlphaPixels,maxRGBError,
    meanOpaqueRGBError:rgbError/opaqueChannels,sourceCropReembeddingVerified:true,alphaEdgeGutterVerified:true});
}
assert.equal(frames.length,125);
const manifest={format:'synthetic-temporal-fixtures/v1',testFixtureOnly:true,seed:'fixed-geometry-noise-v1',
  sourceFrameMs:50,durationMs:6200,endpointStorageOnly:true,pages,frames};
const bytes=JSON.stringify(manifest);
await fs.writeFile(new URL('manifest.json',out),bytes);
console.log('FIXTURE_PROOF '+JSON.stringify({manifestSha256:hash(bytes),pageCount:pages.length,
  sourceFrames:frames.length,generatedOnlyInCI:true,noRealArt:true,pages:proofs}));
