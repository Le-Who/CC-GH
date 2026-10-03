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
    "nav.allGames": "All games",
    "app.status.booting": "Connecting…",
    "app.status.syncing": "Updating…",
    "app.status.ready": "Connected",
    "app.status.offline": "Offline",
    "app.error.network": "No reply received. Check your connection, then refresh to check the result before trying again.",
    "app.error.timeout": "The reply is taking too long. Refresh to check the result before trying again.",
    "app.eyebrow": "Telegram Mini App",
    "app.title": "Game Hub",
    "app.loading": "Loading your games…",
    "app.player": "Player",
    "app.runtime": "VPS runtime",
    "app.loadingGame": "Loading game",
    "app.loadingGameRuntime": "Loading game…",
    "app.gameLoadErrorTitle": "The game could not load.",
    "app.gameLoadErrorBody": "Check the connection, retry, or refresh to pick up the latest app version.",
    "app.unknownGameRuntime": "This game is unavailable.",
    "app.rendererUnavailable": "The game could not display. Try reloading.",
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
    "tabs.settlement": "Town",
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
    "pause.yardIntro": "Visitors keep coming and leaving while paused.",
    "yard.cost.treats": "{count} treats",
    "yard.cost.shiny": "{count} shiny",
  },
  ru: {
    "nav.allGames": "Все игры",
    "app.status.booting": "Подключение…",
    "app.status.syncing": "Обновляем…",
    "app.status.ready": "На связи",
    "app.status.offline": "Нет связи",
    "app.error.network": "Ответ не получен. Проверьте соединение, затем обновите страницу и проверьте результат перед повторной попыткой.",
    "app.error.timeout": "Ответ задерживается. Обновите страницу и проверьте результат перед повторной попыткой.",
    "app.eyebrow": "Telegram Mini App",
    "app.title": "Game Hub",
    "app.loading": "Загрузка игрока",
    "app.player": "Игрок",
    "app.runtime": "VPS runtime",
    "app.loadingGame": "Загрузка игры",
    "app.loadingGameRuntime": "Загрузка игры…",
    "app.gameLoadErrorTitle": "Не удалось загрузить игру.",
    "app.gameLoadErrorBody": "Проверьте соединение, повторите попытку или обновите приложение до последней версии.",
    "app.unknownGameRuntime": "Эта игра недоступна.",
    "app.rendererUnavailable": "Не удалось показать игру. Обновите страницу.",
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
    "tabs.settlement": "Город",
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
    "pause.yardIntro": "Гости продолжают приходить и уходить во время паузы.",
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

// Only translate transport codes at the display boundary. Keep domain warnings
// and the original error in state/results intact for recovery and reconciliation.
export function playerFeedbackText(language, message) {
  if (message === "NETWORK_ERROR") return appTranslate(language, "app.error.network");
  if (message === "TIMEOUT") return appTranslate(language, "app.error.timeout");
  return message;
}

export const AppI18nContext = createContext({
  language: "en",
  t: (key, vars) => appTranslate("en", key, vars),
});

export function useAppI18n() {
  return useContext(AppI18nContext);
}
