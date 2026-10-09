import React, {useEffect} from 'react';
import {useGameHub} from '../../game-state/useGameHub.js';
import {useAppI18n} from '../../app/i18n.jsx';
import {openHome} from '../../app/homeNavigation.js';
import {yardReleasePresentation} from './release-presentation.mjs';
import './i18n.js';
const Persistent = React.lazy(() => import('./CourtyardGame.jsx'));
export default function YardReleaseGame() {
 const mode = useGameHub(state => !state.snapshot ? 'loading' : state.snapshot?.yardRuntime?.version === 1
  && !state.snapshot.yardRuntime.error && ['ready', 'reconciliation-pending'].includes(state.snapshot.yardRuntime.status)
  && yardReleasePresentation(state.snapshot, {canonicalSavedVisitsEnabled: import.meta.env.VITE_YARD_SAVED_VISITS === 'true'}) === 'persistent'
  ? 'persistent' : 'read-only');
 const {t} = useAppI18n();
 useEffect(() => {
  if (mode === 'persistent') return;
  const shell = {id: 'room', openPanel: false, closePanel: () => {}};
  useGameHub.getState().setActiveGameShell(shell);
  return () => { const state = useGameHub.getState(); if (state.activeGameShell === shell) state.setActiveGameShell(null); };
 }, [mode]);
 // Unknown and disabled saves load no scene or media; their data stays preserved.
 if (mode !== 'persistent') return <section className="loading-panel" data-yard-read-only={mode === 'read-only' ? 'true' : undefined} role="status"><h1>{t('yard.title')}</h1><p>{t(mode === 'loading' ? 'yard.persistent.loading' : 'yard.persistent.error.save')}</p><button type="button" onClick={openHome} style={{minWidth: 44, minHeight: 44}}>{t('yard.persistent.back')}</button></section>;
 return <Persistent/>;
}
