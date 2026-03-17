import React, { useEffect, useState } from 'react';
import { api } from '../vanilla/shared.js';

export function PlayerJournal({ onClose }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/farm/stats')
      .then((res) => {
        if (res && res.stats) setStats(res.stats);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-[fade-in_0.2s_ease-out]" 
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 border-2 border-slate-600 rounded-xl max-w-sm w-full p-6 text-white shadow-2xl relative" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="journal-title"
      >
        <button 
          onClick={onClose} 
          className="absolute top-3 right-3 text-slate-400 hover:text-white text-xl leading-none"
          aria-label="Close journal"
        >
          ✕
        </button>
        
        <h2 id="journal-title" className="text-xl font-bold mb-6 text-amber-400 flex items-center gap-2">
          <span>📖</span> Farming Journal
        </h2>
        
        {loading ? (
          <div className="text-center py-8 text-slate-400 animate-pulse">Opening journal...</div>
        ) : stats && Object.keys(stats).length > 1 ? (
          <div className="space-y-3">
            <StatRow icon="🌾" label="Total Harvests" value={stats.total_harvests || 0} />
            <StatRow icon="🌱" label="Seeds Planted" value={stats.total_plants || 0} />
            <StatRow icon="🪙" label="Crops Sold" value={stats.crops_sold || 0} />
            <StatRow icon="🚜" label="Plots Expanded" value={stats.plots_bought || 0} />
          </div>
        ) : (
          <div className="text-center py-8 text-slate-400">
            No records found yet.<br/>Get farming and check back soon!
          </div>
        )}

        <p className="text-xs text-slate-500 mt-6 text-center italic">
          Journal stats are aggregated over time.
        </p>
      </div>
    </div>
  );
}

function StatRow({ icon, label, value }) {
  return (
    <div className="flex justify-between items-center bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
      <div className="flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <span className="text-slate-300 text-sm font-medium">{label}</span>
      </div>
      <span className="font-bold text-white text-lg">{Number(value).toLocaleString()}</span>
    </div>
  );
}
