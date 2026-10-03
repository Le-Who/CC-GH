/** Actor identity, physics and local pixels must agree before a visit is drawn.
 * A missing visitor never falls back to Mika's silhouettes or gait. */
import {ACTOR_PROFILES,MIKA_ACTOR_PROFILE,resolveActorProfile,resolveBindingActorProfile,actorProfileReference} from '../../../game-logic/yard-v2/actor-profiles.mjs';
import {CAMERA_DIRECTION} from './projection.mjs';
const own=(value,key)=>Object.hasOwn(value||{},key);
const sameRef=(a,b)=>!!a&&!!b&&a.id===b.id&&a.revision===b.revision;
export function createActorMediaEntry(manifest,{reference,assetBaseURL,clips,profiles=ACTOR_PROFILES}={}) {
 const profile=resolveActorProfile(reference,profiles);
 if(!profile||profile.unitsPerWorld!==8)throw Error('Unsupported actor profile or scene scale');
 if(!manifest?.renderBindings||typeof manifest?.manifestRevision!=='string'||!manifest.manifestRevision.trim())throw Error('Actor manifest identity is required');
 if(!Number.isFinite(manifest.walk?.stride)||Math.abs(manifest.walk.stride-profile.locomotion.strideWorld)>1e-8||manifest.walk?.cycleSeconds*1000!==profile.locomotion.cycleMs)throw Error('Actor walk scale or timing mismatch');
 for(const c of [...Object.values(manifest.clips||{}),...Object.values(manifest.walk?.facings||{}),...Object.values(manifest.turns||{})]){
  if(c.cameraDirection?.length!==3||!c.cameraDirection.every(Number.isFinite)||c.cameraDirection.some((n,i)=>Math.abs(n-CAMERA_DIRECTION[i])>1e-8)
   ||c.labelsBaked!==false||!Number.isFinite(c.pixelsPerWorld)||c.pixelsPerWorld<=0||c.pivotPx?.length!==2||!c.pivotPx.every(Number.isFinite))
   throw Error('Actor camera, scale or pivot is incompatible with the courtyard');
 }
 for(const facing of profile.locomotion.facings){
  const c=manifest.walk?.facings?.[facing];
  if(!c||c.durationMs!==profile.locomotion.cycleMs||c.phaseSamples?.length!==profile.locomotion.phaseSamples.length
   ||c.frameCount!==c.phaseSamples.length||c.phaseSamples.some((p,i)=>!Number.isFinite(p)||Math.abs(p-profile.locomotion.phaseSamples[i])>1e-9))throw Error('Actor walk phases do not match its motion profile');
 }
 for(const key of profile.turns.variants){const c=manifest.turns?.[key],steps=Number(key.split(':')[2]);if(!c||c.durationMs!==profile.turns.durations[steps])throw Error('Actor turn media is incomplete');}
 for(const[id,interaction]of Object.entries(profile.interactions)){
  if(!clips?.[id]||!manifest.clips?.[id]||!manifest.clips?.[interaction.restClipId])throw Error('Actor interaction/rest media is incomplete');
 }
 const base=new URL(assetBaseURL).href,scoped=collection=>Object.fromEntries(Object.entries(collection||{}).map(([id,c])=>[id,{...c,assetBaseURL:base,assetRevision:manifest.manifestRevision}]));
 return{reference:actorProfileReference(profile),profile,clips,manifest:{...manifest,clips:scoped(manifest.clips),
  walk:{...manifest.walk,facings:scoped(manifest.walk.facings)},turns:scoped(manifest.turns)},assetBaseURL:base};
}
/** Pure presentation fixtures can supply only contract data. Browser scene owners
 * always pass entries created from validated, loaded local manifests above. */
export function contractOnlyMikaEntry(clips){return{mika:{reference:actorProfileReference(MIKA_ACTOR_PROFILE),profile:MIKA_ACTOR_PROFILE,clips,manifest:null}};}
export function resolveVisitActorMedia(record,entries,profiles=ACTOR_PROFILES) {
 const media=record?.mediaAdmission;let profile;
 if(own(record,'resolvedActorProfile'))profile=resolveActorProfile(record.resolvedActorProfile,profiles);
 else if(own(media,'actorProfile'))profile=resolveActorProfile(media.actorProfile,profiles);
 else profile=resolveBindingActorProfile({id:media?.bindingId,visitorId:record?.visitorId,
  goodieId:media?.goodieId||record?.original?.goodieId||record?.placement?.goodieId},profiles);
 if(!profile||profile.visitorId!==record?.visitorId)return null;
 if(own(media,'actorProfile')&&!sameRef(media.actorProfile,profile))return null;
 const local=own(entries,profile.id)?entries[profile.id]:null;
 return local&&sameRef(local.reference,profile)&&local.profile.visitorId===record.visitorId?local:null;
}
export function actorEntryForPet(pet,entries){
 const ref=pet?.actorProfile,entry=own(entries,ref?.id)?entries[ref.id]:null;
 if(!entry||!sameRef(entry.reference,ref)||entry.profile.visitorId!==pet.visitorId)throw Error('No matching local actor pixels');
 return entry;
}
