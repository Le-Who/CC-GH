import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useImmersiveGame } from '../../app/gameHooks.js';
import { HomeVisibilityContext } from '../../app/homeContext.js';
import { openHome } from '../../app/homeNavigation.js';
import { useAppI18n } from '../../app/i18n.jsx';
import { HudEditableRegion, HudRegion } from '../../app/hud-layout/index.js';
import { BENTOKU_URL, connectBentokuFrame } from './bentokuBridge.js';
import { acquireGameGesture } from '../../platform/telegram.js';
import './bentoku.css';

const COPY = {
  en: { loading: 'Preparing your bento…', failed: 'Bentoku could not load. Check your connection and try again.', retry: 'Try again', reload: 'Reload Bentoku' },
  ru: { loading: 'Готовим ваше бенто…', failed: 'Не удалось загрузить Bentoku. Проверьте соединение и попробуйте ещё раз.', retry: 'Попробовать ещё раз', reload: 'Перезагрузить Bentoku' },
};

export default function BentokuGame() {
  const { language, t } = useAppI18n();
  const c = COPY[language] || COPY.en;
  const homeVisible = useContext(HomeVisibilityContext);
  const frame = useRef(null);
  const bridge = useRef(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState('loading');
  const visible = useRef(false);
  visible.current = !homeVisible && status !== 'error';
  const controls = useMemo(() => ({
    activeRun: false,
    hasPendingActions: false,
    safeLeave: async () => { bridge.current?.setVisible(false); return true; },
  }), []);
  useImmersiveGame('bentoku', true, controls);

  useEffect(() => {
    let disposed = false;
    const session = connectBentokuFrame({
      frameWindow: frame.current?.contentWindow,
      onReady: () => {
        if (disposed) return;
        window.clearTimeout(timeout);
        setStatus('ready');
      },
    });
    bridge.current = session;
    const sync = () => session.setVisible(visible.current && !document.hidden);
    const timeout = window.setTimeout(() => {
      session.setVisible(false);
      setStatus('error');
    }, 20_000);
    sync();
    session.connect();
    document.addEventListener('visibilitychange', sync);
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', sync);
      session.destroy();
      if (bridge.current === session) bridge.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    bridge.current?.setVisible(!homeVisible && !document.hidden && status !== 'error');
  }, [homeVisible, status]);

  // Cross-origin pointer events cannot bubble to the Hub's gesture controller.
  useEffect(() => {
    if (homeVisible || status !== 'ready') return undefined;
    return acquireGameGesture();
  }, [homeVisible, status]);

  const retry = () => { setStatus('loading'); setAttempt(value => value + 1); };
  return <HudRegion id="gameShell" className="bentoku-screen" data-game-shell="bentoku" data-status={status}>
    <HudRegion id="bentokuToolbar" as="header" className="bentoku-toolbar">
      <button type="button" onClick={openHome} aria-label={t('nav.allGames')}><ArrowLeft size={20}/><span>{t('nav.allGames')}</span></button>
      <h2>{t('tabs.bentoku')}</h2>
      <button type="button" onClick={retry} aria-label={c.reload}><RotateCcw size={20}/></button>
    </HudRegion>
    <HudRegion id="bentokuFrame" className="bentoku-frame">
      <iframe key={attempt} ref={frame} src={BENTOKU_URL} title={t('tabs.bentoku')}
        sandbox="allow-scripts allow-same-origin" allow="autoplay; clipboard-write"
        referrerPolicy="origin" onLoad={() => bridge.current?.connect()}
        onError={() => setStatus('error')} style={{ visibility: status === 'ready' ? 'visible' : 'hidden' }}/>
      {status !== 'ready' && <div className="bentoku-status" role={status === 'error' ? 'alert' : 'status'}>
        <HudEditableRegion id="bentokuCoverAsset" className="bentoku-cover"><img src="/games/home-thumbnails/bentoku.webp" alt="" width="120" height="120"/></HudEditableRegion>
        <p>{status === 'error' ? c.failed : c.loading}</p>
        {status === 'error' && <button type="button" onClick={retry}>{c.retry}</button>}
      </div>}
    </HudRegion>
  </HudRegion>;
}
