/** Recovered game-only source from the owned Blox v2 r2 preview. See recovery manifest. */
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {useSnapshot,useAction,useReliableAction,useExitToHub,useImmersiveGame} from '../../app/gameHooks.js';
import {useAppI18n} from '../../app/i18n.jsx';
import {useGameEvents} from '../../game-state/gameEvents.js';
import {audioManager} from '../../services/audioManager.js';
import {api} from '../../services/apiClient.js';
import {getRewardChestProgress} from '../../../game-logic/hud-bonuses.js';
import {calcBloxReward} from '../../../game-logic/economy.js';
import {DEFAULT_BLOX_ROTATE_CHARGES,rotateBloxPiece,previewBloxPlacement} from '../../../game-logic/blox-engine.js';
import BloxPresentation from './BloxPresentation.jsx';
import './i18n.js';

function BloxGame(){
  const snapshot=useSnapshot();
  const performAction=useAction();
  const performReliableAction=useReliableAction();
  const exitToHub=useExitToHub();
  const pushEvent=useGameEvents(V=>V.pushEvent);
  const{
    t:t
  }=useAppI18n();
  const[selectedPiece, setSelectedPiece]=React.useState(-1);
  const[paused, setPaused]=React.useState(false);
  const[optimisticState, setOptimisticState]=React.useState(null);
  const savedState=snapshot?.blox?.savedState||{
  };
  const serverState={
    board:savedState.board||[],
    tray:savedState.tray||[],
    score:savedState.score||0,
    linesCleared:savedState.linesCleared||0,
    rotateCharges:Number.isFinite(Number(savedState.rotateCharges))?Math.max(0, Number(savedState.rotateCharges)):DEFAULT_BLOX_ROTATE_CHARGES,
    highScore:snapshot?.blox?.highScore||savedState.highScore||0,
    gameActive:savedState.gameActive||snapshot?.blox?.activeGame||false
  };
  const state=optimisticState||serverState;
  const[leaders, setLeaders]=React.useState([]);
  const isPlaying=state.gameActive&&!paused;
  const rewardChest=getRewardChestProgress(state.score||0);
  const currentReward=state.score?calcBloxReward(Number(state.score)||0):0;
  const trayPieces=state.tray.filter(V=>V&&!V.placed).length;
  const pauseRun=React.useCallback(()=>{
    state.gameActive&&setPaused(true)
  }, [state.gameActive]);
  const shellControls=React.useMemo(()=>({
    activeRun:state.gameActive,
    pauseRun:pauseRun,
    safeLeave:async()=>{
      if(!state.gameActive)return true;
      const result=await performAction('blox.end',{score:state.score});
      return result?.success === true && !result.error;
    },
    hudState:{
      score:state.score,
      linesCleared:state.linesCleared,
      rotateCharges:state.rotateCharges,
      currentReward:currentReward
    }
  }), [currentReward, pauseRun, performAction, state.gameActive, state.linesCleared, state.rotateCharges, state.score]);
  useImmersiveGame("blox", true, shellControls);
  React.useEffect(()=>{
    api("/api/blox/leaderboard").then(V=>{
      Array.isArray(V)&&setLeaders(V)
    })
  }, [state.highScore]);
  React.useEffect(()=>{
    state.gameActive||setPaused(false)
  }, [state.gameActive]);
  React.useEffect(()=>{
    setOptimisticState(null)
  }, [savedState.board, savedState.gameActive, savedState.linesCleared, savedState.rotateCharges, savedState.score, savedState.tray]);
  const rotatePiece=React.useCallback(()=>{
    if(!state.gameActive)return Promise.resolve({
      error:"inactive"
    });
    const V=selectedPiece>=0&&state.tray[selectedPiece]?.piece&&!state.tray[selectedPiece]?.placed?selectedPiece:state.tray.findIndex(R=>R?.piece&&!R.placed);
    if(V<0)return Promise.resolve({
      error:"invalid piece"
    });
    if((state.rotateCharges||0)<=0)return pushEvent({
      game:"blox",
      title:t("blox.rotateEmpty"),
      value:"",
      tone:"warning"
    }),
    Promise.resolve({
      error:"rotate unavailable"
    });
    const X=state.tray[V];
    const be=state.tray.map((R, H)=>H===V?{
      ...R,
      piece:rotateBloxPiece(X.piece)
    }:R);
    const me={
      ...state,
      tray:be,
      rotateCharges:Math.max(0, (Number(state.rotateCharges)||0)-1)
    };
    return setSelectedPiece(V),
    setOptimisticState(me),
    performReliableAction("blox.rotate", {
      pieceIdx:V
    }, {
      key:`blox.rotate.${V}.${state.rotateCharges}`,
      idParts:[V, state.rotateCharges]
    }).then(R=>(R.error&&(setOptimisticState(null), pushEvent({
      game:"blox",
      title:R.error,
      value:"",
      tone:"warning"
    })), R))
  }, [performReliableAction, pushEvent, selectedPiece, state, t]);
  const placePiece=React.useCallback((V, X, be)=>{
    if(V<0||!state.gameActive)return Promise.resolve({
      error:"inactive"
    });
    const me=previewBloxPlacement(state, {
      pieceIdx:V,
      row:X,
      col:be
    });
    return me.valid?(setOptimisticState({
      ...me.state,
      highScore:state.highScore,
      gameActive:state.gameActive
    }), performReliableAction("blox.place", {
      pieceIdx:V,
      row:X,
      col:be
    }, {
      key:`blox.place.${V}.${X}.${be}`,
      idParts:[V, X, be]
    }).then(R=>R.error?(setOptimisticState(null), pushEvent({
      game:"blox",
      title:R.error,
      value:"",
      tone:"warning"
    }), R):(setSelectedPiece(-1), R.clear?.cleared&&(audioManager.play("clear"), pushEvent({
      game:"blox",
      title:t("blox.clear"),
      value:`+${R.clear.cleared}`,
      tone:"success"
    })), R))):(pushEvent({
      game:"blox",
      title:t("blox.invalidPlacement"),
      value:"",
      tone:"warning"
    }), Promise.resolve({
      error:me.reason||"invalid placement"
    }))
  }, [performReliableAction, pushEvent, state, t]);
  const selectCell=React.useCallback((V, X)=>{
    selectedPiece<0||!state.gameActive||placePiece(selectedPiece, V, X)
  }, [selectedPiece, state.gameActive, placePiece]);
  const dropPiece=React.useCallback((V, X, be)=>placePiece(V, X, be), [placePiece]);
  const sceneState=React.useMemo(()=>({
    blox:{
      ...state,
      gameActive:isPlaying
    },
    bloxStatusText:t("blox.status", {
      score:state.score||0,
      lines:state.linesCleared||0
    }),
    bloxClearText:t("blox.clear"),
    bloxHideStatusText:true,
    bloxPredictedLines:optimisticState?.linesCleared?Math.max(0, optimisticState.linesCleared-(serverState.linesCleared||0)):0,
    selectedBloxPiece:selectedPiece,
    onBloxCell:selectCell,
    onBloxDrop:dropPiece,
    onBloxTray:setSelectedPiece
  }), [state, isPlaying, optimisticState, serverState.linesCleared, selectedPiece, selectCell, dropPiece, t]);
  return jsxRuntime.jsx(BloxPresentation, {
    state:state,
    paused:paused,
    selectedPiece:selectedPiece,
    sceneState:sceneState,
    currentReward:currentReward,
    rewardProgress:rewardChest.progress,
    trayPieces:trayPieces,
    leaders:leaders,
    onRotate:rotatePiece,
    onPause:()=>setPaused(true),
    onResume:()=>setPaused(false),
    onStart:()=>performAction("blox.start").then(()=>setPaused(false)),
    onFinish:()=>performAction("blox.end", {
      score:state.score
    }),
    onExit:exitToHub
  })
}

export default BloxGame;
