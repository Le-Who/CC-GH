/** Synthetic shared-cache inputs; does not assert four-actor layout or release QA. */
import {MIKA_ACTOR_PROFILE,MIKA_ACTOR_REFERENCE} from '../../../game-logic/yard-v2/actor-profiles.mjs';
import {MOCHI_ACTOR_PROFILE} from '../../../game-logic/yard-v2/mochi-actor-profile.mjs';
import {PEBBLE_ACTOR_PROFILE} from '../../../game-logic/yard-v2/pebble-actor-profile.mjs';
import {PIP_ACTOR_PROFILE} from '../../../game-logic/yard-v2/pip-actor-profile.mjs';
import {MIKA_CLIPS} from '../../../game-logic/yard-v2/media/mika-clips.mjs';
import {GROUND_REST} from '../../../game-logic/yard-v2/media/ground-rest.mjs';
import {createActorMediaEntry} from '../../../src/games/companion-yard-v2/actor-media.mjs';
import {createMochiActorMediaEntry} from '../../../src/games/companion-yard-v2/mochi-actor-media.mjs';
import {createPebbleActorMediaEntry} from '../../../src/games/companion-yard-v2/pebble-actor-media.mjs';
import {createPipActorMediaEntry} from '../../../src/games/companion-yard-v2/pip-actor-media.mjs';
import {selectPetPose} from '../../../src/games/companion-yard-v2/pose-selection.mjs';
import {atlasPageFor} from '../../../src/games/companion-yard-v2/atlas.mjs';
import mika from '../../../public/assets/yard-mika/runtime-media.json' with {type:'json'};
import mochi from '../../../public/assets/yard-mochi/runtime-media.json' with {type:'json'};
import pebble from '../../../public/assets/yard-pebble/runtime-media.json' with {type:'json'};
import pip from '../../../public/assets/yard-pip/runtime-media.json' with {type:'json'};
export const manifests={mika,mochi,pebble,pip};
export const profiles=Object.fromEntries([MIKA_ACTOR_PROFILE,MOCHI_ACTOR_PROFILE,PEBBLE_ACTOR_PROFILE,PIP_ACTOR_PROFILE].map(p=>[p.id,{...structuredClone(p),playbackReady:true}]));
const base=id=>`https://yard.fixture/assets/yard-${id}/`;
export const entries={
 mika:createActorMediaEntry(mika,{reference:MIKA_ACTOR_REFERENCE,assetBaseURL:base('mika'),clips:MIKA_CLIPS,profiles}),
 mochi:createMochiActorMediaEntry(mochi,{assetBaseURL:base('mochi'),profiles}),
 pebble:createPebbleActorMediaEntry(pebble,{assetBaseURL:base('pebble'),profiles}),
 pip:createPipActorMediaEntry(pip,{assetBaseURL:base('pip'),profiles}),
};
export const allClips=entry=>[...Object.values(entry.manifest.clips),...Object.values(entry.manifest.walk.facings),...Object.values(entry.manifest.turns)];
export function restRows(ms,{groundMika=false}={}){
 return Object.values(entries).map(entry=>{
  const interaction=Object.values(entry.profile.interactions).find(i=>entry.profile.id!=='mika'||i.goodieId==='sun_cushion');
  const loop=entry.profile.id==='mika'&&groundMika?GROUND_REST.loop:interaction.loop;
  const clipId=entry.profile.id==='mika'&&groundMika?GROUND_REST.id:interaction.restClipId;
  const sourceMs=loop.startMs+ms%(loop.endMs-loop.startMs);
  const row=selectPetPose(entry.manifest,{visitorId:entry.profile.visitorId,phase:'active-clip',clipId,clipAtMs:sourceMs},{actorProfile:entry.profile});
  const current=atlasPageFor(row.clip,row.index).page.src;
  let next=null;
  if(entry.profile.id==='pebble'||entry.profile.id==='pip'){
   for(let i=1;i<=33;i++){
    const t=loop.startMs+(ms+i*entry.profile.sourceSampleMs)%(loop.endMs-loop.startMs),r=selectPetPose(entry.manifest,{phase:'active-clip',clipId,clipAtMs:t},{actorProfile:entry.profile});
    if(atlasPageFor(r.clip,r.index).page.src!==current){next=r;break;}
   }
  }else next=selectPetPose(entry.manifest,{phase:'active-clip',clipId,clipAtMs:loop.startMs+(ms+1100)%(loop.endMs-loop.startMs)},{actorProfile:entry.profile});
  return{actorId:entry.profile.id,...row,lookahead:next};
 });
}
