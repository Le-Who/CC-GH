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
  const animationTimerRef = useRef(null);
  const isPlaying = gameActive && !paused;
  const currentMode = MATCH3_MODES.find((item) => item.id === mode) || MATCH3_MODES[0];
  const currentReward = score > 0 ? Math.max(5, Math.floor(score / 25)) : 0;
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
      skin="cycle"
      hud={(
        <GamePlayHud
          title={t("match3.title")}
          subtitle={`${t(currentMode.labelKey)} · ${t("common.best").toLowerCase()} ${snapshot?.match3?.highScore || 0}`}
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
          <div className="panel-header pause-panel-header">
            <div>
              <strong>{t("match3.title")}</strong>
              <span>{t("common.best")} {snapshot?.match3?.highScore || 0} · {t("common.combo")} {combo || "-"}</span>
            </div>
            <PanelButton icon={gameActive ? RotateCcw : Play} className={!gameActive ? "pause-primary" : ""} onClick={() => start(mode)}>{gameActive ? t("common.new") : t("common.start")}</PanelButton>
          </div>
          <div className="pause-menu-frame pause-menu-match3" data-pause-menu="match3">
            <span className="pause-menu-kicker">{gameActive ? t("pause.paused") : t("pause.ready")}</span>
            <strong>{gameActive ? t("pause.match3Frozen") : t("pause.match3Ready")}</strong>
            <small>{gameActive ? t("pause.match3Locked") : t("pause.match3Choose")}</small>
            <div className="pause-menu-context">
              <span>{t(currentMode.labelKey)} <b>{mode === "timed" ? t("common.time") : t("common.moves")}</b></span>
              <span>{t("common.combo")} <b>{combo || "-"}</b></span>
              <span>{t("common.reward")} <b>{currentReward}</b></span>
            </div>
          </div>
          {gameActive && paused && (
            <div className="pause-action-stack">
              <PanelButton icon={Play} className="pause-primary" onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
              <div className="button-row two">
                <PanelButton icon={Check} onClick={() => finish(score)}>{t("common.settle")}</PanelButton>
                <PanelButton icon={RotateCcw} subtle onClick={() => start(mode)}>{t("common.new")}</PanelButton>
              </div>
            </div>
          )}
          {!gameActive ? (
            <div className="mode-grid" data-mode-selector="match3">
              {MATCH3_MODES.map((item) => (
                <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>
                  <strong>{t(item.labelKey)}</strong>
                  <small>{t(item.hintKey)}</small>
                </button>
              ))}
            </div>
          ) : (
            <div className="pause-menu-callout">{t("pause.match3NoModeChange")}</div>
          )}
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
          <Leaderboard entries={leaders} />
        </>
      )}
    >
      <PixiScene sceneKey="match3" sceneState={sceneState} />
    </GameShell>
  );
}
