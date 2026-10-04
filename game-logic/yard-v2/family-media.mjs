/** Source attestation does not enable admission or player activation. */
import {createFamilySourceMedia,FAMILY_RELEASE_GATE} from './family-media-source.mjs';
import {withIntrinsicPropProof} from './intrinsic-props.mjs';
import {clone,deepFreeze} from './util.mjs';
export function createFamilyMedia(actorId,options){
 const source=createFamilySourceMedia(actorId,options),ready=FAMILY_RELEASE_GATE.accepted&&source.candidateProfile.playbackReady;
 const registry=deepFreeze({...clone(source.mediaRegistry),bindings:source.mediaRegistry.bindings.map(b=>withIntrinsicPropProof({...clone(b),playbackReady:ready}))});
 return Object.freeze({...source,mediaRegistry:registry,actorProfiles:Object.freeze(ready?{[actorId]:source.candidateProfile}:{}),
  preflight:(candidate,binding,context)=>ready?source.preflightCandidate(candidate,binding,context):{ok:false,code:'FAMILY_FULL_YARD_ACCEPTANCE_REQUIRED'}});
}
