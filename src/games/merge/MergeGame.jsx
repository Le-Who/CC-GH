import {createElement} from 'react';
import {useSnapshot} from '../../app/gameHooks.js';
import LegacyMergeGame from './LegacyMergeGame.jsx';
import MergeLabGame from './MergeLabGame.jsx';
export default function MergeGame(){
  const snapshot=useSnapshot();
  return snapshot?.merge?.schemaVersion===3
    ? createElement(MergeLabGame,{key:snapshot.player.id+':'+snapshot.merge.serverEpoch})
    : createElement(LegacyMergeGame);
}
