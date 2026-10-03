/** Intrinsic prop identity is independent of the visitor providing readiness.
 * Code-owned source hashes and per-provider calibration proofs are separate. */
import input from './media/shared-props/source-identities.json' with {type:'json'};
import {YARD_GOODIES,YARD_VISITORS} from './catalog.mjs';
import {clone,deepFreeze,digest} from './util.mjs';
const sha=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s),phases=p=>Array.isArray(p)&&p.length>0&&new Set(p).size===p.length&&p.every(v=>typeof v==='string'&&!!v);
export function intrinsicPropIdentity(source){
 const s=clone(source),b=s?.bounds;
 if(!s||!Object.hasOwn(YARD_GOODIES,s.goodieId)||typeof s.revision!=='string'||!s.revision||![s.sourceGeometrySha256,s.sourceContractSha256,s.stillSha256].every(sha)||s.unitsPerWorld!==8||JSON.stringify(s.originWorld)!=='[0,0,0]'||JSON.stringify(s.conditions)!=='["new"]'||s.rotationZ!==0||!Number.isFinite(s.paddingWorld)||s.paddingWorld<0||s.paddingWorld>.1||!b||!['min','max'].every(k=>Array.isArray(b[k])&&b[k].length===3&&b[k].every(Number.isFinite))||b.min.some((v,i)=>v>b.max[i]))throw Error('Verified intrinsic prop geometry/content required');
 const footprint={width:2*(Math.max(Math.abs(b.min[0]),Math.abs(b.max[0]))+s.paddingWorld)*8,height:2*(Math.max(Math.abs(b.min[1]),Math.abs(b.max[1]))+s.paddingWorld)*8};
 if(!Object.values(footprint).every(v=>v>0&&v<=100))throw Error('Finite intrinsic footprint required');
 // Provider IDs, actor revisions, readiness and provider order are deliberately
 // absent: none of those changes the physical obstacle or its visible content.
 const geometry={format:'yard-intrinsic-prop/v1',goodieId:s.goodieId,revision:s.revision,sourceGeometrySha256:s.sourceGeometrySha256,stillSha256:s.stillSha256,unitsPerWorld:s.unitsPerWorld,bounds:clone(b),paddingWorld:s.paddingWorld,conditions:clone(s.conditions),rotationZ:s.rotationZ,footprint};
 return deepFreeze({...geometry,identity:digest(geometry)});
}
if(input.format!=='yard-verified-intrinsic-prop-sources/v1'||input.runtimeActivated!==false)throw Error('Closed verified prop source catalog required');
const definitions={},providers={};
for(const source of input.sources){
 const intrinsic=intrinsicPropIdentity(source);if(Object.hasOwn(definitions,intrinsic.goodieId))throw Error('Duplicate intrinsic source');definitions[intrinsic.goodieId]=intrinsic;
 if(!Array.isArray(source.providers)||!source.providers.length)throw Error('Intrinsic prop provider contracts required');
 providers[intrinsic.goodieId]=source.providers.map(p=>{
  if(typeof p.actorId!=='string'||!p.actorId||p.actorRevision!==null&&(typeof p.actorRevision!=='string'||!p.actorRevision)||!phases(p.activityIds)||!Object.hasOwn(YARD_VISITORS,p.visitorId)||typeof p.bindingId!=='string'||!p.bindingId||typeof p.bindingRevision!=='string'||!p.bindingRevision||![p.sourceRigSha256,p.sourceContractSha256].every(sha)||p.bindingCalibrationHash!==null&&!sha(p.bindingCalibrationHash)||!phases(p.requiredPhases)||!Array.isArray(p.sourceValidatedPhases)||p.sourceValidatedPhases.some(v=>typeof v!=='string'))throw Error('Exact source provider contract required');
  return deepFreeze({...clone(p),goodieId:intrinsic.goodieId});
 });
}
export const INTRINSIC_PROP_SOURCES=deepFreeze(definitions);
export const INTRINSIC_PROP_PROVIDERS=deepFreeze(providers);
const providerFor=b=>(Object.hasOwn(providers,b?.goodieId)?providers[b.goodieId]:[]).find(p=>p.bindingId===b?.id&&p.actorRevision!==null&&b.actorProfile?.id===p.actorId&&b.actorProfile?.revision===p.actorRevision&&p.visitorId===b?.visitorId&&p.bindingRevision===b?.revision&&sha(p.bindingCalibrationHash)&&p.bindingCalibrationHash===b?.calibrationHash);
const proofFor=(p,c)=>deepFreeze({format:'yard-intrinsic-prop-provider/v1',propIdentity:c.identity,sourceGeometrySha256:c.sourceGeometrySha256,providerDigest:digest({propIdentity:c.identity,provider:p})});
/** Attach only to a locally constructed exact source binding. This does not
 * set playbackReady, fill missing phases, or mint an obstacle context. */
export function withIntrinsicPropProof(binding){
 const p=providerFor(binding);if(!p)throw Error('Exact intrinsic prop provider calibration required');
 return deepFreeze({...clone(binding),propSource:proofFor(p,definitions[p.goodieId])});
}
export function intrinsicPropReadiness(mediaRegistry){
 const props={},proofs={};
 for(const[id,c]of Object.entries(definitions)){
  const witnesses=[];
  for(const p of providers[id]){
   if(!sha(p.bindingCalibrationHash)||!p.requiredPhases.every(phase=>p.sourceValidatedPhases.includes(phase)))continue;
   const matches=(mediaRegistry?.bindings||[]).filter(b=>providerFor(b)===p&&b.playbackReady===true&&b.conditions?.includes('new')&&phases(b.requiredPhases)&&p.requiredPhases.length===b.requiredPhases.length&&Array.isArray(b.activityIds)&&b.activityIds.length===p.activityIds.length&&p.activityIds.every(a=>b.activityIds.includes(a))&&p.requiredPhases.every(phase=>b.requiredPhases.includes(phase)&&b.validatedPhases?.includes(phase))&&b.propSource&&Object.keys(b.propSource).length===4&&Object.entries(proofFor(p,c)).every(([k,v])=>b.propSource[k]===v));
   if(matches.length===1)witnesses.push({bindingId:p.bindingId,visitorId:p.visitorId,bindingRevision:p.bindingRevision,bindingCalibrationHash:p.bindingCalibrationHash,actorProfile:{id:p.actorId,revision:p.actorRevision},...proofFor(p,c)});
  }
  if(witnesses.length){props[id]=c;proofs[id]=witnesses;}
 }
 return deepFreeze({props,proofs});
}
