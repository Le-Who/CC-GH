/** Recovered game-only source from the owned Match3 v2 r2 preview. See recovery manifest. */
import {Texture,NineSliceSprite} from 'pixi.js';
import {Container,makeRafScheduler,createPointerSession,match3TargetFromGesture,clear,isAdjacentMatch3Cell,makeSparkles,SKY,makeRipple,GEM_COLORS,strokedRect,Graphics,spriteFit,TEXT,Rectangle,makeInteractive,DROP_ICONS,GEM_ICONS,label,BOARD_SIZE,MATCH3_TIMING,cellCenter,CORAL,makeTween,match3StepStartFrame,sprite,MATCH3_ASSET_KEYS,AMBER,viewWidth,viewHeight,publishCanvasLayout,rect,publishCanvasAssetLayout,applyHudAssetRegion,setupStage,tickParticles,gameAsset,POTION_PIECE_ASSETS} from './shared/runtime.js';
import {MATCH3_GEM_ART,MATCH3_NINE_SLICE,match3ArtUrl} from '../../games/match3/match3Art.js';
import {composeMatch3} from '../../games/match3/match3Composition.js';

function match3GemAsset(gem){
  return MATCH3_GEM_ART[gem]?match3ArtUrl(MATCH3_GEM_ART[gem]):gameAsset(POTION_PIECE_ASSETS[gem])
}
function createMatch3BoardFrame(bounds){
  const texture=Texture.from(match3ArtUrl("frame"));
  const[left, top, right, bottom]=MATCH3_NINE_SLICE.frame.source;
  const scale=MATCH3_NINE_SLICE.frame.destination[0]/left;
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
function buildMatch3Scene(app, initial={
}){
  const root=new Container;
  const dragLayer=new Container;
  const effects=new Container;
  app.stage.addChild(root, dragLayer, effects);
  let data=initial;
  let layout=null;
  let drag=null;
  let lastAnimationId=null;
  let animationFrames=[];
  let animationFrameIndex=0;
  let animationFrameAge=0;
  const dragVisual=makeRafScheduler(()=>updateDragVisualNow());
  dragLayer.eventMode="none";
  dragLayer.interactiveChildren=false;
  effects.eventMode="none";
  effects.interactiveChildren=false;
  const pointer=createPointerSession({
    onMove:l=>{
      drag&&(drag.x=l.x, drag.y=l.y, drag.target=match3TargetFromGesture(layout, drag, l), queueDragVisual())
    },
    onTap:l=>{
      const c=l.data?.from||drag?.from;
      drag=null;
      dragVisual.cancel();
      clear(dragLayer);
      c&&data.onMatch3Cell?.(c.x, c.y);
      draw();
    },
    onDragEnd:l=>{
      if(!drag)return;
      const c=drag;
      drag=null;
      dragVisual.cancel();
      clear(dragLayer);
      const d=c.target||match3TargetFromGesture(layout, c, l);
      isAdjacentMatch3Cell(c.from, d)?(data.onMatch3Swap?.(c.from, d), makeSparkles(effects, l.x, l.y, SKY, 7), makeRipple(effects, l.x, l.y, SKY, 24)):c.from&&data.onMatch3Cell?.(c.from.x, c.from.y);
      draw();
    },
    onCancel:()=>{
      drag=null;
      dragVisual.cancel();
      clear(dragLayer);
      draw();
    }
  });
  function updateDragVisualNow(){
    if(clear(dragLayer), !drag)return;
    const l=data.match3||{
    };
    const c=l.board||l.savedModes?.[l.gameMode||"classic"]?.board||[];
    const f=(c.length?c:data.fallbackBoard||[])[drag.from.y]?.[drag.from.x];
    const S=GEM_COLORS[f]||10792858;
    const T=Math.max(14, (layout?.cell||44)*.33);
    const W=match3GemAsset(f);
    if(drag.target&&dragLayer.addChild(strokedRect(layout.left+drag.target.x*layout.cell+3, layout.top+drag.target.y*layout.cell+3, layout.cell-6, layout.cell-6, SKY, 10, 16248800, .7, 3)), W){
      dragLayer.addChild(new Graphics().circle(drag.x, drag.y+T*.14, T*.9).fill({
        color:1116426,
        alpha:.22
      }));
      dragLayer.addChild(spriteFit(W, drag.x, drag.y, T*2.05, T*2.05, .94));
      return
    }
    dragLayer.addChild(new Graphics().circle(drag.x, drag.y, T).fill({
      color:S,
      alpha:.8
    }).stroke({
      color:TEXT,
      width:2,
      alpha:.7
    }))
  }
  function queueDragVisual(){
    dragVisual.request()
  }
  function isInputLocked(){
    return!!data.match3?.inputLocked
  }
  function cellHit(l, c, d, f){
    const S=new Graphics().rect(l, c, d, d).fill({
      color:16777215,
      alpha:.001
    });
    return S.hitArea=new Rectangle(l, c, d, d),
    makeInteractive(S, f)
  }
  function gemTransform(){
    return{
      scale:1,
      x:0,
      y:0
    }
  }
  function createGemView(l, c, d=1){
    const f=GEM_COLORS[l]||10792858;
    const S=new Container;
    S.eventMode="none";
    S.interactiveChildren=false;
    S.alpha=d;
    const T=match3GemAsset(l);
    if(T){
      S.addChild(new Graphics().circle(0, c*.12, c*.9).fill({
        color:1313549,
        alpha:.22
      }));
      const v=c*2.14;
      const F=gemTransform();
      return S.addChild(spriteFit(T, F.x, F.y, v*F.scale, v*F.scale, Math.min(.98, d+.08))),
      S
    }
    S.addChild(new Graphics().circle(0, 0, c*1.08).fill({
      color:1773842,
      alpha:.24
    }).stroke({
      color:f,
      width:Math.max(1.5, c*.08),
      alpha:.62
    }));
    S.addChild(new Graphics().circle(0, 0, c).fill({
      color:f,
      alpha:Math.min(.72, d*.78)
    }).stroke({
      color:16774091,
      width:1.5,
      alpha:.28
    }));
    const W=DROP_ICONS[l]||GEM_ICONS[l]||"";
    return W&&S.addChild(label(W, 0, 0, Math.max(13, c*.88), TEXT)),
    S
  }
  function copyBoard(l=[]){
    return Array.from({
      length:BOARD_SIZE
    }, (c, d)=>Array.from({
      length:BOARD_SIZE
    }, (f, S)=>l[d]?.[S]||null))
  }
  function buildAnimationFrames(l={
  }){
    const c=copyBoard(l.startBoard||[]);
    const{
      from:d,
      to:f
    }=l;
    return!d||!f||!c[d.y]?.[d.x]||!c[f.y]?.[f.x]||([c[d.y][d.x], c[f.y][f.x]]=[c[f.y][f.x], c[d.y][d.x]]),
    c
  }
  function z(l, c={
  }){
    const d=copyBoard(l);
    for(const f of c.cleared||[])d[f.y]&&(d[f.y][f.x]=null);
    for(const f of c.specials||[])d[f.y]&&(d[f.y][f.x]=f.type);
    for(const f of c.fallen||[]){
      d[f.fromY]&&(d[f.fromY][f.x]=null);
      d[f.toY]&&(d[f.toY][f.x]=null);
    }
    for(const f of c.filled||[])d[f.y]&&(d[f.y][f.x]=null);
    for(const f of c.dropCollected||[])d[f.y]&&(d[f.y][f.x]=null);
    return d
  }
  function L(l={
  }){
    if(l.type!=="cascade")return[];
    const c=Array.isArray(l.steps)?l.steps:[];
    const d=[];
    const f=Array.isArray(l.startBoard)&&l.startBoard.length;
    const S=Array.isArray(l.swapBoard)&&l.swapBoard.length?copyBoard(l.swapBoard):buildAnimationFrames(l);
    let T=S;
    f&&d.push({
      board:copyBoard(l.startBoard),
      holdFrames:MATCH3_TIMING.swapFrames
    });
    d.push({
      board:copyBoard(S),
      holdFrames:MATCH3_TIMING.swapSettleFrames
    });
    for(const W of c){
      const v=copyBoard(T);
      d.push({
        board:v,
        holdFrames:MATCH3_TIMING.clearFrames
      });
      d.push({
        board:z(v, W),
        holdFrames:MATCH3_TIMING.motionFrames
      });
      const F=copyBoard(W.boardSnapshot);
      d.push({
        board:F,
        holdFrames:MATCH3_TIMING.settleFrames
      });
      T=F;
    }
    return d.length&&MATCH3_TIMING.tailFrames>0&&d.push({
      board:copyBoard(T),
      holdFrames:MATCH3_TIMING.tailFrames
    }),
    d.filter(W=>W.board?.length)
  }
  function E(l){
    return animationFrames.length&&animationFrames[Math.min(animationFrameIndex, animationFrames.length-1)]?.board||l
  }
  function U(l={
  }){
    if(!animationFrames.length)return;
    animationFrameAge+=Math.max(.5, l.deltaTime||1);
    const c=animationFrames[animationFrameIndex]?.holdFrames||1;
    if(!(animationFrameAge<c)){
      if(animationFrameAge=0, animationFrameIndex<animationFrames.length-1){
        animationFrameIndex+=1;
        draw();
        return
      }
      animationFrames=[];
      draw();
    }
  }
  function R(l={
  }){
    if(!l?.id){
      (animationFrames.length||lastAnimationId)&&(animationFrames=[], animationFrameIndex=0, animationFrameAge=0, lastAnimationId=null);
      return
    }
    if(!layout||l.id===lastAnimationId)return;
    lastAnimationId=l.id;
    l.type!=="cascade"&&(animationFrames=[], animationFrameIndex=0, animationFrameAge=0);
    const c=Math.max(14, layout.cell*.3);
    const d=l.from?cellCenter(layout, l.from.x, l.from.y):null;
    const f=l.to?cellCenter(layout, l.to.x, l.to.y):null;
    if(l.type==="invalid"&&d&&f){
      const v={
        x:d.x+(f.x-d.x)*.24,
        y:d.y+(f.y-d.y)*.24
      };
      const F=createGemView(l.fromGem, c, .86);
      F._tween={
        fromX:d.x,
        fromY:d.y,
        toX:v.x,
        toY:v.y,
        duration:7,
        fade:true,
        scaleFrom:1,
        scaleTo:.9,
        ease:"snap"
      };
      F.x=d.x;
      F.y=d.y;
      effects.addChild(F);
      makeRipple(effects, d.x, d.y, CORAL, c*1.1);
      makeSparkles(effects, d.x, d.y, CORAL, 5);
      return
    }
    d&&f&&(effects.addChild(makeTween(createGemView(l.fromGem, c, .94), d, f, MATCH3_TIMING.swapFrames, {
      fade:true,
      scaleFrom:.98,
      scaleTo:1.04,
      ease:"snap"
    })), effects.addChild(makeTween(createGemView(l.toGem, c, .82), f, d, MATCH3_TIMING.swapFrames, {
      fade:true,
      scaleFrom:.96,
      scaleTo:1.02,
      ease:"snap"
    })), makeRipple(effects, (d.x+f.x)/2, (d.y+f.y)/2, SKY, c*1.2));
    const S=Array.isArray(l.steps)?l.steps:[];
    l.type==="cascade"&&(animationFrames=L(l), animationFrameIndex=0, animationFrameAge=0);
    let T=Array.isArray(l.swapBoard)&&l.swapBoard.length?copyBoard(l.swapBoard):buildAnimationFrames(l);
    let W=match3StepStartFrame(0);
    S.forEach((v, F)=>{
      const m=W;
      const Y=m+MATCH3_TIMING.clearFrames;
      for(const g of v.cleared||[]){
        const p=cellCenter(layout, g.x, g.y);
        const X=sprite(gameAsset(MATCH3_ASSET_KEYS.fxClearBurst), p.x, p.y, c*2.6, c*2.6, .74);
        X._delay=m+.5+(g.x+g.y)%2*.4;
        X._tween={
          fromX:p.x,
          fromY:p.y,
          toX:p.x,
          toY:p.y,
          duration:12,
          fade:true,
          scaleFrom:.56,
          scaleTo:1.24,
          ease:"pop"
        };
        effects.addChild(X);
        const x=new Graphics().circle(0, 0, c*(1+Math.min(.55, v.combo*.08))).stroke({
          color:AMBER,
          width:3,
          alpha:.86
        });
        x.x=p.x;
        x.y=p.y;
        x._delay=m+Math.min(1.5, (g.x+g.y)%3*.5);
        x._tween={
          fromX:p.x,
          fromY:p.y,
          toX:p.x,
          toY:p.y,
          duration:11,
          fade:true,
          scaleFrom:.62,
          scaleTo:1.3,
          ease:"snap"
        };
        effects.addChild(x);
        const P=createGemView(g.type, c*.95, .96);
        P.x=p.x;
        P.y=p.y;
        P._delay=m+1+(g.x+g.y)%2*.5;
        P._tween={
          fromX:p.x,
          fromY:p.y,
          toX:p.x,
          toY:p.y-c*.16,
          duration:10,
          fade:true,
          scaleFrom:1.05,
          scaleTo:.5,
          ease:"pop"
        };
        effects.addChild(P);
        const D=effects.children.length;
        makeSparkles(effects, p.x, p.y, v.combo>1?CORAL:AMBER, Math.min(12, 5+v.combo));
        for(const V of effects.children.slice(D))V._delay=m+1.5
      }
      for(const g of v.specials||[]){
        const p=cellCenter(layout, g.x, g.y);
        const X=GEM_COLORS[g.type]||SKY;
        const x=new Graphics().circle(0, 0, c*1.05).fill({
          color:X,
          alpha:.38
        }).stroke({
          color:X,
          width:4,
          alpha:.78
        });
        x.x=p.x;
        x.y=p.y;
        x._delay=m+2;
        x._tween={
          fromX:p.x,
          fromY:p.y,
          toX:p.x,
          toY:p.y,
          duration:14,
          fade:true,
          scaleFrom:.45,
          scaleTo:1.25,
          ease:"snap"
        };
        effects.addChild(x);
      }
      for(const g of v.triggeredSpecials||[]){
        const p=cellCenter(layout, g.x, g.y);
        const X=GEM_COLORS[g.type]||SKY;
        const x=new Graphics().circle(0, 0, c*1.18).stroke({
          color:X,
          width:5,
          alpha:.9
        });
        x.x=p.x;
        x.y=p.y;
        x._delay=m+1;
        x._tween={
          fromX:p.x,
          fromY:p.y,
          toX:p.x,
          toY:p.y,
          duration:16,
          fade:true,
          scaleFrom:.55,
          scaleTo:1.55,
          ease:"snap"
        };
        effects.addChild(x);
      }
      for(const g of v.fallen||[]){
        const p=T?.[g.fromY]?.[g.x]||v.boardSnapshot?.[g.toY]?.[g.x];
        if(!p)continue;
        const X=cellCenter(layout, g.x, g.fromY);
        const x=cellCenter(layout, g.x, g.toY);
        const P=Math.max(1, Math.abs(g.toY-g.fromY));
        const D=Y+Math.min(2.5, P*.45);
        const V=Math.min(MATCH3_TIMING.motionFrames-3, 12+P*2.8);
        effects.addChild(makeTween(createGemView(p, c*.92, .96), X, x, V, {
          delay:D,
          fade:false,
          scaleFrom:.97,
          scaleTo:1.02,
          ease:"drop"
        }))
      }
      for(const g of v.filled||[]){
        const p={
          ...cellCenter(layout, g.x, g.y),
          y:layout.top-layout.cell*(1.2+g.y%2*.2)
        };
        const X=cellCenter(layout, g.x, g.y);
        const x=Y+3+Math.min(2.5, g.y*.35);
        const P=Math.min(MATCH3_TIMING.motionFrames-4, 12+g.y*.9);
        effects.addChild(makeTween(createGemView(g.type, c*.9, .96), p, X, P, {
          delay:x,
          fade:false,
          scaleFrom:.82,
          scaleTo:1.03,
          ease:"drop"
        }))
      }
      for(const g of v.dropCollected||[]){
        const p=cellCenter(layout, g.x, g.y);
        const X=createGemView(g.type, c*1.02, .98);
        X._delay=Y+5;
        X._tween={
          fromX:p.x,
          fromY:p.y,
          toX:p.x,
          toY:p.y-layout.cell*.72,
          duration:16,
          fade:true,
          scaleFrom:1,
          scaleTo:1.35,
          ease:"pop"
        };
        effects.addChild(X);
        const x=label(`+${g.points||80}`, p.x, p.y-c*1.5, Math.max(12, c*.72), AMBER);
        x._delay=Y+7;
        x._tween={
          fromX:x.x,
          fromY:x.y,
          toX:x.x,
          toY:x.y-layout.cell*.44,
          duration:18,
          fade:true,
          scaleFrom:.8,
          scaleTo:1.12,
          ease:"pop"
        };
        effects.addChild(x);
      }
      T=copyBoard(v.boardSnapshot);
      W=match3StepStartFrame(F+1);
    })
  }
  function draw(){
    clear(root);
    const l=data.match3||{
    };
    const c=l.board||l.savedModes?.[l.gameMode||"classic"]?.board||[];
    const d=data.fallbackBoard||[];
    const f=c.length?c:d;
    const S=viewWidth(app);
    const T=viewHeight(app);
    const W=data.match3Composition;
    const v=W?.width===S&&W?.height===T?W:composeMatch3({
      width:S,
      height:T,
      hudLayout:data.hudLayout
    });
    layout=v.board;
    const{
      size:F,
      cell:m,
      left:Y,
      top:g
    }=layout;
    publishCanvasLayout(app, "match3", {
      top:g,
      left:Y,
      size:F
    });
    root.addChild(rect(Y, g, F, F, 1116446, 4, 1));
    app.canvas?.dataset&&(app.canvas.dataset.match3BoardFrameSize=String(v.frame.width), app.canvas.dataset.match3BoardFrameInnerSize=String(F), app.canvas.dataset.puzzleArrangement=v.landscape?"side":"stack");
    publishCanvasAssetLayout(app, "match3BoardFrameAsset", v.frame);
    const p=createMatch3BoardFrame(v.frame);
    root.addChild(applyHudAssetRegion(p, data, "match3BoardFrameAsset"));
    R(data.match3Animation);
    const X=E(f);
    for(let x=0; x<BOARD_SIZE; x++)for(let P=0; P<BOARD_SIZE; P++){
      const D=X[x]?.[P];
      const V=data.selectedGem?.x===P&&data.selectedGem?.y===x;
      const q=drag?.from?.x===P&&drag?.from?.y===x;
      root.addChild(spriteFit(match3ArtUrl("cell"), Y+P*m+m/2, g+x*m+m/2, m-2, m-2, 1));
      const Te=V?strokedRect(Y+P*m+3, g+x*m+3, m-6, m-6, AMBER, 10, 16248800, .08, 3):rect(Y+P*m+3, g+x*m+3, m-6, m-6, 15265756, 10, .001);
      if(root.addChild(Te), D){
        const $=GEM_COLORS[D]||10792858;
        const ht=Y+P*m+m/2;
        const ct=g+x*m+m/2;
        const At=m*(V?.36:.32);
        const mt=match3GemAsset(D);
        if(mt?root.addChild(new Graphics().circle(ht, ct+At*.18, At*.86).fill({
          color:1182220,
          alpha:q?.12:.25
        })):(root.addChild(new Graphics().circle(ht, ct, At*1.12).fill({
          color:1708306,
          alpha:q?.18:.36
        }).stroke({
          color:$,
          width:Math.max(2, m*.038),
          alpha:q?.32:.58
        })), root.addChild(new Graphics().circle(ht, ct, m*(V?.31:.27)).fill({
          color:$,
          alpha:q?.22:.58
        }).stroke({
          color:16774091,
          width:1.5,
          alpha:q?.14:.24
        }))), mt&&!q){
          const Gt=m*(V?.92:.86);
          const xt=gemTransform();
          root.addChild(spriteFit(mt, ht+xt.x, ct+xt.y, Gt*xt.scale, Gt*xt.scale, .98))
        }
        const Rt=DROP_ICONS[D]||GEM_ICONS[D]||"";
        Rt&&!mt&&root.addChild(label(Rt, ht, ct, Math.max(12, m*.34)))
      }
      root.addChild(cellHit(Y+P*m, g+x*m, m, {
        pointerdown:$=>{
          !l.gameActive||isInputLocked()||(drag={
            from:{
              x:P,
              y:x
            },
            pointerId:$.pointerId,
            startX:$.global.x,
            startY:$.global.y,
            x:$.global.x,
            y:$.global.y,
            target:null
          }, pointer.start($, {
            kind:"match3-cell",
            from:{
              x:P,
              y:x
            }
          }))
        }
      }))
    }
    queueDragVisual()
  }
  const nt=setupStage(app, pointer.move, pointer.end, ()=>pointer.cancel("stage"));
  const tt=l=>{
    U(l);
    tickParticles(effects, l.deltaTime);
  };
  return app.ticker.add(tt),
  draw(),
  {
    update(l){
      data=l||{
      };
      drag?queueDragVisual():draw();
    },
    resize(l=data){
      pointer.cancel("resize");
      data=l||{
      };
      clear(effects);
      draw();
    },
    destroy(){
      nt();
      app.ticker.remove(tt);
      dragVisual.cancel();
      pointer.cancel("destroy");
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

export {buildMatch3Scene,createMatch3BoardFrame};
