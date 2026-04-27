import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useGame } from '../lib/GameContext';
import {
  PLANT_TYPES,
  getUpgradeCost,
  getProduction,
  getClickReward,
  getPlantUnlockLevel,
  PHASE_DURATIONS_MS,
  TAP_GROWTH_ACCELERATION_MS,
  WATER_COOLDOWN_MS,
} from '../constants';
import { Coins, X, ArrowUpCircle, Trash2, Droplets, Archive, Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { GARDEN_SHEET_PATH, getGardenSpriteStyle } from '../lib/sprites';
import { useGardenI18n } from '../lib/i18n';

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
        className="garden-glass-sheet fixed bottom-0 left-0 right-0 bg-[#22221d]/95 backdrop-blur-xl border-t border-[#c73838] shadow-[0_0_50px_rgba(0,0,0,0.8)] rounded-t-[32px] z-40 max-h-[85vh] flex flex-col items-center pb-safe-offset-4"
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

function PlantThumb({ spriteIndex, phase = 3 }: { spriteIndex: number, phase?: number }) {
  return (
    <div className="w-12 h-12 flex items-end justify-center bg-black/35 rounded-lg border border-white/5 overflow-hidden">
      <div style={getGardenSpriteStyle(spriteIndex, phase, 0.24)} />
    </div>
  );
}

function Shop({ shelfIndex, spotIndex, onClose }: { shelfIndex: number, spotIndex: number, onClose: () => void }) {
  const { state, buyPlant, unlockedPlants, movePlantToShelf } = useGame();
  const { t } = useGardenI18n();
  const [tab, setTab] = useState<'shop' | 'inventory'>('shop');

  const availablePlants = Object.values(PLANT_TYPES);
  const inventoryPlants = state.plants.filter(p => p.spotIndex === -1);

  return (
    <div className="flex flex-col w-full h-full max-h-[60vh]">
      <div className="flex w-full bg-black/20 rounded-xl p-1 mb-6 border border-white/5">
        <button 
          onClick={() => setTab('shop')} 
          className={cn("flex-1 py-2 text-xs tracking-widest uppercase rounded-lg transition-colors", tab === 'shop' ? 'bg-amber-500/20 text-amber-400 font-medium' : 'text-slate-500 hover:text-slate-300')}
        >
          {t('shop.seedShop')}
        </button>
        <button 
          onClick={() => setTab('inventory')} 
          className={cn("flex-1 py-2 text-xs tracking-widest uppercase rounded-lg transition-colors flex items-center justify-center gap-2", tab === 'inventory' ? 'bg-amber-500/20 text-amber-400 font-medium' : 'text-slate-500 hover:text-slate-300')}
        >
          <Archive size={14} /> 
          {t('shop.inventory', { count: inventoryPlants.length })}
        </button>
      </div>
      
      <div className="overflow-y-auto w-full space-y-3 pb-8 pr-2 -mr-2">
        {tab === 'shop' && availablePlants.map((plant) => {
          const isUnlocked = unlockedPlants.includes(plant.id);
          const canAfford = state.gold >= plant.baseCost;
          const canBuy = isUnlocked && canAfford;
          const unlockLevel = getPlantUnlockLevel(plant.id);

          return (
            <div key={plant.id} className={cn(
              "flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md",
              !isUnlocked && "bg-black/25 border-white/5",
            )}>
              <div className="flex items-center gap-4">
                <div className={cn(!isUnlocked && "grayscale opacity-55")}>
                  <PlantThumb spriteIndex={plant.spriteIndex} />
                </div>
                <div>
                  <h3 className={cn("font-medium text-sm", isUnlocked ? "text-slate-200" : "text-slate-500")}>
                    {t(`plant.${plant.id}`)}
                  </h3>
                  <p className={cn("text-[10px] font-mono", isUnlocked ? "text-amber-500/70" : "text-slate-500")}>
                    {isUnlocked
                      ? t('shop.yields', { amount: plant.baseProduction })
                      : t('shop.unlockAt', { level: unlockLevel })}
                  </p>
                </div>
              </div>
              
              <motion.button
                whileTap={canBuy ? { scale: 0.95 } : {}}
                disabled={!canBuy}
                onClick={() => {
                  if (!canBuy) return;
                  buyPlant(plant.id as any, shelfIndex, spotIndex);
                  onClose();
                }}
                className={cn(
                  "min-h-[44px] flex items-center gap-1.5 px-4 py-2 rounded font-mono text-xs transition-all border",
                  canBuy 
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]" 
                    : "bg-black/40 border-white/5 text-slate-600 cursor-not-allowed"
                )}
              >
                {isUnlocked ? (
                  <>
                    {plant.baseCost} <Coins size={12} className={canBuy ? "text-amber-400" : "text-slate-600"} />
                  </>
                ) : (
                  <>
                    <Lock size={12} /> {t('label.levelShort')} {unlockLevel}
                  </>
                )}
              </motion.button>
            </div>
          );
        })}

        {tab === 'inventory' && inventoryPlants.length === 0 && (
           <div className="text-center text-slate-500 py-10 text-sm tracking-wide font-light">
             {t('shop.emptyInventory')}
           </div>
        )}

        {tab === 'inventory' && inventoryPlants.map((p) => {
           const def = PLANT_TYPES[p.type] || PLANT_TYPES.daisy;
           
           return (
            <div key={p.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md">
              <div className="flex items-center gap-4">
                <PlantThumb spriteIndex={def.spriteIndex} phase={p.phase} />
                <div>
                  <h3 className="font-medium text-slate-200 text-sm">{t(`plant.${def.id}`)}</h3>
                  <p className="text-[10px] text-zinc-500 font-mono">{t('shop.phaseLevel', { phase: p.phase, level: p.level })}</p>
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
                {t('shop.place')}
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
  const { t } = useGardenI18n();
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
  const duration = phase < 3 ? PHASE_DURATIONS_MS[phase] : 1;
  const progressPercent = phase < 3 ? (plant.phaseProgress / duration) * 100 : 100;
  
  const remaining = Math.max(0, duration - plant.phaseProgress);
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const timeStr = `${m}:${s.toString().padStart(2, '0')}`;
  const tapAccelerationSeconds = Math.round(TAP_GROWTH_ACCELERATION_MS / 1000);

  const phaseScales = [0.55, 0.65, 0.75, 0.8];
  const bgStyle = getGardenSpriteStyle(spriteIndex, phase, (phaseScales[phase] || 0.8) * (isUpgrading ? 1.15 : 1));

  const handleMash = (e: React.PointerEvent) => {
    tapPlant(plantId);
    
    const id = Date.now() + Math.random();
    let text = "";
    let color = "";
    
    if (phase === 3) {
       const value = getClickReward(def.baseClick, plant.level);
       text = `+${value}`;
       color = "text-amber-400";
    } else {
       text = `+${tapAccelerationSeconds}s`;
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
  const canWater = phase < 3 && (!plant.lastWatered || (now - plant.lastWatered) >= WATER_COOLDOWN_MS);
  const isFullyGrown = phase === 3;

  return (
    <div className="flex flex-col items-center w-full">
      <div className="flex w-full items-center justify-between mb-4">
        <div>
          <h2 className="text-sm tracking-[0.2em] font-light text-slate-200 uppercase">{t(`plant.${def.id}`)}</h2>
          <div className="text-[10px] tracking-widest text-amber-500 uppercase mt-1">
             {isFullyGrown
               ? t('plantDetail.mature', { level: plant.level })
               : t('plantDetail.growing', { phase })}
          </div>
        </div>
        
        <div className="flex flex-col items-end">
          {isFullyGrown ? (
            <>
              <span className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{t('plantDetail.production')}</span>
              <span className="font-mono text-amber-200 flex items-center gap-1">
                {production} <small className="text-[10px] opacity-50">G/s</small>
              </span>
            </>
          ) : (
            <>
              <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1 items-center flex gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> {t('plantDetail.timeLeft')}</span>
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
        {isFullyGrown ? t('plantDetail.tapGold') : t('plantDetail.tapGrowth')}
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
          <Archive size={16} /> {t('plantDetail.stash')}
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
            {t('plantDetail.water')}
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
            <span>{isUpgrading ? t('plantDetail.evolving') : t('plantDetail.evolve')}</span>
            <span className="mx-2 opacity-30">|</span>
            <span className="flex items-center gap-1">
              {upgradeCost} <Coins size={14} className={canAfford ? "text-amber-400" : "text-slate-600"} />
            </span>
          </motion.button>
      )}
    </div>
  );
}
