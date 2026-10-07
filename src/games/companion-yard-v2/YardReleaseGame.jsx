import React, {useEffect} from 'react';
import {useGameHub} from '../../game-state/useGameHub.js';
import {useAppI18n} from '../../app/i18n.jsx';
import {openHome} from '../../app/homeNavigation.js';
import {yardReleasePresentation} from './release-presentation.mjs';
import {isPipPreviewAllowed,pipPreviewGroundingRecipe,isCanonicalFoodPreviewAllowed} from './pip-preview-gate.mjs';
import './i18n.js';
const Legacy=React.lazy(()=>import('../companion-yard/CompanionYardGame.jsx'));
const Persistent=React.lazy(()=>import('./CourtyardGame.jsx'));
export default function YardReleaseGame(){
 const mode=useGameHub(state=>yardReleasePresentation(state.snapshot,{canonicalSavedVisitsEnabled:import.meta.env.VITE_YARD_SAVED_VISITS==='true'}));
 const {t}=useAppI18n();
 useEffect(()=>{
  if(mode!=='read-only')return;
  const shell={id:'room',openPanel:false,closePanel:()=>{}};
  useGameHub.getState().setActiveGameShell(shell);
  return ()=>{const s=useGameHub.getState();if(s.activeGameShell===shell)s.setActiveGameShell(null);};
 },[mode]);
 // Quarantine consumes no raw Yard arrays and loads no scene/media. Unknown
 // shapes stay preserved server-side; returning Home remains available.
 if(mode==='read-only')return <section className="loading-panel" data-yard-read-only="true" role="status"><h1>{t('yard.title')}</h1><p>{t('yard.persistent.error.save')}</p><button type="button" onClick={openHome} style={{minWidth:44,minHeight:44}}>{t('yard.persistent.back')}</button></section>;
 const View=mode==='persistent'?Persistent:Legacy;
 const allowPipPrototype=mode==='persistent'&&isPipPreviewAllowed({
  enabled:import.meta.env.VITE_YARD_PIP_PREVIEW==='true',
  search:globalThis.location?.search||'',
 });
 const pipGroundingRecipe=pipPreviewGroundingRecipe({enabled:allowPipPrototype,search:globalThis.location?.search||''});
 const allowCanonicalFoodPreview=isCanonicalFoodPreviewAllowed({enabled:allowPipPrototype,search:globalThis.location?.search||''});
 return <View allowCanonicalEntry={mode==='persistent'&&import.meta.env.VITE_YARD_PIP_PREVIEW==='true'} allowPipPrototype={allowPipPrototype} allowCanonicalFoodPreview={allowCanonicalFoodPreview} pipGroundingRecipe={pipGroundingRecipe}/>;
}
