import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useGame } from '../lib/GameContext';
import {
  PLANT_TYPES,
  formatGardenGoldAmount,
  formatGardenRate,
  getUpgradeCost,
  getProduction,
  getClickReward,
  getClickXpReward,
  getPlantUnlockLevel,
  PHASE_DURATIONS_MS,
  TAP_GROWTH_ACCELERATION_MS,
  WATER_COOLDOWN_MS,
  GARDEN_TAP_REWARD_COOLDOWN_MS,
} from '../constants';
import { ChevronLeft, ChevronRight, Coins, X, ArrowUpCircle, Trash2, Droplets, Archive, Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { GARDEN_SHEET_PATH, getGardenSpriteStyle } from '../lib/sprites';
import { useGardenI18n } from '../lib/i18n';

interface BottomPanelProps {
  spot: { shelfIndex: number, spotIndex: number, plantId?: string } | null;
  onClose: () => void;
}

export function BottomPanel({ spot, onClose }: BottomPanelProps) {
  const { state } = useGame();
  const [activePlantId, setActivePlantId] = useState(spot?.plantId || '');
  const placedPlants = React.useMemo(
    () => [...state.plants]
      .filter((plant) => plant.shelfIndex >= 0 && plant.spotIndex >= 0)
      .sort((left, right) => left.shelfIndex - right.shelfIndex || left.spotIndex - right.spotIndex || left.id.localeCompare(right.id)),
    [state.plants],
  );
  const activePlantIndex = placedPlants.findIndex((plant) => plant.id === activePlantId);
  const activeSpot = activePlantId && activePlantIndex >= 0
    ? {
        shelfIndex: placedPlants[activePlantIndex].shelfIndex,
        spotIndex: placedPlants[activePlantIndex].spotIndex,
        plantId: activePlantId,
      }
    : spot;

  React.useEffect(() => {
    setActivePlantId(spot?.plantId || '');
  }, [spot?.plantId]);

  const selectRelativePlant = (direction: -1 | 1) => {
    if (activePlantIndex < 0 || placedPlants.length < 2) return;
    const nextIndex = (activePlantIndex + direction + placedPlants.length) % placedPlants.length;
    setActivePlantId(placedPlants[nextIndex].id);
  };

  if (!spot) return null;

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="glass-scrim fixed inset-0 z-30"
      />
      
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300, bounce: 0 }}
        className="garden-glass-sheet fixed bottom-0 left-0 right-0 z-40 max-h-[85vh] flex flex-col items-center pb-safe-offset-4 border-t"
      >
        <div className="my-4 h-1 w-12 rounded-full bg-[color:var(--line-strong)]" />
        
        <button onClick={onClose} className="garden-icon-button absolute right-4 top-4 transition">
          <X size={16} />
        </button>

        <div className="w-full px-6 pb-8">
          {activeSpot.plantId ? (
            <PlantDetail
              plantId={activeSpot.plantId}
              onClose={onClose}
              onNavigate={placedPlants.length > 1 ? selectRelativePlant : undefined}
              plantIndex={activePlantIndex}
              plantCount={placedPlants.length}
            />
          ) : (
            <Shop shelfIndex={activeSpot.shelfIndex} spotIndex={activeSpot.spotIndex} onClose={onClose} />
          )}
        </div>
      </motion.div>
    </>
  );
}

function PlantThumb({ spriteIndex, phase = 3 }: { spriteIndex: number, phase?: number }) {
  return (
    <div className="garden-card-row flex h-12 w-12 items-end justify-center overflow-hidden rounded-lg">
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
      <div className="garden-segmented-control mb-6 flex w-full p-1">
        <button 
          onClick={() => setTab('shop')} 
          className={cn("garden-segmented-button flex-1 px-2 py-2 text-xs uppercase tracking-[0.12em] transition-colors", tab === 'shop' && 'active')}
        >
          {t('shop.seedShop')}
        </button>
        <button 
          onClick={() => setTab('inventory')} 
          className={cn("garden-segmented-button flex flex-1 items-center justify-center gap-2 px-2 py-2 text-xs uppercase tracking-[0.12em] transition-colors", tab === 'inventory' && 'active')}
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
              "garden-card-row flex items-center justify-between gap-3 rounded-lg p-4",
              !isUnlocked && "opacity-70",
            )}>
              <div className="flex items-center gap-4">
                <div className={cn(!isUnlocked && "grayscale opacity-55")}>
                  <PlantThumb spriteIndex={plant.spriteIndex} />
                </div>
                <div>
                  <h3 className="text-sm font-black">
                    {t(`plant.${plant.id}`)}
                  </h3>
                  <p className="font-mono text-[10px]">
                    {isUnlocked
                      ? t('shop.yields', { amount: formatGardenRate(plant.baseProduction) })
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
                  "garden-action-button font-mono text-xs transition-all",
                  canBuy ? "secondary" : "disabled",
                )}
              >
                {isUnlocked ? (
                  <>
                    {formatGardenGoldAmount(plant.baseCost)} <Coins size={12} className={canBuy ? "text-amber-400" : "text-slate-600"} />
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
           <div className="py-10 text-center text-sm font-light tracking-wide text-[color:var(--muted)]">
             {t('shop.emptyInventory')}
           </div>
        )}

        {tab === 'inventory' && inventoryPlants.map((p) => {
           const def = PLANT_TYPES[p.type] || PLANT_TYPES.daisy;
           
           return (
            <div key={p.id} className="garden-card-row flex items-center justify-between gap-3 rounded-lg p-4">
              <div className="flex items-center gap-4">
                <PlantThumb spriteIndex={def.spriteIndex} phase={p.phase} />
                <div>
                  <h3 className="text-sm font-black">{t(`plant.${def.id}`)}</h3>
                  <p className="font-mono text-[10px]">{t('shop.phaseLevel', { phase: p.phase, level: p.level })}</p>
                </div>
              </div>
              
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  movePlantToShelf(p.id, shelfIndex, spotIndex);
                  onClose();
                }}
                className="garden-action-button primary font-mono text-xs transition-all"
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

function PlantDetail({
  plantId,
  onClose,
  onNavigate,
  plantIndex = 0,
  plantCount = 1,
}: {
  plantId: string,
  onClose: () => void,
  onNavigate?: (direction: -1 | 1) => void,
  plantIndex?: number,
  plantCount?: number,
}) {
  const { state, upgradePlant, sellPlant, tapPlant, waterPlant, movePlantToInventory } = useGame();
  const { t } = useGardenI18n();
  const plant = state.plants.find((p) => p.id === plantId);
  const [clickScale, setClickScale] = useState(1);
  const [floatingNotes, setFloatingNotes] = useState<{ id: number, x: number, y: number, text: string, color: string }[]>([]);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [imgError, setImgError] = useState(false);
  const swipeStart = React.useRef<{ x: number; y: number } | null>(null);

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
    const canTap = !plant.lastTapped || Date.now() - plant.lastTapped >= GARDEN_TAP_REWARD_COOLDOWN_MS;
    if (!canTap) return;
    tapPlant(plantId);

    const id = Date.now() + Math.random();
    let text = "";
    let color = "";
    
    if (phase === 3) {
       const canReward = !plant.lastTapped || Date.now() - plant.lastTapped >= GARDEN_TAP_REWARD_COOLDOWN_MS;
       if (!canReward) return;
       const value = getClickReward(def.baseClick, plant.level);
       const xp = getClickXpReward(def.baseXp, plant.level);
       text = `+${formatGardenGoldAmount(value)} · +${xp} XP`;
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
  const canNavigate = !!onNavigate && plantCount > 1;
  const handleTouchStart = (event: React.TouchEvent) => {
    if ((event.target as HTMLElement).closest('button, input, select, textarea')) return;
    const touch = event.touches[0];
    swipeStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const handleTouchEnd = (event: React.TouchEvent) => {
    if (!canNavigate || !swipeStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipeStart.current.x;
    const dy = touch.clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(dx) < 46 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    onNavigate(dx < 0 ? 1 : -1);
  };

  return (
    <div className="flex flex-col items-center w-full" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="flex w-full items-center justify-between mb-4">
        {canNavigate && (
          <button
            type="button"
            className="garden-icon-button mr-2 shrink-0"
            onClick={() => onNavigate(-1)}
            aria-label={t('plantDetail.previous')}
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.14em]">{t(`plant.${def.id}`)}</h2>
          <div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]">
             {isFullyGrown
               ? t('plantDetail.mature', { level: plant.level })
               : t('plantDetail.growing', { phase })}
          </div>
          {canNavigate && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]">
              {t('plantDetail.position', { current: plantIndex + 1, total: plantCount })}
            </div>
          )}
        </div>
        
        <div className="flex flex-col items-end">
          {isFullyGrown ? (
            <>
              <span className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]">{t('plantDetail.production')}</span>
              <span className="flex items-center gap-1 font-mono text-[color:var(--ink)]">
                {formatGardenRate(production)} <small className="text-[10px] opacity-60">G/s</small>
              </span>
            </>
          ) : (
            <>
              <span className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]"><div className="h-1.5 w-1.5 rounded-full bg-[color:var(--mint)] animate-pulse"/> {t('plantDetail.timeLeft')}</span>
              <span className="font-mono tracking-widest text-[color:var(--leaf)]">
                {timeStr}
              </span>
            </>
          )}
        </div>
        {canNavigate && (
          <button
            type="button"
            className="garden-icon-button ml-2 shrink-0"
            onClick={() => onNavigate(1)}
            aria-label={t('plantDetail.next')}
          >
            <ChevronRight size={18} />
          </button>
        )}
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

      <p className="mb-4 text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {isFullyGrown ? t('plantDetail.tapGold') : t('plantDetail.tapGrowth')}
      </p>

      <div className="w-full flex gap-3 mb-3">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            sellPlant(plantId);
            onClose();
          }}
          className="garden-action-button danger min-w-[54px] p-4 transition-colors"
        >
          <Trash2 size={20} strokeWidth={1.5} />
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
             movePlantToInventory(plantId);
             onClose();
          }}
          className="garden-action-button secondary flex-1 p-4 font-mono text-xs uppercase tracking-[0.12em] transition-all"
        >
          <Archive size={16} /> {t('plantDetail.stash')}
        </motion.button>

        {!isFullyGrown && (
          <motion.button
            whileTap={canWater ? { scale: 0.95 } : {}}
            disabled={!canWater}
            onClick={handleWater}
            className={cn(
              "garden-action-button flex-col px-6 py-2 font-mono text-xs uppercase tracking-[0.12em] transition-all",
              canWater ? "info" : "disabled",
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
              "garden-action-button w-full gap-3 p-4 font-mono text-xs uppercase tracking-[0.12em] transition-all",
              canAfford ? "secondary" : "disabled",
            )}
          >
            <ArrowUpCircle size={16} strokeWidth={1.5} className={isUpgrading ? "animate-bounce" : ""} />
            <span>{isUpgrading ? t('plantDetail.evolving') : t('plantDetail.evolve')}</span>
            <span className="mx-2 opacity-30">|</span>
            <span className="flex items-center gap-1">
              {formatGardenGoldAmount(upgradeCost)} <Coins size={14} className={canAfford ? "text-amber-400" : "text-slate-600"} />
            </span>
          </motion.button>
      )}
    </div>
  );
}
