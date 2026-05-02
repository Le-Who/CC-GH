import React, { useRef, useEffect, useMemo } from 'react';
import { useGame } from '../lib/GameContext';
import {
  MAX_SHELVES,
  SPOTS_PER_SHELF,
  PLANT_TYPES,
  SHELF_UNLOCK_COSTS,
  PHASE_DURATIONS_MS,
  TAP_GROWTH_ACCELERATION_MS,
  WATER_COOLDOWN_MS,
  formatGardenGoldAmount,
  getClickReward,
  getClickXpReward,
  getGardenTapCooldownMs,
} from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins, Droplets, Info } from 'lucide-react';
import { PlantData } from '../types';
import { cn } from '../lib/utils';
import { Lock } from 'lucide-react';
import { getGardenSpriteStyle } from '../lib/sprites';
import type { GardenAssetPaths } from '../lib/sprites';
import { useGardenI18n } from '../lib/i18n';

interface GardenProps {
  onSelectSpot: (shelfIndex: number, spotIndex: number, plantId?: string) => void;
  assetPaths: GardenAssetPaths;
}

const GARDEN_SHELVES = Array.from({ length: MAX_SHELVES }, (_, i) => i);
const GARDEN_SPOTS = Array.from({ length: SPOTS_PER_SHELF }, (_, i) => i);

export function Garden({ onSelectSpot, assetPaths }: GardenProps) {
  const { state, unlockShelf } = useGame();
  const { t } = useGardenI18n();
  const plantsBySpot = useMemo(() => {
    const map = new Map<string, PlantData>();
    for (const plant of state.plants) {
      map.set(`${plant.shelfIndex}:${plant.spotIndex}`, plant);
    }
    return map;
  }, [state.plants]);

  return (
    <div className="flex-1 h-full overflow-y-auto overflow-x-hidden p-6 space-y-20 pb-32 pt-36 no-scrollbar">
      {GARDEN_SHELVES.map((shelfIndex) => {
        const isUnlocked = shelfIndex < state.shelvesUnlocked;

        if (!isUnlocked) {
          // We only show the next locked shelf
          if (shelfIndex === state.shelvesUnlocked) {
             const unlockCost = SHELF_UNLOCK_COSTS[shelfIndex] || 999999;
             const canAfford = state.gold >= unlockCost;

             return (
               <div key={shelfIndex} className="relative mt-8">
                 <div className="garden-floating-lock absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-lg p-6 text-center">
                   <Lock className="mb-2 h-8 w-8 text-[color:var(--coral)]" strokeWidth={1.5} />
                   <p className="mb-4 text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                     {t('garden.expand')}
                   </p>
                   <motion.button 
                     whileTap={canAfford ? { scale: 0.95 } : {}}
                     disabled={!canAfford}
                     onClick={() => {
                        if (canAfford) {
                          unlockShelf();
                        }
                     }}
                     className={cn(
                       "garden-action-button w-full font-mono text-sm transition-all",
                       canAfford ? "danger" : "disabled",
                     )}
                   >
                     {formatGardenGoldAmount(unlockCost)} <Coins size={14} className={canAfford ? "text-rose-400" : "text-slate-500"} />
                   </motion.button>
                 </div>
                 <Shelf visualsOnly assetPaths={assetPaths} />
               </div>
             );
          }
          return null; // hide other locked shelves
        }

        return (
          <div key={shelfIndex} className="relative mt-8">
            <div className="relative z-30 flex justify-evenly items-end h-24 px-2 translate-y-1">
              {GARDEN_SPOTS.map((spotIndex) => {
                const plant = plantsBySpot.get(`${shelfIndex}:${spotIndex}`);

                return (
                  <Spot
                    key={spotIndex} 
                    plant={plant} 
                    assetPaths={assetPaths}
                    onClick={() => onSelectSpot(shelfIndex, spotIndex, plant?.id)} 
                  />
                );
              })}
            </div>
            <Shelf assetPaths={assetPaths} />
          </div>
        );
      })}
    </div>
  );
}

function Shelf({ visualsOnly = false, assetPaths }: { visualsOnly?: boolean, assetPaths: GardenAssetPaths }) {
  return (
    <div
      className={cn(
        "relative z-10 w-[98%] max-w-[385px] mx-auto -mt-3 pointer-events-none",
        visualsOnly && "opacity-40",
      )}
      style={{ aspectRatio: '385 / 77' }}
    >
      <img
        src={assetPaths.shelf}
        alt=""
        draggable={false}
        className="absolute inset-0 h-full w-full object-fill drop-shadow-[0_18px_18px_rgba(0,0,0,0.45)]"
      />
    </div>
  );
}

function PhaseEffects({ phase, color }: { phase: number, color: string }) {
  if (phase === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-visible z-[-1] mb-8">
      {/* Background glowing aura based on phase */}
      <div
        className={cn("absolute rounded-full blur-[20px] transition-all duration-1000", color)}
        style={{ 
           width: `${40 + phase * 20}px`, 
           height: `${40 + phase * 20}px`, 
           backgroundColor: 'currentColor',
           opacity: 0.1 + phase * 0.1
        }}
      />
    </div>
  );
}

const Spot: React.FC<{ plant?: PlantData, onClick: () => void, assetPaths: GardenAssetPaths }> = ({ plant, onClick, assetPaths }) => {
  const { tapPlant } = useGame();
  const { t } = useGardenI18n();
  const [imgError, setImgError] = React.useState(false);
  const [isPressing, setIsPressing] = React.useState(false);
  const [tapPulse, setTapPulse] = React.useState(0);
  const [floatingTexts, setFloatingTexts] = React.useState<{id: string, text: string, type: 'gold' | 'xp' | 'time', x: number}[]>([]);
  
  const pressStartTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const pressStartTime = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (pressStartTimer.current) clearTimeout(pressStartTimer.current);
      if (longPressTimer.current) clearTimeout(longPressTimer.current);
    };
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!plant) return;
    pressStartTime.current = Date.now();
    
    // Wait 500ms before starting visual press indicator
    pressStartTimer.current = setTimeout(() => {
      setIsPressing(true);
      
      // Wait another 1000ms for the full 1.5s long press
      longPressTimer.current = setTimeout(() => {
        setIsPressing(false);
        pressStartTime.current = 0; // Prevent tap action on release
        onClick(); // Open menu
      }, 1000);
    }, 500);
  };

  const cancelPress = (e?: React.PointerEvent) => {
    if (pressStartTimer.current) clearTimeout(pressStartTimer.current);
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    
    setIsPressing(false);
    
    // If we released before long press finished
    if (pressStartTime.current > 0) {
      const duration = Date.now() - pressStartTime.current;
      pressStartTime.current = 0;
      
      // If duration is under 500ms, it's considered a tap
      if (duration < 500 && plant) {
        const now = Date.now();
        const canTap = !plant.lastTapped || now - plant.lastTapped >= getGardenTapCooldownMs(plant.phase);
        if (!canTap) return;
        tapPlant(plant.id);
        
        const id = Math.random().toString();
        setTapPulse(now);
        
        if (e && e.currentTarget) {
            const btn = e.currentTarget as HTMLElement;
            btn.style.transform = 'scale(0.92)';
            setTimeout(() => { btn.style.transform = ''; }, 120);
        }

        if (plant.phase === 3) {
            const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
            const amount = getClickReward(def.baseClick, plant.level);
            const xp = getClickXpReward(def.baseXp, plant.level);
            setFloatingTexts(prev => [
              ...prev,
              { id: `${id}-gold`, text: `+${formatGardenGoldAmount(amount)} G`, type: 'gold', x: -18 },
              { id: `${id}-xp`, text: `+${xp} XP`, type: 'xp', x: 22 },
            ]);
        } else {
            setFloatingTexts(prev => [...prev, { id, text: `+${tapAccelerationSeconds}s`, type: 'time', x: 0 }]);
        }
        
        setTimeout(() => {
            setFloatingTexts(prev => prev.filter(ft => !ft.id.startsWith(id)));
        }, 1150);
      }
    }
  };

  const isPlant = !!plant;
  const def = isPlant ? (PLANT_TYPES[plant.type] || PLANT_TYPES.daisy) : PLANT_TYPES.daisy;
  const Icon = def.icon;
  
  const scale = isPlant ? 1 + Math.min((plant.level - 1) * 0.08, 0.8) : 1;
  const baseSize = 40;

  const phase = isPlant ? plant.phase : 0; 
  const spriteIndex = def.spriteIndex || 0;
  const duration = phase < 3 ? PHASE_DURATIONS_MS[phase] : 1;
  const remaining = isPlant ? Math.max(0, duration - plant.phaseProgress) : 0;
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const timeStr = phase < 3 ? `${m}:${s.toString().padStart(2, '0')}` : '';
  const tapAccelerationSeconds = Math.round(TAP_GROWTH_ACCELERATION_MS / 1000);
  const canWater = !!plant
    && phase < 3
    && (!plant.lastWatered || Date.now() - plant.lastWatered >= WATER_COOLDOWN_MS);

  const phaseScales = [0.45, 0.50, 0.55, 0.6];
  const bgStyle = getGardenSpriteStyle(spriteIndex, phase, phaseScales[phase] || 0.6, assetPaths.sheet);
  const detailsLabel = t('plantDetail.details');

  return (
    <AnimatePresence mode="wait">
      {!plant ? (
        <motion.button 
          key="empty"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.1 } }}
          whileTap={{ scale: 0.9 }}
          onClick={onClick}
          className="w-20 h-24 flex flex-col items-center justify-end group z-10 relative"
        >
          <div className="garden-spot-empty mb-2 flex h-12 w-12 items-center justify-center rounded-full transition-colors">
            <div className="text-2xl font-light opacity-50">+</div>
          </div>
        </motion.button>
      ) : (
        <div key="plant" className="garden-spot-shell">
        <motion.button
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.5 }}
          whileTap={{ scale: 0.95 }}
          whileHover={{ y: -2 }}
          onPointerDown={handlePointerDown}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onContextMenu={(e) => e.preventDefault()}
          className="relative flex flex-col items-center justify-end z-10 group w-20 h-32 touch-none"
          data-garden-plant="true"
          data-plant-id={plant.id}
        >
        <div className="w-20 flex flex-col items-center justify-end h-full relative">
        <div className="absolute bottom-[-2px] w-14 h-4 bg-black/50 blur-[3px] rounded-full pointer-events-none"></div>
        <PhaseEffects phase={phase} color={def.color} />
        <AnimatePresence>
          {tapPulse > 0 && (
            <motion.span
              key={tapPulse}
              className="garden-tap-pulse"
              initial={{ opacity: 0.55, scale: 0.55 }}
              animate={{ opacity: 0, scale: 1.55 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.46, ease: "easeOut" }}
            />
          )}
        </AnimatePresence>
        
        {/* Progress ring for stash action */}
        <AnimatePresence>
          {isPressing && (
             <motion.div 
               initial={{ opacity: 0, scale: 0.8 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.8 }}
               className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none"
             >
                <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="45" fill="none" stroke="#ffffff1a" strokeWidth="6" />
                  <motion.circle 
                    cx="50" cy="50" r="45" fill="none" stroke="#fff" strokeWidth="6" 
                    initial={{ strokeDasharray: "0 282.7" }}
                    animate={{ strokeDasharray: "282.7 282.7" }}
                    transition={{ duration: 1.0, ease: "linear" }}
                  />
                </svg>
             </motion.div>
          )}
        </AnimatePresence>

        {canWater && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="garden-status-badge absolute right-2 top-16 z-30 flex h-7 w-7 items-center justify-center rounded-full"
            aria-hidden="true"
            data-testid="garden-water-ready"
          >
            <Droplets size={15} strokeWidth={1.8} />
          </motion.div>
        )}

        {/* Hidden img to catch load error */}
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
            className="transition-transform"
            style={bgStyle}
          />
        ) : (
          <>
            <div 
              className="relative z-10 flex flex-col justify-end items-center pointer-events-none mb-[-12px]"
              style={{ 
                transformOrigin: 'bottom center', 
                transform: `scale(${scale})`,
                marginBottom: '-8px'
              }}
            >
              {(plant?.level || 0) >= 10 && <Icon size={baseSize * 0.6} strokeWidth={1} className={cn("absolute bottom-6 left-1 drop-shadow-md", def.color)} />}
              {(plant?.level || 0) >= 5 && <Icon size={baseSize * 0.7} strokeWidth={1} className={cn("absolute bottom-3 -right-4 drop-shadow-md", def.color)} />}
              {(plant?.level || 0) >= 3 && <Icon size={baseSize * 0.8} strokeWidth={1} className={cn("absolute bottom-4 -left-4 drop-shadow-md", def.color)} />}
              <Icon size={baseSize} strokeWidth={1} className={cn("relative z-20 drop-shadow-md", def.color)} />
              
              {(plant?.level || 0) >= 15 && <div className="absolute top-0 right-0 w-2 h-2 bg-yellow-300 rounded-full blur-[2px] shadow-[0_0_8px_#fde047]"></div>}
            </div>

            <div className="relative z-20 w-12 h-10 bg-gradient-to-br from-[#c88d6c] to-[#8d5231] rounded-b-lg shadow-inner flex shrink-0">
              <div className="absolute top-0 inset-x-[-4px] h-3 bg-gradient-to-r from-[#d99f7d] to-[#9e6342] rounded-sm border-b border-[#7c4424] shadow-[0_4px_6px_rgba(0,0,0,0.4)]"></div>
              <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
                 <div className="w-4 h-4 border border-[#5a311b] rounded-full"></div>
              </div>
            </div>
          </>
        )}
      </div>
      
      {(plant?.phase || 0) < 3 && (
        <div
          data-testid="garden-growth-timer"
          className="absolute left-[calc(50%-6px)] top-[calc(100%-8px)] z-40 -translate-x-1/2 pointer-events-none"
        >
          <motion.div
            initial={{ opacity: 0, y: -2, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="garden-timer-chip rounded-full px-2 py-0.5 font-mono text-[9px] tracking-wider"
          >
            {timeStr}
          </motion.div>
        </div>
      )}
      
      {/* Floating text effects */}
      <AnimatePresence>
        {floatingTexts.map(ft => (
          <motion.div
            key={ft.id}
            initial={{ opacity: 0, y: 10, scale: 0.78 }}
            animate={{ opacity: [0, 1, 1, 0], y: -46, scale: [0.78, 1.08, 1] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.95, ease: "easeOut" }}
            style={{ left: `calc(50% + ${ft.x}px)` }}
            className={`garden-floating-note ${ft.type}`}
          >
            {ft.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.button>
        <button
          type="button"
          className="plant-details-button"
          aria-label={detailsLabel}
          title={detailsLabel}
          data-plant-details-button="true"
          onClick={onClick}
        >
          <Info size={14} />
        </button>
      </div>
      )}
    </AnimatePresence>
  );
}
