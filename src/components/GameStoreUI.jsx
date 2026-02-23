import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';

export default function GameStoreUI({ isOpen, onClose }) {
  const slices = useGameStore(state => state.slices);
  const resources = slices.resources || { gold: 0, gachaTokens: 0 };
  const [activeTab, setActiveTab] = useState('gacha'); // 'gacha', 'pass', 'bundles', 'currency'
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto p-4 sm:p-6">
      <motion.div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div 
        className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        initial={{ scale: 0.9, y: 20, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.95, y: 10, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-border bg-background/50">
          <h2 className="text-2xl font-bold font-heading text-white">Wandering Merchant</h2>
          <div className="flex items-center gap-4">
            <div className="bg-surfaceHover px-3 py-1 rounded-full text-gold font-bold">
              🪙 {resources.gold}
            </div>
            <div className="bg-surfaceHover px-3 py-1 rounded-full text-primary font-bold">
              🎟️ {resources.gachaTokens}
            </div>
            <button onClick={onClose} className="text-textDim hover:text-white p-1 ml-2">
              ✕
            </button>
          </div>
        </div>
        
        {/* Navigation */}
        <div className="flex px-4 py-2 gap-2 overflow-x-auto border-b border-border hide-scrollbar">
          {['Gacha', 'Cozy Pass', 'Bundles', 'Currency'].map(tab => {
            const id = tab.toLowerCase().split(' ')[0];
            const isActive = activeTab === id;
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                  isActive ? 'bg-primary text-white font-bold' : 'bg-surfaceHover text-textDim hover:text-white'
                }`}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Dynamic Content Area */}
        <div className="p-6 h-[50vh] min-h-[400px] overflow-y-auto">
          {activeTab === 'gacha' && <GachaTab tokens={resources.gachaTokens} />}
          {activeTab === 'cozy' && <CozyPassTab />}
          {activeTab === 'bundles' && <BundlesTab />}
          {activeTab === 'currency' && <CurrencyTab />}
        </div>
      </motion.div>
    </div>
  );
}

function GachaTab({ tokens }) {
  const [isPulling, setIsPulling] = useState(false);
  const [showOdds, setShowOdds] = useState(false);

  return (
    <div className="flex flex-col items-center h-full">
      <div className="w-full flex justify-end mb-2">
        <button 
          onClick={() => setShowOdds(!showOdds)}
          className="text-xs text-textDim underline uppercase tracking-wider hover:text-white"
        >
          View Drop Rates
        </button>
      </div>

      <AnimatePresence>
        {showOdds && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
            exit={{ height: 0, opacity: 0 }}
            className="w-full bg-surfaceHover p-4 rounded-xl mb-6 text-sm border border-border"
          >
            <h4 className="font-bold mb-2 text-white">Transparent Drop Rates</h4>
            <ul className="space-y-1">
              <li className="flex justify-between"><span className="text-gray-400">Common (Decorations)</span> <span>60.0%</span></li>
              <li className="flex justify-between"><span className="text-blue-400">Rare (Pets)</span> <span>30.0%</span></li>
              <li className="flex justify-between"><span className="text-purple-400">Epic (Auras)</span> <span>9.0%</span></li>
              <li className="flex justify-between"><span className="text-gold">Legendary (Golden Skins)</span> <span>1.0%</span></li>
            </ul>
            <p className="text-xs text-textDim mt-3 italic">Pity System: Legendary guaranteed within 50 pulls.</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex items-center justify-center w-full relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.1)_0%,transparent_70%)]" />
        <motion.div 
          animate={isPulling ? { rotate: [0, 5, -5, 5, 0], scale: [1, 1.05, 1] } : { y: [0, -10, 0] }}
          transition={isPulling ? { duration: 0.5, repeat: Infinity } : { duration: 4, repeat: Infinity, ease: "easeInOut" }}
          className="text-8xl relative z-10 filter drop-shadow-[0_0_30px_rgba(167,139,250,0.5)]"
        >
          🔮
        </motion.div>
      </div>

      <div className="flex gap-4 w-full mt-auto">
        <button 
          className="flex-1 py-4 bg-surfaceHover rounded-xl font-bold flex flex-col items-center justify-center border border-border hover:bg-surfaceHover/80 transition-colors"
          onClick={() => alert("Not enough tokens. Fallback to purchase.")}
        >
          <span className="text-lg text-white">Pull ×1</span>
          <span className="text-primary text-sm">10 🎟️</span>
        </button>
        <button 
          className="flex-2 py-4 bg-primary text-white rounded-xl font-bold flex flex-col items-center justify-center shadow-[0_0_20px_rgba(167,139,250,0.4)] hover:opacity-90 transition-opacity w-2/3"
        >
          <span className="text-lg">Pull ×10 (Guaranteed Rare)</span>
          <span className="text-white/80 text-sm">100 🎟️</span>
        </button>
      </div>
    </div>
  );
}

function CozyPassTab() {
  return (
    <div className="flex flex-col gap-6">
      <div className="relative rounded-2xl overflow-hidden p-6 border border-gold/50 bg-[#1A1A10]">
        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,215,0,0.1)0%,transparent_100%)]" />
        <div className="relative z-10">
          <h3 className="text-2xl font-black italic text-gold tracking-widest uppercase transform -skew-x-6">VIP Cozy Pass</h3>
          <p className="text-white/80 mt-2">Unlock the Golden Shiba pet variant + 500 immediate Energy!</p>
          <button className="mt-4 px-6 py-2 bg-gold text-black font-bold rounded-full hover:bg-yellow-400">$4.99 / Season</button>
        </div>
      </div>
    </div>
  );
}

function BundlesTab() {
  return <div className="text-center text-textDim mt-12">No active weekend bundles right now. Check back later!</div>;
}

function CurrencyTab() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="p-4 rounded-xl border border-border bg-surfaceHover flex flex-col items-center text-center">
        <div className="text-4xl mb-2">⚡</div>
        <h4 className="font-bold">100 Energy</h4>
        <button className="mt-3 w-full py-2 bg-primary text-white rounded-lg hover:bg-opacity-90">$0.99</button>
      </div>
      <div className="p-4 rounded-xl border border-gold border-opacity-50 bg-[#1A1A10] flex flex-col items-center text-center relative overflow-hidden">
        <div className="absolute top-0 right-0 bg-gold text-black text-xs font-bold px-2 py-1 rounded-bl-lg">+20% BOUNS</div>
        <div className="text-4xl mb-2">🪙</div>
        <h4 className="font-bold text-gold">500 Gold</h4>
        <button className="mt-3 w-full py-2 bg-gold text-black font-bold rounded-lg hover:bg-yellow-400">$4.99</button>
      </div>
    </div>
  );
}
