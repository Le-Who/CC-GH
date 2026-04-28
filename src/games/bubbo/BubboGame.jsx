import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Gem, Home, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { audioManager } from "../../services/audioManager.js";
import { BUBBO_SHOTS, advanceBubboPressure, applyBubboShot, createBubboRun, generateBubboWave, getBubboRemainingCount, isBubboDanger, randomBubboColor } from "../../game-core/bubbo/engine.js";
import { PixiScene } from "../../app/PixiScene.jsx";
import { GamePlayHud, GameShell, PanelButton, Stat } from "../../app/shell.jsx";
import { useAction, useExitToHub, useImmersiveGame, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
export default function BubboGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const { t } = useAppI18n();
  const initialRun = useMemo(() => createBubboRun("local-preview"), []);
  const [board, setBoard] = useState(() => initialRun.board);
  const [seed, setSeed] = useState(initialRun.seed);
  const [waveIndex, setWaveIndex] = useState(initialRun.waveIndex);
  const [rowOffset, setRowOffset] = useState(initialRun.rowOffset || 0);
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
  const runRef = useRef({ board, seed, waveIndex, rowOffset, pressure, pressureStep, score, shotsLeft });
  const bubbleRef = useRef({ current: currentBubble, next: nextBubble });
  const shotAdvanceRef = useRef(null);
  const highScore = snapshot?.bubbo?.highScore || 0;
  const remainingBubbles = getBubboRemainingCount(board);
  const isPlaying = gameActive && !paused;
  useImmersiveGame("bubbo", true);

  useEffect(() => {
    runRef.current = { board, seed, waveIndex, rowOffset, pressure, pressureStep, score, shotsLeft };
  }, [board, pressure, pressureStep, rowOffset, score, seed, shotsLeft, waveIndex]);

  useEffect(() => {
    bubbleRef.current = { current: currentBubble, next: nextBubble };
  }, [currentBubble, nextBubble]);

  const start = useCallback(async () => {
    const run = createBubboRun();
    const result = await performAction("bubbo.start", {
      shotsLeft: BUBBO_SHOTS,
      board: run.board,
      seed: run.seed,
      waveIndex: run.waveIndex,
      rowOffset: run.rowOffset,
      pressure: 0,
    }, { key: "bubbo.start" });
    if (result.error) return;
    setBoard(run.board);
    setSeed(run.seed);
    setWaveIndex(run.waveIndex);
    setRowOffset(run.rowOffset || 0);
    setPressure(0);
    setPressureStep(0);
    setScore(0);
    setShotsLeft(BUBBO_SHOTS);
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
      const elapsed = Math.min(1000, Math.max(0, now - pressureClockRef.current));
      pressureClockRef.current = now;
      const current = runRef.current;
      const advanced = advanceBubboPressure(current, elapsed);
      setPressure(advanced.pressure);
      setPressureStep(advanced.pressureStep || 0);
      if (!advanced.shifts) return;
      setBoard(advanced.board);
      setWaveIndex(advanced.waveIndex);
      setRowOffset(advanced.rowOffset || 0);
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
      const result = applyBubboShot(board, firedColor, row, col, { rowOffset });
      if (result.error) {
        shotAdvanceRef.current = null;
        return;
      }
      const nextScore = score + result.points;
      const nextShots = Math.max(0, shotsLeft - 1);
      const remaining = getBubboRemainingCount(result.board);
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
      setScore(nextScore);
      setShotsLeft(nextShots);
      setLastShot(shotRecord);
      if (!preAdvanced) {
        const fallbackCurrent = nextBubble;
        const fallbackNext = randomBubboColor(result.board);
        bubbleRef.current = { current: fallbackCurrent, next: fallbackNext };
        setCurrentBubble(fallbackCurrent);
        setNextBubble(fallbackNext);
      }
      audioManager.play(result.popped.length || result.dropped.length ? "clear" : "tap");
      performAction(
        "bubbo.sync",
        { game: { score: nextScore, shotsLeft: nextShots, board: result.board, seed, waveIndex, rowOffset, pressure } },
        { silent: true, key: `bubbo.sync.${shotRecord.id}` },
      );
      if (remaining === 0 || nextShots <= 0 || isBubboDanger(result.board)) {
        finish(nextScore);
      }
    },
    [board, currentBubble, finish, gameActive, nextBubble, performAction, pressure, rowOffset, score, seed, shotsLeft, waveIndex],
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
        seed,
        waveIndex,
        rowOffset,
        bottomHudReserve: true,
        nextPressureWave: generateBubboWave(seed, waveIndex),
        statusText: `${score} ${t("common.score").toLowerCase()} · ${shotsLeft} ${t("common.shots").toLowerCase()}`,
      },
      onBubboFire: onFire,
      onBubboShotStart: onShotStart,
    }),
    [board, currentBubble, isPlaying, lastShot, nextBubble, onFire, onShotStart, pressureStep, rowOffset, score, seed, shotsLeft, waveIndex, t],
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
          subtitle={`${t("common.best")} ${highScore} · ${remainingBubbles} ${t("bubbo.bubbles")}`}
          stats={[
            { label: t("common.score"), value: score },
            { label: t("common.shots"), value: shotsLeft },
            { label: t("common.pressure"), value: `${Math.round(pressureStep * 100)}%` },
          ]}
          onPause={() => setPaused(true)}
          onFinish={() => finish(score)}
          className="game-play-hud-bottom bubbo-play-hud"
        />
      )}
      overlay={(
        <>
          <div className="panel-header">
            <div>
              <strong>{t("bubbo.title")}</strong>
              <span>{t("common.best")} {highScore} · {remainingBubbles} {t("bubbo.bubbles")} · {t("common.pressure").toLowerCase()} {Math.round(pressureStep * 100)}%</span>
            </div>
            <PanelButton icon={gameActive ? RotateCcw : Play} onClick={start}>
              {gameActive ? t("common.restart") : t("common.start")}
            </PanelButton>
          </div>
          {gameActive && paused && (
            <div className="button-row two">
              <PanelButton icon={Play} onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
              <PanelButton icon={Check} onClick={() => finish(score)}>{t("common.settle")}</PanelButton>
            </div>
          )}
          <div className="metric-grid">
            <Stat icon={Trophy} label={t("common.score")} value={score} />
            <Stat icon={Sparkles} label={t("common.shots")} value={shotsLeft} />
            <Stat icon={Gem} label={t("bubbo.bubbles")} value={remainingBubbles} />
          </div>
          <div className="button-row">
            <PanelButton icon={Check} disabled={!gameActive} onClick={() => finish(score)}>{t("common.settle")}</PanelButton>
            <PanelButton icon={RotateCcw} subtle disabled={gameActive} onClick={() => {
              const run = createBubboRun("local-preview");
              setBoard(run.board);
              setSeed(run.seed);
              setWaveIndex(run.waveIndex);
              setRowOffset(run.rowOffset || 0);
              setPressure(0);
              setPressureStep(0);
            }}>{t("bubbo.newField")}</PanelButton>
            <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
          </div>
          <div className="leaderboard">
            <strong>{t("bubbo.runStatus")}</strong>
            <span>{isBubboDanger(board) ? t("bubbo.dangerLine") : t("bubbo.fieldStable")} · {t("bubbo.highScore", { score: highScore })}</span>
          </div>
        </>
      )}
    >
      <PixiScene sceneKey="bubbo" sceneState={sceneState} />
    </GameShell>
  );
}

