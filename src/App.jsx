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
  getStoredGardenLanguage,
} from "./games/garden-shelf/lib/language";
import { GARDEN_LEVEL_UP_EVENT, GARDEN_OPEN_QUESTS_EVENT } from "./games/garden-shelf/events";
import { formatGardenGoldAmount as formatGardenDisplayGold, getGardenLevelReward } from "./games/garden-shelf/constants.ts";
import { useGameHub } from "./game-state/useGameHub.js";
import { useGameEvents } from "./game-state/gameEvents.js";
import { ActiveGame, preloadGameTab } from "./app/gameChunks.jsx";
import { useSnapshot } from "./app/gameHooks.js";
import { AppI18nContext, appTranslate, useAppI18n } from "./app/i18n.jsx";
import { GAME_REGISTRY, VISIBLE_GAME_IDS } from "./app/gameRegistry.js";
import { Stat, formatCount } from "./app/shell.jsx";
import { useGameHudDescriptors } from "./app/useGameHudDescriptors.js";
import { useEscapeDismiss } from "./app/useDismissableLayer.js";
import { useTelegramGameNavigation } from "./platform/useTelegramGameNavigation.js";
import { HudEditableRegion, HudLayoutProvider, HudPreviewSurface, HudRegion } from "./app/hud-layout/index.js";
import { HudEditorOverlay } from "./app/hud-editor/index.js";
import "./app/hud-layout/hud-layout.css";
import "./app/hud-editor/hud-editor.css";

const TAB_ICONS = { garden: Leaf, blox: Blocks, match3: Gem, merge: PackageOpen, bubbo: Sparkles, trivia: Bot, room: Home, settlement: Home };
const STAT_ICONS = { gold: Sparkles, energy: Zap, tokens: PackageOpen, score: Trophy, lines: Blocks, reward: Sparkles, moves: Gem, combo: Sparkles, essence: Sparkles, freeTaps: Zap, fuel: PackageOpen, shots: Sparkles, pressure: Timer, streak: Zap, time: Timer };
const TABS = VISIBLE_GAME_IDS.map((id) => ({ id, labelKey: GAME_REGISTRY[id].labelKey, icon: TAB_ICONS[id] || Sparkles }));

const PLAY_TABS = new Set(["blox", "match3", "merge", "bubbo", "settlement"]);
const UI_THEME_KEY = "game_hub_ui_theme";

function systemUiTheme() {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: light)")?.matches ? "light" : "dark";
}

function readUiThemePreference() {
  if (typeof window === "undefined") return { theme: "dark", explicit: false };
  try {
    const value = window.localStorage.getItem(UI_THEME_KEY);
    if (value === "dark" || value === "light") return { theme: value, explicit: true };
  } catch {
    // Fall back to system preference for the current session.
  }
  return { theme: systemUiTheme(), explicit: false };
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

function GameEventOverlay({ hidden = false }) {
  const events = useGameEvents((state) => state.events);
  const dismissEvent = useGameEvents((state) => state.dismissEvent);

  useEffect(() => {
    if (!events.length) return undefined;
    const timers = events.map((event) => window.setTimeout(() => dismissEvent(event.id), event.ttlMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [dismissEvent, events]);

  return hidden ? null : (
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
  const [uiThemePreference, setUiThemePreference] = useState(() => readUiThemePreference());
  const [profileOpen, setProfileOpen] = useState(false);
  const [gardenLevelUpPending, setGardenLevelUpPending] = useState(false);
  const gardenLevelUpPendingRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const user = useMemo(() => getTelegramUser(), [platform]);
  const t = useCallback((key, vars) => appTranslate(gardenLanguage, key, vars), [gardenLanguage]);
  const i18nValue = useMemo(() => ({ language: gardenLanguage, t }), [gardenLanguage, t]);
  const uiTheme = uiThemePreference.theme;
  const toggleUiTheme = useCallback(() => {
    setUiThemePreference((value) => ({
      theme: value.theme === "dark" ? "light" : "dark",
      explicit: true,
    }));
  }, []);
  const closeProfile = useCallback(() => setProfileOpen(false), []);
  const exitToGarden = useCallback(() => setActiveTab("garden"), [setActiveTab]);
  useEscapeDismiss(profileOpen, closeProfile);

  useEffect(() => {
    document.documentElement.dataset.uiTheme = uiTheme;
    document.documentElement.style.colorScheme = uiTheme;
    if (uiThemePreference.explicit) {
      try {
        window.localStorage.setItem(UI_THEME_KEY, uiTheme);
      } catch {
        // Best effort only; the toggle still works for the current session.
      }
    }
  }, [uiTheme, uiThemePreference.explicit]);

  useEffect(() => {
    if (uiThemePreference.explicit || typeof window === "undefined") return undefined;
    const query = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!query) return undefined;
    const applySystemTheme = () => {
      setUiThemePreference((value) => (value.explicit ? value : { theme: systemUiTheme(), explicit: false }));
    };
    query.addEventListener?.("change", applySystemTheme);
    return () => query.removeEventListener?.("change", applySystemTheme);
  }, [uiThemePreference.explicit]);

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
  const gardenLevel = Number(gardenHud?.level) || 1;
  const gardenCanLevelUp = !!gardenHud?.levelReady || gardenXp >= gardenXpRequired;
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
        {
          icon: Sparkles,
          image: "/games/garden-shelf/icon_collect.png",
          label: t("hud.gold"),
          value: formatGardenDisplayGold(Math.floor(Number(resources.gold) || 0)),
          id: "garden-gold",
        },
        {
          icon: Leaf,
          image: gardenCanLevelUp ? "/games/garden-shelf/icon_level_up.png" : "/games/garden-shelf/icon_plant.png",
          label: gardenCanLevelUp ? t("level.up") : t("level.progress"),
          value: gardenCanLevelUp ? `+${formatGardenDisplayGold(getGardenLevelReward(gardenLevel))}` : `${Math.floor(gardenXp)}/${gardenXpRequired}`,
          progress: gardenXpProgress,
          active: gardenCanLevelUp && !gardenLevelUpPending,
          title: gardenCanLevelUp ? t("level.up") : t("level.progress"),
          onClick: gardenCanLevelUp && !gardenLevelUpPending ? requestGardenLevelUp : null,
          id: "garden-xp",
          dataGardenXp: true,
        },
        {
          icon: ClipboardList,
          image: "/games/garden-shelf/icon_quest.png",
          label: t("quest.title"),
          value: gardenHud?.questReadyCount > 0 ? gardenHud.questReadyCount : t("quest.openShort"),
          title: t("quest.open"),
          onClick: openGardenQuests,
          active: (gardenHud?.questReadyCount || 0) > 0,
          id: "garden-quests",
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
      <HudLayoutProvider gameId={activeTab} buildId={config?.buildId || ""}>
        <HudPreviewSurface>
          <main
            className={`telegram-app theme-${uiTheme}${PLAY_TABS.has(activeTab) || shellActive ? " play-mode" : ""}${shellActive ? " immersive-mode" : ""}`}
            data-ui-theme={uiTheme}
            data-active-tab={activeTab}
          >
            <HudRegion id="appTopbar" as="header" className="topbar">
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
            </HudRegion>
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
            <HudEditableRegion id="globalStats" as="section" className="stats-row">
              {stats.map((item) => (
                <Stat
                  key={item.label}
                  icon={item.icon}
                  image={item.image}
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
            </HudEditableRegion>
            <GameEventOverlay hidden={shellActive} />
            {message && <button className="notice" onClick={() => useGameHub.setState({ message: "" })}>{message}</button>}
            {!snapshot ? (
              <div className="loading-panel">{t("app.loading")}</div>
            ) : (
              <HudRegion id="activeGameFrame" as="section" key={activeTab} className="active-game-frame">
                <ActiveGame activeTab={activeTab} />
              </HudRegion>
            )}
            <HudEditableRegion id="bottomDock" as="nav" className="bottom-tabs">
              {TABS.map(({ id, labelKey, icon: Icon }) => (
                <HudEditableRegion
                  id={`bottomDock.${id}`}
                  as="button"
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
                </HudEditableRegion>
              ))}
            </HudEditableRegion>
          </main>
        </HudPreviewSurface>
        <HudEditorOverlay />
      </HudLayoutProvider>
    </AppI18nContext.Provider>
  );
}
