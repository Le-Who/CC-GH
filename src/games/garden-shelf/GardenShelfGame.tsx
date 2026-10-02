import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GameProvider } from './lib/GameContext';
import { GardenI18nProvider } from './lib/i18n';
import { useGameHub } from '../../game-state/useGameHub.js';
import { getGardenTransactionCoordinator } from './lib/gardenTransactions.js';
import { formatGardenGoldAmount } from './constants';
import GardenPresentation from './GardenPresentation';
export default function App() {
  const [transportError, setTransportError] = useState('');
  const accountId = useGameHub(state => state.snapshot?.player?.id || '');
  const request = useCallback(async (...args: any[]) => {
    // A retired provider must not flush its old account's cache into a new session.
    if (!accountId || useGameHub.getState().snapshot?.player?.id !== accountId) return { error: 'GARDEN_ACCOUNT_MISMATCH' };
    try {
      const result = await useGameHub.getState().performAction(...args);
      if (result?.error) setTransportError(String(result.error));
      return result;
    } catch (error) {
      setTransportError('NETWORK_ERROR');
      throw error;
    }
  }, [accountId]);
  const coordinator = useMemo(() => getGardenTransactionCoordinator(accountId,
    (action, payload, options) => useGameHub.getState().performReliableAction(action, payload, { ...options, silent: true, feedback: false }),
    pending => useGameHub.getState().performAction('garden.reconcileIntent', pending, { silent: true, feedback: false }),
    () => useGameHub.getState().snapshot?.player?.id === accountId,
    () => useGameHub.getState().snapshot?.serverTime
  ), [accountId]);
  const [accountingReady, setAccountingReady] = useState(false);
  const [recoveryEpoch, setRecoveryEpoch] = useState(0);
  const [reconciledState, setReconciledState] = useState<any>(null);
  useEffect(() => {
    let cancelled = false, timer: ReturnType<typeof setTimeout>;
    setAccountingReady(false);
    const recover = async () => {
      if (!coordinator) return;
      const result = await coordinator.recover();
      if (cancelled) return;
      if (result?.error || result?.pending) { setTransportError(result?.error || 'GARDEN_REQUEST_UNCONFIRMED'); timer = setTimeout(recover, 2500); }
      else { setAccountingReady(true); setTransportError(''); }
    };
    void recover();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [coordinator, recoveryEpoch]);
  const onEconomicAction = useCallback(async (action, payload, state) => {
    if (!coordinator || !accountingReady) return { error: 'GARDEN_ACCOUNTING_NOT_READY' };
    const sync = await request('garden.sync', { state }, { silent: true, feedback: false, key: 'garden.sync', timeoutMs: 12000 });
    if (sync?.error) return sync;
    const result = await coordinator.execute(action, { ...payload, expectedRevision: sync.snapshot?.garden?.economicRevision ?? state.economicRevision ?? 0 });
    if (result?.error) {
      setTransportError(result.error);
      try { if (coordinator.inspect().pending) { setAccountingReady(false); setRecoveryEpoch(value => value + 1); } }
      catch { setAccountingReady(false); setRecoveryEpoch(value => value + 1); }
    }
    return result;
  }, [accountingReady, coordinator, request]);
  const onEarnedCredit = useCallback(async state => {
    if (!coordinator || !accountingReady) return { error: 'GARDEN_ACCOUNTING_NOT_READY' };
    const result = await coordinator.execute('garden.creditEarned', { state, throughTotal: state.totalGoldEarned, expectedRevision: state.economicRevision ?? 0 });
    if (result?.error) {
      setTransportError(result.error);
      try { if (coordinator.inspect().pending) { setAccountingReady(false); setRecoveryEpoch(value => value + 1); } }
      catch { setAccountingReady(false); setRecoveryEpoch(value => value + 1); }
    }
    return result;
  }, [accountingReady, coordinator]);
  const reviewPending = useCallback(async (confirmationText: string) => {
    const expectedClientActionId = coordinator?.inspect().pending?.clientActionId || null;
    const snapshot = await useGameHub.getState().loadSnapshot();
    if (snapshot?.error || snapshot?.player?.id !== accountId) return;
    if (!window.confirm(confirmationText.replace('[[GOLD]]', formatGardenGoldAmount(snapshot.resources?.gold || 0)))) return;
    const result = await coordinator?.abandonPending({ confirmed: true, expectedClientActionId });
    if (result?.error) { setTransportError(result.error); return; }
    setReconciledState({ accountId, garden: snapshot.garden, nonce: Date.now() });
    setTransportError(''); setRecoveryEpoch(value => value + 1);
  }, [accountId, coordinator]);
  const hubGold = useGameHub(state => state.snapshot?.resources?.gold || 0);
  const hubGarden = useGameHub(state => state.snapshot?.garden || null);
  const performAction = request;
  const setGardenHud = useGameHub(state => state.setGardenHud);
  const onGoldDelta = useCallback((amount: number, reason = 'garden') => performAction('garden.goldDelta', {
    amount,
    reason
  }, {
    silent: true,
    feedback: false,
    key: `garden.gold.${reason}.${Date.now()}.${Math.random().toString(36).slice(2)}`
  }), [performAction]);
  const onStateSync = useCallback(gardenState => performAction('garden.sync', {
    state: gardenState
  }, {
    silent: true,
    feedback: false,
    key: 'garden.sync',
    timeoutMs: 12000
  }), [performAction]);
  const onGardenReset = useCallback(() => performAction('garden.resetEconomy', {}, {
    silent: true,
    feedback: false,
    key: 'garden.resetEconomy',
    timeoutMs: 12000
  }), [performAction]);
  const onGardenLevelUp = useCallback(() => performAction('garden.levelUp', {}, {
    silent: true,
    feedback: false,
    key: 'garden.levelUp',
    timeoutMs: 12000
  }), [performAction]);
  return <GameProvider key={accountId} accountId={accountId} hubGold={hubGold} persistedState={hubGarden} onGoldDelta={onGoldDelta} onStateSync={onStateSync} onGardenReset={onGardenReset} onGardenLevelUp={onGardenLevelUp} onHudChange={setGardenHud} accountingReady={accountingReady} reconciledState={reconciledState?.accountId === accountId ? reconciledState : null} onEconomicAction={onEconomicAction} onEarnedCredit={onEarnedCredit}>
      <GardenI18nProvider>
        <GardenPresentation transportError={transportError} onReviewPending={reviewPending} onDismissError={() => setTransportError('')} />
      </GardenI18nProvider>
    </GameProvider>;
}
