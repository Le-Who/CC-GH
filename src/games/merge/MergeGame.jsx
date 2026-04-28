import { useCallback, useMemo, useState } from "react";
import { Home, PackageOpen, Play, RotateCcw, Sparkles, Trash2, Zap } from "lucide-react";
import { CROPS, ECONOMY, MERGE_CHAINS } from "../../../game-logic.js";
import { audioManager } from "../../services/audioManager.js";
import { listPositive } from "../../game-state/inventory.js";
import { PixiScene } from "../../app/PixiScene.jsx";
import { GamePlayHud, GameShell, PanelButton, PauseBrief } from "../../app/shell.jsx";
import { useAction, useExitToHub, useImmersiveGame, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
export default function MergeGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const { t } = useAppI18n();
  const merge = snapshot?.merge || {};
  const inventory = snapshot?.inventory || {};
  const [selectedFuel, setSelectedFuel] = useState({});
  const [selectedCell, setSelectedCell] = useState(null);
  const [trashMode, setTrashMode] = useState(false);
  const [mergePlaying, setMergePlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const isPlaying = mergePlaying && !paused;
  const activePause = mergePlaying && paused;
  useImmersiveGame("merge", true);

  const harvestedEntries = listPositive(inventory.harvested || {});
  const firstFuel = harvestedEntries[0]?.[0];
  const itemTotal = Object.values(merge.itemCounts || {}).reduce((sum, qty) => sum + qty, 0);

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
    () => ({
      merge,
      mergeSelected: selectedCell,
      trashMode,
      mergeLocked: !isPlaying,
      mergeStatusText: trashMode ? t("merge.statusTrash") : t("merge.statusMerge"),
      mergeMissText: t("merge.miss"),
      mergeLevelPrefix: t("farm.levelShort"),
      onMergeCell,
      onMergeDrop,
    }),
    [isPlaying, merge, onMergeCell, onMergeDrop, selectedCell, trashMode, t],
  );

  return (
    <GameShell
      gameId="merge"
      phase={isPlaying ? "playing" : mergePlaying ? "paused" : "menu"}
      skin="meditation"
      overlayClassName="merge-menu-overlay"
      hud={(
        <GamePlayHud
          title={t("merge.title")}
          subtitle={`${merge.freeTapCharges || 0} ${t("merge.freeTaps")} · ${inventory.rewards?.gachaTokens || 0} ${t("common.tokens").toLowerCase()}`}
          stats={[
            { label: t("merge.free"), value: merge.freeTapCharges || 0 },
            { label: t("merge.items"), value: itemTotal },
            { label: t("merge.mode"), value: trashMode ? t("merge.modeTrash") : t("merge.modeMerge") },
          ]}
          onPause={() => setPaused(true)}
          extraActions={(
            <PanelButton
              icon={Trash2}
              danger={trashMode}
              active={trashMode}
              onClick={() => setTrashMode((value) => !value)}
              title={trashMode ? t("merge.disableTrash") : t("merge.enableTrash")}
            >
              {t("merge.trash")}
            </PanelButton>
          )}
        />
      )}
      overlay={(
        <>
          <div className="panel-header pause-panel-header">
            <div>
              <strong>{t("merge.title")}</strong>
              <span>{activePause ? t("pause.paused") : `${merge.freeTapCharges || 0} ${t("merge.freeTaps")} · ${inventory.rewards?.gachaTokens || 0} ${t("common.tokens").toLowerCase()}`}</span>
            </div>
            {!activePause && (
              <PanelButton icon={Play} className="pause-primary" onClick={() => {
                if (!mergePlaying) {
                  setMergePlaying(true);
                  setPaused(false);
                } else {
                  setPaused(false);
                }
              }}>
                {mergePlaying ? t("common.resume") : t("common.play")}
              </PanelButton>
            )}
          </div>
          <PauseBrief
            gameId="merge"
            kicker={mergePlaying ? t("pause.paused") : t("pause.ready")}
            title={mergePlaying ? t("pause.mergeFrozen") : t("pause.mergeReady")}
            body={mergePlaying ? t("pause.mergeIntro") : t("pause.mergePlan")}
            status={mergePlaying ? [
              { label: t("merge.mode"), value: trashMode ? t("merge.modeTrash") : t("merge.modeMerge") },
              { label: t("merge.free"), value: merge.freeTapCharges || 0 },
              { label: t("merge.items"), value: itemTotal },
            ] : []}
          />
          {activePause && (
            <div className="pause-action-stack">
              <PanelButton icon={Play} className="pause-primary" onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
              <div className="button-row">
                <PanelButton
                  icon={Trash2}
                  danger={trashMode}
                  active={trashMode}
                  onClick={() => setTrashMode((value) => !value)}
                  title={trashMode ? t("merge.disableTrash") : t("merge.enableTrash")}
                >
                  {trashMode ? t("merge.trashOn") : t("merge.trashOff")}
                </PanelButton>
                <PanelButton icon={RotateCcw} subtle onClick={() => setMergePlaying(false)}>{t("merge.stopPlay")}</PanelButton>
                <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
              </div>
            </div>
          )}
          {!activePause && (
            <>
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
                        <small>{cooldown ? t("merge.coolingDown") : t("merge.taps", { count: `${gs.tapsLeft ?? ECONOMY.GENERATOR_TAP_LIMIT}/${ECONOMY.GENERATOR_TAP_LIMIT}` })}</small>
                      </div>
                      <select value={fuel || ""} onChange={(event) => setSelectedFuel((prev) => ({ ...prev, [chainId]: event.target.value }))}>
                        <option value="">{t("merge.freeChooseFuel")}</option>
                        {harvestedEntries.map(([cropId, qty]) => (
                          <option key={cropId} value={cropId}>{CROPS[cropId]?.emoji || ""} {cropId} x{qty}</option>
                        ))}
                      </select>
                      <PanelButton
                        icon={Zap}
                        disabled={cooldown || (!fuel && !(merge.freeTapCharges > 0))}
                        onClick={() => performAction("merge.tap", { chainId, cropId: fuel }, { key: `merge.tap.${chainId}` })}
                      >
                        {t("common.tap")}
                      </PanelButton>
                    </div>
                  );
                })}
              </div>
              <div className="button-row merge-actions">
                <PanelButton icon={Sparkles} onClick={() => performAction("merge.gacha")}>{t("merge.gacha")}</PanelButton>
                <PanelButton icon={PackageOpen} onClick={() => performAction("merge.freePull")}>{t("merge.free")}</PanelButton>
                <PanelButton icon={Zap} onClick={() => performAction("merge.claimFreeTaps")}>{t("merge.thirtyTaps")}</PanelButton>
                <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
              </div>
              <div className="panel-scroll compact-list">
                {Object.entries(merge.itemCounts || {}).map(([itemId, qty]) => (
                  <span key={itemId}>{itemId} x{qty}</span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    >
      <PixiScene sceneKey="merge" sceneState={sceneState} />
    </GameShell>
  );
}
