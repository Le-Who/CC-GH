import { registerAppTranslations } from "../../app/i18n.jsx";

export const MATCH3_TRANSLATIONS = {
  en: {
    "pause.match3Frozen": "Paused: make a 3-gem match",
    "pause.match3Ready": "Pick a mode before the run starts",
    "pause.match3Locked": "Active runs keep their mode locked so a pause cannot change the rules by accident.",
    "pause.match3Choose": "Choose the rule set first; the pause menu will keep gameplay choices out of the active run.",
    "pause.match3NoModeChange": "Mode changes and reshuffles are locked during an active run. Start a new board if you want different rules.",
    "pause.match3Intro": "Swap neighboring gems to make 3 or more. Your mode, timer, and board resume exactly here.",
    "match3.title": "Gem Crush",
    "match3.mode.classic": "Classic",
    "match3.mode.classicHint": "30 moves",
    "match3.mode.timed": "Timed",
    "match3.mode.timedHint": "90 sec",
    "match3.mode.drop": "Star Drop",
    "match3.mode.dropHint": "Drops",
    "match3.reshuffle": "Reshuffle",
    "match3.matchEvent": "Match",
    "match3.comboEvent": "Combo x{combo}",
  },
  ru: {
    "pause.match3Frozen": "Пауза: соберите 3 камня",
    "pause.match3Ready": "Выберите режим до старта рана",
    "pause.match3Locked": "В активном ране режим заблокирован, чтобы пауза случайно не меняла правила.",
    "pause.match3Choose": "Сначала выберите правила; во время активного рана пауза уберет настройки из игры.",
    "pause.match3NoModeChange": "Смена режима и перемешивание заблокированы в активном ране. Начните новое поле, если нужны другие правила.",
    "pause.match3Intro": "Меняйте соседние камни, чтобы собрать 3 и больше. Режим, таймер и поле продолжатся ровно отсюда.",
    "match3.title": "Gem Crush",
    "match3.mode.classic": "Классика",
    "match3.mode.classicHint": "30 ходов",
    "match3.mode.timed": "На время",
    "match3.mode.timedHint": "90 сек",
    "match3.mode.drop": "Star Drop",
    "match3.mode.dropHint": "Токены",
    "match3.reshuffle": "Перемешать",
    "match3.matchEvent": "Матч",
    "match3.comboEvent": "Комбо x{combo}",
  },
};

registerAppTranslations(MATCH3_TRANSLATIONS);
