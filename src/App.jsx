import React, { createContext, useCallback, useContext, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  BadgeCheck,
  Blocks,
  Bot,
  Check,
  ChevronRight,
  Clock,
  Gem,
  Hammer,
  Home,
  Leaf,
  PackageOpen,
  Pause,
  PawPrint,
  Play,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { api, getPublicConfig } from "./services/apiClient.js";
import { installUpdateManager } from "./services/updateManager.js";
import { audioManager } from "./services/audioManager.js";
import { connectRealtime } from "./services/realtimeClient.js";
import { getTelegramUser, haptic, initTelegramPlatform } from "./platform/telegram.js";
import GardenShelfGame from "./games/garden-shelf/GardenShelfGame";
import {
  GARDEN_LANGUAGE_EVENT,
  gardenTranslate,
  getStoredGardenLanguage,
} from "./games/garden-shelf/lib/i18n";
import PixiGameHost from "./game-runtime/PixiGameHost.jsx";
import {
  buildBloxScene,
  buildBubboScene,
  buildFarmScene,
  buildMatch3Scene,
  buildMergeScene,
} from "./game-runtime/scenes.js";
import { useGameHub } from "./game-state/useGameHub.js";
import { listPositive } from "./game-state/inventory.js";
import {
  BUBBO_SHOTS,
  advanceBubboPressure,
  applyBubboShot,
  createBubboRun,
  generateBubboWave,
  getBubboRemainingCount,
  isBubboDanger,
  randomBubboColor,
} from "./game-core/bubbo/engine.js";
import {
  generateBoard,
  hasValidMoves,
  attemptMatch3Move,
  seedDropTokens,
} from "./game-core/match3/engine.js";
import { estimateMatch3CascadeLockMs } from "./game-core/match3/animation.js";
import { CROPS, ECONOMY, MERGE_CHAINS, ROOM_DECORATIONS } from "../game-logic.js";

const TABS = [
  { id: "garden", labelKey: "tabs.garden", icon: Leaf },
  { id: "blox", labelKey: "tabs.blox", icon: Blocks },
  { id: "match3", labelKey: "tabs.gems", icon: Gem },
  { id: "merge", labelKey: "tabs.merge", icon: PackageOpen },
  { id: "bubbo", labelKey: "tabs.bubbo", icon: Sparkles },
  { id: "trivia", labelKey: "tabs.trivia", icon: Bot },
  { id: "room", labelKey: "tabs.room", icon: Home },
];

const PLAY_TABS = new Set(["blox", "match3", "merge", "bubbo"]);

const MATCH3_MODES = [
  { id: "classic", labelKey: "match3.mode.classic", hintKey: "match3.mode.classicHint" },
  { id: "timed", labelKey: "match3.mode.timed", hintKey: "match3.mode.timedHint" },
  { id: "drop", labelKey: "match3.mode.drop", hintKey: "match3.mode.dropHint" },
];

const APP_TRANSLATIONS = {
  en: {
    "app.eyebrow": "Telegram Mini App",
    "app.title": "Game Hub",
    "app.loading": "Loading player snapshot",
    "app.player": "Player",
    "app.runtime": "VPS runtime",
    "audio.mute": "Mute sound",
    "audio.enable": "Enable sound",
    "tabs.garden": "Garden",
    "tabs.blox": "Blox",
    "tabs.gems": "Gems",
    "tabs.merge": "Merge",
    "tabs.bubbo": "Bubbo",
    "tabs.trivia": "Trivia",
    "tabs.room": "Room",
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
    "common.refresh": "Refresh",
    "common.ready": "Ready",
    "common.setup": "Setup",
    "common.leaderboard": "Leaderboard",
    "common.noScores": "No scores yet.",
    "common.best": "Best",
    "common.tap": "Tap",
    "common.questionShort": "Q",
    "farm.title": "Cozy Farm",
    "farm.levelShort": "Lv",
    "farm.xp": "XP",
    "farm.plots": "Plots",
    "farm.seed": "Seed",
    "farm.harvest": "Harvest",
    "farm.harvestAll": "Harvest All",
    "farm.offlineApplied": "Offline progress applied.",
    "farm.shop": "Shop",
    "farm.bag": "Bag",
    "farm.badges": "Badges",
    "farm.journal": "Journal",
    "farm.season": "Season",
    "farm.buyQuantity": "Buy quantity",
    "farm.seeds": "Seeds",
    "farm.buy": "Buy",
    "farm.buyPlot": "Buy Plot",
    "farm.fertilizer": "Fertilizer",
    "farm.setTheme": "Set theme",
    "farm.buyFor": "Buy for {cost}",
    "farm.emptyBag": "Harvest crops to fill the Bag.",
    "farm.sell": "Sell",
    "farm.feed": "Feed",
    "farm.soil": "soil",
    "farm.seedLabel": "seed",
    "farm.ready": "READY",
    "farm.uproot": "UPROOT",
    "farm.watered": "watered",
    "farm.undiscovered": "Undiscovered",
    "farm.keepFarming": "Keep farming",
    "farm.tier": "Tier",
    "farm.claimed": "claimed",
    "farm.unlocked": "unlocked",
    "farm.locked": "locked",
    "blox.title": "Building Blox",
    "blox.rewardLine": "Best {best} · reward {reward}",
    "blox.bestReward": "Best {best} · Reward {reward}",
    "blox.status": "Score {score} · Lines {lines}",
    "blox.clear": "CLEAR",
    "match3.title": "Gem Crush",
    "match3.mode.classic": "Classic",
    "match3.mode.classicHint": "30 moves",
    "match3.mode.timed": "Timed",
    "match3.mode.timedHint": "90 seconds",
    "match3.mode.drop": "Star Drop",
    "match3.mode.dropHint": "drop tokens",
    "match3.reshuffle": "Reshuffle",
    "bubbo.title": "Bubbo Bubbo",
    "bubbo.bubbles": "bubbles",
    "bubbo.newField": "New Field",
    "bubbo.runStatus": "Run Status",
    "bubbo.dangerLine": "Danger line",
    "bubbo.fieldStable": "Field stable",
    "bubbo.highScore": "high score {score}",
    "merge.title": "Gacha Merge",
    "merge.free": "Free",
    "merge.items": "Items",
    "merge.mode": "Mode",
    "merge.modeTrash": "Trash",
    "merge.modeMerge": "Merge",
    "merge.disableTrash": "Disable trash mode",
    "merge.enableTrash": "Enable trash mode",
    "merge.trash": "Trash",
    "merge.trashOn": "Trash On",
    "merge.trashOff": "Trash Off",
    "merge.stopPlay": "Stop Play",
    "merge.statusTrash": "Trash mode",
    "merge.statusMerge": "Drag/tap merge pairs",
    "merge.miss": "miss",
    "merge.coolingDown": "Cooling down",
    "merge.taps": "{count} taps",
    "merge.freeChooseFuel": "Free/choose fuel",
    "merge.gacha": "Gacha",
    "merge.thirtyTaps": "30 Taps",
    "merge.freeTaps": "free taps",
    "trivia.title": "Brain Blitz",
    "trivia.total": "Total {score} · Best streak {streak}",
    "trivia.category": "Category",
    "trivia.any": "Any",
    "trivia.difficulty": "Difficulty",
    "trivia.easy": "Easy",
    "trivia.medium": "Medium",
    "trivia.hard": "Hard",
    "trivia.all": "All",
    "trivia.solo": "Solo",
    "trivia.createDuel": "Create Duel",
    "trivia.inviteCode": "Invite code",
    "trivia.join": "Join",
    "trivia.invite": "Invite {code}",
    "trivia.status": "Status: {status}",
    "trivia.waiting": "waiting",
    "trivia.finished": "Finished",
    "trivia.result": "Result",
    "trivia.recentDuels": "Recent Duels",
    "trivia.noDuels": "No duels yet.",
    "trivia.question": "Question {current}/{total}",
    "trivia.streak": "Streak {streak}",
    "trivia.noStreak": "No streak",
    "trivia.streakLabel": "Streak",
    "trivia.fallbackCategory": "Trivia",
    "trivia.duel": "duel",
    "trivia.played": "played",
    "room.full": "Full",
    "room.happy": "Happy",
    "room.orders": "Orders",
    "room.fullness": "Fullness",
    "room.affection": "Affection",
    "room.decor": "Decor",
    "room.rename": "Rename",
    "room.inventory": "Room Inventory",
    "room.emptyInventory": "Find decorations from Merge gacha and high merges.",
    "room.ordersTitle": "Pet Orders",
    "room.generate": "Generate",
    "room.order": "{tier} order",
    "room.complete": "Complete",
    "room.decoration": "Decoration",
    "room.defaultName": "Buddy",
  },
  ru: {
    "app.eyebrow": "Telegram Mini App",
    "app.title": "Game Hub",
    "app.loading": "Загрузка игрока",
    "app.player": "Игрок",
    "app.runtime": "VPS runtime",
    "audio.mute": "Выключить звук",
    "audio.enable": "Включить звук",
    "tabs.garden": "Сад",
    "tabs.blox": "Блоки",
    "tabs.gems": "Камни",
    "tabs.merge": "Слияние",
    "tabs.bubbo": "Bubbo",
    "tabs.trivia": "Викторина",
    "tabs.room": "Комната",
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
    "common.refresh": "Обновить",
    "common.ready": "Готов",
    "common.setup": "Настройка",
    "common.leaderboard": "Лидеры",
    "common.noScores": "Пока нет результатов.",
    "common.best": "Рекорд",
    "common.tap": "Тап",
    "common.questionShort": "В",
    "farm.title": "Уютная ферма",
    "farm.levelShort": "Ур.",
    "farm.xp": "XP",
    "farm.plots": "Грядки",
    "farm.seed": "Семена",
    "farm.harvest": "Собрать",
    "farm.harvestAll": "Собрать все",
    "farm.offlineApplied": "Офлайн-прогресс применен.",
    "farm.shop": "Магазин",
    "farm.bag": "Сумка",
    "farm.badges": "Значки",
    "farm.journal": "Журнал",
    "farm.season": "Сезон",
    "farm.buyQuantity": "Количество",
    "farm.seeds": "Семян",
    "farm.buy": "Купить",
    "farm.buyPlot": "Купить грядку",
    "farm.fertilizer": "Удобрение",
    "farm.setTheme": "Выбрать тему",
    "farm.buyFor": "Купить за {cost}",
    "farm.emptyBag": "Собирайте урожай, чтобы наполнить сумку.",
    "farm.sell": "Продать",
    "farm.feed": "Кормить",
    "farm.soil": "почва",
    "farm.seedLabel": "семя",
    "farm.ready": "ГОТОВО",
    "farm.uproot": "УБРАТЬ",
    "farm.watered": "полито",
    "farm.undiscovered": "Не открыто",
    "farm.keepFarming": "Продолжайте ферму",
    "farm.tier": "Уровень",
    "farm.claimed": "получено",
    "farm.unlocked": "открыто",
    "farm.locked": "закрыто",
    "blox.title": "Building Blox",
    "blox.rewardLine": "Рекорд {best} · награда {reward}",
    "blox.bestReward": "Рекорд {best} · Награда {reward}",
    "blox.status": "Счет {score} · Линии {lines}",
    "blox.clear": "ЧИСТО",
    "match3.title": "Gem Crush",
    "match3.mode.classic": "Классика",
    "match3.mode.classicHint": "30 ходов",
    "match3.mode.timed": "На время",
    "match3.mode.timedHint": "90 секунд",
    "match3.mode.drop": "Star Drop",
    "match3.mode.dropHint": "роняйте токены",
    "match3.reshuffle": "Перемешать",
    "bubbo.title": "Bubbo Bubbo",
    "bubbo.bubbles": "шаров",
    "bubbo.newField": "Новое поле",
    "bubbo.runStatus": "Статус рана",
    "bubbo.dangerLine": "Опасная линия",
    "bubbo.fieldStable": "Поле стабильно",
    "bubbo.highScore": "рекорд {score}",
    "merge.title": "Gacha Merge",
    "merge.free": "Бесплатно",
    "merge.items": "Предметы",
    "merge.mode": "Режим",
    "merge.modeTrash": "Удаление",
    "merge.modeMerge": "Слияние",
    "merge.disableTrash": "Выключить удаление",
    "merge.enableTrash": "Включить удаление",
    "merge.trash": "Удалить",
    "merge.trashOn": "Удаление вкл.",
    "merge.trashOff": "Удаление выкл.",
    "merge.stopPlay": "Остановить",
    "merge.statusTrash": "Режим удаления",
    "merge.statusMerge": "Тяните или тапайте пары",
    "merge.miss": "мимо",
    "merge.coolingDown": "Остывает",
    "merge.taps": "{count} тапов",
    "merge.freeChooseFuel": "Бесплатно/выберите ресурс",
    "merge.gacha": "Гача",
    "merge.thirtyTaps": "30 тапов",
    "merge.freeTaps": "бесплатных тапов",
    "trivia.title": "Brain Blitz",
    "trivia.total": "Всего {score} · лучшая серия {streak}",
    "trivia.category": "Категория",
    "trivia.any": "Любая",
    "trivia.difficulty": "Сложность",
    "trivia.easy": "Легко",
    "trivia.medium": "Средне",
    "trivia.hard": "Сложно",
    "trivia.all": "Все",
    "trivia.solo": "Соло",
    "trivia.createDuel": "Создать дуэль",
    "trivia.inviteCode": "Код приглашения",
    "trivia.join": "Войти",
    "trivia.invite": "Инвайт {code}",
    "trivia.status": "Статус: {status}",
    "trivia.waiting": "ожидание",
    "trivia.finished": "Готово",
    "trivia.result": "Результат",
    "trivia.recentDuels": "Недавние дуэли",
    "trivia.noDuels": "Дуэлей пока нет.",
    "trivia.question": "Вопрос {current}/{total}",
    "trivia.streak": "Серия {streak}",
    "trivia.noStreak": "Без серии",
    "trivia.streakLabel": "Серия",
    "trivia.fallbackCategory": "Викторина",
    "trivia.duel": "дуэль",
    "trivia.played": "сыграно",
    "room.full": "Сытость",
    "room.happy": "Радость",
    "room.orders": "Заказы",
    "room.fullness": "Сытость",
    "room.affection": "Привязанность",
    "room.decor": "Декор",
    "room.rename": "Переименовать",
    "room.inventory": "Инвентарь комнаты",
    "room.emptyInventory": "Украшения выпадают из Merge gacha и высоких слияний.",
    "room.ordersTitle": "Заказы питомца",
    "room.generate": "Создать",
    "room.order": "заказ: {tier}",
    "room.complete": "Выполнить",
    "room.decoration": "Украшение",
    "room.defaultName": "Бадди",
  },
};

function interpolateText(template, vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_match, key) => String(vars[key] ?? ""));
}

function appTranslate(language, key, vars) {
  const gardenValue = gardenTranslate(language, key, vars);
  if (gardenValue !== key) return gardenValue;
  const template = APP_TRANSLATIONS[language]?.[key] || APP_TRANSLATIONS.en[key] || key;
  return interpolateText(template, vars);
}

const AppI18nContext = createContext({
  language: "en",
  t: (key, vars) => appTranslate("en", key, vars),
});

function useAppI18n() {
  return useContext(AppI18nContext);
}

function createSwappedMatch3Board(board, from, to) {
  const next = board.map((row) => [...row]);
  if (next[from.y]?.[from.x] && next[to.y]?.[to.x]) {
    [next[from.y][from.x], next[to.y][to.x]] = [next[to.y][to.x], next[from.y][from.x]];
  }
  return next;
}

function formatCount(value) {
  if (value == null) return "0";
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function PanelButton({ children, icon: Icon = Sparkles, onClick, disabled, danger, subtle, active, title }) {
  return (
    <button
      type="button"
      className={`panel-button${danger ? " danger" : ""}${subtle ? " subtle" : ""}${active ? " active" : ""}`}
      disabled={disabled}
      aria-label={title || (typeof children === "string" ? children : undefined)}
      onClick={(event) => {
        audioManager.play("tap");
        onClick?.(event);
      }}
      title={title}
    >
      <Icon size={17} />
      <span>{children}</span>
    </button>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="stat-chip">
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function useImmersiveGame(tabId, active) {
  const setActiveGameShell = useGameHub((state) => state.setActiveGameShell);
  useEffect(() => {
    setActiveGameShell(active ? tabId : null);
    return () => {
      if (useGameHub.getState().activeGameShell === tabId) {
        useGameHub.getState().setActiveGameShell(null);
      }
    };
  }, [active, setActiveGameShell, tabId]);
}

function GamePlayHud({ title, subtitle, stats = [], onPause, onFinish, finishLabel = null, extraActions = null, className = "" }) {
  const reduceMotion = useReducedMotion();
  const { t } = useAppI18n();
  return (
    <motion.div
      className={`game-play-hud ${className}`.trim()}
      initial={reduceMotion ? false : { opacity: 0, y: -14 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: "easeOut" }}
    >
      <div className="game-play-title">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <div className="game-play-stats">
        {stats.map((item) => (
          <span key={item.label}>
            {item.label} <strong>{item.value}</strong>
          </span>
        ))}
      </div>
      <div className="game-play-actions">
        {extraActions}
        <PanelButton icon={Pause} subtle onClick={onPause}>{t("common.pause")}</PanelButton>
        {onFinish && <PanelButton icon={Check} onClick={onFinish}>{finishLabel || t("common.settle")}</PanelButton>}
      </div>
    </motion.div>
  );
}

function GameShell({ gameId, phase, skin = "cycle", children, hud, overlay, overlayClassName = "" }) {
  const reduceMotion = useReducedMotion();
  return (
    <div
      className={`game-layout game-shell shell-${phase} shell-skin-${skin}`}
      data-game-shell={gameId}
    >
      {children}
      {phase === "playing" && hud}
      <AnimatePresence initial={false} mode="wait">
        {phase !== "playing" && (
          <motion.aside
            key={`${gameId}-${phase}`}
            className={`side-panel game-menu-overlay ${overlayClassName}`}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: "easeOut" }}
          >
            {overlay}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionTabs({ tabs, active, onChange }) {
  return (
    <div className="section-tabs" role="tablist">
      {tabs.map((tab) => (
        <button key={tab.id} className={active === tab.id ? "active" : ""} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function useSnapshot() {
  return useGameHub((state) => state.snapshot);
}

function useAction() {
  return useGameHub((state) => state.performAction);
}

function useExitToHub() {
  const setActiveTab = useGameHub((state) => state.setActiveTab);
  return useCallback(() => {
    setActiveTab("garden");
  }, [setActiveTab]);
}

function FarmGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const { t } = useAppI18n();
  const [farmTab, setFarmTab] = useState("shop");
  const [selectedSeed, setSelectedSeed] = useState("strawberry");
  const [buyQty, setBuyQty] = useState(1);
  const [tick, setTick] = useState(0);
  const [inShell, setInShell] = useState(false);
  const [paused, setPaused] = useState(false);
  const farm = snapshot?.farm || {};
  const inventory = snapshot?.inventory || {};
  const crops = snapshot?.meta?.crops || CROPS;
  const unlockedSeeds = farm.unlockedSeeds || ["strawberry", "blueberry"];
  const isPlaying = inShell && !paused;
  useImmersiveGame("farm", inShell);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!unlockedSeeds.includes(selectedSeed)) setSelectedSeed(unlockedSeeds[0] || "strawberry");
  }, [selectedSeed, unlockedSeeds]);

  const onPlot = useCallback(
    (plotId, plot) => {
      if (!plot) return;
      if (!plot.crop) {
        performAction("farm.plant", { plotId, cropId: selectedSeed }, { key: `farm.plot.${plotId}` });
        return;
      }
      const base = plot.effectiveGrowthTime || plot.growthTime || crops[plot.crop]?.growthTime || 60_000;
      const multiplier = plot.watered ? plot.wateringMultiplier || 0.7 : 1;
      const progress = Math.min(1, (Date.now() - (plot.plantedAt || Date.now())) / (base * multiplier));
      if (progress >= 1) {
        performAction("farm.harvest", { plotId }, { key: `farm.plot.${plotId}` });
      } else if (!plot.watered) {
        performAction("farm.water", { plotId }, { key: `farm.plot.${plotId}` });
      }
    },
    [crops, performAction, selectedSeed],
  );

  const onPlotLongPress = useCallback(
    (plotId, plot) => {
      if (!plot?.crop) return;
      performAction("farm.uproot", { plotId }, { key: `farm.uproot.${plotId}` });
    },
    [performAction],
  );

  const sceneState = useMemo(
    () => ({
      snapshot: { ...snapshot, serverTime: Date.now() + tick },
      selectedSeed,
      farmLabels: {
        soil: t("farm.soil"),
        seed: t("farm.seedLabel"),
        ready: t("farm.ready"),
        uproot: t("farm.uproot"),
        watered: t("farm.watered"),
      },
      onFarmPlot: onPlot,
      onFarmLongPress: onPlotLongPress,
    }),
    [snapshot, selectedSeed, onPlot, onPlotLongPress, tick, t],
  );

  return (
    <div className={`game-layout farm-layout${inShell ? ` game-shell ${isPlaying ? "shell-playing" : "shell-paused"}` : ""}`}>
      <PixiGameHost sceneKey="farm" buildScene={buildFarmScene} sceneState={sceneState} />
      {isPlaying && (
        <GamePlayHud
          title={t("farm.title")}
          subtitle={`${t("farm.levelShort")} ${farm.level || 1} · ${farm.xp || 0} ${t("farm.xp")} · ${crops[selectedSeed]?.name || selectedSeed}`}
          stats={[
            { label: t("common.gold"), value: formatCount(snapshot?.resources?.gold || 0) },
            { label: t("farm.plots"), value: farm.plots?.length || 0 },
            { label: t("farm.seed"), value: inventory.seeds?.[selectedSeed] || 0 },
          ]}
          onPause={() => setPaused(true)}
          onFinish={() => performAction("farm.harvestAll")}
          finishLabel={t("farm.harvest")}
        />
      )}
      <aside className={`side-panel${inShell ? " game-menu-overlay" : ""}`}>
        <div className="panel-header">
          <div>
            <strong>{t("farm.title")}</strong>
            <span>{t("farm.levelShort")} {farm.level || 1} · {farm.xp || 0} {t("farm.xp")}</span>
          </div>
          <PanelButton
            icon={Play}
            onClick={() => {
              setInShell(true);
              setPaused(false);
            }}
          >
            {inShell ? t("common.resume") : t("common.play")}
          </PanelButton>
        </div>
        {inShell && paused && (
          <div className="button-row two">
            <PanelButton icon={Play} onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
            <PanelButton
              icon={Home}
              danger
              onClick={() => {
                setPaused(false);
                setInShell(false);
              }}
            >
              {t("common.exit")}
            </PanelButton>
          </div>
        )}
        {snapshot?.offlineReport && <div className="callout">{t("farm.offlineApplied")}</div>}
        <SectionTabs
          active={farmTab}
          onChange={setFarmTab}
          tabs={[
            { id: "shop", label: t("farm.shop") },
            { id: "bag", label: t("farm.bag") },
            { id: "badges", label: t("farm.badges") },
            { id: "journal", label: t("farm.journal") },
            { id: "season", label: t("farm.season") },
          ]}
        />
        {farmTab === "shop" && (
          <div className="panel-scroll grid-list">
            <div className="quantity-row">
              <span>{t("farm.buyQuantity")}</span>
              <input type="number" min="1" max="99" value={buyQty} onChange={(e) => setBuyQty(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            {unlockedSeeds.map((cropId) => {
              const crop = crops[cropId] || {};
              return (
                <div
                  key={cropId}
                  role="button"
                  tabIndex={0}
                  className={`item-card ${selectedSeed === cropId ? "selected" : ""}`}
                  onClick={() => setSelectedSeed(cropId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedSeed(cropId);
                    }
                  }}
                >
                  <span className="item-emoji">{crop.emoji || "🌱"}</span>
                  <span>
                    <strong>{crop.name || cropId}</strong>
                    <small>{t("farm.seeds")} {inventory.seeds?.[cropId] || 0} · {crop.seedPrice || 0}g</small>
                  </span>
                  <PanelButton
                    icon={ShoppingBag}
                    onClick={(event) => {
                      event.stopPropagation();
                      performAction("farm.buySeeds", { cropId, amount: buyQty });
                    }}
                  >
                    {t("farm.buy")}
                  </PanelButton>
                </div>
              );
            })}
            <div className="button-row">
              <PanelButton icon={Check} onClick={() => performAction("farm.harvestAll")}>{t("farm.harvestAll")}</PanelButton>
              <PanelButton icon={Hammer} onClick={() => performAction("farm.buyPlot")}>{t("farm.buyPlot")}</PanelButton>
              <PanelButton icon={Zap} onClick={() => performAction("farm.activateBooster", { boosterId: "fertilizer" })}>{t("farm.fertilizer")}</PanelButton>
            </div>
            <ThemePicker />
          </div>
        )}
        {farmTab === "bag" && <BagPanel />}
        {farmTab === "badges" && <AchievementsPanel />}
        {farmTab === "journal" && <JournalPanel crops={crops} />}
        {farmTab === "season" && <SeasonPanel />}
      </aside>
    </div>
  );
}

function ThemePicker() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const { t } = useAppI18n();
  const themes = snapshot?.meta?.plotThemes || {};
  const cosmetics = snapshot?.farm?.cosmetics || {};
  return (
    <div className="theme-strip">
      {Object.values(themes).map((theme) => {
        const owned = cosmetics.ownedThemes?.includes(theme.id);
        return (
          <button
            key={theme.id}
            className={cosmetics.activePlotTheme === theme.id ? "active" : ""}
            onClick={() => performAction(owned ? "farm.setTheme" : "farm.buyTheme", { themeId: theme.id })}
            title={owned ? t("farm.setTheme") : t("farm.buyFor", { cost: theme.cost })}
          >
            <span>{theme.emoji}</span>
            <small>{theme.name}</small>
          </button>
        );
      })}
    </div>
  );
}

function BagPanel() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const { t } = useAppI18n();
  const harvested = snapshot?.inventory?.harvested || {};
  const crops = snapshot?.meta?.crops || CROPS;
  const entries = listPositive(harvested);
  return (
    <div className="panel-scroll grid-list">
      {!entries.length && <div className="empty-state">{t("farm.emptyBag")}</div>}
      {entries.map(([cropId, qty]) => {
        const crop = crops[cropId] || {};
        return (
          <div className="item-card" key={cropId}>
            <span className="item-emoji">{crop.emoji || "🌱"}</span>
            <span>
              <strong>{crop.name || cropId}</strong>
              <small>x{qty} · sell {crop.sellPrice || 0}g · feed +{crop.fullnessYield || 0}</small>
            </span>
            <PanelButton icon={Sparkles} onClick={() => performAction("farm.sellCrop", { cropId, amount: 1 })}>{t("farm.sell")}</PanelButton>
            <PanelButton icon={PawPrint} onClick={() => performAction("pet.feed", { cropId })}>{t("farm.feed")}</PanelButton>
          </div>
        );
      })}
    </div>
  );
}

function AchievementsPanel() {
  const snapshot = useSnapshot();
  const badges = snapshot?.achievements?.badges || {};
  return (
    <div className="panel-scroll badge-grid">
      {Object.values(badges).map((badge) => (
        <div key={badge.id} className={`badge-card ${badge.unlocked ? "unlocked" : ""}`}>
          <span>{badge.emoji}</span>
          <strong>{badge.name}</strong>
          <small>{badge.desc}</small>
        </div>
      ))}
    </div>
  );
}

function JournalPanel({ crops }) {
  const snapshot = useSnapshot();
  const { t } = useAppI18n();
  const discovered = new Set(snapshot?.farm?.journal?.discovered || []);
  return (
    <div className="panel-scroll grid-list">
      {Object.values(crops).map((crop) => (
        <div className={`item-card ${discovered.has(crop.id) ? "" : "locked"}`} key={crop.id}>
          <span className="item-emoji">{discovered.has(crop.id) ? crop.emoji : "?"}</span>
          <span>
            <strong>{discovered.has(crop.id) ? crop.name : t("farm.undiscovered")}</strong>
            <small>{discovered.has(crop.id) ? crop.lore : crop.unlockCondition?.label || t("farm.keepFarming")}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function SeasonPanel() {
  const snapshot = useSnapshot();
  const { t } = useAppI18n();
  const season = snapshot?.farm?.seasonPass || {};
  return (
    <div className="panel-scroll grid-list">
      <div className="progress-card">
        <strong>{season.name || t("farm.season")}</strong>
        <span>{season.xp || 0} {t("farm.xp")} · {t("farm.tier")} {(season.currentTier || 0) + 1}</span>
      </div>
      {(season.tiers || []).map((tier, index) => (
        <div key={index} className={`item-card ${tier.unlocked ? "" : "locked"}`}>
          <span className="item-emoji">{tier.unlocked ? "★" : "·"}</span>
          <span>
            <strong>{tier.label}</strong>
            <small>{tier.xp} {t("farm.xp")} · {tier.claimed ? t("farm.claimed") : tier.unlocked ? t("farm.unlocked") : t("farm.locked")}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function BloxGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const { t } = useAppI18n();
  const [selectedPiece, setSelectedPiece] = useState(-1);
  const [paused, setPaused] = useState(false);
  const saved = snapshot?.blox?.savedState || {};
  const state = {
    board: saved.board || [],
    tray: saved.tray || [],
    score: saved.score || 0,
    linesCleared: saved.linesCleared || 0,
    highScore: snapshot?.blox?.highScore || saved.highScore || 0,
    gameActive: saved.gameActive || snapshot?.blox?.activeGame || false,
  };
  const [leaders, setLeaders] = useState([]);
  const isPlaying = state.gameActive && !paused;
  useImmersiveGame("blox", true);

  useEffect(() => {
    api("/api/blox/leaderboard").then((data) => {
      if (Array.isArray(data)) setLeaders(data);
    });
  }, [state.highScore]);

  useEffect(() => {
    if (!state.gameActive) setPaused(false);
  }, [state.gameActive]);

  const onCell = useCallback(
    (row, col) => {
      if (selectedPiece < 0 || !state.gameActive) return;
      performAction("blox.place", { pieceIdx: selectedPiece, row, col }, { key: `blox.place.${selectedPiece}.${row}.${col}` }).then((result) => {
        if (!result.error) setSelectedPiece(-1);
      });
    },
    [performAction, selectedPiece, state.gameActive],
  );

  const onDrop = useCallback(
    (pieceIdx, row, col) => {
      if (pieceIdx < 0 || !state.gameActive) return Promise.resolve({ error: "inactive" });
      return performAction("blox.place", { pieceIdx, row, col }, { key: `blox.place.${pieceIdx}.${row}.${col}` }).then((result) => {
        if (!result.error) {
          setSelectedPiece(-1);
          if (result.clear?.cleared) audioManager.play("clear");
        }
        return result;
      });
    },
    [performAction, state.gameActive],
  );

  const sceneState = useMemo(
    () => ({
      blox: { ...state, gameActive: isPlaying },
      bloxStatusText: t("blox.status", { score: state.score || 0, lines: state.linesCleared || 0 }),
      bloxClearText: t("blox.clear"),
      selectedBloxPiece: selectedPiece,
      onBloxCell: onCell,
      onBloxDrop: onDrop,
      onBloxTray: setSelectedPiece,
    }),
    [state, isPlaying, selectedPiece, onCell, onDrop, t],
  );

  return (
    <GameShell
      gameId="blox"
      phase={isPlaying ? "playing" : state.gameActive ? "paused" : "menu"}
      skin="meditation"
      hud={(
        <GamePlayHud
          title={t("blox.title")}
          subtitle={t("blox.rewardLine", { best: state.highScore, reward: state.score ? Math.min(400, Math.floor(state.score * 0.35)) : 0 })}
          stats={[
            { label: t("common.score"), value: state.score || 0 },
            { label: t("common.lines"), value: state.linesCleared || 0 },
            { label: t("common.cost"), value: ECONOMY.COST_BLOX },
          ]}
          onPause={() => setPaused(true)}
          onFinish={() => {
            setPaused(true);
            performAction("blox.end", { score: state.score });
          }}
          finishLabel={t("common.end")}
        />
      )}
      overlay={(
        <>
          <div className="panel-header">
            <div>
              <strong>{t("blox.title")}</strong>
              <span>{t("blox.bestReward", { best: state.highScore, reward: state.score ? Math.min(400, Math.floor(state.score * 0.35)) : 0 })}</span>
            </div>
            <PanelButton icon={state.gameActive ? RotateCcw : Play} onClick={() => performAction("blox.start").then(() => setPaused(false))}>
              {state.gameActive ? t("common.restart") : t("common.start")}
            </PanelButton>
          </div>
          {state.gameActive && paused && (
            <div className="button-row two">
              <PanelButton icon={Play} onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
              <PanelButton icon={Check} onClick={() => performAction("blox.end", { score: state.score })}>{t("common.endRun")}</PanelButton>
            </div>
          )}
          <div className="metric-grid">
            <Stat icon={Trophy} label={t("common.score")} value={state.score || 0} />
            <Stat icon={Blocks} label={t("common.lines")} value={state.linesCleared || 0} />
            <Stat icon={Zap} label={t("common.cost")} value={ECONOMY.COST_BLOX} />
          </div>
          <div className="button-row">
            <PanelButton icon={Check} disabled={!state.gameActive} onClick={() => performAction("blox.end", { score: state.score })}>{t("common.endRun")}</PanelButton>
            <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
          </div>
          <Leaderboard entries={leaders} />
        </>
      )}
    >
      <PixiGameHost sceneKey="blox" buildScene={buildBloxScene} sceneState={sceneState} />
    </GameShell>
  );
}

function Match3Game() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const { t } = useAppI18n();
  const [mode, setMode] = useState("classic");
  const [board, setBoard] = useState(() => generateBoard());
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(30);
  const [combo, setCombo] = useState(0);
  const [gameActive, setGameActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [inputLocked, setInputLocked] = useState(false);
  const [matchAnimation, setMatchAnimation] = useState(null);
  const [leaders, setLeaders] = useState([]);
  const animationTimerRef = useRef(null);
  const isPlaying = gameActive && !paused;
  useImmersiveGame("match3", true);

  useEffect(() => {
    api("/api/leaderboard").then((data) => {
      if (Array.isArray(data)) setLeaders(data);
    });
  }, [snapshot?.match3?.highScore]);

  function createModeBoard(nextMode = mode) {
    const nextBoard = generateBoard();
    return nextMode === "drop" ? seedDropTokens(nextBoard, 3) : nextBoard;
  }

  const queueMatchAnimation = useCallback((animation, lockMs = 96) => {
    window.clearTimeout(animationTimerRef.current);
    if (lockMs > 0) setInputLocked(true);
    setMatchAnimation({
      ...animation,
      id: `${animation.type}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });
    animationTimerRef.current = window.setTimeout(() => {
      setInputLocked(false);
    }, Math.max(0, lockMs));
  }, []);

  useEffect(() => () => window.clearTimeout(animationTimerRef.current), []);

  function start(nextMode = mode) {
    const nextBoard = createModeBoard(nextMode);
    setBoard(nextBoard);
    setScore(0);
    setCombo(0);
    setMovesLeft(nextMode === "timed" ? 90 : 30);
    setGameActive(true);
    setPaused(false);
    setInputLocked(false);
    setMatchAnimation(null);
    setMode(nextMode);
    performAction("match3.start", { mode: nextMode }, { key: "match3.start" }).then(() => {
      performAction("match3.syncMode", {
        game: { score: 0, movesLeft: nextMode === "timed" ? 90 : 30, combo: 0, mode: nextMode },
        savedModes: { ...(snapshot?.match3?.savedModes || {}), [nextMode]: { board: nextBoard, score: 0, movesLeft: nextMode === "timed" ? 90 : 30, combo: 0 } },
      }, { silent: true });
    });
  }

  function finish(finalScore = score, fromQuit = false) {
    setGameActive(false);
    setPaused(false);
    setSelected(null);
    setInputLocked(false);
    performAction("match3.end", { score: finalScore, fromQuit });
  }

  function maybeEnd(nextMoves, nextScore) {
    if (nextMoves <= 0 && mode !== "timed") finish(nextScore);
  }

  useEffect(() => {
    if (!gameActive || paused || mode !== "timed") return undefined;
    if (movesLeft <= 0) {
      finish(score);
      return undefined;
    }
    const id = window.setTimeout(() => {
      setMovesLeft((value) => {
        if (value <= 1) {
          finish(score);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearTimeout(id);
  }, [gameActive, mode, movesLeft, paused, score]);

  const attemptSwap = useCallback(
    (from, to) => {
      if (!gameActive || inputLocked) return;
      const adjacent = Math.abs(from.x - to.x) + Math.abs(from.y - to.y) === 1;
      if (!adjacent) {
        setSelected(to);
        return;
      }
      const fromGem = board[from.y]?.[from.x];
      const toGem = board[to.y]?.[to.x];
      const result = attemptMatch3Move(board, from, to, { collectDrops: mode === "drop" });
      if (!result.valid) {
        setSelected(null);
        queueMatchAnimation({ type: "invalid", from, to, fromGem, toGem }, 90);
        haptic("warning");
        audioManager.play("warning");
        return;
      }
      let nextBoard = result.board;
      const nextScore = score + result.totalPoints;
      const nextMoves = mode === "timed" ? movesLeft : movesLeft - 1;
      if (!hasValidMoves(nextBoard)) {
        nextBoard = createModeBoard(mode);
      }
      const swapBoard = createSwappedMatch3Board(board, from, to);
      setBoard(nextBoard);
      setScore(nextScore);
      setCombo(Math.max(combo, result.combo));
      setMovesLeft(nextMoves);
      setSelected(null);
      queueMatchAnimation(
        { type: "cascade", from, to, fromGem, toGem, startBoard: board, swapBoard, steps: result.steps },
        estimateMatch3CascadeLockMs(result.steps.length),
      );
      haptic("success");
      audioManager.play(result.dropCollected?.length || result.combo > 1 || result.special ? "clear" : "merge");
      performAction("match3.syncMode", {
        game: { score: nextScore, movesLeft: nextMoves, combo: result.combo, mode },
        savedModes: { ...(snapshot?.match3?.savedModes || {}), [mode]: { board: nextBoard, score: nextScore, movesLeft: nextMoves, combo: result.combo } },
      }, { silent: true, key: "match3.sync" });
      maybeEnd(nextMoves, nextScore);
    },
    [board, combo, gameActive, inputLocked, mode, movesLeft, performAction, queueMatchAnimation, score, snapshot?.match3?.savedModes],
  );

  const onCell = useCallback(
    (x, y) => {
      if (!gameActive || inputLocked) return;
      if (!selected) {
        setSelected({ x, y });
        return;
      }
      attemptSwap(selected, { x, y });
    },
    [attemptSwap, gameActive, inputLocked, selected],
  );

  const sceneState = useMemo(
    () => ({
      match3: { board, score, movesLeft, combo, gameMode: mode, gameActive: isPlaying, inputLocked },
      match3StatusText: `${t(MATCH3_MODES.find((item) => item.id === mode)?.labelKey || "match3.mode.classic")} · ${score} ${t("common.score").toLowerCase()} · ${movesLeft} ${(mode === "timed" ? t("common.time") : t("common.moves")).toLowerCase()}`,
      selectedGem: selected,
      match3Animation: matchAnimation,
      onMatch3Cell: onCell,
      onMatch3Swap: attemptSwap,
      fallbackBoard: board,
    }),
    [attemptSwap, board, combo, inputLocked, isPlaying, matchAnimation, mode, movesLeft, onCell, score, selected, t],
  );

  return (
    <GameShell
      gameId="match3"
      phase={isPlaying ? "playing" : gameActive ? "paused" : "menu"}
      skin="cycle"
      hud={(
        <GamePlayHud
          title={t("match3.title")}
          subtitle={`${t(MATCH3_MODES.find((item) => item.id === mode)?.labelKey || "match3.mode.classic")} · ${t("common.best").toLowerCase()} ${snapshot?.match3?.highScore || 0}`}
          stats={[
            { label: t("common.score"), value: score },
            { label: mode === "timed" ? t("common.time") : t("common.moves"), value: movesLeft },
            { label: t("common.combo"), value: combo || "-" },
          ]}
          onPause={() => setPaused(true)}
          onFinish={() => finish(score)}
        />
      )}
      overlay={(
        <>
          <div className="panel-header">
            <div>
              <strong>{t("match3.title")}</strong>
              <span>{t("common.best")} {snapshot?.match3?.highScore || 0} · {t("common.combo")} {combo || "-"}</span>
            </div>
            <PanelButton icon={Play} onClick={() => start(mode)}>{gameActive ? t("common.new") : t("common.start")}</PanelButton>
          </div>
          {gameActive && paused && (
            <div className="button-row two">
              <PanelButton icon={Play} onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
              <PanelButton icon={Check} onClick={() => finish(score)}>{t("common.settle")}</PanelButton>
            </div>
          )}
          <div className="mode-grid">
            {MATCH3_MODES.map((item) => (
              <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>
                <strong>{t(item.labelKey)}</strong>
                <small>{t(item.hintKey)}</small>
              </button>
            ))}
          </div>
          <div className="metric-grid">
            <Stat icon={Trophy} label={t("common.score")} value={score} />
            <Stat icon={Clock} label={mode === "timed" ? t("common.time") : t("common.moves")} value={movesLeft} />
            <Stat icon={Gem} label={t("common.reward")} value={score > 0 ? Math.max(5, Math.floor(score / 25)) : 0} />
          </div>
          <div className="button-row">
            <PanelButton icon={Check} disabled={!gameActive} onClick={() => finish(score)}>{t("common.settle")}</PanelButton>
            <PanelButton icon={RotateCcw} subtle onClick={() => setBoard(createModeBoard(mode))}>{t("match3.reshuffle")}</PanelButton>
            <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
          </div>
          <Leaderboard entries={leaders} />
        </>
      )}
    >
      <PixiGameHost sceneKey="match3" buildScene={buildMatch3Scene} sceneState={sceneState} />
    </GameShell>
  );
}

function BubboGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const { t } = useAppI18n();
  const initialRun = useMemo(() => createBubboRun("local-preview"), []);
  const [board, setBoard] = useState(() => initialRun.board);
  const [seed, setSeed] = useState(initialRun.seed);
  const [waveIndex, setWaveIndex] = useState(initialRun.waveIndex);
  const [rowOffset, setRowOffset] = useState(initialRun.rowOffset || 0);
  const [pressure, setPressure] = useState(initialRun.pressure);
  const [pressureStep, setPressureStep] = useState(initialRun.pressureStep || 0);
  const [score, setScore] = useState(0);
  const [shotsLeft, setShotsLeft] = useState(BUBBO_SHOTS);
  const [gameActive, setGameActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentBubble, setCurrentBubble] = useState(() => randomBubboColor());
  const [nextBubble, setNextBubble] = useState(() => randomBubboColor());
  const [lastShot, setLastShot] = useState(null);
  const pressureClockRef = useRef(Date.now());
  const runRef = useRef({ board, seed, waveIndex, rowOffset, pressure, pressureStep, score, shotsLeft });
  const highScore = snapshot?.bubbo?.highScore || 0;
  const remainingBubbles = getBubboRemainingCount(board);
  const isPlaying = gameActive && !paused;
  useImmersiveGame("bubbo", true);

  useEffect(() => {
    runRef.current = { board, seed, waveIndex, rowOffset, pressure, pressureStep, score, shotsLeft };
  }, [board, pressure, pressureStep, rowOffset, score, seed, shotsLeft, waveIndex]);

  const start = useCallback(async () => {
    const run = createBubboRun();
    const result = await performAction("bubbo.start", {
      shotsLeft: BUBBO_SHOTS,
      board: run.board,
      seed: run.seed,
      waveIndex: run.waveIndex,
      rowOffset: run.rowOffset,
      pressure: 0,
    }, { key: "bubbo.start" });
    if (result.error) return;
    setBoard(run.board);
    setSeed(run.seed);
    setWaveIndex(run.waveIndex);
    setRowOffset(run.rowOffset || 0);
    setPressure(0);
    setPressureStep(0);
    setScore(0);
    setShotsLeft(BUBBO_SHOTS);
    setGameActive(true);
    setPaused(false);
    pressureClockRef.current = Date.now();
    setCurrentBubble(randomBubboColor(run.board));
    setNextBubble(randomBubboColor(run.board));
    setLastShot(null);
  }, [performAction]);

  const finish = useCallback(
    (finalScore = score, fromQuit = false) => {
      setGameActive(false);
      setPaused(false);
      performAction("bubbo.end", { score: finalScore, fromQuit }, { key: "bubbo.end" });
    },
    [performAction, score],
  );

  useEffect(() => {
    if (!isPlaying) {
      pressureClockRef.current = Date.now();
      return undefined;
    }
    const id = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.min(1000, Math.max(0, now - pressureClockRef.current));
      pressureClockRef.current = now;
      const current = runRef.current;
      const advanced = advanceBubboPressure(current, elapsed);
      setPressure(advanced.pressure);
      setPressureStep(advanced.pressureStep || 0);
      if (!advanced.shifts) return;
      setBoard(advanced.board);
      setWaveIndex(advanced.waveIndex);
      setRowOffset(advanced.rowOffset || 0);
      const pressureRecord = {
        id: `pressure_${now}_${advanced.waveIndex}`,
        shifted: advanced.shifts,
        popped: [],
        dropped: [],
      };
      setLastShot(pressureRecord);
      performAction("bubbo.sync", {
        game: {
          score: current.score,
          shotsLeft: current.shotsLeft,
          board: advanced.board,
          seed: advanced.seed,
          waveIndex: advanced.waveIndex,
          rowOffset: advanced.rowOffset || 0,
          pressure: advanced.pressure,
        },
      }, { silent: true, key: `bubbo.pressure.${now}` });
      if (advanced.danger || advanced.overflow) {
        finish(current.score);
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [finish, isPlaying, performAction]);

  const onFire = useCallback(
    (row, col, path = []) => {
      if (!gameActive) return;
      const result = applyBubboShot(board, currentBubble, row, col, { rowOffset });
      if (result.error) return;
      const nextScore = score + result.points;
      const nextShots = Math.max(0, shotsLeft - 1);
      const remaining = getBubboRemainingCount(result.board);
      const shotRecord = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        color: currentBubble,
        path,
        landed: result.landed,
        popped: result.popped,
        dropped: result.dropped,
      };
      setBoard(result.board);
      setScore(nextScore);
      setShotsLeft(nextShots);
      setLastShot(shotRecord);
      setCurrentBubble(nextBubble);
      setNextBubble(randomBubboColor(result.board));
      audioManager.play(result.popped.length || result.dropped.length ? "clear" : "tap");
      performAction(
        "bubbo.sync",
        { game: { score: nextScore, shotsLeft: nextShots, board: result.board, seed, waveIndex, rowOffset, pressure } },
        { silent: true, key: `bubbo.sync.${shotRecord.id}` },
      );
      if (remaining === 0 || nextShots <= 0 || isBubboDanger(result.board)) {
        finish(nextScore);
      }
    },
    [board, currentBubble, finish, gameActive, nextBubble, performAction, pressure, rowOffset, score, seed, shotsLeft, waveIndex],
  );

  const sceneState = useMemo(
    () => ({
      bubbo: {
        board,
        score,
        shotsLeft,
        gameActive: isPlaying,
        current: currentBubble,
        next: nextBubble,
        lastShot,
        pressureStep,
        seed,
        waveIndex,
        rowOffset,
        bottomHudReserve: true,
        nextPressureWave: generateBubboWave(seed, waveIndex),
        statusText: `${score} ${t("common.score").toLowerCase()} · ${shotsLeft} ${t("common.shots").toLowerCase()}`,
      },
      onBubboFire: onFire,
    }),
    [board, currentBubble, isPlaying, lastShot, nextBubble, onFire, pressureStep, rowOffset, score, seed, shotsLeft, waveIndex, t],
  );

  return (
    <div className={`game-layout game-shell bubbo-shell ${isPlaying ? "shell-playing" : gameActive ? "shell-paused" : "shell-menu"}`} data-game-shell="bubbo">
      <PixiGameHost sceneKey="bubbo" buildScene={buildBubboScene} sceneState={sceneState} />
      {isPlaying && (
        <GamePlayHud
          title={t("bubbo.title")}
          subtitle={`${t("common.best")} ${highScore} · ${remainingBubbles} ${t("bubbo.bubbles")}`}
          stats={[
            { label: t("common.score"), value: score },
            { label: t("common.shots"), value: shotsLeft },
            { label: t("common.pressure"), value: `${Math.round(pressureStep * 100)}%` },
          ]}
          onPause={() => setPaused(true)}
          onFinish={() => finish(score)}
          className="game-play-hud-bottom bubbo-play-hud"
        />
      )}
      <aside className="side-panel game-menu-overlay">
        <div className="panel-header">
          <div>
            <strong>{t("bubbo.title")}</strong>
            <span>{t("common.best")} {highScore} · {remainingBubbles} {t("bubbo.bubbles")} · {t("common.pressure").toLowerCase()} {Math.round(pressureStep * 100)}%</span>
          </div>
          <PanelButton icon={gameActive ? RotateCcw : Play} onClick={start}>
            {gameActive ? t("common.restart") : t("common.start")}
          </PanelButton>
        </div>
        {gameActive && paused && (
          <div className="button-row two">
            <PanelButton icon={Play} onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
            <PanelButton icon={Check} onClick={() => finish(score)}>{t("common.settle")}</PanelButton>
          </div>
        )}
        <div className="metric-grid">
          <Stat icon={Trophy} label={t("common.score")} value={score} />
          <Stat icon={Sparkles} label={t("common.shots")} value={shotsLeft} />
          <Stat icon={Zap} label={t("common.cost")} value={ECONOMY.COST_BUBBO} />
        </div>
        <div className="button-row">
          <PanelButton icon={Check} disabled={!gameActive} onClick={() => finish(score)}>{t("common.settle")}</PanelButton>
          <PanelButton icon={RotateCcw} subtle disabled={gameActive} onClick={() => {
            const run = createBubboRun("local-preview");
            setBoard(run.board);
            setSeed(run.seed);
            setWaveIndex(run.waveIndex);
            setRowOffset(run.rowOffset || 0);
            setPressure(0);
            setPressureStep(0);
          }}>{t("bubbo.newField")}</PanelButton>
          <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
        </div>
        <div className="leaderboard">
          <strong>{t("bubbo.runStatus")}</strong>
          <span>{isBubboDanger(board) ? t("bubbo.dangerLine") : t("bubbo.fieldStable")} · {t("bubbo.highScore", { score: highScore })}</span>
        </div>
      </aside>
    </div>
  );
}

function MergeGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const { t } = useAppI18n();
  const merge = snapshot?.merge || {};
  const inventory = snapshot?.inventory || {};
  const [selectedFuel, setSelectedFuel] = useState({});
  const [selectedCell, setSelectedCell] = useState(null);
  const [trashMode, setTrashMode] = useState(false);
  const [mergePlaying, setMergePlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const isPlaying = mergePlaying && !paused;
  useImmersiveGame("merge", true);

  const harvestedEntries = listPositive(inventory.harvested || {});
  const firstFuel = harvestedEntries[0]?.[0];

  const onMergeCell = useCallback(
    (r, c, item) => {
      if (!isPlaying) return;
      if (trashMode) {
        if (item) performAction("merge.trash", { r, c }, { key: `merge.trash.${r}.${c}` });
        return;
      }
      if (!item) {
        setSelectedCell(null);
        return;
      }
      if (!selectedCell) {
        setSelectedCell({ r, c });
        return;
      }
      if (selectedCell.r === r && selectedCell.c === c) {
        setSelectedCell(null);
        return;
      }
      performAction("merge.merge", { fromR: selectedCell.r, fromC: selectedCell.c, toR: r, toC: c }, { key: `merge.merge.${selectedCell.r}.${selectedCell.c}.${r}.${c}` }).then((result) => {
        if (!result.error) setSelectedCell(null);
      });
    },
    [isPlaying, performAction, selectedCell, trashMode],
  );

  const onMergeDrop = useCallback(
    (fromR, fromC, toR, toC, item) => {
      if (!isPlaying) return Promise.resolve({ error: "paused" });
      if (trashMode) {
        if (item) return performAction("merge.trash", { r: fromR, c: fromC }, { key: `merge.trash.${fromR}.${fromC}` });
        return Promise.resolve({ error: "empty cell" });
      }
      if (fromR === toR && fromC === toC) {
        setSelectedCell({ r: fromR, c: fromC });
        return Promise.resolve({ error: "same cell" });
      }
      return performAction("merge.merge", { fromR, fromC, toR, toC }, { key: `merge.merge.${fromR}.${fromC}.${toR}.${toC}` }).then((result) => {
        if (!result.error) {
          setSelectedCell(null);
          audioManager.play(result.roomDrop ? "gacha" : "merge");
        }
        return result;
      });
    },
    [isPlaying, performAction, trashMode],
  );

  const sceneState = useMemo(
    () => ({
      merge,
      mergeSelected: selectedCell,
      trashMode,
      mergeLocked: !isPlaying,
      mergeStatusText: trashMode ? t("merge.statusTrash") : t("merge.statusMerge"),
      mergeMissText: t("merge.miss"),
      mergeLevelPrefix: t("farm.levelShort"),
      onMergeCell,
      onMergeDrop,
    }),
    [isPlaying, merge, onMergeCell, onMergeDrop, selectedCell, trashMode, t],
  );

  return (
    <GameShell
      gameId="merge"
      phase={isPlaying ? "playing" : mergePlaying ? "paused" : "menu"}
      skin="meditation"
      overlayClassName="merge-menu-overlay"
      hud={(
        <GamePlayHud
          title={t("merge.title")}
          subtitle={`${merge.freeTapCharges || 0} ${t("merge.freeTaps")} · ${inventory.rewards?.gachaTokens || 0} ${t("common.tokens").toLowerCase()}`}
          stats={[
            { label: t("merge.free"), value: merge.freeTapCharges || 0 },
            { label: t("merge.items"), value: Object.values(merge.itemCounts || {}).reduce((sum, qty) => sum + qty, 0) },
            { label: t("merge.mode"), value: trashMode ? t("merge.modeTrash") : t("merge.modeMerge") },
          ]}
          onPause={() => setPaused(true)}
          extraActions={(
            <PanelButton
              icon={Trash2}
              danger={trashMode}
              active={trashMode}
              onClick={() => setTrashMode((value) => !value)}
              title={trashMode ? t("merge.disableTrash") : t("merge.enableTrash")}
            >
              {t("merge.trash")}
            </PanelButton>
          )}
        />
      )}
      overlay={(
        <>
          <div className="panel-header">
            <div>
              <strong>{t("merge.title")}</strong>
              <span>{merge.freeTapCharges || 0} {t("merge.freeTaps")} · {inventory.rewards?.gachaTokens || 0} {t("common.tokens").toLowerCase()}</span>
            </div>
            <PanelButton icon={mergePlaying ? Trash2 : Play} danger={mergePlaying && trashMode} active={mergePlaying && trashMode} onClick={() => {
              if (!mergePlaying) {
                setMergePlaying(true);
                setPaused(false);
              } else {
                setTrashMode((value) => !value);
              }
            }}>
              {mergePlaying ? (trashMode ? t("merge.trashOn") : t("merge.trashOff")) : t("common.play")}
            </PanelButton>
          </div>
          {mergePlaying && paused && (
            <div className="button-row two">
              <PanelButton icon={Play} onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
              <PanelButton icon={RotateCcw} subtle onClick={() => setMergePlaying(false)}>{t("merge.stopPlay")}</PanelButton>
            </div>
          )}
          <div className="generator-list">
            {(merge.generators || ["textile"]).map((chainId) => {
              const chain = MERGE_CHAINS[chainId] || {};
              const gs = merge.generatorState?.[chainId] || {};
              const fuel = selectedFuel[chainId] || firstFuel;
              const cooldown = gs.cooldownEnd > Date.now();
              return (
                <div key={chainId} className="generator-card">
                  <div>
                    <strong>{chain.emoji?.[0]} {chain.name || chainId}</strong>
                    <small>{cooldown ? t("merge.coolingDown") : t("merge.taps", { count: `${gs.tapsLeft ?? ECONOMY.GENERATOR_TAP_LIMIT}/${ECONOMY.GENERATOR_TAP_LIMIT}` })}</small>
                  </div>
                  <select value={fuel || ""} onChange={(event) => setSelectedFuel((prev) => ({ ...prev, [chainId]: event.target.value }))}>
                    <option value="">{t("merge.freeChooseFuel")}</option>
                    {harvestedEntries.map(([cropId, qty]) => (
                      <option key={cropId} value={cropId}>{CROPS[cropId]?.emoji || ""} {cropId} x{qty}</option>
                    ))}
                  </select>
                  <PanelButton
                    icon={Zap}
                    disabled={cooldown || (!fuel && !(merge.freeTapCharges > 0))}
                    onClick={() => performAction("merge.tap", { chainId, cropId: fuel }, { key: `merge.tap.${chainId}` })}
                  >
                    {t("common.tap")}
                  </PanelButton>
                </div>
              );
            })}
          </div>
          <div className="button-row merge-actions">
            <PanelButton icon={Sparkles} onClick={() => performAction("merge.gacha")}>{t("merge.gacha")}</PanelButton>
            <PanelButton icon={PackageOpen} onClick={() => performAction("merge.freePull")}>{t("merge.free")}</PanelButton>
            <PanelButton icon={Zap} onClick={() => performAction("merge.claimFreeTaps")}>{t("merge.thirtyTaps")}</PanelButton>
            <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
          </div>
          <div className="panel-scroll compact-list">
            {Object.entries(merge.itemCounts || {}).map(([itemId, qty]) => (
              <span key={itemId}>{itemId} x{qty}</span>
            ))}
          </div>
        </>
      )}
    >
      <PixiGameHost sceneKey="merge" buildScene={buildMergeScene} sceneState={sceneState} />
    </GameShell>
  );
}

function TriviaGame() {
  const snapshot = useSnapshot();
  const loadSnapshot = useGameHub((state) => state.loadSnapshot);
  const exitToHub = useExitToHub();
  const { t } = useAppI18n();
  const [view, setView] = useState("menu");
  const [question, setQuestion] = useState(null);
  const [sessionScore, setSessionScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [difficulty, setDifficulty] = useState("medium");
  const [category, setCategory] = useState("");
  const [roomId, setRoomId] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [duelStatus, setDuelStatus] = useState(null);
  const [history, setHistory] = useState([]);
  const [paused, setPaused] = useState(false);
  const inShell = view !== "menu";
  const questionActive = (view === "solo" || view === "duel-play") && question;
  const isPlaying = questionActive && !paused;
  useImmersiveGame("trivia", inShell);

  useEffect(() => {
    api("/api/trivia/duel/history").then((data) => {
      if (data?.items) setHistory(data.items);
      else if (Array.isArray(data?.history)) setHistory(data.history);
    });
  }, [view]);

  async function startSolo() {
    const data = await api("/api/trivia/start", { category, difficulty });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    setQuestion(data.question);
    setSessionScore(0);
    setStreak(0);
    setPaused(false);
    setView("solo");
    await loadSnapshot();
  }

  async function submitAnswer(answer) {
    const path = view === "duel-play" ? "/api/trivia/duel/answer" : "/api/trivia/answer";
    const data = await api(path, view === "duel-play" ? { roomId, answer, timeMs: 1200 } : { answer, timeMs: 1200 });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    setSessionScore(data.sessionScore ?? data.score ?? sessionScore);
    setStreak(data.streak || 0);
    if (data.nextQuestion) {
      setQuestion(data.nextQuestion);
    } else {
      setQuestion(null);
      setPaused(false);
      setView(data.results ? "duel-results" : "results");
      setDuelStatus(data.results || data);
      await loadSnapshot();
    }
  }

  async function createDuel() {
    const data = await api("/api/trivia/duel/create", { category, difficulty });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    setRoomId(data.roomId);
    setDuelStatus(data);
    setPaused(false);
    setView("duel-room");
  }

  async function joinDuel() {
    const data = await api("/api/trivia/duel/join", { inviteCode: joinCode.trim().toUpperCase() });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    setRoomId(data.roomId);
    setDuelStatus(data);
    setPaused(false);
    setView(data.status === "active" ? "duel-play" : "duel-room");
  }

  async function readyDuel() {
    const data = await api("/api/trivia/duel/ready", { roomId });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    await pollDuelStatus(roomId);
  }

  async function startDuel() {
    const data = await api("/api/trivia/duel/start", { roomId });
    if (data.error) {
      useGameHub.setState({ message: data.error });
      return;
    }
    setQuestion(data.question);
    setPaused(false);
    setView("duel-play");
  }

  async function pollDuelStatus(id = roomId) {
    if (!id) return;
    const data = await api(`/api/trivia/duel/status/${id}`);
    if (!data.error) setDuelStatus(data);
    if (data.status === "active") await startDuel();
  }

  return (
    <div className={`trivia-shell${inShell ? ` game-shell ${isPlaying ? "shell-playing" : "shell-paused"}` : ""}`}>
      <aside className="trivia-card">
        <div className="panel-header">
          <div>
            <strong>{t("trivia.title")}</strong>
            <span>{t("trivia.total", { score: snapshot?.trivia?.totalScore || 0, streak: snapshot?.trivia?.bestStreak || 0 })}</span>
          </div>
        </div>
        {isPlaying && (
          <GamePlayHud
            title={t("trivia.title")}
            subtitle={`${question.category || t("trivia.fallbackCategory")} · ${question.difficulty || difficulty}`}
            stats={[
              { label: t("common.score"), value: sessionScore },
              { label: t("trivia.streakLabel"), value: streak || 0 },
              { label: t("common.questionShort"), value: `${(question.index ?? 0) + 1}/${question.total || "?"}` },
            ]}
            onPause={() => setPaused(true)}
          />
        )}
        {view === "menu" && (
          <>
            <div className="form-grid">
              <label>
                {t("trivia.category")}
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={t("trivia.any")} />
              </label>
              <label>
                {t("trivia.difficulty")}
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="easy">{t("trivia.easy")}</option>
                  <option value="medium">{t("trivia.medium")}</option>
                  <option value="hard">{t("trivia.hard")}</option>
                  <option value="all">{t("trivia.all")}</option>
                </select>
              </label>
            </div>
            <div className="button-row">
              <PanelButton icon={Play} onClick={startSolo}>{t("trivia.solo")}</PanelButton>
              <PanelButton icon={Trophy} onClick={createDuel}>{t("trivia.createDuel")}</PanelButton>
            </div>
            <div className="join-row">
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder={t("trivia.inviteCode")} />
              <PanelButton icon={ChevronRight} onClick={joinDuel}>{t("trivia.join")}</PanelButton>
            </div>
          </>
        )}
        {(view === "solo" || view === "duel-play") && question && (
          <QuestionPanel question={question} score={sessionScore} streak={streak} submitAnswer={submitAnswer} />
        )}
        {view === "duel-room" && (
          <div className="duel-box">
            <strong>{t("trivia.invite", { code: duelStatus?.inviteCode || roomId })}</strong>
            <span>{t("trivia.status", { status: duelStatus?.status || t("trivia.waiting") })}</span>
            <div className="button-row">
              <PanelButton icon={Check} onClick={readyDuel}>{t("common.ready")}</PanelButton>
              <PanelButton icon={RotateCcw} onClick={() => pollDuelStatus()}>{t("common.refresh")}</PanelButton>
            </div>
          </div>
        )}
        {(view === "results" || view === "duel-results") && (
          <div className="results-box">
            <Trophy size={42} />
            <strong>{t("trivia.finished")}</strong>
            <span>{t("common.score")} {sessionScore}</span>
            <PanelButton
              icon={RotateCcw}
              onClick={() => {
                setPaused(false);
                setView("menu");
              }}
            >
              {t("common.back")}
            </PanelButton>
          </div>
        )}
      </aside>
      <aside className={`side-panel${inShell ? " game-menu-overlay" : ""}`}>
        {inShell && (
          <div className="panel-header">
            <div>
              <strong>{view === "results" || view === "duel-results" ? t("trivia.result") : t("common.pause")}</strong>
              <span>{t("common.score")} {sessionScore} · {t("trivia.streak", { streak: streak || 0 })}</span>
            </div>
          </div>
        )}
        {inShell && (
          <div className="button-row">
            {questionActive && paused && <PanelButton icon={Play} onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>}
            <PanelButton
              icon={RotateCcw}
              subtle
              onClick={() => {
                setPaused(false);
                setQuestion(null);
                setView("menu");
              }}
            >
              {t("common.setup")}
            </PanelButton>
            <PanelButton
              icon={Home}
              danger
              onClick={() => {
                setPaused(false);
                setQuestion(null);
                setView("menu");
                exitToHub();
              }}
            >
              {t("common.exit")}
            </PanelButton>
          </div>
        )}
        <strong>{t("trivia.recentDuels")}</strong>
        <div className="panel-scroll compact-list">
          {history.length ? history.map((item, index) => (
            <span key={item.roomId || index}>{item.roomId || t("trivia.duel")} · {item.status || item.result || t("trivia.played")}</span>
          )) : <span>{t("trivia.noDuels")}</span>}
        </div>
      </aside>
    </div>
  );
}

function QuestionPanel({ question, score, streak, submitAnswer }) {
  const { t } = useAppI18n();
  return (
    <div className="question-panel">
      <div className="question-meta">
        <span>{t("trivia.question", { current: (question.index ?? 0) + 1, total: question.total || "?" })}</span>
        <span>{t("common.score")} {score}</span>
        <span>{streak ? t("trivia.streak", { streak }) : t("trivia.noStreak")}</span>
      </div>
      <h2>{question.question}</h2>
      <small>{question.category} · {question.difficulty} · {question.timeLimit || 15}s</small>
      <div className="answer-grid">
        {(question.answers || []).map((answer) => (
          <button key={answer} onClick={() => submitAnswer(answer)}>
            {answer}
          </button>
        ))}
      </div>
    </div>
  );
}

function RoomGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const { t } = useAppI18n();
  const room = snapshot?.room || {};
  const pet = snapshot?.pet || {};
  const inventory = snapshot?.inventory?.roomInventory || [];
  const [selectedDeco, setSelectedDeco] = useState("");
  const [rename, setRename] = useState(pet.name || "");
  const [inShell, setInShell] = useState(false);
  const [paused, setPaused] = useState(false);
  const renameInputRef = useRef(null);
  const [optimisticName, setOptimisticName] = useOptimistic(pet.name || t("room.defaultName"));
  const [, startRenameTransition] = useTransition();
  const isPlaying = inShell && !paused;
  useImmersiveGame("room", inShell);

  useEffect(() => setRename(pet.name || ""), [pet.name]);

  const submitRename = useCallback(() => {
    const newName = (renameInputRef.current?.value || rename).trim().slice(0, 16);
    if (!newName) return;
    startRenameTransition(() => {
      setOptimisticName(newName);
      performAction("pet.rename", { newName });
    });
  }, [performAction, rename, setOptimisticName, startRenameTransition]);

  return (
    <div className={`room-layout${inShell ? ` game-shell ${isPlaying ? "shell-playing" : "shell-paused"}` : ""}`}>
      <section className="room-stage">
        <div className="room-grid">
          {Array.from({ length: 12 }, (_, index) => {
            const decoId = room.decorations?.[index];
            const deco = ROOM_DECORATIONS[decoId];
            return (
              <button
                key={index}
                className={`room-cell ${selectedDeco && !decoId ? "target" : ""}`}
                onClick={() => {
                  if (decoId) performAction("room.pickup", { decoId });
                  else if (selectedDeco) {
                    performAction("room.place", { decoId: selectedDeco }).then((result) => {
                      if (!result.error) setSelectedDeco("");
                    });
                  }
                }}
              >
                {deco ? <span>{deco.emoji}</span> : null}
              </button>
            );
          })}
        </div>
        <PetAvatar pet={pet} />
      </section>
      {isPlaying && (
        <GamePlayHud
          title={optimisticName || t("room.defaultName")}
          subtitle={`${t("farm.levelShort")} ${pet.level || 1} · ${t("room.affection").toLowerCase()} ${pet.affectionLevel || 1}`}
          stats={[
            { label: t("room.full"), value: `${pet.stats?.fullness || 0}/100` },
            { label: t("room.happy"), value: `${pet.stats?.happiness || 0}/100` },
            { label: t("room.orders"), value: pet.activeOrders?.length || 0 },
          ]}
          onPause={() => setPaused(true)}
        />
      )}
      <aside className={`side-panel${inShell ? " game-menu-overlay" : ""}`}>
        <div className="panel-header">
          <div>
            <strong>{optimisticName || t("room.defaultName")}</strong>
            <span>{t("farm.levelShort")} {pet.level || 1} · {t("room.affection")} {pet.affectionLevel || 1}</span>
          </div>
          <PanelButton
            icon={Play}
            onClick={() => {
              setInShell(true);
              setPaused(false);
            }}
          >
            {inShell ? t("common.resume") : t("common.play")}
          </PanelButton>
        </div>
        {inShell && paused && (
          <div className="button-row">
            <PanelButton icon={Play} onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
            <PanelButton
              icon={RotateCcw}
              subtle
              onClick={() => {
                setPaused(false);
                setInShell(false);
              }}
            >
              {t("room.decor")}
            </PanelButton>
            <PanelButton
              icon={Home}
              danger
              onClick={() => {
                setPaused(false);
                setInShell(false);
                exitToHub();
              }}
            >
              {t("common.exit")}
            </PanelButton>
          </div>
        )}
        <div className="metric-grid">
          <Stat icon={PawPrint} label={t("room.fullness")} value={`${pet.stats?.fullness || 0}/100`} />
          <Stat icon={Sparkles} label={t("room.happy")} value={`${pet.stats?.happiness || 0}/100`} />
          <Stat icon={BadgeCheck} label={t("room.orders")} value={pet.activeOrders?.length || 0} />
        </div>
        <div className="join-row">
          <input ref={renameInputRef} value={rename} onChange={(e) => setRename(e.target.value)} maxLength={16} />
          <PanelButton icon={Check} onClick={submitRename}>{t("room.rename")}</PanelButton>
        </div>
        <div className="ability-list">
          {["autoHarvest", "autoWater", "autoPlant"].map((id) => (
            <span key={id} className={pet.abilities?.[id] ? "unlocked" : ""}>{pet.abilities?.[id] ? "✓" : "•"} {id}</span>
          ))}
        </div>
        <strong>{t("room.inventory")}</strong>
        <div className="panel-scroll grid-list">
          {!inventory.length && <div className="empty-state">{t("room.emptyInventory")}</div>}
          {inventory.map((decoId) => {
            const deco = ROOM_DECORATIONS[decoId] || {};
            return (
              <button key={decoId} className={`item-card ${selectedDeco === decoId ? "selected" : ""}`} onClick={() => setSelectedDeco(decoId)}>
                <span className="item-emoji">{deco.emoji || "?"}</span>
                <span>
                  <strong>{deco.name || decoId}</strong>
                  <small>{deco.bonus?.desc || t("room.decoration")}</small>
                </span>
              </button>
            );
          })}
        </div>
        <QuestOrders />
      </aside>
    </div>
  );
}

function PetAvatar({ pet }) {
  const skin = pet.skinId || "basic_dog";
  const fullness = pet.stats?.fullness || 0;
  const expression = fullness >= 80 ? "ecstatic" : fullness >= 50 ? "happy" : fullness >= 20 ? "neutral" : "sad";
  return (
    <div className="pet-avatar">
      <img src={`/pets/${skin}_body.svg`} alt="" />
      <img src={`/pets/expr_${expression}.svg`} alt="" />
    </div>
  );
}

function QuestOrders() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const { t } = useAppI18n();
  const orders = snapshot?.pet?.activeOrders || [];
  const harvested = snapshot?.inventory?.harvested || {};
  const mergeItems = snapshot?.inventory?.mergeItems || {};
  return (
    <div className="quest-list">
      <div className="panel-header tight">
        <strong>{t("room.ordersTitle")}</strong>
        <PanelButton icon={RotateCcw} onClick={() => performAction("quest.generate")}>{t("room.generate")}</PanelButton>
      </div>
      {orders.map((order) => (
        <div className="order-card" key={order.id}>
          <strong>{t("room.order", { tier: order.tier })}</strong>
          {(order.requirements || []).map((req, index) => {
            const have = req.type === "crop" ? harvested[req.id] || 0 : mergeItems[req.id] || 0;
            return <small key={index}>{req.id}: {have}/{req.qty}</small>;
          })}
          <PanelButton icon={Check} onClick={() => performAction("quest.submit", { orderId: order.id })}>
            {t("room.complete")}
          </PanelButton>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({ entries }) {
  const { t } = useAppI18n();
  return (
    <div className="leaderboard">
      <strong>{t("common.leaderboard")}</strong>
      {entries?.length ? entries.slice(0, 8).map((entry) => (
        <div key={`${entry.rank}-${entry.username}`}>
          <span>#{entry.rank} {entry.username}</span>
          <strong>{entry.highScore}</strong>
        </div>
      )) : <span className="empty-state">{t("common.noScores")}</span>}
    </div>
  );
}

function ActiveGame() {
  const activeTab = useGameHub((state) => state.activeTab);
  if (activeTab === "garden") return <GardenShelfGame />;
  if (activeTab === "blox") return <BloxGame />;
  if (activeTab === "match3") return <Match3Game />;
  if (activeTab === "merge") return <MergeGame />;
  if (activeTab === "bubbo") return <BubboGame />;
  if (activeTab === "trivia") return <TriviaGame />;
  return <RoomGame />;
}

function AudioToggle() {
  const [enabled, setEnabled] = useState(audioManager.isEnabled());
  const { t } = useAppI18n();
  const Icon = enabled ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      className={`audio-toggle${enabled ? " enabled" : ""}`}
      aria-label={enabled ? t("audio.mute") : t("audio.enable")}
      onClick={async () => {
        setEnabled(await audioManager.toggle());
      }}
    >
      <Icon size={17} />
    </button>
  );
}

export default function App() {
  const activeTab = useGameHub((state) => state.activeTab);
  const setActiveTab = useGameHub((state) => state.setActiveTab);
  const activeGameShell = useGameHub((state) => state.activeGameShell);
  const snapshot = useSnapshot();
  const loadSnapshot = useGameHub((state) => state.loadSnapshot);
  const applyRealtimePayload = useGameHub((state) => state.applyRealtimePayload);
  const status = useGameHub((state) => state.status);
  const message = useGameHub((state) => state.message);
  const gardenHud = useGameHub((state) => state.gardenHud);
  const [platform, setPlatform] = useState(null);
  const [config, setConfig] = useState(null);
  const [gardenLanguage, setGardenLanguage] = useState(() => getStoredGardenLanguage());
  const [isPending, startTransition] = useTransition();
  const reduceMotion = useReducedMotion();
  const user = useMemo(() => getTelegramUser(), [platform]);
  const t = useCallback((key, vars) => appTranslate(gardenLanguage, key, vars), [gardenLanguage]);
  const i18nValue = useMemo(() => ({ language: gardenLanguage, t }), [gardenLanguage, t]);

  useEffect(() => {
    const cleanupUpdates = installUpdateManager();
    let cleanupRealtime = () => {};
    let cancelled = false;
    async function boot() {
      const [platformState, publicConfig] = await Promise.all([initTelegramPlatform(), getPublicConfig()]);
      if (cancelled) return;
      setPlatform(platformState);
      setConfig(publicConfig);
      await loadSnapshot();
      cleanupRealtime = await connectRealtime(
        (payload) => applyRealtimePayload(payload),
        (nextStatus) => {
          if (nextStatus === "offline") useGameHub.setState({ status: "offline" });
          if (nextStatus === "online") useGameHub.setState({ status: "ready" });
        },
      );
    }
    boot();
    return () => {
      cancelled = true;
      cleanupRealtime();
      cleanupUpdates();
    };
  }, [applyRealtimePayload, loadSnapshot]);

  useEffect(() => {
    const onGardenLanguageChange = () => setGardenLanguage(getStoredGardenLanguage());
    window.addEventListener(GARDEN_LANGUAGE_EVENT, onGardenLanguageChange);
    window.addEventListener("storage", onGardenLanguageChange);
    return () => {
      window.removeEventListener(GARDEN_LANGUAGE_EVENT, onGardenLanguageChange);
      window.removeEventListener("storage", onGardenLanguageChange);
    };
  }, []);

  const resources = snapshot?.resources || {};
  const energy = resources.energy || {};
  const shellActive = activeGameShell === activeTab;
  const stats = activeTab === "garden"
    ? [
        { icon: Sparkles, label: gardenTranslate(gardenLanguage, "hud.gold"), value: formatCount(Math.floor(Number(resources.gold) || 0)) },
        { icon: Leaf, label: gardenTranslate(gardenLanguage, "hud.level"), value: gardenHud?.level || 1 },
        { icon: PackageOpen, label: gardenTranslate(gardenLanguage, "hud.plants"), value: `${gardenHud?.plants ?? 0}/${gardenHud?.slots ?? 3}` },
      ]
    : [
        { icon: Sparkles, label: t("common.gold"), value: formatCount(resources.gold || 0) },
        { icon: Zap, label: t("common.energy"), value: `${energy.current ?? 0}/${energy.max ?? 0}` },
        { icon: PackageOpen, label: t("common.tokens"), value: resources.gachaTokens || 0 },
      ];

  return (
    <AppI18nContext.Provider value={i18nValue}>
      <main className={`telegram-app${PLAY_TABS.has(activeTab) || shellActive ? " play-mode" : ""}${shellActive ? " immersive-mode" : ""}`}>
        <header className="topbar">
          <div>
            <p className="eyebrow">{t("app.eyebrow")}</p>
            <h1>{t("app.title")}</h1>
          </div>
          <div className="topbar-actions">
            {activeTab !== "garden" && <AudioToggle />}
            <button type="button" className={`status-dot ${status}${isPending ? " pending" : ""}`} onClick={() => loadSnapshot()}>
              {status}
            </button>
          </div>
        </header>
        <section className="profile-strip">
          <div className="avatar">{(user?.firstName || user?.first_name || user?.username || "G").slice(0, 1)}</div>
          <div>
            <strong>{user?.username || user?.firstName || user?.first_name || t("app.player")}</strong>
            <span>{config?.telegramBotUsername ? `@${config.telegramBotUsername}` : t("app.runtime")}</span>
          </div>
        </section>
        <section className="stats-row">
          {stats.map((item) => (
            <Stat key={item.label} icon={item.icon} label={item.label} value={item.value} />
          ))}
        </section>
        {message && <button className="notice" onClick={() => useGameHub.setState({ message: "" })}>{message}</button>}
        {!snapshot ? (
          <div className="loading-panel">{t("app.loading")}</div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.section
              key={activeTab}
              className="active-game-frame"
              initial={reduceMotion ? false : { opacity: 0, x: 32 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: "easeOut" }}
            >
              <ActiveGame />
            </motion.section>
          </AnimatePresence>
        )}
        <LayoutGroup>
          <nav className="bottom-tabs">
            {TABS.map(({ id, labelKey, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className={activeTab === id ? "active" : ""}
                onClick={() => {
                  startTransition(() => setActiveTab(id));
                  haptic("light");
                  audioManager.play("tap");
                }}
              >
                {activeTab === id && !reduceMotion && (
                  <motion.span
                    className="nav-pill"
                    layoutId="nav-pill"
                    transition={{ type: "spring", stiffness: 500, damping: 31 }}
                  />
                )}
                <Icon size={19} />
                <span>{t(labelKey)}</span>
              </button>
            ))}
          </nav>
        </LayoutGroup>
      </main>
    </AppI18nContext.Provider>
  );
}
