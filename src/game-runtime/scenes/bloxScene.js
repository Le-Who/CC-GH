/** Recovered game-only source from the owned Blox v2 r2 preview. See recovery manifest. */
import {Texture,NineSliceSprite,Rectangle} from 'pixi.js';
import {createFeedbackTrack} from './feedbackTrack.js';
import {spriteFit,Container,makeRafScheduler,centeredPieceOrigin,clear,GRID,bloxGhostOrigin,canPlaceBloxPiece,strokedRect,label,AMBER,MINT,bloxAnchorCellFromDrag,bloxDragVisualPoint,CORAL,createPointerSession,viewWidth,viewHeight,rect,publishCanvasAssetLayout,applyHudAssetRegion,makeInteractive,publishCanvasLayout,PANEL,createBloxDragState,setupStage} from './shared/runtime.js';
import {previewBloxPlacement} from '../../../game-logic/blox-engine.js';
import {bloxArtUrl,bloxTileAsset,BLOX_NINE_SLICE} from '../../games/blox/bloxArt.js';
import {composeBlox} from '../../games/blox/bloxComposition.js';
import {bloxTrayPieceLayout} from '../../games/blox/bloxInteraction.js';

function createBloxFrame(bounds, skin="frame"){
  const texture=Texture.from(bloxArtUrl(skin));
  const[left, top, right, bottom]=BLOX_NINE_SLICE[skin].source;
  const scale=BLOX_NINE_SLICE[skin].destination[0]/left;
  const frame=new NineSliceSprite({
    texture:texture,
    leftWidth:left,
    topHeight:top,
    rightWidth:right,
    bottomHeight:bottom,
    width:bounds.width/scale,
    height:bounds.height/scale
  });
  return frame.scale.set(scale),
  frame.anchor.set(.5),
  frame.position.set(bounds.left+bounds.width/2, bounds.top+bounds.height/2),
  frame.eventMode="none",
  frame
}
function buildBloxScene(app, initial={
}){
  const root=new Container;
  const dragLayer=new Container;
  const effects=new Container;
  app.stage.addChild(root, dragLayer, effects);
  let data=initial;
  let layout=null;
  let drag=null;
  let lastTraySignature="";
  let destroyed=false, feedbackEpoch=0, background=false;
  const motionMedia=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const feedback=createFeedbackTrack(effects,{limit:48,now:()=>performance.now()});
  // One cosmetic view per cleared cell, independent of the authoritative board.
  const clearing=new Map();
  let motionObservation=null;
  const reduced=()=>!!motionMedia?.matches;
  const animate=(node,options={},attempt)=>{
    if(destroyed||background||document.visibilityState==='hidden'){node.destroy?.({children:true});return;}
    feedback.add(node,{...options,reduced:reduced()});
    attempt?.nodes.add(node);
    app.ticker.start?.();
  };
  const dragVisual=makeRafScheduler(()=>updateDragVisualNow());
  dragLayer.eventMode="none";
  dragLayer.interactiveChildren=false;
  effects.eventMode="none";
  effects.interactiveChildren=false;
  function tileAssetForPiece(h){
    return bloxTileAsset(h?.color)
  }
  function tileVisualSize(h, T=.96){
    return h*T
  }
  function drawPiece(h, T, _, f, x=1, d={
  }){
    const b=new Container;
    b.eventMode="none";
    b.interactiveChildren=false;
    const C=tileAssetForPiece(h);
    const S=d.visualSize||tileVisualSize(f);
    for(const[U, B]of h.cells||[]){
      const X=spriteFit(C, T+B*f+f/2, _+U*f+f/2, S, S, x);
      X.eventMode="none";
      b.addChild(X);
    }
    return b
  }
  function drawTrayPiece(h, T, _, f, x, d, b=1){
    const C=centeredPieceOrigin(h, T, _, f, x, d);
    return drawPiece(h, C.x, C.y, d, b, {
      visualSize:tileVisualSize(d, .96)
    })
  }
  function touchDragLift(h){
    const T=h?.pointerType||h?.pointer?.pointerType||"";
    const _=typeof window<"u"&&(window.matchMedia?.("(pointer: coarse)")?.matches||navigator.maxTouchPoints>0);
    return T==="mouse"||!_&&T!=="touch"&&T!=="pen"?0:-Math.max(52, Math.min(92, (layout?.cell||24)*2.15))
  }
  function updateDragVisualNow(){
    if(clear(dragLayer), !drag?.piece){app.render?.();return;}
    const h=data.blox||{
    };
    const T=h.board||h.savedState?.board||Array.from({
      length:GRID
    }, ()=>Array(GRID).fill(null));
    const _=layout?.cell||22;
    const f=Math.min(_, 28);
    const x=drag.overCell?_:f;
    const d=bloxGhostOrigin(drag, x);
    const b=drawPiece(drag.piece, d.x, d.y, x, drag.overCell?.72:.76);
    const C=drag.overCell&&canPlaceBloxPiece(T, drag.piece, drag.overCell.row, drag.overCell.col);
    const S=C?previewBloxPlacement({
      board:T,
      tray:[{
        piece:drag.piece,
        placed:false
      }],
      score:h.score||0,
      linesCleared:h.linesCleared||0
    }, {
      pieceIdx:0,
      row:drag.overCell.row,
      col:drag.overCell.col
    }):null;
    if(b.alpha=drag.overCell?.78:.66, dragLayer.addChild(b), drag.overCell){
      // Preview the same cells that will disappear, never a floating full-line beam.
      for(let row=0;row<GRID;row++)for(let col=0;col<GRID;col++){
        if(!S?.clear.rows.includes(row)&&!S?.clear.cols.includes(col))continue;
        dragLayer.addChild(strokedRect(layout.left+col*layout.cell+2,layout.top+row*layout.cell+2,layout.cell-4,layout.cell-4,MINT,4,MINT,.12,2));
      }
      const U=drawPiece(drag.piece, layout.left+drag.overCell.col*layout.cell, layout.top+drag.overCell.row*layout.cell, layout.cell, C?.34:.24);
      U.alpha=C?.74:.52;
      dragLayer.addChild(U);
      for(const[B, X]of drag.piece.cells||[]){
        const u=drag.overCell.row+B;
        const M=drag.overCell.col+X;
        if(u<0||u>=GRID||M<0||M>=GRID)continue;
        const R=layout.left+M*layout.cell+1;
        const H=layout.top+u*layout.cell+1;
        dragLayer.addChild(strokedRect(R, H, layout.cell-2, layout.cell-2, C?5764563:16735608, 3, C?5764563:16735608, .12, 2));
        C||dragLayer.addChild(label("×", R+layout.cell/2, H+layout.cell/2, Math.max(12, layout.cell*.6), 16763603, "800"));
      }
    }
    app.render?.();
  }
  function g(){
    dragVisual.request()
  }
  function removeClear(key){
    const track=clearing.get(key);
    if(!track)return;
    track.node.parent?.removeChild(track.node);
    track.node.destroy?.({children:true});
    clearing.delete(key);
    track.attempt?.nodes.delete(track.node);
  }
  function cancelAttempt(attempt){
    for(const [key,track] of clearing)if(track.attempt===attempt)removeClear(key);
    for(const node of attempt.nodes){
      if(node.destroyed)continue;
      node.parent?.removeChild(node);
      node.destroy?.({children:true});
    }
    attempt.nodes.clear();
  }
  function snapshotBoard(){
    return (data.blox?.board||data.blox?.savedState?.board||[]).map(row=>[...row]);
  }
  function tickClearing(){
    const now=performance.now();
    const smooth=t=>t*t*(3-2*t);
    for(const [key,t] of clearing){
      t.age=Math.max(t.age,now-t.startedAt);
      const elapsed=Math.max(0,t.age-t.delay);
      let scale=1,alpha=1;
      if(t.reduced){
        alpha=1-Math.min(1,elapsed/120);
      }else if(elapsed<55){
        scale=1-.07*smooth(elapsed/55);
      }else if(elapsed<125){
        scale=.93+.15*smooth((elapsed-55)/70);
      }else{
        const p=Math.min(1,(elapsed-125)/165);
        scale=1.08-.73*smooth(p);
        alpha=1-smooth(p);
      }
      t.node.scale.set(t.sx*scale,t.sy*scale);
      t.node.alpha=alpha;
      if(alpha<=0)removeClear(key);
    }
  }
  function placementFeedback(piece,cell,result,before,attempt){
    if(!layout||!cell)return;
    if(result?.error){
      for(const [row,col] of piece.cells||[]){
        const r=cell.row+row,c=cell.col+col;
        if(r<0||c<0||r>=GRID||c>=GRID)continue;
        animate(strokedRect(layout.left+c*layout.cell+2,layout.top+r*layout.cell+2,layout.cell-4,layout.cell-4,CORAL,4,CORAL,.12,2),{duration:190},attempt);
      }
      return;
    }
    const rows=result?.clear?.rows||[],cols=result?.clear?.cols||[];
    const placed=new Map((piece.cells||[]).map(([r,c])=>[`${cell.row+r}:${cell.col+c}`,piece.color]));
    // A fast next placement always takes visual priority over an older clear.
    for(const key of placed.keys())removeClear(key);
    for(const [row,col] of piece.cells||[]){
      const r=cell.row+row,c=cell.col+col;
      if(rows.includes(r)||cols.includes(c))continue;
      const x=layout.left+(c+.5)*layout.cell,y=layout.top+(r+.5)*layout.cell;
      animate(spriteFit(tileAssetForPiece(piece),x,y,tileVisualSize(layout.cell),tileVisualSize(layout.cell),.65),{duration:145,from:1.1,peak:1.025,to:1},attempt);
    }
    if(!result?.clear?.cleared||destroyed||background||document.visibilityState==='hidden')return;
    for(let row=0;row<GRID;row++)for(let col=0;col<GRID;col++){
      if(!rows.includes(row)&&!cols.includes(col))continue;
      const key=`${row}:${col}`,color=placed.get(key)||before?.[row]?.[col];
      if(!color)continue;
      removeClear(key);
      const node=spriteFit(bloxTileAsset(color),layout.left+(col+.5)*layout.cell,layout.top+(row+.5)*layout.cell,tileVisualSize(layout.cell),tileVisualSize(layout.cell),1);
      node.eventMode="none";
      const quiet=reduced();
      // A short wave originates at the placed piece. Every tile is visible from
      // frame one, including the far end of a line and row/column intersections.
      const distance=Math.min(...(piece.cells||[[0,0]]).map(([r,c])=>Math.abs(row-cell.row-r)+Math.abs(col-cell.col-c)));
      attempt?.nodes.add(node);
      clearing.set(key,{node,attempt,sx:node.scale.x,sy:node.scale.y,age:0,startedAt:performance.now(),delay:quiet?0:Math.min(63,distance*7),reduced:quiet});
      effects.addChild(node);
    }
    app.ticker.start?.();
  }
  function G(){
    for(const key of clearing.keys())removeClear(key);
  }
  function publishMotionObservation(){
    if(app.canvas?.dataset&&motionObservation)app.canvas.dataset.bloxMotionTiming=JSON.stringify(motionObservation);
  }
  function beginPlacementFeedback(piece,cell,before,attempt){
    if(!piece)return false;
    const preview=previewBloxPlacement({board:before,tray:[{piece,placed:false}]},{pieceIdx:0,row:cell.row,col:cell.col});
    if(!preview.valid)return false;
    motionObservation={requestedAt:attempt.requestedAt,startedAt:performance.now(),firstFrameAt:null,clearedAt:null,finishedAt:null,frames:0};
    publishMotionObservation();
    placementFeedback(piece,cell,preview,before,attempt);
    return true;
  }
  function F(done){
    if(!drag)return;
    const current=drag;
    const target=done?.cancelled?null:current.overCell||bloxAnchorCellFromDrag(layout,current);
    drag=null;dragVisual.cancel();clear(dragLayer);
    // Cancel is a neutral cleanup, never a selection, rejection, or reward.
    if(done?.cancelled){k();return;}
    if(target&&data.blox?.gameActive){
      const epoch=feedbackEpoch,before=snapshotBoard(),attempt={nodes:new Set(),requestedAt:performance.now()};
      const pending=data.onBloxDrop?.(current.pieceIdx,target.row,target.col);
      const started=pending!==undefined&&epoch===feedbackEpoch&&beginPlacementFeedback(current.piece,target,before,attempt);
      Promise.resolve(pending).then(result=>{
        if(destroyed||epoch!==feedbackEpoch||!result)return;
        if(result.error)cancelAttempt(attempt);
        if(!started||result.error)placementFeedback(current.piece,target,result,before,attempt);
      }).catch(()=>{if(epoch===feedbackEpoch)cancelAttempt(attempt);});
    }else if(current.moved||done?.moved){
      const point=bloxDragVisualPoint(current);
      const returned=drawPiece(current.piece,0,0,Math.min(layout?.cell||22,28),.7);
      returned.position.set(point.x,point.y);
      animate(returned,{duration:180,dx:current.startX-point.x,dy:current.startY-point.y,from:1,peak:.98,to:.94});
    }else data.onBloxTray?.(current.pieceIdx);
    k();
  }
  const O=createPointerSession({
    onMove:h=>{
      drag&&(drag.x=h.x, drag.y=h.y, drag.moved=h.moved, drag.overCell=bloxAnchorCellFromDrag(layout, drag), g())
    },
    onTap:h=>{
      if(h.data?.kind==="blox-cell"){
        const piece=data.blox?.tray?.[data.selectedBloxPiece]?.piece,epoch=feedbackEpoch,before=snapshotBoard(),attempt={nodes:new Set(),requestedAt:performance.now()};
        const result=data.onBloxCell?.(h.data.row,h.data.col);
        const started=result!==undefined&&epoch===feedbackEpoch&&beginPlacementFeedback(piece,h.data,before,attempt);
        if(piece)Promise.resolve(result).then(value=>{
          if(!value||destroyed||epoch!==feedbackEpoch)return;
          if(value.error)cancelAttempt(attempt);
          if(!started||value.error)placementFeedback(piece,h.data,value,before,attempt);
        }).catch(()=>{if(epoch===feedbackEpoch)cancelAttempt(attempt);});
        return
      }
      drag&&(data.onBloxTray?.(drag.pieceIdx), drag=null, dragVisual.cancel(), clear(dragLayer), k())
    },
    onDragEnd:F,
    onCancel:h=>F(h)
  });
  function k(){
    if(destroyed)return;
    root.cacheAsTexture?.(false);
    clear(root);
    const h=data.blox||{
    };
    const T=h.board||h.savedState?.board||Array.from({
      length:GRID
    }, ()=>Array(GRID).fill(null));
    const _=h.tray||h.savedState?.tray||[];
    const f=data.bloxComposition||composeBlox({
      width:viewWidth(app),
      height:viewHeight(app),
      hudLayout:data.hudLayout
    });
    layout=f.board;
    const{
      size:x,
      cell:d,
      left:b,
      top:C,
      frame:S
    }=layout;
    root.addChild(rect(S.left, S.top, S.width, S.height, 463398, 6, 1));
    publishCanvasAssetLayout(app, "bloxBoardFrameAsset", S);
    root.addChild(applyHudAssetRegion(createBloxFrame(S), data, "bloxBoardFrameAsset"));
    for(let u=0; u<GRID; u++)for(let M=0; M<GRID; M++){
      const R=T[u]?.[M];
      const H=R?bloxTileAsset(R):bloxArtUrl("cell");
      const P=spriteFit(H, b+M*d+d/2, C+u*d+d/2, tileVisualSize(d), tileVisualSize(d), 1);
      P.hitArea=new Rectangle(-d/(2*P.scale.x), -d/(2*P.scale.y), d/P.scale.x, d/P.scale.y);
      makeInteractive(P, {
        pointerdown:Y=>{
          h.gameActive&&O.start(Y, {
            kind:"blox-cell",
            row:u,
            col:M
          })
        }
      });
      root.addChild(P);
    }
    const U=f.tray.top;
    publishCanvasLayout(app, "blox", {
      top:C,
      left:b,
      size:x
    });
    app.canvas?.dataset&&(app.canvas.dataset.bloxTrayTop=String(U), app.canvas.dataset.bloxTraySlotWidth=String(f.slots[0].width), app.canvas.dataset.bloxTraySlots=JSON.stringify(f.slots), app.canvas.dataset.puzzleArrangement=f.landscape?"side":"stack");
    publishCanvasAssetLayout(app, "bloxTrayPanelAsset", f.tray);
    const B=_.map(u=>`${u?.piece?.id||"empty"}:${u?.placed?1:0}`).join("|");
    const X=lastTraySignature&&lastTraySignature!==B;
    lastTraySignature=B;
    for(let u=0; u<3; u++){
      const M=_[u];
      const{
        left:R,
        top:H,
        width:P,
        height:Y
      }=f.slots[u];
      const I=bloxTrayPieceLayout(M?.piece, f.slots[u], d);
      const L=I.unit;
      const N={
        x:I.left,
        y:I.top
      };
      const z=rect(R, H, P, Y, PANEL, 8, .01);
      const j=createBloxFrame({
        left:R,
        top:H,
        width:P,
        height:Y
      }, "panel");
      j.alpha=M?.placed?.65:1;
      root.addChild(applyHudAssetRegion(j, data, "bloxTrayPanelAsset"));
      u===data.selectedBloxPiece&&!M?.placed&&root.addChild(strokedRect(R+3, H+3, P-6, Y-6, MINT, 7, MINT, .08, 2));
      makeInteractive(z, {
        pointerdown:E=>{
          if(!M?.piece||M.placed||!h.gameActive){
            data.onBloxTray?.(u);
            return
          }
          drag=createBloxDragState({
            pieceIdx:u,
            piece:M.piece,
            event:E,
            originX:N.x,
            originY:N.y,
            unit:L
          });
          drag.visualOffsetY=touchDragLift(E);
          drag.overCell=bloxAnchorCellFromDrag(layout, drag);
          O.start(E, {
            kind:"blox-tray",
            pieceIdx:u
          });
          g();
        }
      });
      root.addChild(z);
      M?.piece&&drag?.pieceIdx!==u&&root.addChild(drawTrayPiece(M.piece, R, H, P, Y, L, M.placed?.16:1));
      if(X&&M?.piece&&!M.placed){
        const arrival=drawPiece(M.piece,0,0,L,.72);
        arrival.position.set(N.x,N.y);
        animate(arrival,{duration:200,from:.94,peak:1.025});
      }
    }
    if(data.bloxKeyboardCell){
      const{
        row:u,
        col:M
      }=data.bloxKeyboardCell;
      const R=_[data.selectedBloxPiece]?.piece;
      const H=R&&!_[data.selectedBloxPiece]?.placed&&canPlaceBloxPiece(T, R, u, M);
      const P=R?.cells||[[0, 0]];
      for(const[Y, I]of P){
        const L=u+Y;
        const N=M+I;
        L<0||L>=GRID||N<0||N>=GRID||root.addChild(strokedRect(b+N*d+1, C+L*d+1, d-2, d-2, H?5764563:16735608, 3, H?5764563:16735608, .08, 2))
      }
    }
    g();
    data.bloxHideStatusText||root.addChild(label(data.bloxStatusText||`Score ${h.score||0} · Lines ${h.linesCleared||0}`, viewWidth(app)/2, U+76, 14, AMBER));
    // Pixi caches local bounds and rounds backing dimensions up to powers of
    // two. Leave one pixel of rounding headroom: each backing axis stays<=1024,
    // so this static cache costs at most1,048,576 pixels even on large screens.
    // Children and full-cell hit areas remain available to Pixi event routing.
    const bounds=root.getLocalBounds?.();
    if(bounds){
      // Match getLocalBounds().ceil(): fractional origins can add a pixel to
      // each extent, so ceil(width) alone is not a safe allocation bound.
      const x=bounds.x??bounds.minX??0,y=bounds.y??bounds.minY??0;
      const width=Math.max(1,Math.ceil(x+bounds.width)-Math.floor(x));
      const height=Math.max(1,Math.ceil(y+bounds.height)-Math.floor(y));
      root.cacheAsTexture?.({resolution:Math.min(app.renderer.resolution||1,1023/width,1023/height),antialias:false});
    }
    app.render?.();
  }
  const A=setupStage(app, O.move, O.end, ()=>O.cancel("stage"));
  const resetFeedback=()=>{feedbackEpoch++;feedback.clear();G();};
  const suspend=()=>{background=true;resetFeedback();app.render?.();app.ticker.stop?.();};
  const resume=()=>{background=false;};
  const visibility=()=>{if(document.visibilityState==='hidden')suspend();else resume();};
  const motionChange=()=>resetFeedback();
  window.addEventListener('blur',suspend);window.addEventListener('focus',resume);
  document.addEventListener('visibilitychange',visibility);
  motionMedia?.addEventListener?.('change',motionChange);
  const D=ticker=>{
    if(background||document.visibilityState==='hidden')return;
    if(motionObservation&&motionObservation.finishedAt===null){
      motionObservation.firstFrameAt??=performance.now();
      motionObservation.frames++;
    }
    feedback.tick(ticker?.deltaMS??1000/60);
    tickClearing();
    if(motionObservation&&motionObservation.clearedAt===null&&!clearing.size)motionObservation.clearedAt=performance.now();
    if(!drag&&!feedback.size&&!clearing.size){
      if(motionObservation&&motionObservation.finishedAt===null)motionObservation.finishedAt=performance.now();
      app.render?.();app.ticker.stop?.();
    }
    publishMotionObservation();
  };
  return app.ticker.add(D),
  k(),
  {
    resize(h){
      resetFeedback();
      O.cancel("resize");
      data=h||{
      };
      k();
    },
    update(h){
      data=h||{
      };
      if(!data.blox?.gameActive)resetFeedback();
      drag&&!data.blox?.gameActive?O.cancel("inactive"):drag?g():k();
    },
    destroy(){
      destroyed=true;resetFeedback();
      window.removeEventListener('blur',suspend);window.removeEventListener('focus',resume);
      document.removeEventListener('visibilitychange',visibility);
      motionMedia?.removeEventListener?.('change',motionChange);
      A();
      app.ticker.remove(D);
      dragVisual.cancel();
      O.cancel("destroy");
      root.cacheAsTexture?.(false);
      clear(root);
      clear(dragLayer);
      clear(effects);
      root.destroy({
        children:true
      });
      dragLayer.destroy({
        children:true
      });
      effects.destroy({
        children:true
      });
    }
  }
}

export {buildBloxScene,createBloxFrame};
