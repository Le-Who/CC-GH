import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Hammer, Home, Play, ShoppingBag, Sparkles, Zap } from "lucide-react";
import { CROPS } from "../../../game-logic.js";
import { listPositive } from "../../game-state/inventory.js";
import { PixiScene } from "../../app/PixiScene.jsx";
import { GamePlayHud, PanelButton, SectionTabs, formatCount } from "../../app/shell.jsx";
import { useAction, useImmersiveGame, useSnapshot } from "../../app/gameHooks.js";
import { useAppI18n } from "../../app/i18n.jsx";
export default function FarmGame() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const { t } = useAppI18n();
  const [farmTab, setFarmTab] = useState("shop");
  const [selectedSeed, setSelectedSeed] = useState("strawberry");
  const [buyQty, setBuyQty] = useState(1);
  const [tick, setTick] = useState(0);
  const [inShell, setInShell] = useState(false);
  const [paused, setPaused] = useState(false);
  const farm = snapshot?.farm || {};
  const inventory = snapshot?.inventory || {};
  const crops = snapshot?.meta?.crops || CROPS;
  const unlockedSeeds = farm.unlockedSeeds || ["strawberry", "blueberry"];
  const isPlaying = inShell && !paused;
  useImmersiveGame("farm", inShell);

  useEffect(() => {
    const id = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!unlockedSeeds.includes(selectedSeed)) setSelectedSeed(unlockedSeeds[0] || "strawberry");
  }, [selectedSeed, unlockedSeeds]);

  const onPlot = useCallback(
    (plotId, plot) => {
      if (!plot) return;
      if (!plot.crop) {
        performAction("farm.plant", { plotId, cropId: selectedSeed }, { key: `farm.plot.${plotId}` });
        return;
      }
      const base = plot.effectiveGrowthTime || plot.growthTime || crops[plot.crop]?.growthTime || 60_000;
      const multiplier = plot.watered ? plot.wateringMultiplier || 0.7 : 1;
      const progress = Math.min(1, (Date.now() - (plot.plantedAt || Date.now())) / (base * multiplier));
      if (progress >= 1) {
        performAction("farm.harvest", { plotId }, { key: `farm.plot.${plotId}` });
      } else if (!plot.watered) {
        performAction("farm.water", { plotId }, { key: `farm.plot.${plotId}` });
      }
    },
    [crops, performAction, selectedSeed],
  );

  const onPlotLongPress = useCallback(
    (plotId, plot) => {
      if (!plot?.crop) return;
      performAction("farm.uproot", { plotId }, { key: `farm.uproot.${plotId}` });
    },
    [performAction],
  );

  const sceneState = useMemo(
    () => ({
      snapshot: { ...snapshot, serverTime: Date.now() + tick },
      selectedSeed,
      farmLabels: {
        soil: t("farm.soil"),
        seed: t("farm.seedLabel"),
        ready: t("farm.ready"),
        uproot: t("farm.uproot"),
        watered: t("farm.watered"),
      },
      onFarmPlot: onPlot,
      onFarmLongPress: onPlotLongPress,
    }),
    [snapshot, selectedSeed, onPlot, onPlotLongPress, tick, t],
  );

  return (
    <div className={`game-layout farm-layout${inShell ? ` game-shell ${isPlaying ? "shell-playing" : "shell-paused"}` : ""}`}>
      <PixiScene sceneKey="farm" sceneState={sceneState} />
      {isPlaying && (
        <GamePlayHud
          title={t("farm.title")}
          subtitle={`${t("farm.levelShort")} ${farm.level || 1} · ${farm.xp || 0} ${t("farm.xp")} · ${crops[selectedSeed]?.name || selectedSeed}`}
          stats={[
            { label: t("common.gold"), value: formatCount(snapshot?.resources?.gold || 0) },
            { label: t("farm.plots"), value: farm.plots?.length || 0 },
            { label: t("farm.seed"), value: inventory.seeds?.[selectedSeed] || 0 },
          ]}
          onPause={() => setPaused(true)}
          onFinish={() => performAction("farm.harvestAll")}
          finishLabel={t("farm.harvest")}
        />
      )}
      <aside className={`side-panel${inShell ? " game-menu-overlay" : ""}`}>
        <div className="panel-header">
          <div>
            <strong>{t("farm.title")}</strong>
            <span>{t("farm.levelShort")} {farm.level || 1} · {farm.xp || 0} {t("farm.xp")}</span>
          </div>
          <PanelButton
            icon={Play}
            onClick={() => {
              setInShell(true);
              setPaused(false);
            }}
          >
            {inShell ? t("common.resume") : t("common.play")}
          </PanelButton>
        </div>
        {inShell && paused && (
          <div className="button-row two">
            <PanelButton icon={Play} onClick={() => setPaused(false)}>{t("common.resume")}</PanelButton>
            <PanelButton
              icon={Home}
              danger
              onClick={() => {
                setPaused(false);
                setInShell(false);
              }}
            >
              {t("common.exit")}
            </PanelButton>
          </div>
        )}
        {snapshot?.offlineReport && <div className="callout">{t("farm.offlineApplied")}</div>}
        <SectionTabs
          active={farmTab}
          onChange={setFarmTab}
          tabs={[
            { id: "shop", label: t("farm.shop") },
            { id: "bag", label: t("farm.bag") },
            { id: "badges", label: t("farm.badges") },
            { id: "journal", label: t("farm.journal") },
            { id: "season", label: t("farm.season") },
          ]}
        />
        {farmTab === "shop" && (
          <div className="panel-scroll grid-list">
            <div className="quantity-row">
              <span>{t("farm.buyQuantity")}</span>
              <input type="number" min="1" max="99" value={buyQty} onChange={(e) => setBuyQty(Math.max(1, Number(e.target.value) || 1))} />
            </div>
            {unlockedSeeds.map((cropId) => {
              const crop = crops[cropId] || {};
              return (
                <div
                  key={cropId}
                  role="button"
                  tabIndex={0}
                  className={`item-card ${selectedSeed === cropId ? "selected" : ""}`}
                  onClick={() => setSelectedSeed(cropId)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedSeed(cropId);
                    }
                  }}
                >
                  <span className="item-emoji">{crop.emoji || "🌱"}</span>
                  <span>
                    <strong>{crop.name || cropId}</strong>
                    <small>{t("farm.seeds")} {inventory.seeds?.[cropId] || 0} · {crop.seedPrice || 0}g</small>
                  </span>
                  <PanelButton
                    icon={ShoppingBag}
                    onClick={(event) => {
                      event.stopPropagation();
                      performAction("farm.buySeeds", { cropId, amount: buyQty });
                    }}
                  >
                    {t("farm.buy")}
                  </PanelButton>
                </div>
              );
            })}
            <div className="button-row">
              <PanelButton icon={Check} onClick={() => performAction("farm.harvestAll")}>{t("farm.harvestAll")}</PanelButton>
              <PanelButton icon={Hammer} onClick={() => performAction("farm.buyPlot")}>{t("farm.buyPlot")}</PanelButton>
              <PanelButton icon={Zap} onClick={() => performAction("farm.activateBooster", { boosterId: "fertilizer" })}>{t("farm.fertilizer")}</PanelButton>
            </div>
            <ThemePicker />
          </div>
        )}
        {farmTab === "bag" && <BagPanel />}
        {farmTab === "badges" && <AchievementsPanel />}
        {farmTab === "journal" && <JournalPanel crops={crops} />}
        {farmTab === "season" && <SeasonPanel />}
      </aside>
    </div>
  );
}

function ThemePicker() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const { t } = useAppI18n();
  const themes = snapshot?.meta?.plotThemes || {};
  const cosmetics = snapshot?.farm?.cosmetics || {};
  return (
    <div className="theme-strip">
      {Object.values(themes).map((theme) => {
        const owned = cosmetics.ownedThemes?.includes(theme.id);
        return (
          <button
            key={theme.id}
            className={cosmetics.activePlotTheme === theme.id ? "active" : ""}
            onClick={() => performAction(owned ? "farm.setTheme" : "farm.buyTheme", { themeId: theme.id })}
            title={owned ? t("farm.setTheme") : t("farm.buyFor", { cost: theme.cost })}
          >
            <span>{theme.emoji}</span>
            <small>{theme.name}</small>
          </button>
        );
      })}
    </div>
  );
}

function BagPanel() {
  const snapshot = useSnapshot();
  const performAction = useAction();
  const { t } = useAppI18n();
  const harvested = snapshot?.inventory?.harvested || {};
  const crops = snapshot?.meta?.crops || CROPS;
  const entries = listPositive(harvested);
  return (
    <div className="panel-scroll grid-list">
      {!entries.length && <div className="empty-state">{t("farm.emptyBag")}</div>}
      {entries.map(([cropId, qty]) => {
        const crop = crops[cropId] || {};
        return (
          <div className="item-card" key={cropId}>
            <span className="item-emoji">{crop.emoji || "🌱"}</span>
            <span>
              <strong>{crop.name || cropId}</strong>
              <small>x{qty} · sell {crop.sellPrice || 0}g</small>
            </span>
            <PanelButton icon={Sparkles} onClick={() => performAction("farm.sellCrop", { cropId, amount: 1 })}>{t("farm.sell")}</PanelButton>
          </div>
        );
      })}
    </div>
  );
}

function AchievementsPanel() {
  const snapshot = useSnapshot();
  const badges = snapshot?.achievements?.badges || {};
  return (
    <div className="panel-scroll badge-grid">
      {Object.values(badges).map((badge) => (
        <div key={badge.id} className={`badge-card ${badge.unlocked ? "unlocked" : ""}`}>
          <span>{badge.emoji}</span>
          <strong>{badge.name}</strong>
          <small>{badge.desc}</small>
        </div>
      ))}
    </div>
  );
}

function JournalPanel({ crops }) {
  const snapshot = useSnapshot();
  const { t } = useAppI18n();
  const discovered = new Set(snapshot?.farm?.journal?.discovered || []);
  return (
    <div className="panel-scroll grid-list">
      {Object.values(crops).map((crop) => (
        <div className={`item-card ${discovered.has(crop.id) ? "" : "locked"}`} key={crop.id}>
          <span className="item-emoji">{discovered.has(crop.id) ? crop.emoji : "?"}</span>
          <span>
            <strong>{discovered.has(crop.id) ? crop.name : t("farm.undiscovered")}</strong>
            <small>{discovered.has(crop.id) ? crop.lore : crop.unlockCondition?.label || t("farm.keepFarming")}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function SeasonPanel() {
  const snapshot = useSnapshot();
  const { t } = useAppI18n();
  const season = snapshot?.farm?.seasonPass || {};
  return (
    <div className="panel-scroll grid-list">
      <div className="progress-card">
        <strong>{season.name || t("farm.season")}</strong>
        <span>{season.xp || 0} {t("farm.xp")} · {t("farm.tier")} {(season.currentTier || 0) + 1}</span>
      </div>
      {(season.tiers || []).map((tier, index) => (
        <div key={index} className={`item-card ${tier.unlocked ? "" : "locked"}`}>
          <span className="item-emoji">{tier.unlocked ? "★" : "·"}</span>
          <span>
            <strong>{tier.label}</strong>
            <small>{tier.xp} {t("farm.xp")} · {tier.claimed ? t("farm.claimed") : tier.unlocked ? t("farm.unlocked") : t("farm.locked")}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

