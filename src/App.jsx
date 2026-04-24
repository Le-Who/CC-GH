import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  PawPrint,
  Play,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Trash2,
  Trophy,
  Volume2,
  Zap,
} from "lucide-react";
import { api, getPublicConfig } from "./services/apiClient.js";
import { connectRealtime } from "./services/realtimeClient.js";
import { getTelegramUser, haptic, initTelegramPlatform } from "./platform/telegram.js";
import PixiGameHost from "./game-runtime/PixiGameHost.jsx";
import {
  buildBloxScene,
  buildFarmScene,
  buildMatch3Scene,
  buildMergeScene,
} from "./game-runtime/scenes.js";
import { useGameHub } from "./game-state/useGameHub.js";
import { listPositive } from "./game-state/inventory.js";
import {
  BOARD_SIZE,
  cloneBoard,
  findMatches,
  generateBoard,
  hasValidMoves,
  resolveBoard,
} from "./game-core/match3/engine.js";
import { CROPS, ECONOMY, MERGE_CHAINS, ROOM_DECORATIONS } from "../game-logic.js";

const TABS = [
  { id: "farm", label: "Farm", icon: Leaf },
  { id: "blox", label: "Blox", icon: Blocks },
  { id: "match3", label: "Gems", icon: Gem },
  { id: "merge", label: "Merge", icon: PackageOpen },
  { id: "trivia", label: "Trivia", icon: Bot },
  { id: "room", label: "Room", icon: Home },
];

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
      className={`panel-button${danger ? " danger" : ""}${subtle ? " subtle" : ""}${active ? " active" : ""}`}
      disabled={disabled}
      onClick={onClick}
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

function FarmGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const [farmTab, setFarmTab] = useState("shop");
  const [selectedSeed, setSelectedSeed] = useState("strawberry");
  const [buyQty, setBuyQty] = useState(1);
  const [tick, setTick] = useState(0);
  const farm = snapshot?.farm || {};
  const inventory = snapshot?.inventory || {};
  const crops = snapshot?.meta?.crops || CROPS;
  const unlockedSeeds = farm.unlockedSeeds || ["strawberry", "blueberry"];

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

  const sceneState = useMemo(
    () => ({ snapshot: { ...snapshot, serverTime: Date.now() + tick }, selectedSeed, onFarmPlot: onPlot }),
    [snapshot, selectedSeed, onPlot, tick],
  );

  return (
    <div className="game-layout farm-layout">
      <PixiGameHost sceneKey="farm" buildScene={buildFarmScene} sceneState={sceneState} />
      <aside className="side-panel">
        <div className="panel-header">
          <div>
            <strong>Cozy Farm</strong>
            <span>Lv {farm.level || 1} · {farm.xp || 0} XP</span>
          </div>
          <PanelButton icon={Check} onClick={() => performAction("farm.harvestAll")}>Harvest All</PanelButton>
        </div>
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
  const [selectedPiece, setSelectedPiece] = useState(-1);
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

  useEffect(() => {
    api("/api/blox/leaderboard").then((data) => {
      if (Array.isArray(data)) setLeaders(data);
    });
  }, [state.highScore]);

  const onCell = useCallback(
    (row, col) => {
      if (selectedPiece < 0 || !state.gameActive) return;
      performAction("blox.place", { pieceIdx: selectedPiece, row, col }, { key: "blox.place" }).then((result) => {
        if (!result.error) setSelectedPiece(-1);
      });
    },
    [performAction, selectedPiece, state.gameActive],
  );

  const sceneState = useMemo(
    () => ({ blox: state, selectedBloxPiece: selectedPiece, onBloxCell: onCell, onBloxTray: setSelectedPiece }),
    [state, selectedPiece, onCell],
  );

  return (
    <div className="game-layout">
      <PixiGameHost sceneKey="blox" buildScene={buildBloxScene} sceneState={sceneState} />
      <aside className="side-panel">
        <div className="panel-header">
          <div>
            <strong>Building Blox</strong>
            <span>Best {state.highScore} · Reward {state.score ? Math.min(400, Math.floor(state.score * 0.35)) : 0}</span>
          </div>
          <PanelButton icon={state.gameActive ? RotateCcw : Play} onClick={() => performAction("blox.start")}>
            {state.gameActive ? "Restart" : "Start"}
          </PanelButton>
        </div>
        <div className="metric-grid">
          <Stat icon={Trophy} label="Score" value={state.score || 0} />
          <Stat icon={Blocks} label="Lines" value={state.linesCleared || 0} />
          <Stat icon={Zap} label="Cost" value={ECONOMY.COST_BLOX} />
        </div>
        <div className="button-row">
          <PanelButton icon={Check} disabled={!state.gameActive} onClick={() => performAction("blox.end", { score: state.score })}>End Run</PanelButton>
          <PanelButton icon={Volume2} subtle onClick={() => haptic("light")}>Sound</PanelButton>
        </div>
        <Leaderboard entries={leaders} />
      </aside>
    </div>
  );
}

function Match3Game() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const [mode, setMode] = useState("classic");
  const [board, setBoard] = useState(() => generateBoard());
  const [selected, setSelected] = useState(null);
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(30);
  const [combo, setCombo] = useState(0);
  const [gameActive, setGameActive] = useState(false);
  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    api("/api/leaderboard").then((data) => {
      if (Array.isArray(data)) setLeaders(data);
    });
  }, [snapshot?.match3?.highScore]);

  function start(nextMode = mode) {
    const nextBoard = generateBoard();
    setBoard(nextBoard);
    setScore(0);
    setCombo(0);
    setMovesLeft(nextMode === "timed" ? 90 : 30);
    setGameActive(true);
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
    setSelected(null);
    performAction("match3.end", { score: finalScore, fromQuit });
  }

  function maybeEnd(nextMoves, nextScore) {
    if (nextMoves <= 0 && mode !== "timed") finish(nextScore);
  }

  const onCell = useCallback(
    (x, y) => {
      if (!gameActive) return;
      if (!selected) {
        setSelected({ x, y });
        return;
      }
      const adjacent = Math.abs(selected.x - x) + Math.abs(selected.y - y) === 1;
      if (!adjacent) {
        setSelected({ x, y });
        return;
      }
      const nextBoard = cloneBoard(board);
      [nextBoard[selected.y][selected.x], nextBoard[y][x]] = [nextBoard[y][x], nextBoard[selected.y][selected.x]];
      if (!findMatches(nextBoard).length) {
        setSelected(null);
        haptic("warning");
        return;
      }
      const resolved = resolveBoard(nextBoard);
      const nextScore = score + resolved.totalPoints;
      const nextMoves = mode === "timed" ? movesLeft : movesLeft - 1;
      if (!hasValidMoves(nextBoard)) {
        setBoard(generateBoard());
      } else {
        setBoard(nextBoard);
      }
      setScore(nextScore);
      setCombo(Math.max(combo, resolved.combo));
      setMovesLeft(nextMoves);
      setSelected(null);
      performAction("match3.syncMode", {
        game: { score: nextScore, movesLeft: nextMoves, combo: resolved.combo, mode },
        savedModes: { ...(snapshot?.match3?.savedModes || {}), [mode]: { board: nextBoard, score: nextScore, movesLeft: nextMoves, combo: resolved.combo } },
      }, { silent: true, key: "match3.sync" });
      maybeEnd(nextMoves, nextScore);
    },
    [board, combo, gameActive, mode, movesLeft, performAction, score, selected, snapshot?.match3?.savedModes],
  );

  const sceneState = useMemo(
    () => ({
      match3: { board, score, movesLeft, combo, gameMode: mode, gameActive },
      selectedGem: selected,
      onMatch3Cell: onCell,
      fallbackBoard: board,
    }),
    [board, combo, gameActive, mode, movesLeft, onCell, score, selected],
  );

  return (
    <div className="game-layout">
      <PixiGameHost sceneKey="match3" buildScene={buildMatch3Scene} sceneState={sceneState} />
      <aside className="side-panel">
        <div className="panel-header">
          <div>
            <strong>Gem Crush</strong>
            <span>Best {snapshot?.match3?.highScore || 0} · Combo {combo || "-"}</span>
          </div>
          <PanelButton icon={Play} onClick={() => start(mode)}>{gameActive ? "New" : "Start"}</PanelButton>
        </div>
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
          <PanelButton icon={RotateCcw} subtle onClick={() => setBoard(generateBoard())}>Reshuffle</PanelButton>
        </div>
        <Leaderboard entries={leaders} />
      </aside>
    </div>
  );
}

function MergeGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const merge = snapshot?.merge || {};
  const inventory = snapshot?.inventory || {};
  const [selectedFuel, setSelectedFuel] = useState({});
  const [selectedCell, setSelectedCell] = useState(null);
  const [trashMode, setTrashMode] = useState(false);

  const harvestedEntries = listPositive(inventory.harvested || {});
  const firstFuel = harvestedEntries[0]?.[0];

  const onMergeCell = useCallback(
    (r, c, item) => {
      if (trashMode) {
        if (item) performAction("merge.trash", { r, c }, { key: "merge.trash" });
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
      performAction("merge.merge", { fromR: selectedCell.r, fromC: selectedCell.c, toR: r, toC: c }, { key: "merge.merge" }).then((result) => {
        if (!result.error) setSelectedCell(null);
      });
    },
    [performAction, selectedCell, trashMode],
  );

  const sceneState = useMemo(
    () => ({ merge, mergeSelected: selectedCell, trashMode, onMergeCell }),
    [merge, onMergeCell, selectedCell, trashMode],
  );

  return (
    <div className="game-layout">
      <PixiGameHost sceneKey="merge" buildScene={buildMergeScene} sceneState={sceneState} />
      <aside className="side-panel">
        <div className="panel-header">
          <div>
            <strong>Gacha Merge</strong>
            <span>{merge.freeTapCharges || 0} free taps · {inventory.rewards?.gachaTokens || 0} tokens</span>
          </div>
          <PanelButton icon={Trash2} danger={trashMode} active={trashMode} onClick={() => setTrashMode((value) => !value)}>Trash</PanelButton>
        </div>
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
    setView("duel-play");
  }

  async function pollDuelStatus(id = roomId) {
    if (!id) return;
    const data = await api(`/api/trivia/duel/status/${id}`);
    if (!data.error) setDuelStatus(data);
    if (data.status === "active") await startDuel();
  }

  return (
    <div className="trivia-shell">
      <aside className="trivia-card">
        <div className="panel-header">
          <div>
            <strong>Brain Blitz</strong>
            <span>Total {snapshot?.trivia?.totalScore || 0} · Best streak {snapshot?.trivia?.bestStreak || 0}</span>
          </div>
        </div>
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
            <PanelButton icon={RotateCcw} onClick={() => setView("menu")}>Back</PanelButton>
          </div>
        )}
      </aside>
      <aside className="side-panel">
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
  const room = snapshot?.room || {};
  const pet = snapshot?.pet || {};
  const inventory = snapshot?.inventory?.roomInventory || [];
  const [selectedDeco, setSelectedDeco] = useState("");
  const [rename, setRename] = useState(pet.name || "");

  useEffect(() => setRename(pet.name || ""), [pet.name]);

  return (
    <div className="room-layout">
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
      <aside className="side-panel">
        <div className="panel-header">
          <div>
            <strong>{pet.name || "Buddy"}</strong>
            <span>Lv {pet.level || 1} · Affection {pet.affectionLevel || 1}</span>
          </div>
          <PawPrint />
        </div>
        <div className="metric-grid">
          <Stat icon={PawPrint} label="Fullness" value={`${pet.stats?.fullness || 0}/100`} />
          <Stat icon={Sparkles} label="Happy" value={`${pet.stats?.happiness || 0}/100`} />
          <Stat icon={BadgeCheck} label="Orders" value={pet.activeOrders?.length || 0} />
        </div>
        <div className="join-row">
          <input value={rename} onChange={(e) => setRename(e.target.value)} maxLength={16} />
          <PanelButton icon={Check} onClick={() => performAction("pet.rename", { newName: rename })}>Rename</PanelButton>
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
  if (activeTab === "trivia") return <TriviaGame />;
  return <RoomGame />;
}

export default function App() {
  const activeTab = useGameHub((state) => state.activeTab);
  const setActiveTab = useGameHub((state) => state.setActiveTab);
  const snapshot = useSnapshot();
  const loadSnapshot = useGameHub((state) => state.loadSnapshot);
  const applyRealtimePayload = useGameHub((state) => state.applyRealtimePayload);
  const status = useGameHub((state) => state.status);
  const message = useGameHub((state) => state.message);
  const [platform, setPlatform] = useState(null);
  const [config, setConfig] = useState(null);
  const user = useMemo(() => getTelegramUser(), [platform]);

  useEffect(() => {
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
    };
  }, [applyRealtimePayload, loadSnapshot]);

  const resources = snapshot?.resources || {};
  const energy = resources.energy || {};

  return (
    <main className="telegram-app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Telegram Mini App</p>
          <h1>Game Hub</h1>
        </div>
        <button className={`status-dot ${status}`} onClick={() => loadSnapshot()}>
          {status}
        </button>
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
      {!snapshot ? <div className="loading-panel">Loading player snapshot</div> : <ActiveGame />}
      <nav className="bottom-tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={activeTab === id ? "active" : ""}
            onClick={() => {
              setActiveTab(id);
              haptic("light");
            }}
          >
            <Icon size={19} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
