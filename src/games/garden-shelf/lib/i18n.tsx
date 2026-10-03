import { translations } from './gardenTranslations';
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  GARDEN_LANGUAGE_EVENT,
  getStoredGardenLanguage,
  setStoredGardenLanguage,
  type GardenLanguage,
} from './language';

type TranslationVars = Record<string, string | number>;

export { GARDEN_LANGUAGE_EVENT, getStoredGardenLanguage };



interface GardenI18nContextValue {
  language: GardenLanguage;
  setLanguage: (language: GardenLanguage) => void;
  t: (key: string, vars?: TranslationVars) => string;
}

const GardenI18nContext = createContext<GardenI18nContextValue | null>(null);

function interpolate(template: string, vars?: TranslationVars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(vars[key] ?? ''));
}

export function gardenTranslate(language: GardenLanguage, key: string, vars?: TranslationVars) {
  const template = translations[language][key] || translations.en[key] || key;
  return interpolate(template, vars);
}

export function GardenI18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<GardenLanguage>(() => getStoredGardenLanguage());

  const setLanguage = useCallback((nextLanguage: GardenLanguage) => {
    setLanguageState(nextLanguage);
    setStoredGardenLanguage(nextLanguage);
    window.dispatchEvent(new CustomEvent(GARDEN_LANGUAGE_EVENT, { detail: nextLanguage }));
  }, []);

  const t = useCallback(
    (key: string, vars?: TranslationVars) => gardenTranslate(language, key, vars),
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return (
    <GardenI18nContext.Provider value={value}>
      {children}
    </GardenI18nContext.Provider>
  );
}

export function useGardenI18n() {
  const context = useContext(GardenI18nContext);
  if (!context) throw new Error('useGardenI18n must be used inside GardenI18nProvider');
  return context;
}
