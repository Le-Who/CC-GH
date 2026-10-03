/** Production Bubbo controller using the existing start/sync/end and saved-game contract.
 * Recovered from the owned Bubbo v2 review build; see recovery manifest.
 * React and app services are imports from the production app, never bundled copies.
 */
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {BUBBO_SHOTS,BUBBO_TIMED_SECONDS,normalizeBubboPowerups,randomBubboColor,createBubboRun,getBubboDangerRows,getBubboPressureLabel,getBubboRemainingCount,advanceBubboPressure,resolveBubboShot,resolveBubboPowerup,isBubboDanger} from '../../game-core/bubbo/engine.js';
import {audioManager} from '../../services/audioManager.js';
import {useSnapshot,useAction,useExitToHub,useImmersiveGame} from '../../app/gameHooks.js';
import {useAppI18n} from '../../app/i18n.jsx';
import {useGameEvents} from '../../game-state/gameEvents.js';
import {useGameHub} from '../../game-state/useGameHub.js';
import {calcBubboReward} from '../../../game-logic/economy.js';
import {advanceBubboClock} from './bubboMotion.js';
import BubboPresentation from './BubboPresentation.jsx';
import './i18n.js';

const BUBBO_MODES=[{
  id:"classic",
  labelKey:"bubbo.mode.classic",
  hintKey:"bubbo.mode.classicHint"
}, {
  id:"timed",
  labelKey:"bubbo.mode.timed",
  hintKey:"bubbo.mode.timedHint"
}];
function BubboGame(){
  const snapshot=useSnapshot();
  const performAction=useAction();
  const exitToHub=useExitToHub();
  const pushEvent=useGameEvents(xe=>xe.pushEvent);
  const{
    t:t
  }=useAppI18n();
  const initialRun=React.useMemo(()=>createBubboRun("local-preview"), []);
  const[board, setBoard]=React.useState(()=>initialRun.board);
  const[pendingRow, setPendingRow]=React.useState(()=>initialRun.pendingRow);
  const[seed, setSeed]=React.useState(initialRun.seed);
  const[waveIndex, setWaveIndex]=React.useState(initialRun.waveIndex);
  const[rowOffset, setRowOffset]=React.useState(initialRun.rowOffset||0);
  const[pressure, setPressure]=React.useState(initialRun.pressure);
  const[pressureStep, setPressureStep]=React.useState(initialRun.pressureStep||0);
  const[score, setScore]=React.useState(0);
  const[mode, setMode]=React.useState("classic");
  const[timeLeft, setTimeLeft]=React.useState(BUBBO_TIMED_SECONDS);
  const[shotsLeft, setShotsLeft]=React.useState(BUBBO_SHOTS);
  const[shotsFired, setShotsFired]=React.useState(0);
  const[gameActive, setGameActive]=React.useState(false);
  const[paused, setPaused]=React.useState(false);
  const[runResult, setRunResult]=React.useState(null);
  const[currentBubble, setCurrentBubble]=React.useState(()=>randomBubboColor());
  const[nextBubble, setNextBubble]=React.useState(()=>randomBubboColor());
  const[swapCharges, setSwapCharges]=React.useState(1);
  const[powerups, setPowerups]=React.useState(()=>normalizeBubboPowerups(initialRun.powerups));
  const[activePowerup, setActivePowerup]=React.useState("");
  const[lastShot, setLastShot]=React.useState(null);
  const[starting, setStarting]=React.useState(false);
  const[error, setError]=React.useState("");
  const startingRef=React.useRef(false);
  const finishedRef=React.useRef(false);
  const flightBusyRef=React.useRef(false);
  const pressureDebtRef=React.useRef(0);
  const timedDebtRef=React.useRef(0);
  const finishRef=React.useRef(null);
  const tickClockRef=React.useRef(null);
  const pressureClockRef=React.useRef(Date.now());
  const runRef=React.useRef({
    board:board,
    pendingRow:pendingRow,
    seed:seed,
    waveIndex:waveIndex,
    rowOffset:rowOffset,
    pressure:pressure,
    pressureStep:pressureStep,
    score:score,
    shotsLeft:shotsLeft,
    shotsFired:shotsFired,
    mode:mode,
    timeLeft:timeLeft,
    powerups:powerups
  });
  const bubbleRef=React.useRef({
    current:currentBubble,
    next:nextBubble
  });
  const shotAdvanceRef=React.useRef(null);
  const highScore=snapshot?.bubbo?.highScore||0;
  const savedRun=snapshot?.bubbo?.currentGame||null;
  const isPlaying=gameActive&&!paused;
  const pressureLabel=getBubboPressureLabel({
    dangerRows:getBubboDangerRows(board),
    pressureStep:pressureStep
  });
  const pressureValue=t(`bubbo.pressure.${pressureLabel.tone}`);
  const currentMode=BUBBO_MODES.find(xe=>xe.id===mode)||BUBBO_MODES[0];
  const primaryLimitLabel=t(mode==="timed"?"common.time":"common.shots");
  const primaryLimitValue=mode==="timed"?timeLeft:shotsLeft;
  const currentReward=score>0?calcBubboReward(Number(score)||0):0;
  const pauseRun=React.useCallback(()=>{
    gameActive&&(tickClockRef.current?.(), setPaused(true))
  }, [gameActive]);
  const shellControls=React.useMemo(()=>({
    activeRun:gameActive,
    pauseRun:pauseRun,
    hudState:{
      score:score,
      shotsLeft:shotsLeft,
      pressureLabel:pressureValue,
      currentReward:currentReward
    }
  }), [currentReward, gameActive, pauseRun, pressureValue, score, shotsLeft]);
  useImmersiveGame("bubbo", true, shellControls);
  React.useEffect(()=>{
    runRef.current={
      board:board,
      pendingRow:pendingRow,
      seed:seed,
      waveIndex:waveIndex,
      rowOffset:rowOffset,
      pressure:pressure,
      pressureStep:pressureStep,
      score:score,
      shotsLeft:shotsLeft,
      shotsFired:shotsFired,
      mode:mode,
      timeLeft:timeLeft,
      powerups:powerups
    }
  }, [board, mode, pendingRow, powerups, pressure, pressureStep, rowOffset, score, seed, shotsFired, shotsLeft, timeLeft, waveIndex]);
  React.useEffect(()=>{
    bubbleRef.current={
      current:currentBubble,
      next:nextBubble
    }
  }, [currentBubble, nextBubble]);
  const start=React.useCallback(async(xe=mode)=>{
    if(!startingRef.current){
      startingRef.current=true;
      setStarting(true);
      setError("");
      try{
        const be=createBubboRun(null, {
          mode:xe
        });
        const Qe=await performAction("bubbo.start", {
          mode:be.mode,
          shotsLeft:be.shotsLeft,
          shotsFired:be.shotsFired,
          timeLeft:be.timeLeft,
          board:be.board,
          pendingRow:be.pendingRow,
          seed:be.seed,
          waveIndex:be.waveIndex,
          rowOffset:be.rowOffset,
          pressure:0,
          pressureStep:0,
          powerups:be.powerups
        }, {
          key:"bubbo.start"
        });
        if(Qe.error){
          setError(Qe.error);
          // This dialog owns the start error; a second fixed notice can cover Exit.
          if(useGameHub.getState().message===Qe.error)useGameHub.getState().clearMessage();
          return
        }
        finishedRef.current=false;
        flightBusyRef.current=false;
        pressureDebtRef.current=0;
        timedDebtRef.current=0;
        setBoard(be.board);
        setPendingRow(be.pendingRow);
        setSeed(be.seed);
        setWaveIndex(be.waveIndex);
        setRowOffset(be.rowOffset||0);
        setPressure(0);
        setPressureStep(0);
        setScore(0);
        setMode(be.mode);
        setTimeLeft(be.timeLeft??BUBBO_TIMED_SECONDS);
        setShotsLeft(be.shotsLeft);
        setShotsFired(0);
        setGameActive(true);
        setPaused(false);
        setRunResult(null);
        pressureClockRef.current=Date.now();
        const ft=randomBubboColor(be.board);
        const ze=randomBubboColor(be.board);
        bubbleRef.current={
          current:ft,
          next:ze
        };
        shotAdvanceRef.current=null;
        setCurrentBubble(ft);
        setNextBubble(ze);
        setSwapCharges(1);
        setPowerups(normalizeBubboPowerups(be.powerups));
        setActivePowerup("");
        setLastShot(null);
      }catch(be){
        setError(be.message||String(be))
      }finally{
        startingRef.current=false;
        setStarting(false);
      }
    }
  }, [mode, performAction]);
  const resumeSavedRun=React.useCallback(()=>{
    if(!savedRun?.board)return;
    finishedRef.current=false;
    flightBusyRef.current=false;
    pressureDebtRef.current=0;
    timedDebtRef.current=0;
    setError("");
    const xe=createBubboRun(savedRun.seed||null, {
      mode:savedRun.mode||mode
    });
    const be=Array.isArray(savedRun.board)?savedRun.board:xe.board;
    const Qe=Array.isArray(savedRun.pendingRow)?savedRun.pendingRow:xe.pendingRow;
    const ft=savedRun.mode||xe.mode;
    const ze=normalizeBubboPowerups(savedRun.powerups??xe.powerups);
    setBoard(be);
    setPendingRow(Qe);
    setSeed(savedRun.seed||xe.seed);
    setWaveIndex(Number.isFinite(Number(savedRun.waveIndex))?Number(savedRun.waveIndex):xe.waveIndex);
    setRowOffset(Number(savedRun.rowOffset)||0);
    setPressure(Number(savedRun.pressure)||0);
    setPressureStep(Number(savedRun.pressureStep)||0);
    setScore(Number(savedRun.score)||0);
    setMode(ft);
    setTimeLeft(Number.isFinite(Number(savedRun.timeLeft))?Number(savedRun.timeLeft):ft==="timed"?BUBBO_TIMED_SECONDS:null);
    setShotsLeft(Number.isFinite(Number(savedRun.shotsLeft))?Number(savedRun.shotsLeft):BUBBO_SHOTS);
    setShotsFired(Number(savedRun.shotsFired)||0);
    setGameActive(true);
    setPaused(false);
    setRunResult(null);
    pressureClockRef.current=Date.now();
    const Pe=randomBubboColor(be);
    const le=randomBubboColor(be);
    bubbleRef.current={
      current:Pe,
      next:le
    };
    shotAdvanceRef.current=null;
    setCurrentBubble(Pe);
    setNextBubble(le);
    setSwapCharges(1);
    setPowerups(ze);
    setActivePowerup("");
    setLastShot(null);
  }, [mode, savedRun]);
  const swapBubbles=React.useCallback(()=>{
    if(!gameActive||paused||flightBusyRef.current||swapCharges<=0)return;
    const xe=bubbleRef.current.current;
    const be=bubbleRef.current.next;
    bubbleRef.current={
      current:be,
      next:xe
    };
    setCurrentBubble(be);
    setNextBubble(xe);
    setSwapCharges(Qe=>Math.max(0, Qe-1));
    audioManager.play("tap");
    pushEvent({
      game:"bubbo",
      title:t("bubbo.swap"),
      value:`${swapCharges-1}`,
      tone:"success"
    });
  }, [gameActive, paused, pushEvent, swapCharges, t]);
  const finish=React.useCallback((xe=score, be=false)=>{
    if(finishedRef.current)return;
    finishedRef.current=true;
    flightBusyRef.current=false;
    const Qe=runRef.current;
    const ft=Qe.mode||mode;
    const ze=getBubboPressureLabel({
      dangerRows:getBubboDangerRows(Qe.board),
      pressureStep:Qe.pressureStep
    });
    setRunResult({
      score:xe,
      mode:ft,
      limitLabelKey:ft==="timed"?"common.time":"common.shots",
      limitValue:ft==="timed"?Math.max(0, Number(Qe.timeLeft)||0):Math.max(0, Number(Qe.shotsLeft)||0),
      shotsFired:Math.max(0, Number(Qe.shotsFired)||0),
      bubbles:getBubboRemainingCount(Qe.board),
      pressureTone:ze.tone
    });
    setGameActive(false);
    setPaused(false);
    performAction("bubbo.end", {
      score:xe,
      fromQuit:be
    }, {
      key:"bubbo.end"
    });
  }, [mode, performAction, score]);
  finishRef.current=finish;
  React.useEffect(()=>{
    if(!isPlaying){
      pressureClockRef.current=Date.now();
      return
    }
    pressureClockRef.current=Date.now();
    const xe=()=>{
      const Qe=Date.now();
      const ft=Math.min(1e3, Math.max(0, Qe-pressureClockRef.current));
      pressureClockRef.current=Qe;
      let ze=runRef.current;
      const Pe=advanceBubboClock({
        timedDebt:timedDebtRef.current,
        pressureDebt:pressureDebtRef.current
      }, ft, {
        mode:ze.mode,
        timeLeft:ze.timeLeft,
        flightBusy:flightBusyRef.current
      });
      if(timedDebtRef.current=Pe.clock.timedDebt, pressureDebtRef.current=Pe.clock.pressureDebt, Pe.timeLeft!==ze.timeLeft&&(ze={
        ...ze,
        timeLeft:Pe.timeLeft
      }, runRef.current=ze, setTimeLeft(Pe.timeLeft), Pe.timeLeft<=0)){
        finishRef.current?.(ze.score);
        return
      }
      if(!Pe.pressureElapsed)return;
      const le=advanceBubboPressure(ze, Pe.pressureElapsed);
      if(pressureDebtRef.current=0, runRef.current={
        ...ze,
        ...le
      }, setPressure(le.pressure), setPressureStep(le.pressureStep||0), !le.shifts)return;
      setBoard(le.board);
      setPendingRow(le.pendingRow);
      setWaveIndex(le.waveIndex);
      setRowOffset(le.rowOffset||0);
      const va={
        id:`pressure_${Qe}_${le.waveIndex}`,
        shifted:le.shifts,
        popped:[],
        dropped:le.dropped||[]
      };
      setLastShot(va);
      performAction("bubbo.sync", {
        game:{
          score:ze.score,
          shotsLeft:ze.shotsLeft,
          shotsFired:ze.shotsFired,
          mode:ze.mode,
          timeLeft:ze.timeLeft,
          board:le.board,
          pendingRow:le.pendingRow,
          seed:le.seed,
          waveIndex:le.waveIndex,
          rowOffset:le.rowOffset||0,
          pressure:le.pressure,
          pressureStep:le.pressureStep||0,
          powerups:ze.powerups
        }
      }, {
        silent:true,
        key:`bubbo.pressure.${Qe}`
      });
      (le.danger||le.overflow)&&finishRef.current?.(ze.score);
    };
    tickClockRef.current=xe;
    const be=window.setInterval(xe, 100);
    return()=>{
      window.clearInterval(be);
      tickClockRef.current===xe&&(tickClockRef.current=null);
    }
  }, [isPlaying, performAction]);
  const advanceBubbleQueue=React.useCallback(xe=>{
    if(!gameActive||paused)return;
    const be=bubbleRef.current.next||randomBubboColor(runRef.current.board);
    const Qe=randomBubboColor(runRef.current.board);
    const ft=activePowerup&&(powerups[activePowerup]||0)>0?activePowerup:"";
    shotAdvanceRef.current={
      color:xe||bubbleRef.current.current,
      powerup:ft
    };
    bubbleRef.current={
      current:be,
      next:Qe
    };
    setCurrentBubble(be);
    setNextBubble(Qe);
  }, [activePowerup, gameActive, paused, powerups]);
  const fireBubble=React.useCallback((xe, be, Qe=[], ft=currentBubble)=>{
    if(!gameActive||paused||finishedRef.current)return;
    const ze=ft||currentBubble;
    const Pe=shotAdvanceRef.current?.powerup||(activePowerup&&(powerups[activePowerup]||0)>0?activePowerup:"");
    let le=Pe?resolveBubboPowerup({
      board:board,
      pendingRow:pendingRow,
      seed:seed,
      waveIndex:waveIndex,
      rowOffset:rowOffset,
      pressure:pressure,
      pressureStep:pressureStep
    }, Pe, xe, be, ze):resolveBubboShot({
      board:board,
      pendingRow:pendingRow,
      seed:seed,
      waveIndex:waveIndex,
      rowOffset:rowOffset,
      pressure:pressure,
      pressureStep:pressureStep
    }, ze, xe, be);
    if(le.error){
      shotAdvanceRef.current=null;
      return
    }
    le.recovered&&(pressureDebtRef.current=0);
    const va=score+le.points;
    const Ka=mode==="timed"?shotsLeft:Math.max(0, shotsLeft-1);
    const wn=shotsFired+1;
    const In=pressureDebtRef.current;
    pressureDebtRef.current=0;
    const Ji=mode==="classic"&&Ka<=0||mode==="timed"&&timeLeft<=0;
    if(In&&!le.recovered&&!le.danger&&!le.overflow&&!Ji){
      const it=advanceBubboPressure({
        ...runRef.current,
        ...le
      }, In);
      le={
        ...le,
        ...it,
        dropped:[...le.dropped||[], ...it.dropped||[]]
      }
    }
    const Fn=Pe?normalizeBubboPowerups({
      ...powerups,
      [Pe]:Math.max(0, (Number(powerups[Pe])||0)-1)
    }):powerups;
    const aa={
      id:`${Date.now()}_${Math.random().toString(36).slice(2)}`,
      color:ze,
      powerup:Pe||null,
      path:Qe,
      landed:le.landed,
      shifted:le.shifts||0,
      popped:le.popped,
      dropped:le.dropped
    };
    runRef.current={
      ...runRef.current,
      ...le,
      score:va,
      shotsLeft:Ka,
      shotsFired:wn,
      powerups:Fn
    };
    const dt=shotAdvanceRef.current?.color===ze;
    if(shotAdvanceRef.current=null, setBoard(le.board), setPendingRow(le.pendingRow), setWaveIndex(le.waveIndex), setRowOffset(le.rowOffset||0), setPressure(le.pressure), setPressureStep(le.pressureStep||0), setScore(va), setShotsLeft(Ka), setShotsFired(wn), setPowerups(Fn), Pe&&setActivePowerup(""), setLastShot(aa), !dt){
      const it=nextBubble;
      const ya=randomBubboColor(le.board);
      bubbleRef.current={
        current:it,
        next:ya
      };
      setCurrentBubble(it);
      setNextBubble(ya);
    }
    audioManager.play(le.popped.length||le.dropped.length?"clear":"tap");
    (le.popped.length||le.dropped.length)&&pushEvent({
      game:"bubbo",
      title:Pe?t("bubbo.powerupEvent", {
        powerup:t(`bubbo.powerup.${Pe}`)
      }):t("bubbo.clearEvent"),
      value:`+${le.points}`,
      tone:"success"
    });
    performAction("bubbo.sync", {
      game:{
        score:va,
        shotsLeft:Ka,
        shotsFired:wn,
        mode:mode,
        timeLeft:timeLeft,
        board:le.board,
        pendingRow:le.pendingRow,
        seed:seed,
        waveIndex:le.waveIndex,
        rowOffset:le.rowOffset||0,
        pressure:le.pressure,
        pressureStep:le.pressureStep||0,
        powerups:Fn
      }
    }, {
      silent:true,
      key:`bubbo.sync.${aa.id}`
    });
    (mode==="classic"&&Ka<=0||mode==="timed"&&timeLeft<=0||le.danger||le.overflow||isBubboDanger(le.board))&&finish(va);
  }, [activePowerup, board, currentBubble, finish, gameActive, paused, mode, nextBubble, pendingRow, performAction, powerups, pressure, pressureStep, pushEvent, rowOffset, score, seed, shotsFired, shotsLeft, t, timeLeft, waveIndex]);
  const sceneState=React.useMemo(()=>({
    bubbo:{
      board:board,
      pendingRow:pendingRow,
      score:score,
      mode:mode,
      timeLeft:timeLeft,
      shotsLeft:shotsLeft,
      shotsFired:shotsFired,
      gameActive:isPlaying,
      current:currentBubble,
      next:nextBubble,
      powerups:powerups,
      activePowerup:activePowerup,
      lastShot:lastShot,
      pressureStep:pressureStep,
      pressureLabel:pressureValue,
      aimAssist:true,
      seed:seed,
      waveIndex:waveIndex,
      rowOffset:rowOffset,
      bottomHudReserve:true,
      statusText:`${t(currentMode.labelKey)} · ${score} ${t("common.score").toLowerCase()} · ${primaryLimitValue} ${primaryLimitLabel.toLowerCase()}`
    },
    onBubboFire:fireBubble,
    onBubboShotStart:advanceBubbleQueue
  }), [activePowerup, board, currentBubble, currentMode.labelKey, isPlaying, lastShot, mode, nextBubble, fireBubble, advanceBubbleQueue, pendingRow, powerups, pressureStep, pressureValue, primaryLimitLabel, primaryLimitValue, rowOffset, score, seed, shotsFired, shotsLeft, timeLeft, waveIndex, t]);
  return jsxRuntime.jsx(BubboPresentation, {
    sceneState:sceneState,
    gameActive:gameActive,
    paused:paused,
    runResult:runResult,
    mode:mode,
    onMode:setMode,
    onStart:start,
    onResumeSaved:resumeSavedRun,
    savedRun:savedRun,
    onPause:pauseRun,
    onResume:()=>setPaused(false),
    onFinish:()=>finish(score),
    onExit:exitToHub,
    onSwap:swapBubbles,
    onPower:xe=>{
      isPlaying&&!flightBusyRef.current&&setActivePowerup(be=>be===xe?"":xe)
    },
    swapCharges:swapCharges,
    currentReward:currentReward,
    highScore:highScore,
    starting:starting,
    error:error,
    onBusy:xe=>{
      flightBusyRef.current=xe
    }
  })
}

export default BubboGame;
