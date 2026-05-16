import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Home, PackageOpen, Play, Sparkles, Trash2, X, Zap } from "lucide-react";
import {
  ECONOMY,
  MERGE_CHAINS,
  MERGE_EXCHANGE_OFFERS,
  MERGE_FREE_TAP_BANK_CAP,
  MERGE_RECIPES,
  MERGE_WILD_GENERATOR_ID,
  getMergeFreeTapClaim,
} from "../../../game-logic.js";
import { audioManager } from "../../services/audioManager.js";
import { listPositive } from "../../game-state/inventory.js";
import { PixiScene } from "../../app/PixiScene.jsx";
import { HudEditableRegion } from "../../app/hud-layout/index.js";
import { GameShell, PanelButton, PauseBrief } from "../../app/shell.jsx";
import { useAction, useExitToHub, useImmersiveGame, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
import { useGameHub } from "../../game-state/useGameHub.js";
import { useGameEvents } from "../../game-state/gameEvents.js";
import { loadRuntimeAssetManifest, resolveAssetUrl } from "../../game-runtime/assetBundles.js";
import { useServerClock } from "./useServerClock.js";
import { resolveMergeTapSelection } from "./selection.js";
import "./i18n.js";
import "./merge.css";

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

const MERGE_UI_ASSET_KEYS = [
  "libraryRail",
  "libraryPanel",
  "itemPanel",
  "recipePanel",
  "exchangePanel",
  "actionDock",
  "hudBar",
  "hudIconItems",
  "hudIconRecipes",
  "hudIconExchange",
  "hudIconEssence",
  "hudIconMode",
  "hudIconPause",
  "actionIconGenerate",
  "actionIconDaily",
  "actionIconTokens",
  "actionIconTrash",
];

function emptyMergeUiAssets() {
  return Object.fromEntries(MERGE_UI_ASSET_KEYS.map((key) => [key, ""]));
}

function useMergeUiAssets() {
  const [assets, setAssets] = useState(emptyMergeUiAssets);
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
      setAssets(Object.fromEntries(MERGE_UI_ASSET_KEYS.map((key) => [key, asset("ui", key)])));
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

function MergeAssetIcon({ asset, icon: Icon = Sparkles, className = "" }) {
  if (asset) {
    return <span className={`merge-asset-icon${className ? ` ${className}` : ""}`} style={{ "--merge-icon-art": cssUrl(asset) }} aria-hidden="true" />;
  }
  return <Icon size={18} aria-hidden="true" />;
}

function MergeTopTool({ asset, icon, label, active, onClick, panel }) {
  return (
    <button
      type="button"
      className={`merge-top-tool${active ? " active" : ""}`}
      aria-label={label}
      title={label}
      data-merge-panel={panel}
      onClick={(event) => {
        audioManager.play("tap");
        onClick?.(event);
      }}
    >
      <MergeAssetIcon asset={asset} icon={icon} />
    </button>
  );
}

function boardVisualSignature(board = []) {
  return board
    .map((row = []) => row
      .map((item) => {
        if (!item) return "";
        return [
          item.id || item.itemId || "",
          item.chainId || "",
          item.level ?? "",
          item.asset || "",
          item.recipe || "",
        ].join(":");
      })
      .join(","))
    .join("|");
}

export default function MergeGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const exitToHub = useExitToHub();
  const lastResult = useGameHub((state) => state.lastResult);
  const mergeActionPending = useGameHub((state) => (
    Object.keys(state.busy || {}).some((key) => key.startsWith("merge."))
  ));
  const pushEvent = useGameEvents((store) => store.pushEvent);
  const { t } = useAppI18n();
  const merge = snapshot?.merge || {};
  const inventory = snapshot?.inventory || {};
  const serverNow = useServerClock(snapshot);
  const [selectedCell, setSelectedCell] = useState(null);
  const [trashMode, setTrashMode] = useState(false);
  const [trashConfirmCell, setTrashConfirmCell] = useState("");
  const [activePanel, setActivePanel] = useState(null);
  const [paused, setPaused] = useState(false);
  const uiAssets = useMergeUiAssets();
  const isPlaying = !paused;
  const activePause = paused;
  const shellControls = useMemo(() => ({
    activeRun: true,
    openPanel: !!activePanel,
    closePanel: activePanel ? () => setActivePanel(null) : null,
    pauseRun: () => setPaused(true),
    hudState: {
      alchemyEssence: Math.max(0, Math.floor(Number(merge.alchemyEssence) || 0)),
      freeTapCharges: Math.max(0, Math.floor(Number(merge.freeTapCharges) || 0)),
    },
  }), [activePanel, merge.alchemyEssence, merge.freeTapCharges]);
  useImmersiveGame("merge", true, shellControls);

  const harvestedEntries = listPositive(inventory.harvested || {});
  const firstFuel = harvestedEntries[0]?.[0];
  const activeFuel = firstFuel;
  const itemTotal = Object.values(merge.itemCounts || {}).reduce((sum, qty) => sum + qty, 0);
  const wildGenerator = merge.generatorState?.[MERGE_WILD_GENERATOR_ID] || {};
  const generatorCoolingDown = wildGenerator.cooldownEnd > serverNow;
  const tokenCount = inventory.rewards?.gachaTokens || 0;
  const now = serverNow;
  const today = new Date(now).toISOString().slice(0, 10);
  const alchemyEssence = Math.max(0, Math.floor(Number(merge.alchemyEssence) || 0));
  const exchangeClaimsToday = merge.exchangeClaims?.[today] || {};
  const visibleExchangeOffers = MERGE_EXCHANGE_OFFERS;
  const canFreePull = new Date(merge.lastFreePull || 0).toISOString().slice(0, 10) !== today;
  const freeTapClaim = getMergeFreeTapClaim(merge, now);
  const canClaimFreeTaps = freeTapClaim.claimable > 0;
  const freeTapCharges = Math.max(0, Math.floor(Number(merge.freeTapCharges) || 0));
  const freeTapBankFull = Math.max(0, Math.floor(Number(merge.freeTapCharges) || 0)) >= MERGE_FREE_TAP_BANK_CAP;
  const freeTapWaitMinutes = Math.max(1, Math.ceil((freeTapClaim.nextFreeTapAt - now) / 60000));
  const canTapGenerator = !mergeActionPending && !generatorCoolingDown && (!!activeFuel || freeTapCharges > 0);
  const mergeBoardSignature = useMemo(() => boardVisualSignature(merge.board), [merge.board]);
  const sceneMerge = useMemo(() => ({ board: merge.board || [] }), [mergeBoardSignature]);
  const lastMergeReward = lastResult?.action?.startsWith?.("merge.") && lastResult.reward?.type === "yardGoodie"
    ? lastResult.reward.goodieId
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
  const generatorBadge = freeTapCharges > 0 ? String(freeTapCharges) : activeFuel ? "-1" : "";
  const generatorStatus = generatorCoolingDown
    ? t("merge.coolingDown")
    : freeTapCharges > 0
      ? t("merge.freeTapsReadyShort", { count: freeTapCharges })
      : activeFuel
        ? t("merge.cropFuelReady")
        : t("merge.noFuelShort");
  const gachaTokenBadge = t("merge.gachaTokenBadge", { count: tokenCount, cost: ECONOMY.GACHA_PULL_COST });
  const dailyDockDisabled = mergeActionPending || (!canClaimFreeTaps && !canFreePull);
  const dailyDockLabel = canClaimFreeTaps || canFreePull
    ? t("merge.claimDailyTokens")
      : freeTapBankFull
        ? t("merge.freeTapBankFull", { count: MERGE_FREE_TAP_BANK_CAP })
        : t("merge.nextFreeTap", { minutes: freeTapWaitMinutes });
  const claimDailyDock = useCallback(() => {
    if (canClaimFreeTaps) {
      return performAction("merge.claimFreeTaps", {}, { feedback: false });
    }
    if (canFreePull) {
      return performAction("merge.freePull");
    }
    return Promise.resolve({ error: "daily unavailable" });
  }, [canClaimFreeTaps, canFreePull, performAction]);
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
  const requestTrash = useCallback((r, c, item) => {
    if (!item) return Promise.resolve({ error: "empty cell" });
    const cellKey = `${r}:${c}`;
    const needsConfirm = Number(item.level) > 0 || item.chainId === "alchemy" || item.recipe;
    if (needsConfirm && trashConfirmCell !== cellKey) {
      setTrashConfirmCell(cellKey);
      pushEvent({ game: "merge", title: t("merge.trashConfirmTitle"), value: t("merge.trashConfirmBody"), tone: "warning", ttlMs: 2400 });
      return Promise.resolve({ pending: true, confirm: true });
    }
    setTrashConfirmCell("");
    return performAction("merge.trash", { r, c }, { key: `merge.trash.${r}.${c}.${item.itemId || item.id || ""}` });
  }, [performAction, pushEvent, t, trashConfirmCell]);

  const onMergeCell = useCallback(
    (r, c, item) => {
      if (!isPlaying) return;
      const decision = resolveMergeTapSelection({
        board: merge.board || [],
        selectedCell,
        r,
        c,
        item,
        trashMode,
      });
      if (decision.action === "trash") {
        requestTrash(r, c, item);
        return;
      }
      if (decision.action === "noop") return;
      setTrashConfirmCell("");
      if (decision.action === "clear") {
        setSelectedCell(null);
        return;
      }
      if (decision.action === "select") {
        setSelectedCell(decision.selectedCell);
        return;
      }
      performAction("merge.merge", { fromR: decision.from.r, fromC: decision.from.c, toR: decision.to.r, toC: decision.to.c }, { key: `merge.merge.${decision.from.r}.${decision.from.c}.${decision.to.r}.${decision.to.c}` }).then((result) => {
        if (!result.error) setSelectedCell(null);
      });
    },
    [isPlaying, merge.board, performAction, requestTrash, selectedCell, trashMode],
  );

  const onMergeDrop = useCallback(
    (fromR, fromC, toR, toC, item) => {
      if (!isPlaying) return Promise.resolve({ error: "paused" });
      if (trashMode) {
        if (item) return requestTrash(fromR, fromC, item);
        return Promise.resolve({ error: "empty cell" });
      }
      setTrashConfirmCell("");
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
    [isPlaying, performAction, requestTrash, trashMode],
  );

  const sceneState = useMemo(
    () => ({
      merge: sceneMerge,
      mergeEssence: alchemyEssence,
      mergeSelected: selectedCell,
      trashMode,
      mergeLocked: !isPlaying,
      mergeMissText: t("merge.miss"),
      mergePerfectText: t("merge.perfectReaction"),
      mergeLevelPrefix: t("farm.levelShort"),
      mergeBottomReserve: 188,
      onMergeCell,
      onMergeDrop,
    }),
    [alchemyEssence, isPlaying, onMergeCell, onMergeDrop, sceneMerge, selectedCell, trashMode, t],
  );
  const mergePauseArt = uiAssets.exchangePanel || uiAssets.recipePanel || uiAssets.itemPanel || uiAssets.libraryPanel;

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
    const drawerAsset = activePanel === "exchange" ? uiAssets.exchangePanel : uiAssets.libraryPanel;
    return (
      <HudEditableRegion
        id="mergeSceneDrawer"
        as="aside"
        className={`merge-scene-drawer ${activePanel === "exchange" ? "merge-exchange-panel" : "merge-library-panel"}`}
        data-no-nav-swipe="true"
        aria-label={title}
        style={drawerAsset ? { "--merge-drawer-art": cssUrl(drawerAsset) } : undefined}
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
      </HudEditableRegion>
    );
  };

  return (
    <GameShell
      gameId="merge"
      phase={paused ? "paused" : "playing"}
      skin="meditation"
      className="merge-shell"
      overlayClassName="merge-pause-overlay"
      style={mergePauseArt ? { "--merge-pause-art": cssUrl(mergePauseArt) } : undefined}
      hud={(
        <>
          <HudEditableRegion id="mergeSceneHud" as="div" className="merge-scene-hud" data-no-nav-swipe="true" style={uiAssets.hudBar ? { "--merge-hud-art": cssUrl(uiAssets.hudBar) } : undefined}>
            <button
              type="button"
              className="merge-hud-essence"
              data-merge-panel="exchange"
              onClick={() => openScenePanel("exchange")}
              aria-label={t("merge.exchange.title")}
              title={t("merge.exchange.title")}
            >
              <MergeAssetIcon asset={uiAssets.hudIconEssence} icon={Sparkles} />
              <strong>{alchemyEssence}</strong>
            </button>
            <div className="merge-hud-energy" aria-label={t("merge.freeTaps")}>
              <Zap size={28} aria-hidden="true" />
              <strong>{freeTapCharges}/{MERGE_FREE_TAP_BANK_CAP}</strong>
            </div>
            <div className="merge-hud-tools">
              <MergeTopTool
                asset={uiAssets.hudIconItems}
                icon={PackageOpen}
                label={t("merge.itemBook")}
                active={activePanel === "items"}
                panel="items"
                onClick={() => openScenePanel("items")}
              />
              <MergeTopTool
                asset=""
                icon={Sparkles}
                label={t("merge.recipeBook")}
                active={activePanel === "recipes"}
                panel="recipes"
                onClick={() => openScenePanel("recipes")}
              />
              <MergeTopTool
                asset={uiAssets.hudIconRecipes || uiAssets.hudIconExchange}
                icon={BookOpen}
                label={t("common.pause")}
                panel="pause"
                onClick={pauseMerge}
              />
            </div>
          </HudEditableRegion>
          {renderScenePanel()}
          <HudEditableRegion
            id="mergeActionDock"
            as="div"
            className="merge-action-area"
            data-no-nav-swipe="true"
          >
            <div
              className="merge-action-dock"
              style={uiAssets.actionDock ? { "--merge-action-dock-art": cssUrl(uiAssets.actionDock) } : undefined}
            >
              <button
                type="button"
                className={`merge-dock-side merge-dock-trash${trashMode ? " active" : ""}`}
                data-merge-action="trash"
                aria-label={trashMode ? t("merge.trashOn") : t("merge.trash")}
                title={trashMode ? t("merge.disableTrash") : t("merge.enableTrash")}
                onClick={() => {
                  audioManager.play("tap");
                  setTrashConfirmCell("");
                  setTrashMode((value) => !value);
                }}
              >
                <MergeAssetIcon asset={uiAssets.actionIconTrash} icon={Trash2} />
                <span>{trashMode ? t("merge.trashActiveShort") : t("merge.trashShort")}</span>
              </button>
              <HudEditableRegion
                id="mergeActionGenerateAsset"
                as="button"
                type="button"
                className={`merge-dock-generate${canTapGenerator ? " ready" : ""}`}
                data-merge-action="generate"
                disabled={!canTapGenerator}
                aria-label={t("merge.generateActionLabel", { status: generatorStatus })}
                title={generatorStatus}
                onClick={() => {
                  audioManager.play("tap");
                  performAction("merge.tap", { chainId: MERGE_WILD_GENERATOR_ID, cropId: activeFuel }, { key: "merge.tap.wild" });
                }}
              >
                <MergeAssetIcon asset={uiAssets.actionIconGenerate} icon={Zap} />
                {generatorBadge && <b>{generatorBadge}</b>}
                <span className="merge-dock-generate-label">{t("merge.generate")}</span>
                <small>{generatorStatus}</small>
              </HudEditableRegion>
              <button
                type="button"
                className="merge-dock-side merge-dock-gacha"
                data-merge-action="gacha"
                disabled={tokenCount < ECONOMY.GACHA_PULL_COST}
                aria-label={t("merge.tokenPull")}
                title={t("merge.tokenPullHint", { cost: ECONOMY.GACHA_PULL_COST })}
                onClick={() => {
                  audioManager.play("tap");
                  performAction("merge.gacha");
                }}
              >
                <MergeAssetIcon asset={uiAssets.actionIconTokens} icon={Sparkles} />
                <span>{t("merge.gacha")}</span>
                <b>{gachaTokenBadge}</b>
              </button>
            </div>
            <button
              type="button"
              className="merge-daily-token-button"
              data-merge-action="daily"
              disabled={dailyDockDisabled}
              onClick={() => {
                audioManager.play("tap");
                claimDailyDock();
              }}
            >
              <MergeAssetIcon asset="" icon={Sparkles} />
              <span>{dailyDockLabel}</span>
            </button>
          </HudEditableRegion>
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
                  onClick={() => {
                    setTrashConfirmCell("");
                    setTrashMode((value) => !value);
                  }}
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
