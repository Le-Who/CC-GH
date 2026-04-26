/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useState } from 'react';
import { GameProvider } from './lib/GameContext';
import { Garden } from './components/Garden';
import { BottomPanel } from './components/BottomPanel';
import { OfflineWelcome } from './components/OfflineWelcome';
import { AnimatePresence } from 'framer-motion';
import { useGameHub } from '../../game-state/useGameHub.js';

function GameContent() {
  const [selectedSpot, setSelectedSpot] = useState<{ shelfIndex: number, spotIndex: number, plantId?: string } | null>(null);

  // Prevent default overscroll bounce on mobile
  React.useEffect(() => {
    document.body.style.overscrollBehavior = 'none';
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';
    return () => {
      document.body.style.overscrollBehavior = 'auto';
      document.body.style.userSelect = 'auto';
      document.body.style.webkitUserSelect = 'auto';
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-md h-full min-h-0 flex flex-col bg-[#2e1d22] text-rose-50 overflow-hidden relative shadow-2xl ring-1 ring-black/5 font-sans touch-pan-y select-none rounded-lg">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#ffeebb10,transparent_70%)]"></div>
        <div className="absolute top-10 left-[-20%] w-[50%] h-[30%] bg-[#5c2a38] rounded-full blur-[40px] opacity-30"></div>
        <div className="absolute bottom-20 right-[-10%] w-[60%] h-[40%] bg-[#40232a] rounded-full blur-[50px] opacity-60"></div>
        {/* Soft sunlight rays */}
        <div className="absolute -top-[10%] left-1/4 w-[120%] h-[80%] bg-gradient-to-b from-[#ffd7b5] to-transparent blur-[80px] opacity-10 transform -rotate-[30deg]"></div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col relative z-10 w-full px-2 pt-2 pb-6">
        {/* Top hanging sign */}
        <div className="absolute top-[48px] left-1/2 -translate-x-1/2 z-[100] pointer-events-none w-48 h-12 bg-gradient-to-b from-[#8B5A2B] to-[#5c3a1c] border border-[#a67c52] rounded-xl shadow-[0_4px_10px_rgba(0,0,0,0.5)] flex items-center justify-center">
           <div className="absolute -top-[40px] left-8 w-1 h-[40px] bg-gradient-to-b from-[#2a1a0b] to-[#3e2712]"></div>
           <div className="absolute -top-[40px] right-8 w-1 h-[40px] bg-gradient-to-b from-[#2a1a0b] to-[#3e2712]"></div>
           <span className="font-serif text-amber-100 text-base tracking-widest drop-shadow-md font-bold">My Garden</span>
        </div>

        {/* The Glass Dome Container */}
        <div className="absolute inset-x-2 top-2 bottom-6 rounded-[140px_140px_10px_10px] border-[5px] border-white/20 bg-gradient-to-b from-white/10 to-transparent pointer-events-none shadow-[inset_0_20px_50px_rgba(255,255,255,0.1),0_0_20px_rgba(0,0,0,0.5)] flex flex-col z-20">
          {/* Main Reflection */}
          <div className="absolute top-10 left-6 w-8 h-[60%] rounded-full bg-gradient-to-b from-white/20 to-transparent blur-[8px] transform -rotate-[10deg]"></div>
          <div className="absolute top-12 right-6 w-4 h-[40%] rounded-full bg-gradient-to-b from-white/10 to-transparent blur-[6px] transform rotate-[10deg]"></div>
          
          {/* Base plate of the dome */}
          <div className="absolute -bottom-1 inset-x-[-12px] h-10 rounded-[50%_50%_10px_10px] bg-gradient-to-b from-[#8B5A2B] to-[#3e2712] shadow-[0_10px_20px_rgba(0,0,0,0.8)] border-t border-[#a67c52] flex flex-col items-center justify-center">
             <div className="w-[80%] h-1 bg-[#2a1a0b] rounded-full opacity-50 mt-1"></div>
          </div>
        </div>

        {/* We need the Garden to scroll inside but z-index it correctly behind the dome reflections */}
        <div className="flex-1 overflow-hidden relative z-10 rounded-[140px_140px_0_0]">
          <Garden onSelectSpot={(shelfIndex, spotIndex, plantId) => setSelectedSpot({ shelfIndex, spotIndex, plantId })} />
        </div>
      </div>
      
      <AnimatePresence>
        {selectedSpot && (
          <BottomPanel spot={selectedSpot} onClose={() => setSelectedSpot(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  const hubGold = useGameHub((state) => state.snapshot?.resources?.gold || 0);
  const performAction = useGameHub((state) => state.performAction);
  const setGardenHud = useGameHub((state) => state.setGardenHud);
  const onGoldDelta = useCallback(
    (amount: number, reason = 'garden') => performAction(
      'garden.goldDelta',
      { amount, reason },
      {
        silent: true,
        feedback: false,
        key: `garden.gold.${reason}.${Date.now()}.${Math.random().toString(36).slice(2)}`,
      },
    ),
    [performAction],
  );

  return (
    <GameProvider hubGold={hubGold} onGoldDelta={onGoldDelta} onHudChange={setGardenHud}>
      <GameContent />
      <OfflineWelcome />
    </GameProvider>
  );
}
