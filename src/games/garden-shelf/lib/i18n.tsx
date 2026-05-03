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
    'level.rewardTitle': 'Level Up',
    'level.rewardBody': 'Garden level {level} reached. Reward added:',
    'quest.open': 'Garden quests',
    'quest.title': 'Garden quests',
    'quest.subtitle': 'Complete garden goals and collect gold.',
    'quest.progress': '{current}/{target}',
    'quest.claim': 'Claim',
    'quest.claimed': 'Claimed',
    'quest.locked': 'Locked',
    'quest.openShort': 'Open',
    'quest.daily': 'Daily',
    'quest.story': 'Story',
    'quest.storySection': 'Story',
    'quest.storySubtitle': 'Permanent garden goals.',
    'quest.dailySection': 'Daily {part}/{total}',
    'quest.dailySubtitle': 'Fresh for {date}.',
    'quest.dailyLocked': 'Claim the previous portion to open this one.',
    'quest.endowed': '+{count} head start',
    'quest.firstPlant.title': 'Plant a seed',
    'quest.firstPlant.body': 'Place your first plant on the shelf.',
    'quest.maturePlant.title': 'Grow one plant',
    'quest.maturePlant.body': 'Raise any plant to its mature phase.',
    'quest.level2.title': 'Reach level 2',
    'quest.level2.body': 'Fill the XP bar and raise the garden level.',
    'quest.filledShelf.title': 'Fill a shelf',
    'quest.filledShelf.body': 'Keep three plants placed at the same time.',
    'quest.secondShelf.title': 'Open a new shelf',
    'quest.secondShelf.body': 'Unlock the second shelf for more plants.',
    'quest.daily.tap.title': 'Warm-up taps',
    'quest.daily.tap.body': 'Tap plants {target} times today.',
    'quest.daily.water.title': 'Fresh water',
    'quest.daily.water.body': 'Water growing plants {target} times today.',
    'quest.daily.tend.title': 'Tend the shelf',
    'quest.daily.tend.body': 'Tap or water plants {target} times today.',
    'quest.daily.gold.title': 'Golden harvest',
    'quest.daily.gold.body': 'Earn {target} garden gold today.',
    'quest.daily.xp.title': 'Green practice',
    'quest.daily.xp.body': 'Earn {target} garden XP today.',
    'quest.daily.plant.title': 'New sprout',
    'quest.daily.plant.body': 'Buy {target} plant for the shelf.',
    'quest.daily.upgrade.title': 'Stronger roots',
    'quest.daily.upgrade.body': 'Upgrade {target} mature plant.',
    'quest.daily.placed.title': 'Shelf check',
    'quest.daily.placed.body': 'Keep {target} plants placed on shelves.',
    'quest.daily.mature.title': 'Mature care',
    'quest.daily.mature.body': 'Have {target} mature plant on a shelf.',
    'shop.seedShop': 'Seed Shop',
    'shop.close': 'Close seed shop',
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
    'plantDetail.details': 'Plant details',
    'plantDetail.water': 'Water',
    'plantDetail.evolving': 'Evolving...',
    'plantDetail.evolve': 'Evolve Production',
    'plantDetail.previous': 'Previous plant',
    'plantDetail.next': 'Next plant',
    'plantDetail.position': 'Plant {current}/{total}',
    'label.phaseShort': 'PH',
    'label.levelShort': 'LV',
    'unit.goldPerSecond': 'G/s',
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
    'level.up': 'Повысить уровень',
    'level.rewardTitle': 'Повышение уровня',
    'level.rewardBody': 'Сад достиг уровня {level}. Награда добавлена:',
    'quest.open': 'Квесты сада',
    'quest.title': 'Квесты сада',
    'quest.subtitle': 'Выполняйте цели сада и забирайте золото.',
    'quest.progress': '{current}/{target}',
    'quest.claim': 'Забрать',
    'quest.claimed': 'Получено',
    'quest.locked': 'Закрыто',
    'quest.openShort': 'Открыть',
    'quest.daily': 'Дневной',
    'quest.story': 'Сюжетный',
    'quest.storySection': 'Сюжет',
    'quest.storySubtitle': 'Постоянные цели сада.',
    'quest.dailySection': 'Дневные {part}/{total}',
    'quest.dailySubtitle': 'Новые на {date}.',
    'quest.dailyLocked': 'Заберите предыдущую порцию, чтобы открыть эту.',
    'quest.endowed': '+{count} сразу',
    'quest.firstPlant.title': 'Посадить семя',
    'quest.firstPlant.body': 'Поставьте первое растение на полку.',
    'quest.maturePlant.title': 'Вырастить растение',
    'quest.maturePlant.body': 'Доведите любое растение до взрослой фазы.',
    'quest.level2.title': 'Достичь 2 уровня',
    'quest.level2.body': 'Заполните опыт и повысьте уровень сада.',
    'quest.filledShelf.title': 'Заполнить полку',
    'quest.filledShelf.body': 'Держите три растения на полках одновременно.',
    'quest.secondShelf.title': 'Открыть новую полку',
    'quest.secondShelf.body': 'Разблокируйте вторую полку для растений.',
    'quest.daily.tap.title': 'Разминка тапами',
    'quest.daily.tap.body': 'Тапните растения {target} раза сегодня.',
    'quest.daily.water.title': 'Свежая вода',
    'quest.daily.water.body': 'Полейте растущие растения {target} раза сегодня.',
    'quest.daily.tend.title': 'Уход за полкой',
    'quest.daily.tend.body': 'Тапните или полейте растения {target} раза сегодня.',
    'quest.daily.gold.title': 'Золотой сбор',
    'quest.daily.gold.body': 'Заработайте {target} садового золота сегодня.',
    'quest.daily.xp.title': 'Зеленая практика',
    'quest.daily.xp.body': 'Получите {target} опыта сада сегодня.',
    'quest.daily.plant.title': 'Новый росток',
    'quest.daily.plant.body': 'Купите {target} растение для полки.',
    'quest.daily.upgrade.title': 'Крепкие корни',
    'quest.daily.upgrade.body': 'Улучшите {target} взрослое растение.',
    'quest.daily.placed.title': 'Проверка полки',
    'quest.daily.placed.body': 'Держите {target} растения на полках.',
    'quest.daily.mature.title': 'Уход за взрослым',
    'quest.daily.mature.body': 'Имейте {target} взрослое растение на полке.',
    'shop.seedShop': 'Магазин семян',
    'shop.close': 'Закрыть магазин семян',
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
    'plantDetail.details': 'Детали растения',
    'plantDetail.water': 'Полить',
    'plantDetail.evolving': 'Улучшается...',
    'plantDetail.evolve': 'Улучшить доход',
    'plantDetail.previous': 'Предыдущее растение',
    'plantDetail.next': 'Следующее растение',
    'plantDetail.position': 'Растение {current}/{total}',
    'label.phaseShort': 'Ф',
    'label.levelShort': 'УР',
    'unit.goldPerSecond': 'зол./с',
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
