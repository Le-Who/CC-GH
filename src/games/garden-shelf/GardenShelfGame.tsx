/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React, { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
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
import { resolveGardenAssetPaths } from './lib/sprites';
import type { GardenAssetPaths } from './lib/sprites';
import { loadRuntimeAssetManifest } from '../../game-runtime/assetBundles.js';
import { useEscapeDismiss } from '../../app/useDismissableLayer.js';
import { formatGardenGoldAmount } from './constants';
import { buildGardenQuestSections } from '../../../game-logic/garden-quests.js';
import { GARDEN_LEVEL_UP_EVENT, GARDEN_OPEN_QUESTS_EVENT } from './events';
import { ArrowUpCircle, CheckCircle2, Coins, Gift, X } from 'lucide-react';
import './garden-shelf.css';

const GARDEN_NAME_KEY = 'garden_shelf_name';

function renderGardenPortal(children: React.ReactNode) {
  if (typeof document === 'undefined') return children;
  return createPortal(children, document.body);
}

function cssImageUrl(value: string) {
  return value ? `url(${JSON.stringify(value)})` : "none";
}

function GardenSign({ assetPaths }: { assetPaths: GardenAssetPaths }) {
  const { state, renameGarden } = useGame();
  const { t } = useGardenI18n();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(state.name || '');
  const displayName = state.name?.trim() || t('garden.defaultName');

  React.useEffect(() => {
    if (typeof window === 'undefined' || state.name) return;
    const legacyName = window.localStorage.getItem(GARDEN_NAME_KEY);
    if (legacyName?.trim()) renameGarden(legacyName);
  }, [renameGarden, state.name]);

  React.useEffect(() => {
    setDraftName(state.name || '');
  }, [state.name]);

  const startEditing = () => {
    setDraftName(displayName);
    setEditing(true);
  };

  const commitName = () => {
    const nextName = draftName.trim();
    renameGarden(nextName);
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
          src={assetPaths.sign}
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
            className="absolute inset-x-[15%] top-[45%] min-h-[44px] -translate-y-1/2 truncate text-center font-serif text-[clamp(0.82rem,3.3vw,1.12rem)] font-bold tracking-widest text-amber-50 drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]"
          >
            {displayName}
          </button>
        )}
        {!editing && (
          <div className="absolute inset-x-[18%] top-[68%] truncate text-center font-mono text-[10px] font-black uppercase tracking-[0.18em] text-amber-100/90 drop-shadow-[0_2px_2px_rgba(0,0,0,0.65)]">
            {t('hud.level')} {state.level}
          </div>
        )}
      </div>
    </div>
  );
}

function GardenSettingsButton({ assetPaths }: { assetPaths: GardenAssetPaths }) {
  const { language, setLanguage, t } = useGardenI18n();
  const [open, setOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => audioManager.isEnabled());
  const closeSettings = useCallback(() => setOpen(false), []);
  useEscapeDismiss(open, closeSettings);

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
        <img src={assetPaths.settingsCog} alt="" draggable={false} className="h-full w-full object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)]" />
      </button>

      {renderGardenPortal(<AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label={t('settings.close')}
              className="glass-scrim fixed inset-0 z-[180]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeSettings}
            />
            <motion.div
              className="garden-glass-menu garden-settings-dialog fixed right-3 top-16 z-[190] w-[min(92%,320px)] border p-4"
              role="dialog"
              aria-modal="true"
              aria-label={t('settings.title')}
              tabIndex={-1}
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
                  onClick={closeSettings}
                  aria-label={t('settings.close')}
                >
                  <X size={16} />
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
      </AnimatePresence>)}
    </>
  );
}

function gardenQuestPriority(quest) {
  const locked = !!quest.locked || !quest.unlocked;
  if (!quest.claimed && quest.kind === "daily" && !locked) return 0;
  if (!quest.claimed && quest.kind === "story") return 1;
  if (quest.claimed && quest.kind === "daily") return 2;
  if (quest.claimed && quest.kind === "story") return 3;
  return 4;
}

function GardenQuestController() {
  const { state, claimQuest } = useGame();
  const { t } = useGardenI18n();
  const [open, setOpen] = useState(false);
  const closeQuests = useCallback(() => setOpen(false), []);
  useEscapeDismiss(open, closeQuests);
  const quests = React.useMemo(() => {
    if (!open) return [];
    return buildGardenQuestSections(state)
      .flatMap((section, sectionIndex) => section.quests.map((quest, questIndex) => ({
        ...quest,
        sectionIndex,
        questIndex,
      })))
      .sort((left, right) => (
        gardenQuestPriority(left) - gardenQuestPriority(right) ||
        Number(!!right.complete) - Number(!!left.complete) ||
        right.percent - left.percent ||
        left.sectionIndex - right.sectionIndex ||
        left.questIndex - right.questIndex
      ));
  }, [open, state]);

  React.useEffect(() => {
    const openQuests = () => {
      setOpen(true);
      return true;
    };
    (window as any).__openGardenQuests = openQuests;
    window.addEventListener(GARDEN_OPEN_QUESTS_EVENT, openQuests);
    return () => {
      if ((window as any).__openGardenQuests === openQuests) {
        delete (window as any).__openGardenQuests;
      }
      window.removeEventListener(GARDEN_OPEN_QUESTS_EVENT, openQuests);
    };
  }, []);

  return (
    <>
      {renderGardenPortal(<AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label={t('quest.close')}
              className="glass-scrim fixed inset-0 z-[180]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeQuests}
            />
            <motion.div
              className="garden-glass-menu garden-quest-dialog fixed inset-x-3 top-16 z-[190] mx-auto max-h-[calc(100%-88px)] max-w-[380px] overflow-auto border p-4"
              role="dialog"
              aria-modal="true"
              aria-label={t('quest.title')}
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.16 }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-[0.16em]">{t('quest.title')}</h2>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">{t('quest.subtitle')}</p>
                </div>
                <button
                  type="button"
                  className="garden-icon-button shrink-0"
                  onClick={closeQuests}
                  aria-label={t('quest.close')}
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {quests.map((quest) => {
                  const canClaim = quest.unlocked && quest.complete && !quest.claimed;
                  return (
                    <article
                      key={quest.id}
                      className={cn("garden-quest-card", quest.kind === "daily" && "daily", quest.locked && "locked")}
                      data-quest-id={quest.id}
                      data-quest-kind={quest.kind}
                      data-quest-claimed={quest.claimed ? "true" : "false"}
                      data-quest-locked={quest.locked ? "true" : "false"}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3>{t(quest.titleKey, quest.titleVars)}</h3>
                          <span className={`garden-quest-type ${quest.kind}`}>{t(quest.kind === 'daily' ? 'quest.daily' : 'quest.story')}</span>
                          <p>{t(quest.bodyKey, quest.bodyVars)}</p>
                        </div>
                        <div className="garden-quest-reward">
                          <Coins size={14} />
                          {formatGardenGoldAmount(quest.reward)}
                        </div>
                      </div>
                      <div className="garden-quest-progress" aria-label={t('quest.progress', { current: quest.current, target: quest.target })}>
                        {quest.endowed > 0 && (
                          <i style={{ width: `${Math.min(100, (quest.endowed / quest.target) * 100)}%` }} aria-hidden="true" />
                        )}
                        <span style={{ width: `${quest.percent}%` }} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <span className="font-mono text-[11px] text-[color:var(--muted)]">
                          {t('quest.progress', { current: quest.current, target: quest.target })}
                          {quest.endowed > 0 && <em>{t('quest.endowed', { count: quest.endowed })}</em>}
                        </span>
                        <button
                          type="button"
                          className={cn(
                            "garden-action-button min-h-[38px] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em]",
                            canClaim ? "primary garden-quest-claimable" : "disabled",
                          )}
                          disabled={!canClaim}
                          onClick={() => claimQuest(quest.id, quest.reward)}
                        >
                          {quest.claimed ? <CheckCircle2 size={14} /> : <Gift size={14} />}
                          {quest.claimed ? t('quest.claimed') : quest.locked ? t('quest.locked') : t('quest.claim')}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>)}
    </>
  );
}

function GardenLevelUpBridge() {
  const { levelUp } = useGame();

  React.useEffect(() => {
    const handleLevelUp = () => levelUp();
    window.addEventListener(GARDEN_LEVEL_UP_EVENT, handleLevelUp);
    return () => window.removeEventListener(GARDEN_LEVEL_UP_EVENT, handleLevelUp);
  }, [levelUp]);

  return null;
}

function LevelUpRewardModal() {
  const lastResult = useGameHub((state) => state.lastResult);
  const { t } = useGardenI18n();
  const [notice, setNotice] = useState<{ reward: number; level: number } | null>(null);
  const closeNotice = useCallback(() => setNotice(null), []);
  const seenResultRef = React.useRef<unknown>(null);
  useEscapeDismiss(!!notice, closeNotice);

  React.useEffect(() => {
    if (!lastResult || lastResult === seenResultRef.current) return;
    seenResultRef.current = lastResult;
    if (lastResult.action !== 'garden.levelUp' || lastResult.error) return;
    const reward = Math.max(0, Math.floor(Number(lastResult.reward) || 0));
    if (!reward) return;
    const level = Math.max(1, Math.floor(Number(lastResult.garden?.level || lastResult.snapshot?.garden?.level) || 1));
    setNotice({ reward, level });
  }, [lastResult]);

  return (
    <AnimatePresence>
      {notice && (
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
            className="garden-modal-card relative flex w-full max-w-sm flex-col items-center overflow-hidden p-8 text-center"
            role="dialog"
            aria-modal="true"
            aria-label={t('level.rewardTitle')}
          >
            <div className="relative z-10 mb-6 flex h-16 w-16 items-center justify-center rounded-lg border border-[color:var(--glass-border-soft)] bg-[color:var(--glass-card)]">
              <ArrowUpCircle className="h-8 w-8 text-amber-400" strokeWidth={1.5} />
            </div>
            <h2 className="relative z-10 mb-2 text-xl font-black uppercase tracking-[0.1em]">{t('level.rewardTitle')}</h2>
            <p className="relative z-10 mb-8 text-sm text-[color:var(--muted)]">{t('level.rewardBody', { level: notice.level })}</p>
            <div className="garden-card-row relative z-10 mb-8 flex items-center gap-2 rounded-lg px-6 py-3">
              <Coins className="h-6 w-6 fill-amber-500/50 text-amber-400" />
              <span className="font-mono text-3xl text-[color:var(--ink)]">{formatGardenGoldAmount(notice.reward)}</span>
            </div>
            <button
              type="button"
              onClick={closeNotice}
              className="garden-action-button secondary relative z-10 w-full py-4 font-mono text-sm uppercase tracking-[0.12em] transition-colors"
            >
              {t('offline.collect')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GameContent() {
  const [selectedSpot, setSelectedSpot] = useState<{ shelfIndex: number, spotIndex: number, plantId?: string } | null>(null);
  const [runtimeAssetManifest, setRuntimeAssetManifest] = useState<unknown>(undefined);
  const [mobileLiteDecor, setMobileLiteDecor] = useState(false);
  const assetPaths = React.useMemo(() => resolveGardenAssetPaths(runtimeAssetManifest), [runtimeAssetManifest]);
  const runtimeArtStyle = React.useMemo(() => ({
    "--garden-fx-coin-glint": cssImageUrl(assetPaths.fx.coinGlint),
    "--garden-fx-xp-leaf-sparkle": cssImageUrl(assetPaths.fx.xpLeafSparkle),
    "--garden-fx-water-splash": cssImageUrl(assetPaths.fx.waterSplash),
    "--garden-fx-care-sprout": cssImageUrl(assetPaths.fx.careSprout),
    "--garden-fx-leaf-glint": cssImageUrl(assetPaths.fx.leafGlint),
  }), [assetPaths]);

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

  React.useEffect(() => {
    let active = true;
    loadRuntimeAssetManifest().then((manifest) => {
      if (active) setRuntimeAssetManifest(manifest);
    });
    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    const query = window.matchMedia('(max-width: 640px), (pointer: coarse)');
    const apply = () => setMobileLiteDecor(query.matches);
    apply();
    query.addEventListener?.('change', apply);
    return () => query.removeEventListener?.('change', apply);
  }, []);

  return (
    <div className={cn("garden-root mx-auto w-full max-w-md h-full min-h-0 flex flex-col bg-[#2e1d22] text-rose-50 overflow-hidden relative shadow-2xl ring-1 ring-black/5 font-sans touch-pan-y select-none rounded-lg", mobileLiteDecor && "garden-root--mobile-lite")} style={runtimeArtStyle}>
      {/* Background Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,#ffeebb10,transparent_70%)]"></div>
        <div className="garden-ambient-blob absolute top-10 left-[-20%] w-[50%] h-[30%] bg-[#5c2a38] rounded-full blur-[40px] opacity-30"></div>
        <div className="garden-ambient-blob absolute bottom-20 right-[-10%] w-[60%] h-[40%] bg-[#40232a] rounded-full blur-[50px] opacity-60"></div>
        {/* Soft sunlight rays */}
        <div className="garden-sparkle-layer absolute -top-[10%] left-1/4 w-[120%] h-[80%] bg-gradient-to-b from-[#ffd7b5] to-transparent blur-[80px] opacity-10 transform -rotate-[30deg]"></div>
      </div>

        <div className="flex-1 overflow-hidden flex flex-col relative z-10 w-full px-2 pt-2 pb-6">
        <GardenSign assetPaths={assetPaths} />
        <GardenQuestController />
        <GardenSettingsButton assetPaths={assetPaths} />

        {/* The Glass Dome Container */}
        <div className="absolute inset-x-2 top-2 bottom-6 rounded-[140px_140px_10px_10px] border-[5px] border-white/20 bg-gradient-to-b from-white/10 to-transparent pointer-events-none shadow-[inset_0_20px_50px_rgba(255,255,255,0.1),0_0_20px_rgba(0,0,0,0.5)] flex flex-col z-20">
          {/* Main Reflection */}
          <div className="garden-dome-reflection absolute top-10 left-6 w-8 h-[60%] rounded-full bg-gradient-to-b from-white/20 to-transparent blur-[8px] transform -rotate-[10deg]"></div>
          <div className="garden-dome-reflection absolute top-12 right-6 w-4 h-[40%] rounded-full bg-gradient-to-b from-white/10 to-transparent blur-[6px] transform rotate-[10deg]"></div>
          
          <img
            src={assetPaths.bottomPlank}
            alt=""
            draggable={false}
            className="absolute -bottom-[12px] left-1/2 h-[clamp(52px,13vw,72px)] w-[calc(100%+24px)] max-w-none -translate-x-1/2 object-fill drop-shadow-[0_12px_16px_rgba(0,0,0,0.65)]"
          />
        </div>

        {/* We need the Garden to scroll inside but z-index it correctly behind the dome reflections */}
        <div className="flex-1 overflow-hidden relative z-10 rounded-[140px_140px_0_0]">
          <Garden assetPaths={assetPaths} onSelectSpot={(shelfIndex, spotIndex, plantId) => setSelectedSpot({ shelfIndex, spotIndex, plantId })} />
        </div>
      </div>
      
      <AnimatePresence>
        {selectedSpot && (
          <BottomPanel assetPaths={assetPaths} spot={selectedSpot} onClose={() => setSelectedSpot(null)} />
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
        key: 'garden.levelUp',
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
        <GardenLevelUpBridge />
        <GameContent />
        <OfflineWelcome />
        <LevelUpRewardModal />
      </GardenI18nProvider>
    </GameProvider>
  );
}
