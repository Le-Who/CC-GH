import {createElement,lazy} from 'react';
import {useSnapshot} from '../../app/gameHooks.js';
// Resolve only the implementation selected by the verified snapshot. The
// outer game Suspense boundary handles both loaders and keeps legacy saves usable.
const LegacyMergeGame=lazy(()=>import('./LegacyMergeGame.jsx'));
const MergeLabGame=lazy(()=>import('./MergeLabGame.jsx'));
export default function MergeGame(){
  const snapshot=useSnapshot();
  return snapshot?.merge?.schemaVersion===3
    ? createElement(MergeLabGame,{key:snapshot.player.id+':'+snapshot.merge.serverEpoch})
    : createElement(LegacyMergeGame);
}
