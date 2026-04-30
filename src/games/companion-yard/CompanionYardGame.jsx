import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  YARD_FOODS,
  YARD_GOODIES,
  YARD_REMODELS,
  YARD_VISITORS,
  getYardGoodieActivities,
  getUnlockedYardSlots,
} from "../../../game-logic.js";
import { useGameHub } from "../../game-state/useGameHub.js";
import { audioManager } from "../../services/audioManager.js";
import { loadCompanionYardManifest, resolveCompanionYardAsset } from "./assets.js";

const SPECIES_LABELS = {
  cat: "Cat",
  dog: "Dog",
  bunny: "Bunny",
  fox: "Fox",
  hamster: "Hamster",
  turtle: "Turtle",
};

const SCREEN_META = {
  food: { title: "Food bowls", icon: "food" },
  goodies: { title: "Goodies", icon: "goodies" },
  shop: { title: "Shop", icon: "shop" },
  petbook: { title: "Petbook", icon: "petbook" },
  album: { title: "Photo album", icon: "album" },
  gifts: { title: "Gift collection", icon: "gifts" },
  repair: { title: "Repair goodies", icon: "repair" },
  remodel: { title: "Remodel yard", icon: "remodel" },
  expansion: { title: "Expansion", icon: "expansion" },
  daily: { title: "Daily letter", icon: "daily" },
  companion: { title: "Companion helper", icon: "companion" },
  settings: { title: "Settings", icon: "settings" },
};

function formatCount(value) {
  if (value == null) return "0";
  if (value >= 10000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function costLabel(cost = {}) {
  const parts = [];
  if (cost.treats) parts.push(`${cost.treats} treats`);
  if (cost.shinyTreats) parts.push(`${cost.shinyTreats} shiny`);
  return parts.length ? parts.join(" + ") : "Free";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function mix(start, end, progress) {
  return start + (end - start) * progress;
}

function seedNumber(seed = "") {
  let hash = 2166136261;
  const text = String(seed);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getEntryPoint(edge, anchorX, anchorY) {
  if (edge === "right") return { x: 108, y: anchorY };
  if (edge === "top") return { x: anchorX, y: -8 };
  if (edge === "bottom") return { x: anchorX, y: 108 };
  return { x: -8, y: anchorY };
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

function getVisitorMotion(visit, anchor, activity, renderNow) {
  const arrivedAt = Number(visit.arrivedAt) || renderNow;
  const leavesAt = Math.max(arrivedAt + 60_000, Number(visit.leavesAt) || arrivedAt + 60_000);
  const progress = clamp((renderNow - arrivedAt) / (leavesAt - arrivedAt), 0, 1);
  const anchorX = clamp((anchor?.x || 50) + (activity?.x || 0), 4, 96);
  const anchorY = clamp((anchor?.y || 70) + (activity?.y || 0), 6, 96);
  const edgePoint = getEntryPoint(visit.entryEdge, anchorX, anchorY);
  const exitPoint = getEntryPoint(visit.exitEdge || visit.entryEdge, anchorX, anchorY);
  const seed = seedNumber(visit.motionSeed || visit.visitId);
  const roam = Number(activity?.roam || 0);

  if (progress < 0.18) {
    const local = progress / 0.18;
    return {
      x: mix(edgePoint.x, anchorX, local),
      y: mix(edgePoint.y, anchorY, local),
      pose: "walk",
      phase: "entering",
    };
  }

  if (progress > 0.84) {
    const local = (progress - 0.84) / 0.16;
    return {
      x: mix(anchorX, exitPoint.x, local),
      y: mix(anchorY, exitPoint.y, local),
      pose: "walk",
      phase: "leaving",
    };
  }

  const rhythm = renderNow / (2300 + (seed % 900)) + seed;
  const roamX = Math.sin(rhythm) * roam;
  const roamY = Math.cos(rhythm * 0.7) * Math.min(3, roam);
  return {
    x: clamp(anchorX + roamX, 3, 97),
    y: clamp(anchorY + roamY, 5, 98),
    pose: visit.pose || activity?.pose || "sit",
    phase: "active",
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

function useCompanionYardShell() {
  const setActiveGameShell = useGameHub((state) => state.setActiveGameShell);
  useEffect(() => {
    setActiveGameShell("room");
    return () => {
      if (useGameHub.getState().activeGameShell === "room") {
        useGameHub.getState().setActiveGameShell(null);
      }
    };
  }, [setActiveGameShell]);
}

export default function CompanionYardGame() {
  const snapshot = useGameHub((state) => state.snapshot);
  const performAction = useGameHub((state) => state.performAction);
  const pendingActions = useGameHub((state) => state.pendingActions);
  const setActiveTab = useGameHub((state) => state.setActiveTab);
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
  const [assetManifest, setAssetManifest] = useState(null);
  const [renderNow, setRenderNow] = useState(snapshot?.serverTime || Date.now());
  const [soundEnabled, setSoundEnabled] = useState(() => audioManager.isEnabled());
  const stageRef = useRef(null);
  const screenRef = useRef(null);
  const nameInputRef = useRef(null);

  useCompanionYardShell();

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

  const placedBySlot = useMemo(() => {
    const map = new Map();
    for (const placed of yard.placedGoodies || []) map.set(placed.slotId, placed);
    return map;
  }, [yard.placedGoodies]);

  const visitorsBySlot = useMemo(() => {
    const map = new Map();
    for (const visit of yard.activeVisitors || []) {
      const visits = map.get(visit.slotId) || [];
      visits.push(visit);
      map.set(visit.slotId, visits);
    }
    return map;
  }, [yard.activeVisitors]);

  const activeVisitorItems = useMemo(() => (
    (yard.activeVisitors || [])
      .map((visit) => {
        const placed = placedBySlot.get(visit.slotId);
        const goodie = goodies[placed?.goodieId || visit.goodieId];
        const visitorInfo = visitors[visit.visitorId];
        if (!placed || !goodie || !visitorInfo) return null;
        const activity = getVisitActivity(goodie, visit, placed);
        const motion = getVisitorMotion(visit, getPlacedPosition(placed, slotMap), activity, renderNow);
        return {
          visit,
          visitorInfo,
          activity,
          motion,
          layer: activity.layer || visit.activityLayer || "front",
          zIndex: Math.round(motion.y * 10),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.motion.y - b.motion.y)
  ), [yard.activeVisitors, placedBySlot, slotMap, goodies, visitors, renderNow]);

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

  const closeScreen = useCallback(() => setActiveScreen(null), []);

  const openScreen = useCallback((screen) => {
    setPlacementDraft(null);
    setActiveScreen(screen);
  }, []);

  const stagePointFromEvent = useCallback((event) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 8, 92),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 12, 90),
    };
  }, []);

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
    setActiveScreen(null);
    setSelectedVisitId(null);
    setPlacementDraft({
      mode: "place",
      goodieId,
      x: 50,
      y: 70,
    });
  }, []);

  const startMoveGoodie = useCallback((placed) => {
    const point = getPlacedPosition(placed, slotMap);
    setActiveScreen(null);
    setSelectedVisitId(null);
    setPlacementDraft({
      mode: "move",
      goodieId: placed.goodieId,
      slotId: placed.slotId,
      x: point.x,
      y: point.y,
    });
  }, [slotMap]);

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
      caption: visitorInfo?.name ? `${visitorInfo.name} visit` : "Yard visit",
    }).then((result) => {
      if (!result.error) setActiveScreen("album");
    });
  }, [performAction, selectedVisit, visitors, yard.activeVisitors]);

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

  const renderPetLayer = (layer) => (
    <div className={`yard-pet-layer yard-pet-layer-${layer}`}>
      {activeVisitorItems.filter((item) => (layer === "back" ? item.layer === "back" : item.layer !== "back")).map((item) => (
        <button
          type="button"
          key={item.visit.visitId}
          className={`yard-visitor yard-visitor-${item.visitorInfo.rarity} yard-pose-${item.motion.pose} yard-motion-${item.motion.phase}${selectedVisitId === item.visit.visitId ? " selected" : ""}`}
          style={{
            left: `${item.motion.x}%`,
            top: `${item.motion.y}%`,
            zIndex: item.zIndex,
            "--visitor-facing": item.visit.facing === "left" ? -1 : 1,
          }}
          onClick={(event) => {
            event.stopPropagation();
            audioManager.play("tap");
            setSelectedVisitId(item.visit.visitId);
          }}
          title={`${item.visitorInfo.name} · ${item.activity.pose}`}
          aria-label={`${item.visitorInfo.name} visitor`}
        >
          <img src={assetPath("visitors", visitorAssetId(item.visitorInfo, item.motion.pose))} alt="" />
          <b>{item.visitorInfo.name}</b>
        </button>
      ))}
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
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            disabled={!!slotPending}
            onClick={(event) => {
              event.stopPropagation();
              if (slotVisitors.length) {
                setSelectedVisitId(slotVisitors[0].visitId);
              } else {
                setActiveScreen("goodies");
              }
            }}
            title={slotPending ? "Syncing" : `${goodie.name} (${placed.condition})${slotVisitors.length ? ` · ${slotVisitors.length} visiting` : ""}`}
            aria-label={`${goodie.name} placed goodie`}
          >
            <img src={assetPath("goodies", placed.condition === "new" ? placed.goodieId : `${placed.goodieId}_${placed.condition}`)} alt="" />
            {goodie.frontAssetKey && (
              <img className="yard-goodie-front" src={assetPath("goodies", goodie.frontAssetKey)} alt="" />
            )}
            {slotPending && <b className="yard-pending-label">Syncing</b>}
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
        style={{ left: `${placementDraft.x}%`, top: `${placementDraft.y}%` }}
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
              <span>{food ? `${food.name} · ${bowl.servings}` : "Empty"}</span>
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
                  <span>{candidate.name}<small>x{yard.foodInventory?.[candidate.id] || 0}</small></span>
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
          <strong>Inventory</strong>
          {!owned.length && <div className="empty-state">Empty</div>}
          {owned.map(([goodieId, qty]) => {
            const goodie = goodies[goodieId];
            if (!goodie) return null;
            return (
              <div className="yard-shop-row" key={goodieId}>
                <img src={assetPath("goodies", goodieId)} alt="" />
                <span><strong>{goodie.name}</strong><small>x{qty} · {goodie.size}</small></span>
                <YardActionButton icon="placement" onClick={() => startPlaceGoodie(goodieId)}>Place</YardActionButton>
              </div>
            );
          })}
        </div>
        <div className="yard-card">
          <strong>Placed</strong>
          {!placed.length && <div className="empty-state">None</div>}
          {placed.map((item) => {
            const goodie = goodies[item.goodieId];
            const busy = (visitorsBySlot.get(item.slotId) || []).length > 0;
            const pending = hasPending(`slot:${item.slotId}`);
            if (!goodie) return null;
            return (
              <div className="yard-shop-row" key={item.slotId}>
                <img src={assetPath("goodies", item.condition === "new" ? item.goodieId : `${item.goodieId}_${item.condition}`)} alt="" />
                <span><strong>{goodie.name}</strong><small>{item.condition}{busy ? " · visitor" : ""}</small></span>
                <div className="yard-row-actions">
                  <YardActionButton icon="placement" disabled={busy || pending} onClick={() => startMoveGoodie(item)}>Move</YardActionButton>
                  {item.condition !== "new" ? (
                    <YardActionButton icon="repair" disabled={busy || pending} onClick={() => performAction("yard.fixGoodie", { slotId: item.slotId })}>Fix</YardActionButton>
                  ) : (
                    <YardActionButton icon="inventory" disabled={busy || pending} onClick={() => performAction("yard.pickupGoodie", { slotId: item.slotId })}>Store</YardActionButton>
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
        <strong>Food shop</strong>
        {Object.values(foods).map((food) => (
          <div className="yard-shop-row" key={food.id}>
            <img src={assetPath("foods", food.id)} alt="" />
            <span><strong>{food.name}</strong><small>{food.desc} · {costLabel(food.cost)}</small></span>
            <YardActionButton icon="shop" disabled={hasPending(`shop:food:${food.id}`)} onClick={() => performAction("yard.buyFood", { foodId: food.id, qty: 1 })}>
              {hasPending(`shop:food:${food.id}`) ? "Syncing" : "Buy"}
            </YardActionButton>
          </div>
        ))}
      </div>
      <div className="yard-card">
        <strong>Goodies shop</strong>
        {Object.values(goodies).map((goodie) => (
          <div className="yard-shop-row" key={goodie.id}>
            <img src={assetPath("goodies", goodie.id)} alt="" />
            <span><strong>{goodie.name}</strong><small>{goodie.desc} · {costLabel(goodie.cost)}</small></span>
            <YardActionButton icon="shop" disabled={hasPending(`shop:goodie:${goodie.id}`)} onClick={() => performAction("yard.buyGoodie", { goodieId: goodie.id })}>
              {hasPending(`shop:goodie:${goodie.id}`) ? "Syncing" : "Buy"}
            </YardActionButton>
          </div>
        ))}
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
              <strong>{seen ? visitor.name : "Unknown visitor"}</strong>
              <small>{seen ? `${SPECIES_LABELS[visitor.species] || visitor.species} · ${entry.visits} visits` : `${visitor.rarity} visitor`}</small>
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
        <YardActionButton icon="camera" onClick={captureFirstVisitor}>Take photo</YardActionButton>
      )}
      {!(yard.album?.photos || []).length && <div className="empty-state">No photos</div>}
      {(yard.album?.photos || []).map((photo) => {
        const visitor = visitors[photo.visitorId];
        return (
          <div className="yard-photo-card" key={photo.id}>
            <img src={assetPath("visitors", visitor ? visitorPreviewAssetId(visitor) : photo.visitorId)} alt="" />
            <span><strong>{visitor?.name || photo.visitorId}</strong><small>{photo.pose} · {photo.caption || "Cozy Yard"}</small></span>
            <YardActionButton icon="favorite" active={yard.album.favoritePhotoId === photo.id} onClick={() => performAction("yard.favoritePhoto", { photoId: photo.id })}>Favorite</YardActionButton>
          </div>
        );
      })}
    </div>
  );

  const renderGiftsScreen = () => (
    <div className="yard-screen-grid">
      <div className="yard-card">
        <strong>Pending gifts</strong>
        <div className="yard-metric-grid">
          <span><b>{pendingGiftCount}</b><small>Gifts</small></span>
          <span><b>{formatCount(yard.currencies?.treats || 0)}</b><small>Treats</small></span>
          <span><b>{formatCount(yard.currencies?.shinyTreats || 0)}</b><small>Shiny</small></span>
        </div>
        <YardActionButton icon="gifts" disabled={!pendingGiftCount || giftsPending} onClick={() => performAction("yard.collectGifts")}>
          {giftsPending ? "Syncing" : "Collect"}
        </YardActionButton>
      </div>
      {(yard.pendingGifts || []).map((gift) => {
        const visitor = visitors[gift.visitorId];
        return (
          <div className="yard-photo-card" key={gift.id}>
            <img src={assetPath("visitors", visitor ? visitorPreviewAssetId(visitor) : gift.visitorId)} alt="" />
            <span><strong>{visitor?.name || gift.visitorId}</strong><small>{gift.treats || 0} treats · {gift.shinyTreats || 0} shiny</small></span>
            {gift.mementoId && <b>Memento</b>}
          </div>
        );
      })}
    </div>
  );

  const renderRepairScreen = () => (
    <div className="yard-screen-grid">
      {!staleGoodies.length && <div className="empty-state">All fresh</div>}
      {staleGoodies.map((placed) => {
        const goodie = goodies[placed.goodieId];
        const busy = (visitorsBySlot.get(placed.slotId) || []).length > 0;
        if (!goodie) return null;
        return (
          <div className="yard-shop-row" key={placed.slotId}>
            <img src={assetPath("goodies", `${placed.goodieId}_${placed.condition}`)} alt="" />
            <span><strong>{goodie.name}</strong><small>{placed.condition} · {costLabel(goodie.fixCost)}</small></span>
            <YardActionButton icon="repair" disabled={busy || hasPending(`slot:${placed.slotId}`)} onClick={() => performAction("yard.fixGoodie", { slotId: placed.slotId })}>Fix</YardActionButton>
          </div>
        );
      })}
    </div>
  );

  const renderRemodelScreen = () => (
    <div className="yard-screen-grid">
      {Object.values(remodels).map((remodel) => (
        <div className="yard-shop-row" key={remodel.id}>
          <img src={assetPath("backgrounds", remodel.id)} alt="" />
          <span><strong>{remodel.name}</strong><small>{remodel.desc} · {yard.ownedRemodels?.includes(remodel.id) ? "Owned" : costLabel(remodel.cost)}</small></span>
          <YardActionButton icon="remodel" active={yard.remodel === remodel.id} disabled={hasPending("remodel")} onClick={() => performAction("yard.setRemodel", { remodelId: remodel.id })}>
            {hasPending("remodel") ? "Syncing" : "Set"}
          </YardActionButton>
        </div>
      ))}
    </div>
  );

  const renderExpansionScreen = () => (
    <div className="yard-screen-grid">
      <div className="yard-card">
        <strong>{yard.expansion?.level >= 2 ? "Wide yard" : "Small yard"}</strong>
        <div className="yard-metric-grid">
          <span><b>{yard.expansion?.level || 1}</b><small>Level</small></span>
          <span><b>{yard.bowls?.length || 0}</b><small>Bowls</small></span>
          <span><b>{yard.placedGoodies?.length || 0}</b><small>Placed</small></span>
        </div>
        <YardActionButton icon="expansion" disabled={yard.expansion?.level >= 2 || expansionPending} onClick={() => performAction("yard.buyExpansion")}>
          {expansionPending ? "Syncing" : yard.expansion?.level >= 2 ? "Unlocked" : "Buy wide yard"}
        </YardActionButton>
      </div>
    </div>
  );

  const renderDailyScreen = () => (
    <div className="yard-screen-grid">
      <div className="yard-card">
        <strong>Daily letter</strong>
        <div className="yard-metric-grid">
          <span><b>{yard.dailyLetter?.stamps || 0}</b><small>Stamps</small></span>
          <span><b>{yard.dailyLetter?.lastClaimedDate || "-"}</b><small>Last</small></span>
        </div>
        <YardActionButton icon="daily" disabled={dailyLetterPending} onClick={() => performAction("yard.claimDailyLetter")}>
          {dailyLetterPending ? "Syncing" : "Claim"}
        </YardActionButton>
      </div>
    </div>
  );

  const renderCompanionScreen = () => (
    <div className="yard-screen-grid">
      <div className="yard-card">
        <strong>Companion</strong>
        <div className="join-row">
          <input ref={nameInputRef} value={companionName} maxLength={16} onChange={(event) => setCompanionName(event.target.value)} />
          <YardActionButton icon="confirm" onClick={configureCompanion}>{companionPending ? "Syncing" : "Save"}</YardActionButton>
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
              <span>{SPECIES_LABELS[species]}</span>
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
          Helper refill
        </YardActionButton>
      </div>
    </div>
  );

  const renderSettingsScreen = () => (
    <div className="yard-screen-grid">
      <div className="yard-card">
        <strong>Game</strong>
        <div className="yard-row">
          <span>Sound</span>
          <YardActionButton icon={soundEnabled ? "sound-on" : "sound-off"} active={soundEnabled} onClick={toggleSound}>
            {soundEnabled ? "On" : "Off"}
          </YardActionButton>
        </div>
        <div className="yard-row">
          <span>Visitors</span>
          <b>{activeVisitorCount}</b>
        </div>
        <YardActionButton icon="back" danger onClick={() => setActiveTab("garden")}>Back to garden</YardActionButton>
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
    <div className="room-layout companion-yard-layout game-shell shell-skin-meditation shell-playing">
      <section
        ref={stageRef}
        className={`room-stage companion-yard-stage ${selectedRemodel.themeClass || "yard-remodel-meadow"}${placementDraft ? " yard-placement-active" : ""}`}
        onPointerDown={(event) => {
          if (!placementDraft || !isPlacementSurfaceEvent(event)) return;
          updatePlacementDraft(event);
        }}
        onPointerMove={(event) => {
          if (!placementDraft || event.buttons !== 1 || !isPlacementSurfaceEvent(event)) return;
          updatePlacementDraft(event);
        }}
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
                title={bowlPending ? "Syncing food" : food ? food.name : "Set food"}
              >
                <img src={assetPath("foods", pendingFood?.id || food?.id || "empty_bowl")} alt="" />
                <span>{bowlPending ? "Syncing" : food ? `${food.name} (${bowl.servings})` : "Empty"}</span>
              </button>
            );
          })}
        </div>
        {renderPetLayer("back")}
        {renderPlacedGoodies()}
        {renderPlacementPreview()}
        {renderPetLayer("front")}
        <div className="yard-companion" onClick={() => openScreen("companion")} role="button" tabIndex={0}>
          <img src={assetPath("companions", yard.companion?.species || "dog")} alt="" />
          <span>{yard.companion?.name || "Buddy"}</span>
        </div>

        <div className="yard-hud-layer">
          <div className="yard-currency-stack">
            <YardCurrencyChip icon="treats" label="Treats" value={formatCount(yard.currencies?.treats || 0)} />
            <YardCurrencyChip icon="shiny" label="Shiny" value={formatCount(yard.currencies?.shinyTreats || 0)} />
          </div>
          <div className="yard-corner-actions">
            <YardIconButton compact icon="settings" label="Settings" active={activeScreen === "settings"} onClick={() => openScreen("settings")} />
            <YardIconButton compact icon={soundEnabled ? "sound-on" : "sound-off"} label={soundEnabled ? "Sound on" : "Sound off"} active={soundEnabled} onClick={toggleSound} />
          </div>
          <div className="yard-side-tools">
            <YardIconButton compact icon="camera" label="Camera" disabled={!activeVisitorCount} onClick={captureFirstVisitor} />
            <YardIconButton compact icon="daily" label="Daily letter" active={activeScreen === "daily"} onClick={() => openScreen("daily")} />
            <YardIconButton compact icon="repair" label="Repair goodies" badge={staleGoodies.length || null} active={activeScreen === "repair"} onClick={() => openScreen("repair")} />
            <YardIconButton compact icon="remodel" label="Remodel yard" active={activeScreen === "remodel"} onClick={() => openScreen("remodel")} />
            <YardIconButton compact icon="expansion" label="Expansion" active={activeScreen === "expansion"} onClick={() => openScreen("expansion")} />
            <YardIconButton compact icon="companion" label="Companion helper" active={activeScreen === "companion"} onClick={() => openScreen("companion")} />
          </div>
          <div className="yard-status-card">
            <strong>{selectedVisit ? visitors[selectedVisit.visitorId]?.name || "Visitor" : "Cozy Yard"}</strong>
            <span>{activeVisitorCount} visiting · {visitorCount} visits</span>
          </div>
          <div className="yard-bottom-dock">
            <YardIconButton icon="food" label="Food" active={activeScreen === "food"} onClick={() => openScreen("food")} />
            <YardIconButton icon="goodies" label="Goodies" active={activeScreen === "goodies"} onClick={() => openScreen("goodies")} />
            <YardIconButton icon="shop" label="Shop" active={activeScreen === "shop"} onClick={() => openScreen("shop")} />
            <YardIconButton icon="petbook" label="Petbook" active={activeScreen === "petbook"} onClick={() => openScreen("petbook")} />
            <YardIconButton icon="album" label="Album" active={activeScreen === "album"} onClick={() => openScreen("album")} />
            <YardIconButton icon="gifts" label="Gifts" badge={pendingGiftCount || null} active={activeScreen === "gifts"} onClick={() => openScreen("gifts")} />
          </div>
        </div>

        {placementDraft && (
          <div className="yard-placement-dock">
            <div>
              <YardIcon name="placement" />
              <strong>{draftGoodie?.name || "Goodie"}</strong>
              <span>{Math.round(placementDraft.x)} · {Math.round(placementDraft.y)}</span>
            </div>
            <YardIconButton compact icon="close" label="Cancel placement" onClick={cancelPlacement} />
            <YardIconButton compact icon="confirm" label="Confirm placement" onClick={confirmPlacement} />
          </div>
        )}

        {activeScreen && screenMeta && (
          <div
            ref={screenRef}
            className="yard-game-screen"
            role="dialog"
            aria-modal="true"
            aria-label={screenMeta.title}
          >
            <div className="yard-screen-header">
              <div>
                <YardIcon name={screenMeta.icon} />
                <strong>{screenMeta.title}</strong>
              </div>
              <YardIconButton compact icon="close" label="Close" onClick={closeScreen} />
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
