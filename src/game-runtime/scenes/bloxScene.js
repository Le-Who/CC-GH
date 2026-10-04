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
function createBloxEnergyLine(x, y, width, height, alpha){
  const sprite=spriteFit(bloxArtUrl("energy"), x, y, height, width, alpha);
  return sprite.rotation=Math.PI/2,
  sprite
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
  const feedback=createFeedbackTrack(effects,{limit:48});
  const reduced=()=>!!motionMedia?.matches;
  const animate=(node,options={})=>{
    if(destroyed||background||document.visibilityState==='hidden'){node.destroy?.({children:true});return;}
    feedback.add(node,{...options,reduced:reduced()});
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
      for(const B of S?.clear.rows||[])dragLayer.addChild(spriteFit(bloxArtUrl("energy"), layout.left+layout.size/2, layout.top+(B+.5)*layout.cell, layout.size+12, layout.cell*1.24, .42));
      for(const B of S?.clear.cols||[])dragLayer.addChild(createBloxEnergyLine(layout.left+(B+.5)*layout.cell, layout.top+layout.size/2, layout.cell*1.24, layout.size+12, .4));
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
  // Clearing travels along the actual completed lines; it never covers the board
  // with a centre-screen reward label or blocks the next placement.
  function G(result={}){
    if(!layout)return;
    for(const row of (result.rows||[]).slice(0,GRID)){
      const beam=spriteFit(bloxArtUrl("energy"),layout.left+layout.size/2,layout.top+(row+.5)*layout.cell,layout.size+8,layout.cell*.85,.65);
      animate(beam,{duration:300,from:.98,peak:1.02});
    }
    for(const col of (result.cols||[]).slice(0,GRID)){
      const beam=createBloxEnergyLine(layout.left+(col+.5)*layout.cell,layout.top+layout.size/2,layout.cell*.85,layout.size+8,.65);
      animate(beam,{duration:300,from:.98,peak:1.02});
    }
  }
  function placementFeedback(piece,cell,result){
    if(!layout||!cell)return;
    if(result?.error){
      for(const [row,col] of piece.cells||[]){
        const r=cell.row+row,c=cell.col+col;
        if(r<0||c<0||r>=GRID||c>=GRID)continue;
        animate(strokedRect(layout.left+c*layout.cell+2,layout.top+r*layout.cell+2,layout.cell-4,layout.cell-4,CORAL,4,CORAL,.12,2),{duration:190});
      }
      return;
    }
    for(const [row,col] of piece.cells||[]){
      const x=layout.left+(cell.col+col+.5)*layout.cell,y=layout.top+(cell.row+row+.5)*layout.cell;
      animate(spriteFit(tileAssetForPiece(piece),x,y,tileVisualSize(layout.cell),tileVisualSize(layout.cell),.8),{duration:220,from:.94,peak:1.045});
    }
    if(result?.clear?.cleared)G(result.clear);
  }
  function F(done){
    if(!drag)return;
    const current=drag;
    const target=done?.cancelled?null:current.overCell||bloxAnchorCellFromDrag(layout,current);
    drag=null;dragVisual.cancel();clear(dragLayer);
    // Cancel is a neutral cleanup, never a selection, rejection, or reward.
    if(done?.cancelled){k();return;}
    if(target&&data.blox?.gameActive){
      const epoch=feedbackEpoch;
      Promise.resolve(data.onBloxDrop?.(current.pieceIdx,target.row,target.col)).then(result=>{
        if(!destroyed&&epoch===feedbackEpoch&&result)placementFeedback(current.piece,target,result);
      }).catch(()=>{});
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
        const piece=data.blox?.tray?.[data.selectedBloxPiece]?.piece,epoch=feedbackEpoch;
        const result=data.onBloxCell?.(h.data.row,h.data.col);
        if(piece)Promise.resolve(result).then(value=>{if(value&&!destroyed&&epoch===feedbackEpoch)placementFeedback(piece,h.data,value);}).catch(()=>{});
        return
      }
      drag&&(data.onBloxTray?.(drag.pieceIdx), drag=null, dragVisual.cancel(), clear(dragLayer), k())
    },
    onDragEnd:F,
    onCancel:h=>F(h)
  });
  function k(){
    if(destroyed)return;
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
    app.render?.();
  }
  const A=setupStage(app, O.move, O.end, ()=>O.cancel("stage"));
  const resetFeedback=()=>{feedbackEpoch++;feedback.clear();};
  const suspend=()=>{background=true;resetFeedback();app.render?.();app.ticker.stop?.();};
  const resume=()=>{background=false;};
  const visibility=()=>{if(document.visibilityState==='hidden')suspend();else resume();};
  const motionChange=()=>resetFeedback();
  window.addEventListener('blur',suspend);window.addEventListener('focus',resume);
  document.addEventListener('visibilitychange',visibility);
  motionMedia?.addEventListener?.('change',motionChange);
  const D=ticker=>{
    if(background||document.visibilityState==='hidden')return;
    feedback.tick(ticker?.deltaMS??1000/60);
    if(!drag&&!feedback.size){app.render?.();app.ticker.stop?.();}
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
