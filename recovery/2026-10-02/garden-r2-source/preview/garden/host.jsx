import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import GardenShelfGame from '../../src/games/garden-shelf/GardenShelfGame.tsx';
import { HudLayoutProvider } from '../../src/app/hud-layout/HudLayoutContext.jsx';
import { AppI18nContext, appTranslate } from '../../src/app/i18n.jsx';
import { useGameHub } from '../../src/game-state/useGameHub.js';
import { audioManager } from '../../src/services/audioManager.js';
import '../../src/app/hud-layout/hud-layout.css';
import './fonts.css';
import './host.css';
import { GARDEN_PREVIEW_VERSION } from './version.js';
import { readPreviewSettings } from './settings.js';

const { language } = readPreviewSettings(window.location.search);
document.documentElement.lang = language;
document.documentElement.dataset.uiTheme = 'dark';
useGameHub.setState({ activeTab: 'garden', activeGameShell: null });

function recover() {
  const url = new URL(location.href);
  url.searchParams.delete('forceError');
  location.replace(url);
}
class PreviewBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('Garden preview failed', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="preview-state" role="alert"><h1>{language === 'ru' ? 'Не удалось открыть сад' : 'Garden could not start'}</h1><p>{String(this.state.error.message || this.state.error)}</p><button type="button" onClick={recover}>{language === 'ru' ? 'Восстановить локальную демоверсию' : 'Recover local demo'}</button></div>;
  }
}
function PreviewHost() {
  const status = useGameHub(state => state.status);
  const snapshot = useGameHub(state => state.snapshot);
  const message = useGameHub(state => state.message);
  const [bootError, setBootError] = useState('');
  const t = useCallback((key, values) => appTranslate(language, key, values), []);
  const i18n = useMemo(() => ({ language, t }), [t]);
  useEffect(() => {
    let mounted = true;
    useGameHub.getState().loadSnapshot().catch(error => { if (mounted) setBootError(error.message || String(error)); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => {
    const onMessage = async event => {
      if (event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== 'garden-preview-sound') return;
      try { await audioManager.setEnabled(event.data.enabled === true); }
      catch (error) { console.warn('Local sound could not be enabled', error); }
      window.parent.postMessage({ type: 'garden-preview-sound-state', enabled: audioManager.isEnabled() }, window.location.origin);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  let content;
  if (bootError || (status === 'offline' && !snapshot)) content = <div className="preview-state" role="alert"><h1>{language === 'ru' ? 'Ошибка локальных данных' : 'Local data could not load'}</h1><p>{bootError || message}</p><button type="button" onClick={recover}>{language === 'ru' ? 'Восстановить демоверсию' : 'Recover local demo'}</button></div>;
  else if (!snapshot) content = <div className="preview-state" role="status">{language === 'ru' ? 'Загрузка локальной демоверсии…' : 'Loading local simulation…'}</div>;
  else content = <GardenShelfGame />;
  return <AppI18nContext.Provider value={i18n}><HudLayoutProvider gameId="garden" appVersion="LOCAL SIMULATION" buildId={GARDEN_PREVIEW_VERSION}><PreviewBoundary>{content}</PreviewBoundary></HudLayoutProvider></AppI18nContext.Provider>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<PreviewHost />);
