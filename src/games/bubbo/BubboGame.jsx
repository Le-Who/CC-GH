import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, Gem, Home, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { audioManager } from "../../services/audioManager.js";
import { BUBBO_SHOTS, BUBBO_TIMED_SECONDS, advanceBubboPressure, createBubboRun, getBubboDangerRows, getBubboPressureLabel, getBubboRemainingCount, isBubboDanger, randomBubboColor, resolveBubboShot } from "../../game-core/bubbo/engine.js";
import { PixiScene } from "../../app/PixiScene.jsx";
import { GamePlayHud, GameShell, PanelButton, PauseBrief, Stat } from "../../app/shell.jsx";
import { useAction, useExitToHub, useImmersiveGame, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
import { useGameEvents } from "../../game-state/gameEvents.js";
const BUBBO_MODES = [
  { id: "classic", labelKey: "bubbo.mode.classic", hintKey: "bubbo.mode.classicHint" },
  { id: "timed", labelKey: "bubbo.mode.timed", hintKey: "bubbo.mode.timedHint" },
];
export default function BubboGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const pushEvent = useGameEvents((store) => store.pushEvent);
  const { t } = useAppI18n();
  const initialRun = useMemo(() => createBubboRun("local-preview"), []);
  const [board, setBoard] = useState(() => initialRun.board);
  const [pendingRow, setPendingRow] = useState(() => initialRun.pendingRow);
  const [seed, setSeed] = useState(initialRun.seed);
  const [waveIndex, setWaveIndex] = useState(initialRun.waveIndex);
  const [rowOffset, setRowOffset] = useState(initialRun.rowOffset || 0);
  const [pressure, setPressure] = useState(initialRun.pressure);
  const [pressureStep, setPressureStep] = useState(initialRun.pressureStep || 0);
  const [score, setScore] = useState(0);
  const [mode, setMode] = useState("classic");
  const [timeLeft, setTimeLeft] = useState(BUBBO_TIMED_SECONDS);
  const [shotsLeft, setShotsLeft] = useState(BUBBO_SHOTS);
  const [shotsFired, setShotsFired] = useState(0);
  const [gameActive, setGameActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [currentBubble, setCurrentBubble] = useState(() => randomBubboColor());
  const [nextBubble, setNextBubble] = useState(() => randomBubboColor());
  const [lastShot, setLastShot] = useState(null);
  const pressureClockRef = useRef(Date.now());
  const runRef = useRef({ board, pendingRow, seed, waveIndex, rowOffset, pressure, pressureStep, score, shotsLeft, shotsFired, mode, timeLeft });
  const bubbleRef = useRef({ current: currentBubble, next: nextBubble });
  const shotAdvanceRef = useRef(null);
  const highScore = snapshot?.bubbo?.highScore || 0;
  const savedRun = snapshot?.bubbo?.currentGame || null;
  const remainingBubbles = getBubboRemainingCount(board);
  const isPlaying = gameActive && !paused;
  const activePause = gameActive && paused;
  const danger = isBubboDanger(board);
  const pressureLabel = getBubboPressureLabel({ dangerRows: getBubboDangerRows(board), pressureStep });
  const pressureValue = t(`bubbo.pressure.${pressureLabel.tone}`);
  const currentMode = BUBBO_MODES.find((item) => item.id === mode) || BUBBO_MODES[0];
  const primaryLimitLabel = mode === "timed" ? t("common.time") : t("common.shots");
  const primaryLimitValue = mode === "timed" ? timeLeft : shotsLeft;
  const pauseRun = useCallback(() => {
    if (gameActive) setPaused(true);
  }, [gameActive]);
  const shellControls = useMemo(() => ({
    activeRun: gameActive,
    pauseRun,
    hudState: {
      score,
      shotsLeft,
      pressureLabel: pressureValue,
    },
  }), [gameActive, pauseRun, pressureValue, score, shotsLeft]);
  useImmersiveGame("bubbo", true, shellControls);

  useEffect(() => {
    runRef.current = { board, pendingRow, seed, waveIndex, rowOffset, pressure, pressureStep, score, shotsLeft, shotsFired, mode, timeLeft };
  }, [board, mode, pendingRow, pressure, pressureStep, rowOffset, score, seed, shotsFired, shotsLeft, timeLeft, waveIndex]);

  useEffect(() => {
    bubbleRef.current = { current: currentBubble, next: nextBubble };
  }, [currentBubble, nextBubble]);

  const start = useCallback(async (nextMode = mode) => {
    const run = createBubboRun(null, { mode: nextMode });
    const result = await performAction("bubbo.start", {
      mode: run.mode,
      shotsLeft: run.shotsLeft,
      shotsFired: run.shotsFired,
      timeLeft: run.timeLeft,
      board: run.board,
      pendingRow: run.pendingRow,
      seed: run.seed,
      waveIndex: run.waveIndex,
      rowOffset: run.rowOffset,
      pressure: 0,
    }, { key: "bubbo.start" });
    if (result.error) return;
    setBoard(run.board);
    setPendingRow(run.pendingRow);
    setSeed(run.seed);
    setWaveIndex(run.waveIndex);
    setRowOffset(run.rowOffset || 0);
    setPressure(0);
    setPressureStep(0);
    setScore(0);
    setMode(run.mode);
    setTimeLeft(run.timeLeft ?? BUBBO_TIMED_SECONDS);
    setShotsLeft(run.shotsLeft);
    setShotsFired(0);
    setGameActive(true);
    setPaused(false);
    pressureClockRef.current = Date.now();
    const firstBubble = randomBubboColor(run.board);
    const queuedBubble = randomBubboColor(run.board);
    bubbleRef.current = { current: firstBubble, next: queuedBubble };
    shotAdvanceRef.current = null;
    setCurrentBubble(firstBubble);
    setNextBubble(queuedBubble);
    setLastShot(null);
  }, [mode, performAction]);

  const resumeRun = useCallback(() => {
    if (!savedRun?.board) return;
    const fallback = createBubboRun(savedRun.seed || null, { mode: savedRun.mode || mode });
    const nextBoard = Array.isArray(savedRun.board) ? savedRun.board : fallback.board;
    const nextPendingRow = Array.isArray(savedRun.pendingRow) ? savedRun.pendingRow : fallback.pendingRow;
    const nextMode = savedRun.mode || fallback.mode;
    setBoard(nextBoard);
    setPendingRow(nextPendingRow);
    setSeed(savedRun.seed || fallback.seed);
    setWaveIndex(Number.isFinite(Number(savedRun.waveIndex)) ? Number(savedRun.waveIndex) : fallback.waveIndex);
    setRowOffset(Number(savedRun.rowOffset) || 0);
    setPressure(Number(savedRun.pressure) || 0);
    setPressureStep(Number(savedRun.pressureStep) || 0);
    setScore(Number(savedRun.score) || 0);
    setMode(nextMode);
    setTimeLeft(Number.isFinite(Number(savedRun.timeLeft)) ? Number(savedRun.timeLeft) : (nextMode === "timed" ? BUBBO_TIMED_SECONDS : null));
    setShotsLeft(Number.isFinite(Number(savedRun.shotsLeft)) ? Number(savedRun.shotsLeft) : BUBBO_SHOTS);
    setShotsFired(Number(savedRun.shotsFired) || 0);
    setGameActive(true);
    setPaused(false);
    pressureClockRef.current = Date.now();
    const firstBubble = randomBubboColor(nextBoard);
    const queuedBubble = randomBubboColor(nextBoard);
    bubbleRef.current = { current: firstBubble, next: queuedBubble };
    shotAdvanceRef.current = null;
    setCurrentBubble(firstBubble);
    setNextBubble(queuedBubble);
    setLastShot(null);
  }, [mode, savedRun]);

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
      setPendingRow(advanced.pendingRow);
      setWaveIndex(advanced.waveIndex);
      setRowOffset(advanced.rowOffset || 0);
      const pressureRecord = {
        id: `pressure_${now}_${advanced.waveIndex}`,
        shifted: advanced.shifts,
        popped: [],
        dropped: advanced.dropped || [],
      };
      setLastShot(pressureRecord);
      performAction("bubbo.sync", {
        game: {
          score: current.score,
          shotsLeft: current.shotsLeft,
          shotsFired: current.shotsFired,
          mode: current.mode,
          timeLeft: current.timeLeft,
          board: advanced.board,
          pendingRow: advanced.pendingRow,
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

  useEffect(() => {
    if (!isPlaying || mode !== "timed") return undefined;
    if (timeLeft <= 0) {
      finish(score);
      return undefined;
    }
    const id = window.setTimeout(() => {
      setTimeLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearTimeout(id);
  }, [finish, isPlaying, mode, score, timeLeft]);

  const onShotStart = useCallback((shotColor) => {
    if (!gameActive) return;
    const queuedCurrent = bubbleRef.current.next || randomBubboColor(runRef.current.board);
    const queuedNext = randomBubboColor(runRef.current.board);
    shotAdvanceRef.current = { color: shotColor || bubbleRef.current.current };
    bubbleRef.current = { current: queuedCurrent, next: queuedNext };
    setCurrentBubble(queuedCurrent);
    setNextBubble(queuedNext);
  }, [gameActive]);

  const onFire = useCallback(
    (row, col, path = [], shotColor = currentBubble) => {
      if (!gameActive) return;
      const firedColor = shotColor || currentBubble;
      const result = resolveBubboShot({ board, pendingRow, seed, waveIndex, rowOffset, pressure, pressureStep }, firedColor, row, col);
      if (result.error) {
        shotAdvanceRef.current = null;
        return;
      }
      const nextScore = score + result.points;
      const nextShots = mode === "timed" ? shotsLeft : Math.max(0, shotsLeft - 1);
      const nextShotsFired = shotsFired + 1;
      const shotRecord = {
        id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
        color: firedColor,
        path,
        landed: result.landed,
        popped: result.popped,
        dropped: result.dropped,
      };
      const preAdvanced = shotAdvanceRef.current?.color === firedColor;
      shotAdvanceRef.current = null;
      setBoard(result.board);
      setPendingRow(result.pendingRow);
      setWaveIndex(result.waveIndex);
      setRowOffset(result.rowOffset || 0);
      setPressure(result.pressure);
      setPressureStep(result.pressureStep || 0);
      setScore(nextScore);
      setShotsLeft(nextShots);
      setShotsFired(nextShotsFired);
      setLastShot(shotRecord);
      if (!preAdvanced) {
        const fallbackCurrent = nextBubble;
        const fallbackNext = randomBubboColor(result.board);
        bubbleRef.current = { current: fallbackCurrent, next: fallbackNext };
        setCurrentBubble(fallbackCurrent);
        setNextBubble(fallbackNext);
      }
      audioManager.play(result.popped.length || result.dropped.length ? "clear" : "tap");
      if (result.popped.length || result.dropped.length) {
        pushEvent({
          game: "bubbo",
          title: t("bubbo.clearEvent"),
          value: `+${result.points}`,
          tone: "success",
        });
      }
      performAction(
        "bubbo.sync",
        {
          game: {
            score: nextScore,
            shotsLeft: nextShots,
            shotsFired: nextShotsFired,
            mode,
            timeLeft,
            board: result.board,
            pendingRow: result.pendingRow,
            seed,
            waveIndex: result.waveIndex,
            rowOffset: result.rowOffset || 0,
            pressure: result.pressure,
          },
        },
        { silent: true, key: `bubbo.sync.${shotRecord.id}` },
      );
      if ((mode === "classic" && nextShots <= 0) || (mode === "timed" && timeLeft <= 0) || result.danger || result.overflow || isBubboDanger(result.board)) {
        finish(nextScore);
      }
    },
    [board, currentBubble, finish, gameActive, mode, nextBubble, pendingRow, performAction, pressure, pressureStep, pushEvent, rowOffset, score, seed, shotsFired, shotsLeft, t, timeLeft, waveIndex],
  );

  const sceneState = useMemo(
    () => ({
      bubbo: {
        board,
        pendingRow,
        score,
        mode,
        timeLeft,
        shotsLeft,
        shotsFired,
        gameActive: isPlaying,
        current: currentBubble,
        next: nextBubble,
        lastShot,
        pressureStep,
        pressureLabel: pressureValue,
        aimAssist: true,
        seed,
        waveIndex,
        rowOffset,
        bottomHudReserve: true,
        statusText: `${t(currentMode.labelKey)} · ${score} ${t("common.score").toLowerCase()} · ${primaryLimitValue} ${primaryLimitLabel.toLowerCase()}`,
      },
      onBubboFire: onFire,
      onBubboShotStart: onShotStart,
    }),
    [board, currentBubble, currentMode.labelKey, isPlaying, lastShot, mode, nextBubble, onFire, onShotStart, pendingRow, pressureStep, pressureValue, primaryLimitLabel, primaryLimitValue, rowOffset, score, seed, shotsFired, shotsLeft, timeLeft, waveIndex, t],
  );

  return (
    <GameShell
      gameId="bubbo"
      phase={isPlaying ? "playing" : gameActive ? "paused" : "menu"}
      skin="cycle"
      className="bubbo-shell"
      hud={(
        <GamePlayHud
          title={t("bubbo.title")}
          subtitle={`${t(currentMode.labelKey)} · ${t("common.best").toLowerCase()} ${highScore} · ${remainingBubbles} ${t("bubbo.bubbles")}`}
          stats={[
            { label: t("common.score"), value: score },
            { label: primaryLimitLabel, value: primaryLimitValue },
            { label: t("common.pressure"), value: pressureValue },
          ]}
          onPause={() => setPaused(true)}
          className="game-play-hud-bottom bubbo-play-hud"
        />
      )}
      overlay={(
        <>
          <div className="panel-header pause-panel-header">
            <div>
              <strong>{t("bubbo.title")}</strong>
              <span>{activePause ? t("pause.paused") : `${t(currentMode.labelKey)} · ${t("common.best").toLowerCase()} ${highScore} · ${primaryLimitLabel.toLowerCase()} ${primaryLimitValue}`}</span>
            </div>
            {!activePause && (
              <PanelButton icon={gameActive ? RotateCcw : Play} className={!gameActive ? "pause-primary" : ""} onClick={() => start(mode)}>
                {gameActive ? t("common.restart") : t("common.start")}
              </PanelButton>
            )}
          </div>
          <PauseBrief
            gameId="bubbo"
            kicker={gameActive ? t("pause.paused") : t("pause.ready")}
            title={gameActive ? t("pause.bubboFrozen") : t("pause.bubboReady")}
            body={gameActive ? t("pause.bubboIntro") : t("pause.bubboPlan")}
            status={gameActive ? [
              { label: t(currentMode.labelKey), value: mode === "timed" ? t("common.time") : t("common.shots") },
              { label: primaryLimitLabel, value: primaryLimitValue },
              { label: t("bubbo.bubbles"), value: remainingBubbles },
            ] : []}
          />
          {activePause && (
            <div className="pause-action-stack">
              <PanelButton icon={Play} className="pause-primary" onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
              <div className="button-row">
                <PanelButton icon={Check} onClick={() => finish(score)}>{t("common.endRun")}</PanelButton>
                <PanelButton icon={RotateCcw} subtle onClick={() => start(mode)}>{t("common.restart")}</PanelButton>
                <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
              </div>
            </div>
          )}
          {!gameActive && (
            <>
              {savedRun?.board && (
                <div className="bubbo-resume-banner">
                  <span>{t("bubbo.resumeHint")}</span>
                  <PanelButton icon={Play} onClick={resumeRun}>{t("common.resume")}</PanelButton>
                </div>
              )}
              <div className="mode-grid bubbo-mode-grid" data-mode-selector="bubbo">
                {BUBBO_MODES.map((item) => (
                  <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>
                    <span className="mode-choice-selected" aria-hidden="true" />
                    <strong>{t(item.labelKey)}</strong>
                    <small>{t(item.hintKey)}</small>
                  </button>
                ))}
              </div>
            </>
          )}
          {!activePause && (
            <>
              <div className="metric-grid">
                <Stat icon={Trophy} label={t("common.score")} value={score} />
                <Stat icon={mode === "timed" ? Clock : Sparkles} label={primaryLimitLabel} value={primaryLimitValue} />
                <Stat icon={Gem} label={t("bubbo.bubbles")} value={remainingBubbles} />
              </div>
              <div className="button-row">
                <PanelButton icon={Check} disabled={!gameActive} onClick={() => finish(score)}>{t("common.settle")}</PanelButton>
                <PanelButton icon={RotateCcw} subtle disabled={gameActive} onClick={() => {
                  const run = createBubboRun("local-preview", { mode });
                  setBoard(run.board);
                  setPendingRow(run.pendingRow);
                  setSeed(run.seed);
                  setWaveIndex(run.waveIndex);
                  setRowOffset(run.rowOffset || 0);
                  setPressure(0);
                  setPressureStep(0);
                  setTimeLeft(run.timeLeft ?? BUBBO_TIMED_SECONDS);
                  setShotsLeft(run.shotsLeft);
                  setShotsFired(0);
                }}>{t("bubbo.newField")}</PanelButton>
                <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
              </div>
              <div className="leaderboard">
                <strong>{t("bubbo.runStatus")}</strong>
                <span>{danger ? t("bubbo.dangerLine") : t("bubbo.fieldStable")} · {t("bubbo.highScore", { score: highScore })}</span>
              </div>
            </>
          )}
        </>
      )}
    >
      <PixiScene sceneKey="bubbo" sceneState={sceneState} />
    </GameShell>
  );
}
