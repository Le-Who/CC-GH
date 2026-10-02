/** Elapsed-time clock and interruptible projectile state.
 * Recovered from the owned Bubbo v2 review build; see recovery manifest.
 * React and app services are imports from the production app, never bundled copies.
 */
import {pathMetrics,remapBubboPath} from './bubboAim.js';

function advanceBubboClock(clock, elapsed, {
  mode:mode,
  timeLeft:timeLeft,
  flightBusy:flightBusy=false,
  playing:playing=true
}={
}){
  if(!playing)return{
    clock:{
      ...clock
    },
    timeLeft:timeLeft,
    pressureElapsed:0
  };
  const dt=Math.max(0, Math.min(1e3, Number(elapsed)||0));
  let timedDebt=(clock.timedDebt||0)+(mode==="timed"?dt:0);
  let pressureDebt=(clock.pressureDebt||0)+dt;
  const seconds=mode==="timed"?Math.floor(timedDebt/1e3):0;
  timedDebt-=seconds*1e3;
  const remaining=mode==="timed"?Math.max(0, Number(timeLeft)-seconds):timeLeft;
  const pressureElapsed=flightBusy?0:pressureDebt;
  return flightBusy||(pressureDebt=0),
  {
    clock:{
      timedDebt:timedDebt,
      pressureDebt:pressureDebt
    },
    timeLeft:remaining,
    pressureElapsed:pressureElapsed
  }
}
function createBubboFlight(shot, geometry, color, powerup=""){
  const length=pathMetrics(shot.path).total;
  return{
    ...shot,
    geometry:geometry,
    progress:0,
    duration:Math.max(200, Math.min(780, length/Math.max(500, geometry.cell*22)*1e3)),
    color:color,
    powerup:powerup
  }
}
function advanceBubboFlight(flight, elapsed, playing){
  if(!flight)return{
    flight:null,
    done:false
  };
  const next=playing?{
    ...flight,
    progress:Math.min(1, flight.progress+Math.max(0, Number(elapsed)||0)/flight.duration)
  }:flight;
  return{
    flight:next,
    done:playing&&next.progress>=1
  }
}
function resizeBubboFlight(flight, geometry){
  return{
    ...flight,
    path:remapBubboPath(flight.path, flight.geometry, geometry),
    geometry:geometry
  }
}

export {advanceBubboClock, createBubboFlight, advanceBubboFlight, resizeBubboFlight};
