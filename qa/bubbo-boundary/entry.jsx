import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import BubboField from '../../src/games/bubbo/BubboField.jsx';
import {composeBubbo,bubboFieldGeometry} from '../../src/games/bubbo/bubboComposition.js';
import {createBubboRun,resolveBubboShot,isBubboDanger} from '../../src/game-core/bubbo/engine.js';
import {bubboCellCenter} from '../../src/games/bubbo/bubboAim.js';
import '../../src/games/bubbo/bubbo-presentation.css';

function App(){
  const [state,setState]=useState({...createBubboRun('bounded-field-qa'),current:'mint',next:'sky',gameActive:true,runActive:true});
  const composition=composeBubbo({width:innerWidth,height:innerHeight,safe:{top:12,bottom:16,left:4,right:4}});
  const field=composition.field;
  const change=patch=>flushSync(()=>setState(previous=>({...previous,...patch})));
  window.bubboQA={
    tokenCount:state.board.flat().filter(Boolean).length+(state.pendingRow||[]).filter(Boolean).length,
    setBoundary(row,pressureStep){
      const board=Array.from({length:11},(_,r)=>Array.from({length:9},(_,c)=>c===4&&r<=row?(r%2?'coral':'sky'):null));
      change({board,pressureStep,lastShot:null});
    },
    reset(){change({...createBubboRun('bounded-field-qa'),lastShot:null,current:'mint'});},
    pause(){change({gameActive:false});},
    diagnostics(){
      const canvas=document.querySelector('.bb-field'),g=bubboFieldGeometry(field.width,field.height),rect=canvas?.getBoundingClientRect();
      const occupied=state.board.flatMap((r,row)=>r.flatMap((color,col)=>color?[{row,col,...bubboCellCenter(g,row,col,state.rowOffset,state.pressureStep)}]:[]));
      return{geometry:g,composition,occupied,danger:isBubboDanger(state.board),shots:state.shotsFired,
        fx:canvas?.dataset.bubboFx?JSON.parse(canvas.dataset.bubboFx):null,
        rect:rect?.toJSON(),computed:canvas?{width:getComputedStyle(canvas).width,height:getComputedStyle(canvas).height,transform:getComputedStyle(canvas).transform}:null};
    }
  };
  const onFire=(row,col,path,color)=>setState(previous=>{
    const result=resolveBubboShot(previous,color,row,col);
    return{...previous,...result,shotsFired:previous.shotsFired+1,lastShot:{id:'shot-'+(previous.shotsFired+1),landed:result.landed,popped:result.popped,dropped:result.dropped,color}};
  });
  return <div className="bb-stage">
    <div className="bb-background"><img src={'/games/bubbo-v2/'+(composition.landscape?'background':'background-portrait')+'.webp'}/><span/></div>
    <div style={{position:'absolute',left:8,top:6,zIndex:5,fontSize:12}}>Bubbo field QA • actual component and engine</div>
    <div className="bb-playfield" style={{position:'absolute',...field}}>
      <BubboField state={state} width={field.width} height={field.height} onFire={onFire} onPause={()=>change({gameActive:false})} nextLabel="Next" canvasLabel="Bubbo field" loadingLabel="Loading" loadErrorLabel="Art load failed"/>
    </div>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);
