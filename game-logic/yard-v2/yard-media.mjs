/** Canonical species dispatch. A new source binding does not grant readiness.
 * HTTP clients cannot provide registries, profiles or preflight callbacks. */
import {createTrustedObstacleContext} from './prop-obstacles.mjs';
import {getMikaServerOptions} from './mika-media.mjs';
import {createMochiMedia} from './mochi-media.mjs';
import {createPipMedia} from './pip-media.mjs';
import {createPebbleMedia} from './pebble-media.mjs';
import {createFamilyMedia} from './family-media.mjs';
import {clone,deepFreeze} from './util.mjs';
export function createYardMedia({mika=getMikaServerOptions(),mochi=createMochiMedia(),pebble=createPebbleMedia(),pip=createPipMedia(),willow=createFamilyMedia('willow'),starlit=createFamilyMedia('starlit'),basil=createFamilyMedia('basil'),sage=createFamilyMedia('sage')}={}){
 const sources=[mika,mochi,pebble,pip,willow,starlit,basil,sage],bindings=sources.flatMap(s=>s.mediaRegistry.bindings);
 if(new Set(bindings.map(b=>b.id)).size!==bindings.length)throw Error('Duplicate Yard media binding');
 const sourceRegistry=deepFreeze({...clone(mika.mediaRegistry),revision:'yard-species-staged/r1',kind:'persistent-yard',bindings:clone(bindings)});
 // An inactive source must not perturb even the strict legacy registry digest.
 // Only accepted entries join the admission registry. Candidate inventory stays
 // inspectable separately, never in the persisted admission identity.
 const acceptedSources=sources.slice(1).filter(s=>s.mediaRegistry.bindings.some(b=>b.playbackReady===true));
 const admitted=acceptedSources.flatMap(s=>s.mediaRegistry.bindings.filter(b=>b.playbackReady===true));
 const mediaRegistry=admitted.length?deepFreeze({...clone(mika.mediaRegistry),revision:'yard-species-staged/r1',kind:'persistent-yard',
  bindings:[...clone(mika.mediaRegistry.bindings),...clone(admitted)]}):mika.mediaRegistry;
 const obstacleContext=createTrustedObstacleContext(mediaRegistry);
 const actorProfiles=Object.freeze(Object.assign({},...sources.map(s=>s.actorProfiles)));
 const scene=acceptedSources.length?deepFreeze({...clone(mika.scene),footprints:Object.assign({},mika.scene.footprints,...acceptedSources.map(s=>s.scene.footprints))}):mika.scene;
 const placementReadiness=admitted.length?yard=>{
  const baseline=mika.placementReadiness(yard,{obstacleContext}),others=acceptedSources.map(s=>({visitorId:s.candidateProfile.visitorId,rows:s.sourcePlacementReadiness(yard,obstacleContext)}));
  return baseline.map(row=>{const own=others.flatMap(s=>{const p=s.rows.find(p=>p.slotId===row.slotId);return p?[{visitorId:s.visitorId,...p}]:[];});
   const selected=row.status==='ready'?row:own.find(r=>r.status==='ready')||row;
   return{...selected,visitors:[{visitorId:'mika_cat',...row},...own]};});
 }:mika.placementReadiness;
 return Object.freeze({mediaRegistry,sourceRegistry,actorProfiles,scene,placementReadiness,
  preflight(candidate,binding){const owner=sources.find(s=>s.mediaRegistry.bindings.some(b=>b.id===binding?.id&&b.visitorId===binding?.visitorId));
   return owner?owner.preflight(candidate,binding,obstacleContext):{ok:false,code:'UNSUPPORTED_VISIT_MEDIA'};}});
}
let options;
export function getYardServerOptions(){return options??=createYardMedia();}
