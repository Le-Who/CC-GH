/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useState } from 'react';
import { GameProvider, useGame } from './lib/GameContext';
import { Garden } from './components/Garden';
import { BottomPanel } from './components/BottomPanel';
import { OfflineWelcome } from './components/OfflineWelcome';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameHub } from '../../game-state/useGameHub.js';
import { audioManager } from '../../services/audioManager.js';
import { cn } from './lib/utils';
import { GardenI18nProvider, useGardenI18n } from './lib/i18n';
import type { GardenLanguage } from './lib/i18n';
import { GARDEN_BOTTOM_PLANK_PATH, GARDEN_COG_PATH, GARDEN_SIGN_PATH } from './lib/sprites';
import { ArrowUpCircle, Coins } from 'lucide-react';

const GARDEN_NAME_KEY = 'garden_shelf_name';

function GardenSign() {
  const { t } = useGardenI18n();
  const [editing, setEditing] = useState(false);
  const [customName, setCustomName] = useState(() => {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(GARDEN_NAME_KEY) || '';
  });
  const [draftName, setDraftName] = useState(customName);
  const displayName = customName.trim() || t('garden.defaultName');

  const startEditing = () => {
    setDraftName(displayName);
    setEditing(true);
  };

  const commitName = () => {
    const nextName = draftName.trim();
    setCustomName(nextName);
    if (nextName) {
      window.localStorage.setItem(GARDEN_NAME_KEY, nextName);
    } else {
      window.localStorage.removeItem(GARDEN_NAME_KEY);
    }
    setEditing(false);
  };

  return (
    <div className="absolute top-[-18px] left-1/2 z-[110] w-[min(72%,310px)] -translate-x-1/2">
      <div className="absolute left-[22%] top-0 h-[36px] w-1 rounded-full bg-gradient-to-b from-[#2a1a0b] to-[#3e2712]" />
      <div className="absolute right-[22%] top-0 h-[36px] w-1 rounded-full bg-gradient-to-b from-[#2a1a0b] to-[#3e2712]" />
      <div className="relative mt-5" style={{ aspectRatio: '370 / 139' }}>
        <img
          src={GARDEN_SIGN_PATH}
          alt=""
          draggable={false}
          className="absolute inset-0 h-full w-full object-contain drop-shadow-[0_8px_12px_rgba(0,0,0,0.5)]"
        />
        {editing ? (
          <form
            className="absolute inset-x-[17%] top-[52%] -translate-y-1/2"
            onSubmit={(event) => {
              event.preventDefault();
              commitName();
            }}
          >
            <input
              autoFocus
              value={draftName}
              maxLength={22}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={commitName}
              className="h-9 w-full rounded-md border border-amber-200/50 bg-[#3f2414]/80 px-2 text-center font-serif text-[clamp(0.8rem,3vw,1.05rem)] font-bold tracking-wide text-amber-50 outline-none shadow-inner"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={startEditing}
            aria-label={t('garden.rename')}
            className="absolute inset-x-[15%] top-[52%] min-h-[44px] -translate-y-1/2 truncate text-center font-serif text-[clamp(0.85rem,3.6vw,1.18rem)] font-bold tracking-widest text-amber-50 drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]"
          >
            {displayName}
          </button>
        )}
      </div>
    </div>
  );
}

function GardenSettingsButton() {
  const { language, setLanguage, t } = useGardenI18n();
  const [open, setOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => audioManager.isEnabled());

  const toggleSound = async () => {
    setSoundEnabled(await audioManager.toggle());
  };

  const selectLanguage = (nextLanguage: GardenLanguage) => {
    setLanguage(nextLanguage);
  };

  return (
    <>
      <button
        type="button"
        className="absolute right-3 top-3 z-[140] grid h-12 w-12 place-items-center"
        aria-label={t('settings.open')}
        onClick={() => setOpen(true)}
      >
        <img src={GARDEN_COG_PATH} alt="" draggable={false} className="h-full w-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)]" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label={t('settings.close')}
              className="glass-scrim absolute inset-0 z-[180]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.div
              className="garden-glass-menu absolute right-3 top-16 z-[190] w-[min(92%,320px)] border p-4"
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.16 }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.16em]">{t('settings.title')}</h2>
                <button
                  type="button"
                  className="garden-icon-button text-sm"
                  onClick={() => setOpen(false)}
                  aria-label={t('settings.close')}
                >
                  x
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">{t('settings.sound')}</div>
                  <button
                    type="button"
                    onClick={toggleSound}
                    className={cn(
                      "garden-choice-button",
                      soundEnabled && "active",
                    )}
                  >
                    {soundEnabled ? t('settings.soundOn') : t('settings.soundOff')}
                  </button>
                </div>

                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]">{t('settings.language')}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['en', 'ru'] as GardenLanguage[]).map((option) => (
                      <button
                        type="button"
                        key={option}
                        onClick={() => selectLanguage(option)}
                        className={cn(
                          "garden-choice-button text-center",
                          language === option && "active",
                        )}
                      >
                        {option === 'en' ? t('settings.english') : t('settings.russian')}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function GardenProgress() {
  const { state, levelUp } = useGame();
  const { t } = useGardenI18n();
  const xpRequired = Math.max(1, state.xpRequired || 1);
  const progress = Math.max(0, Math.min(100, (state.xp / xpRequired) * 100));

  return (
    <div className="garden-level-panel absolute left-1/2 top-[105px] z-[130] w-[min(88%,360px)] -translate-x-1/2 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--muted)]">
            {t('level.progress')}
          </div>
          <div className="font-mono text-xs text-[color:var(--ink)]">
            {Math.floor(state.xp)}/{xpRequired} XP
          </div>
        </div>
        {state.levelReady && (
          <button
            type="button"
            onClick={levelUp}
            className="garden-action-button secondary min-h-[38px] shrink-0 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em]"
          >
            <ArrowUpCircle size={14} />
            {t('level.up')}
            <Coins size={12} />
          </button>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[color:var(--line-soft)]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--mint),var(--leaf),var(--amber))] transition-[width] duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

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
        <GardenSign />
        <GardenSettingsButton />
        <GardenProgress />

        {/* The Glass Dome Container */}
        <div className="absolute inset-x-2 top-2 bottom-6 rounded-[140px_140px_10px_10px] border-[5px] border-white/20 bg-gradient-to-b from-white/10 to-transparent pointer-events-none shadow-[inset_0_20px_50px_rgba(255,255,255,0.1),0_0_20px_rgba(0,0,0,0.5)] flex flex-col z-20">
          {/* Main Reflection */}
          <div className="absolute top-10 left-6 w-8 h-[60%] rounded-full bg-gradient-to-b from-white/20 to-transparent blur-[8px] transform -rotate-[10deg]"></div>
          <div className="absolute top-12 right-6 w-4 h-[40%] rounded-full bg-gradient-to-b from-white/10 to-transparent blur-[6px] transform rotate-[10deg]"></div>
          
          <img
            src={GARDEN_BOTTOM_PLANK_PATH}
            alt=""
            draggable={false}
            className="absolute -bottom-[12px] left-1/2 h-[clamp(52px,13vw,72px)] w-[calc(100%+24px)] max-w-none -translate-x-1/2 object-fill drop-shadow-[0_12px_16px_rgba(0,0,0,0.65)]"
          />
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
  const hubGarden = useGameHub((state) => state.snapshot?.garden || null);
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
  const onStateSync = useCallback(
    (gardenState) => performAction(
      'garden.sync',
      { state: gardenState },
      {
        silent: true,
        feedback: false,
        key: 'garden.sync',
        timeoutMs: 12000,
      },
    ),
    [performAction],
  );
  const onGardenReset = useCallback(
    () => performAction(
      'garden.resetEconomy',
      {},
      {
        silent: true,
        feedback: false,
        key: 'garden.resetEconomy',
        timeoutMs: 12000,
      },
    ),
    [performAction],
  );
  const onGardenLevelUp = useCallback(
    () => performAction(
      'garden.levelUp',
      {},
      {
        silent: true,
        feedback: false,
        key: `garden.levelUp.${Date.now()}`,
        timeoutMs: 12000,
      },
    ),
    [performAction],
  );

  return (
    <GameProvider
      hubGold={hubGold}
      persistedState={hubGarden}
      onGoldDelta={onGoldDelta}
      onStateSync={onStateSync}
      onGardenReset={onGardenReset}
      onGardenLevelUp={onGardenLevelUp}
      onHudChange={setGardenHud}
    >
      <GardenI18nProvider>
        <GameContent />
        <OfflineWelcome />
      </GardenI18nProvider>
    </GameProvider>
  );
}
