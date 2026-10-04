/** Static art/layout fixture; real DOM and Canvas, no API or saved-state writes. */
import {useSyncExternalStore} from 'react';
import {useGameHub as previewHub,courtyardPresentation as previewPresentation} from '../yard-redesign-preview/adapters.jsx';
import {createStaticCourtyardScene} from '../../preview/yard-coherent-frame/static-scene-adapter.mjs';
export {registerAppTranslations,useAppI18n,playerFeedbackText,HudRegion,HudEditableRegion,openHome,SUPPORTED_PROPS,MIKA_CLIPS,MIKA_PLACEMENT_SUGGESTIONS,checkPlacement,visibleStatus} from '../yard-redesign-preview/adapters.jsx';

export const fixtureScope='actual-dom-static-canvas-art-study-no-backend-no-animation';
const inputsUrl=new URLSearchParams(location.search).get('sceneInputs');
if(!inputsUrl||!/^\/yard-static-study\/[a-zA-Z0-9._/-]+\.json$/.test(inputsUrl)||inputsUrl.includes('..'))throw Error('An explicit selected static-study input URL is required');
const inputResponse=await fetch(inputsUrl,{cache:'no-store'});
if(!inputResponse.ok)throw Error('Selected study input HTTP '+inputResponse.status);
const inputBytes=await inputResponse.arrayBuffer(),inputs=JSON.parse(new TextDecoder().decode(inputBytes));
const inputSha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',inputBytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
if(JSON.stringify(inputs.study.frame.cameraDirection)!==JSON.stringify(inputs.layout.calibration.cameraDirection))throw Error('Selected frame and projection cameras differ');
const sourceRows=[...inputs.study.props,{goodieId:'fountain_bowl',placementWorldXY:inputs.study.frame.placementWorldXY}];
const expectedIds=['moon_lamp','sun_cushion','yarn_mouse','fountain_bowl'];
if(JSON.stringify(sourceRows.map(p=>p.goodieId).sort())!==JSON.stringify([...expectedIds].sort())||sourceRows.some(p=>p.placementWorldXY.length!==2||!p.placementWorldXY.every(Number.isFinite)))throw Error('Selected input must contain the four reviewed static prop placements');
export const fixtureProps=expectedIds.map(goodieId=>{const row=sourceRows.find(p=>p.goodieId===goodieId);return{slotId:'study-'+goodieId,goodieId,x:row.placementWorldXY[0],y:row.placementWorldXY[1],condition:'new'};});
const selectedInput={url:inputsUrl,sha256:inputSha256,format:inputs.format,cameraDirection:inputs.study.frame.cameraDirection,sourceFrame:inputs.study.frame.sourceFrame,sourceTimeMs:inputs.study.frame.sourceTimeMs};
const base=previewHub.getState(),snapshot=structuredClone(base.snapshot);
snapshot.player.id='fictional-static-scene-study';
snapshot.yard.currencies={treats:1250,shinyTreats:12};
snapshot.yard.placedGoodies=fixtureProps;
snapshot.yard.goodieInventory=Object.fromEntries(fixtureProps.map(p=>[p.goodieId,1]));
snapshot.yard.bowls=[];
snapshot.yard.pendingGifts=[];
snapshot.yard.petbook={basil_turtle:{visits:3}};
snapshot.yard.album.photos=[];
snapshot.yardRuntime.visits=[{visitId:'study-basil-frozen-pose',visitorId:'basil_turtle',slotId:'study-fountain_bowl',reserved:true,source:'v2'}];
const state={...base,snapshot,accountSession:{},message:'',pendingActions:[],outboxStorageError:null};
const subscribe=()=>()=>{};
export const useGameHub=selector=>useSyncExternalStore(subscribe,()=>selector(state));
useGameHub.getState=()=>state;
export function courtyardPresentation(value){
  const view=previewPresentation(value);
  return{...view,props:view.props.map(prop=>({...prop,transform:{x:prop.x,y:prop.y},reserved:view.runtime.visits.some(v=>v.reserved&&v.slotId===prop.slotId)}))};
}
export function createCourtyardScene(canvas,{onError}={}){
  const observation={ready:false,error:null,fixtureScope,selectedInput,fixtureProps,balances:snapshot.yard.currencies};
  const renderer=createStaticCourtyardScene(canvas,{inputsUrl,onError:error=>{observation.error=String(error.message||error);onError?.(error);}});
  window.__yardDomCanvasStudy={snapshot:()=>({...observation,projectedFixtureProps:fixtureProps.map(prop=>({...prop,point:renderer.project(prop)})),scene:renderer.diagnostics})};
  renderer.ready.then(ready=>{observation.ready=ready===true;}).catch(error=>{observation.error=String(error.message||error);});
  return renderer;
}
