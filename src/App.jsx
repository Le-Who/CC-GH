import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Blocks,
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
import { formatR2Gold } from "./games/garden-shelf/lib/gardenR2View.js";
import { useGameHub } from "./game-state/useGameHub.js";
import { useGameEvents } from "./game-state/gameEvents.js";
import { ActiveGame } from "./app/gameChunks.jsx";
import { useSnapshot } from "./app/gameHooks.js";
import { AppI18nContext, appTranslate, playerFeedbackText, useAppI18n } from "./app/i18n.jsx";
import { VISIBLE_GAME_IDS } from "./app/gameRegistry.js";
import { Stat, formatCount, semanticHudIconPath } from "./app/shell.jsx";
import { useGameHudDescriptors } from "./app/useGameHudDescriptors.js";
import { useEscapeDismiss } from "./app/useDismissableLayer.js";
import { HomeCatalogue } from './app/HomeCatalogue.jsx';
import { OPEN_HOME_EVENT, isHomeLeaveReady, leaveGameForHome } from './app/homeNavigation.js';
import { createHomeHistoryLayer, installHomeHistoryGuard, markHomeHistoryEntry } from './app/homeHistory.js';
import { HomeVisibilityContext } from './app/homeContext.js';
import { useTelegramGameNavigation } from "./platform/useTelegramGameNavigation.js";
import { HudEditableRegion, HudLayoutProvider, HudPreviewSurface, HudRegion } from "./app/hud-layout/index.js";
import { HudEditorOverlay } from "./app/hud-editor/index.js";
import "./app/hud-layout/hud-layout.css";
import "./app/hud-editor/hud-editor.css";

const STAT_ICONS = { gold: Sparkles, energy: Zap, tokens: PackageOpen, score: Trophy, lines: Blocks, reward: Sparkles, moves: Gem, combo: Sparkles, essence: Sparkles, freeTaps: Zap, fuel: PackageOpen, shots: Sparkles, pressure: Timer, streak: Zap, time: Timer };


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
  const [homeOpen, setHomeOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const switchLock = useRef(false);
  const homeHistory = useRef(null);
  const accountSession = useGameHub(state => state.accountSession);
  const navigationReady = useGameHub(state => isHomeLeaveReady(state, state.snapshot?.player?.id));
  const [gardenLevelUpPending, setGardenLevelUpPending] = useState(false);
  const gardenLevelUpPendingRef = useRef(false);

  const user = useMemo(() => getTelegramUser(), [platform]);
  const t = useCallback((key, vars) => appTranslate(gardenLanguage, key, vars), [gardenLanguage]);
  const playerMessage = playerFeedbackText(gardenLanguage, message);
  const i18nValue = useMemo(() => ({ language: gardenLanguage, t }), [gardenLanguage, t]);
  const uiTheme = uiThemePreference.theme;
  const toggleUiTheme = useCallback(() => {
    setUiThemePreference((value) => ({
      theme: value.theme === "dark" ? "light" : "dark",
      explicit: true,
    }));
  }, []);
  const closeHome = useCallback(async () => {
    if (switchLock.current) return;
    await homeHistory.current?.close();
    homeHistory.current = null;
    setHomeOpen(false);
  }, []);
  const openCatalogue = useCallback(() => {
    if (homeHistory.current) return;
    const controls = useGameHub.getState().activeGameShell;
    if (typeof controls === 'object') (controls?.pauseRun || controls?.pause)?.();
    homeHistory.current = createHomeHistoryLayer(window, () => {
      homeHistory.current = null;
      setHomeOpen(false);
    }, () => switchLock.current);
    setSwitchError('');
    setHomeOpen(true);
  }, []);
  useEscapeDismiss(!homeOpen, openCatalogue, { priority: -100 });
  useEffect(() => { setSwitchError(''); }, [accountSession]);
  useEffect(() => installHomeHistoryGuard(window, () => useGameHub.getState().activeTab), []);
  useEffect(() => () => homeHistory.current?.dispose(), []);
  const selectHomeGame = useCallback(async id => {
    if (switchLock.current || !VISIBLE_GAME_IDS.includes(id)) return;
    const state = useGameHub.getState();
    if (id === state.activeTab) { closeHome(); return; }
    switchLock.current = true;
    setSwitching(true);
    setSwitchError('');
    const owner = state.accountSession;
    try {
      const controls = typeof state.activeGameShell === 'object' ? state.activeGameShell : null;
      const allowed = await leaveGameForHome({ state, controls, accountId: state.snapshot?.player?.id });
      const current = useGameHub.getState();
      if (current.accountSession !== owner || current.activeTab !== state.activeTab) return;
      if (!allowed || !isHomeLeaveReady(current, state.snapshot?.player?.id)) { setSwitchError('leave-failed'); return; }
      await homeHistory.current?.close();
      homeHistory.current = null;
      const committed = useGameHub.getState();
      if (committed.accountSession !== owner || committed.activeTab !== state.activeTab) { openCatalogue(); return; }
      if (!isHomeLeaveReady(committed, state.snapshot?.player?.id)) { openCatalogue(); setSwitchError('leave-failed'); return; }
      setActiveTab(id);
      markHomeHistoryEntry(window);
      setHomeOpen(false);
      haptic('light');
      audioManager.play('tap');
    } catch { if (useGameHub.getState().accountSession === owner) setSwitchError('leave-failed'); }
    finally { switchLock.current = false; setSwitching(false); }
  }, [closeHome, openCatalogue, setActiveTab]);
  useEffect(() => {
    const request = event => {
      openCatalogue();
      if (event.detail?.gameId) void selectHomeGame(event.detail.gameId);
    };
    window.addEventListener(OPEN_HOME_EVENT, request);
    return () => window.removeEventListener(OPEN_HOME_EVENT, request);
  }, [openCatalogue, selectHomeGame]);

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
      const realtimeAccountSession = useGameHub.getState().accountSession;
      const realtimeCleanup = await connectRealtime(
        (payload) => applyRealtimePayload(payload),
        (nextStatus) => {
          if (nextStatus === "offline") useGameHub.setState({ status: "offline" });
          if (nextStatus === "online") {
            useGameHub.setState({ status: "ready" });
            drainOutbox();
          }
        },
        { isCurrent: () => useGameHub.getState().accountSession === realtimeAccountSession },
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
    activeGame: activeTab,
    hasOpenPanel: homeOpen || !!activeGameControls?.openPanel,
    hasActiveRun: !!activeGameControls?.activeRun,
      hasPendingActions: pendingActions.length > 0 || !!activeGameControls?.hasPendingActions,
    closePanel: homeOpen ? closeHome : activeGameControls?.closePanel,
    pauseRun: activeGameControls?.pauseRun || activeGameControls?.pause,
    exitToHub: openCatalogue,
  });
  const gardenR2 = snapshot?.gardenR2;
  const gardenGoldFormatter = gardenR2 ? formatR2Gold : formatGardenDisplayGold;
  const gardenXpRequired = Math.max(1, Number(gardenHud?.xpRequired) || 1);
  const gardenXp = Math.max(0, Number(gardenHud?.xp) || 0);
  const gardenXpProgress = Math.min(100, (gardenXp / gardenXpRequired) * 100);
  const gardenLevel = Number(gardenHud?.level) || 1;
  const gardenCanLevelUp = gardenR2 ? Number(gardenR2.pendingLegacyRewardGold) > 0 : !!gardenHud?.levelReady || gardenXp >= gardenXpRequired;
  useEffect(() => {
    if (!gardenCanLevelUp) {
      gardenLevelUpPendingRef.current = false;
      setGardenLevelUpPending(false);
    }
  }, [gardenCanLevelUp]);
  useEffect(() => {
    if (["garden.levelUp", "garden.r2"].includes(lastResult?.action) && lastResult.error) {
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
  const profileBotName = config?.telegramBotUsername ? `@${config.telegramBotUsername}` : '';
  const stats = activeTab === "garden"
    ? [
        {
          icon: Sparkles,
          image: semanticHudIconPath("garden", "gold"),
          label: t("hud.gold"),
          value: gardenGoldFormatter(Math.floor(Number(resources.gold) || 0)),
          id: "garden-gold",
        },
        {
          icon: Leaf,
          image: semanticHudIconPath("garden", "levelXp"),
          label: gardenCanLevelUp ? t("level.up") : t("level.progress"),
          value: gardenCanLevelUp ? `+${gardenGoldFormatter(gardenR2 ? gardenR2.pendingLegacyRewardGold : getGardenLevelReward(gardenLevel))}` : gardenR2?.chapter === 30 ? `${gardenR2.chapter}/30` : `${Math.floor(gardenXp)}/${gardenXpRequired}`,
          progress: gardenXpProgress,
          active: gardenCanLevelUp && !gardenLevelUpPending,
          title: gardenCanLevelUp ? t("level.up") : t("level.progress"),
          onClick: gardenCanLevelUp && !gardenLevelUpPending ? requestGardenLevelUp : null,
          id: "garden-xp",
          dataGardenXp: true,
        },
        {
          icon: ClipboardList,
          image: semanticHudIconPath("garden", "quest"),
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
              <div className="topbar-title">
                <h1>{t("app.title")}</h1>
              </div>
              <div className="topbar-actions">
                {activeTab !== "garden" && <button type="button" className="home-launcher" onClick={openCatalogue} aria-label={gardenLanguage === 'ru' ? 'Все игры' : 'All games'}><Home size={20}/><span>{gardenLanguage === 'ru' ? 'Игры' : 'Games'}</span></button>}
                <button type="button" className={`status-dot ${status}`} onClick={() => loadSnapshot()} aria-label={`${t(`app.status.${status}`)} · ${t("common.refresh")}`} title={`${t(`app.status.${status}`)} · ${t("common.refresh")}`}>
                  {["booting", "syncing", "ready", "offline"].map((state) => <span key={state} className="status-dot-label" data-current={state === status} aria-hidden={state !== status}>{t(`app.status.${state}`)}</span>)}
                </button>
              </div>
            </HudRegion>
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
                  labelMode={activeTab === "garden" ? "tooltip" : "visible"}
                />
              ))}
            </HudEditableRegion>
            <GameEventOverlay hidden={shellActive} />
            {message && <button type="button" className="notice" role="alert" aria-label={`${playerMessage} · ${t("common.close")}`} onClick={() => useGameHub.setState({ message: "" })}>{playerMessage}</button>}
            {!snapshot ? (
              <div className="loading-panel">{t("app.loading")}</div>
            ) : (
              <HudRegion id="activeGameFrame" as="section" key={activeTab} className="active-game-frame">
                <HomeVisibilityContext.Provider value={homeOpen}><ActiveGame activeTab={activeTab} /></HomeVisibilityContext.Provider>
              </HudRegion>
            )}
          </main>
          {homeOpen && <HomeCatalogue accountSession={accountSession} language={gardenLanguage} t={t} activeTab={activeTab} hasActiveRun={!!activeGameControls?.activeRun} readyToSwitch={navigationReady && (activeTab === "garden" || !!activeGameControls) && !activeGameControls?.hasPendingActions} switching={switching} error={switchError} onClose={closeHome} onSelect={selectHomeGame} profileName={profileName} profileBotName={profileBotName} resources={resources} settings={<><ThemeToggle theme={uiTheme} onToggle={toggleUiTheme}/><AudioToggle/></>}/>}
        </HudPreviewSurface>
        {!homeOpen && <HudEditorOverlay />}
      </HudLayoutProvider>
    </AppI18nContext.Provider>
  );
}
