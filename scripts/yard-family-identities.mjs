/** Offline compiler: source content and local calibration must both match.
 * It writes no release/readiness flag and never authenticates historical r1. */
import {readFile,writeFile} from 'node:fs/promises';
import {createFamilySourceMedia} from '../game-logic/yard-v2/family-media-source.mjs';
import {FAMILY_ASSETS} from '../game-logic/yard-v2/media/family-assets.mjs';
const json=async url=>JSON.parse(await readFile(new URL(url,import.meta.url),'utf8'));
const moon=await json('../game-logic/yard-v2/media/shared-props/r2-evidence/moon-source-identities.json');
const fountain=await json('../game-logic/yard-v2/media/shared-props/r2-evidence/fountain-source-identities.json');
const fc=await json('../game-logic/yard-v2/media/shared-props/r2-evidence/fountain-source-contract.json');
const conditions=await json('../game-logic/yard-v2/media/shared-props/r2-evidence/fountain-condition-contract.json');
const fa=await json('../recovery-tools/yard-family-frozen/assets/yard-turtles/atlas-manifest.json');
const conditionIds=['new','worn','broken'];
const provider=(actor,b)=>{
 const data=FAMILY_ASSETS[actor],ids=data.activities[b.activityIds[0]],clip=data.clips[ids[0]];
 return{actorId:actor,actorRevision:b.actorProfile.revision,visitorId:b.visitorId,bindingId:b.id,bindingRevision:b.revision,bindingCalibrationHash:b.calibrationHash,sourceRigSha256:clip.sourceRigSha256,
  sourceContractSha256:clip.sourceContractSha256||(actor==='basil'||actor==='sage'?fountain.actors[actor].newCombinedContract.sha256:null),activityIds:b.activityIds,conditions:b.conditions,requiredPhases:b.requiredPhases,sourceValidatedPhases:b.validatedPhases};
};
const providers=ids=>ids.flatMap(actor=>createFamilySourceMedia(actor).mediaRegistry.bindings.map(b=>provider(actor,b)));
const sources=[{
 goodieId:'fountain_bowl',revision:'fountain-bowl-source/r2-reconstructed-conditions',sourceGeometryKind:'canonical-editable-blend-sha256',sourceGeometrySha256:fountain.intrinsicProp.canonicalNewSource.sha256,sourceContractSha256:fountain.intrinsicProp.canonicalNewContract.sha256,stillSha256:fa.intrinsicStills.find(s=>s.condition==='new').sha256,
 conditions:conditionIds,unitsPerWorld:8,originWorld:[0,0,0],rotationZ:0,bounds:fc.bounds,paddingWorld:fc.paddingWorld,
 conditionSources:Object.fromEntries(conditionIds.map(k=>[k,{sourceBlendSha256:k==='new'?fountain.intrinsicProp.canonicalNewSource.sha256:fountain.intrinsicProp.conditionSources[k].blend.sha256,evaluatedGeometrySha256:fountain.intrinsicProp.conditionSources[k].canonicalGeometryMaterialSha256,stillSha256:fa.intrinsicStills.find(s=>s.condition===k).sha256}])),providers:providers(['basil','sage']),
},{
 goodieId:'moon_lamp',revision:moon.revision,sourceGeometryKind:'canonical-editable-blend-sha256',sourceGeometrySha256:moon.sourceBlendSha256,sourceContractSha256:moon.sourceContractSha256,stillSha256:moon.stills.new.webpSha256,
 conditions:conditionIds,unitsPerWorld:8,originWorld:[0,0,0],rotationZ:0,bounds:moon.bounds,paddingWorld:moon.paddingWorld,
 conditionSources:Object.fromEntries(conditionIds.map(k=>[k,{sourceBlendSha256:moon.sourceBlendSha256,evaluatedGeometrySha256:moon.canonicalGeometrySha256ByCondition[k],stillSha256:moon.stills[k].webpSha256}])),providers:providers(['willow','starlit']),
}];
const input={format:'yard-verified-intrinsic-prop-sources/v2',runtimeActivated:false,sourceIdentityNote:'Reconstructed r2 sources; historical r1 hashes are not proof. Provider registration and release remain independent.',sources};
await writeFile(new URL('../game-logic/yard-v2/media/shared-props/source-identities.json',import.meta.url),JSON.stringify(input,null,2)+'\n');
console.log(JSON.stringify({sources:sources.map(s=>({id:s.goodieId,sha256:s.sourceGeometrySha256,providers:s.providers.length})),runtimeActivated:false}));
