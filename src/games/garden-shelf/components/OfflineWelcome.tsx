import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../lib/GameContext';
import { Coins } from 'lucide-react';
import { useGardenI18n } from '../lib/i18n';
import { formatGardenGoldAmount } from '../constants';
import { runGardenConfetti } from '../lib/effects';

export function OfflineWelcome() {
  const { state, clearOfflineEarnings } = useGame();
  const { t } = useGardenI18n();

  const handleCollect = () => {
    void runGardenConfetti({
      particleCount: 150,
      spread: 100,
      origin: { y: 0.6 },
      colors: ['#fcd34d', '#f59e0b', '#d97706', '#ffeebb'],
    }, {
      particleCount: 24,
      ticks: 58,
      spread: 72,
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
            className="glass-scrim fixed inset-0 z-50 flex flex-col items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              data-garden-panel="offline-reward"
              className="garden-modal-card relative flex w-full max-w-sm flex-col items-center overflow-hidden p-8 text-center"
            >
              <div className="garden-modal-reward-icon relative z-10 mb-6 flex h-16 w-16 items-center justify-center rounded-lg border border-[color:var(--glass-border-soft)] bg-[color:var(--glass-card)]">
                <Coins className="w-8 h-8 text-amber-400" strokeWidth={1.5} />
              </div>
              
              <h2 className="relative z-10 mb-2 text-xl font-black uppercase tracking-[0.1em]">{t('offline.title')}</h2>
              <p className="relative z-10 mb-8 text-sm text-[color:var(--muted)]">{t('offline.body')}</p>
              
              <div className="garden-card-row relative z-10 mb-8 flex items-center gap-2 rounded-lg px-6 py-3">
                <Coins className="w-6 h-6 text-amber-400 fill-amber-500/50" />
                <span className="font-mono text-3xl text-[color:var(--ink)]">{formatGardenGoldAmount(state.offlineEarnings)}</span>
                {state.offlineXp && state.offlineXp > 0 && (
                  <span className="ml-2 font-mono text-sm text-[color:var(--leaf)]">
                    {t('offline.xp', { amount: Math.floor(state.offlineXp) })}
                  </span>
                )}
              </div>

              <button
                onClick={handleCollect}
                className="garden-action-button secondary relative z-10 w-full py-4 font-mono text-sm uppercase tracking-[0.12em] transition-colors"
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
