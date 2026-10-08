import test from 'node:test';
import assert from 'node:assert/strict';
import {orangeBodyPixels,ceramicPixels} from './fixtures/saved-pip-pixels.mjs';
test('actual-pixel gate ignores green empty stage and isolated food crumbs, and finds connected orange body only inside actor bounds',()=>{
 const image={data:new Uint8Array(100*100*3),width:100,height:100,channels:3};
 for(let i=0;i<10000;i++)image.data.set([130,160,70],i*3);
 const set=(x,y)=>image.data.set([220,140,30],(y*100+x)*3),box={left:20,top:20,right:80,bottom:90};
 assert.equal(orangeBodyPixels(image,box).count,0);
 for(let i=0;i<20;i++)set(25+i*2,30);assert.equal(orangeBodyPixels(image,box).count,1);
 for(let y=40;y<75;y++)for(let x=35;x<55;x++)set(x,y);
 const body=orangeBodyPixels(image,box);assert.equal(body.count,700);assert.equal(body.width,20);assert.equal(body.height,35);
 assert.equal(orangeBodyPixels(image,{left:0,top:0,right:15,bottom:15}).count,0);
});

test('food pixel gate rejects plain green and observes a connected pale ceramic region',()=>{const image={data:new Uint8Array(40*40*3),width:40,height:40,channels:3},box={left:0,top:0,right:40,bottom:40};for(let i=0;i<1600;i++)image.data.set([130,160,70],i*3);assert.equal(ceramicPixels(image,box).count,0);for(let y=14;y<20;y++)for(let x=10;x<25;x++)image.data.set([200,205,190],(y*40+x)*3);assert.equal(ceramicPixels(image,box).count,90);});
