import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../lib/GameContext';
import { Coins } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useGardenI18n } from '../lib/i18n';

export function OfflineWelcome() {
  const { state, clearOfflineEarnings } = useGame();
  const { t } = useGardenI18n();

  const handleCollect = () => {
    // Pop confetti before closing
    confetti({
      particleCount: 150,
      spread: 100,
      origin: { y: 0.6 },
      colors: ['#fcd34d', '#f59e0b', '#d97706', '#ffeebb']
    });
    clearOfflineEarnings();
  };

  return (
    <AnimatePresence>
      {state.offlineEarnings && state.offlineEarnings > 0 && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-[#161213]/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="bg-[#1b1416]/95 border border-amber-500/30 rounded-[32px] p-8 w-full max-w-sm flex flex-col items-center text-center shadow-[0_0_50px_rgba(245,158,11,0.3)] relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-full h-full pointer-events-none">
                 <div className="absolute -top-20 -right-20 w-40 h-40 bg-amber-500/20 blur-[50px] rounded-full"></div>
                 <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-yellow-500/10 blur-[50px] rounded-full"></div>
              </div>

              <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mb-6 border border-amber-500/40 relative z-10">
                <Coins className="w-8 h-8 text-amber-400" strokeWidth={1.5} />
              </div>
              
              <h2 className="text-xl tracking-[0.1em] font-light text-amber-100 uppercase mb-2 relative z-10">{t('offline.title')}</h2>
              <p className="text-sm text-slate-400 mb-8 relative z-10">{t('offline.body')}</p>
              
              <div className="flex items-center gap-2 mb-8 relative z-10 bg-black/40 px-6 py-3 rounded-2xl border border-white/5">
                <Coins className="w-6 h-6 text-amber-400 fill-amber-500/50" />
                <span className="text-3xl font-mono text-amber-200">{Math.floor(state.offlineEarnings).toLocaleString()}</span>
              </div>

              <button
                onClick={handleCollect}
                className="w-full py-4 bg-amber-500 text-amber-50 rounded-xl font-mono uppercase tracking-widest text-sm hover:bg-amber-400 transition-colors shadow-[0_0_20px_rgba(245,158,11,0.4)] relative z-10 mix-blend-screen"
              >
                {t('offline.collect')}
              </button>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
