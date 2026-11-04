import {makeLivingPlantArt,supportsLivingPlant,notifyPlantTouch,getLivingPlantMotionState,LIVING_MOTION_CHANGE,listenToMotionPreference} from './living/living-plant-art.mjs';
import React, { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGardenI18n } from './lib/i18n';
import { audioManager } from '../../services/audioManager.js';
import { useUiTheme } from '../../app/uiThemeContext.js';
import { Button, Dialog } from './GardenViewShared.tsx';
import { Volume2, VolumeX, Sun, Moon } from 'lucide-react';
import './garden-menus.css';

function PlantMotionStatus() {
  const { t } = useGardenI18n();
  const [mode, setMode] = useState(() => getLivingPlantMotionState());
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setMode(getLivingPlantMotionState());
    document.addEventListener(LIVING_MOTION_CHANGE, update);
    const removePreferenceListener = listenToMotionPreference(media, update);
    update();
    return () => { document.removeEventListener(LIVING_MOTION_CHANGE, update); removePreferenceListener(); };
  }, []);
  if (mode === 'on' || mode === 'loading') return null;
  return <section className="gs2-motion-setting" data-garden-motion={mode}>
    <strong>{t('settings.plantMotion')}</strong><p>{t(`settings.motion.${mode}`)}</p>
  </section>;
}

function SettingsDialog({
  onClose
}: any) {
  const uiTheme = useUiTheme();
  const {
      t,
      language,
      setLanguage
    } = useGardenI18n(),
    [sound, setSound] = useState(audioManager.isEnabled()),
    [busy, setBusy] = useState(false);
  return <Dialog title={t('settings.title')} kind="settings" onClose={onClose}><div className="gs2-setting gs2-setting-inline"><strong>{t('settings.sound')}</strong><Button primary={sound} disabled={busy} aria-pressed={sound} aria-label={t(sound ? 'settings.soundOn' : 'settings.soundOff')} onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          setSound(await audioManager.toggle());
        } finally {
          setBusy(false);
        }
      }}>{sound ? <Volume2 size={18}/> : <VolumeX size={18}/>} {t(sound ? 'menu.on' : 'menu.off')}</Button></div><fieldset className="gs2-setting"><legend>{t('settings.language')}</legend><div className="gs2-action-row">{(['en', 'ru'] as const).map(lang => <Button key={lang} aria-label={t(lang === 'en' ? 'settings.english' : 'settings.russian')} aria-pressed={language === lang} primary={language === lang} onClick={() => setLanguage(lang)}>{lang === 'en' ? 'English' : 'Русский'}</Button>)}</div></fieldset>{uiTheme && <fieldset className="gs2-setting"><legend>{language === 'ru' ? 'Оформление' : 'Appearance'}</legend><div className="gs2-action-row">{(['light', 'dark'] as const).map(theme => <Button key={theme} aria-label={language === 'ru' ? (theme === 'light' ? 'Светлая тема' : 'Тёмная тема') : (theme === 'light' ? 'Light theme' : 'Dark theme')} aria-pressed={uiTheme.theme === theme} primary={uiTheme.theme === theme} onClick={() => uiTheme.setTheme(theme)}>{theme === 'light' ? <Sun size={16}/> : <Moon size={16}/>} {language === 'ru' ? (theme === 'light' ? 'Светлая' : 'Тёмная') : (theme === 'light' ? 'Light' : 'Dark')}</Button>)}</div></fieldset>}<PlantMotionStatus /><Button primary onClick={onClose}>{t('settings.done')}</Button></Dialog>;
}

export default SettingsDialog;

export { SettingsDialog };
