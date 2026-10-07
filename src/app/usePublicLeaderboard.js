import {useEffect, useState} from 'react';
import {api} from '../services/apiClient.js';
import {useGameHub} from '../game-state/useGameHub.js';
import {useAppI18n} from './i18n.jsx';
export function usePublicLeaderboard(path, score) {
  const {language} = useAppI18n();
  const accountSession = useGameHub(state => state.accountSession);
  const [result, setResult] = useState({accountSession, entries:[]});
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const refresh = async () => {
      const request = ++sequence;
      const isCurrent = () => active && request === sequence && useGameHub.getState().accountSession === accountSession;
      const data = await api(`${path}?lang=${language}`, undefined, {isCurrent});
      if (isCurrent()) setResult({accountSession, entries:Array.isArray(data) ? data : []});
    };
    void refresh();
    window.addEventListener('public-profile-changed', refresh);
    return () => {active = false; window.removeEventListener('public-profile-changed', refresh);};
  }, [path, score, language, accountSession]);
  return result.accountSession === accountSession ? result.entries : [];
}
