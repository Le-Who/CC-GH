import "./public-name-layout.css";
import {ProfileNickname} from "./ProfileNickname.jsx";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Settings, UserRound, X } from 'lucide-react';
import { VISIBLE_GAME_IDS, GAME_REGISTRY } from './gameRegistry.js';
import { useDialogFocus } from './useDialogFocus.js';
import { useEscapeDismiss } from './useDismissableLayer.js';
import './home-catalogue.css';
import { homeGameCopy } from './homeGameCopy.js';
import { HomeGameCard } from './HomeGameCard.jsx';

const COPY = {
  en: { home: 'Home', games: 'All games', back: 'Back to game', close: 'Close Home', current: 'Current game', open: 'Play', profile: 'Profile & settings', gold: 'Gold', energy: 'Energy', tokens: 'Tokens', switch: 'Finish this round?', switchBody: 'Finish your current round before opening another game.', confirm: 'Finish & open', cancel: 'Stay here', saving: 'Saving…', failed: 'Could not finish. Your game is still here. Try again.', player: 'Player', unavailable: 'Coming soon', waiting: 'Finish or check the current action in your game before switching.' },
  ru: { home: 'Главная', games: 'Все игры', back: 'Вернуться в игру', close: 'Закрыть главную', current: 'Текущая игра', open: 'Играть', profile: 'Профиль и настройки', gold: 'Золото', energy: 'Энергия', tokens: 'Жетоны', switch: 'Завершить раунд?', switchBody: 'Завершите текущий раунд перед переходом в другую игру.', confirm: 'Завершить и открыть', cancel: 'Остаться здесь', saving: 'Сохраняем…', failed: 'Не удалось завершить. Игра сохранена здесь. Попробуйте ещё раз.', player: 'Игрок', unavailable: 'Скоро', waiting: 'Перед переходом завершите или проверьте действие в текущей игре.' },
};
const UPDATE_COPY = {
  en: { short: 'Update', action: 'Update app', available: 'A new version is ready', wait: 'Finish the current round and wait for saving before updating.', busy: 'Updating…', failed: 'Could not update. Try again when your game has finished saving.', open: 'Update & open', switch: 'Update to open this game?', body: 'A new version is available. Update when you are ready to open the selected game.' },
  ru: { short: 'Обновить', action: 'Обновить приложение', available: 'Доступна новая версия', wait: 'Перед обновлением завершите текущий раунд и дождитесь сохранения.', busy: 'Обновляем…', failed: 'Не удалось обновить. Дождитесь сохранения игры и попробуйте ещё раз.', open: 'Обновить и открыть', switch: 'Обновить и открыть игру?', body: 'Доступна новая версия. Обновите приложение, когда будете готовы открыть выбранную игру.' },
};


// Intentional layout exception: a full-viewport, scrolling navigation dialog,
// not a gameplay HUD. Insets come from the shared Telegram safe-area variables.
export function HomeCatalogue({ language = 'en', t = key => key, activeTab, hasActiveRun = false, readyToSwitch = true, switching = false, error = '', onClose, onSelect, profileName, profileBotName, resources = {}, settings, unavailableGames = [], accountSession = null, appUpdate = null }) {
  const c = COPY[language] || COPY.en;
  const u = UPDATE_COPY[language] || UPDATE_COPY.en;
  const gameCopy = id => homeGameCopy(id, language, t(GAME_REGISTRY[id]?.labelKey));
  const ref = useRef(null);
  const [target, setTarget] = useState(null);
  const [publicName, setPublicName] = useState(null);
  useEffect(() => setPublicName(null), [accountSession]);
  const [previewGame, setPreviewGame] = useState(null);
  const stopPreview = useCallback(() => setPreviewGame(null), []);
  useEffect(() => {setTarget(null);setPreviewGame(null);}, [accountSession]);
  useEffect(() => { if (appUpdate?.target) setTarget(null); }, [appUpdate?.target]);
  useDialogFocus(ref);
  useEscapeDismiss(true, () => { if (!switching) appUpdate?.target ? appUpdate.cancel() : target ? setTarget(null) : onClose(); }, { priority: 100 });
  const choose = id => {
    if (switching) return;
    stopPreview();
    if (id === activeTab) return onClose();
    if (hasActiveRun) setTarget(id);
    else onSelect(id);
  };
  return <section className="home-catalogue" ref={ref} role="dialog" aria-modal="true" aria-labelledby="home-title" tabIndex={-1} data-testid="home-catalogue" aria-busy={switching}>
    <div className="home-content">
      <header className="home-header"><h1 id="home-title" className="home-wordmark">{c.home}<i aria-hidden="true" /></h1><div className="home-header-actions">{appUpdate && <button type="button" className="home-update" onClick={() => appUpdate.request()} disabled={switching || !appUpdate.ready} aria-label={u.action} title={appUpdate.ready ? u.available : u.wait}>{appUpdate.busy ? u.busy : u.short}</button>}<button type="button" className="home-icon" onClick={onClose} disabled={switching} aria-label={c.close}><X size={22}/></button></div></header>
      {appUpdate?.error && <p className="home-waiting" role="alert">{u.failed}</p>}
      <div className="home-intro">{activeTab && <button type="button" className="home-return" onClick={onClose} disabled={switching}><ArrowLeft size={17}/>{c.back}<span>{t(GAME_REGISTRY[activeTab]?.labelKey)}</span></button>}</div>
      {!readyToSwitch && !switching && <p className="home-waiting" role="status">{c.waiting}</p>}
      <h2 className="home-section-title">{c.games}<span>{VISIBLE_GAME_IDS.length}</span></h2>
      {appUpdate?.target && <div className="home-switch" role="status"><strong>{u.switch}</strong><p>{appUpdate.ready ? u.body : u.wait}</p><div><button type="button" className="home-primary" disabled={switching || !appUpdate.ready} onClick={() => appUpdate.request(appUpdate.target)}>{appUpdate.busy ? u.busy : u.open}</button><button type="button" disabled={switching} onClick={appUpdate.cancel}>{c.cancel}</button></div></div>}
      {!appUpdate?.target && (target || error) && <div className="home-switch" role={error ? 'alert' : 'status'}><strong>{error ? c.failed : switching ? c.saving : c.switch}</strong>{target && <><p>{c.switchBody}</p><div><button type="button" className="home-primary" disabled={switching || !readyToSwitch} onClick={() => onSelect(target)}>{switching ? c.saving : c.confirm}</button><button type="button" disabled={switching} onClick={() => setTarget(null)}>{c.cancel}</button></div></>}</div>}
      <nav className="home-games" aria-label={c.games}>{VISIBLE_GAME_IDS.map(id => <HomeGameCard key={id} id={id} title={gameCopy(id).title} description={unavailableGames.includes(id) ? c.unavailable : gameCopy(id).description} current={id === activeTab} currentLabel={c.current} disabled={switching || (!readyToSwitch && id !== activeTab) || unavailableGames.includes(id)} onChoose={() => choose(id)} language={language} previewActive={previewGame === id} onPreviewStart={() => setPreviewGame(id)} onPreviewStop={stopPreview}/>)}</nav>
      <details className="home-profile"><summary tabIndex={0}><UserRound size={20}/><span>{publicName || profileName || c.player}<small>{c.profile}</small></span><Settings size={18}/></summary>{profileBotName && <p className="home-bot-name">{profileBotName}</p>}<div className="home-wallet">{[[c.gold, resources.gold || 0], [c.energy, `${resources.energy?.current ?? 0}/${resources.energy?.max ?? 0}`], [c.tokens, resources.gachaTokens || 0]].map(([label, value]) => <span key={label}>{label}<strong>{value}</strong></span>)}</div><div className="home-settings">{settings}</div><ProfileNickname language={language} accountSession={accountSession} onDisplayName={setPublicName}/></details>
    </div>
  </section>;
}
