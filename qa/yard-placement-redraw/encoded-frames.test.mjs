import test from 'node:test';
import assert from 'node:assert/strict';
import {frameMetrics,DEFAULT_ROI} from './encoded-frames.mjs';
function fill(rgb){const b=Buffer.alloc(390*844*3);for(let i=0;i<b.length;i+=3)for(let k=0;k<3;k++)b[i+k]=rgb[k];return b;}
test('encoded CSS dropout tolerates ordinary video quantization',()=>{assert.equal(frameMetrics(fill([166,188,106]),390,844).flat,true);});
test('black, white and other uniform missing-scene surfaces fail closed',()=>{for(const rgb of[[0,0,0],[255,255,255],[100,110,120]])assert.equal(frameMetrics(fill(rgb),390,844).flat,true);});
test('nonuniform garden-like fixture is not classified as flat',()=>{const b=fill([166,188,106]);for(let y=DEFAULT_ROI.y;y<DEFAULT_ROI.y+DEFAULT_ROI.height;y++)for(let x=DEFAULT_ROI.x;x<DEFAULT_ROI.x+DEFAULT_ROI.width;x++){const i=(y*390+x)*3;b[i]=(x*7+y*3)%256;b[i+1]=(x*3+y*5)%256;b[i+2]=(x+y*11)%256;}assert.equal(frameMetrics(b,390,844).flat,false);});
test('readiness marker uses an isolated fixed header corner',()=>{const b=fill([100,110,120]);for(let y=0;y<16;y++)for(let x=0;x<16;x++){const i=(y*390+x)*3;b[i]=255;b[i+1]=0;b[i+2]=255;}assert.equal(frameMetrics(b,390,844).markerFraction,1);});
test('malformed frame or out-of-bounds crop is rejected',()=>{assert.throws(()=>frameMetrics(Buffer.alloc(5),390,844));assert.throws(()=>frameMetrics(fill([0,0,0]),390,844,{x:300,y:50,width:100,height:100}));});
