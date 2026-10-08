/** Conservative skin envelope from positive-weight joint bind-space boxes.
 * 20 affected joints × 8 corners, not a full vertex scan on every frame.
 * The two remaining rig joints have no nonzero skin weights.
 */
export function boundMikaPose(sample,envelope,{includeCorners=false}={}) {
  if(sample?.format!=='mika-locomotion-sample/v1'||envelope?.format!=='mika-p2-joint-skin-bounds/v1'||envelope.assetSha256!=='2249774f8ced124451d3c46a8a69bc06a9889c7d9cc31c836a6dd868fd96f084'||!Number.isFinite(envelope.maxWeightSumError)||envelope.maxWeightSumError<0||envelope.maxWeightSumError>1e-6)throw Error('INVALID_MIKA_ENVELOPE');
  const min=[0,0,0],max=[0,0,0],points=[[0,0,0]];let corners=0;
  for(const [name,box]of Object.entries(envelope.bones)) {
    const m=sample.boneMatrices[name];
    if(!m||m.length!==4||!m.every(row=>row.length===4&&row.every(Number.isFinite))||!box.min?.every(Number.isFinite)||!box.max?.every(Number.isFinite))throw Error('INVALID_MIKA_ENVELOPE_POSE');
    for(const x of [box.min[0],box.max[0]])for(const y of [box.min[1],box.max[1]])for(const z of [box.min[2],box.max[2]]){
      const point=[];for(let i=0;i<3;i++){const v=m[i][0]*x+m[i][1]*y+m[i][2]*z+m[i][3];min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v);point.push(v);}if(includeCorners)points.push(point);corners++;
    }
  }
  const magnitude=Math.max(...min.map(Math.abs),...max.map(Math.abs)),pad=1e-5+magnitude*envelope.maxWeightSumError;
  for(let i=0;i<3;i++){min[i]-=pad;max[i]+=pad;}
  return {format:'mika-root-relative-skin-envelope/v1',min,max,radius:Math.hypot(Math.max(-min[0],max[0]),Math.max(-min[1],max[1])),cornerTransforms:corners,weightErrorPadding:pad,...(includeCorners?{points}: {})};
}
