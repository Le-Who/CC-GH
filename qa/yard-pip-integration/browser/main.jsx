import React from 'react';
import {createRoot} from 'react-dom/client';
import CourtyardGame from '../candidate/vendor/r5/src/games/companion-yard-v2/CourtyardGame.jsx';
import {useGameHub} from '../candidate/vendor/r5/src/game-state/useGameHub.js';
import {AppI18nContext,appTranslate} from '@repo/src/app/i18n.jsx';
import {HudLayoutProvider} from '@repo/src/app/hud-layout/HudLayoutContext.jsx';
import {fixtureSnapshot} from '@baseline/src/scene-fixture.mjs';
import {createPreviewTranslator} from '@baseline/browser/preview-i18n.mjs';
import '@baseline/browser/preview.css';

// Disposable read-only state; actual CourtyardGame, scene owner, Canvas2D scene,
// UI reserve, route consumer, Three renderer and public asset bytes are used.
const original=JSON.stringify(fixtureSnapshot),attempts=[];
const fail=(...args)=>{attempts.push({at:performance.now(),args});throw Error('Actual-UI QA may not submit gameplay, outbox or account changes');};
useGameHub.setState({snapshot:structuredClone(fixtureSnapshot),message:'',pendingActions:[],outboxStorageError:null,
 loadSnapshot:async()=>structuredClone(fixtureSnapshot),performReliableAction:fail,drainOutbox:fail});
window.__yardQAState=Object.freeze({snapshot:()=>({mutationAttempts:[...attempts],unchanged:JSON.stringify(useGameHub.getState().snapshot)===original,pendingActions:useGameHub.getState().pendingActions})});
const language='ru', optional=new URLSearchParams(location.search).get('optional')==='1';
createRoot(document.getElementById('root')).render(
 <AppI18nContext.Provider value={{language,t:createPreviewTranslator(language,appTranslate)}}>
  <HudLayoutProvider gameId="room" appVersion="actual-yard-pip-qa" buildId="optional-source-v1"><CourtyardGame allowPipPrototype={optional}/></HudLayoutProvider>
 </AppI18nContext.Provider>);
