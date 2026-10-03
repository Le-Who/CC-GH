import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGameHub } from '../../../game-state/useGameHub.js';
import { GameContext } from './GameContext';
import { GardenI18nProvider, useGardenI18n } from './i18n';
import { HudRegion } from '../../../app/hud-layout/index.js';
import { getGardenTransactionCoordinator } from './gardenTransactions.js';
import { getGardenR2Coordinator, requiresGardenReload, isGardenR2Retryable } from './gardenR2Transactions.js';
import { prepareGardenR2Adoption } from './gardenR2Adoption.js';
import { gardenR2ViewState, r2IncomePerSecond } from './gardenR2View.js';
import { getUnlockedPlantIds } from '../constants';
import GardenPresentation from '../GardenPresentation';

export default function GardenR2Provider({ accountId }: { accountId: string }) {
  const snapshot = useGameHub(state => state.snapshot);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const busy = useRef(false), mounted = useRef(true), recovery = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useCallback(() => useGameHub.getState().snapshot?.player?.id === accountId, [accountId]);
  const coordinator = useMemo(() => getGardenR2Coordinator(accountId,
    (action, payload, options) => useGameHub.getState().performReliableAction(action, payload, { ...options, silent: true, feedback: false }),
    payload => useGameHub.getState().performAction('garden.r2.reconcile', payload, { silent: true, feedback: false }),
    current, () => useGameHub.getState().snapshot?.serverTime
  ), [accountId, current]);
  const legacy = useMemo(() => getGardenTransactionCoordinator(accountId,
    (action, payload, options) => useGameHub.getState().performReliableAction(action, payload, { ...options, silent: true, feedback: false }),
    pending => useGameHub.getState().performAction('garden.reconcileIntent', pending, { silent: true, feedback: false }),
    current, () => useGameHub.getState().snapshot?.serverTime
  ), [accountId, current]);
  const view = snapshot?.gardenR2;
  const state = useMemo(() => gardenR2ViewState(snapshot?.garden, view, snapshot?.resources?.gold || 0), [snapshot?.garden, view, snapshot?.resources?.gold]);
  const recoverRef = useRef<() => Promise<void>>(async () => {});
  const recover = useCallback(async () => {
    if (busy.current || !coordinator || !current() || !mounted.current) return;
    busy.current = true; setReady(false);
    let result: any;
    try {
      result = await coordinator.recover();
      if (!result?.error && !result?.pending && !useGameHub.getState().snapshot?.gardenR2) {
        if (!useGameHub.getState().snapshot?.gardenR2Available) result = { error: 'GARDEN_R2_NOT_ENABLED' };
        else {
          const prepared = await prepareGardenR2Adoption({ accountId, storage: globalThis.localStorage, legacyCoordinator: legacy, readSnapshot: () => useGameHub.getState().snapshot, request: (...args) => current() ? useGameHub.getState().performAction(...args) : Promise.resolve({ error: 'GARDEN_R2_ACCOUNT_CHANGED' }), isCurrentAccount: current });
          result = prepared.error ? prepared : prepared.alreadyAdopted ? { success: true } : await coordinator.execute('adopt', prepared.input, 0);
        }
      }
      if (!result?.error && !result?.pending && current() && !document.hidden && useGameHub.getState().snapshot?.gardenR2) {
        result = await coordinator.execute('resume', {}, useGameHub.getState().snapshot.gardenR2.revision);
      }
    } catch { result = { error: 'GARDEN_R2_STORAGE_UNAVAILABLE' }; }
    finally { busy.current = false; }
    if (!mounted.current || !current()) return;
    const code = result?.error || (result?.pending ? 'GARDEN_R2_REQUEST_UNCONFIRMED' : '');
    setError(code); setReady(!code && !!useGameHub.getState().snapshot?.gardenR2);
    if (isGardenR2Retryable({ ...result, error: code })) recovery.current = setTimeout(() => void recoverRef.current(), 2500);
  }, [accountId, coordinator, legacy, current]);
  recoverRef.current = recover;
  useEffect(() => {
    mounted.current = true; void recover();
    return () => { mounted.current = false; if (recovery.current) clearTimeout(recovery.current); };
  }, [recover]);
  const command = useCallback(async (name: string, input = {}) => {
    if (!ready || busy.current || !coordinator || !current() || requiresGardenReload(error)) return false;
    const currentView = useGameHub.getState().snapshot?.gardenR2;
    if (!currentView) return false;
    busy.current = true;
    let result: any;
    try { result = await coordinator.execute(name, input, currentView.revision); }
    finally { busy.current = false; }
    if (!mounted.current || !current()) return false;
    if (result?.error) {
      if (['GARDEN_R2_TAP_COOLDOWN', 'GARDEN_R2_WATER_COOLDOWN'].includes(result.error)) return false;
      setError(result.error);
      if (requiresGardenReload(result.error)) setReady(false);
      try { if (coordinator.inspect().pending) { setReady(false); if (isGardenR2Retryable(result)) recovery.current = setTimeout(() => void recoverRef.current(), 2500); } }
      catch { setReady(false); }
      return false;
    }
    setError(''); return result?.receiptConfirmed === true;
  }, [ready, coordinator, current, error]);
  useEffect(() => {
    if (!ready) return;
    const ping = () => { if (!document.hidden) void command('heartbeat'); };
    const timer = setInterval(ping, 15000);
    document.addEventListener('visibilitychange', ping);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', ping); };
  }, [ready, command]);
  useEffect(() => {
    if (!view) return;
    useGameHub.getState().setGardenHud({ level: view.chapter, plants: view.plants.filter(p => p.isActive === true).length, slots: state.shelvesUnlocked * 3, shelvesUnlocked: state.shelvesUnlocked, incomePerSecond: r2IncomePerSecond(view), xp: view.xp, xpRequired: view.xpRequired, levelReady: view.pendingLegacyRewardGold > 0, questReadyCount: view.quests.flatMap(section => section.quests).filter(q => q.unlocked && q.complete && !q.claimed).length });
  }, [view, state.shelvesUnlocked]);
  useEffect(() => () => { if (current()) useGameHub.getState().setGardenHud(null); }, [current]);
  const actions = useMemo(() => ({
    accountingReady: ready, state, r2: view, r2Command: command,
    addGold: () => {}, clearOfflineEarnings: () => {},
    buyPlant: (type, shelfIndex, spotIndex) => command('buyPlant', { type, shelfIndex, spotIndex }),
    upgradePlant: plantId => command('upgradePlant', { plantId }), sellPlant: plantId => command('sellPlant', { plantId }),
    unlockShelf: () => command('unlockShelf'), unlockedPlants: getUnlockedPlantIds(Math.max(view?.chapter || 1, snapshot?.garden?.level || 1)),
    waterPlant: plantId => command('water', { plantId }), tapPlant: plantId => command('tend', { plantId }),
    levelUp: () => command('claimLegacyLevelReward'), claimQuest: questId => command('claimQuest', { questId }),
    renameGarden: name => command('rename', { name }),
    movePlantToInventory: plantId => command('movePlant', { plantId, shelfIndex: -1, spotIndex: -1 }),
    movePlantToShelf: (plantId, shelfIndex, spotIndex) => command('movePlant', { plantId, shelfIndex, spotIndex }),
  }), [ready, state, view, command, snapshot?.garden?.level]);
  return <GameContext.Provider value={actions}><GardenI18nProvider><GardenPresentation transportError={error} onDismissError={() => { if (!requiresGardenReload(error)) setError(''); }} /></GardenI18nProvider></GameContext.Provider>;
}

function BlockedContent() {
  const { t } = useGardenI18n();
  return <HudRegion id="gardenRoot" applyLayout={false} className="gs2-stage"><div className="gs2-r2-card" role="alert"><p>{t('r2.reloadRequired')}</p><button type="button" className="gs2-button" onClick={() => window.location.reload()}>{t('r2.reload')}</button></div></HudRegion>;
}
export function GardenR2Blocked() { return <GardenI18nProvider><BlockedContent /></GardenI18nProvider>; }
