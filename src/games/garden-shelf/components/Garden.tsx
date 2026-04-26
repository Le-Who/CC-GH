import React, { useRef, useEffect } from 'react';
import { useGame } from '../lib/GameContext';
import { MAX_SHELVES, SPOTS_PER_SHELF, PLANT_TYPES, SHELF_UNLOCK_COSTS, PHASE_DURATIONS_MS } from '../constants';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins } from 'lucide-react';
import { PlantData } from '../types';
import { cn } from '../lib/utils';
import { Lock } from 'lucide-react';
import { GARDEN_SHEET_PATH, getGardenSpriteStyle } from '../lib/sprites';

interface GardenProps {
  onSelectSpot: (shelfIndex: number, spotIndex: number, plantId?: string) => void;
}

export function Garden({ onSelectSpot }: GardenProps) {
  const { state, unlockShelf } = useGame();

  const shelves = Array.from({ length: MAX_SHELVES }, (_, i) => i);
  const spots = Array.from({ length: SPOTS_PER_SHELF }, (_, i) => i);

  return (
    <div className="flex-1 h-full overflow-y-auto overflow-x-hidden p-6 space-y-20 pb-32 pt-28 no-scrollbar">
      {shelves.map((shelfIndex) => {
        const isUnlocked = shelfIndex < state.shelvesUnlocked;

        if (!isUnlocked) {
          // We only show the next locked shelf
          if (shelfIndex === state.shelvesUnlocked) {
             const unlockCost = SHELF_UNLOCK_COSTS[shelfIndex] || 999999;
             const canAfford = state.gold >= unlockCost;

             return (
               <div key={shelfIndex} className="relative mt-8">
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center p-6 bg-[#1b1416]/80 backdrop-blur-md rounded-xl border border-white/10 shadow-[0_0_30px_rgba(0,0,0,0.8)] ring-1 ring-black/5 w-64 text-center">
                   <Lock className="w-8 h-8 text-rose-500/50 mb-2" strokeWidth={1.5} />
                   <p className="text-slate-400 text-xs tracking-widest uppercase mb-4">
                     Expand Biosphere
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
                       "flex items-center gap-1.5 px-4 py-2 rounded-full font-mono text-sm transition-all shadow-[0_0_15px_rgba(251,113,133,0.2)] border w-full justify-center",
                       canAfford 
                         ? "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20" 
                         : "bg-white/5 border-white/10 text-slate-500 cursor-not-allowed"
                     )}
                   >
                     {unlockCost} <Coins size={14} className={canAfford ? "text-rose-400" : "text-slate-500"} />
                   </motion.button>
                 </div>
                 <Shelf visualsOnly />
               </div>
             );
          }
          return null; // hide other locked shelves
        }

        return (
          <div key={shelfIndex} className="relative mt-8">
            <div className="flex justify-evenly items-end h-24 px-2 translate-y-1">
              {spots.map((spotIndex) => {
                const plant = state.plants.find(
                  (p) => p.shelfIndex === shelfIndex && p.spotIndex === spotIndex
                );

                return (
                  <Spot 
                    key={spotIndex} 
                    plant={plant} 
                    onClick={() => onSelectSpot(shelfIndex, spotIndex, plant?.id)} 
                  />
                );
              })}
            </div>
            <Shelf />
          </div>
        );
      })}
    </div>
  );
}

function Shelf({ visualsOnly = false }: { visualsOnly?: boolean }) {
  return (
    <div className={cn("relative w-[96%] mx-auto h-8 mt-1", visualsOnly && "opacity-40 pointer-events-none")}>
      {/* Top surface of the wood */}
      <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-[#8B5A2B] to-[#6b4521] rounded-[50%_50%_0_0] shadow-inner border-t border-[#a67c52]"></div>
      {/* Front edge of the wood */}
      <div className="absolute inset-x-0 top-4 h-4 bg-gradient-to-b from-[#5c3a1c] to-[#3e2712] rounded-[0_0_12px_12px] shadow-[0_15px_20px_rgba(0,0,0,0.6)] border-b border-[#2a1a0b]"></div>
      
      {/* Hanging vines decoration (just a few simple shapes) */}
      <div className="absolute left-4 top-4 w-2 h-16 bg-gradient-to-b from-green-800 to-transparent rounded-full opacity-60 mix-blend-overlay rotate-[5deg]"></div>
      <div className="absolute right-6 top-4 w-3 h-12 bg-gradient-to-b from-green-700 to-transparent rounded-full opacity-50 mix-blend-overlay -rotate-[10deg]"></div>
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

const Spot: React.FC<{ plant?: PlantData, onClick: () => void }> = ({ plant, onClick }) => {
  const { tapPlant } = useGame();
  const [imgError, setImgError] = React.useState(false);
  const [isPressing, setIsPressing] = React.useState(false);
  const [floatingTexts, setFloatingTexts] = React.useState<{id: string, text: string, type: 'gold' | 'time'}[]>([]);
  
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
        tapPlant(plant.id);
        
        // Add floating text
        const id = Math.random().toString();
        
        // Visual pop effect using a small scale burst
        if (e && e.currentTarget) {
            const btn = e.currentTarget as HTMLElement;
            btn.style.transform = 'scale(0.85)';
            setTimeout(() => { btn.style.transform = ''; }, 150);
        }

        if (plant.phase === 3) {
            const def = PLANT_TYPES[plant.type] || PLANT_TYPES.daisy;
            const amount = def.baseClick * plant.level;
            setFloatingTexts(prev => [...prev, { id, text: `+${amount} G`, type: 'gold' }]);
        } else {
            setFloatingTexts(prev => [...prev, { id, text: `-5s`, type: 'time' }]);
        }
        
        setTimeout(() => {
            setFloatingTexts(prev => prev.filter(ft => ft.id !== id));
        }, 1000);
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

  const phaseScales = [0.45, 0.50, 0.55, 0.6];
  const bgStyle = getGardenSpriteStyle(spriteIndex, phase, phaseScales[phase] || 0.6);

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
          <div className="w-12 h-12 rounded-full border border-dashed border-zinc-700/50 bg-black/20 flex items-center justify-center text-zinc-500/50 group-hover:bg-zinc-800/50 transition-colors mb-2">
            <div className="text-2xl font-light opacity-50">+</div>
          </div>
        </motion.button>
      ) : (
        <motion.button
          key="plant"
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.5, filter: "blur(4px)" }}
          whileTap={{ scale: 0.95 }}
          whileHover={{ y: -2 }}
          onPointerDown={handlePointerDown}
          onPointerUp={cancelPress}
          onPointerLeave={cancelPress}
          onContextMenu={(e) => e.preventDefault()}
          className="relative flex flex-col items-center justify-end z-10 group w-20 h-32 touch-none"
        >
      <div className="w-20 flex flex-col items-center justify-end h-full relative">
        <div className="absolute bottom-[-2px] w-14 h-4 bg-black/50 blur-[3px] rounded-full pointer-events-none"></div>
        <PhaseEffects phase={phase} color={def.color} />
        
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

        {/* Hidden img to catch load error */}
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
      
      <div className="absolute -top-4 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-30">
        <div className="bg-[#1a1315]/90 backdrop-blur text-zinc-300 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-white/10 flex items-center gap-1 shadow-[0_4px_10px_rgba(0,0,0,0.5)]">
          {(plant?.phase || 0) < 3 ? `PH ${plant?.phase || 0}` : `LV ${plant?.level || 0}`}
        </div>
        {(plant?.phase || 0) < 3 && (
          <div className="mt-1 bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded border border-emerald-900/50 text-[9px] font-mono text-emerald-400">
            {timeStr}
          </div>
        )}
      </div>
      
      {/* Floating text effects */}
      <AnimatePresence>
        {floatingTexts.map(ft => (
          <motion.div
            key={ft.id}
            initial={{ opacity: 1, y: 0, scale: 0.8 }}
            animate={{ opacity: 0, y: -40, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 text-xs font-bold pointer-events-none z-50 drop-shadow-md ${ft.type === 'gold' ? 'text-amber-300' : 'text-emerald-400'}`}
          >
            {ft.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.button>
      )}
    </AnimatePresence>
  );
}
