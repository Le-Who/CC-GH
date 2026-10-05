import React from 'react';
import {createRoot} from 'react-dom/client';
import CourtyardGame from '../vendor/r5/src/games/companion-yard-v2/CourtyardGame.jsx';
import {useGameHub} from '../vendor/r5/src/game-state/useGameHub.js';
import {AppI18nContext,appTranslate} from '@repo/src/app/i18n.jsx';
import {HudLayoutProvider} from '@repo/src/app/hud-layout/HudLayoutContext.jsx';
import {fixtureSnapshot} from '../src/scene-fixture.mjs';
import './preview.css';
import {createPreviewTranslator} from './preview-i18n.mjs';

// Owned disposable fixture only. Actual UI/component code is unchanged. The
// preview makes no API, account, outbox or gameplay mutation acceptance claim.
const fail=()=>{throw Error('This isolated preview cannot submit mutations');};
useGameHub.setState({snapshot:structuredClone(fixtureSnapshot),message:'',pendingActions:[],outboxStorageError:null,
 loadSnapshot:async()=>structuredClone(fixtureSnapshot),performReliableAction:fail,drainOutbox:fail});
const language=new URLSearchParams(location.search).get('language')==='ru'?'ru':'en';
createRoot(document.getElementById('root')).render(
 <AppI18nContext.Provider value={{language,t:createPreviewTranslator(language,appTranslate)}}>
  <HudLayoutProvider gameId="room" appVersion="isolated-preview" buildId="corrected-source-v1"><CourtyardGame/></HudLayoutProvider>
 </AppI18nContext.Provider>);
