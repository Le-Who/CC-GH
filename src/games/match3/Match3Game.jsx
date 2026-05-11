import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, Gem, Home, Play, RotateCcw, Trophy } from "lucide-react";
import { api } from "../../services/apiClient.js";
import { audioManager } from "../../services/audioManager.js";
import { haptic } from "../../platform/telegram.js";
import { generateBoard, hasValidMoves, attemptMatch3Move, seedDropTokens } from "../../game-core/match3/engine.js";
import { estimateMatch3CascadeLockMs } from "../../game-core/match3/animation.js";
import { PixiScene } from "../../app/PixiScene.jsx";
import { GamePlayHud, GameShell, PanelButton, Stat } from "../../app/shell.jsx";
import { useAction, useExitToHub, useImmersiveGame, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
import { Leaderboard } from "../../app/Leaderboard.jsx";
import { selectMatch3InitialRun } from "./selectMatch3Run.js";
import { loadRuntimeAssetManifest, resolveAssetUrl } from "../../game-runtime/assetBundles.js";
import "./i18n.js";
import "./match3.css";
const MATCH3_MODES = [
  { id: "classic", labelKey: "match3.mode.classic", hintKey: "match3.mode.classicHint" },
  { id: "timed", labelKey: "match3.mode.timed", hintKey: "match3.mode.timedHint" },
  { id: "drop", labelKey: "match3.mode.drop", hintKey: "match3.mode.dropHint" },
];

function createSwappedMatch3Board(board, from, to) {
  const next = board.map((row) => [...row]);
  if (next[from.y]?.[from.x] && next[to.y]?.[to.x]) {
    [next[from.y][from.x], next[to.y][to.x]] = [next[to.y][to.x], next[from.y][from.x]];
  }
  return next;
}

function cssImageUrl(value) {
  return value ? `url(${JSON.stringify(value)})` : "none";
}

function match3RuntimeCssArt(runtimeAssetManifest, key) {
  if (runtimeAssetManifest === undefined) return "none";
  return cssImageUrl(resolveAssetUrl(key, { runtimeManifest: runtimeAssetManifest }));
}

export default function Match3Game() {
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
  const [runtimeAssetManifest, setRuntimeAssetManifest] = useState(undefined);
  const animationTimerRef = useRef(null);
  const restoredRunKeyRef = useRef("");
  const isPlaying = gameActive && !paused;
  const activePause = gameActive && paused;
  const currentMode = MATCH3_MODES.find((item) => item.id === mode) || MATCH3_MODES[0];
  const currentReward = score > 0 ? Math.max(5, Math.floor(score / 25)) : 0;
  const pauseRun = useCallback(() => {
    if (gameActive) setPaused(true);
  }, [gameActive]);
  const shellControls = useMemo(() => ({
    activeRun: gameActive,
    pauseRun,
    hudState: { score, movesLeft, combo, mode },
  }), [combo, gameActive, mode, movesLeft, pauseRun, score]);
  useImmersiveGame("match3", true, shellControls);

  useEffect(() => {
    let active = true;
    loadRuntimeAssetManifest().then((manifest) => {
      if (active) setRuntimeAssetManifest(manifest);
    });
    return () => {
      active = false;
    };
  }, []);

  const runtimeArtStyle = useMemo(() => ({
    "--match3-table-art": match3RuntimeCssArt(runtimeAssetManifest, "match3.background.table"),
    "--match3-hud-art": match3RuntimeCssArt(runtimeAssetManifest, "match3.ui.hudBar"),
    "--match3-menu-panel-art": match3RuntimeCssArt(runtimeAssetManifest, "match3.ui.menuPanel"),
  }), [runtimeAssetManifest]);

  useEffect(() => {
    api("/api/leaderboard").then((data) => {
      if (Array.isArray(data)) setLeaders(data);
    });
  }, [snapshot?.match3?.highScore]);

  function createModeBoard(nextMode = mode) {
    const nextBoard = generateBoard();
    return nextMode === "drop" ? seedDropTokens(nextBoard, 3) : nextBoard;
  }

  function createDefaultRun(nextMode = mode) {
    return {
      board: createModeBoard(nextMode),
      score: 0,
      movesLeft: nextMode === "timed" ? 90 : 30,
      combo: 0,
      mode: nextMode,
    };
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

  useEffect(() => {
    const current = snapshot?.match3?.currentGame;
    if (gameActive || !Array.isArray(current?.board) || current.board.length === 0) return;
    const runKey = `${current.mode || "classic"}:${current.score || 0}:${current.movesLeft || 0}:${current.board.length}:${current.board[0]?.join("") || ""}`;
    if (restoredRunKeyRef.current === runKey) return;
    const restored = selectMatch3InitialRun(snapshot, createDefaultRun);
    restoredRunKeyRef.current = runKey;
    setMode(restored.mode);
    setBoard(restored.board);
    setScore(restored.score);
    setMovesLeft(restored.movesLeft);
    setCombo(restored.combo);
    setGameActive(true);
    setPaused(false);
    setInputLocked(false);
    setSelected(null);
    setMatchAnimation(null);
  }, [gameActive, snapshot]);

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
      match3Timer: mode === "timed" ? {
        label: `${Math.max(0, movesLeft)}s`,
        progress: Math.max(0, Math.min(1, movesLeft / 90)),
        tone: movesLeft <= 10 ? "critical" : movesLeft <= 30 ? "warning" : "calm",
      } : null,
      match3StatusText: `${t(currentMode.labelKey)} · ${score} ${t("common.score").toLowerCase()} · ${movesLeft} ${(mode === "timed" ? t("common.time") : t("common.moves")).toLowerCase()}`,
      selectedGem: selected,
      match3Animation: matchAnimation,
      onMatch3Cell: onCell,
      onMatch3Swap: attemptSwap,
      fallbackBoard: board,
    }),
    [attemptSwap, board, combo, currentMode.labelKey, inputLocked, isPlaying, matchAnimation, mode, movesLeft, onCell, score, selected, t],
  );

  return (
    <GameShell
      gameId="match3"
      phase={isPlaying ? "playing" : gameActive ? "paused" : "menu"}
      skin="potion"
      className="match3-shell"
      overlayClassName={`match3-menu-overlay${activePause ? " match3-pause-compact" : ""}`}
      onDismiss={activePause ? () => setPaused(false) : null}
      style={runtimeArtStyle}
      hud={(
        <GamePlayHud
          className="match3-scene-hud"
          title={t("match3.title")}
          stats={[
            { label: t("common.score"), value: score },
            { label: mode === "timed" ? t("common.time") : t("common.moves"), value: movesLeft },
            { label: t("common.combo"), value: combo || "-" },
          ]}
          onPause={() => setPaused(true)}
        />
      )}
      overlay={(
        activePause ? (
          <>
            <div className="match3-compact-pause-card" data-compact-pause="match3">
              <span>{t("pause.paused")}</span>
              <strong>{t("match3.title")}</strong>
              <div className="pause-status-line">
                <span>{t("common.score")} <b>{score}</b></span>
                <span>{mode === "timed" ? t("common.time") : t("common.moves")} <b>{movesLeft}</b></span>
                <span>{t("common.combo")} <b>{combo || "-"}</b></span>
              </div>
            </div>
            <div className="pause-action-stack">
              <PanelButton icon={Play} className="pause-primary" onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
              <div className="button-row">
                <PanelButton icon={Check} onClick={() => finish(score)}>{t("common.endRun")}</PanelButton>
                <PanelButton icon={RotateCcw} subtle onClick={() => start(mode)}>{t("common.new")}</PanelButton>
                <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="panel-header pause-panel-header">
              <div>
                <strong>{t("match3.title")}</strong>
              </div>
              <PanelButton icon={gameActive ? RotateCcw : Play} className={!gameActive ? "pause-primary" : ""} onClick={() => start(mode)}>{gameActive ? t("common.new") : t("common.start")}</PanelButton>
            </div>
          {!gameActive ? (
            <div className="mode-grid" data-mode-selector="match3">
              {MATCH3_MODES.map((item) => (
                <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>
                  <span className="mode-choice-selected" aria-hidden="true" />
                  <strong>{t(item.labelKey)}</strong>
                  <small>{t(item.hintKey)}</small>
                </button>
              ))}
            </div>
          ) : !activePause && (
            <div className="pause-menu-callout">{t("pause.match3NoModeChange")}</div>
          )}
          {!activePause && gameActive && (
            <>
              <div className="metric-grid">
                <Stat icon={Trophy} label={t("common.score")} value={score} />
                <Stat icon={Clock} label={mode === "timed" ? t("common.time") : t("common.moves")} value={movesLeft} />
                <Stat icon={Gem} label={t("common.reward")} value={currentReward} />
              </div>
              <div className="button-row">
                <PanelButton icon={Check} disabled={!gameActive} onClick={() => finish(score)}>{t("common.settle")}</PanelButton>
                <PanelButton icon={RotateCcw} subtle disabled={gameActive} onClick={() => setBoard(createModeBoard(mode))}>{t("match3.reshuffle")}</PanelButton>
                <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
              </div>
            </>
          )}
          {!activePause && !gameActive && (
            <>
              <div className="button-row two match3-menu-actions">
                <PanelButton icon={RotateCcw} subtle onClick={() => setBoard(createModeBoard(mode))}>{t("match3.reshuffle")}</PanelButton>
                <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
              </div>
              <div className="match3-menu-leaderboard">
                <Leaderboard entries={leaders.slice(0, 3)} />
              </div>
            </>
          )}
          </>
        )
      )}
    >
      <PixiScene sceneKey="match3" sceneState={sceneState} />
    </GameShell>
  );
}
