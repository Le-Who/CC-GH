import { createContext, useContext } from "react";

const REGISTERED_TRANSLATIONS = {};

export function registerAppTranslations(translations) {
  for (const [language, values] of Object.entries(translations || {})) {
    REGISTERED_TRANSLATIONS[language] = {
      ...(REGISTERED_TRANSLATIONS[language] || {}),
      ...values,
    };
  }
}

const APP_TRANSLATIONS = {
  en: {
    "app.eyebrow": "Telegram Mini App",
    "app.title": "Game Hub",
    "app.loading": "Loading player snapshot",
    "app.player": "Player",
    "app.runtime": "VPS runtime",
    "app.loadingGame": "Loading game",
    "app.loadingGameRuntime": "Loading game runtime",
    "app.gameLoadErrorTitle": "Game assets did not finish loading.",
    "app.gameLoadErrorBody": "Check the connection, retry, or refresh to pick up the latest app version.",
    "app.unknownGameRuntime": "Unknown game runtime",
    "app.rendererUnavailable": "Renderer unavailable",
    "audio.mute": "Mute sound",
    "audio.enable": "Enable sound",
    "theme.light": "Light theme",
    "theme.dark": "Dark theme",
    "theme.toggleToLight": "Switch to light theme",
    "theme.toggleToDark": "Switch to dark theme",
    "tabs.garden": "Garden",
    "tabs.blox": "Blox",
    "tabs.gems": "Gems",
    "tabs.merge": "Merge",
    "tabs.bubbo": "Bubbo",
    "tabs.trivia": "Trivia",
    "tabs.room": "Yard",
    "tabs.farm": "Farm",
    "farm.levelShort": "Lv",
    "hud.gold": "Gold",
    "level.progress": "Garden XP",
    "level.up": "Level Up",
    "quest.open": "Garden quests",
    "quest.title": "Garden quests",
    "quest.openShort": "Open",
    "common.gold": "Gold",
    "common.energy": "Energy",
    "common.tokens": "Tokens",
    "common.score": "Score",
    "common.lines": "Lines",
    "common.cost": "Cost",
    "common.reward": "Reward",
    "common.moves": "Moves",
    "common.time": "Time",
    "common.combo": "Combo",
    "common.shots": "Shots",
    "common.pressure": "Pressure",
    "common.pause": "Pause",
    "common.resume": "Resume",
    "common.start": "Start",
    "common.restart": "Restart",
    "common.new": "New",
    "common.play": "Play",
    "common.exit": "Exit",
    "common.settle": "Settle",
    "common.end": "End",
    "common.endRun": "End Run",
    "common.back": "Back",
    "common.close": "Close",
    "common.refresh": "Refresh",
    "common.retry": "Retry",
    "common.ready": "Ready",
    "common.setup": "Setup",
    "common.leaderboard": "Leaderboard",
    "common.noScores": "No scores yet.",
    "common.best": "Best",
    "common.tap": "Tap",
    "common.questionShort": "Q",
    "pause.paused": "Paused",
    "pause.ready": "Ready",
    "pause.yardFrozen": "Yard view is frozen",
    "pause.yardIntro": "Watch visitors, collect gifts, and arrange food or goodies. Visit timers keep running on the server.",
    "yard.cost.treats": "{count} treats",
    "yard.cost.shiny": "{count} shiny",
  },
  ru: {
    "app.eyebrow": "Telegram Mini App",
    "app.title": "Game Hub",
    "app.loading": "Загрузка игрока",
    "app.player": "Игрок",
    "app.runtime": "VPS runtime",
    "app.loadingGame": "Загрузка игры",
    "app.loadingGameRuntime": "Загрузка игрового рантайма",
    "app.gameLoadErrorTitle": "Игровые ассеты не загрузились.",
    "app.gameLoadErrorBody": "Проверьте соединение, повторите попытку или обновите приложение до последней версии.",
    "app.unknownGameRuntime": "Неизвестный игровой рантайм",
    "app.rendererUnavailable": "Рендерер недоступен",
    "audio.mute": "Выключить звук",
    "audio.enable": "Включить звук",
    "theme.light": "Светлая тема",
    "theme.dark": "Темная тема",
    "theme.toggleToLight": "Переключить на светлую тему",
    "theme.toggleToDark": "Переключить на темную тему",
    "tabs.garden": "Сад",
    "tabs.blox": "Блоки",
    "tabs.gems": "Камни",
    "tabs.merge": "Слияние",
    "tabs.bubbo": "Bubbo",
    "tabs.trivia": "Викторина",
    "tabs.room": "Двор",
    "tabs.farm": "Ферма",
    "farm.levelShort": "Ур.",
    "hud.gold": "Золото",
    "level.progress": "Опыт сада",
    "level.up": "Повысить уровень",
    "quest.open": "Квесты сада",
    "quest.title": "Квесты сада",
    "quest.openShort": "Открыть",
    "common.gold": "Золото",
    "common.energy": "Энергия",
    "common.tokens": "Токены",
    "common.score": "Счет",
    "common.lines": "Линии",
    "common.cost": "Цена",
    "common.reward": "Награда",
    "common.moves": "Ходы",
    "common.time": "Время",
    "common.combo": "Комбо",
    "common.shots": "Выстрелы",
    "common.pressure": "Давление",
    "common.pause": "Пауза",
    "common.resume": "Продолжить",
    "common.start": "Старт",
    "common.restart": "Заново",
    "common.new": "Новая",
    "common.play": "Играть",
    "common.exit": "Выход",
    "common.settle": "Завершить",
    "common.end": "Конец",
    "common.endRun": "Закончить",
    "common.back": "Назад",
    "common.close": "Закрыть",
    "common.refresh": "Обновить",
    "common.retry": "Повторить",
    "common.ready": "Готов",
    "common.setup": "Настройка",
    "common.leaderboard": "Лидеры",
    "common.noScores": "Пока нет результатов.",
    "common.best": "Рекорд",
    "common.tap": "Тап",
    "common.questionShort": "В",
    "pause.paused": "Пауза",
    "pause.ready": "Готово",
    "pause.yardFrozen": "Двор остановлен на экране",
    "pause.yardIntro": "Наблюдайте за гостями, собирайте подарки и расставляйте еду или предметы. Таймеры визитов идут на сервере.",
    "yard.cost.treats": "{count} лакомств",
    "yard.cost.shiny": "{count} сияющих",
  },
};

function interpolateText(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(vars[key] ?? ""));
}

export function appTranslate(language, key, vars) {
  const template =
    APP_TRANSLATIONS[language]?.[key] ||
    REGISTERED_TRANSLATIONS[language]?.[key] ||
    APP_TRANSLATIONS.en[key] ||
    REGISTERED_TRANSLATIONS.en?.[key] ||
    key;
  return interpolateText(template, vars);
}

export const AppI18nContext = createContext({
  language: "en",
  t: (key, vars) => appTranslate("en", key, vars),
});

export function useAppI18n() {
  return useContext(AppI18nContext);
}
