import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../store/gameStore";
import { PET_ASSETS, PET_EXPRESSIONS } from "../../game-logic.js";

function PetAvatar({ petData }) {
  if (!petData) return null;
  const baseSkinId = petData.skinId || "basic_dog";
  const assetDef = PET_ASSETS[baseSkinId];
  if (!assetDef) return <span>🐕</span>;

  const happiness = petData.stats?.happiness ?? 100;
  let exprId = "happy";
  if (happiness >= 90) exprId = "ecstatic";
  else if (happiness >= 70) exprId = "happy";
  else if (happiness >= 50) exprId = "content";
  else if (happiness >= 30) exprId = "neutral";
  else if (happiness >= 15) exprId = "sad";
  else exprId = "miserable";

  const expressionDef = PET_EXPRESSIONS[exprId];

  // Scale down to fit the header nicely (around 80x80)
  const scale = 80 / Math.max(assetDef.width, assetDef.height);

  return (
    <div className="relative mx-auto mb-2" style={{ width: 80, height: 80 }}>
      <div
        className="pet-render-stack absolute top-1/2 left-1/2"
        style={{
          width: assetDef.width,
          height: assetDef.height,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        {assetDef.type === "svg" ? (
          <img
            className="pet-layer pet-body pet-type-svg"
            src={`/${assetDef.src}`}
            alt={baseSkinId}
          />
        ) : (
          <div
            className="pet-layer pet-body pet-type-raster"
            style={{
              backgroundImage: `url('/${assetDef.src}')`,
              width: assetDef.frameWidth,
              animationTimingFunction: `steps(${assetDef.frames})`,
            }}
          />
        )}

        {expressionDef && assetDef.anchors?.face && (
          <img
            className="pet-layer pet-expression"
            src={`/${expressionDef.src}`}
            style={{
              top: assetDef.anchors.face.top,
              left: assetDef.anchors.face.left,
              transform: "translate(-50%, -50%)",
            }}
            alt="expression"
          />
        )}
      </div>
    </div>
  );
}

export default function PetInfoUI() {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newNameInput, setNewNameInput] = useState("");
  const slices = useGameStore((state) => state.slices);
  const petData = slices.pet;

  useEffect(() => {
    const handleToggle = (e) => {
      setIsOpen(e.detail.open);
    };
    document.addEventListener("toggle-pet-info", handleToggle);
    return () => document.removeEventListener("toggle-pet-info", handleToggle);
  }, []);

  if (!petData) return null;

  const happiness = petData.stats?.happiness ?? 100;
  const affectionLevel = petData.affectionLevel ?? 1;
  const affectionXp = petData.affectionXp ?? 0;

  // Mood label matching the avatar expression thresholds
  let moodLabel = "Happy";
  let moodColor = "text-accent";
  if (happiness >= 90) {
    moodLabel = "Ecstatic 🌟";
    moodColor = "text-gold";
  } else if (happiness >= 70) {
    moodLabel = "Happy 😊";
    moodColor = "text-success";
  } else if (happiness >= 50) {
    moodLabel = "Content 😌";
    moodColor = "text-accent";
  } else if (happiness >= 30) {
    moodLabel = "Neutral 😐";
    moodColor = "text-textDim";
  } else if (happiness >= 15) {
    moodLabel = "Sad 😢";
    moodColor = "text-warning";
  } else {
    moodLabel = "Miserable 😭";
    moodColor = "text-danger";
  }

  const xpPct = Math.min(100, (petData.xp / petData.xpToNextLevel) * 100);
  const fullness = petData.stats?.fullness ?? 0;

  const handleRenameStart = () => {
    setNewNameInput(petData.name === "Buddy" ? "" : petData.name);
    setIsEditingName(true);
  };

  const handleRenameSubmit = () => {
    if (!newNameInput.trim()) {
      setIsEditingName(false);
      return;
    }

    setIsEditingName(false);

    // Dispatch to vanilla API logic we preserved in pet.js
    fetch("/api/pet/rename", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newName: newNameInput.trim() }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          useGameStore.getState().slices.pet = data.pet;
          useGameStore.setState((prev) => ({
            slices: { ...prev.slices, pet: data.pet },
          }));
          if (window.HUB?.showToast)
            window.HUB.showToast("Pet renamed to " + data.pet.name, "success");
        }
      });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Click-outside backdrop */}
          <motion.div
            className="fixed inset-0 z-[99]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              setIsOpen(false);
              document.dispatchEvent(new Event("pet-info-closed"));
            }}
          />
          <motion.div
            className="fixed bottom-24 left-1/2 -translate-x-1/2 w-80 bg-surface/95 backdrop-blur-xl border border-border rounded-3xl shadow-2xl z-[100] flex flex-col pointer-events-auto overflow-hidden text-center"
            initial={{ opacity: 0, y: 50, scale: 0.9, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, scale: 0.95, y: 20, x: "-50%" }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            {/* Header */}
            <div className="relative p-4 pb-2">
              <button
                onClick={() => {
                  setIsOpen(false);
                  document.dispatchEvent(new Event("pet-info-closed"));
                }}
                className="absolute top-4 right-4 text-textDim hover:text-white"
              >
                ✕
              </button>
              <div className="flex justify-center mb-2">
                <PetAvatar petData={petData} />
              </div>

              {isEditingName ? (
                <div className="flex gap-2 justify-center items-center mb-1">
                  <input
                    type="text"
                    value={newNameInput}
                    onChange={(e) => setNewNameInput(e.target.value)}
                    maxLength={12}
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleRenameSubmit()}
                    className="bg-background text-white px-2 py-1 rounded border border-border outline-none w-32 font-bold focus:border-primary text-center"
                  />
                  <button
                    onClick={handleRenameSubmit}
                    className="text-sm bg-primary px-2 py-1 rounded hover:opacity-90"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditingName(false)}
                    className="text-sm bg-surfaceHover px-2 py-1 rounded hover:opacity-90"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <h3 className="text-xl font-bold text-white font-heading">
                  {petData.name}
                  <button
                    onClick={handleRenameStart}
                    className="ml-2 text-sm opacity-50 hover:opacity-100"
                  >
                    ✏️
                  </button>
                </h3>
              )}
              <p className="text-sm font-bold text-primary tracking-widest uppercase">
                Level {petData.level}
              </p>
            </div>

            <div className="p-4 pt-2 space-y-4">
              {/* XP */}
              <div>
                <div className="flex justify-between text-xs text-textDim mb-1 font-mono">
                  <span>XP</span>
                  <span>
                    {petData.xp} / {petData.xpToNextLevel}
                  </span>
                </div>
                <div className="h-2 w-full bg-background rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${xpPct}%` }}
                  />
                </div>
              </div>

              {/* Happiness / Mood */}
              <div>
                <div className="flex justify-between text-xs mb-1 font-mono font-bold">
                  <span className={moodColor}>🧠 MOOD</span>
                  <span className={moodColor}>{moodLabel}</span>
                </div>
                <div className="h-2 w-full bg-background rounded-full overflow-hidden border border-primary/20">
                  <motion.div
                    className="h-full bg-accent shadow-[0_0_10px_rgba(167,139,250,0.4)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${happiness}%` }}
                  />
                </div>
                <p className="text-[10px] text-textDim mt-0.5 text-left">
                  {happiness >= 70
                    ? "Your pet is thriving!"
                    : happiness >= 40
                      ? "Could use some attention…"
                      : "Feed & play to cheer up!"}
                </p>
              </div>

              {/* Satiety */}
              <div>
                <div className="flex justify-between text-xs mb-1 font-mono font-bold">
                  <span
                    className={fullness >= 100 ? "text-danger" : "text-gold"}
                  >
                    {fullness >= 100 ? "🤢 FULL" : "🍖 FULLNESS"}
                  </span>
                  <span
                    className={fullness >= 100 ? "text-danger" : "text-gold"}
                  >
                    {fullness}/100
                  </span>
                </div>
                <div className="h-2 w-full bg-background rounded-full overflow-hidden border border-gold/20">
                  <motion.div
                    className="h-full bg-gold shadow-[0_0_10px_rgba(255,215,0,0.5)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${fullness}%` }}
                  />
                </div>
              </div>

              {/* Affection */}
              <div className="bg-background/60 rounded-xl p-2.5 text-left border border-pink-500/10">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-pink-400 tracking-wider uppercase">
                    💕 Affection
                  </span>
                  <span className="text-xs font-mono font-bold text-pink-300">
                    Lv {affectionLevel}
                  </span>
                </div>
                <p className="text-[10px] text-textDim mt-1">
                  Bond with your pet by feeding, playing, and completing quests
                  together.
                </p>
              </div>

              {/* Abilities */}
              <div className="bg-background/80 rounded-xl p-3 text-left space-y-2 mt-2 border border-white/5">
                <h4 className="text-xs uppercase text-textDim font-bold tracking-wider mb-2">
                  Abilities
                </h4>

                <div
                  className={`text-sm ${petData.abilities.autoHarvest ? "text-white" : "text-textDim opacity-50"}`}
                >
                  {petData.abilities.autoHarvest ? "✅" : "🔒"} Auto-Harvest{" "}
                  <span className="text-xs">(Lv 3)</span>
                </div>
                <div
                  className={`text-sm ${petData.abilities.autoWater ? "text-white" : "text-textDim opacity-50"}`}
                >
                  {petData.abilities.autoWater ? "✅" : "🔒"} Auto-Water{" "}
                  <span className="text-xs">(Lv 5)</span>
                </div>
                <div
                  className={`text-sm ${petData.abilities.autoPlant ? "text-white" : "text-textDim opacity-50"}`}
                >
                  {petData.abilities.autoPlant ? "✅" : "🔒"} Auto-Plant{" "}
                  <span className="text-xs">(Lv 7)</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
