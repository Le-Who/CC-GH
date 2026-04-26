import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useGame } from '../lib/GameContext';
import { PLANT_TYPES, getUpgradeCost, getProduction, PHASE_DURATIONS_MS } from '../constants';
import { Coins, X, ArrowUpCircle, Trash2, Droplets, Archive } from 'lucide-react';
import { cn } from '../lib/utils';
import { GARDEN_SHEET_PATH, spriteData } from '../lib/sprites';

interface BottomPanelProps {
  spot: { shelfIndex: number, spotIndex: number, plantId?: string } | null;
  onClose: () => void;
}

export function BottomPanel({ spot, onClose }: BottomPanelProps) {
  if (!spot) return null;

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-[#161213]/60 backdrop-blur-sm z-30"
      />
      
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300, bounce: 0 }}
        className="fixed bottom-0 left-0 right-0 bg-[#22221d]/95 backdrop-blur-xl border-t border-[#c73838] shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-t-[32px] z-40 max-h-[85vh] flex flex-col items-center pb-safe-offset-4"
      >
        <div className="w-12 h-1 bg-white/10 rounded-full my-4" />
        
        <button onClick={onClose} className="absolute right-4 top-4 p-2 bg-white/5 text-slate-400 border border-white/10 rounded-full hover:bg-white/10 hover:text-slate-200 transition">
          <X size={16} />
        </button>

        <div className="w-full px-6 pb-8">
          {spot.plantId ? (
            <PlantDetail plantId={spot.plantId} onClose={onClose} />
          ) : (
            <Shop shelfIndex={spot.shelfIndex} spotIndex={spot.spotIndex} onClose={onClose} />
          )}
        </div>
      </motion.div>
    </>
  );
}

function Shop({ shelfIndex, spotIndex, onClose }: { shelfIndex: number, spotIndex: number, onClose: () => void }) {
  const { state, buyPlant, unlockedPlants, movePlantToShelf } = useGame();
  const [tab, setTab] = useState<'shop' | 'inventory'>('shop');

  const availablePlants = Object.values(PLANT_TYPES).filter(p => unlockedPlants.includes(p.id));
  const inventoryPlants = state.plants.filter(p => p.spotIndex === -1);

  return (
    <div className="flex flex-col w-full h-full max-h-[60vh]">
      <div className="flex w-full bg-black/20 rounded-xl p-1 mb-6 border border-white/5">
        <button 
          onClick={() => setTab('shop')} 
          className={cn("flex-1 py-2 text-xs tracking-widest uppercase rounded-lg transition-colors", tab === 'shop' ? 'bg-amber-500/20 text-amber-400 font-medium' : 'text-slate-500 hover:text-slate-300')}
        >
          Seed Shop
        </button>
        <button 
          onClick={() => setTab('inventory')} 
          className={cn("flex-1 py-2 text-xs tracking-widest uppercase rounded-lg transition-colors flex items-center justify-center gap-2", tab === 'inventory' ? 'bg-amber-500/20 text-amber-400 font-medium' : 'text-slate-500 hover:text-slate-300')}
        >
          <Archive size={14} /> 
          Inventory ({inventoryPlants.length})
        </button>
      </div>
      
      <div className="overflow-y-auto w-full space-y-3 pb-8 pr-2 -mr-2">
        {tab === 'shop' && availablePlants.map((plant) => {
          const Icon = plant.icon;
          const canAfford = state.gold >= plant.baseCost;

          return (
            <div key={plant.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
              <div className="flex items-center gap-4">
                <div className={cn("w-12 h-12 flex items-center justify-center bg-black/40 rounded-lg border border-white/5", plant.color)}>
                  <Icon size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="font-medium text-slate-200 text-sm">{plant.name}</h3>
                  <p className="text-[10px] text-amber-500/70 font-mono">Yields {plant.baseProduction} <small>G/s</small></p>
                </div>
              </div>
              
              <motion.button
                whileTap={canAfford ? { scale: 0.95 } : {}}
                disabled={!canAfford}
                onClick={() => {
                  buyPlant(plant.id as any, shelfIndex, spotIndex);
                  onClose();
                }}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded font-mono text-xs transition-all border",
                  canAfford 
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]" 
                    : "bg-black/40 border-white/5 text-slate-600 cursor-not-allowed"
                )}
              >
                {plant.baseCost} <Coins size={12} className={canAfford ? "text-amber-400" : "text-slate-600"} />
              </motion.button>
            </div>
          );
        })}

        {tab === 'inventory' && inventoryPlants.length === 0 && (
           <div className="text-center text-slate-500 py-10 text-sm tracking-wide font-light">
             Your inventory is empty.<br/>Long-press plants in your garden to stash them here.
           </div>
        )}

        {tab === 'inventory' && inventoryPlants.map((p) => {
           const def = PLANT_TYPES[p.type] || PLANT_TYPES.daisy;
           const Icon = def.icon;
           
           return (
            <div key={p.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
              <div className="flex items-center gap-4">
                <div className={cn("w-12 h-12 flex items-center justify-center bg-black/40 rounded-lg border border-white/5", def.color)}>
                  <Icon size={24} strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="font-medium text-slate-200 text-sm">{def.name}</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">Phase {p.phase} • Lv {p.level}</p>
                </div>
              </div>
              
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  movePlantToShelf(p.id, shelfIndex, spotIndex);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded font-mono text-xs transition-all border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              >
                Place
              </motion.button>
            </div>
           )
        })}
      </div>
    </div>
  );
}

function PlantDetail({ plantId, onClose }: { plantId: string, onClose: () => void }) {
  const { state, upgradePlant, sellPlant, tapPlant, waterPlant, movePlantToInventory } = useGame();
  const plant = state.plants.find((p) => p.id === plantId);
  const [clickScale, setClickScale] = useState(1);
  const [floatingNotes, setFloatingNotes] = useState<{ id: number, x: number, y: number, text: string, color: string }[]>([]);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [imgError, setImgError] = useState(false);

  if (!plant) {
    onClose();
    return null;
  }

  const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
  const Icon = def.icon;
  const upgradeCost = getUpgradeCost(def.baseCost, plant.level);
  const production = getProduction(def.baseProduction, plant.level);
  const canAfford = state.gold >= upgradeCost;
  
  const phase = plant.phase; // 0,1,2,3
  const spriteIndex = def.spriteIndex || 0;
  const col = (spriteIndex % 2) * 4 + phase;
  const row = Math.floor(spriteIndex / 2);
  
  const duration = phase < 3 ? PHASE_DURATIONS_MS[phase] : 1;
  const progressPercent = phase < 3 ? (plant.phaseProgress / duration) * 100 : 100;
  
  const remaining = Math.max(0, duration - plant.phaseProgress);
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const timeStr = `${m}:${s.toString().padStart(2, '0')}`;

  const sprite = spriteData.sprites.find(s => s && s.col === col && s.row === row);
  
  let bgStyle: React.CSSProperties = {};
  if (sprite) {
    const pX = (sprite.x / (spriteData.fullWidth - sprite.width)) * 100;
    const pY = (sprite.y / (spriteData.fullHeight - sprite.height)) * 100;
    
    // Fixed scale so plants grow proportionally
    const phaseScales = [0.55, 0.65, 0.75, 0.8]; // Slightly larger than Garden
    const baseFixedScale = phaseScales[phase] || 0.8;
    const fixedScale = baseFixedScale * (isUpgrading ? 1.15 : 1);
    
    bgStyle = {
      backgroundImage: `url('${GARDEN_SHEET_PATH}')`,
      backgroundSize: `${(spriteData.fullWidth / sprite.width) * 100}% ${(spriteData.fullHeight / sprite.height) * 100}%`,
      backgroundPosition: `${pX}% ${pY}%`,
      width: `${sprite.width * fixedScale}px`,
      height: `${sprite.height * fixedScale}px`,
      transformOrigin: 'bottom center',
    };
  } else {
    const posX = (col / 7) * 100;
    const posY = (row / 3) * 100;
    bgStyle = {
       backgroundImage: `url('${GARDEN_SHEET_PATH}')`,
       backgroundSize: '800% 400%',
       backgroundPosition: `${posX}% ${posY}%`,
       width: '160px',
       height: '160px',
       transformOrigin: 'bottom center',
       transform: isUpgrading ? 'scale(1.15)' : `scale(${1 + phase * 0.05})`
    };
  }

  const handleMash = (e: React.PointerEvent) => {
    tapPlant(plantId);
    
    const id = Date.now() + Math.random();
    let text = "";
    let color = "";
    
    if (phase === 3) {
       const value = def.baseClick * plant.level;
       text = `+${value}`;
       color = "text-amber-400";
    } else {
       text = "+5s";
       color = "text-emerald-400";
    }

    const newNote = { id, x: e.clientX, y: e.clientY, text, color };
    setFloatingNotes(prev => [...prev, newNote]);
    setTimeout(() => {
      setFloatingNotes(prev => prev.filter(n => n.id !== id));
    }, 1000);

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;

    confetti({
      particleCount: 8 + Math.floor(Math.random() * 6),
      spread: 80,
      origin: { x, y },
      colors: phase === 3 ? ['#fcd34d', '#f59e0b', '#d97706', '#ffeebb'] : ['#34d399', '#10b981', '#059669', '#a7f3d0'],
      disableForReducedMotion: true,
      zIndex: 1000,
      startVelocity: 15 + Math.random() * 10,
      gravity: 0.6,
      ticks: 80,
      shapes: ['circle'],
      scalar: 0.5 + Math.random() * 0.3,
    });

    setClickScale(1.1);
    setTimeout(() => setClickScale(1), 50);
  };

  const handleUpgrade = () => {
    if (canAfford) {
      setIsUpgrading(true);
      upgradePlant(plantId);
      setTimeout(() => setIsUpgrading(false), 500);
    }
  };
  
  const handleWater = () => {
     waterPlant(plantId);
     confetti({
      particleCount: 20,
      spread: 40,
      colors: ['#38bdf8', '#0ea5e9', '#0284c7', '#bae6fd']
     });
  };
  
  const now = Date.now();
  const canWater = phase < 3 && (!plant.lastWatered || (now - plant.lastWatered) >= 5 * 60 * 1000);
  const isFullyGrown = phase === 3;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="flex w-full items-center justify-between mb-4">
        <div>
          <h2 className="text-sm tracking-[0.2em] font-light text-slate-200 uppercase">{def.name}</h2>
          <div className="text-[10px] tracking-widest text-amber-500 uppercase mt-1">
             {isFullyGrown ? `Level ${plant.level} • Mature` : `Phase ${phase} • Growing`}
          </div>
        </div>
        
        <div className="flex flex-col items-end">
          {isFullyGrown ? (
            <>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Production</span>
              <span className="font-mono text-amber-200 flex items-center gap-1">
                {production} <small className="text-[10px] opacity-50">G/s</small>
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 items-center flex gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> Time Left</span>
              <span className="font-mono tracking-widest text-emerald-300">
                {timeStr}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="relative my-8">
        <AnimatePresence>
          {floatingNotes.map(note => (
            <motion.div
              key={note.id}
              initial={{ opacity: 1, y: 0, x: note.x - (window.innerWidth / 2) }}
              animate={{ opacity: 0, y: -100 }}
              exit={{ opacity: 0 }}
              style={{ position: 'absolute', pointerEvents: 'none', zIndex: 100 }}
              className={cn(note.color, "font-mono font-bold text-lg")}
            >
              {note.text}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {/* Growth Progress Ring */}
        {!isFullyGrown && (
           <svg className="absolute inset-0 w-full h-full transform -rotate-90 pointer-events-none opacity-40 scale-[1.3]" viewBox="0 0 100 100">
             <circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff1a" strokeWidth="2" />
             <circle cx="50" cy="50" r="45" fill="none" stroke="#10b981" strokeWidth="4" strokeDasharray={`${progressPercent * 2.827} 282.7`} className="transition-all duration-1000" />
           </svg>
        )}
        
        <motion.button 
          animate={{ 
            scale: clickScale,
            filter: isUpgrading ? 'brightness(1.5) saturate(1.5)' : 'brightness(1) saturate(1)',
          }}
          onPointerDown={handleMash}
          className={cn(
            "relative w-48 h-48 rounded-full border border-white/10 bg-gradient-to-b from-white/5 to-transparent flex items-center justify-center transition-all shadow-[inset_0_0_30px_rgba(255,255,255,0.02)]",
            def.color,
            isUpgrading && "shadow-[0_0_50px_rgba(251,113,133,0.5)]"
          )}
        >
          <div className={cn(
            "absolute inset-0 rounded-full transition-opacity duration-500 blur-2xl pointer-events-none",
            isUpgrading ? "bg-amber-400 opacity-40" : "bg-amber-500/10 opacity-100"
          )} />
          
          {!imgError && (
            <img 
              src={GARDEN_SHEET_PATH} 
              className="hidden" 
              onError={() => setImgError(true)} 
              alt=""
            />
          )}

          {!imgError ? (
            <div 
              className="relative z-10 transition-transform duration-300"
              style={bgStyle}
            />
          ) : (
            <Icon size={80} strokeWidth={1} className={cn(
              "drop-shadow-lg relative z-10 transition-transform duration-300",
              isUpgrading && "scale-110"
            )} />
          )}

        </motion.button>
      </div>

      <p className="text-[10px] text-amber-500/50 uppercase tracking-widest mb-4">
        {isFullyGrown ? "Tap to collect gold" : "Tap to accelerate growth"}
      </p>

      <div className="w-full flex gap-3 mb-3">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            sellPlant(plantId);
            onClose();
          }}
          className="p-4 rounded-xl bg-rose-950/20 text-rose-500/70 border border-rose-900/30 flex items-center justify-center hover:bg-rose-950/40 hover:text-rose-400 transition-colors"
        >
          <Trash2 size={20} strokeWidth={1.5} />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
             movePlantToInventory(plantId);
             onClose();
          }}
          className="flex-1 flex items-center justify-center gap-2 p-4 rounded-xl font-mono text-xs uppercase tracking-widest transition-all border bg-[#633f18] border-white/10 text-orange-200 hover:bg-[#7a4f21]"
        >
          <Archive size={16} /> Stash
        </motion.button>

        {!isFullyGrown && (
          <motion.button
            whileTap={canWater ? { scale: 0.95 } : {}}
            disabled={!canWater}
            onClick={handleWater}
            className={cn(
              "flex flex-col items-center justify-center px-6 py-2 rounded-xl font-mono text-xs uppercase tracking-widest transition-all border",
              canWater
                ? "bg-sky-500/10 border-sky-500/30 text-sky-400 hover:bg-sky-500/20 shadow-[0_0_15px_rgba(14,165,233,0.1)]"
                : "bg-black/40 border-white/5 text-slate-600"
            )}
          >
            <Droplets size={16} strokeWidth={1.5} className="mb-1" />
            WATER
          </motion.button>
        )}
      </div>
      
      {isFullyGrown && (
         <motion.button
            whileTap={canAfford ? { scale: 0.95 } : {}}
            disabled={!canAfford}
            onClick={handleUpgrade}
            className={cn(
              "w-full flex items-center justify-center gap-3 p-4 rounded-xl font-mono text-xs uppercase tracking-widest transition-all border",
              canAfford
                ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.1)]"
                : "bg-black/40 border-white/5 text-slate-600"
            )}
          >
            <ArrowUpCircle size={16} strokeWidth={1.5} className={isUpgrading ? "animate-bounce" : ""} />
            <span>{isUpgrading ? "Evolving..." : "Evolve Production"}</span>
            <span className="mx-2 opacity-30">|</span>
            <span className="flex items-center gap-1">
              {upgradeCost} <Coins size={14} className={canAfford ? "text-amber-400" : "text-slate-600"} />
            </span>
          </motion.button>
      )}
    </div>
  );
}
