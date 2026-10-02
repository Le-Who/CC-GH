import {createElement as h,useCallback,useMemo,useState} from 'react';
import {useSnapshot,useExitToHub,useImmersiveGame} from '../../app/gameHooks.js';
import {useGameHub} from '../../game-state/useGameHub.js';
import {useAppI18n} from '../../app/i18n.jsx';
import {GameShell} from '../../app/shell.jsx';
import {HudEditableRegion,useHudViewport} from '../../app/hud-layout/index.js';
import {api} from '../../services/apiClient.js';
import {createMergeLabTransport} from './mergeLabTransport.js';
import {MergeLabView} from './MergeLabView.js';
import './merge-lab.css';

export default function MergeLabGame(){
  const snapshot=useSnapshot(),exit=useExitToHub(),{language}=useAppI18n(),viewport=useHudViewport();
  const accountId=snapshot?.player?.id;
  const [shell,setShell]=useState({}),[recoveryBusy,setRecoveryBusy]=useState(false),[recoveryError,setRecoveryError]=useState('');
  const transport=useMemo(()=>{
    try{return createMergeLabTransport({api,accountId,storage:globalThis.localStorage,
      getSnapshot:()=>useGameHub.getState().snapshot,
      applySnapshot:value=>useGameHub.getState().applySnapshot(value),
      refreshSnapshot:()=>useGameHub.getState().loadSnapshot()});}
    catch(error){return {initializationError:error};}
  },[accountId]);
  const [recovering,setRecovering]=useState(()=>!!transport.initializationError||transport.hasPending());
  const controls=useMemo(()=>({activeRun:true,openPanel:!!shell.modalOpen,
    closePanel:shell.modalOpen?shell.close:null,pauseRun:shell.pause,
    hudState:{alchemyEssence:snapshot?.merge?.alchemyEssence||0,freeTapCharges:snapshot?.merge?.freeTapCharges||0}}),[shell,snapshot?.merge?.alchemyEssence,snapshot?.merge?.freeTapCharges]);
  useImmersiveGame('merge',true,controls);
  const openYard=useCallback(()=>useGameHub.getState().setActiveTab('room'),[]);
  const recover=async()=>{
    if(recoveryBusy||transport.initializationError)return;
    setRecoveryBusy(true);setRecoveryError('');
    try{await transport.resumePending();setRecovering(transport.hasPending());}
    catch{setRecoveryError(language==='ru'?'Ответ ещё не подтверждён. Можно проверить тот же запрос.':'No confirmed reply yet. You can check the same request.');}
    finally{setRecoveryBusy(false);}
  };
  const ru=language==='ru';
  return h(GameShell,{gameId:'merge',phase:'playing',skin:'meditation',className:'merge-lab-shell'},
    recovering?h('section',{className:'ml-root ml-unavailable','aria-live':'polite'},
      h('p',null,transport.initializationError?(ru?'Не удалось открыть хранилище повторных запросов. Обновите страницу.':'Retry storage could not be opened. Reload this page.'):(ru?'Проверим результат незавершённого действия мастерской.':'Check the result of your pending workshop action.')),
      recoveryError&&h('p',{role:'alert'},recoveryError),
      !transport.initializationError&&h('button',{type:'button',className:'ml-button',disabled:recoveryBusy,onClick:recover},ru?'Проверить тот же запрос':'Check the same request'),
      h('button',{type:'button',className:'ml-button',onClick:exit},ru?'Выйти':'Exit'))
    :h(MergeLabView,{player:snapshot,language,onExit:exit,onOpenYard:openYard,onAction:transport.onAction,getQuote:transport.getQuote,
      clockSnapshot:snapshot,safeInsets:viewport.safeAreaInsets,onShellStateChange:setShell,
      backgroundNode:h(HudEditableRegion,{id:'mergeLabBackdropAsset',className:'ml-background','aria-hidden':true})}));
}
