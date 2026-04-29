import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type GardenLanguage = 'en' | 'ru';

type TranslationVars = Record<string, string | number>;

const STORAGE_KEY = 'garden_shelf_language';

export const GARDEN_LANGUAGE_EVENT = 'garden-shelf-language-change';

const translations = {
  en: {
    'garden.defaultName': 'My Garden',
    'garden.rename': 'Rename garden',
    'garden.expand': 'Expand Biosphere',
    'settings.open': 'Garden settings',
    'settings.close': 'Close settings',
    'settings.title': 'Settings',
    'settings.sound': 'Sound',
    'settings.soundOn': 'Sound on',
    'settings.soundOff': 'Sound off',
    'settings.language': 'Language',
    'settings.english': 'English',
    'settings.russian': 'Russian',
    'hud.gold': 'Gold',
    'hud.level': 'Garden Lv',
    'hud.plants': 'Plants',
    'level.progress': 'Garden XP',
    'level.up': 'Level Up',
    'shop.seedShop': 'Seed Shop',
    'shop.inventory': 'Inventory ({count})',
    'shop.yields': 'Yields {amount} G/s',
    'shop.unlockAt': 'Unlocks at Lv {level}',
    'shop.emptyInventory': 'Your inventory is empty. Long-press plants in your garden to stash them here.',
    'shop.phaseLevel': 'Phase {phase} - Lv {level}',
    'shop.place': 'Place',
    'plantDetail.mature': 'Level {level} - Mature',
    'plantDetail.growing': 'Phase {phase} - Growing',
    'plantDetail.production': 'Production',
    'plantDetail.timeLeft': 'Time Left',
    'plantDetail.tapGold': 'Tap to collect gold',
    'plantDetail.tapGrowth': 'Tap to accelerate growth',
    'plantDetail.stash': 'Stash',
    'plantDetail.water': 'Water',
    'plantDetail.evolving': 'Evolving...',
    'plantDetail.evolve': 'Evolve Production',
    'label.phaseShort': 'PH',
    'label.levelShort': 'LV',
    'offline.title': 'Welcome Back!',
    'offline.body': 'While you were away, your garden yielded:',
    'offline.xp': '+{amount} XP',
    'offline.collect': 'Collect Gold',
    'plant.daisy': 'Daisy',
    'plant.lavender': 'Lavender',
    'plant.basil': 'Basil',
    'plant.rosemary': 'Rosemary',
    'plant.monstera': 'Monstera',
    'plant.succulent': 'Succulent',
    'plant.pothos': 'Pothos',
    'plant.strawberry': 'Strawberry',
  },
  ru: {
    'garden.defaultName': 'Мой сад',
    'garden.rename': 'Переименовать сад',
    'garden.expand': 'Расширить биосферу',
    'settings.open': 'Настройки сада',
    'settings.close': 'Закрыть настройки',
    'settings.title': 'Настройки',
    'settings.sound': 'Звук',
    'settings.soundOn': 'Звук включен',
    'settings.soundOff': 'Звук выключен',
    'settings.language': 'Язык',
    'settings.english': 'Английский',
    'settings.russian': 'Русский',
    'hud.gold': 'Золото',
    'hud.level': 'Ур. сада',
    'hud.plants': 'Растения',
    'level.progress': 'Опыт сада',
    'level.up': 'Уровень',
    'shop.seedShop': 'Магазин семян',
    'shop.inventory': 'Инвентарь ({count})',
    'shop.yields': 'Даёт {amount} зол./с',
    'shop.unlockAt': 'Откроется на ур. {level}',
    'shop.emptyInventory': 'Инвентарь пуст. Удерживайте растение в саду, чтобы убрать его на склад.',
    'shop.phaseLevel': 'Фаза {phase} - ур. {level}',
    'shop.place': 'Поставить',
    'plantDetail.mature': 'Уровень {level} - взрослое',
    'plantDetail.growing': 'Фаза {phase} - растёт',
    'plantDetail.production': 'Доход',
    'plantDetail.timeLeft': 'Осталось',
    'plantDetail.tapGold': 'Тапайте, чтобы собрать золото',
    'plantDetail.tapGrowth': 'Тапайте, чтобы ускорить рост',
    'plantDetail.stash': 'В склад',
    'plantDetail.water': 'Полить',
    'plantDetail.evolving': 'Улучшается...',
    'plantDetail.evolve': 'Улучшить доход',
    'label.phaseShort': 'Ф',
    'label.levelShort': 'УР',
    'offline.title': 'С возвращением!',
    'offline.body': 'Пока вас не было, сад принёс:',
    'offline.xp': '+{amount} XP',
    'offline.collect': 'Забрать золото',
    'plant.daisy': 'Маргаритка',
    'plant.lavender': 'Лаванда',
    'plant.basil': 'Базилик',
    'plant.rosemary': 'Розмарин',
    'plant.monstera': 'Монстера',
    'plant.succulent': 'Суккулент',
    'plant.pothos': 'Потос',
    'plant.strawberry': 'Клубника',
  },
} satisfies Record<GardenLanguage, Record<string, string>>;

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

export function getStoredGardenLanguage(): GardenLanguage {
  if (typeof window === 'undefined') return 'en';
  return window.localStorage.getItem(STORAGE_KEY) === 'ru' ? 'ru' : 'en';
}

export function gardenTranslate(language: GardenLanguage, key: string, vars?: TranslationVars) {
  const template = translations[language][key] || translations.en[key] || key;
  return interpolate(template, vars);
}

export function GardenI18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<GardenLanguage>(() => getStoredGardenLanguage());

  const setLanguage = useCallback((nextLanguage: GardenLanguage) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem(STORAGE_KEY, nextLanguage);
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
