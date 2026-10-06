/** Offline only: decodes encoded video after the browser context has closed. */
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
export const MARKER={x:0,y:0,width:16,height:16,visibleRgb:[255,0,255],occludedDomRgb:[0,255,255],occludedEncodedRgb:[18,162,156],backdropRgba:[37,60,48,122/255],encodedChannelTolerance:16};
export const DEFAULT_ROI={x:25,y:100,width:340,height:280};
export function frameMetrics(rgb,width,height,roi=DEFAULT_ROI){
 assert.equal(rgb.length,width*height*3);
 assert(roi.x>=0&&roi.y>=0&&roi.width>0&&roi.height>0&&roi.x+roi.width<=width&&roi.y+roi.height<=height);
 const sum=[0,0,0],square=[0,0,0];let background=0,n=0;
 for(let y=roi.y;y<roi.y+roi.height;y++)for(let x=roi.x;x<roi.x+roi.width;x++){
  const i=(y*width+x)*3;let matches=true;
  for(let k=0;k<3;k++){const v=rgb[i+k];sum[k]+=v;square[k]+=v*v;if(Math.abs(v-[166,189,106][k])>8)matches=false;}
  background+=Number(matches);n++;
 }
 const mean=sum.map(v=>v/n),stddev=square.map((v,k)=>Math.sqrt(Math.max(0,v/n-mean[k]**2)));
 let markerPixels=0,occludedMarkerPixels=0;
 for(let y=4;y<12;y++)for(let x=4;x<12;x++){const i=(y*width+x)*3;if(rgb[i]>220&&rgb[i+1]<35&&rgb[i+2]>220)markerPixels++;if([18,162,156].every((v,k)=>Math.abs(rgb[i+k]-v)<=16))occludedMarkerPixels++;}
 const backgroundFraction=background/n;
 return{backgroundFraction,mean,stddev,markerFraction:markerPixels/64,occludedMarkerFraction:occludedMarkerPixels/64,flat:backgroundFraction>=.95||Math.max(...stddev)<=2};
}
export async function analyzeVideo(file,{roi=DEFAULT_ROI,requireMarker=true,startSeconds=0}={}){
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,r_frame_rate:frame=best_effort_timestamp_time','-of','json',file],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024}));
 const [{width,height,r_frame_rate:frameRate}]=probe.streams;
 assert.equal(width,390);assert.equal(height,844);
 const frameBytes=width*height*3,rows=[],occluded=[],intervals=[];let pending=Buffer.alloc(0),index=0,armed=!requireMarker,firstArmed=null,error='';
 const child=spawn('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-vsync','0','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{stdio:['ignore','pipe','pipe']});
 const timer=setTimeout(()=>child.kill('SIGKILL'),30000);
 const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(Error('Offline decoder failed: '+code+' '+error)));});
 exit.catch(()=>{});child.stderr.on('data',b=>{error=(error+b.toString()).slice(-2000);});
 try{for await(const chunk of child.stdout){pending=Buffer.concat([pending,chunk]);while(pending.length>=frameBytes){const frame=pending.subarray(0,frameBytes);pending=pending.subarray(frameBytes);const m=frameMetrics(frame,width,height,roi),pts=Number(probe.frames[index]?.best_effort_timestamp_time);assert(Number.isFinite(pts));const markerState=m.markerFraction>=.8?'stage-visible':m.occludedMarkerFraction>=.8?'dialog-occluded':null;if(markerState)armed=true;if(armed&&pts>=startSeconds){
 if(requireMarker)assert(markerState,'Unrecognized post-arm encoded marker at frame '+index);
 firstArmed??=index;const visibility=requireMarker?markerState:'stage-visible',row={frame:index,seconds:pts,...m};
 if(visibility==='stage-visible')rows.push(row);else occluded.push({frame:index,seconds:pts});
 const last=intervals.at(-1);if(last?.visibility===visibility){last.lastFrame=index;last.lastSeconds=pts;last.frames++;}else intervals.push({visibility,firstFrame:index,lastFrame:index,firstSeconds:pts,lastSeconds:pts,frames:1});
}index++;}}await exit;}finally{clearTimeout(timer);if(child.exitCode===null)child.kill('SIGKILL');}
 assert.equal(pending.length,0);assert.equal(index,probe.frames.length);assert(rows.length>=10,'No sustained post-readiness encoded evidence');
 const failures=rows.filter(row=>row.flat);
 return{file,width,height,frameRate,decodedFrames:index,analyzedFrames:rows.length,postArmFrames:rows.length+occluded.length,dialogOccludedFrames:occluded.length,intervals,firstArmedFrame:firstArmed,roi,markerContract:MARKER,thresholds:{backgroundRgb:[166,189,106],channelTolerance:8,backgroundFraction:.95,uniformMaxChannelStddev:2},flatFrames:failures,passed:failures.length===0,range:{first:rows[0],last:rows.at(-1)},qualification:'Every post-arm encoded sample is accounted for. Only stage-visible intervals can establish stage continuity; dialog-occluded intervals are explicitly reported. No screenshots, readPixels, retiming or interpolation. This is not physical-device frame timing.'};
}
