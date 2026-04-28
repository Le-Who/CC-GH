import { useCallback, useEffect, useMemo, useState } from "react";
import { Blocks, Check, Home, Play, RotateCcw, Sparkles, Trophy } from "lucide-react";
import { api } from "../../services/apiClient.js";
import { audioManager } from "../../services/audioManager.js";
import { PixiScene } from "../../app/PixiScene.jsx";
import { GamePlayHud, GameShell, PanelButton, Stat } from "../../app/shell.jsx";
import { useAction, useExitToHub, useImmersiveGame, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
import { Leaderboard } from "../../app/Leaderboard.jsx";
export default function BloxGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const { t } = useAppI18n();
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
  const currentReward = state.score ? Math.min(400, Math.floor(state.score * 0.35)) : 0;
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
      bloxStatusText: t("blox.status", { score: state.score || 0, lines: state.linesCleared || 0 }),
      bloxClearText: t("blox.clear"),
      bloxHudReserve: 132,
      bloxHideStatusText: true,
      selectedBloxPiece: selectedPiece,
      onBloxCell: onCell,
      onBloxDrop: onDrop,
      onBloxTray: setSelectedPiece,
    }),
    [state, isPlaying, selectedPiece, onCell, onDrop, t],
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
          onFinish={() => {
            setPaused(true);
            performAction("blox.end", { score: state.score });
          }}
          finishLabel={t("common.end")}
        />
      )}
      overlay={(
        <>
          <div className="panel-header">
            <div>
              <strong>{t("blox.title")}</strong>
              <span>{t("blox.bestReward", { best: state.highScore, reward: currentReward })}</span>
            </div>
            <PanelButton icon={state.gameActive ? RotateCcw : Play} onClick={() => performAction("blox.start").then(() => setPaused(false))}>
              {state.gameActive ? t("common.restart") : t("common.start")}
            </PanelButton>
          </div>
          {state.gameActive && paused && (
            <div className="button-row two">
              <PanelButton icon={Play} onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
              <PanelButton icon={Check} onClick={() => performAction("blox.end", { score: state.score })}>{t("common.endRun")}</PanelButton>
            </div>
          )}
          <div className="metric-grid">
            <Stat icon={Trophy} label={t("common.score")} value={state.score || 0} />
            <Stat icon={Blocks} label={t("common.lines")} value={state.linesCleared || 0} />
            <Stat icon={Sparkles} label={t("common.reward")} value={currentReward} />
          </div>
          <div className="button-row">
            <PanelButton icon={Check} disabled={!state.gameActive} onClick={() => performAction("blox.end", { score: state.score })}>{t("common.endRun")}</PanelButton>
            <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
          </div>
          <Leaderboard entries={leaders} />
        </>
      )}
    >
      <PixiScene sceneKey="blox" sceneState={sceneState} />
    </GameShell>
  );
}

