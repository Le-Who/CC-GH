import {digest,freeze,clone} from '../runtime/util.mjs';
import {COMPACT_DIGEST} from '../runtime/contract-pins.mjs';
/** This sampler only plays the finite published fixture. It cannot author or
 * admit another route, overwrite an old plan or select live server media. */
export function createCompactBrowserSampler(data){
 const {compact,compactDigest,identity}=data;
 if(compact.format!=='yard-Mochi-S1E1-finite-browser-runtime/v1'||compactDigest!==COMPACT_DIGEST||digest(compact)!==compactDigest||
    identity.runtimeContractDigest!==compactDigest||identity.sourceSha256!==compact.upstreamSourceSha256)
  throw Error('Finite runtime contract digest/source mismatch');
 if(compact.sampleMs!==50||compact.poses.length*50!==compact.durationMs||compact.poses.some((row,i)=>row.atMs!==i*50))
  throw Error('Finite runtime source window coverage differs');
 return freeze({identity:clone(identity),mapping:clone(compact.mapping),camera:clone(compact.camera),
  source:{sourceSampleMs:50},contract:{combined:{rest:{periodMs:1200}}},
  sample(plan,at){
   if(plan.runtimeContractDigest!==compactDigest||plan.endAt-plan.startAt!==compact.durationMs||
      plan.previewPropReleaseAt-plan.startAt!==compact.releaseOffsetMs)throw Error('Finite runtime plan differs');
   if(at<plan.startAt||at>=plan.endAt)return null;
   return clone(compact.poses[Math.floor((at-plan.startAt)/50)].pose);
  },samplePlacedDescriptor(){throw Error('Finite preview sampler does not admit arbitrary source inspection');}});
}
