import React from 'react';
import {createRoot} from 'react-dom/client';
import CourtyardGame from './src/games/companion-yard-v2/CourtyardGame.jsx';
import {isPipPreviewAllowed} from './src/games/companion-yard-v2/pip-preview-gate.mjs';
import {useGameHub} from './src/game-state/useGameHub.js';
import {AppI18nContext,appTranslate} from './src/app/i18n.jsx';
import {HudLayoutProvider} from './src/app/hud-layout/HudLayoutContext.jsx';
import {fixtureSnapshot} from './preview-fixture.mjs';
import './src/fonts.css';
import './preview.css';

// This adapter exists only in the isolated preview entry. It is never imported
// by the normal app and has no account, API proxy, persistent save, or outbox.
const original=JSON.stringify(fixtureSnapshot),attempts=[];
const fail=(...args)=>{attempts.push({at:performance.now(),args});throw Error('Read-only preview: gameplay changes are disabled');};
useGameHub.setState({snapshot:structuredClone(fixtureSnapshot),message:'',pendingActions:[],outboxStorageError:null,
 loadSnapshot:async()=>structuredClone(fixtureSnapshot),performReliableAction:fail,drainOutbox:fail});
window.__yardQAState=Object.freeze({snapshot:()=>({mutationAttempts:[...attempts],unchanged:JSON.stringify(useGameHub.getState().snapshot)===original,pendingActions:useGameHub.getState().pendingActions})});
const language=new URLSearchParams(location.search).get('lang')==='en'?'en':'ru';
const t=(key,vars)=>key==='yard.persistent.status.readOnly'
 ?language==='ru'?'Предпросмотр · изменения отключены':'Read-only preview · changes disabled'
 :appTranslate(language,key,vars);
const enabled=isPipPreviewAllowed({enabled:import.meta.env.VITE_YARD_PIP_PREVIEW==='true',search:location.search});
createRoot(document.getElementById('root')).render(
 <AppI18nContext.Provider value={{language,t}}>
  <HudLayoutProvider gameId="room" appVersion="yard-phone-preview" buildId={import.meta.env.VITE_BUILD_ID||'unpublished-preview'}>
   <CourtyardGame allowPipPrototype={enabled}/>
  </HudLayoutProvider>
 </AppI18nContext.Provider>);
