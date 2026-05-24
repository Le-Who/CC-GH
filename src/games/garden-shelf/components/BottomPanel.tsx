import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  getGardenWaterCooldownMs,
  getGardenTapCooldownMs,
  getMatureWaterReward,
} from '../constants';
import { ChevronLeft, ChevronRight, Coins, X, ArrowUpCircle, Trash2, Droplets, Archive, Lock } from 'lucide-react';
import { cn } from '../lib/utils';
import { getGardenSpriteStyle } from '../lib/sprites';
import type { GardenAssetPaths } from '../lib/sprites';
import { useGardenI18n } from '../lib/i18n';
import { runGardenConfetti } from '../lib/effects';
import { useEscapeDismiss, useOutsideDismiss } from '../../../app/useDismissableLayer.js';

interface BottomPanelProps {
  spot: { shelfIndex: number, spotIndex: number, plantId?: string } | null;
  onClose: () => void;
  assetPaths: GardenAssetPaths;
}

const AVAILABLE_PLANTS = Object.values(PLANT_TYPES);

export function BottomPanel({ spot, onClose, assetPaths }: BottomPanelProps) {
  const { state } = useGame();
  const { t } = useGardenI18n();
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const closeButtonRef = React.useRef<HTMLButtonElement | null>(null);
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
  React.useEffect(() => {
    if (!spot) return undefined;
    const frame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [spot]);
  useEscapeDismiss(!!spot, onClose);
  useOutsideDismiss(!!spot, sheetRef, onClose);

  const selectRelativePlant = (direction: -1 | 1) => {
    if (activePlantIndex < 0 || placedPlants.length < 2) return;
    const nextIndex = (activePlantIndex + direction + placedPlants.length) % placedPlants.length;
    setActivePlantId(placedPlants[nextIndex].id);
  };

  if (!spot) return null;

  const isPlantDetail = !!activeSpot.plantId;
  const closeLabel = t(isPlantDetail ? 'plantDetail.close' : 'shop.close');

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <motion.button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="glass-scrim garden-sheet-scrim fixed inset-0 z-[180]"
      />
      
      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={t(isPlantDetail ? 'plantDetail.details' : 'shop.seedShop')}
        tabIndex={-1}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300, bounce: 0 }}
        className="garden-glass-sheet garden-bottom-sheet fixed bottom-0 left-0 right-0 z-[190] max-h-[85vh] flex flex-col items-center pb-safe-offset-4 border-t"
      >
        <div className="garden-sheet-grabber my-4 h-1 w-12 rounded-full bg-[color:var(--line-strong)]" />
        
        <button
          type="button"
          aria-label={closeLabel}
          ref={closeButtonRef}
          onClick={onClose}
          className="garden-icon-button garden-sheet-close absolute right-4 top-4 z-[200] h-14 w-14 transition"
        >
          <X size={16} />
        </button>

        <div className="garden-sheet-content w-full px-6 pb-8">
          {activeSpot.plantId ? (
            <PlantDetail
              plantId={activeSpot.plantId}
              onClose={onClose}
              onNavigate={placedPlants.length > 1 ? selectRelativePlant : undefined}
              plantIndex={activePlantIndex}
              plantCount={placedPlants.length}
              assetPaths={assetPaths}
            />
          ) : (
            <Shop shelfIndex={activeSpot.shelfIndex} spotIndex={activeSpot.spotIndex} onClose={onClose} assetPaths={assetPaths} />
          )}
        </div>
      </motion.div>
    </>,
    document.body,
  );
}

function PlantThumb({ spriteIndex, phase = 3, assetPaths }: { spriteIndex: number, phase?: number, assetPaths: GardenAssetPaths }) {
  return (
    <div className="garden-card-row flex h-12 w-12 items-end justify-center overflow-hidden rounded-lg">
      <div style={getGardenSpriteStyle(spriteIndex, phase, 0.24, assetPaths.sheet)} />
    </div>
  );
}

function Shop({ shelfIndex, spotIndex, onClose, assetPaths }: { shelfIndex: number, spotIndex: number, onClose: () => void, assetPaths: GardenAssetPaths }) {
  const { state, buyPlant, unlockedPlants, movePlantToShelf } = useGame();
  const { t } = useGardenI18n();
  const [tab, setTab] = useState<'shop' | 'inventory'>('shop');

  const inventoryPlants = React.useMemo(() => state.plants.filter((plant) => plant.spotIndex === -1), [state.plants]);

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
        {tab === 'shop' && AVAILABLE_PLANTS.map((plant) => {
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
                  <PlantThumb spriteIndex={plant.spriteIndex} assetPaths={assetPaths} />
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
                <PlantThumb spriteIndex={def.spriteIndex} phase={p.phase} assetPaths={assetPaths} />
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
  assetPaths,
}: {
  plantId: string,
  onClose: () => void,
  onNavigate?: (direction: -1 | 1) => void,
  plantIndex?: number,
  plantCount?: number,
  assetPaths: GardenAssetPaths,
}) {
  const { state, upgradePlant, sellPlant, tapPlant, waterPlant, movePlantToInventory } = useGame();
  const { t } = useGardenI18n();
  const plant = state.plants.find((p) => p.id === plantId);
  const [clickScale, setClickScale] = useState(1);
  const [tapPulse, setTapPulse] = useState(0);
  const [floatingNotes, setFloatingNotes] = useState<{ id: number, shift: number, text: string, tone: 'gold' | 'xp' | 'time' | 'care' | 'reward' }[]>([]);
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
  const bgStyle = getGardenSpriteStyle(spriteIndex, phase, (phaseScales[phase] || 0.8) * (isUpgrading ? 1.15 : 1), assetPaths.sheet);

  const handleMash = (e: React.PointerEvent) => {
    const canTap = !plant.lastTapped || Date.now() - plant.lastTapped >= getGardenTapCooldownMs(plant.phase);
    if (!canTap) return;
    tapPlant(plantId);

    const id = Date.now() + Math.random();
    const notes: { id: number, shift: number, text: string, tone: 'gold' | 'xp' | 'time' | 'care' | 'reward' }[] = [];
    
    if (phase === 3) {
       const value = getClickReward(def.baseClick, plant.level);
       const xp = getClickXpReward(def.baseXp, plant.level);
       notes.push(
        { id, shift: 0, text: `+${formatGardenGoldAmount(value)} G · +${xp} XP`, tone: 'reward' },
       );
    } else {
       notes.push({ id, shift: 0, text: `+${tapAccelerationSeconds}s`, tone: 'time' });
    }

    setTapPulse(id);
    setFloatingNotes(notes);
    setTimeout(() => {
      setFloatingNotes(prev => prev.filter(n => Math.floor(n.id) !== Math.floor(id)));
    }, 1150);

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (rect.left + rect.width / 2) / window.innerWidth;
    const y = (rect.top + rect.height / 2) / window.innerHeight;

    void runGardenConfetti({
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
    }, {
      particleCount: 5,
      ticks: 46,
      spread: 56,
    });

    setClickScale(0.94);
    setTimeout(() => setClickScale(1.08), 70);
    setTimeout(() => setClickScale(1), 180);
  };

  const handleUpgrade = () => {
    if (canAfford) {
      setIsUpgrading(true);
      upgradePlant(plantId);
      setTimeout(() => setIsUpgrading(false), 500);
    }
  };
  
  const handleWater = () => {
    if (!canWater) return;
    const id = Date.now() + Math.random();
    if (isFullyGrown) {
      const reward = getMatureWaterReward(def.baseClick, def.baseXp, plant.level);
      setTapPulse(id);
      setFloatingNotes([
        { id, shift: 0, text: `+${formatGardenGoldAmount(reward.gold)} G · +${reward.xp} XP`, tone: 'reward' },
      ]);
      setTimeout(() => {
        setFloatingNotes(prev => prev.filter(n => Math.floor(n.id) !== Math.floor(id)));
      }, 1250);
    }
    waterPlant(plantId);
    void runGardenConfetti({
      particleCount: isFullyGrown ? 26 : 20,
      spread: isFullyGrown ? 64 : 40,
      colors: isFullyGrown
        ? ['#fcd34d', '#86efac', '#f9a8d4', '#fff7ad']
        : ['#38bdf8', '#0ea5e9', '#0284c7', '#bae6fd'],
    }, {
      particleCount: isFullyGrown ? 10 : 8,
      ticks: 46,
    });
  };
  
  const now = Date.now();
  const isFullyGrown = phase === 3;
  const canWater = !plant.lastWatered || (now - plant.lastWatered) >= getGardenWaterCooldownMs(phase);
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
    <div className="garden-detail-panel flex flex-col items-center w-full" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="garden-detail-header mb-4 flex w-full items-start justify-between gap-4 pr-12">
        <div className="min-w-0">
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
        
        <div className="garden-detail-meta flex max-w-[48%] shrink-0 flex-col items-end text-right">
          {isFullyGrown ? (
            <>
              <span className="mb-1 text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]">{t('plantDetail.production')}</span>
              <span className="flex items-center gap-1 font-mono text-[color:var(--ink)]">
                {formatGardenRate(production)} <small className="text-[10px] opacity-60">{t('unit.goldPerSecond')}</small>
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
      </div>

      <div className="garden-detail-plant-stage">
        {canNavigate && (
          <button
            type="button"
            className="garden-icon-button garden-detail-nav"
            onClick={() => onNavigate(-1)}
            aria-label={t('plantDetail.previous')}
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <div className="garden-detail-plant-wrap relative flex h-52 w-52 shrink-0 items-center justify-center">
        <AnimatePresence>
          {floatingNotes.map(note => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 24, scale: 0.78 }}
              animate={{ opacity: [0, 1, 1, 0], y: -92, scale: [0.78, 1.08, 1] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.05, ease: "easeOut" }}
              style={{ left: `calc(50% + ${note.shift}px)` }}
              className={`garden-detail-floating-note ${note.tone}`}
            >
              {note.text}
            </motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>
          {tapPulse > 0 && (
            <motion.span
              key={tapPulse}
              className="garden-detail-tap-pulse"
              initial={{ opacity: 0.5, scale: 0.72 }}
              animate={{ opacity: 0, scale: 1.2 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.48, ease: "easeOut" }}
            />
          )}
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
            "garden-detail-plant-button relative w-48 h-48 rounded-full bg-gradient-to-b from-white/5 to-transparent flex items-center justify-center transition-all shadow-[inset_0_0_30px_rgba(255,255,255,0.02)]",
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
              src={assetPaths.sheet}
              className="hidden" 
              onError={() => setImgError(true)} 
              alt=""
            />
          )}

          {!imgError ? (
            <div 
              className={cn("garden-plant-sprite relative z-10 transition-transform duration-300", isFullyGrown && "garden-plant-grown")}
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
        {canNavigate && (
          <button
            type="button"
            className="garden-icon-button garden-detail-nav"
            onClick={() => onNavigate(1)}
            aria-label={t('plantDetail.next')}
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      <p className="garden-detail-hint mb-4 text-[10px] uppercase tracking-[0.14em] text-[color:var(--muted)]">
        {isFullyGrown ? t('plantDetail.tapGold') : t('plantDetail.tapGrowth')}
      </p>

      <div className="garden-detail-actions w-full flex gap-3 mb-3">
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

        <motion.button
          whileTap={canWater ? { scale: 0.95 } : {}}
          disabled={!canWater}
          onClick={handleWater}
          className={cn(
            "garden-action-button flex-col px-6 py-2 font-mono text-xs uppercase tracking-[0.12em] transition-all",
            canWater ? (isFullyGrown ? "care" : "info") : "disabled",
          )}
        >
          <Droplets size={16} strokeWidth={1.5} className="mb-1" />
          {isFullyGrown ? t('plantDetail.careWater') : t('plantDetail.water')}
        </motion.button>
      </div>
      
      {isFullyGrown && (
         <motion.button
            whileTap={canAfford ? { scale: 0.95 } : {}}
            disabled={!canAfford}
            onClick={handleUpgrade}
            className={cn(
              "garden-action-button garden-detail-evolve w-full gap-3 p-4 font-mono text-xs uppercase tracking-[0.12em] transition-all",
              canAfford ? "secondary" : "disabled",
            )}
          >
            <span className="garden-evolve-btn-label flex items-center gap-3">
              <ArrowUpCircle size={16} strokeWidth={1.5} className={isUpgrading ? "animate-bounce" : ""} />
              <span>{isUpgrading ? t('plantDetail.evolving') : t('plantDetail.evolve')}</span>
              <span className="mx-2 opacity-30">|</span>
            </span>
            <span className="flex items-center gap-1 garden-evolve-btn-cost">
              {formatGardenGoldAmount(upgradeCost)} <Coins size={14} className={canAfford ? "text-amber-400" : "text-slate-600"} />
            </span>
          </motion.button>
      )}
    </div>
  );
}
