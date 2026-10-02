import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom/client';
import TriviaGame from '../../src/games/trivia/TriviaGame.jsx';
import { HudLayoutProvider } from '../../src/app/hud-layout/HudLayoutContext.jsx';
import { AppI18nContext, appTranslate } from '../../src/app/i18n.jsx';
import { useGameHub } from '../../src/game-state/useGameHub.js';
import { audioManager } from '../../src/services/audioManager.js';
import '../../src/app/hud-layout/hud-layout.css';
import './fonts.css';
import './host.css';
import { TRIVIA_PREVIEW_VERSION } from './version.js';

const language = new URL(window.location.href).searchParams.get('lang') === 'ru' ? 'ru' : 'en';
document.documentElement.lang = language;
document.documentElement.dataset.uiTheme = 'dark';
// Deliberately bypass the app's remembered/default tab. No hub/game-router import.
useGameHub.setState({ activeTab: 'trivia', activeGameShell: null });

class PreviewBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('Trivia preview failed', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return <div className="preview-state" role="alert"><h1>{language === 'ru' ? 'Не удалось открыть Trivia' : 'Trivia could not start'}</h1><p>{String(this.state.error.message || this.state.error)}</p><button type="button" onClick={() => location.reload()}>{language === 'ru' ? 'Перезапустить локальную демоверсию' : 'Restart local demo'}</button></div>;
  }
}

function PreviewHost() {
  const activeTab = useGameHub(state => state.activeTab);
  const status = useGameHub(state => state.status);
  const snapshot = useGameHub(state => state.snapshot);
  const message = useGameHub(state => state.message);
  const [bootError, setBootError] = useState('');
  const t = useCallback((key, values) => appTranslate(language, key, values), []);
  const i18n = useMemo(() => ({ language, t }), [t]);

  useEffect(() => {
    let mounted = true;
    useGameHub.getState().loadSnapshot().catch(error => {
      if (mounted) setBootError(error.message || String(error));
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    const onMessage = async event => {
      if (event.source !== window.parent || event.origin !== window.location.origin || event.data?.type !== 'trivia-preview-sound') return;
      try { await audioManager.setEnabled(event.data.enabled === true); }
      catch (error) { console.warn('Local sound could not be enabled', error); }
      window.parent.postMessage({ type: 'trivia-preview-sound-state', enabled: audioManager.isEnabled() }, window.location.origin);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  let content;
  if (bootError || (status === 'offline' && !snapshot)) {
    content = <div className="preview-state" role="alert"><h1>{language === 'ru' ? 'Ошибка локальных данных' : 'Local data could not load'}</h1><p>{bootError || message}</p><button type="button" onClick={() => location.reload()}>{t('common.retry')}</button></div>;
  } else if (!snapshot) {
    content = <div className="preview-state" role="status">{language === 'ru' ? 'Загрузка локальной демоверсии…' : 'Loading local simulation…'}</div>;
  } else if (activeTab === 'trivia') {
    content = <TriviaGame />;
  } else {
    // useExitToHub sets activeTab to garden; render no other game in this host.
    content = <div className="preview-state"><h1>Trivia</h1><p>{language === 'ru' ? 'Локальная демоверсия. Результаты и награды смоделированы и не отправляются на сервер.' : 'Local demo. Scores and rewards are simulated and never sent to a server.'}</p><button type="button" onClick={() => location.reload()}>{language === 'ru' ? 'Начать Trivia заново' : 'Restart Trivia'}</button></div>;
  }
  return <AppI18nContext.Provider value={i18n}><HudLayoutProvider gameId="trivia" appVersion="LOCAL SIMULATION" buildId={TRIVIA_PREVIEW_VERSION}><PreviewBoundary>{content}</PreviewBoundary></HudLayoutProvider></AppI18nContext.Provider>;
}

ReactDOM.createRoot(document.getElementById('root')).render(<PreviewHost />);
