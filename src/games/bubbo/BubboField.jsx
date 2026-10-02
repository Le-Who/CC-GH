/** Canvas field: shared guide/collision trace, pointer cleanup and real projectile animation.
 * Recovered from the owned Bubbo v2 review build; see recovery manifest.
 * React and app services are imports from the production app, never bundled copies.
 */
import * as React from 'react';
import {acquireGameGesture} from '../../platform/telegram.js';
import * as jsxRuntime from 'react/jsx-runtime';
import {bubboFieldGeometry} from './bubboComposition.js';
import {BUBBO_TOKEN_ART, bubboArtUrl} from './bubboArt.js';
import {angleFromBubboPointer, traceBubboShot, bubboCellCenter, pointAlongBubboPath, bubboKeyboardIntent} from './bubboAim.js';
import {createBubboFlight, advanceBubboFlight, resizeBubboFlight} from './bubboMotion.js';

const BubboField=React.forwardRef(function({
  state:state,
  width:width,
  height:height,
  onShotStart:onShotStart,
  onFire:onFire,
  onPause:onPause,
  onBusy:onBusy,
  onAim:onAim,
  canvasLabel:canvasLabel,
  nextLabel:nextLabel,
  loadingLabel:loadingLabel,
  loadErrorLabel:loadErrorLabel,
  retryLabel:retryLabel
}, forwardedRef){
  const canvasRef=React.useRef(null);
  const propsRef=React.useRef({
    state:state,
    width:width,
    height:height,
    onShotStart:onShotStart,
    onFire:onFire,
    onPause:onPause,
    onBusy:onBusy,
    onAim:onAim
  });
  const sessionRef=React.useRef({
    angle:-Math.PI/2,
    pointer:null,
    flight:null,
    effects:[],
    shotId:null,
    seed:state.seed,
    trace:null,
    signature:""
  });
  const[loading, setLoading]=React.useState(true);
  const[loadError, setLoadError]=React.useState(false);
  propsRef.current={
    state:state,
    width:width,
    height:height,
    onShotStart:onShotStart,
    onFire:onFire,
    onPause:onPause,
    onBusy:onBusy,
    onAim:onAim
  };
  function aimFromPointer(F){
    const re=canvasRef.current;
    const Me=re.getBoundingClientRect();
    const _=bubboFieldGeometry(propsRef.current.width, propsRef.current.height);
    sessionRef.current.angle=angleFromBubboPointer(_, (F.clientX-Me.left)*_.width/Me.width, (F.clientY-Me.top)*_.height/Me.height);
    sessionRef.current.signature="";
    propsRef.current.onAim?.(Math.round(sessionRef.current.angle*180/Math.PI+90));
  }
  function cancelPointer(){
    const F=sessionRef.current;
    const re=F.pointer;
    F.pointer=null;
    F.signature="";
    re!=null&&canvasRef.current?.hasPointerCapture?.(re)&&canvasRef.current.releasePointerCapture(re);
  }
  // Arm the native host before the first touch: waiting for pointerdown can
  // lose the initial downward gesture to Telegram's sheet recognizer.
  React.useLayoutEffect(()=>{
    if(!state.gameActive||loading||loadError)return;
    const releaseGesture=acquireGameGesture();
    return ()=>{
      cancelPointer();
      releaseGesture();
    };
  }, [state.gameActive, loading, loadError]);
  function fire(){
    const F=propsRef.current;
    const re=sessionRef.current;
    if(!F.state.gameActive||re.flight||loading||loadError)return;
    const Me=bubboFieldGeometry(F.width, F.height);
    const _=traceBubboShot(F.state, Me, re.angle);
    _&&(re.flight=createBubboFlight(_, Me, F.state.current, F.state.activePowerup), re.signature="", F.onBusy?.(true), F.onShotStart?.(re.flight.color))
  }
  React.useImperativeHandle(forwardedRef, ()=>({
    fire:fire,
    focus:()=>canvasRef.current?.focus()
  }));
  React.useEffect(()=>{
    const F=canvasRef.current;
    if(!F)return;
    let re=0;
    let Me=0;
    let _=false;
    const M=F.getContext("2d", {
      alpha:true
    });
    if(!M){
      setLoadError(true);
      setLoading(false);
      return
    }
    const ue={
    };
    let ge=false;
    Promise.all([...BUBBO_TOKEN_ART, "cannon", "bomb", "rainbow", "lightning"].map(k=>new Promise((j, $)=>{
      const Q=new Image;
      ue[k]=Q;
      Q.onload=j;
      Q.onerror=$;
      Q.src=bubboArtUrl(k);
    }))).then(()=>{
      _||(ge=true, setLoading(false))
    }).catch(()=>{
      _||(setLoadError(true), setLoading(false))
    });
    const me=window.matchMedia("(prefers-reduced-motion: reduce)");
    const v=(k, j, $, Q, Y=1)=>{
      const Z=ue[k];
      !Z?.complete||!Z.naturalWidth||(M.save(), M.globalAlpha=Y, M.drawImage(Z, j-Q/2, $-Q/2, Q, Q), M.restore())
    };
    const O=k=>{
      if(_)return;
      re=requestAnimationFrame(O);
      const j=Me?Math.min(1e3, k-Me):0;
      Me=k;
      const $=propsRef.current;
      const Q=$.state;
      const Y=sessionRef.current;
      const Z=bubboFieldGeometry($.width, $.height);
      const je=Math.min(3, Math.max(1, window.devicePixelRatio||1));
      if((F.width!==Math.round(Z.width*je)||F.height!==Math.round(Z.height*je))&&(cancelPointer(), F.width=Math.round(Z.width*je), F.height=Math.round(Z.height*je), Y.signature=""), M.setTransform(je, 0, 0, je, 0, 0), M.clearRect(0, 0, Z.width, Z.height), (Y.seed!==Q.seed||!Q.runActive&&Y.flight)&&(Y.seed=Q.seed, Y.flight=null, Y.effects=[], Y.angle=-Math.PI/2, Y.signature="", cancelPointer(), $.onBusy?.(false)), (!Q.gameActive||document.hidden)&&Y.pointer!=null&&cancelPointer(), Y.flight&&(Y.flight.geometry.width!==Z.width||Y.flight.geometry.height!==Z.height)&&(Y.flight=resizeBubboFlight(Y.flight, Z)), F.dataset.bubboGeometry=JSON.stringify(Z), F.dataset.flight=Y.flight?"true":"false", F.dataset.shots=String(Q.shotsFired||0), F.dataset.ready=String(ge), !ge)return;
      M.strokeStyle="#8cdfe544";
      M.lineWidth=1;
      M.beginPath();
      M.moveTo(Z.left, 2);
      M.lineTo(Z.left, Z.dangerY+Z.step);
      M.moveTo(Z.right, 2);
      M.lineTo(Z.right, Z.dangerY+Z.step);
      M.stroke();
      M.save();
      M.strokeStyle="#ff9a88";
      M.globalAlpha=.7;
      M.lineWidth=1.7;
      M.setLineDash([7, 7]);
      M.beginPath();
      M.moveTo(Z.left, Z.dangerY);
      M.lineTo(Z.right, Z.dangerY);
      M.stroke();
      M.restore();
      const oe=Q.pressureStep||0;
      for(let fe=-1; fe<11; fe++)for(let Se=0; Se<9; Se++){
        const Xe=fe===-1?Q.pendingRow?.[Se]:Q.board?.[fe]?.[Se];
        if(!Xe)continue;
        const _t=bubboCellCenter(Z, fe, Se, Q.rowOffset, oe);
        v(Xe, _t.x, _t.y, Z.cell*.99, fe===-1?.8:1)
      }
      if(Q.lastShot?.id&&Q.lastShot.id!==Y.shotId){
        Y.shotId=Q.lastShot.id;
        for(const fe of[...Q.lastShot.popped||[], ...Q.lastShot.dropped||[]].slice(0, 40))Y.effects.push({
          ...fe,
          age:0,
          drop:(Q.lastShot.dropped||[]).some(Se=>Se.row===fe.row&&Se.col===fe.col),
          color:fe.color||Q.lastShot.color||"sky"
        })
      }
      if(Q.gameActive){
        Y.effects=Y.effects.filter(fe=>fe.age<650);
        for(const fe of Y.effects)fe.age+=j
      }
      for(const fe of Y.effects){
        const Se=bubboCellCenter(Z, fe.row, fe.col, Q.rowOffset, oe);
        const Xe=fe.age/650;
        fe.drop?v(fe.color, Se.x+(me.matches?0:Math.sin(fe.col+fe.age*.01)*Z.cell*.18), Se.y+Xe*Xe*Z.cell*3, Z.cell*(1-Xe*.3), 1-Xe):(M.save(), M.strokeStyle="#fff3b3", M.globalAlpha=1-Xe, M.lineWidth=2, M.beginPath(), M.arc(Se.x, Se.y, Z.radius*(.65+Xe*.8), 0, Math.PI*2), M.stroke(), M.restore())
      }
      const ht=JSON.stringify([Q.board, Q.pendingRow, Q.current, Q.rowOffset, oe, Y.angle, Z.width, Z.height]);
      if(!Y.flight&&ht!==Y.signature&&(Y.signature=ht, Y.trace=traceBubboShot(Q, Z, Y.angle)), Q.gameActive&&!Y.flight&&Y.trace){
        const fe=Y.trace;
        M.save();
        M.strokeStyle="#d7ffff";
        M.lineWidth=2.5;
        M.lineCap="round";
        M.setLineDash([1, Math.max(9, Z.cell*.34)]);
        M.globalAlpha=.8;
        M.beginPath();
        fe.path.forEach((Se, Xe)=>Xe?M.lineTo(Se.x, Se.y):M.moveTo(Se.x, Se.y));
        M.stroke();
        M.setLineDash([]);
        M.lineWidth=1.5;
        M.globalAlpha=.85;
        M.beginPath();
        M.arc(fe.x, fe.y, Z.radius*.83, 0, Math.PI*2);
        M.stroke();
        M.restore();
        F.dataset.target=JSON.stringify({
          row:fe.row,
          col:fe.col,
          bounces:fe.bounces
        });
      }
      if(v("cannon", Z.cannonX, Z.cannonY+6, Math.max(52, Math.min(80, Z.cell*1.85))), Y.flight||v(Q.activePowerup||Q.current, Z.cannonX, Z.cannonY, Math.max(22, Z.cell*.9)), v(Q.next, Z.cannonX+Math.max(48, Z.cell*1.7), Z.cannonY, Math.max(22, Z.cell*.68)), M.fillStyle="#e3f7ec", M.font="700 10px Nunito, sans-serif", M.textAlign="center", M.fillText(nextLabel, Z.cannonX+Math.max(48, Z.cell*1.7), Z.cannonY+Math.max(22, Z.cell*.45)), Y.flight){
        const fe=advanceBubboFlight(Y.flight, j, Q.gameActive&&!document.hidden);
        Y.flight=fe.flight;
        const Se=Y.flight;
        const Xe=pointAlongBubboPath(Se.path, Se.progress);
        v(Se.powerup||Se.color, Xe.x, Xe.y, Z.cell*.99);
        fe.done&&(Y.flight=null, Y.signature="", $.onFire?.(Se.row, Se.col, Se.path, Se.color), $.onBusy?.(false));
      }
    };
    re=requestAnimationFrame(O);
    const D=()=>{
      cancelPointer();
      propsRef.current.state.gameActive&&propsRef.current.onPause?.();
    };
    const G=()=>{
      document.hidden&&D()
    };
    return window.addEventListener("blur", D),
    document.addEventListener("visibilitychange", G),
    ()=>{
      _=true;
      cancelAnimationFrame(re);
      window.removeEventListener("blur", D);
      document.removeEventListener("visibilitychange", G);
      cancelPointer();
    }
  }, []);
  const onPointerDown=F=>{
    !state.gameActive||sessionRef.current.flight||loading||F.button>0||F.isPrimary===false||(F.preventDefault(), canvasRef.current.focus({
      preventScroll:true
    }), sessionRef.current.pointer=F.pointerId, canvasRef.current.setPointerCapture(F.pointerId), aimFromPointer(F))
  };
  const onPointerMove=F=>{
    sessionRef.current.pointer===F.pointerId&&aimFromPointer(F)
  };
  const onPointerUp=F=>{
    if(sessionRef.current.pointer!==F.pointerId)return;
    const re=canvasRef.current.getBoundingClientRect();
    const Me=F.clientX>=re.left&&F.clientX<=re.right&&F.clientY>=re.top&&F.clientY<=re.bottom;
    cancelPointer();
    Me&&(aimFromPointer(F), fire());
  };
  const onKeyDown=F=>{
    if(!state.gameActive)return;
    const re=bubboKeyboardIntent(F.key, sessionRef.current.angle, F);
    re&&(F.preventDefault(), re.type==="pause"?onPause():re.type==="fire"?fire():(sessionRef.current.angle=re.angle, sessionRef.current.signature="", onAim?.(Math.round(re.angle*180/Math.PI+90))))
  };
  return jsxRuntime.jsxs("div", {
    className:"bb-field-wrap",
    children:[jsxRuntime.jsx("canvas", {
      ref:canvasRef,
      className:"bb-field",
      "data-testid":"bb-field",
      role:"application",
      "aria-label":canvasLabel,
      "aria-describedby":"bb-aim-help",
      tabIndex:state.gameActive?0:-1,
      onKeyDown:onKeyDown,
      onPointerDown:onPointerDown,
      onPointerMove:onPointerMove,
      onPointerUp:onPointerUp,
      onPointerCancel:cancelPointer,
      onLostPointerCapture:cancelPointer
    }), (loading||loadError)&&jsxRuntime.jsx("div", {
      className:"bb-runtime-state",
      role:loadError?"alert":"status",
      children:loadError?jsxRuntime.jsxs(jsxRuntime.Fragment, {
        children:[jsxRuntime.jsx("span", {
          children:loadErrorLabel
        }), jsxRuntime.jsx("button", {
          type:"button",
          onClick:()=>location.reload(),
          children:retryLabel
        })]
      }):jsxRuntime.jsx("span", {
        children:loadingLabel
      })
    })]
  })
});

export default BubboField;
