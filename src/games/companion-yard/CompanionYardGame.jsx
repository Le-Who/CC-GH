import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronRight,
  Gift,
  Hammer,
  Home,
  Images,
  PawPrint,
  Pause,
  Play,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Wrench,
} from "lucide-react";
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

const PANEL_TABS = [
  { id: "setup", label: "Setup" },
  { id: "shop", label: "Shop" },
  { id: "petbook", label: "Petbook" },
  { id: "album", label: "Album" },
  { id: "remodel", label: "Remodel" },
];

const SPECIES_LABELS = {
  cat: "Cat",
  dog: "Dog",
  bunny: "Bunny",
  fox: "Fox",
  hamster: "Hamster",
  turtle: "Turtle",
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

function getVisitorMotion(visit, slot, activity, renderNow) {
  const arrivedAt = Number(visit.arrivedAt) || renderNow;
  const leavesAt = Math.max(arrivedAt + 60_000, Number(visit.leavesAt) || arrivedAt + 60_000);
  const progress = clamp((renderNow - arrivedAt) / (leavesAt - arrivedAt), 0, 1);
  const anchorX = clamp((slot?.x || 50) + (activity?.x || 0), 4, 96);
  const anchorY = clamp((slot?.y || 70) + (activity?.y || 0), 6, 96);
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

function YardButton({ children, icon: Icon = Sparkles, onClick, disabled, danger, active, subtle, title }) {
  return (
    <button
      type="button"
      className={`yard-button${danger ? " danger" : ""}${active ? " active" : ""}${subtle ? " subtle" : ""}`}
      disabled={disabled}
      onClick={(event) => {
        audioManager.play("tap");
        onClick?.(event);
      }}
      aria-label={title || (typeof children === "string" ? children : undefined)}
      title={title}
    >
      <Icon size={16} />
      <span>{children}</span>
    </button>
  );
}

function YardStat({ label, value }) {
  return (
    <div className="yard-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function useCompanionYardShell(active) {
  const setActiveGameShell = useGameHub((state) => state.setActiveGameShell);
  useEffect(() => {
    setActiveGameShell(active ? "room" : null);
    return () => {
      if (useGameHub.getState().activeGameShell === "room") {
        useGameHub.getState().setActiveGameShell(null);
      }
    };
  }, [active, setActiveGameShell]);
}

function getFirstOpenSlot(yard, goodieId) {
  const goodie = YARD_GOODIES[goodieId];
  if (!goodie) return null;
  const occupied = new Set((yard.placedGoodies || []).map((placed) => placed.slotId));
  return getUnlockedYardSlots(yard.expansion?.level || 1).find((slot) => {
    if (occupied.has(slot.id)) return false;
    return goodie.size !== "large" || slot.size === "large";
  })?.id || null;
}

export default function CompanionYardGame() {
  const snapshot = useGameHub((state) => state.snapshot);
  const performAction = useGameHub((state) => state.performAction);
  const setActiveTab = useGameHub((state) => state.setActiveTab);
  const yard = snapshot?.yard || {};
  const catalog = snapshot?.meta?.yardCatalog || {};
  const foods = catalog.foods || YARD_FOODS;
  const goodies = catalog.goodies || YARD_GOODIES;
  const visitors = catalog.visitors || YARD_VISITORS;
  const remodels = catalog.remodels || YARD_REMODELS;
  const slots = getUnlockedYardSlots(yard.expansion?.level || 1);
  const [inShell, setInShell] = useState(false);
  const [paused, setPaused] = useState(false);
  const [panelTab, setPanelTab] = useState("setup");
  const [selectedGoodie, setSelectedGoodie] = useState(null);
  const [selectedVisitId, setSelectedVisitId] = useState(null);
  const [companionName, setCompanionName] = useState(yard.companion?.name || "Buddy");
  const [assetManifest, setAssetManifest] = useState(null);
  const [renderNow, setRenderNow] = useState(snapshot?.serverTime || Date.now());
  const isPlaying = inShell && !paused;
  const nameInputRef = useRef(null);

  useCompanionYardShell(inShell);

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
    if (!inShell && !(yard.activeVisitors || []).length) return undefined;
    const interval = window.setInterval(updateNow, 900);
    return () => window.clearInterval(interval);
  }, [inShell, yard.activeVisitors]);

  useEffect(() => {
    setCompanionName(yard.companion?.name || "Buddy");
  }, [yard.companion?.name]);

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

  const activeVisitorItems = useMemo(() => {
    const slotMap = new Map(slots.map((slot) => [slot.id, slot]));
    return (yard.activeVisitors || [])
      .map((visit) => {
        const placed = placedBySlot.get(visit.slotId);
        const goodie = goodies[placed?.goodieId || visit.goodieId];
        const visitorInfo = visitors[visit.visitorId];
        const slot = slotMap.get(visit.slotId);
        if (!placed || !goodie || !visitorInfo || !slot) return null;
        const activity = getVisitActivity(goodie, visit, placed);
        const motion = getVisitorMotion(visit, slot, activity, renderNow);
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
      .sort((a, b) => a.motion.y - b.motion.y);
  }, [yard.activeVisitors, placedBySlot, slots, goodies, visitors, renderNow]);

  const selectedVisit = useMemo(() => (
    (yard.activeVisitors || []).find((visit) => visit.visitId === selectedVisitId) || null
  ), [yard.activeVisitors, selectedVisitId]);

  useEffect(() => {
    if (selectedVisitId && !selectedVisit) setSelectedVisitId(null);
  }, [selectedVisit, selectedVisitId]);

  const visitorCount = Object.values(yard.petbook || {}).reduce((sum, entry) => sum + (entry.visits || 0), 0);
  const activeVisitorCount = yard.activeVisitors?.length || 0;
  const pendingGiftCount = yard.pendingGifts?.length || 0;
  const selectedRemodel = remodels[yard.remodel] || remodels.meadow || {};

  const placeGoodie = (goodieId, slotId = null) => {
    const targetSlot = slotId || getFirstOpenSlot(yard, goodieId);
    if (!targetSlot) return;
    performAction("yard.placeGoodie", { goodieId, slotId: targetSlot }).then((result) => {
      if (!result.error) setSelectedGoodie(null);
    });
  };

  const captureFirstVisitor = () => {
    const visit = selectedVisit || yard.activeVisitors?.[0];
    if (!visit) return;
    const visitorInfo = visitors[visit.visitorId];
    performAction("yard.capturePhoto", { visitId: visit.visitId, caption: visitorInfo?.name ? `${visitorInfo.name} visit` : "Yard visit" });
    setPanelTab("album");
  };

  const configureCompanion = () => {
    const name = (nameInputRef.current?.value || companionName).trim();
    performAction("yard.configureCompanion", {
      name,
      species: yard.companion?.species || "dog",
      helperAutoRefill: !!yard.helper?.autoRefill,
    });
  };

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
          <img src={assetPath("visitors", item.visitorInfo.id)} alt="" />
          <b>{item.visitorInfo.name}</b>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`room-layout companion-yard-layout game-shell shell-skin-meditation ${inShell ? (isPlaying ? "shell-playing" : "shell-paused") : "shell-menu"}`}>
      <section className={`room-stage companion-yard-stage ${selectedRemodel.themeClass || "yard-remodel-meadow"}`}>
        <img className="yard-background-art" src={assetPath("backgrounds", yard.remodel || "meadow")} alt="" />
        <div className="yard-bowls">
          {(yard.bowls || []).map((bowl) => {
            const food = foods[bowl.foodId];
            return (
              <button
                key={bowl.id}
                className={`yard-bowl${food ? " filled" : ""}`}
                onClick={() => !food && performAction("yard.setFood", { bowlId: bowl.id, foodId: "kibble" })}
                title={food ? food.name : "Set kibble"}
              >
                <img src={assetPath("foods", food?.id || "empty_bowl")} alt="" />
                <span>{food ? `${food.name} (${bowl.servings})` : "Empty bowl"}</span>
              </button>
            );
          })}
        </div>
        {renderPetLayer("back")}
        <div className="yard-slot-layer">
          {slots.map((slot) => {
            const placed = placedBySlot.get(slot.id);
            const goodie = goodies[placed?.goodieId];
            const slotVisitors = visitorsBySlot.get(slot.id) || [];
            return (
              <button
                key={slot.id}
                className={`yard-slot yard-slot-${slot.size}${selectedGoodie && !placed ? " target" : ""}`}
                style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                onClick={() => {
                  if (selectedGoodie && !placed) placeGoodie(selectedGoodie, slot.id);
                  else if (slotVisitors.length) setSelectedVisitId(slotVisitors[0].visitId);
                  else if (placed) performAction("yard.pickupGoodie", { slotId: slot.id });
                }}
                title={placed ? `${goodie?.name || placed.goodieId} (${placed.condition})${slotVisitors.length ? ` · ${slotVisitors.length} visiting` : ""}` : `${slot.size} slot`}
              >
                {placed ? (
                  <img src={assetPath("goodies", placed.condition === "new" ? placed.goodieId : `${placed.goodieId}_${placed.condition}`)} alt="" />
                ) : (
                  <span>{slot.size}</span>
                )}
                {placed && goodie?.frontAssetKey && (
                  <img className="yard-goodie-front" src={assetPath("goodies", goodie.frontAssetKey)} alt="" />
                )}
              </button>
            );
          })}
        </div>
        {renderPetLayer("front")}
        <div className="yard-companion">
          <img src={assetPath("companions", yard.companion?.species || "dog")} alt="" />
          <span>{yard.companion?.name || "Buddy"}</span>
        </div>
      </section>

      {isPlaying && (
        <div className="game-play-hud companion-yard-hud">
          <div className="game-play-title">
            <strong>Cozy Yard</strong>
            <span>{selectedVisit ? `${visitors[selectedVisit.visitorId]?.name || "Visitor"} selected` : activeVisitorCount ? `${activeVisitorCount} visiting now` : "Set food and let the yard work while you are away"}</span>
          </div>
          <div className="game-play-stats">
            <span>Treats <strong>{formatCount(yard.currencies?.treats || 0)}</strong></span>
            <span>Gifts <strong>{pendingGiftCount}</strong></span>
            <span>Visits <strong>{visitorCount}</strong></span>
          </div>
          <div className="game-play-actions">
            {activeVisitorCount > 0 && <YardButton icon={Camera} subtle onClick={captureFirstVisitor}>Photo</YardButton>}
            <YardButton icon={Gift} subtle disabled={!pendingGiftCount} onClick={() => performAction("yard.collectGifts")}>Collect</YardButton>
            <YardButton icon={Pause} subtle onClick={() => setPaused(true)}>Pause</YardButton>
          </div>
        </div>
      )}

      <aside className={`side-panel companion-yard-panel${inShell ? " game-menu-overlay" : ""}`}>
        <div className="panel-header">
          <div>
            <strong>Cozy Yard</strong>
            <span>{selectedRemodel.name || "Morning Meadow"} · {yard.expansion?.level >= 2 ? "Wide yard" : "Small yard"}</span>
          </div>
          <YardButton icon={Play} onClick={() => { setInShell(true); setPaused(false); }}>
            {inShell ? "Resume" : "Play"}
          </YardButton>
        </div>

        {inShell && paused && (
          <div className="button-row">
            <YardButton icon={Play} onClick={() => setPaused(false)}>Resume</YardButton>
            <YardButton icon={RotateCcw} subtle onClick={() => { setPaused(false); setInShell(false); }}>Setup</YardButton>
            <YardButton icon={Home} danger onClick={() => { setPaused(false); setInShell(false); setActiveTab("garden"); }}>Exit</YardButton>
          </div>
        )}

        <div className="yard-currency-row">
          <YardStat label="Treats" value={formatCount(yard.currencies?.treats || 0)} />
          <YardStat label="Shiny" value={formatCount(yard.currencies?.shinyTreats || 0)} />
          <YardStat label="Gifts" value={pendingGiftCount} />
        </div>

        <div className="section-tabs companion-yard-tabs" role="tablist">
          {PANEL_TABS.map((tab) => (
            <button key={tab.id} className={panelTab === tab.id ? "active" : ""} onClick={() => setPanelTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </div>

        {panelTab === "setup" && (
          <div className="panel-scroll companion-yard-scroll">
            <div className="yard-card">
              <strong>Food bowls</strong>
              {(yard.bowls || []).map((bowl) => (
                <div className="yard-row" key={bowl.id}>
                  <span>{bowl.id}: {foods[bowl.foodId]?.name || "empty"}</span>
                  <YardButton icon={Check} subtle disabled={(yard.foodInventory?.kibble || 0) <= 0} onClick={() => performAction("yard.setFood", { bowlId: bowl.id, foodId: "kibble" })}>Kibble</YardButton>
                </div>
              ))}
              <YardButton icon={Gift} disabled={!pendingGiftCount} onClick={() => performAction("yard.collectGifts")}>
                Collect {pendingGiftCount} gifts
              </YardButton>
              <YardButton icon={Sparkles} subtle onClick={() => performAction("yard.claimDailyLetter")}>Daily letter</YardButton>
            </div>

            <div className="yard-card">
              <strong>Owned goodies</strong>
              {Object.entries(yard.goodieInventory || {}).filter(([, qty]) => qty > 0).map(([goodieId, qty]) => {
                const goodie = goodies[goodieId];
                if (!goodie) return null;
                return (
                  <button key={goodieId} className={`yard-inventory-item${selectedGoodie === goodieId ? " selected" : ""}`} onClick={() => setSelectedGoodie(goodieId)}>
                    <img src={assetPath("goodies", goodieId)} alt="" />
                    <span><strong>{goodie.name}</strong><small>x{qty} · {goodie.size}</small></span>
                    <ChevronRight size={16} />
                  </button>
                );
              })}
            </div>

            <div className="yard-card">
              <strong>Placed goodies</strong>
              {(yard.placedGoodies || []).map((placed) => {
                const goodie = goodies[placed.goodieId];
                return (
                  <div className="yard-row" key={placed.slotId}>
                    <span>{goodie?.name || placed.goodieId} · {placed.condition}</span>
                    {placed.condition !== "new" ? (
                      <YardButton icon={Wrench} subtle onClick={() => performAction("yard.fixGoodie", { slotId: placed.slotId })}>Fix</YardButton>
                    ) : (
                      <YardButton icon={Home} subtle onClick={() => performAction("yard.pickupGoodie", { slotId: placed.slotId })}>Pick up</YardButton>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {panelTab === "shop" && (
          <div className="panel-scroll companion-yard-scroll">
            <div className="yard-card">
              <strong>Food shop</strong>
              {Object.values(foods).map((food) => (
                <div className="yard-shop-row" key={food.id}>
                  <img src={assetPath("foods", food.id)} alt="" />
                  <span><strong>{food.name}</strong><small>{food.desc} · {costLabel(food.cost)}</small></span>
                  <YardButton icon={ShoppingBag} onClick={() => performAction("yard.buyFood", { foodId: food.id, qty: 1 })}>Buy</YardButton>
                </div>
              ))}
            </div>
            <div className="yard-card">
              <strong>Goodies shop</strong>
              {Object.values(goodies).map((goodie) => (
                <div className="yard-shop-row" key={goodie.id}>
                  <img src={assetPath("goodies", goodie.id)} alt="" />
                  <span><strong>{goodie.name}</strong><small>{goodie.desc} · {costLabel(goodie.cost)}</small></span>
                  <YardButton icon={ShoppingBag} onClick={() => performAction("yard.buyGoodie", { goodieId: goodie.id })}>Buy</YardButton>
                </div>
              ))}
            </div>
          </div>
        )}

        {panelTab === "petbook" && (
          <div className="panel-scroll companion-yard-scroll yard-petbook">
            {Object.values(visitors).map((visitor) => {
              const entry = yard.petbook?.[visitor.id];
              const seen = !!entry;
              return (
                <div key={visitor.id} className={`yard-petbook-card${seen ? " seen" : ""}`}>
                  <img src={assetPath("visitors", visitor.id)} alt="" />
                  <span>
                    <strong>{seen ? visitor.name : "Unknown visitor"}</strong>
                    <small>{seen ? `${SPECIES_LABELS[visitor.species] || visitor.species} · ${entry.visits} visits` : `${visitor.rarity} visitor`}</small>
                  </span>
                  {yard.mementos?.[visitor.id] && <b>{visitor.memento.name}</b>}
                </div>
              );
            })}
          </div>
        )}

        {panelTab === "album" && (
          <div className="panel-scroll companion-yard-scroll yard-album">
            {!(yard.album?.photos || []).length && <div className="empty-state">Take photos of active visitors from the live HUD.</div>}
            {(yard.album?.photos || []).map((photo) => {
              const visitor = visitors[photo.visitorId];
              return (
                <div className="yard-photo-card" key={photo.id}>
                  <img src={assetPath("visitors", photo.visitorId)} alt="" />
                  <span><strong>{visitor?.name || photo.visitorId}</strong><small>{photo.pose} · {photo.caption || "Cozy Yard"}</small></span>
                  <YardButton icon={Images} subtle active={yard.album.favoritePhotoId === photo.id} onClick={() => performAction("yard.favoritePhoto", { photoId: photo.id })}>Favorite</YardButton>
                </div>
              );
            })}
          </div>
        )}

        {panelTab === "remodel" && (
          <div className="panel-scroll companion-yard-scroll">
            <div className="yard-card">
              <strong>Companion</strong>
              <div className="join-row">
                <input ref={nameInputRef} value={companionName} maxLength={16} onChange={(event) => setCompanionName(event.target.value)} />
                <YardButton icon={Check} onClick={configureCompanion}>Save</YardButton>
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
              <YardButton
                icon={PawPrint}
                disabled={!yard.helper?.unlocked}
                active={yard.helper?.autoRefill}
                onClick={() => performAction("yard.configureCompanion", {
                  name: companionName,
                  species: yard.companion?.species || "dog",
                  helperAutoRefill: !yard.helper?.autoRefill,
                })}
              >
                Helper refill
              </YardButton>
            </div>

            <div className="yard-card">
              <strong>Expansion</strong>
              <YardButton icon={Sparkles} disabled={yard.expansion?.level >= 2} onClick={() => performAction("yard.buyExpansion")}>
                {yard.expansion?.level >= 2 ? "Wide yard unlocked" : "Buy wide yard"}
              </YardButton>
            </div>

            <div className="yard-card">
              <strong>Remodels</strong>
              {Object.values(remodels).map((remodel) => (
                <div className="yard-shop-row" key={remodel.id}>
                  <img src={assetPath("backgrounds", remodel.id)} alt="" />
                  <span><strong>{remodel.name}</strong><small>{remodel.desc} · {yard.ownedRemodels?.includes(remodel.id) ? "Owned" : costLabel(remodel.cost)}</small></span>
                  <YardButton icon={Hammer} active={yard.remodel === remodel.id} onClick={() => performAction("yard.setRemodel", { remodelId: remodel.id })}>Set</YardButton>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
