import {usePublicLeaderboard} from "../../app/usePublicLeaderboard.js";
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {audioManager} from '../../services/audioManager.js';
import {haptic} from '../../platform/telegram.js';
import {applyMatch3Booster,attemptMatch3Move,generateBoard,hasValidMoves,normalizeMatch3Boosters,seedDropTokens} from '../../game-core/match3/engine.js';
import {useAction,useExitToHub,useImmersiveGame,useSnapshot} from '../../app/gameHooks.js';
import {useAppI18n} from '../../app/i18n.jsx';
import {selectMatch3InitialRun} from './selectMatch3Run.js';
import {loadRuntimeAssetManifest} from '../../game-runtime/assetBundles.js';
import {calcGoldReward} from '../../../game-logic/economy.js';
import {getRewardChestProgress} from '../../../game-logic/hud-bonuses.js';
import Match3Presentation from './Match3Presentation.jsx';
import {createMatch3Clock,advanceMatch3Clock,match3ClockSeconds} from './match3Clock.js';
import {getQueuedMatch3Action} from './match3ActionQueue.js';
import './i18n.js';

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
  const directAction = useAction();
  const performAction = useMemo(() => getQueuedMatch3Action(directAction), [directAction]);
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
  const leaders = usePublicLeaderboard("/api/leaderboard", snapshot?.match3?.highScore);
  const [runtimeAssetManifest, setRuntimeAssetManifest] = useState(undefined);
  const [shuffleCharges, setShuffleCharges] = useState(1);
  const [boosters, setBoosters] = useState(() => normalizeMatch3Boosters());
  const [activeBooster, setActiveBooster] = useState("");
  const animationIdRef = useRef(null);
  const pendingFinishRef = useRef(null);
  const inputLockRef = useRef(false);
  const mountedRef = useRef(true);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [motionFeedback, setMotionFeedback] = useState(null);
  const restoredRunKeyRef = useRef("");
  const clockRef = useRef(createMatch3Clock(30));
  const tickClockRef = useRef(null);
  const finishRef = useRef(null);
  const finishedRef = useRef(false);
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const isPlaying = gameActive && !paused;
  const currentMode = MATCH3_MODES.find((item) => item.id === mode) || MATCH3_MODES[0];
  const rewardChest = getRewardChestProgress(score);
  const currentReward = score > 0 ? calcGoldReward(Number(score) || 0) : 0;
  const selectedGemType = selected ? board[selected.y]?.[selected.x] || "" : "";
  const pauseRun = useCallback(() => {
    if (gameActive) {
      tickClockRef.current?.();
      pausedRef.current = true;
      setPaused(true);
    }
  }, [gameActive]);
  const savedRun = snapshot?.match3?.currentGame;
  const shellControls = useMemo(() => ({
    activeRun: gameActive || !!savedRun,
    pauseRun,
    safeLeave: async () => {
      if (!gameActive && !savedRun) return true;
      const result = await performAction('match3.end', { score: gameActive ? scoreRef.current : Number(savedRun?.score) || 0, fromQuit: true });
      return result?.success === true && !result.error;
    },
    hudState: { score, movesLeft, combo, mode },
  }), [combo, gameActive, savedRun, mode, movesLeft, pauseRun, performAction, score]);
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
      boosters: normalizeMatch3Boosters(),
    };
  }

  const queueMatchAnimation = useCallback((animation) => {
    const id = `${animation.type}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    animationIdRef.current = id;
    inputLockRef.current = true;
    setInputLocked(true);
    setMatchAnimation({ ...animation, id });
  }, []);
  const onAnimationComplete = useCallback((id) => {
    if (!mountedRef.current || id !== animationIdRef.current) return;
    animationIdRef.current = null;
    inputLockRef.current = false;
    setInputLocked(false);
    setMatchAnimation(current => current?.id === id ? null : current);
    const pending = pendingFinishRef.current;
    if (pending?.id === id) { pendingFinishRef.current = null; finishRef.current?.(pending.score); }
  }, []);
  const onMotionPhase = useCallback((feedback) => {
    if (mountedRef.current && feedback.id === animationIdRef.current) setMotionFeedback(feedback);
  }, []);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; animationIdRef.current = null; inputLockRef.current = false; };
  }, []);

  useEffect(() => {
    const current = snapshot?.match3?.currentGame;
    if (finishedRef.current || gameActive) return;
    // syncMode stores run metrics separately from savedModes.board. Recover a
    // terminal accepted move even when the currentGame projection has no board.
    if (current && Number(current.movesLeft) <= 0) {
      const finalScore = Math.max(0, Number(current.score) || 0);
      setMode(current.mode || "classic");
      setScore(finalScore);
      scoreRef.current = finalScore;
      setMovesLeft(0);
      setCombo(Math.max(0, Number(current.combo) || 0));
      finish(finalScore);
      return;
    }
    if (!Array.isArray(current?.board) || current.board.length === 0) return;
    const runKey = `${current.mode || "classic"}:${current.score || 0}:${current.movesLeft || 0}:${current.board.length}:${current.board[0]?.join("") || ""}`;
    if (restoredRunKeyRef.current === runKey) return;
    const restored = selectMatch3InitialRun(snapshot, createDefaultRun);
    restoredRunKeyRef.current = runKey;
    finishedRef.current = false;
    pendingFinishRef.current = null;
    clockRef.current = createMatch3Clock(restored.movesLeft);
    scoreRef.current = restored.score;
    setMode(restored.mode);
    setBoard(restored.board);
    setScore(restored.score);
    setMovesLeft(restored.movesLeft);
    setCombo(restored.combo);
    setGameActive(true);
    pausedRef.current = false;
    setPaused(false);
    inputLockRef.current = false;
    animationIdRef.current = null;
    setInputLocked(false);
    setSelected(null);
    setMatchAnimation(null);
    setShuffleCharges(1);
    setBoosters(normalizeMatch3Boosters(restored.boosters));
    setActiveBooster("");
  }, [gameActive, snapshot]);

  function start(nextMode = mode) {
    finishedRef.current = false;
    pendingFinishRef.current = null;
    clockRef.current = createMatch3Clock(nextMode === "timed" ? 90 : 30);
    clockRef.current.lastAt = performance.now();
    clockRef.current.hidden = typeof document !== "undefined" && document.hidden;
    scoreRef.current = 0;
    const nextBoard = createModeBoard(nextMode);
    const nextBoosters = normalizeMatch3Boosters();
    setBoard(nextBoard);
    setScore(0);
    setCombo(0);
    setMovesLeft(nextMode === "timed" ? 90 : 30);
    setGameActive(true);
    pausedRef.current = false;
    setPaused(false);
    inputLockRef.current = false;
    animationIdRef.current = null;
    setInputLocked(false);
    setMotionFeedback(null);
    setMatchAnimation(null);
    setShuffleCharges(1);
    setBoosters(nextBoosters);
    setActiveBooster("");
    setMode(nextMode);
    performAction("match3.start", { mode: nextMode }, { key: "match3.start" });
    // Queue the initial board immediately, before a player can enqueue the first move.
    performAction("match3.syncMode", {
      game: { score: 0, movesLeft: nextMode === "timed" ? 90 : 30, combo: 0, mode: nextMode, boosters: nextBoosters },
      savedModes: { ...(snapshot?.match3?.savedModes || {}), [nextMode]: { board: nextBoard, score: 0, movesLeft: nextMode === "timed" ? 90 : 30, combo: 0, boosters: nextBoosters } },
    }, { silent: true });
  }

  function finish(finalScore = scoreRef.current, fromQuit = false) {
    if (finishedRef.current) return;
    finishedRef.current = true;
    pendingFinishRef.current = null;
    setGameActive(false);
    setPaused(false);
    setSelected(null);
    inputLockRef.current = false;
    animationIdRef.current = null;
    setInputLocked(false);
    setMatchAnimation(null);
    setActiveBooster("");
    performAction("match3.end", { score: finalScore, fromQuit });
  }

  function maybeEnd(nextMoves, nextScore) {
    if (nextMoves <= 0 && mode !== "timed") {
      if (animationIdRef.current) pendingFinishRef.current = { id: animationIdRef.current, score: nextScore };
      else finish(nextScore);
    }
  }

  const useShuffleBooster = useCallback(() => {
    if (!gameActive || finishedRef.current || pausedRef.current || inputLockRef.current || inputLocked || shuffleCharges <= 0) return;
    const nextBoard = createModeBoard(mode);
    setBoard(nextBoard);
    setSelected(null);
    setShuffleCharges((value) => Math.max(0, value - 1));
    audioManager.play("tap");
    performAction("match3.syncMode", {
      game: { score, movesLeft, combo, mode, boosters },
      savedModes: { ...(snapshot?.match3?.savedModes || {}), [mode]: { board: nextBoard, score, movesLeft, combo, boosters } },
    }, { silent: true, key: "match3.shuffleBooster" });
  }, [boosters, combo, gameActive, inputLocked, mode, movesLeft, performAction, score, shuffleCharges, snapshot?.match3?.savedModes]);

  finishRef.current = finish;
  useEffect(() => {
    if (!gameActive || paused || mode !== "timed" || finishedRef.current) return undefined;
    let disposed = false;
    clockRef.current.lastAt = performance.now();
    clockRef.current.hidden = typeof document !== "undefined" && document.hidden;
    const tick = () => {
      if (disposed || finishedRef.current) return;
      clockRef.current = advanceMatch3Clock(clockRef.current, performance.now(), document.hidden);
      const remaining = match3ClockSeconds(clockRef.current);
      setMovesLeft(value => value === remaining ? value : remaining);
      if (remaining === 0) finishRef.current?.(scoreRef.current);
    };
    tickClockRef.current = tick;
    const interval = window.setInterval(tick, 100);
    document.addEventListener("visibilitychange", tick);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
      if (tickClockRef.current === tick) tickClockRef.current = null;
    };
  }, [gameActive, paused, mode]);

  const attemptSwap = useCallback(
    (from, to) => {
      if (!gameActive || finishedRef.current || pausedRef.current || inputLockRef.current || inputLocked || movesLeft <= 0) return;
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
        queueMatchAnimation({ type: "invalid", from, to, fromGem, toGem, startBoard: board, finalBoard: board });
        haptic("warning");
        audioManager.play("warning");
        return;
      }
      let nextBoard = result.board;
      const nextScore = score + result.totalPoints;
      const nextMoves = mode === "timed" ? match3ClockSeconds(clockRef.current) : movesLeft - 1;
      if (!hasValidMoves(nextBoard)) {
        nextBoard = createModeBoard(mode);
      }
      const swapBoard = createSwappedMatch3Board(board, from, to);
      setBoard(nextBoard);
      scoreRef.current = nextScore;
      setScore(nextScore);
      setCombo(Math.max(combo, result.combo));
      setMovesLeft(nextMoves);
      setSelected(null);
      queueMatchAnimation(
        { type: "cascade", from, to, fromGem, toGem, startBoard: board, swapBoard, steps: result.steps, finalBoard: nextBoard },
      );
      haptic("success");
      audioManager.play(result.dropCollected?.length || result.combo > 1 || result.special ? "clear" : "merge");
      performAction("match3.syncMode", {
        game: { score: nextScore, movesLeft: nextMoves, combo: result.combo, mode, boosters },
        savedModes: { ...(snapshot?.match3?.savedModes || {}), [mode]: { board: nextBoard, score: nextScore, movesLeft: nextMoves, combo: result.combo, boosters } },
      }, { silent: true, key: "match3.sync" });
      maybeEnd(nextMoves, nextScore);
    },
    [board, boosters, combo, gameActive, inputLocked, mode, movesLeft, performAction, queueMatchAnimation, score, snapshot?.match3?.savedModes],
  );

  const useMatch3BoosterAt = useCallback((x, y) => {
    if (!gameActive || finishedRef.current || pausedRef.current || inputLockRef.current || inputLocked || !activeBooster || (boosters[activeBooster] || 0) <= 0) return false;
    const target = { x, y };
    const targetGem = board[y]?.[x];
    const result = applyMatch3Booster(board, activeBooster, x, y, { collectDrops: mode === "drop" });
    if (!result.valid) {
      queueMatchAnimation({ type: "invalid", from: target, to: target, fromGem: targetGem, toGem: targetGem, startBoard: board, finalBoard: board });
      haptic("warning");
      audioManager.play("warning");
      return true;
    }
    let nextBoard = result.board;
    if (!hasValidMoves(nextBoard)) {
      nextBoard = createModeBoard(mode);
    }
    const nextScore = score + result.totalPoints;
    const nextCombo = Math.max(combo, result.combo);
    const nextBoosters = normalizeMatch3Boosters({
      ...boosters,
      [activeBooster]: Math.max(0, (Number(boosters[activeBooster]) || 0) - 1),
    });
    setBoard(nextBoard);
    scoreRef.current = nextScore;
    setScore(nextScore);
    setCombo(nextCombo);
    setSelected(null);
    setBoosters(nextBoosters);
    setActiveBooster("");
    queueMatchAnimation(
      { type: "cascade", from: target, to: target, fromGem: targetGem, toGem: targetGem, startBoard: board, swapBoard: board, steps: result.steps, booster: activeBooster, finalBoard: nextBoard },
    );
    haptic("success");
    audioManager.play("clear");
    performAction("match3.syncMode", {
      game: { score: nextScore, movesLeft, combo: nextCombo, mode, boosters: nextBoosters },
      savedModes: { ...(snapshot?.match3?.savedModes || {}), [mode]: { board: nextBoard, score: nextScore, movesLeft, combo: nextCombo, boosters: nextBoosters } },
    }, { silent: true, key: `match3.booster.${activeBooster}` });
    return true;
  }, [activeBooster, board, boosters, combo, gameActive, inputLocked, mode, movesLeft, performAction, queueMatchAnimation, score, snapshot?.match3?.savedModes]);

  const onCell = useCallback(
    (x, y) => {
      if (!gameActive || finishedRef.current || pausedRef.current || inputLockRef.current || inputLocked) return;
      if (activeBooster && useMatch3BoosterAt(x, y)) return;
      if (!selected) {
        setSelected({ x, y });
        return;
      }
      attemptSwap(selected, { x, y });
    },
    [activeBooster, attemptSwap, gameActive, inputLocked, selected, useMatch3BoosterAt],
  );

  const sceneState = useMemo(
    () => ({
      match3: { board, score, movesLeft, combo, gameMode: mode, gameActive: isPlaying, inputLocked, boosters, activeBooster },
      match3Timer: mode === "timed" ? {
        label: `${Math.max(0, movesLeft)}s`,
        progress: Math.max(0, Math.min(1, movesLeft / 90)),
        tone: movesLeft <= 10 ? "critical" : movesLeft <= 30 ? "warning" : "calm",
      } : null,
      match3StatusText: `${t(currentMode.labelKey)} · ${score} ${t("common.score").toLowerCase()} · ${movesLeft} ${(mode === "timed" ? t("common.time") : t("common.moves")).toLowerCase()}`,
      selectedGem: selected,
      match3Animation: matchAnimation,
      onMatch3AnimationComplete: onAnimationComplete,
      onMatch3MotionPhase: onMotionPhase,
      onMatch3Cell: onCell,
      onMatch3Swap: attemptSwap,
      fallbackBoard: board,
    }),
    [activeBooster, attemptSwap, board, boosters, combo, currentMode.labelKey, inputLocked, isPlaying, matchAnimation, mode, movesLeft, onAnimationComplete, onMotionPhase, onCell, score, selected, t],
  );

  return jsxRuntime.jsx(Match3Presentation, {
    gameActive,paused,inputLocked,score,movesLeft,combo,currentReward,motionFeedback,
    rewardProgress:rewardChest.progress,mode,currentMode,modes:MATCH3_MODES,
    selectedGemType,activeBooster,shuffleCharges,boosters,leaders,sceneState,runtimeAssetManifest,
    onPause:pauseRun,onResume:()=>setPaused(false),
    onStart:()=>start(mode),onNew:()=>start(mode),onFinish:()=>finish(scoreRef.current),onExit:exitToHub,
    onModeChange:setMode,onReroll:()=>setBoard(createModeBoard(mode)),
    onShuffle:useShuffleBooster,onBooster:(id)=>setActiveBooster(value=>value===id?'':id),
  });
}

