import React, { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
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
import { CROPS, ECONOMY, MERGE_CHAINS, ROOM_DECORATIONS } from "../game-logic.js";

const TABS = [
  { id: "farm", label: "Farm", icon: Leaf },
  { id: "blox", label: "Blox", icon: Blocks },
  { id: "match3", label: "Gems", icon: Gem },
  { id: "merge", label: "Merge", icon: PackageOpen },
  { id: "bubbo", label: "Bubbo", icon: Sparkles },
  { id: "trivia", label: "Trivia", icon: Bot },
  { id: "room", label: "Room", icon: Home },
];

const PLAY_TABS = new Set(["blox", "match3", "merge", "bubbo"]);

const MATCH3_MODES = [
  { id: "classic", label: "Classic", hint: "30 moves" },
  { id: "timed", label: "Timed", hint: "90 seconds" },
  { id: "drop", label: "Star Drop", hint: "drop tokens" },
];

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

function GamePlayHud({ title, subtitle, stats = [], onPause, onFinish, finishLabel = "Settle" }) {
  return (
    <div className="game-play-hud">
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
        <PanelButton icon={Pause} subtle onClick={onPause}>Pause</PanelButton>
        {onFinish && <PanelButton icon={Check} onClick={onFinish}>{finishLabel}</PanelButton>}
      </div>
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
    setActiveTab("farm");
  }, [setActiveTab]);
}

function FarmGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
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
      onFarmPlot: onPlot,
      onFarmLongPress: onPlotLongPress,
    }),
    [snapshot, selectedSeed, onPlot, onPlotLongPress, tick],
  );

  return (
    <div className={`game-layout farm-layout${inShell ? ` game-shell ${isPlaying ? "shell-playing" : "shell-paused"}` : ""}`}>
      <PixiGameHost sceneKey="farm" buildScene={buildFarmScene} sceneState={sceneState} />
      {isPlaying && (
        <GamePlayHud
          title="Cozy Farm"
          subtitle={`Lv ${farm.level || 1} · ${farm.xp || 0} XP · ${crops[selectedSeed]?.name || selectedSeed}`}
          stats={[
            { label: "Gold", value: formatCount(snapshot?.resources?.gold || 0) },
            { label: "Plots", value: farm.plots?.length || 0 },
            { label: "Seed", value: inventory.seeds?.[selectedSeed] || 0 },
          ]}
          onPause={() => setPaused(true)}
          onFinish={() => performAction("farm.harvestAll")}
          finishLabel="Harvest"
        />
      )}
      <aside className={`side-panel${inShell ? " game-menu-overlay" : ""}`}>
        <div className="panel-header">
          <div>
            <strong>Cozy Farm</strong>
            <span>Lv {farm.level || 1} · {farm.xp || 0} XP</span>
          </div>
          <PanelButton
            icon={Play}
            onClick={() => {
              setInShell(true);
              setPaused(false);
            }}
          >
            {inShell ? "Resume" : "Play"}
          </PanelButton>
        </div>
        {inShell && paused && (
          <div className="button-row two">
            <PanelButton icon={Play} onClick={() => setPaused(false)}>Resume</PanelButton>
            <PanelButton
              icon={Home}
              danger
              onClick={() => {
                setPaused(false);
                setInShell(false);
              }}
            >
              Exit
            </PanelButton>
          </div>
        )}
        {snapshot?.offlineReport && <div className="callout">Offline progress applied.</div>}
        <SectionTabs
          active={farmTab}
          onChange={setFarmTab}
          tabs={[
            { id: "shop", label: "Shop" },
            { id: "bag", label: "Bag" },
            { id: "badges", label: "Badges" },
            { id: "journal", label: "Journal" },
            { id: "season", label: "Season" },
          ]}
        />
        {farmTab === "shop" && (
          <div className="panel-scroll grid-list">
            <div className="quantity-row">
              <span>Buy quantity</span>
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
                    <small>Seeds {inventory.seeds?.[cropId] || 0} · {crop.seedPrice || 0}g</small>
                  </span>
                  <PanelButton
                    icon={ShoppingBag}
                    onClick={(event) => {
                      event.stopPropagation();
                      performAction("farm.buySeeds", { cropId, amount: buyQty });
                    }}
                  >
                    Buy
                  </PanelButton>
                </div>
              );
            })}
            <div className="button-row">
              <PanelButton icon={Check} onClick={() => performAction("farm.harvestAll")}>Harvest All</PanelButton>
              <PanelButton icon={Hammer} onClick={() => performAction("farm.buyPlot")}>Buy Plot</PanelButton>
              <PanelButton icon={Zap} onClick={() => performAction("farm.activateBooster", { boosterId: "fertilizer" })}>Fertilizer</PanelButton>
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
            title={owned ? "Set theme" : `Buy for ${theme.cost}`}
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
  const harvested = snapshot?.inventory?.harvested || {};
  const crops = snapshot?.meta?.crops || CROPS;
  const entries = listPositive(harvested);
  return (
    <div className="panel-scroll grid-list">
      {!entries.length && <div className="empty-state">Harvest crops to fill the Bag.</div>}
      {entries.map(([cropId, qty]) => {
        const crop = crops[cropId] || {};
        return (
          <div className="item-card" key={cropId}>
            <span className="item-emoji">{crop.emoji || "🌱"}</span>
            <span>
              <strong>{crop.name || cropId}</strong>
              <small>x{qty} · sell {crop.sellPrice || 0}g · feed +{crop.fullnessYield || 0}</small>
            </span>
            <PanelButton icon={Sparkles} onClick={() => performAction("farm.sellCrop", { cropId, amount: 1 })}>Sell</PanelButton>
            <PanelButton icon={PawPrint} onClick={() => performAction("pet.feed", { cropId })}>Feed</PanelButton>
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
  const discovered = new Set(snapshot?.farm?.journal?.discovered || []);
  return (
    <div className="panel-scroll grid-list">
      {Object.values(crops).map((crop) => (
        <div className={`item-card ${discovered.has(crop.id) ? "" : "locked"}`} key={crop.id}>
          <span className="item-emoji">{discovered.has(crop.id) ? crop.emoji : "?"}</span>
          <span>
            <strong>{discovered.has(crop.id) ? crop.name : "Undiscovered"}</strong>
            <small>{discovered.has(crop.id) ? crop.lore : crop.unlockCondition?.label || "Keep farming"}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function SeasonPanel() {
  const snapshot = useSnapshot();
  const season = snapshot?.farm?.seasonPass || {};
  return (
    <div className="panel-scroll grid-list">
      <div className="progress-card">
        <strong>{season.name || "Season"}</strong>
        <span>{season.xp || 0} XP · Tier {(season.currentTier || 0) + 1}</span>
      </div>
      {(season.tiers || []).map((tier, index) => (
        <div key={index} className={`item-card ${tier.unlocked ? "" : "locked"}`}>
          <span className="item-emoji">{tier.unlocked ? "★" : "·"}</span>
          <span>
            <strong>{tier.label}</strong>
            <small>{tier.xp} XP · {tier.claimed ? "claimed" : tier.unlocked ? "unlocked" : "locked"}</small>
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
      selectedBloxPiece: selectedPiece,
      onBloxCell: onCell,
      onBloxDrop: onDrop,
      onBloxTray: setSelectedPiece,
    }),
    [state, isPlaying, selectedPiece, onCell, onDrop],
  );

  return (
    <div className={`game-layout game-shell ${isPlaying ? "shell-playing" : state.gameActive ? "shell-paused" : "shell-menu"}`}>
      <PixiGameHost sceneKey="blox" buildScene={buildBloxScene} sceneState={sceneState} />
      {isPlaying && (
        <GamePlayHud
          title="Building Blox"
          subtitle={`Best ${state.highScore} · reward ${state.score ? Math.min(400, Math.floor(state.score * 0.35)) : 0}`}
          stats={[
            { label: "Score", value: state.score || 0 },
            { label: "Lines", value: state.linesCleared || 0 },
            { label: "Cost", value: ECONOMY.COST_BLOX },
          ]}
          onPause={() => setPaused(true)}
          onFinish={() => {
            setPaused(true);
            performAction("blox.end", { score: state.score });
          }}
          finishLabel="End"
        />
      )}
      <aside className="side-panel game-menu-overlay">
        <div className="panel-header">
          <div>
            <strong>Building Blox</strong>
            <span>Best {state.highScore} · Reward {state.score ? Math.min(400, Math.floor(state.score * 0.35)) : 0}</span>
          </div>
          <PanelButton icon={state.gameActive ? RotateCcw : Play} onClick={() => performAction("blox.start").then(() => setPaused(false))}>
            {state.gameActive ? "Restart" : "Start"}
          </PanelButton>
        </div>
        {state.gameActive && paused && (
          <div className="button-row two">
            <PanelButton icon={Play} onClick={() => setPaused(false)}>Resume</PanelButton>
            <PanelButton icon={Home} subtle onClick={() => setPaused(true)}>Menu</PanelButton>
          </div>
        )}
        <div className="metric-grid">
          <Stat icon={Trophy} label="Score" value={state.score || 0} />
          <Stat icon={Blocks} label="Lines" value={state.linesCleared || 0} />
          <Stat icon={Zap} label="Cost" value={ECONOMY.COST_BLOX} />
        </div>
        <div className="button-row">
          <PanelButton icon={Check} disabled={!state.gameActive} onClick={() => performAction("blox.end", { score: state.score })}>End Run</PanelButton>
          <PanelButton icon={Volume2} subtle onClick={() => haptic("light")}>Sound</PanelButton>
          <PanelButton icon={Home} danger onClick={exitToHub}>Exit</PanelButton>
        </div>
        <Leaderboard entries={leaders} />
      </aside>
    </div>
  );
}

function Match3Game() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
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

  const queueMatchAnimation = useCallback((animation, durationMs = 420) => {
    window.clearTimeout(animationTimerRef.current);
    setInputLocked(true);
    setMatchAnimation({
      ...animation,
      id: `${animation.type}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });
    animationTimerRef.current = window.setTimeout(() => {
      setInputLocked(false);
    }, durationMs);
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
      const result = attemptMatch3Move(board, from, to);
      if (!result.valid) {
        setSelected(null);
        queueMatchAnimation({ type: "invalid", from, to, fromGem, toGem }, 240);
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
      setBoard(nextBoard);
      setScore(nextScore);
      setCombo(Math.max(combo, result.combo));
      setMovesLeft(nextMoves);
      setSelected(null);
      queueMatchAnimation(
        { type: "cascade", from, to, fromGem, toGem, steps: result.steps },
        Math.min(1500, 360 + (result.steps?.length || 1) * 240),
      );
      audioManager.play(result.combo > 1 || result.special ? "clear" : "merge");
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
      selectedGem: selected,
      match3Animation: matchAnimation,
      onMatch3Cell: onCell,
      onMatch3Swap: attemptSwap,
      fallbackBoard: board,
    }),
    [attemptSwap, board, combo, inputLocked, isPlaying, matchAnimation, mode, movesLeft, onCell, score, selected],
  );

  return (
    <div className={`game-layout game-shell ${isPlaying ? "shell-playing" : gameActive ? "shell-paused" : "shell-menu"}`}>
      <PixiGameHost sceneKey="match3" buildScene={buildMatch3Scene} sceneState={sceneState} />
      {isPlaying && (
        <GamePlayHud
          title="Gem Crush"
          subtitle={`${MATCH3_MODES.find((item) => item.id === mode)?.label || mode} · best ${snapshot?.match3?.highScore || 0}`}
          stats={[
            { label: "Score", value: score },
            { label: mode === "timed" ? "Time" : "Moves", value: movesLeft },
            { label: "Combo", value: combo || "-" },
          ]}
          onPause={() => setPaused(true)}
          onFinish={() => finish(score)}
        />
      )}
      <aside className="side-panel game-menu-overlay">
        <div className="panel-header">
          <div>
            <strong>Gem Crush</strong>
            <span>Best {snapshot?.match3?.highScore || 0} · Combo {combo || "-"}</span>
          </div>
          <PanelButton icon={Play} onClick={() => start(mode)}>{gameActive ? "New" : "Start"}</PanelButton>
        </div>
        {gameActive && paused && (
          <div className="button-row two">
            <PanelButton icon={Play} onClick={() => setPaused(false)}>Resume</PanelButton>
            <PanelButton icon={Check} onClick={() => finish(score)}>Settle</PanelButton>
          </div>
        )}
        <div className="mode-grid">
          {MATCH3_MODES.map((item) => (
            <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>
              <strong>{item.label}</strong>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
        <div className="metric-grid">
          <Stat icon={Trophy} label="Score" value={score} />
          <Stat icon={Clock} label={mode === "timed" ? "Time" : "Moves"} value={movesLeft} />
          <Stat icon={Gem} label="Reward" value={score > 0 ? Math.max(5, Math.floor(score / 25)) : 0} />
        </div>
        <div className="button-row">
          <PanelButton icon={Check} disabled={!gameActive} onClick={() => finish(score)}>Settle</PanelButton>
          <PanelButton icon={RotateCcw} subtle onClick={() => setBoard(createModeBoard(mode))}>Reshuffle</PanelButton>
          <PanelButton icon={Home} danger onClick={exitToHub}>Exit</PanelButton>
        </div>
        <Leaderboard entries={leaders} />
      </aside>
    </div>
  );
}

function BubboGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const initialRun = useMemo(() => createBubboRun("local-preview"), []);
  const [board, setBoard] = useState(() => initialRun.board);
  const [seed, setSeed] = useState(initialRun.seed);
  const [waveIndex, setWaveIndex] = useState(initialRun.waveIndex);
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
  const runRef = useRef({ board, seed, waveIndex, pressure, pressureStep, score, shotsLeft });
  const highScore = snapshot?.bubbo?.highScore || 0;
  const remainingBubbles = getBubboRemainingCount(board);
  const isPlaying = gameActive && !paused;
  useImmersiveGame("bubbo", true);

  useEffect(() => {
    runRef.current = { board, seed, waveIndex, pressure, pressureStep, score, shotsLeft };
  }, [board, pressure, pressureStep, score, seed, shotsLeft, waveIndex]);

  const start = useCallback(async () => {
    const run = createBubboRun();
    const result = await performAction("bubbo.start", {
      shotsLeft: BUBBO_SHOTS,
      board: run.board,
      seed: run.seed,
      waveIndex: run.waveIndex,
      pressure: 0,
    }, { key: "bubbo.start" });
    if (result.error) return;
    setBoard(run.board);
    setSeed(run.seed);
    setWaveIndex(run.waveIndex);
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
      const elapsed = now - pressureClockRef.current;
      pressureClockRef.current = now;
      const current = runRef.current;
      const advanced = advanceBubboPressure(current, elapsed);
      setPressure(advanced.pressure);
      setPressureStep(advanced.pressureStep || 0);
      if (!advanced.shifts) return;
      setBoard(advanced.board);
      setWaveIndex(advanced.waveIndex);
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
          pressure: advanced.pressure,
        },
      }, { silent: true, key: `bubbo.pressure.${now}` });
      if (advanced.danger || advanced.overflow) {
        finish(current.score);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [finish, isPlaying, performAction]);

  const onFire = useCallback(
    (row, col, path = []) => {
      if (!gameActive) return;
      const result = applyBubboShot(board, currentBubble, row, col);
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
        { game: { score: nextScore, shotsLeft: nextShots, board: result.board, seed, waveIndex, pressure } },
        { silent: true, key: `bubbo.sync.${shotRecord.id}` },
      );
      if (remaining === 0 || nextShots <= 0 || isBubboDanger(result.board)) {
        finish(nextScore);
      }
    },
    [board, currentBubble, finish, gameActive, nextBubble, performAction, pressure, score, seed, shotsLeft, waveIndex],
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
      },
      onBubboFire: onFire,
    }),
    [board, currentBubble, isPlaying, lastShot, nextBubble, onFire, pressureStep, score, shotsLeft],
  );

  return (
    <div className={`game-layout game-shell ${isPlaying ? "shell-playing" : gameActive ? "shell-paused" : "shell-menu"}`}>
      <PixiGameHost sceneKey="bubbo" buildScene={buildBubboScene} sceneState={sceneState} />
      {isPlaying && (
        <GamePlayHud
          title="Bubbo Bubbo"
          subtitle={`Best ${highScore} · ${remainingBubbles} bubbles`}
          stats={[
            { label: "Score", value: score },
            { label: "Shots", value: shotsLeft },
            { label: "Pressure", value: `${Math.round(pressureStep * 100)}%` },
          ]}
          onPause={() => setPaused(true)}
          onFinish={() => finish(score)}
        />
      )}
      <aside className="side-panel game-menu-overlay">
        <div className="panel-header">
          <div>
            <strong>Bubbo Bubbo</strong>
            <span>Best {highScore} · {remainingBubbles} bubbles · pressure {Math.round(pressureStep * 100)}%</span>
          </div>
          <PanelButton icon={gameActive ? RotateCcw : Play} onClick={start}>
            {gameActive ? "Restart" : "Start"}
          </PanelButton>
        </div>
        {gameActive && paused && (
          <div className="button-row two">
            <PanelButton icon={Play} onClick={() => setPaused(false)}>Resume</PanelButton>
            <PanelButton icon={Check} onClick={() => finish(score)}>Settle</PanelButton>
          </div>
        )}
        <div className="metric-grid">
          <Stat icon={Trophy} label="Score" value={score} />
          <Stat icon={Sparkles} label="Shots" value={shotsLeft} />
          <Stat icon={Zap} label="Cost" value={ECONOMY.COST_BUBBO} />
        </div>
        <div className="button-row">
          <PanelButton icon={Check} disabled={!gameActive} onClick={() => finish(score)}>Settle</PanelButton>
          <PanelButton icon={RotateCcw} subtle disabled={gameActive} onClick={() => {
            const run = createBubboRun("local-preview");
            setBoard(run.board);
            setSeed(run.seed);
            setWaveIndex(run.waveIndex);
            setPressure(0);
            setPressureStep(0);
          }}>New Field</PanelButton>
          <PanelButton icon={Home} danger onClick={exitToHub}>Exit</PanelButton>
        </div>
        <div className="leaderboard">
          <strong>Run Status</strong>
          <span>{isBubboDanger(board) ? "Danger line" : "Field stable"} · high score {highScore}</span>
        </div>
      </aside>
    </div>
  );
}

function MergeGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
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
    () => ({ merge, mergeSelected: selectedCell, trashMode, mergeLocked: !isPlaying, onMergeCell, onMergeDrop }),
    [isPlaying, merge, onMergeCell, onMergeDrop, selectedCell, trashMode],
  );

  return (
    <div className={`game-layout game-shell ${isPlaying ? "shell-playing" : mergePlaying ? "shell-paused" : "shell-menu"}`}>
      <PixiGameHost sceneKey="merge" buildScene={buildMergeScene} sceneState={sceneState} />
      {isPlaying && (
        <GamePlayHud
          title="Gacha Merge"
          subtitle={`${merge.freeTapCharges || 0} free taps · ${inventory.rewards?.gachaTokens || 0} tokens`}
          stats={[
            { label: "Free", value: merge.freeTapCharges || 0 },
            { label: "Items", value: Object.values(merge.itemCounts || {}).reduce((sum, qty) => sum + qty, 0) },
            { label: "Mode", value: trashMode ? "Trash" : "Merge" },
          ]}
          onPause={() => setPaused(true)}
        />
      )}
      <aside className="side-panel game-menu-overlay">
        <div className="panel-header">
          <div>
            <strong>Gacha Merge</strong>
            <span>{merge.freeTapCharges || 0} free taps · {inventory.rewards?.gachaTokens || 0} tokens</span>
          </div>
          <PanelButton icon={mergePlaying ? Trash2 : Play} danger={mergePlaying && trashMode} active={mergePlaying && trashMode} onClick={() => {
            if (!mergePlaying) {
              setMergePlaying(true);
              setPaused(false);
            } else {
              setTrashMode((value) => !value);
            }
          }}>
            {mergePlaying ? "Trash" : "Play"}
          </PanelButton>
        </div>
        {mergePlaying && paused && (
          <div className="button-row two">
            <PanelButton icon={Play} onClick={() => setPaused(false)}>Resume</PanelButton>
            <PanelButton icon={Home} subtle onClick={() => setMergePlaying(false)}>Menu</PanelButton>
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
                  <small>{cooldown ? "Cooling down" : `${gs.tapsLeft ?? ECONOMY.GENERATOR_TAP_LIMIT}/${ECONOMY.GENERATOR_TAP_LIMIT} taps`}</small>
                </div>
                <select value={fuel || ""} onChange={(event) => setSelectedFuel((prev) => ({ ...prev, [chainId]: event.target.value }))}>
                  <option value="">Free/choose fuel</option>
                  {harvestedEntries.map(([cropId, qty]) => (
                    <option key={cropId} value={cropId}>{CROPS[cropId]?.emoji || ""} {cropId} x{qty}</option>
                  ))}
                </select>
                <PanelButton
                  icon={Zap}
                  disabled={cooldown || (!fuel && !(merge.freeTapCharges > 0))}
                  onClick={() => performAction("merge.tap", { chainId, cropId: fuel }, { key: `merge.tap.${chainId}` })}
                >
                  Tap
                </PanelButton>
              </div>
            );
          })}
        </div>
        <div className="button-row">
          <PanelButton icon={Sparkles} onClick={() => performAction("merge.gacha")}>Gacha</PanelButton>
          <PanelButton icon={PackageOpen} onClick={() => performAction("merge.freePull")}>Free Pull</PanelButton>
          <PanelButton icon={Zap} onClick={() => performAction("merge.claimFreeTaps")}>30 Taps</PanelButton>
          <PanelButton icon={Home} danger onClick={exitToHub}>Exit</PanelButton>
        </div>
        <div className="panel-scroll compact-list">
          {Object.entries(merge.itemCounts || {}).map(([itemId, qty]) => (
            <span key={itemId}>{itemId} x{qty}</span>
          ))}
        </div>
      </aside>
    </div>
  );
}

function TriviaGame() {
  const snapshot = useSnapshot();
  const loadSnapshot = useGameHub((state) => state.loadSnapshot);
  const exitToHub = useExitToHub();
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
            <strong>Brain Blitz</strong>
            <span>Total {snapshot?.trivia?.totalScore || 0} · Best streak {snapshot?.trivia?.bestStreak || 0}</span>
          </div>
        </div>
        {isPlaying && (
          <GamePlayHud
            title="Brain Blitz"
            subtitle={`${question.category || "Trivia"} · ${question.difficulty || difficulty}`}
            stats={[
              { label: "Score", value: sessionScore },
              { label: "Streak", value: streak || 0 },
              { label: "Q", value: `${(question.index ?? 0) + 1}/${question.total || "?"}` },
            ]}
            onPause={() => setPaused(true)}
          />
        )}
        {view === "menu" && (
          <>
            <div className="form-grid">
              <label>
                Category
                <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Any" />
              </label>
              <label>
                Difficulty
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                  <option value="all">All</option>
                </select>
              </label>
            </div>
            <div className="button-row">
              <PanelButton icon={Play} onClick={startSolo}>Solo</PanelButton>
              <PanelButton icon={Trophy} onClick={createDuel}>Create Duel</PanelButton>
            </div>
            <div className="join-row">
              <input value={joinCode} onChange={(e) => setJoinCode(e.target.value)} placeholder="Invite code" />
              <PanelButton icon={ChevronRight} onClick={joinDuel}>Join</PanelButton>
            </div>
          </>
        )}
        {(view === "solo" || view === "duel-play") && question && (
          <QuestionPanel question={question} score={sessionScore} streak={streak} submitAnswer={submitAnswer} />
        )}
        {view === "duel-room" && (
          <div className="duel-box">
            <strong>Invite {duelStatus?.inviteCode || roomId}</strong>
            <span>Status: {duelStatus?.status || "waiting"}</span>
            <div className="button-row">
              <PanelButton icon={Check} onClick={readyDuel}>Ready</PanelButton>
              <PanelButton icon={RotateCcw} onClick={() => pollDuelStatus()}>Refresh</PanelButton>
            </div>
          </div>
        )}
        {(view === "results" || view === "duel-results") && (
          <div className="results-box">
            <Trophy size={42} />
            <strong>Finished</strong>
            <span>Score {sessionScore}</span>
            <PanelButton
              icon={RotateCcw}
              onClick={() => {
                setPaused(false);
                setView("menu");
              }}
            >
              Back
            </PanelButton>
          </div>
        )}
      </aside>
      <aside className={`side-panel${inShell ? " game-menu-overlay" : ""}`}>
        {inShell && (
          <div className="panel-header">
            <div>
              <strong>{view === "results" || view === "duel-results" ? "Result" : "Pause"}</strong>
              <span>Score {sessionScore} · Streak {streak || 0}</span>
            </div>
          </div>
        )}
        {inShell && (
          <div className="button-row">
            {questionActive && paused && <PanelButton icon={Play} onClick={() => setPaused(false)}>Resume</PanelButton>}
            <PanelButton
              icon={RotateCcw}
              subtle
              onClick={() => {
                setPaused(false);
                setQuestion(null);
                setView("menu");
              }}
            >
              Menu
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
              Exit
            </PanelButton>
          </div>
        )}
        <strong>Recent Duels</strong>
        <div className="panel-scroll compact-list">
          {history.length ? history.map((item, index) => (
            <span key={item.roomId || index}>{item.roomId || "duel"} · {item.status || item.result || "played"}</span>
          )) : <span>No duels yet.</span>}
        </div>
      </aside>
    </div>
  );
}

function QuestionPanel({ question, score, streak, submitAnswer }) {
  return (
    <div className="question-panel">
      <div className="question-meta">
        <span>Question {(question.index ?? 0) + 1}/{question.total || "?"}</span>
        <span>Score {score}</span>
        <span>{streak ? `Streak ${streak}` : "No streak"}</span>
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
  const room = snapshot?.room || {};
  const pet = snapshot?.pet || {};
  const inventory = snapshot?.inventory?.roomInventory || [];
  const [selectedDeco, setSelectedDeco] = useState("");
  const [rename, setRename] = useState(pet.name || "");
  const [inShell, setInShell] = useState(false);
  const [paused, setPaused] = useState(false);
  const renameInputRef = useRef(null);
  const [optimisticName, setOptimisticName] = useOptimistic(pet.name || "Buddy");
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
          title={optimisticName || "Buddy"}
          subtitle={`Lv ${pet.level || 1} · affection ${pet.affectionLevel || 1}`}
          stats={[
            { label: "Full", value: `${pet.stats?.fullness || 0}/100` },
            { label: "Happy", value: `${pet.stats?.happiness || 0}/100` },
            { label: "Orders", value: pet.activeOrders?.length || 0 },
          ]}
          onPause={() => setPaused(true)}
        />
      )}
      <aside className={`side-panel${inShell ? " game-menu-overlay" : ""}`}>
        <div className="panel-header">
          <div>
            <strong>{optimisticName || "Buddy"}</strong>
            <span>Lv {pet.level || 1} · Affection {pet.affectionLevel || 1}</span>
          </div>
          <PanelButton
            icon={Play}
            onClick={() => {
              setInShell(true);
              setPaused(false);
            }}
          >
            {inShell ? "Resume" : "Play"}
          </PanelButton>
        </div>
        {inShell && paused && (
          <div className="button-row">
            <PanelButton icon={Play} onClick={() => setPaused(false)}>Resume</PanelButton>
            <PanelButton
              icon={RotateCcw}
              subtle
              onClick={() => {
                setPaused(false);
                setInShell(false);
              }}
            >
              Menu
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
              Exit
            </PanelButton>
          </div>
        )}
        <div className="metric-grid">
          <Stat icon={PawPrint} label="Fullness" value={`${pet.stats?.fullness || 0}/100`} />
          <Stat icon={Sparkles} label="Happy" value={`${pet.stats?.happiness || 0}/100`} />
          <Stat icon={BadgeCheck} label="Orders" value={pet.activeOrders?.length || 0} />
        </div>
        <div className="join-row">
          <input ref={renameInputRef} value={rename} onChange={(e) => setRename(e.target.value)} maxLength={16} />
          <PanelButton icon={Check} onClick={submitRename}>Rename</PanelButton>
        </div>
        <div className="ability-list">
          {["autoHarvest", "autoWater", "autoPlant"].map((id) => (
            <span key={id} className={pet.abilities?.[id] ? "unlocked" : ""}>{pet.abilities?.[id] ? "✓" : "•"} {id}</span>
          ))}
        </div>
        <strong>Room Inventory</strong>
        <div className="panel-scroll grid-list">
          {!inventory.length && <div className="empty-state">Find decorations from Merge gacha and high merges.</div>}
          {inventory.map((decoId) => {
            const deco = ROOM_DECORATIONS[decoId] || {};
            return (
              <button key={decoId} className={`item-card ${selectedDeco === decoId ? "selected" : ""}`} onClick={() => setSelectedDeco(decoId)}>
                <span className="item-emoji">{deco.emoji || "?"}</span>
                <span>
                  <strong>{deco.name || decoId}</strong>
                  <small>{deco.bonus?.desc || "Decoration"}</small>
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
  const orders = snapshot?.pet?.activeOrders || [];
  const harvested = snapshot?.inventory?.harvested || {};
  const mergeItems = snapshot?.inventory?.mergeItems || {};
  return (
    <div className="quest-list">
      <div className="panel-header tight">
        <strong>Pet Orders</strong>
        <PanelButton icon={RotateCcw} onClick={() => performAction("quest.generate")}>Generate</PanelButton>
      </div>
      {orders.map((order) => (
        <div className="order-card" key={order.id}>
          <strong>{order.tier} order</strong>
          {(order.requirements || []).map((req, index) => {
            const have = req.type === "crop" ? harvested[req.id] || 0 : mergeItems[req.id] || 0;
            return <small key={index}>{req.id}: {have}/{req.qty}</small>;
          })}
          <PanelButton icon={Check} onClick={() => performAction("quest.submit", { orderId: order.id })}>
            Complete
          </PanelButton>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({ entries }) {
  return (
    <div className="leaderboard">
      <strong>Leaderboard</strong>
      {entries?.length ? entries.slice(0, 8).map((entry) => (
        <div key={`${entry.rank}-${entry.username}`}>
          <span>#{entry.rank} {entry.username}</span>
          <strong>{entry.highScore}</strong>
        </div>
      )) : <span className="empty-state">No scores yet.</span>}
    </div>
  );
}

function ActiveGame() {
  const activeTab = useGameHub((state) => state.activeTab);
  if (activeTab === "farm") return <FarmGame />;
  if (activeTab === "blox") return <BloxGame />;
  if (activeTab === "match3") return <Match3Game />;
  if (activeTab === "merge") return <MergeGame />;
  if (activeTab === "bubbo") return <BubboGame />;
  if (activeTab === "trivia") return <TriviaGame />;
  return <RoomGame />;
}

function AudioToggle() {
  const [enabled, setEnabled] = useState(audioManager.isEnabled());
  const Icon = enabled ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      className={`audio-toggle${enabled ? " enabled" : ""}`}
      aria-label={enabled ? "Mute sound" : "Enable sound"}
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
  const [platform, setPlatform] = useState(null);
  const [config, setConfig] = useState(null);
  const [isPending, startTransition] = useTransition();
  const reduceMotion = useReducedMotion();
  const user = useMemo(() => getTelegramUser(), [platform]);

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

  const resources = snapshot?.resources || {};
  const energy = resources.energy || {};
  const shellActive = activeGameShell === activeTab;

  return (
    <main className={`telegram-app${PLAY_TABS.has(activeTab) || shellActive ? " play-mode" : ""}${shellActive ? " immersive-mode" : ""}`}>
      <header className="topbar">
        <div>
          <p className="eyebrow">Telegram Mini App</p>
          <h1>Game Hub</h1>
        </div>
        <div className="topbar-actions">
          <AudioToggle />
          <button type="button" className={`status-dot ${status}${isPending ? " pending" : ""}`} onClick={() => loadSnapshot()}>
            {status}
          </button>
        </div>
      </header>
      <section className="profile-strip">
        <div className="avatar">{(user?.firstName || user?.first_name || user?.username || "G").slice(0, 1)}</div>
        <div>
          <strong>{user?.username || user?.firstName || user?.first_name || "Player"}</strong>
          <span>{config?.telegramBotUsername ? `@${config.telegramBotUsername}` : "VPS runtime"}</span>
        </div>
      </section>
      <section className="stats-row">
        <Stat icon={Sparkles} label="Gold" value={formatCount(resources.gold || 0)} />
        <Stat icon={Zap} label="Energy" value={`${energy.current ?? 0}/${energy.max ?? 0}`} />
        <Stat icon={PackageOpen} label="Tokens" value={resources.gachaTokens || 0} />
      </section>
      {message && <button className="notice" onClick={() => useGameHub.setState({ message: "" })}>{message}</button>}
      {!snapshot ? (
        <div className="loading-panel">Loading player snapshot</div>
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
          {TABS.map(({ id, label, icon: Icon }) => (
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
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </LayoutGroup>
    </main>
  );
}
