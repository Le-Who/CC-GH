import { useCallback, useEffect, useMemo, useState } from "react";
import { Blocks, Check, Home, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { api } from "../../services/apiClient.js";
import { audioManager } from "../../services/audioManager.js";
import { PixiScene } from "../../app/PixiScene.jsx";
import { GamePlayHud, GameShell, PanelButton, PauseBrief, Stat } from "../../app/shell.jsx";
import { useAction, useExitToHub, useImmersiveGame, useReliableAction, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
import { Leaderboard } from "../../app/Leaderboard.jsx";
import { useGameEvents } from "../../game-state/gameEvents.js";
import { previewBloxPlacement } from "../../../game-logic/blox-engine.js";
export default function BloxGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const performReliableAction = useReliableAction();
  const exitToHub = useExitToHub();
  const pushEvent = useGameEvents((store) => store.pushEvent);
  const { t } = useAppI18n();
  const [selectedPiece, setSelectedPiece] = useState(-1);
  const [paused, setPaused] = useState(false);
  const [optimisticState, setOptimisticState] = useState(null);
  const saved = snapshot?.blox?.savedState || {};
  const serverState = {
    board: saved.board || [],
    tray: saved.tray || [],
    score: saved.score || 0,
    linesCleared: saved.linesCleared || 0,
    highScore: snapshot?.blox?.highScore || saved.highScore || 0,
    gameActive: saved.gameActive || snapshot?.blox?.activeGame || false,
  };
  const state = optimisticState || serverState;
  const [leaders, setLeaders] = useState([]);
  const isPlaying = state.gameActive && !paused;
  const activePause = state.gameActive && paused;
  const currentReward = state.score ? Math.min(400, Math.floor(state.score * 0.35)) : 0;
  const trayPieces = state.tray.filter((piece) => piece && !piece.placed).length;
  const pauseRun = useCallback(() => {
    if (state.gameActive) setPaused(true);
  }, [state.gameActive]);
  const shellControls = useMemo(() => ({
    activeRun: state.gameActive,
    pauseRun,
    hudState: {
      score: state.score,
      linesCleared: state.linesCleared,
      currentReward,
    },
  }), [currentReward, pauseRun, state.gameActive, state.linesCleared, state.score]);
  useImmersiveGame("blox", true, shellControls);

  useEffect(() => {
    api("/api/blox/leaderboard").then((data) => {
      if (Array.isArray(data)) setLeaders(data);
    });
  }, [state.highScore]);

  useEffect(() => {
    if (!state.gameActive) setPaused(false);
  }, [state.gameActive]);

  useEffect(() => {
    setOptimisticState(null);
  }, [saved.board, saved.gameActive, saved.linesCleared, saved.score, saved.tray]);

  const submitPlacement = useCallback(
    (pieceIdx, row, col) => {
      if (pieceIdx < 0 || !state.gameActive) return Promise.resolve({ error: "inactive" });
      const preview = previewBloxPlacement(state, { pieceIdx, row, col });
      if (!preview.valid) {
        pushEvent({ game: "blox", title: t("blox.invalidPlacement"), value: "", tone: "warning" });
        return Promise.resolve({ error: preview.reason || "invalid placement" });
      }
      setOptimisticState({
        ...preview.state,
        highScore: state.highScore,
        gameActive: state.gameActive,
      });
      return performReliableAction("blox.place", { pieceIdx, row, col }, {
        key: `blox.place.${pieceIdx}.${row}.${col}`,
        idParts: [pieceIdx, row, col],
      }).then((result) => {
        if (result.error) {
          setOptimisticState(null);
          pushEvent({ game: "blox", title: result.error, value: "", tone: "warning" });
          return result;
        }
        setSelectedPiece(-1);
        if (result.clear?.cleared) {
          audioManager.play("clear");
          pushEvent({
            game: "blox",
            title: t("blox.clear"),
            value: `+${result.clear.cleared}`,
            tone: "success",
          });
        }
        return result;
      });
    },
    [performReliableAction, pushEvent, state, t],
  );

  const onCell = useCallback(
    (row, col) => {
      if (selectedPiece < 0 || !state.gameActive) return;
      submitPlacement(selectedPiece, row, col);
    },
    [selectedPiece, state.gameActive, submitPlacement],
  );

  const onDrop = useCallback(
    (pieceIdx, row, col) => {
      return submitPlacement(pieceIdx, row, col);
    },
    [submitPlacement],
  );

  const sceneState = useMemo(
    () => ({
      blox: { ...state, gameActive: isPlaying },
      bloxStatusText: t("blox.status", { score: state.score || 0, lines: state.linesCleared || 0 }),
      bloxClearText: t("blox.clear"),
      bloxHudReserve: 132,
      bloxHideStatusText: true,
      bloxPredictedLines: optimisticState?.linesCleared ? Math.max(0, optimisticState.linesCleared - (serverState.linesCleared || 0)) : 0,
      selectedBloxPiece: selectedPiece,
      onBloxCell: onCell,
      onBloxDrop: onDrop,
      onBloxTray: setSelectedPiece,
    }),
    [state, isPlaying, optimisticState, serverState.linesCleared, selectedPiece, onCell, onDrop, t],
  );

  return (
    <GameShell
      gameId="blox"
      phase={isPlaying ? "playing" : state.gameActive ? "paused" : "menu"}
      skin="meditation"
      hud={(
        <GamePlayHud
          title={t("blox.title")}
          subtitle={t("blox.rewardLine", { best: state.highScore, reward: currentReward })}
          stats={[
            { label: t("common.score"), value: state.score || 0 },
            { label: t("common.lines"), value: state.linesCleared || 0 },
            { label: t("common.reward"), value: currentReward },
          ]}
          onPause={() => setPaused(true)}
        />
      )}
      overlay={(
        <>
          <div className="panel-header pause-panel-header">
            <div>
              <strong>{t("blox.title")}</strong>
              <span>{activePause ? t("pause.paused") : t("blox.bestReward", { best: state.highScore, reward: currentReward })}</span>
            </div>
            {!activePause && (
              <PanelButton icon={state.gameActive ? RotateCcw : Play} className={!state.gameActive ? "pause-primary" : ""} onClick={() => performAction("blox.start").then(() => setPaused(false))}>
                {state.gameActive ? t("common.restart") : t("common.start")}
              </PanelButton>
            )}
          </div>
          <PauseBrief
            gameId="blox"
            kicker={state.gameActive ? t("pause.paused") : t("pause.ready")}
            title={state.gameActive ? t("pause.bloxFrozen") : t("pause.bloxReady")}
            body={state.gameActive ? t("pause.bloxIntro") : t("pause.bloxPlan")}
            status={state.gameActive ? [
              { label: t("common.score"), value: state.score || 0 },
              { label: t("pause.bloxTray"), value: `${trayPieces}/3` },
              { label: t("common.reward"), value: currentReward },
            ] : []}
          />
          {activePause && (
            <div className="pause-action-stack">
              <PanelButton icon={Play} className="pause-primary" onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
              <div className="button-row">
                <PanelButton icon={RotateCcw} subtle onClick={() => performAction("blox.start").then(() => setPaused(false))}>{t("common.restart")}</PanelButton>
                <PanelButton icon={Check} onClick={() => performAction("blox.end", { score: state.score })}>{t("common.endRun")}</PanelButton>
                <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
              </div>
            </div>
          )}
          {!activePause && (
            <>
              <div className="metric-grid">
                <Stat icon={Trophy} label={t("common.score")} value={state.score || 0} />
                <Stat icon={Blocks} label={t("common.lines")} value={state.linesCleared || 0} />
                <Stat icon={Sparkles} label={t("common.reward")} value={currentReward} />
              </div>
              <div className="button-row two">
                <PanelButton icon={Check} disabled={!state.gameActive} onClick={() => performAction("blox.end", { score: state.score })}>{t("common.settle")}</PanelButton>
                <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
              </div>
              <Leaderboard entries={leaders} />
            </>
          )}
        </>
      )}
    >
      <PixiScene sceneKey="blox" sceneState={sceneState} />
    </GameShell>
  );
}
