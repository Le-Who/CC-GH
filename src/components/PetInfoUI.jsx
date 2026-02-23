import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';

const SKINS = {
  basic_dog: "🐕",
  basic_cat: "🐱",
  basic_bunny: "🐰",
};

export default function PetInfoUI() {
  const [isOpen, setIsOpen] = useState(false);
  const slices = useGameStore(state => state.slices);
  const petData = slices.pet;

  useEffect(() => {
    const handleToggle = (e) => {
      setIsOpen(e.detail.open);
    };
    document.addEventListener('toggle-pet-info', handleToggle);
    return () => document.removeEventListener('toggle-pet-info', handleToggle);
  }, []);

  if (!petData) return null;

  const xpPct = Math.min(100, (petData.xp / petData.xpToNextLevel) * 100);
  const fullness = petData.stats?.fullness ?? 0;

  const handleRename = () => {
    const newName = prompt("Name your pet:", petData.name === "Buddy" ? "" : petData.name);
    if (!newName) return;
    
    // Dispatch to vanilla API logic we preserved in pet.js, or just call fetch manually
    // Since pet.js has promptForPetName, actually we can just call it from here!
    // But since we built React UI, let's keep it simple and just use prompt() for MVP,
    // or call window.HUB.api if we exposed it. 
    // To keep it 100% compatible with the vanilla server endpoint:
    fetch('/api/pet/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName })
    })
    .then(res => res.json())
    .then(data => {
      if(data.success) {
        useGameStore.getState().slices.pet = data.pet;
        useGameStore.setState(prev => ({ slices: { ...prev.slices, pet: data.pet } }));
      }
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          className="fixed bottom-24 left-1/2 -translate-x-1/2 w-80 bg-surface/95 backdrop-blur-xl border border-border rounded-3xl shadow-2xl z-[100] flex flex-col pointer-events-auto overflow-hidden text-center"
          initial={{ opacity: 0, y: 50, scale: 0.9, x: '-50%' }}
          animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
          exit={{ opacity: 0, scale: 0.95, y: 20, x: '-50%' }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          {/* Header */}
          <div className="relative p-4 pb-2">
            <button onClick={() => setIsOpen(false)} className="absolute top-4 right-4 text-textDim hover:text-white">✕</button>
            <div className="text-4xl mb-2">{SKINS[petData.skinId] || "🐕"}</div>
            <h3 className="text-xl font-bold text-white font-heading">
              {petData.name}
              <button onClick={handleRename} className="ml-2 text-sm opacity-50 hover:opacity-100">✏️</button>
            </h3>
            <p className="text-sm font-bold text-primary tracking-widest uppercase">Level {petData.level}</p>
          </div>

          <div className="p-4 pt-2 space-y-4">
            {/* XP */}
            <div>
              <div className="flex justify-between text-xs text-textDim mb-1 font-mono">
                <span>XP</span>
                <span>{petData.xp} / {petData.xpToNextLevel}</span>
              </div>
              <div className="h-2 w-full bg-background rounded-full overflow-hidden">
                <motion.div className="h-full bg-primary" initial={{ width: 0 }} animate={{ width: `${xpPct}%` }} />
              </div>
            </div>

            {/* Satiety */}
            <div>
              <div className="flex justify-between text-xs mb-1 font-mono font-bold">
                <span className={fullness >= 100 ? "text-danger" : "text-gold"}>
                  {fullness >= 100 ? "🤢 FULL" : "🍖 FULLNESS"}
                </span>
                <span className={fullness >= 100 ? "text-danger" : "text-gold"}>{fullness}/100</span>
              </div>
              <div className="h-2 w-full bg-background rounded-full overflow-hidden border border-gold/20">
                <motion.div className="h-full bg-gold shadow-[0_0_10px_rgba(255,215,0,0.5)]" initial={{ width: 0 }} animate={{ width: `${fullness}%` }} />
              </div>
            </div>

            {/* Abilities */}
            <div className="bg-background/80 rounded-xl p-3 text-left space-y-2 mt-2 border border-white/5">
              <h4 className="text-xs uppercase text-textDim font-bold tracking-wider mb-2">Abilities</h4>
              
              <div className={`text-sm ${petData.abilities.autoHarvest ? 'text-white' : 'text-textDim opacity-50'}`}>
                {petData.abilities.autoHarvest ? "✅" : "🔒"} Auto-Harvest <span className="text-xs">(Lv 3)</span>
              </div>
              <div className={`text-sm ${petData.abilities.autoWater ? 'text-white' : 'text-textDim opacity-50'}`}>
                {petData.abilities.autoWater ? "✅" : "🔒"} Auto-Water <span className="text-xs">(Lv 5)</span>
              </div>
              <div className={`text-sm ${petData.abilities.autoPlant ? 'text-white' : 'text-textDim opacity-50'}`}>
                {petData.abilities.autoPlant ? "✅" : "🔒"} Auto-Plant <span className="text-xs">(Lv 7)</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
