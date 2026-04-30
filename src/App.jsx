import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  Blocks,
  Bot,
  Gem,
  Home,
  Leaf,
  Moon,
  PackageOpen,
  Sparkles,
  Sun,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { getPublicConfig } from "./services/apiClient.js";
import { installUpdateManager } from "./services/updateManager.js";
import { audioManager } from "./services/audioManager.js";
import { connectRealtime } from "./services/realtimeClient.js";
import { getTelegramUser, haptic, initTelegramPlatform } from "./platform/telegram.js";
import {
  GARDEN_LANGUAGE_EVENT,
  gardenTranslate,
  getStoredGardenLanguage,
} from "./games/garden-shelf/lib/i18n";
import { LEVELS, formatGardenGoldAmount as formatGardenDisplayGold } from "./games/garden-shelf/constants.ts";
import { useGameHub } from "./game-state/useGameHub.js";
import { ActiveGame, preloadGameTab } from "./app/gameChunks.jsx";
import { useSnapshot } from "./app/gameHooks.js";
import { AppI18nContext, appTranslate, useAppI18n } from "./app/i18n.jsx";
import { Stat, formatCount } from "./app/shell.jsx";

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
const UI_THEME_KEY = "game_hub_ui_theme";

function readStoredUiTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const value = window.localStorage.getItem(UI_THEME_KEY);
    return value === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
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

function ThemeToggle({ theme, onToggle }) {
  const { t } = useAppI18n();
  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;
  return (
    <button
      type="button"
      className={`theme-toggle ${isDark ? "dark" : "light"}`}
      aria-label={isDark ? t("theme.toggleToLight") : t("theme.toggleToDark")}
      title={isDark ? t("theme.dark") : t("theme.light")}
      onClick={onToggle}
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
  const hydrateOutbox = useGameHub((state) => state.hydrateOutbox);
  const drainOutbox = useGameHub((state) => state.drainOutbox);
  const performAction = useGameHub((state) => state.performAction);
  const applyRealtimePayload = useGameHub((state) => state.applyRealtimePayload);
  const status = useGameHub((state) => state.status);
  const message = useGameHub((state) => state.message);
  const gardenHud = useGameHub((state) => state.gardenHud);
  const [platform, setPlatform] = useState(null);
  const [config, setConfig] = useState(null);
  const [gardenLanguage, setGardenLanguage] = useState(() => getStoredGardenLanguage());
  const [uiTheme, setUiTheme] = useState(() => readStoredUiTheme());
  const [isPending, startTransition] = useTransition();
  const reduceMotion = useReducedMotion();
  const user = useMemo(() => getTelegramUser(), [platform]);
  const t = useCallback((key, vars) => appTranslate(gardenLanguage, key, vars), [gardenLanguage]);
  const i18nValue = useMemo(() => ({ language: gardenLanguage, t }), [gardenLanguage, t]);
  const toggleUiTheme = useCallback(() => {
    setUiTheme((value) => (value === "dark" ? "light" : "dark"));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.uiTheme = uiTheme;
    document.documentElement.style.colorScheme = uiTheme;
    try {
      window.localStorage.setItem(UI_THEME_KEY, uiTheme);
    } catch {
      // Best effort only; the toggle still works for the current session.
    }
  }, [uiTheme]);

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
      await hydrateOutbox();
      drainOutbox();
      cleanupRealtime = await connectRealtime(
        (payload) => applyRealtimePayload(payload),
        (nextStatus) => {
          if (nextStatus === "offline") useGameHub.setState({ status: "offline" });
          if (nextStatus === "online") {
            useGameHub.setState({ status: "ready" });
            drainOutbox();
          }
        },
      );
    }
    boot();
    return () => {
      cancelled = true;
      cleanupRealtime();
      cleanupUpdates();
    };
  }, [applyRealtimePayload, drainOutbox, hydrateOutbox, loadSnapshot]);

  useEffect(() => {
    const onResume = () => {
      if (!document.hidden) drainOutbox();
    };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, [drainOutbox]);

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
  const gardenXpRequired = Math.max(1, Number(gardenHud?.xpRequired) || 1);
  const gardenXp = Math.max(0, Number(gardenHud?.xp) || 0);
  const gardenXpProgress = Math.min(100, (gardenXp / gardenXpRequired) * 100);
  const gardenMaxLevel = LEVELS[LEVELS.length - 1]?.level ?? 1;
  const gardenCanLevelUp = (Number(gardenHud?.level) || 1) < gardenMaxLevel
    && (!!gardenHud?.levelReady || gardenXp >= gardenXpRequired);
  const stats = activeTab === "garden"
    ? [
        { icon: Sparkles, label: gardenTranslate(gardenLanguage, "hud.gold"), value: formatGardenDisplayGold(Math.floor(Number(resources.gold) || 0)) },
        {
          icon: Leaf,
          label: gardenTranslate(gardenLanguage, "level.progress"),
          value: `${Math.floor(gardenXp)}/${gardenXpRequired}`,
          progress: gardenXpProgress,
          active: gardenCanLevelUp,
          title: gardenCanLevelUp ? gardenTranslate(gardenLanguage, "level.up") : gardenTranslate(gardenLanguage, "level.progress"),
          onClick: gardenCanLevelUp
            ? () => performAction("garden.levelUp", {}, { key: `garden.levelUp.${Date.now()}`, silent: true, feedback: false, timeoutMs: 12000 })
            : null,
        },
        { icon: PackageOpen, label: gardenTranslate(gardenLanguage, "hud.plants"), value: `${gardenHud?.plants ?? 0}/${gardenHud?.slots ?? 3}` },
      ]
    : [
        { icon: Sparkles, label: t("common.gold"), value: formatCount(resources.gold || 0) },
        { icon: Zap, label: t("common.energy"), value: `${energy.current ?? 0}/${energy.max ?? 0}` },
        { icon: PackageOpen, label: t("common.tokens"), value: resources.gachaTokens || 0 },
      ];

  return (
    <AppI18nContext.Provider value={i18nValue}>
      <main
        className={`telegram-app theme-${uiTheme}${PLAY_TABS.has(activeTab) || shellActive ? " play-mode" : ""}${shellActive ? " immersive-mode" : ""}`}
        data-ui-theme={uiTheme}
      >
        <header className="topbar">
          <div>
            <p className="eyebrow">{t("app.eyebrow")}</p>
            <h1>{t("app.title")}</h1>
          </div>
          <div className="topbar-actions">
            <ThemeToggle theme={uiTheme} onToggle={toggleUiTheme} />
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
            <Stat
              key={item.label}
              icon={item.icon}
              label={item.label}
              value={item.value}
              progress={item.progress}
              onClick={item.onClick}
              active={item.active}
              title={item.title}
            />
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
              <ActiveGame activeTab={activeTab} />
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
                onFocus={() => preloadGameTab(id)}
                onPointerDown={() => preloadGameTab(id)}
                onPointerEnter={() => preloadGameTab(id)}
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
