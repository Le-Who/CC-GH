import React, { useCallback, useState } from 'react';
import { GameProvider } from './lib/GameContext';
import { GardenI18nProvider } from './lib/i18n';
import { useGameHub } from '../../game-state/useGameHub.js';
import GardenPresentation from './GardenPresentation';
export default function App() {
  const [transportError, setTransportError] = useState('');
  const request = useCallback(async (...args: any[]) => {
    try {
      const result = await useGameHub.getState().performAction(...args);
      if (result?.error) setTransportError(String(result.error));
      return result;
    } catch (error) {
      setTransportError('NETWORK_ERROR');
      throw error;
    }
  }, []);
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
  return <GameProvider hubGold={hubGold} persistedState={hubGarden} onGoldDelta={onGoldDelta} onStateSync={onStateSync} onGardenReset={onGardenReset} onGardenLevelUp={onGardenLevelUp} onHudChange={setGardenHud}>
      <GardenI18nProvider>
        <GardenPresentation transportError={transportError} onDismissError={() => setTransportError('')} />
      </GardenI18nProvider>
    </GameProvider>;
}
