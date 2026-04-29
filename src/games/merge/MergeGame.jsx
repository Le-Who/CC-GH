import { useCallback, useMemo, useState } from "react";
import { BookOpen, Home, PackageOpen, Pause, Play, RotateCcw, Sparkles, Trash2, Zap } from "lucide-react";
import { CROPS, ECONOMY, MERGE_CHAINS, MERGE_RECIPES, MERGE_WILD_GENERATOR_ID } from "../../../game-logic.js";
import { audioManager } from "../../services/audioManager.js";
import { listPositive } from "../../game-state/inventory.js";
import { PixiScene } from "../../app/PixiScene.jsx";
import { GameShell, PanelButton, PauseBrief } from "../../app/shell.jsx";
import { useAction, useExitToHub, useImmersiveGame, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
import { useGameHub } from "../../game-state/useGameHub.js";

function mergeItemLabel(itemId) {
  for (const chain of Object.values(MERGE_CHAINS)) {
    const level = chain.items.indexOf(itemId);
    if (level >= 0) return `${chain.emoji[level]} ${chain.names[level]}`;
  }
  return itemId;
}

export default function MergeGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const lastResult = useGameHub((state) => state.lastResult);
  const { t } = useAppI18n();
  const merge = snapshot?.merge || {};
  const inventory = snapshot?.inventory || {};
  const [selectedFuel, setSelectedFuel] = useState("");
  const [selectedCell, setSelectedCell] = useState(null);
  const [trashMode, setTrashMode] = useState(false);
  const [showRecipes, setShowRecipes] = useState(false);
  const [mergePlaying, setMergePlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const isPlaying = mergePlaying && !paused;
  const activePause = mergePlaying && paused;
  useImmersiveGame("merge", true);

  const harvestedEntries = listPositive(inventory.harvested || {});
  const firstFuel = harvestedEntries[0]?.[0];
  const selectedFuelAvailable = harvestedEntries.some(([cropId]) => cropId === selectedFuel);
  const activeFuel = selectedFuelAvailable ? selectedFuel : firstFuel;
  const itemTotal = Object.values(merge.itemCounts || {}).reduce((sum, qty) => sum + qty, 0);
  const wildGenerator = merge.generatorState?.[MERGE_WILD_GENERATOR_ID] || {};
  const generatorCoolingDown = wildGenerator.cooldownEnd > Date.now();
  const tokenCount = inventory.rewards?.gachaTokens || 0;
  const today = new Date().toISOString().slice(0, 10);
  const canFreePull = new Date(merge.lastFreePull || 0).toISOString().slice(0, 10) !== today;
  const canClaimFreeTaps = new Date(merge.lastFreeTaps || 0).toISOString().slice(0, 10) !== today;
  const canTapGenerator = !generatorCoolingDown && (!!activeFuel || (merge.freeTapCharges || 0) > 0);
  const lastMergeReward = lastResult?.action?.startsWith?.("merge.") && lastResult.reward?.type === "yardGoodie"
    ? lastResult.reward.goodieId
    : null;

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
          audioManager.play(result.yardDrop ? "gacha" : "merge");
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
      mergeBottomReserve: 154,
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
        <>
          <div className="game-play-hud merge-play-status">
            <div className="game-play-title">
              <strong>{t("merge.title")}</strong>
              <span>{`${merge.freeTapCharges || 0} ${t("merge.freeTaps")} · ${tokenCount} ${t("common.tokens").toLowerCase()}`}</span>
            </div>
            <div className="game-play-stats">
              <span>{t("merge.items")} <strong>{itemTotal}</strong></span>
              <span>{t("merge.mode")} <strong>{trashMode ? t("merge.modeTrash") : t("merge.modeMerge")}</strong></span>
              <span>{t("merge.recipes")} <strong>{MERGE_RECIPES.length}</strong></span>
              {lastMergeReward && <span>{t("merge.reward")} <strong>{lastMergeReward}</strong></span>}
            </div>
          </div>
          <div className="merge-action-dock" data-no-nav-swipe="true">
            <div className="merge-generator-dock">
              <label className="merge-fuel-field">
                <span>{t("merge.fuel")}</span>
                <select value={activeFuel || ""} onChange={(event) => setSelectedFuel(event.target.value)}>
                  <option value="">{t("merge.noFuel")}</option>
                  {harvestedEntries.map(([cropId, qty]) => (
                    <option key={cropId} value={cropId}>{CROPS[cropId]?.emoji || ""} {cropId} x{qty}</option>
                  ))}
                </select>
              </label>
              <PanelButton
                icon={Zap}
                disabled={!canTapGenerator}
                onClick={() => performAction("merge.tap", { chainId: MERGE_WILD_GENERATOR_ID, cropId: activeFuel }, { key: "merge.tap.wild" })}
                title={generatorCoolingDown ? t("merge.coolingDown") : undefined}
              >
                {t("common.tap")}
              </PanelButton>
            </div>
            <div className="merge-action-grid">
              <PanelButton
                icon={Sparkles}
                disabled={tokenCount < ECONOMY.GACHA_PULL_COST}
                onClick={() => performAction("merge.gacha")}
                title={t("merge.gacha")}
              >
                {t("merge.gacha")}
              </PanelButton>
              <PanelButton
                icon={PackageOpen}
                disabled={!canFreePull}
                onClick={() => performAction("merge.freePull")}
                title={t("merge.free")}
              >
                {t("merge.free")}
              </PanelButton>
              <PanelButton
                icon={Zap}
                disabled={!canClaimFreeTaps}
                onClick={() => performAction("merge.claimFreeTaps")}
                title={t("merge.thirtyTaps")}
              >
                {t("merge.thirtyTaps")}
              </PanelButton>
              <PanelButton
                icon={Trash2}
                danger={trashMode}
                active={trashMode}
                onClick={() => setTrashMode((value) => !value)}
                title={trashMode ? t("merge.disableTrash") : t("merge.enableTrash")}
              >
                {trashMode ? t("merge.trashOn") : t("merge.trash")}
              </PanelButton>
              <PanelButton icon={Pause} subtle onClick={() => setPaused(true)} title={t("common.pause")}>
                {t("common.pause")}
              </PanelButton>
            </div>
          </div>
        </>
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
              lastMergeReward ? { label: t("merge.reward"), value: lastMergeReward } : null,
            ].filter(Boolean) : []}
          />
          <div className="merge-recipe-book">
            <PanelButton
              icon={BookOpen}
              subtle
              active={showRecipes}
              onClick={() => setShowRecipes((value) => !value)}
              title={t("merge.recipeBook")}
            >
              {t("merge.recipeBook")}
            </PanelButton>
            {showRecipes && (
              <div className="panel-scroll compact-list merge-recipe-list">
                {MERGE_RECIPES.map((recipe) => (
                  <span key={recipe.id} title={recipe.hint}>
                    <strong>{recipe.name}</strong>
                    {recipe.ingredients.map(mergeItemLabel).join(" + ")}
                    {" -> "}
                    {mergeItemLabel(MERGE_CHAINS[recipe.result.chainId]?.items[recipe.result.level])}
                  </span>
                ))}
              </div>
            )}
          </div>
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
              <div className="button-row merge-start-actions">
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
