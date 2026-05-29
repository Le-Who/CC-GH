import { registerAppTranslations } from "../../app/i18n.jsx";

export const BLOX_TRANSLATIONS = {
  en: {
    "pause.bloxFrozen": "Paused: place blocks to clear lines",
    "pause.bloxReady": "Plan the board before the first piece",
    "pause.bloxPlan": "Resume into the same board. Keep the center readable and end the run only when the reward is worth settling.",
    "pause.bloxIntro": "Place blocks from the tray. A full row or column clears for points; this exact board will resume.",
    "pause.bloxOpen": "Open cells",
    "pause.bloxTray": "Tray",
    "blox.title": "Building Blox",
    "blox.rewardLine": "Best {best} · reward {reward}",
    "blox.bestReward": "Best {best} · Reward {reward}",
    "blox.status": "Score {score} · Lines {lines}",
    "blox.clear": "CLEAR",
    "blox.invalidPlacement": "No fit",
    "blox.rotate": "Rotate",
    "blox.rotateTooltip": "Rotate selected block · {count} left",
    "blox.rotateEmpty": "No rotations left",
  },
  ru: {
    "pause.bloxFrozen": "Пауза: ставьте блоки, очищайте линии",
    "pause.bloxReady": "Спланируйте поле до первого блока",
    "pause.bloxPlan": "Возврат идет в то же поле. Держите центр читаемым и завершайте ран только когда награда стоит фиксации.",
    "pause.bloxIntro": "Размещайте блоки из лотка. Полная строка или колонка исчезает за очки; это поле продолжится с того же места.",
    "pause.bloxOpen": "Свободно",
    "pause.bloxTray": "Лоток",
    "blox.title": "Building Blox",
    "blox.rewardLine": "Рекорд {best} · награда {reward}",
    "blox.bestReward": "Рекорд {best} · Награда {reward}",
    "blox.status": "Счет {score} · Линии {lines}",
    "blox.clear": "ЧИСТО",
    "blox.invalidPlacement": "Не влезает",
    "blox.rotate": "Повернуть",
    "blox.rotateTooltip": "Повернуть выбранный блок · осталось {count}",
    "blox.rotateEmpty": "Повороты закончились",
  },
};

registerAppTranslations(BLOX_TRANSLATIONS);
