import React, { lazy } from 'react';
import { useGameHub } from '../../game-state/useGameHub.js';
const LegacyGarden=lazy(()=>import('./LegacyGardenGame'));
const GardenR2Provider=lazy(()=>import('./lib/GardenR2Provider'));
const GardenR2Blocked=lazy(()=>import('./lib/GardenR2Provider').then(module=>({default:module.GardenR2Blocked})));
export default function App() {
  const accountId = useGameHub(state => state.snapshot?.player?.id || '');
  const blockedR2 = useGameHub(state => !!state.snapshot?.gardenR2 && (state.snapshot.gardenR2.blocked || state.snapshot.gardenR2.version !== 1 || !Array.isArray(state.snapshot.gardenR2.plants)));
  const useR2 = useGameHub(state => !!state.snapshot?.gardenR2 || state.snapshot?.gardenR2Available === true);
  if (blockedR2) return <GardenR2Blocked />;
  return useR2 ? <GardenR2Provider key={accountId} accountId={accountId} /> : <LegacyGarden key={accountId} />;
}
