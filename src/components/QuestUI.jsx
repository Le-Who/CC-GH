import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { CROPS } from '/game-logic.js';

export default function QuestUI({ isOpen, onClose }) {
  const slices = useGameStore(state => state.slices);
  const pet = slices.pet || {};
  const orders = pet.activeOrders || [];
  
  // Expose vanilla dispatch methods
  const handleFulfill = (orderId) => {
    document.dispatchEvent(new CustomEvent('quest-submit', { detail: orderId }));
  };

  const generateQuests = () => {
    document.dispatchEvent(new CustomEvent('quest-generate'));
  };

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => document.body.classList.remove("modal-open");
  }, [isOpen]);

  if (!isOpen && typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div 
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm pointer-events-auto"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal / Dropdown */}
          <motion.div 
            className="fixed top-20 right-4 w-80 bg-surface/95 backdrop-blur-xl border border-border rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.4)] z-[101] flex flex-col pointer-events-auto overflow-hidden"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            {/* Header */}
            <div className="flex justify-between items-center px-4 py-3 bg-white/5 border-b border-white/10">
              <h3 className="text-xl font-heading font-bold text-white tracking-wide">📋 Quests</h3>
              <button aria-label="Close quests" onClick={onClose} className="text-textDim hover:text-white transition-colors">✕</button>
            </div>

            {/* List */}
            <div className="flex-1 max-h-[60vh] overflow-y-auto p-3 space-y-3">
              {orders.length === 0 ? (
                <div className="text-center py-8 text-textDim flex flex-col items-center gap-2">
                  <div className="text-4xl opacity-50">📭</div>
                  <p>No active quests.</p>
                  <button 
                    onClick={generateQuests}
                    className="mt-2 px-4 py-1.5 rounded-full border border-primary text-primary hover:bg-primary/20 transition-colors text-sm"
                  >
                    Refresh Quests
                  </button>
                </div>
              ) : (
                orders.map((order) => (
                  <QuestItem 
                    key={order.id} 
                    order={order} 
                    slices={slices} 
                    onFulfill={() => handleFulfill(order.id)} 
                  />
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

function QuestItem({ order, slices, onFulfill }) {
  const harvested = slices.resources?.harvested || {};
  const mergeBoard = slices.merge?.board || [];
  
  // Calculate if CAN fulfill and build display list
  let canFulfill = true;
  
  const reqsUI = order.requirements.map((req, idx) => {
    let hasQty = 0;
    let label = req.id;
    let emoji = "📦";

    if (req.type === 'crop') {
      const c = CROPS[req.id];
      emoji = c?.emoji || '🌿';
      label = c?.name || req.id;
      hasQty = harvested[req.id] || 0;
    } else if (req.type === 'merge') {
      emoji = '🧩';
      label = req.id;
      // count
      for (const row of mergeBoard) {
        for (const cell of row) {
          if (cell && cell.id === req.id) hasQty++;
        }
      }
    }

    if (hasQty < req.qty) canFulfill = false;
    const progress = Math.min(100, (hasQty / req.qty) * 100);

    return (
      <div key={idx} className="flex flex-col gap-1 mb-2">
        <div className="flex justify-between text-sm">
          <span className="text-text">{emoji} {label}</span>
          <span className={hasQty >= req.qty ? "text-success" : "text-textDim"}>
            {hasQty} / {req.qty}
          </span>
        </div>
        <div className="h-1.5 w-full bg-background rounded-full overflow-hidden">
          <motion.div 
            className={`h-full ${hasQty >= req.qty ? 'bg-success' : 'bg-primary'}`}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  });

  return (
    <motion.div 
      layout
      className="p-3 bg-background/60 rounded-xl border border-border"
    >
      <div className="flex justify-between items-start mb-3">
        <h4 className="font-bold text-white text-sm">Order {order.id.split('-')[0]}</h4>
        <div className="text-gold font-bold text-sm bg-gold/10 px-2 py-0.5 rounded">
          +{order.reward?.gold || 0} 🪙
        </div>
      </div>
      
      {reqsUI}

      <button
        disabled={!canFulfill}
        onClick={onFulfill}
        className={`w-full mt-2 py-1.5 rounded-lg text-sm font-bold transition-all ${
          canFulfill 
            ? 'bg-success text-white shadow-[0_0_12px_rgba(0,200,83,0.3)] hover:brightness-110' 
            : 'bg-surfaceHover text-textDim cursor-not-allowed hidden'
        }`}
      >
        Complete Order
      </button>
    </motion.div>
  );
}
