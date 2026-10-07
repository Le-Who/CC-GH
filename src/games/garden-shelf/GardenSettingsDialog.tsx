import {makeLivingPlantArt,supportsLivingPlant,notifyPlantTouch,getLivingPlantMotionState,LIVING_MOTION_CHANGE,listenToMotionPreference} from './living/living-plant-art.mjs';
import React, { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGardenI18n } from './lib/i18n';
import { audioManager } from '../../services/audioManager.js';
import { useUiTheme } from '../../app/uiThemeContext.js';
import { Button, Dialog } from './GardenViewShared.tsx';

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
  return <Dialog title={t('settings.title')} kind="settings" onClose={onClose}><div className="gs2-setting"><strong>{t('settings.sound')}</strong><Button disabled={busy} aria-pressed={sound} onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          setSound(await audioManager.toggle());
        } finally {
          setBusy(false);
        }
      }}>{t(sound ? 'settings.soundOn' : 'settings.soundOff')}</Button></div><fieldset className="gs2-setting"><legend>{t('settings.language')}</legend><div className="gs2-action-row">{(['en', 'ru'] as const).map(lang => <Button key={lang} aria-pressed={language === lang} primary={language === lang} onClick={() => setLanguage(lang)}>{t(lang === 'en' ? 'settings.english' : 'settings.russian')}</Button>)}</div></fieldset>{uiTheme && <fieldset className="gs2-setting"><legend>{language === 'ru' ? 'Оформление' : 'Appearance'}</legend><div className="gs2-action-row">{(['light', 'dark'] as const).map(theme => <Button key={theme} aria-pressed={uiTheme.theme === theme} primary={uiTheme.theme === theme} onClick={() => uiTheme.setTheme(theme)}>{language === 'ru' ? (theme === 'light' ? 'Светлая тема' : 'Тёмная тема') : (theme === 'light' ? 'Light theme' : 'Dark theme')}</Button>)}</div></fieldset>}<PlantMotionStatus /><Button primary onClick={onClose}>{t('settings.done')}</Button></Dialog>;
}

export default SettingsDialog;

export { SettingsDialog };
