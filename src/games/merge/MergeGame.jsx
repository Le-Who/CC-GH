import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Home, PackageOpen, Pause, Play, ShoppingBag, Sparkles, Trash2, X, Zap } from "lucide-react";
import {
  CROPS,
  ECONOMY,
  MERGE_CHAINS,
  MERGE_EXCHANGE_OFFERS,
  MERGE_RECIPES,
  MERGE_WILD_GENERATOR_ID,
  getMergeFreeTapClaim,
} from "../../../game-logic.js";
import { audioManager } from "../../services/audioManager.js";
import { listPositive } from "../../game-state/inventory.js";
import { PixiScene } from "../../app/PixiScene.jsx";
import { GameShell, PanelButton, PauseBrief } from "../../app/shell.jsx";
import { useAction, useExitToHub, useImmersiveGame, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
import { useGameHub } from "../../game-state/useGameHub.js";
import { loadRuntimeAssetManifest, resolveAssetUrl } from "../../game-runtime/assetBundles.js";

function translated(t, key, fallback) {
  const value = t(key);
  return value === key ? fallback : value;
}

function mergeItemName(itemId, t) {
  for (const chain of Object.values(MERGE_CHAINS)) {
    const level = chain.items.indexOf(itemId);
    if (level >= 0) return translated(t, `merge.item.${itemId}`, chain.names[level]);
  }
  return itemId;
}

function mergeItemLabel(itemId, t) {
  for (const chain of Object.values(MERGE_CHAINS)) {
    const level = chain.items.indexOf(itemId);
    if (level >= 0) return `${chain.emoji[level]} ${mergeItemName(itemId, t)}`;
  }
  return itemId;
}

function recipeResultItem(recipe) {
  return MERGE_CHAINS[recipe.result.chainId]?.items[recipe.result.level] || "";
}

function manualMergeAsset(manifest, section, id) {
  return manifest?.graphics?.games?.gachaMerge?.[section]?.[id] || "";
}

function useMergeUiAssets() {
  const [assets, setAssets] = useState({ libraryRail: "", exchangePanel: "" });
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/assets/manifest.json", { cache: "no-cache" }).then((response) => (response.ok ? response.json() : null)).catch(() => null),
      loadRuntimeAssetManifest().catch(() => null),
    ]).then(([manualManifest, runtimeManifest]) => {
      if (cancelled) return;
      const asset = (section, id) => (
        manualMergeAsset(manualManifest, section, id)
        || resolveAssetUrl(`gachaMerge.${section}.${id}`, { runtimeManifest, legacyPath: "" })
      );
      setAssets({
        libraryRail: asset("ui", "libraryRail"),
        exchangePanel: asset("ui", "exchangePanel"),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return assets;
}

function cssUrl(value) {
  return value ? `url(${JSON.stringify(value)})` : undefined;
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
  const [activePanel, setActivePanel] = useState(null);
  const [paused, setPaused] = useState(false);
  const uiAssets = useMergeUiAssets();
  const isPlaying = !paused;
  const activePause = paused;
  useImmersiveGame("merge", true);

  const harvestedEntries = listPositive(inventory.harvested || {});
  const firstFuel = harvestedEntries[0]?.[0];
  const selectedFuelAvailable = harvestedEntries.some(([cropId]) => cropId === selectedFuel);
  const activeFuel = selectedFuelAvailable ? selectedFuel : firstFuel;
  const itemTotal = Object.values(merge.itemCounts || {}).reduce((sum, qty) => sum + qty, 0);
  const wildGenerator = merge.generatorState?.[MERGE_WILD_GENERATOR_ID] || {};
  const generatorCoolingDown = wildGenerator.cooldownEnd > Date.now();
  const tokenCount = inventory.rewards?.gachaTokens || 0;
  const now = snapshot?.serverTime || Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const alchemyEssence = Math.max(0, Math.floor(Number(merge.alchemyEssence) || 0));
  const exchangeClaimsToday = merge.exchangeClaims?.[today] || {};
  const visibleExchangeOffers = MERGE_EXCHANGE_OFFERS;
  const nextEssenceGoal = visibleExchangeOffers
    .filter((offer) => !offer.locked && offer.cost > 0)
    .sort((left, right) => left.cost - right.cost)
    .find((offer) => offer.cost > alchemyEssence)
      || visibleExchangeOffers.filter((offer) => !offer.locked && offer.cost > 0).sort((left, right) => right.cost - left.cost)[0]
      || null;
  const essenceProgress = nextEssenceGoal ? Math.min(100, (alchemyEssence / nextEssenceGoal.cost) * 100) : 100;
  const canFreePull = new Date(merge.lastFreePull || 0).toISOString().slice(0, 10) !== today;
  const freeTapClaim = getMergeFreeTapClaim(merge, now);
  const canClaimFreeTaps = freeTapClaim.claimable > 0;
  const freeTapWaitMinutes = Math.max(1, Math.ceil((freeTapClaim.nextFreeTapAt - now) / 60000));
  const canTapGenerator = !generatorCoolingDown && (!!activeFuel || (merge.freeTapCharges || 0) > 0);
  const activeCrop = activeFuel ? CROPS[activeFuel] : null;
  const generatorHint = (merge.freeTapCharges || 0) > 0
    ? t("merge.generatorHintFree", { count: merge.freeTapCharges || 0 })
    : activeCrop
      ? t("merge.generatorHintCrop", { crop: activeCrop.name || activeFuel })
      : t("merge.generatorHintEmpty");
  const lastMergeReward = lastResult?.action?.startsWith?.("merge.") && lastResult.reward?.type === "yardGoodie"
    ? lastResult.reward.goodieId
    : null;
  const lastEssenceReward = lastResult?.action === "merge.merge" && lastResult.essenceReward
    ? lastResult.essenceReward
    : null;
  const discoveredRecipes = useMemo(() => {
    const ids = new Set(MERGE_RECIPES.filter((recipe) => recipe.discovered).map((recipe) => recipe.id));
    for (const id of merge.discoveredRecipes || []) ids.add(id);
    return ids;
  }, [merge.discoveredRecipes]);
  const discoveredItems = useMemo(() => {
    const ids = new Set(merge.discoveredItems || []);
    for (const recipe of MERGE_RECIPES.filter((candidate) => candidate.discovered)) {
      recipe.ingredients.forEach((id) => ids.add(id));
      const resultId = recipeResultItem(recipe);
      if (resultId) ids.add(resultId);
    }
    for (const [itemId, qty] of Object.entries(merge.itemCounts || {})) {
      if (qty > 0) ids.add(itemId);
    }
    for (const chain of Object.values(MERGE_CHAINS)) {
      if (chain.id !== "alchemy" && chain.items[0]) ids.add(chain.items[0]);
    }
    return ids;
  }, [merge.discoveredItems, merge.itemCounts]);
  const recipeStats = `${discoveredRecipes.size}/${MERGE_RECIPES.length}`;
  const openScenePanel = useCallback((panel) => {
    setActivePanel((current) => (current === panel ? null : panel));
  }, []);
  const pauseMerge = useCallback(() => {
    setActivePanel(null);
    setPaused(true);
  }, []);
  const resumeMerge = useCallback(() => {
    setPaused(false);
  }, []);
  const closeScenePanel = useCallback(() => setActivePanel(null), []);
  const exchangeOffer = useCallback((offerId) => (
    performAction("merge.exchange", { offerId }, { key: `merge.exchange.${offerId}` })
  ), [performAction]);

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
      mergeEssence: alchemyEssence,
      mergeSelected: selectedCell,
      trashMode,
      mergeLocked: !isPlaying,
      mergeStatusText: trashMode ? t("merge.statusTrash") : t("merge.statusMerge"),
      mergeMissText: t("merge.miss"),
      mergePerfectText: t("merge.perfectReaction"),
      mergeLevelPrefix: t("farm.levelShort"),
      mergeBottomReserve: 126,
      onMergeCell,
      onMergeDrop,
    }),
    [alchemyEssence, isPlaying, merge, onMergeCell, onMergeDrop, selectedCell, trashMode, t],
  );

  const renderRecipeBook = () => (
    <div className="merge-recipe-book">
      <div className="panel-scroll merge-recipe-list">
        {MERGE_RECIPES.map((recipe, index) => {
          const known = discoveredRecipes.has(recipe.id);
          const resultId = recipeResultItem(recipe);
          return (
            <div key={recipe.id} className={`merge-recipe-card${known ? "" : " locked"}`} title={known ? translated(t, `merge.recipe.${recipe.id}.hint`, recipe.hint) : t("merge.lockedRecipeHint")}>
              <span className="merge-recipe-kicker">{known ? t("merge.knownRecipe") : t("merge.lockedRecipeNumber", { number: index + 1 })}</span>
              <strong>{known ? translated(t, `merge.recipe.${recipe.id}.name`, recipe.name) : t("merge.unknownRecipe")}</strong>
              <small>{known ? translated(t, `merge.recipe.${recipe.id}.hint`, recipe.hint) : t("merge.lockedRecipeHint")}</small>
              <span className="merge-recipe-formula">
                {known
                  ? `${recipe.ingredients.map((id) => mergeItemLabel(id, t)).join(" + ")} -> ${mergeItemLabel(resultId, t)}`
                  : t("merge.hiddenFormula")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderItemBook = () => (
    <div className="panel-scroll merge-item-book">
      {Object.values(MERGE_CHAINS).map((chain) => (
        <section key={chain.id} className="merge-item-chain">
          <strong>{translated(t, `merge.chain.${chain.id}`, chain.name)}</strong>
          <div>
            {chain.items.map((itemId, level) => {
              const known = discoveredItems.has(itemId);
              const qty = merge.itemCounts?.[itemId] || 0;
              return (
                <span key={itemId} className={known ? "" : "locked"}>
                  <b>{known ? `${chain.emoji[level]} ${mergeItemName(itemId, t)}` : t("merge.undiscoveredItem")}</b>
                  <small>{known ? t("merge.itemCount", { count: qty }) : t("merge.itemHiddenLevel", { level: level + 1 })}</small>
                </span>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );

  const renderExchangePanel = () => (
    <div className="merge-exchange-list">
      {visibleExchangeOffers.map((offer) => {
        const used = Math.max(0, Math.floor(Number(exchangeClaimsToday[offer.id]) || 0));
        const limit = Math.max(0, Math.floor(Number(offer.perDayLimit) || 0));
        const limitReached = limit > 0 && used >= limit;
        const canExchange = !offer.locked && !limitReached && alchemyEssence >= offer.cost;
        const rewardLabel = offer.reward?.shinyTreats
          ? t("yard.cost.shiny", { count: offer.reward.shinyTreats })
          : offer.reward?.treats
            ? t("yard.cost.treats", { count: offer.reward.treats })
            : t("merge.exchange.futureReward");
        return (
          <button
            key={offer.id}
            type="button"
            className={`merge-exchange-offer${offer.locked ? " locked" : ""}${canExchange ? " ready" : ""}`}
            disabled={!canExchange}
            onClick={() => exchangeOffer(offer.id)}
          >
            <span>
              <strong>{translated(t, offer.labelKey, rewardLabel)}</strong>
              <small>{translated(t, offer.descriptionKey, t("merge.exchange.defaultHint"))}</small>
            </span>
            <b>{offer.locked ? t("merge.exchange.locked") : t("merge.exchange.cost", { count: offer.cost })}</b>
            {limit > 0 && <i>{t("merge.exchange.limit", { used, limit })}</i>}
          </button>
        );
      })}
    </div>
  );

  const renderScenePanel = () => {
    if (!activePanel) return null;
    const title = activePanel === "recipes"
      ? t("merge.recipeBook")
      : activePanel === "items"
        ? t("merge.itemBook")
        : t("merge.exchange.title");
    return (
      <aside
        className={`merge-scene-drawer ${activePanel === "exchange" ? "merge-exchange-panel" : "merge-library-panel"}`}
        data-no-nav-swipe="true"
        aria-label={title}
        style={activePanel === "exchange" && uiAssets.exchangePanel ? { "--merge-drawer-art": cssUrl(uiAssets.exchangePanel) } : undefined}
      >
        <div className="merge-drawer-header">
          <div>
            <strong>{title}</strong>
            <span>
              {activePanel === "recipes"
                ? t("merge.recipeProgress", { known: discoveredRecipes.size, total: MERGE_RECIPES.length })
                : activePanel === "items"
                  ? t("merge.itemsOnBoard", { count: itemTotal })
                  : t("merge.exchange.balance", { count: alchemyEssence })}
            </span>
          </div>
          <button type="button" className="merge-icon-button" onClick={closeScenePanel} aria-label={t("common.close")}>
            <X size={18} />
          </button>
        </div>
        {activePanel === "recipes" && renderRecipeBook()}
        {activePanel === "items" && renderItemBook()}
        {activePanel === "exchange" && renderExchangePanel()}
      </aside>
    );
  };

  return (
    <GameShell
      gameId="merge"
      phase={paused ? "paused" : "playing"}
      skin="meditation"
      overlayClassName="merge-pause-overlay"
      hud={(
        <>
          <div className="game-play-hud merge-play-status">
            <div className="game-play-title">
              <strong>{t("merge.alchemyTable")}</strong>
              <span>{generatorHint}</span>
            </div>
            <div className="game-play-stats">
              <button type="button" className="merge-stat-button" onClick={() => openScenePanel("items")}>
                {t("merge.items")} <strong>{itemTotal}</strong>
              </button>
              <button type="button" className="merge-stat-button" onClick={() => openScenePanel("recipes")}>
                {t("merge.recipes")} <strong>{recipeStats}</strong>
              </button>
              <button type="button" className="merge-essence-beaker" onClick={() => openScenePanel("exchange")}>
                <span>{t("merge.essence")}</span>
                <strong>{alchemyEssence}</strong>
                <i aria-hidden="true"><b style={{ transform: `scaleX(${essenceProgress / 100})` }} /></i>
              </button>
              <span>{t("merge.mode")} <strong>{trashMode ? t("merge.modeTrash") : t("merge.modeMerge")}</strong></span>
              {lastEssenceReward && <span>{t("merge.essenceGain")} <strong>+{lastEssenceReward}</strong></span>}
              {lastMergeReward && <span>{t("merge.reward")} <strong>{lastMergeReward}</strong></span>}
            </div>
            <div className="game-play-actions merge-hud-actions">
              <PanelButton icon={Pause} subtle onClick={pauseMerge} title={t("common.pause")}>
                {t("common.pause")}
              </PanelButton>
            </div>
          </div>
          <div className="merge-library-rail" data-no-nav-swipe="true" style={uiAssets.libraryRail ? { "--merge-rail-art": cssUrl(uiAssets.libraryRail) } : undefined}>
            <button type="button" className={activePanel === "recipes" ? "active" : ""} onClick={() => openScenePanel("recipes")}>
              <BookOpen size={19} />
              <span>{t("merge.recipeBook")}</span>
              <b>{recipeStats}</b>
            </button>
            <button type="button" className={activePanel === "items" ? "active" : ""} onClick={() => openScenePanel("items")}>
              <PackageOpen size={19} />
              <span>{t("merge.itemBook")}</span>
              <b>{itemTotal}</b>
            </button>
            <button type="button" className={activePanel === "exchange" ? "active" : ""} onClick={() => openScenePanel("exchange")}>
              <ShoppingBag size={19} />
              <span>{t("merge.exchange.short")}</span>
              <b>{alchemyEssence}</b>
            </button>
          </div>
          {renderScenePanel()}
          <div className="merge-action-dock" data-no-nav-swipe="true">
            <div className="merge-generator-dock">
              <label className="merge-fuel-field">
                <span>{t("merge.source")}</span>
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
                {t("merge.generate")}
              </PanelButton>
            </div>
            <div className="merge-generator-hint">{generatorHint}</div>
            <div className="merge-action-strip">
              <PanelButton
                icon={Zap}
                className="merge-free-taps-button"
                disabled={!canClaimFreeTaps}
                onClick={() => performAction("merge.claimFreeTaps")}
                title={t("merge.dailyTapsHint")}
              >
                {canClaimFreeTaps
                  ? t("merge.dailyTaps", { count: freeTapClaim.claimable })
                  : t("merge.nextFreeTap", { minutes: freeTapWaitMinutes })}
              </PanelButton>
              <PanelButton
                icon={PackageOpen}
                disabled={!canFreePull}
                onClick={() => performAction("merge.freePull")}
                title={t("merge.dailyDropHint")}
              >
                {canFreePull ? t("merge.dailyDrop") : t("merge.dropClaimed")}
              </PanelButton>
              <PanelButton
                icon={Sparkles}
                disabled={tokenCount < ECONOMY.GACHA_PULL_COST}
                onClick={() => performAction("merge.gacha")}
                title={t("merge.tokenPullHint", { cost: ECONOMY.GACHA_PULL_COST })}
              >
                {t("merge.tokenPull")}
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
            </div>
          </div>
        </>
      )}
      overlay={(
        <>
          <div className="panel-header pause-panel-header">
            <div>
              <strong>{t("merge.alchemyTable")}</strong>
              <span>{`${alchemyEssence} ${t("merge.essence").toLowerCase()} · ${merge.freeTapCharges || 0} ${t("merge.freeTaps")} · ${inventory.rewards?.gachaTokens || 0} ${t("common.tokens").toLowerCase()}`}</span>
            </div>
          </div>
          {activePause && (
            <div className="pause-action-stack">
              <PanelButton icon={Play} className="pause-primary" onClick={resumeMerge}>{t("common.resume")}</PanelButton>
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
                <PanelButton icon={Home} danger onClick={exitToHub}>{t("common.exit")}</PanelButton>
              </div>
            </div>
          )}
          <PauseBrief
            gameId="merge"
            kicker={t("pause.paused")}
            title={t("pause.mergeFrozen")}
            body={t("pause.mergeIntro")}
            status={[
              { label: t("merge.mode"), value: trashMode ? t("merge.modeTrash") : t("merge.modeMerge") },
              { label: t("merge.essence"), value: alchemyEssence },
              { label: t("merge.items"), value: itemTotal },
              lastMergeReward ? { label: t("merge.reward"), value: lastMergeReward } : null,
            ].filter(Boolean)}
          />
        </>
      )}
    >
      <PixiScene sceneKey="merge" sceneState={sceneState} />
    </GameShell>
  );
}
