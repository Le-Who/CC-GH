import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Blocks,
  Bot,
  Gem,
  ClipboardList,
  Home,
  Leaf,
  Moon,
  PackageOpen,
  Sparkles,
  Sun,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
  X,
  Zap,
} from "lucide-react";
import { getPublicConfig } from "./services/apiClient.js";
import { installUpdateManager } from "./services/updateManager.js";
import { audioManager } from "./services/audioManager.js";
import { getTelegramUser, haptic, initTelegramPlatform } from "./platform/telegram.js";
import {
  GARDEN_LANGUAGE_EVENT,
  gardenTranslate,
  getStoredGardenLanguage,
} from "./games/garden-shelf/lib/i18n";
import { GARDEN_LEVEL_UP_EVENT, GARDEN_OPEN_QUESTS_EVENT } from "./games/garden-shelf/events";
import { LEVELS, formatGardenGoldAmount as formatGardenDisplayGold, getGardenLevelReward } from "./games/garden-shelf/constants.ts";
import { useGameHub } from "./game-state/useGameHub.js";
import { useGameEvents } from "./game-state/gameEvents.js";
import { ActiveGame, preloadGameTab } from "./app/gameChunks.jsx";
import { useSnapshot } from "./app/gameHooks.js";
import { AppI18nContext, appTranslate, useAppI18n } from "./app/i18n.jsx";
import { GAME_REGISTRY, VISIBLE_GAME_IDS } from "./app/gameRegistry.js";
import { Stat, formatCount } from "./app/shell.jsx";
import { useGameHudDescriptors } from "./app/useGameHudDescriptors.js";
import { useTelegramGameNavigation } from "./platform/useTelegramGameNavigation.js";

const TAB_ICONS = { garden: Leaf, blox: Blocks, match3: Gem, merge: PackageOpen, bubbo: Sparkles, trivia: Bot, room: Home };
const STAT_ICONS = { gold: Sparkles, energy: Zap, tokens: PackageOpen, score: Trophy, lines: Blocks, reward: Sparkles, moves: Gem, combo: Sparkles, essence: Sparkles, freeTaps: Zap, fuel: PackageOpen, shots: Sparkles, pressure: Timer, streak: Zap, time: Timer };
const TABS = VISIBLE_GAME_IDS.map((id) => ({ id, labelKey: GAME_REGISTRY[id].labelKey, icon: TAB_ICONS[id] || Sparkles }));

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

function GameEventOverlay() {
  const events = useGameEvents((state) => state.events);
  const dismissEvent = useGameEvents((state) => state.dismissEvent);

  useEffect(() => {
    if (!events.length) return undefined;
    const timers = events.map((event) => window.setTimeout(() => dismissEvent(event.id), event.ttlMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [dismissEvent, events]);

  return (
    <div className="game-event-overlay" aria-live="polite" aria-atomic="false">
      {events.map((event) => (
        <div key={event.id} className={`game-event-card tone-${event.tone}`}>
          <span>{event.title}</span>
          {event.value && <strong>{event.value}</strong>}
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const activeTab = useGameHub((state) => state.activeTab);
  const setActiveTab = useGameHub((state) => state.setActiveTab);
  const activeGameShell = useGameHub((state) => state.activeGameShell);
  const pendingActions = useGameHub((state) => state.pendingActions);
  const snapshot = useSnapshot();
  const loadSnapshot = useGameHub((state) => state.loadSnapshot);
  const hydrateOutbox = useGameHub((state) => state.hydrateOutbox);
  const drainOutbox = useGameHub((state) => state.drainOutbox);
  const applyRealtimePayload = useGameHub((state) => state.applyRealtimePayload);
  const status = useGameHub((state) => state.status);
  const message = useGameHub((state) => state.message);
  const lastResult = useGameHub((state) => state.lastResult);
  const gardenHud = useGameHub((state) => state.gardenHud);
  const [platform, setPlatform] = useState(null);
  const [config, setConfig] = useState(null);
  const [gardenLanguage, setGardenLanguage] = useState(() => getStoredGardenLanguage());
  const [uiTheme, setUiTheme] = useState(() => readStoredUiTheme());
  const [profileOpen, setProfileOpen] = useState(false);
  const [gardenLevelUpPending, setGardenLevelUpPending] = useState(false);
  const gardenLevelUpPendingRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const user = useMemo(() => getTelegramUser(), [platform]);
  const t = useCallback((key, vars) => appTranslate(gardenLanguage, key, vars), [gardenLanguage]);
  const i18nValue = useMemo(() => ({ language: gardenLanguage, t }), [gardenLanguage, t]);
  const toggleUiTheme = useCallback(() => {
    setUiTheme((value) => (value === "dark" ? "light" : "dark"));
  }, []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const exitToGarden = useCallback(() => setActiveTab("garden"), [setActiveTab]);

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
      const realtimeClient = import("./services/realtimeClient.js");
      const [platformState, publicConfig] = await Promise.all([initTelegramPlatform(), getPublicConfig()]);
      if (cancelled) return;
      setPlatform(platformState);
      setConfig(publicConfig);
      await loadSnapshot();
      await hydrateOutbox();
      drainOutbox();
      const { connectRealtime } = await realtimeClient;
      if (cancelled) return;
      const realtimeCleanup = await connectRealtime(
        (payload) => applyRealtimePayload(payload),
        (nextStatus) => {
          if (nextStatus === "offline") useGameHub.setState({ status: "offline" });
          if (nextStatus === "online") {
            useGameHub.setState({ status: "ready" });
            drainOutbox();
          }
        },
      );
      if (cancelled) realtimeCleanup();
      else cleanupRealtime = realtimeCleanup;
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
  const activeGameShellId = typeof activeGameShell === "string" ? activeGameShell : activeGameShell?.id;
  const activeGameControls = activeGameShell && typeof activeGameShell === "object" ? activeGameShell : null;
  const shellActive = activeGameShellId === activeTab;
  const gameHudDescriptors = useGameHudDescriptors(activeTab, snapshot, activeGameControls?.hudState || null);
  useTelegramGameNavigation({
    activeGame: activeTab === "garden" ? null : activeTab,
    hasOpenPanel: profileOpen || !!activeGameControls?.openPanel,
    hasActiveRun: !!activeGameControls?.activeRun,
    hasPendingActions: pendingActions.some((item) => item.status !== "failed"),
    closePanel: profileOpen ? closeProfile : activeGameControls?.closePanel,
    pauseRun: activeGameControls?.pauseRun || activeGameControls?.pause,
    exitToHub: exitToGarden,
  });
  const gardenXpRequired = Math.max(1, Number(gardenHud?.xpRequired) || 1);
  const gardenXp = Math.max(0, Number(gardenHud?.xp) || 0);
  const gardenXpProgress = Math.min(100, (gardenXp / gardenXpRequired) * 100);
  const gardenMaxLevel = LEVELS[LEVELS.length - 1]?.level ?? 1;
  const gardenLevel = Number(gardenHud?.level) || 1;
  const gardenCanLevelUp = gardenLevel < gardenMaxLevel
    && (!!gardenHud?.levelReady || gardenXp >= gardenXpRequired);
  useEffect(() => {
    if (!gardenCanLevelUp) {
      gardenLevelUpPendingRef.current = false;
      setGardenLevelUpPending(false);
    }
  }, [gardenCanLevelUp]);
  useEffect(() => {
    if (lastResult?.action === "garden.levelUp" && lastResult.error) {
      gardenLevelUpPendingRef.current = false;
      setGardenLevelUpPending(false);
    }
  }, [lastResult]);
  const requestGardenLevelUp = useCallback(() => {
    if (!gardenCanLevelUp || gardenLevelUpPendingRef.current) return;
    gardenLevelUpPendingRef.current = true;
    setGardenLevelUpPending(true);
    window.dispatchEvent(new Event(GARDEN_LEVEL_UP_EVENT));
  }, [gardenCanLevelUp]);
  const openGardenQuests = useCallback(() => {
    window.dispatchEvent(new Event(GARDEN_OPEN_QUESTS_EVENT));
  }, []);
  const profileName = user?.username || user?.firstName || user?.first_name || t("app.player");
  const profileRuntime = config?.telegramBotUsername ? `@${config.telegramBotUsername}` : t("app.runtime");
  const profileInitial = (user?.firstName || user?.first_name || user?.username || "G").slice(0, 1);
  const stats = activeTab === "garden"
    ? [
        { icon: Sparkles, label: gardenTranslate(gardenLanguage, "hud.gold"), value: formatGardenDisplayGold(Math.floor(Number(resources.gold) || 0)) },
        {
          icon: Leaf,
          label: gardenCanLevelUp ? gardenTranslate(gardenLanguage, "level.up") : gardenTranslate(gardenLanguage, "level.progress"),
          value: gardenCanLevelUp ? `+${formatGardenDisplayGold(getGardenLevelReward(gardenLevel))}` : `${Math.floor(gardenXp)}/${gardenXpRequired}`,
          progress: gardenXpProgress,
          active: gardenCanLevelUp && !gardenLevelUpPending,
          title: gardenCanLevelUp ? gardenTranslate(gardenLanguage, "level.up") : gardenTranslate(gardenLanguage, "level.progress"),
          onClick: gardenCanLevelUp && !gardenLevelUpPending ? requestGardenLevelUp : null,
          id: "garden-xp",
          dataGardenXp: true,
        },
        {
          icon: ClipboardList,
          label: gardenTranslate(gardenLanguage, "quest.title"),
          value: gardenHud?.questReadyCount > 0 ? gardenHud.questReadyCount : gardenTranslate(gardenLanguage, "quest.openShort"),
          title: gardenTranslate(gardenLanguage, "quest.open"),
          onClick: openGardenQuests,
          active: (gardenHud?.questReadyCount || 0) > 0,
        },
      ]
    : gameHudDescriptors?.length
      ? gameHudDescriptors.map((item) => ({
          icon: STAT_ICONS[item.id] || Sparkles,
          label: item.label || t(item.labelKey),
          value: item.value,
          progress: item.progress,
          id: item.id,
        }))
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
            <button
              type="button"
              className="profile-avatar-button"
              aria-label={t("app.player")}
              title={profileName}
              onClick={() => setProfileOpen(true)}
            >
              {profileInitial}
            </button>
            <ThemeToggle theme={uiTheme} onToggle={toggleUiTheme} />
            {activeTab !== "garden" && <AudioToggle />}
            <button type="button" className={`status-dot ${status}${isPending ? " pending" : ""}`} onClick={() => loadSnapshot()}>
              {status}
            </button>
          </div>
        </header>
        {profileOpen && (
          <section
            className="profile-popover"
            role="dialog"
            aria-modal="true"
            aria-label={t("app.player")}
          >
            <button type="button" className="profile-popover-scrim" aria-label={t("common.close")} onClick={closeProfile} />
            <div className="profile-popover-card">
              <button type="button" className="profile-popover-close" aria-label={t("common.close")} onClick={closeProfile}>
                <X size={18} />
              </button>
              <div className="profile-popover-avatar">{profileInitial}</div>
              <div className="profile-popover-copy">
                <strong>{profileName}</strong>
                <span>{profileRuntime}</span>
              </div>
              <div className="profile-popover-stats">
                <span>{t("common.gold")}<b>{formatCount(resources.gold || 0)}</b></span>
                <span>{t("common.energy")}<b>{energy.current ?? 0}/{energy.max ?? 0}</b></span>
                <span>{t("common.tokens")}<b>{resources.gachaTokens || 0}</b></span>
              </div>
            </div>
          </section>
        )}
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
              id={item.id}
              dataGardenXp={item.dataGardenXp}
            />
          ))}
        </section>
        <GameEventOverlay />
        {message && <button className="notice" onClick={() => useGameHub.setState({ message: "" })}>{message}</button>}
        {!snapshot ? (
          <div className="loading-panel">{t("app.loading")}</div>
        ) : (
          <section key={activeTab} className="active-game-frame">
            <ActiveGame activeTab={activeTab} />
          </section>
        )}
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
              {activeTab === id && <span className="nav-pill" aria-hidden="true" />}
              <Icon size={19} />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </nav>
      </main>
    </AppI18nContext.Provider>
  );
}
