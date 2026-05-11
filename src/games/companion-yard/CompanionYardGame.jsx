import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  YARD_FOODS,
  YARD_GOODIES,
  YARD_REMODELS,
  YARD_VISITORS,
  clampYardPointToPlayzone,
  getYardGoodieActivities,
  getUnlockedYardSlots,
  isYardVisitUsingGoodie,
} from "../../../game-logic.js";
import { useGameHub } from "../../game-state/useGameHub.js";
import { audioManager } from "../../services/audioManager.js";
import { useAppI18n } from "../../app/i18n.jsx";
import { useEscapeDismiss } from "../../app/useDismissableLayer.js";
import { loadCompanionYardManifest, resolveCompanionYardAsset, resolveCompanionYardHudSheet } from "./assets.js";
import { getVisitorMotion, getYardObstacleRects } from "./movement.js";
import "./i18n.js";
import "./companion-yard.css";

const SPECIES_LABELS = {
  cat: "Cat",
  dog: "Dog",
  bunny: "Bunny",
  fox: "Fox",
  hamster: "Hamster",
  turtle: "Turtle",
};

const SCREEN_META = {
  food: { titleKey: "yard.screen.food", fallback: "Food bowls", icon: "food" },
  goodies: { titleKey: "yard.screen.goodies", fallback: "Goodies", icon: "goodies" },
  shop: { titleKey: "yard.screen.shop", fallback: "Shop", icon: "shop" },
  petbook: { titleKey: "yard.screen.petbook", fallback: "Petbook", icon: "petbook" },
  album: { titleKey: "yard.screen.album", fallback: "Photo album", icon: "album" },
  gifts: { titleKey: "yard.screen.gifts", fallback: "Gift collection", icon: "gifts" },
  repair: { titleKey: "yard.screen.repair", fallback: "Repair goodies", icon: "repair" },
  remodel: { titleKey: "yard.screen.remodel", fallback: "Remodel yard", icon: "remodel" },
  expansion: { titleKey: "yard.screen.expansion", fallback: "Expansion", icon: "expansion" },
  daily: { titleKey: "yard.screen.daily", fallback: "Daily letter", icon: "daily" },
  companion: { titleKey: "yard.screen.companion", fallback: "Companion helper", icon: "companion" },
  settings: { titleKey: "yard.screen.settings", fallback: "Settings", icon: "settings" },
};

function formatCount(value) {
  if (value == null) return "0";
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function yardText(t, key, fallback, values) {
  if (typeof t !== "function") return fallback;
  const value = t(key, values);
  if (value !== key) return value;
  if (!values) return fallback;
  return String(fallback).replace(/\{(\w+)\}/g, (_match, valueKey) => String(values[valueKey] ?? ""));
}

function catalogText(t, type, id, field, fallback) {
  return yardText(t, `yard.catalog.${type}.${id}.${field}`, fallback);
}

function costLabel(cost = {}, t = null) {
  const parts = [];
  if (cost.treats) parts.push(yardText(t, "yard.cost.treats", `${cost.treats} treats`, { count: cost.treats }));
  if (cost.shinyTreats) parts.push(yardText(t, "yard.cost.shiny", `${cost.shinyTreats} shiny`, { count: cost.shinyTreats }));
  return parts.length ? parts.join(" + ") : yardText(t, "yard.cost.free", "Free");
}

function costParts(cost = {}, t = null) {
  const parts = [];
  if (cost.treats) {
    parts.push({
      icon: "treats",
      label: yardText(t, "yard.cost.treats", `${cost.treats} treats`, { count: cost.treats }),
    });
  }
  if (cost.shinyTreats) {
    parts.push({
      icon: "shiny",
      label: yardText(t, "yard.cost.shiny", `${cost.shinyTreats} shiny`, { count: cost.shinyTreats }),
    });
  }
  return parts.length ? parts : [{ label: yardText(t, "yard.cost.free", "Free"), plain: true }];
}

function goodieStageStyle(position, goodie) {
  const visualSize = goodie?.visualSize ?? {};
  const width = Number(visualSize.width);
  const height = Number(visualSize.height);
  return {
    left: `${position.x}%`,
    top: `${position.y}%`,
    ...(Number.isFinite(width) && width > 0 ? { "--yard-goodie-w": `${width}px` } : {}),
    ...(Number.isFinite(height) && height > 0 ? { "--yard-goodie-h": `${height}px` } : {}),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getVisitActivity(goodie, visit, placed) {
  const activities = getYardGoodieActivities(goodie, placed?.condition || "new");
  return activities.find((activity) => activity.id === visit.activityId) || activities[0] || {
    id: "rest",
    pose: "sit",
    x: 0,
    y: -8,
    layer: "front",
    roam: 2,
  };
}

function visitorAssetId(visitorInfo, pose) {
  if (!visitorInfo?.id) return "";
  return Array.isArray(visitorInfo.poses) && visitorInfo.poses.includes(pose)
    ? `${visitorInfo.id}_${pose}`
    : visitorInfo.id;
}

function visitorPreviewAssetId(visitorInfo) {
  return visitorAssetId(visitorInfo, visitorInfo?.poses?.[0]);
}

function hasPlacedPosition(placed = {}) {
  return Number.isFinite(Number(placed.x)) && Number.isFinite(Number(placed.y));
}

function getPlacedPosition(placed = {}, slotMap = new Map()) {
  if (hasPlacedPosition(placed)) {
    return {
      x: clamp(Number(placed.x), 6, 94),
      y: clamp(Number(placed.y), 6, 94),
    };
  }
  const slot = slotMap.get(placed.slotId);
  return {
    x: slot?.x || 50,
    y: slot?.y || 72,
  };
}

function YardIcon({ name }) {
  return <span className={`yard-hud-icon yard-hud-icon-${name}`} aria-hidden="true" />;
}

function cssImageUrl(value) {
  return value ? `url(${JSON.stringify(value)})` : "none";
}

function YardIconButton({
  icon,
  label,
  onClick,
  disabled,
  active,
  danger,
  compact,
  badge,
  className = "",
  children,
}) {
  return (
    <button
      type="button"
      className={`yard-icon-button${active ? " active" : ""}${danger ? " danger" : ""}${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled}
      onClick={(event) => {
        audioManager.play("tap");
        onClick?.(event);
      }}
      aria-label={label}
      title={label}
    >
      <YardIcon name={icon} />
      <span className="yard-icon-label">{children || label}</span>
      {badge ? <b className="yard-badge">{badge}</b> : null}
    </button>
  );
}

function YardActionButton({
  icon,
  children,
  onClick,
  disabled,
  active,
  danger,
  className = "",
}) {
  return (
    <button
      type="button"
      className={`yard-button${active ? " active" : ""}${danger ? " danger" : ""}${className ? ` ${className}` : ""}`}
      disabled={disabled}
      onClick={(event) => {
        audioManager.play("tap");
        onClick?.(event);
      }}
    >
      <YardIcon name={icon} />
      <span>{children}</span>
    </button>
  );
}

function YardCurrencyChip({ icon, label, value }) {
  return (
    <div className="yard-currency-chip" title={label}>
      <YardIcon name={icon} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function YardPriceChip({ parts }) {
  const priceParts = Array.isArray(parts) && parts.length ? parts : [{ label: "Free", plain: true }];
  return (
    <span className={`yard-price-chip${priceParts.every((part) => part.plain) ? " is-plain" : ""}`}>
      {priceParts.map((part, index) => (
        <span className={`yard-price-part${part.plain ? " is-plain" : ""}`} key={`${part.icon ?? "plain"}-${part.label}-${index}`}>
          {part.icon ? <YardIcon name={part.icon} /> : null}
          <b>{part.label}</b>
        </span>
      ))}
    </span>
  );
}

function YardShopRow({ imageSrc, title, description, priceParts, children }) {
  return (
    <div className="yard-shop-row yard-shop-row-polished">
      <img className="yard-shop-thumb" src={imageSrc} alt="" />
      <div className="yard-shop-copy">
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <div className="yard-shop-purchase">
        <YardPriceChip parts={priceParts} />
        <div className="yard-row-actions">
          {children}
        </div>
      </div>
    </div>
  );
}

function useCompanionYardShell(controls = null) {
  const setActiveGameShell = useGameHub((state) => state.setActiveGameShell);
  useEffect(() => {
    setActiveGameShell(controls ? { id: "room", ...controls } : "room");
    return () => {
      const current = useGameHub.getState().activeGameShell;
      const currentId = typeof current === "string" ? current : current?.id;
      if (currentId === "room") {
        useGameHub.getState().setActiveGameShell(null);
      }
    };
  }, [controls, setActiveGameShell]);
}

function getGoodieActivityScale(goodie = {}) {
  return goodie.size === "large" ? 0.42 : 0.34;
}

function YardActivityPill({ pendingGiftCount, activeVisitorCount, visitorCount, pendingCount, text }) {
  let label = text("yard.activity.calm", "Yard calm");
  let value = "";
  let tone = "calm";
  if (pendingCount > 0) {
    label = text("yard.activity.saving", "Saving yard");
    value = String(pendingCount);
    tone = "saving";
  } else if (pendingGiftCount > 0) {
    label = text("yard.activity.gifts", "Gifts ready");
    value = String(pendingGiftCount);
    tone = "ready";
  } else if (activeVisitorCount > 0) {
    label = text("yard.activity.visitors", "{count} visiting", { count: activeVisitorCount });
    value = String(visitorCount);
    tone = "active";
  }
  return (
    <div className={`yard-activity-pill tone-${tone}`}>
      <YardIcon name={tone === "ready" ? "gifts" : tone === "saving" ? "settings" : "petbook"} />
      <span>{label}</span>
      {value && <b>{value}</b>}
    </div>
  );
}

export default function CompanionYardGame() {
  const snapshot = useGameHub((state) => state.snapshot);
  const performAction = useGameHub((state) => state.performAction);
  const pendingActions = useGameHub((state) => state.pendingActions);
  const setActiveTab = useGameHub((state) => state.setActiveTab);
  const { t } = useAppI18n();
  const yard = snapshot?.yard || {};
  const catalog = snapshot?.meta?.yardCatalog || {};
  const foods = catalog.foods || YARD_FOODS;
  const goodies = catalog.goodies || YARD_GOODIES;
  const visitors = catalog.visitors || YARD_VISITORS;
  const remodels = catalog.remodels || YARD_REMODELS;
  const slots = getUnlockedYardSlots(yard.expansion?.level || 1);
  const [activeScreen, setActiveScreen] = useState(null);
  const [placementDraft, setPlacementDraft] = useState(null);
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [companionName, setCompanionName] = useState(yard.companion?.name || "Buddy");
  const [assetManifest, setAssetManifest] = useState(undefined);
  const [renderNow, setRenderNow] = useState(snapshot?.serverTime || Date.now());
  const [soundEnabled, setSoundEnabled] = useState(() => audioManager.isEnabled());
  const [yardToolsOpen, setYardToolsOpen] = useState(false);
  const stageRef = useRef(null);
  const screenRef = useRef(null);
  const nameInputRef = useRef(null);

  const pendingByKey = useMemo(() => {
    const map = new Map();
    for (const item of pendingActions || []) {
      if (item?.entityKey && item.status !== "failed") map.set(item.entityKey, item);
    }
    return map;
  }, [pendingActions]);
  const hasPending = useCallback((key) => pendingByKey.has(key), [pendingByKey]);

  useEffect(() => {
    let active = true;
    loadCompanionYardManifest().then((manifest) => {
      if (active) setAssetManifest(manifest);
    });
    return () => {
      active = false;
    };
  }, []);

  const assetPath = useCallback((type, id) => (
    resolveCompanionYardAsset(assetManifest, type, id)
  ), [assetManifest]);
  const runtimeArtStyle = useMemo(() => ({
    "--yard-hud-sheet-art": cssImageUrl(resolveCompanionYardHudSheet(assetManifest)),
  }), [assetManifest]);

  useEffect(() => {
    const updateNow = () => setRenderNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, (yard.activeVisitors || []).length ? 900 : 2200);
    return () => window.clearInterval(interval);
  }, [yard.activeVisitors]);

  useEffect(() => {
    setCompanionName(yard.companion?.name || "Buddy");
  }, [yard.companion?.name]);

  useEffect(() => {
    if (!activeScreen) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const target = screenRef.current?.querySelector("button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])");
      target?.focus?.({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeScreen]);

  const slotMap = useMemo(() => new Map(slots.map((slot) => [slot.id, slot])), [slots]);
  const obstacleRects = useMemo(() => (
    getYardObstacleRects(yard.placedGoodies || [], goodies, slotMap)
  ), [yard.placedGoodies, goodies, slotMap]);

  const placedBySlot = useMemo(() => {
    const map = new Map();
    for (const placed of yard.placedGoodies || []) map.set(placed.slotId, placed);
    return map;
  }, [yard.placedGoodies]);

  const visitorsBySlot = useMemo(() => {
    const map = new Map();
    for (const visit of yard.activeVisitors || []) {
      if (!isYardVisitUsingGoodie(visit, renderNow)) continue;
      const visits = map.get(visit.slotId) || [];
      visits.push(visit);
      map.set(visit.slotId, visits);
    }
    return map;
  }, [yard.activeVisitors, renderNow]);

  const activeVisitorItems = useMemo(() => (
    (yard.activeVisitors || [])
      .map((visit) => {
        const placed = placedBySlot.get(visit.slotId);
        const goodie = goodies[placed?.goodieId || visit.goodieId];
        const visitorInfo = visitors[visit.visitorId];
        if (!placed || !goodie || !visitorInfo) return null;
        const activity = getVisitActivity(goodie, visit, placed);
        const motion = getVisitorMotion(visit, getPlacedPosition(placed, slotMap), activity, renderNow, {
          visitorInfo,
          obstacles: obstacleRects.filter((obstacle) => obstacle.slotId !== placed.slotId),
          playzoneId: yard.remodel || "meadow",
          playzoneMargin: 1,
          activityScale: getGoodieActivityScale(goodie),
        });
        const sitsOnGoodie = Array.isArray(goodie.surfaceTypes) && goodie.surfaceTypes.includes("lie");
        const layer = activity.kind === "lie" || sitsOnGoodie ? "front" : activity.layer || visit.activityLayer || "front";
        return {
          visit,
          visitorInfo,
          activity,
          motion,
          layer,
          zIndex: Math.round(motion.y * 10) + (sitsOnGoodie ? 200 : 0),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.motion.y - b.motion.y)
  ), [yard.activeVisitors, yard.remodel, placedBySlot, slotMap, goodies, visitors, renderNow, obstacleRects]);

  const selectedVisit = useMemo(() => (
    (yard.activeVisitors || []).find((visit) => visit.visitId === selectedVisitId) || null
  ), [yard.activeVisitors, selectedVisitId]);

  useEffect(() => {
    if (selectedVisitId && !selectedVisit) setSelectedVisitId(null);
  }, [selectedVisit, selectedVisitId]);

  const visitorCount = Object.values(yard.petbook || {}).reduce((sum, entry) => sum + (entry.visits || 0), 0);
  const activeVisitorCount = yard.activeVisitors?.length || 0;
  const pendingGiftCount = yard.pendingGifts?.length || 0;
  const giftsPending = hasPending("gifts");
  const dailyLetterPending = hasPending("dailyLetter");
  const companionPending = hasPending("companion");
  const expansionPending = hasPending("expansion");
  const selectedRemodel = remodels[yard.remodel] || remodels.meadow || {};
  const staleGoodies = (yard.placedGoodies || []).filter((placed) => placed.condition !== "new");
  const text = useCallback((key, fallback, values) => yardText(t, key, fallback, values), [t]);
  const foodName = useCallback((food) => catalogText(t, "foods", food?.id, "name", food?.name || ""), [t]);
  const foodDesc = useCallback((food) => catalogText(t, "foods", food?.id, "desc", food?.desc || ""), [t]);
  const goodieName = useCallback((goodie) => catalogText(t, "goodies", goodie?.id, "name", goodie?.name || ""), [t]);
  const goodieDesc = useCallback((goodie) => catalogText(t, "goodies", goodie?.id, "desc", goodie?.desc || ""), [t]);
  const remodelName = useCallback((remodel) => catalogText(t, "remodels", remodel?.id, "name", remodel?.name || ""), [t]);
  const remodelDesc = useCallback((remodel) => catalogText(t, "remodels", remodel?.id, "desc", remodel?.desc || ""), [t]);
  const speciesLabel = useCallback((species) => text(`yard.species.${species}`, SPECIES_LABELS[species] || species), [text]);

  const closeScreen = useCallback(() => {
    setActiveScreen(null);
    setYardToolsOpen(false);
  }, []);
  const closePlacement = useCallback(() => {
    setPlacementDraft(null);
  }, []);
  useEscapeDismiss(!!activeScreen || yardToolsOpen, closeScreen);
  useEscapeDismiss(!!placementDraft, closePlacement);
  const yardShellControls = useMemo(() => ({
    activeRun: false,
    openPanel: !!activeScreen || !!placementDraft,
    closePanel: activeScreen ? closeScreen : placementDraft ? closePlacement : null,
  }), [activeScreen, closePlacement, closeScreen, placementDraft]);
  useCompanionYardShell(yardShellControls);

  const openScreen = useCallback((screen) => {
    setPlacementDraft(null);
    setYardToolsOpen(false);
    setActiveScreen(screen);
  }, []);

  const stagePointFromEvent = useCallback((event) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return {
      ...clampYardPointToPlayzone(yard.remodel || "meadow", {
        x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
        y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
      }, { margin: 1 }),
    };
  }, [yard.remodel]);

  const isPlacementSurfaceEvent = useCallback((event) => {
    if (!(event.target instanceof Element)) return false;
    return !event.target.closest("button, input, select, textarea, [role='button'], .yard-hud-layer, .yard-placement-dock, .yard-game-screen");
  }, []);

  const updatePlacementDraft = useCallback((event) => {
    if (!placementDraft) return;
    const point = stagePointFromEvent(event);
    if (!point) return;
    setPlacementDraft((draft) => draft ? { ...draft, ...point } : draft);
  }, [placementDraft, stagePointFromEvent]);

  const startPlaceGoodie = useCallback((goodieId) => {
    const start = clampYardPointToPlayzone(yard.remodel || "meadow", { x: 50, y: 70 }, { margin: 1 });
    setActiveScreen(null);
    setSelectedVisitId(null);
    setPlacementDraft({
      mode: "place",
      goodieId,
      x: start.x,
      y: start.y,
    });
  }, [yard.remodel]);

  const startMoveGoodie = useCallback((placed) => {
    const point = clampYardPointToPlayzone(yard.remodel || "meadow", getPlacedPosition(placed, slotMap), { margin: 1 });
    setActiveScreen(null);
    setSelectedVisitId(null);
    setPlacementDraft({
      mode: "move",
      goodieId: placed.goodieId,
      slotId: placed.slotId,
      x: point.x,
      y: point.y,
    });
  }, [slotMap, yard.remodel]);

  const cancelPlacement = useCallback(() => {
    audioManager.play("tap");
    setPlacementDraft(null);
  }, []);

  const confirmPlacement = useCallback(() => {
    if (!placementDraft) return;
    const payload = {
      goodieId: placementDraft.goodieId,
      x: placementDraft.x,
      y: placementDraft.y,
    };
    const action = placementDraft.mode === "move" ? "yard.moveGoodie" : "yard.placeGoodie";
    if (placementDraft.slotId) payload.slotId = placementDraft.slotId;
    performAction(action, payload).then((result) => {
      if (!result.error) {
        setPlacementDraft(null);
        setActiveScreen("goodies");
      }
    });
  }, [performAction, placementDraft]);

  const captureFirstVisitor = useCallback(() => {
    const visit = selectedVisit || yard.activeVisitors?.[0];
    if (!visit) return;
    const visitorInfo = visitors[visit.visitorId];
    performAction("yard.capturePhoto", {
      visitId: visit.visitId,
      caption: visitorInfo?.name ? text("yard.photoCaption", "{name} visit", { name: visitorInfo.name }) : text("yard.yardVisit", "Yard visit"),
    }).then((result) => {
      if (!result.error) setActiveScreen("album");
    });
  }, [performAction, selectedVisit, text, visitors, yard.activeVisitors]);

  const configureCompanion = useCallback(() => {
    const name = (nameInputRef.current?.value || companionName).trim();
    performAction("yard.configureCompanion", {
      name,
      species: yard.companion?.species || "dog",
      helperAutoRefill: !!yard.helper?.autoRefill,
    });
  }, [companionName, performAction, yard.companion?.species, yard.helper?.autoRefill]);

  const toggleSound = useCallback(async () => {
    setSoundEnabled(await audioManager.toggle());
  }, []);

  const visitorVisualAnchor = (item) => {
    const anchor = item.motion.visualAnchor || item.activity.visualAnchor || null;
    if (anchor) return { x: anchor.x, y: anchor.y };
    if (item.activity.kind === "lie") return { x: 50, y: 62 };
    if (item.motion.stationary) return { x: 50, y: 84 };
    return { x: 50, y: 92 };
  };

  const renderPetLayer = (layer) => (
    <div className={`yard-pet-layer yard-pet-layer-${layer}`}>
      {activeVisitorItems.filter((item) => (layer === "back" ? item.layer === "back" : item.layer !== "back")).map((item) => {
        const visualAnchor = visitorVisualAnchor(item);
        return (
          <button
            type="button"
            key={item.visit.visitId}
            className={`yard-visitor yard-visitor-${item.visitorInfo.rarity} yard-pose-${item.motion.pose} yard-motion-${item.motion.phase}${item.activity.kind === "lie" ? " yard-visitor-lie" : ""}${item.motion.stationary ? " yard-visitor-stationary" : ""}${item.motion.pinned ? " yard-visitor-pinned" : ""}${selectedVisitId === item.visit.visitId ? " selected" : ""}`}
            style={{
              left: `${item.motion.x}%`,
              top: `${item.motion.y}%`,
              zIndex: item.zIndex,
              "--visitor-facing": item.visit.facing === "left" ? -1 : 1,
              "--visitor-offset-x": `${-visualAnchor.x}%`,
              "--visitor-offset-y": `${-visualAnchor.y}%`,
            }}
            data-motion-x={item.motion.x.toFixed(2)}
            data-motion-y={item.motion.y.toFixed(2)}
            data-visual-anchor-x={visualAnchor.x.toFixed(2)}
            data-visual-anchor-y={visualAnchor.y.toFixed(2)}
            data-motion-phase={item.motion.phase}
            data-motion-stationary={item.motion.stationary ? "true" : "false"}
            data-slot-id={item.visit.slotId}
            data-goodie-id={item.visit.goodieId}
            onClick={(event) => {
              event.stopPropagation();
              if (placementDraft) {
                updatePlacementDraft(event);
                return;
              }
              audioManager.play("tap");
              setSelectedVisitId(item.visit.visitId);
            }}
            title={`${item.visitorInfo.name} · ${item.activity.pose}`}
            aria-label={`${item.visitorInfo.name} ${text("yard.visitor", "visitor")}`}
          >
            <img src={assetPath("visitors", visitorAssetId(item.visitorInfo, item.motion.pose))} alt="" />
            <b>{item.visitorInfo.name}</b>
          </button>
        );
      })}
    </div>
  );

  const renderPlacedGoodies = () => (
    <div className="yard-slot-layer">
      {(yard.placedGoodies || []).map((placed) => {
        const goodie = goodies[placed.goodieId];
        const position = getPlacedPosition(placed, slotMap);
        const slotPending = pendingByKey.get(`slot:${placed.slotId}`);
        const slotVisitors = visitorsBySlot.get(placed.slotId) || [];
        const moving = placementDraft?.mode === "move" && placementDraft.slotId === placed.slotId;
        if (!goodie) return null;
        return (
          <button
            type="button"
            key={placed.slotId}
            className={`yard-slot yard-placed-goodie yard-slot-${goodie.size}${slotPending ? " pending" : ""}${moving ? " moving" : ""}`}
            style={goodieStageStyle(position, goodie)}
            data-slot-id={placed.slotId}
            data-goodie-id={placed.goodieId}
            data-goodie-size={goodie.size}
            disabled={!!slotPending}
            onClick={(event) => {
              event.stopPropagation();
              if (placementDraft) {
                updatePlacementDraft(event);
                return;
              }
              if (slotVisitors.length) {
                setSelectedVisitId(slotVisitors[0].visitId);
              } else {
                startMoveGoodie(placed);
              }
            }}
            title={slotPending ? text("yard.syncing", "Syncing") : `${goodieName(goodie)} (${text(`yard.condition.${placed.condition}`, placed.condition)})${slotVisitors.length ? ` · ${text("yard.visits", "{count} visits", { count: slotVisitors.length })}` : ""}`}
            aria-label={`${goodieName(goodie)} ${text("yard.placedGoodie", "placed goodie")}`}
          >
            <img src={assetPath("goodies", placed.condition === "new" ? placed.goodieId : `${placed.goodieId}_${placed.condition}`)} alt="" />
            {goodie.frontAssetKey && (
              <img className="yard-goodie-front" src={assetPath("goodies", goodie.frontAssetKey)} alt="" />
            )}
            {slotPending && <b className="yard-pending-label">{text("yard.syncing", "Syncing")}</b>}
          </button>
        );
      })}
    </div>
  );

  const renderPlacementPreview = () => {
    if (!placementDraft) return null;
    const goodie = goodies[placementDraft.goodieId];
    if (!goodie) return null;
    return (
      <div
        className={`yard-placement-preview yard-slot yard-slot-${goodie.size}`}
        style={goodieStageStyle(placementDraft, goodie)}
      >
        <img src={assetPath("goodies", placementDraft.goodieId)} alt="" />
      </div>
    );
  };

  const renderFoodScreen = () => (
    <div className="yard-screen-grid">
      {(yard.bowls || []).map((bowl) => {
        const food = foods[bowl.foodId];
        return (
          <div className="yard-card" key={bowl.id}>
            <strong>{bowl.id}</strong>
            <div className="yard-bowl-preview">
              <img src={assetPath("foods", food?.id || "empty_bowl")} alt="" />
              <span>{food ? `${foodName(food)} · ${bowl.servings}` : text("yard.empty", "Empty")}</span>
            </div>
            <div className="yard-choice-grid">
              {Object.values(foods).map((candidate) => (
                <button
                  type="button"
                  key={candidate.id}
                  className="yard-choice-tile"
                  disabled={(yard.foodInventory?.[candidate.id] || 0) <= 0 || hasPending(`bowl:${bowl.id}`)}
                  onClick={() => performAction("yard.setFood", { bowlId: bowl.id, foodId: candidate.id })}
                >
                  <img src={assetPath("foods", candidate.id)} alt="" />
                  <span>{foodName(candidate)}<small>x{yard.foodInventory?.[candidate.id] || 0}</small></span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderGoodiesScreen = () => {
    const owned = Object.entries(yard.goodieInventory || {}).filter(([, qty]) => qty > 0);
    const placed = yard.placedGoodies || [];
    return (
      <div className="yard-screen-grid">
        <div className="yard-card">
          <strong>{text("yard.inventory", "Inventory")}</strong>
          {!owned.length && <div className="empty-state">{text("yard.empty", "Empty")}</div>}
          {owned.map(([goodieId, qty]) => {
            const goodie = goodies[goodieId];
            if (!goodie) return null;
            return (
              <div className="yard-shop-row" key={goodieId}>
                <img src={assetPath("goodies", goodieId)} alt="" />
                <span><strong>{goodieName(goodie)}</strong><small>x{qty} · {text(`yard.size.${goodie.size}`, goodie.size)}</small></span>
                <YardActionButton icon="placement" onClick={() => startPlaceGoodie(goodieId)}>{text("yard.place", "Place")}</YardActionButton>
              </div>
            );
          })}
        </div>
        <div className="yard-card">
          <strong>{text("yard.placed", "Placed")}</strong>
          {!placed.length && <div className="empty-state">{text("yard.none", "None")}</div>}
          {placed.map((item) => {
            const goodie = goodies[item.goodieId];
            const busy = (visitorsBySlot.get(item.slotId) || []).length > 0;
            const pending = hasPending(`slot:${item.slotId}`);
            if (!goodie) return null;
            return (
              <div className="yard-shop-row" key={item.slotId}>
                <img src={assetPath("goodies", item.condition === "new" ? item.goodieId : `${item.goodieId}_${item.condition}`)} alt="" />
                <span><strong>{goodieName(goodie)}</strong><small>{text(`yard.condition.${item.condition}`, item.condition)}{busy ? ` · ${text("yard.visitor", "visitor")}` : ""}</small></span>
                <div className="yard-row-actions">
                  <YardActionButton icon="placement" disabled={busy || pending} onClick={() => startMoveGoodie(item)}>{text("yard.move", "Move")}</YardActionButton>
                  {item.condition !== "new" ? (
                    <YardActionButton icon="repair" disabled={busy || pending} onClick={() => performAction("yard.fixGoodie", { slotId: item.slotId })}>{text("yard.fix", "Fix")}</YardActionButton>
                  ) : (
                    <YardActionButton icon="inventory" disabled={busy || pending} onClick={() => performAction("yard.pickupGoodie", { slotId: item.slotId })}>{text("yard.store", "Store")}</YardActionButton>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderShopScreen = () => (
    <div className="yard-screen-grid">
      <div className="yard-card">
        <strong>{text("yard.shop.food", "Food shop")}</strong>
        {Object.values(foods).map((food) => (
          <YardShopRow
            key={food.id}
            imageSrc={assetPath("foods", food.id)}
            title={foodName(food)}
            description={foodDesc(food)}
            priceParts={costParts(food.cost, t)}
          >
            <YardActionButton icon="shop" disabled={hasPending(`shop:food:${food.id}`)} onClick={() => performAction("yard.buyFood", { foodId: food.id, qty: 1 })}>
              {hasPending(`shop:food:${food.id}`) ? text("yard.syncing", "Syncing") : text("yard.buy", "Buy")}
            </YardActionButton>
          </YardShopRow>
        ))}
      </div>
      <div className="yard-card">
        <strong>{text("yard.shop.goodies", "Goodies shop")}</strong>
        {Object.values(goodies).map((goodie) => (
          <YardShopRow
            key={goodie.id}
            imageSrc={assetPath("goodies", goodie.id)}
            title={goodieName(goodie)}
            description={goodieDesc(goodie)}
            priceParts={costParts(goodie.cost, t)}
          >
            <YardActionButton icon="shop" disabled={hasPending(`shop:goodie:${goodie.id}`)} onClick={() => performAction("yard.buyGoodie", { goodieId: goodie.id })}>
              {hasPending(`shop:goodie:${goodie.id}`) ? text("yard.syncing", "Syncing") : text("yard.buy", "Buy")}
            </YardActionButton>
          </YardShopRow>
        ))}
      </div>
      <div className="yard-card">
        <strong>{text("yard.shop.backgrounds", "Backgrounds")}</strong>
        {Object.values(remodels)
          .filter((remodel) => !remodel.starterOwned)
          .sort((a, b) => (a.shopOrder || 999) - (b.shopOrder || 999))
          .map((remodel) => {
            const owned = yard.ownedRemodels?.includes(remodel.id);
            return (
              <YardShopRow
                key={remodel.id}
                imageSrc={assetPath("backgrounds", remodel.id)}
                title={remodelName(remodel)}
                description={remodelDesc(remodel)}
                priceParts={owned ? [{ label: text("yard.owned", "Owned"), plain: true }] : costParts(remodel.cost, t)}
              >
                <YardActionButton icon="remodel" active={owned} disabled={hasPending("remodel")} onClick={() => performAction("yard.setRemodel", { remodelId: remodel.id })}>
                  {hasPending("remodel") ? text("yard.syncing", "Syncing") : owned ? text("yard.set", "Set") : text("yard.buy", "Buy")}
                </YardActionButton>
              </YardShopRow>
            );
          })}
      </div>
    </div>
  );

  const renderPetbookScreen = () => (
    <div className="yard-petbook yard-screen-grid compact">
      {Object.values(visitors).map((visitor) => {
        const entry = yard.petbook?.[visitor.id];
        const seen = !!entry;
        return (
          <div key={visitor.id} className={`yard-petbook-card${seen ? " seen" : ""}`}>
            <img src={assetPath("visitors", visitorPreviewAssetId(visitor))} alt="" />
            <span>
              <strong>{seen ? visitor.name : text("yard.unknownVisitor", "Unknown visitor")}</strong>
              <small>{seen ? `${speciesLabel(visitor.species)} · ${text("yard.visits", "{count} visits", { count: entry.visits })}` : `${text(`yard.rarity.${visitor.rarity}`, visitor.rarity)} ${text("yard.visitor", "visitor")}`}</small>
            </span>
            {yard.mementos?.[visitor.id] && <b>{visitor.memento.name}</b>}
          </div>
        );
      })}
    </div>
  );

  const renderAlbumScreen = () => (
    <div className="yard-album yard-screen-grid compact">
      {activeVisitorCount > 0 && (
        <YardActionButton icon="camera" onClick={captureFirstVisitor}>{text("yard.takePhoto", "Take photo")}</YardActionButton>
      )}
      {!(yard.album?.photos || []).length && <div className="empty-state">{text("yard.noPhotos", "No photos")}</div>}
      {(yard.album?.photos || []).map((photo) => {
        const visitor = visitors[photo.visitorId];
        return (
          <div className="yard-photo-card" key={photo.id}>
            <img src={assetPath("visitors", visitor ? visitorPreviewAssetId(visitor) : photo.visitorId)} alt="" />
            <span><strong>{visitor?.name || photo.visitorId}</strong><small>{photo.pose} · {photo.caption || text("yard.title", "Cozy Yard")}</small></span>
            <YardActionButton icon="favorite" active={yard.album.favoritePhotoId === photo.id} onClick={() => performAction("yard.favoritePhoto", { photoId: photo.id })}>{text("yard.favorite", "Favorite")}</YardActionButton>
          </div>
        );
      })}
    </div>
  );

  const renderGiftsScreen = () => (
    <div className="yard-screen-grid">
      <div className="yard-card">
        <strong>{text("yard.pendingGifts", "Pending gifts")}</strong>
        <div className="yard-metric-grid">
          <span><b>{pendingGiftCount}</b><small>{text("yard.gifts", "Gifts")}</small></span>
          <span><b>{formatCount(yard.currencies?.treats || 0)}</b><small>{text("yard.treats", "Treats")}</small></span>
          <span><b>{formatCount(yard.currencies?.shinyTreats || 0)}</b><small>{text("yard.shiny", "Shiny")}</small></span>
        </div>
        <YardActionButton icon="gifts" disabled={!pendingGiftCount || giftsPending} onClick={() => performAction("yard.collectGifts")}>
          {giftsPending ? text("yard.syncing", "Syncing") : text("yard.collect", "Collect")}
        </YardActionButton>
      </div>
      {(yard.pendingGifts || []).map((gift) => {
        const visitor = visitors[gift.visitorId];
        return (
          <div className="yard-photo-card" key={gift.id}>
            <img src={assetPath("visitors", visitor ? visitorPreviewAssetId(visitor) : gift.visitorId)} alt="" />
            <span><strong>{visitor?.name || gift.visitorId}</strong><small>{text("yard.cost.treats", "{count} treats", { count: gift.treats || 0 })} · {text("yard.cost.shiny", "{count} shiny", { count: gift.shinyTreats || 0 })}</small></span>
            {gift.mementoId && <b>{text("yard.memento", "Memento")}</b>}
          </div>
        );
      })}
    </div>
  );

  const renderRepairScreen = () => (
    <div className="yard-screen-grid">
      {!staleGoodies.length && <div className="empty-state">{text("yard.allFresh", "All fresh")}</div>}
      {staleGoodies.map((placed) => {
        const goodie = goodies[placed.goodieId];
        const busy = (visitorsBySlot.get(placed.slotId) || []).length > 0;
        if (!goodie) return null;
        return (
          <div className="yard-shop-row" key={placed.slotId}>
            <img src={assetPath("goodies", `${placed.goodieId}_${placed.condition}`)} alt="" />
            <span><strong>{goodieName(goodie)}</strong><small>{text(`yard.condition.${placed.condition}`, placed.condition)} · {costLabel(goodie.fixCost, t)}</small></span>
            <YardActionButton icon="repair" disabled={busy || hasPending(`slot:${placed.slotId}`)} onClick={() => performAction("yard.fixGoodie", { slotId: placed.slotId })}>{text("yard.fix", "Fix")}</YardActionButton>
          </div>
        );
      })}
    </div>
  );

  const renderRemodelScreen = () => (
    <div className="yard-screen-grid">
      {Object.values(remodels).filter((remodel) => yard.ownedRemodels?.includes(remodel.id)).map((remodel) => (
        <div className="yard-shop-row" key={remodel.id}>
          <img src={assetPath("backgrounds", remodel.id)} alt="" />
          <span><strong>{remodelName(remodel)}</strong><small>{remodelDesc(remodel)} · {text("yard.owned", "Owned")}</small></span>
          <YardActionButton icon="remodel" active={yard.remodel === remodel.id} disabled={hasPending("remodel")} onClick={() => performAction("yard.setRemodel", { remodelId: remodel.id })}>
            {hasPending("remodel") ? text("yard.syncing", "Syncing") : text("yard.set", "Set")}
          </YardActionButton>
        </div>
      ))}
    </div>
  );

  const renderExpansionScreen = () => (
    <div className="yard-screen-grid">
      <div className="yard-card">
        <strong>{yard.expansion?.level >= 2 ? text("yard.wideYard", "Wide yard") : text("yard.smallYard", "Small yard")}</strong>
        <div className="yard-metric-grid">
          <span><b>{yard.expansion?.level || 1}</b><small>{text("yard.level", "Level")}</small></span>
          <span><b>{yard.bowls?.length || 0}</b><small>{text("yard.bowls", "Bowls")}</small></span>
          <span><b>{yard.placedGoodies?.length || 0}</b><small>{text("yard.placed", "Placed")}</small></span>
        </div>
        <YardActionButton icon="expansion" disabled={yard.expansion?.level >= 2 || expansionPending} onClick={() => performAction("yard.buyExpansion")}>
          {expansionPending ? text("yard.syncing", "Syncing") : yard.expansion?.level >= 2 ? text("yard.unlocked", "Unlocked") : text("yard.buyWideYard", "Buy wide yard")}
        </YardActionButton>
      </div>
    </div>
  );

  const renderDailyScreen = () => (
    <div className="yard-screen-grid">
      <div className="yard-card">
        <strong>{text("yard.dailyLetter", "Daily letter")}</strong>
        <div className="yard-metric-grid">
          <span><b>{yard.dailyLetter?.stamps || 0}</b><small>{text("yard.stamps", "Stamps")}</small></span>
          <span><b>{yard.dailyLetter?.lastClaimedDate || "-"}</b><small>{text("yard.last", "Last")}</small></span>
        </div>
        <YardActionButton icon="daily" disabled={dailyLetterPending} onClick={() => performAction("yard.claimDailyLetter")}>
          {dailyLetterPending ? text("yard.syncing", "Syncing") : text("yard.claim", "Claim")}
        </YardActionButton>
      </div>
    </div>
  );

  const renderCompanionScreen = () => (
    <div className="yard-screen-grid">
      <div className="yard-card">
        <strong>{text("yard.companion", "Companion")}</strong>
        <div className="join-row">
          <input ref={nameInputRef} value={companionName} maxLength={16} onChange={(event) => setCompanionName(event.target.value)} />
          <YardActionButton icon="confirm" onClick={configureCompanion}>{companionPending ? text("yard.syncing", "Syncing") : text("yard.save", "Save")}</YardActionButton>
        </div>
        <div className="yard-species-grid">
          {Object.keys(SPECIES_LABELS).map((species) => (
            <button
              type="button"
              key={species}
              className={yard.companion?.species === species ? "active" : ""}
              onClick={() => performAction("yard.configureCompanion", { name: companionName, species })}
            >
              <img src={assetPath("companions", species)} alt="" />
              <span>{speciesLabel(species)}</span>
            </button>
          ))}
        </div>
        <YardActionButton
          icon="companion"
          disabled={!yard.helper?.unlocked}
          active={yard.helper?.autoRefill}
          onClick={() => performAction("yard.configureCompanion", {
            name: companionName,
            species: yard.companion?.species || "dog",
            helperAutoRefill: !yard.helper?.autoRefill,
          })}
        >
          {text("yard.helperRefill", "Helper refill")}
        </YardActionButton>
      </div>
    </div>
  );

  const renderSettingsScreen = () => (
    <div className="yard-screen-grid">
      <div className="yard-card">
        <strong>{text("yard.game", "Game")}</strong>
        <div className="yard-row">
          <span>{text("yard.sound", "Sound")}</span>
          <YardActionButton icon={soundEnabled ? "sound-on" : "sound-off"} active={soundEnabled} onClick={toggleSound}>
            {soundEnabled ? text("yard.on", "On") : text("yard.off", "Off")}
          </YardActionButton>
        </div>
        <div className="yard-row">
          <span>{text("yard.visitors", "Visitors")}</span>
          <b>{activeVisitorCount}</b>
        </div>
        <YardActionButton icon="back" danger onClick={() => setActiveTab("garden")}>{text("yard.backToGarden", "Back to garden")}</YardActionButton>
      </div>
    </div>
  );

  const renderScreenContent = () => {
    if (activeScreen === "food") return renderFoodScreen();
    if (activeScreen === "goodies") return renderGoodiesScreen();
    if (activeScreen === "shop") return renderShopScreen();
    if (activeScreen === "petbook") return renderPetbookScreen();
    if (activeScreen === "album") return renderAlbumScreen();
    if (activeScreen === "gifts") return renderGiftsScreen();
    if (activeScreen === "repair") return renderRepairScreen();
    if (activeScreen === "remodel") return renderRemodelScreen();
    if (activeScreen === "expansion") return renderExpansionScreen();
    if (activeScreen === "daily") return renderDailyScreen();
    if (activeScreen === "companion") return renderCompanionScreen();
    if (activeScreen === "settings") return renderSettingsScreen();
    return null;
  };

  const screenMeta = activeScreen ? SCREEN_META[activeScreen] : null;
  const draftGoodie = placementDraft ? goodies[placementDraft.goodieId] : null;

  return (
    <div className="room-layout companion-yard-layout game-shell shell-skin-meditation shell-playing" style={runtimeArtStyle}>
      <section
        ref={stageRef}
        className={`room-stage companion-yard-stage ${selectedRemodel.themeClass || "yard-remodel-meadow"}${placementDraft ? " yard-placement-active" : ""}`}
        onPointerDown={(event) => {
          if ((activeScreen || yardToolsOpen) && isPlacementSurfaceEvent(event)) {
            closeScreen();
            return;
          }
          if (!placementDraft || !isPlacementSurfaceEvent(event)) return;
          updatePlacementDraft(event);
        }}
        onPointerMove={(event) => {
          if (!placementDraft || event.buttons !== 1 || !isPlacementSurfaceEvent(event)) return;
          updatePlacementDraft(event);
        }}
        onDragStart={(event) => event.preventDefault()}
      >
        <img className="yard-background-art" src={assetPath("backgrounds", yard.remodel || "meadow")} alt="" />
        <div className="yard-bowls">
          {(yard.bowls || []).map((bowl) => {
            const food = foods[bowl.foodId];
            const bowlPending = pendingByKey.get(`bowl:${bowl.id}`);
            const pendingFood = bowlPending?.payload?.foodId ? foods[bowlPending.payload.foodId] : null;
            return (
              <button
                key={bowl.id}
                className={`yard-bowl${food || pendingFood ? " filled" : ""}${bowlPending ? " pending" : ""}`}
                disabled={!!bowlPending}
                onClick={() => openScreen("food")}
                title={bowlPending ? text("yard.syncingFood", "Syncing food") : food ? foodName(food) : text("yard.setFood", "Set food")}
              >
                <img src={assetPath("foods", pendingFood?.id || food?.id || "empty_bowl")} alt="" />
                <span>{bowlPending ? text("yard.syncing", "Syncing") : food ? `${foodName(food)} (${bowl.servings})` : text("yard.empty", "Empty")}</span>
              </button>
            );
          })}
        </div>
        {renderPetLayer("back")}
        {renderPlacedGoodies()}
        {placementDraft && <div className="yard-playzone-guide" aria-hidden="true" />}
        {renderPlacementPreview()}
        {renderPetLayer("front")}
        <div className="yard-companion" onClick={() => openScreen("companion")} role="button" tabIndex={0}>
          <img src={assetPath("companions", yard.companion?.species || "dog")} alt="" />
          <span>{yard.companion?.name || "Buddy"}</span>
        </div>

        <div className="yard-hud-layer">
          <div className="yard-currency-stack">
            <YardCurrencyChip icon="treats" label={text("yard.treats", "Treats")} value={formatCount(yard.currencies?.treats || 0)} />
            <YardCurrencyChip icon="shiny" label={text("yard.shiny", "Shiny")} value={formatCount(yard.currencies?.shinyTreats || 0)} />
          </div>
          <div className="yard-corner-actions">
            <YardIconButton compact icon="settings" label={text("yard.screen.settings", "Settings")} active={activeScreen === "settings"} onClick={() => openScreen("settings")} />
            <YardIconButton compact icon={soundEnabled ? "sound-on" : "sound-off"} label={soundEnabled ? text("yard.soundOn", "Sound on") : text("yard.soundOff", "Sound off")} active={soundEnabled} onClick={toggleSound} />
            <YardIconButton compact icon="shop" label={text("yard.tools", "Tools")} active={yardToolsOpen} onClick={() => setYardToolsOpen((value) => !value)} />
          </div>
          {yardToolsOpen && (
            <div className="yard-side-tools open">
              <YardIconButton compact icon="camera" label={text("yard.camera", "Camera")} disabled={!activeVisitorCount} onClick={captureFirstVisitor} />
              <YardIconButton compact icon="daily" label={text("yard.screen.daily", "Daily letter")} active={activeScreen === "daily"} onClick={() => openScreen("daily")} />
              <YardIconButton compact icon="repair" label={text("yard.screen.repair", "Repair goodies")} badge={staleGoodies.length || null} active={activeScreen === "repair"} onClick={() => openScreen("repair")} />
              <YardIconButton compact icon="remodel" label={text("yard.screen.remodel", "Remodel yard")} active={activeScreen === "remodel"} onClick={() => openScreen("remodel")} />
              <YardIconButton compact icon="expansion" label={text("yard.screen.expansion", "Expansion")} active={activeScreen === "expansion"} onClick={() => openScreen("expansion")} />
              <YardIconButton compact icon="companion" label={text("yard.screen.companion", "Companion helper")} active={activeScreen === "companion"} onClick={() => openScreen("companion")} />
            </div>
          )}
          <YardActivityPill
            pendingGiftCount={pendingGiftCount}
            activeVisitorCount={activeVisitorCount}
            visitorCount={visitorCount}
            pendingCount={pendingByKey.size}
            text={text}
          />
          <div className="yard-bottom-dock">
            <YardIconButton icon="food" label={text("yard.nav.food", "Food")} active={activeScreen === "food"} onClick={() => openScreen("food")} />
            <YardIconButton icon="goodies" label={text("yard.nav.goodies", "Goodies")} active={activeScreen === "goodies"} onClick={() => openScreen("goodies")} />
            <YardIconButton icon="shop" label={text("yard.nav.shop", "Shop")} active={activeScreen === "shop"} onClick={() => openScreen("shop")} />
            <YardIconButton icon="petbook" label={text("yard.nav.petbook", "Petbook")} active={activeScreen === "petbook"} onClick={() => openScreen("petbook")} />
            <YardIconButton icon="album" label={text("yard.nav.album", "Album")} active={activeScreen === "album"} onClick={() => openScreen("album")} />
            <YardIconButton icon="gifts" label={text("yard.nav.gifts", "Gifts")} badge={pendingGiftCount || null} active={activeScreen === "gifts"} onClick={() => openScreen("gifts")} />
          </div>
        </div>

        {placementDraft && (
          <div className="yard-placement-dock">
            <div>
              <YardIcon name="placement" />
              <strong>{draftGoodie ? goodieName(draftGoodie) : text("yard.goodie", "Goodie")}</strong>
              <span>{Math.round(placementDraft.x)} · {Math.round(placementDraft.y)}</span>
            </div>
            <YardIconButton compact icon="close" label={text("yard.cancelPlacement", "Cancel placement")} onClick={cancelPlacement} />
            <YardIconButton compact icon="confirm" label={text("yard.confirmPlacement", "Confirm placement")} onClick={confirmPlacement} />
          </div>
        )}

        {activeScreen && screenMeta && (
          <div
            ref={screenRef}
            className="yard-game-screen"
            data-yard-screen={activeScreen}
            role="dialog"
            aria-modal="true"
            aria-label={text(screenMeta.titleKey, screenMeta.fallback)}
          >
            <div className="yard-screen-header">
              <div>
                <YardIcon name={screenMeta.icon} />
                <strong>{text(screenMeta.titleKey, screenMeta.fallback)}</strong>
              </div>
              <YardIconButton compact icon="close" label={text("yard.close", "Close")} onClick={closeScreen} />
            </div>
            <div className="yard-screen-content">
              {renderScreenContent()}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
