import {useEffect, useId, useRef, useState} from 'react';
import {api} from '../services/apiClient.js';
import {useGameHub} from '../game-state/useGameHub.js';
import {validateNickname} from '../../game-logic/public-profile.js';
import './profile-nickname.css';
const COPY = {
  en: { label: 'In-game nickname', help: 'Shown on leaderboards. Leave empty to use your Telegram first name. Up to 32 characters.', save: 'Save nickname', reset: 'Use first name', saving: 'Saving…', saved: 'Nickname saved', failed: 'Could not save. Try again.', loadFailed: 'Could not load your nickname. Reopen your profile to try again.', invalid: 'Use up to 32 characters without control characters.' },
  ru: { label: 'Никнейм в игре', help: 'Виден в таблицах лидеров. Оставьте пустым, чтобы использовать имя из Telegram. До 32 символов.', save: 'Сохранить никнейм', reset: 'Использовать имя', saving: 'Сохраняем…', saved: 'Никнейм сохранён', failed: 'Не удалось сохранить. Попробуйте ещё раз.', loadFailed: 'Не удалось загрузить никнейм. Откройте профиль заново.', invalid: 'До 32 символов, без управляющих символов.' },
};
export function ProfileNickname({language = 'en', accountSession, onDisplayName}) {
  const c = COPY[language] || COPY.en;
  const id = useId();
  const generation = useRef(0);
  const [nickname, setNickname] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  useEffect(() => {
    const current = ++generation.current;
    const isCurrent = () => generation.current === current && useGameHub.getState().accountSession === accountSession;
    setNickname(''); setReady(false); setBusy(false); setStatus('');
    api(`/api/profile/nickname?lang=${language}`, undefined, {isCurrent}).then(result => {
      if (!isCurrent()) return;
      if (result.error) return setStatus('loadFailed');
      setNickname(result.nickname || ''); setReady(true);
      onDisplayName?.(result.displayName);
    });
    return () => { generation.current++; };
  }, [accountSession, language, onDisplayName]);
  async function save(value) {
    if (!ready || busy) return;
    if (validateNickname(value).error) return setStatus('invalid');
    const current = generation.current;
    const isCurrent = () => generation.current === current && useGameHub.getState().accountSession === accountSession;
    setBusy(true); setStatus('');
    const result = await api(`/api/profile/nickname?lang=${language}`, {nickname:value}, {isCurrent});
    if (!isCurrent()) return;
    setBusy(false);
    if (result.error) return setStatus(result.error === 'INVALID_NICKNAME' ? 'invalid' : 'failed');
    setNickname(result.nickname || ''); setStatus('saved'); onDisplayName?.(result.displayName);
    window.dispatchEvent(new Event('public-profile-changed'));
  }
  return <form className="profile-nickname" onSubmit={event => {event.preventDefault(); void save(nickname);}}>
    <label htmlFor={id}>{c.label}</label>
    <p id={`${id}-help`}>{c.help}</p>
    <input id={id} aria-describedby={`${id}-help`} value={nickname} onChange={event => {setNickname(event.target.value); setStatus('');}} disabled={!ready || busy} autoComplete="off" spellCheck={false}/>
    <div><button type="submit" disabled={!ready || busy}>{busy ? c.saving : c.save}</button><button type="button" disabled={!ready || busy} onClick={() => void save('')}>{c.reset}</button></div>
    <p role="status" aria-live="polite">{status ? c[status] : ''}</p>
  </form>;
}
