import {publicLeaderboardName} from "../../app/publicLeaderboardName.js";
/** Recovered game-only source from the owned Blox v2 r2 preview. See recovery manifest. */
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {HudRegion,HudEditableRegion,useHudLayout} from '../../app/hud-layout/index.js';
import {useAppI18n} from '../../app/i18n.jsx';
import {useGameEvents} from '../../game-state/gameEvents.js';
import {useDialogFocus} from '../../app/useDialogFocus.js';
import {useEscapeDismiss} from '../../app/useDismissableLayer.js';
import {composeBlox} from './bloxComposition.js';
import {bloxKeyboardIntent} from './bloxInteraction.js';
import {BLOX_PIXI_ASSETS,bloxArtUrl,bloxPanelSkin} from './bloxArt.js';
import {remainingArcadeSafeInsets} from '../../app/arcadeBoundary.js';
import './blox-presentation.css';
const BloxCanvas=React.lazy(()=>Promise.all([import('../../game-runtime/PixiGameHost.jsx'),import('../../game-runtime/scenes/bloxScene.js')]).then(([host,scene])=>({default:function BloxCanvas(props){return jsxRuntime.jsx(host.default,{sceneKey:'blox',buildScene:scene.buildBloxScene,isolated:true,className:'bx-canvas',assetUrls:BLOX_PIXI_ASSETS,...props})}})));

const absoluteRect=n=>({
  position:"absolute",
  left:n.left,
  top:n.top,
  width:n.width,
  height:n.height,
  maxWidth:"none"
});
function BloxButton({
  children:children,
  primary:primary=false,
  className:className="",
  ...props
}){
  return jsxRuntime.jsx("button", {
    type:"button",
    className:`bx-button bx-skin${primary?" bx-primary":""}${className?" "+className:""}`,
    style:bloxPanelSkin("button"),
    ...props,
    children:children
  })
}
function BloxRuntimeStatus({
  error:error=false
}){
  const{
    t:t
  }=useAppI18n();
  return jsxRuntime.jsxs("div", {
    className:"bx-runtime-status",
    role:error?"alert":"status",
    children:[jsxRuntime.jsx("strong", {
      children:t(error?"app.gameLoadErrorTitle":"app.loadingGameRuntime")
    }), error&&jsxRuntime.jsxs(jsxRuntime.Fragment, {
      children:[jsxRuntime.jsx("span", {
        children:t("app.gameLoadErrorBody")
      }), jsxRuntime.jsx(BloxButton, {
        onClick:()=>window.location.reload(),
        children:t("common.retry")
      })]
    })]
  })
}
class BloxRuntimeBoundary extends React.Component{
  state={
    failed:false
  };
  static getDerivedStateFromError(){
    return{
      failed:true
    }
  }
  componentDidCatch(i){
    console.error("Blox renderer failed", i)
  }
  render(){
    return this.state.failed?jsxRuntime.jsx(BloxRuntimeStatus, {
      error:true
    }):this.props.children
  }
}
function BloxMetric({
  label:label,
  value:value,
  progress:progress=null,
  maxSize:maxSize=24
}){
  return jsxRuntime.jsxs("div", {
    className:"bx-metric",
    "aria-label":`${label}: ${value}`,
    children:[jsxRuntime.jsx("span", {
      children:label
    }), jsxRuntime.jsx("strong", {
      style:{
        fontSize:`${Math.max(14,maxSize*6/Math.max(6,String(value).length))}px`
      },
      children:value
    }), progress!=null&&jsxRuntime.jsx("i", {
      className:"bx-progress",
      "aria-hidden":"true",
      children:jsxRuntime.jsx("b", {
        style:{
          width:`${Math.max(0,Math.min(1,progress))*100}%`
        }
      })
    })]
  })
}
function BloxDialog({
  paused:paused,
  state:state,
  trayPieces:trayPieces,
  currentReward:currentReward,
  leaders:leaders,
  onResume:onResume,
  onStart:onStart,
  onFinish:onFinish,
  onExit:onExit,
  dialogRef:dialogRef,
  maxWidth:maxWidth
}){
  const{
    t:t
  }=useAppI18n();
  return jsxRuntime.jsxs(HudEditableRegion, {
    id:"pauseOverlay",
    as:"aside",
    ref:dialogRef,
    className:"bx-dialog bx-skin",
    style:{
      ...bloxPanelSkin("panel", [16, 16, 16, 16]),
      "--bx-dialog-max":`${maxWidth}px`
    },
    role:"dialog",
    "aria-modal":"true",
    "aria-labelledby":"bx-dialog-title",
    tabIndex:-1,
    children:[jsxRuntime.jsxs("header", {
      className:"bx-dialog-heading",
      children:[jsxRuntime.jsxs("div", {
        children:[jsxRuntime.jsx("span", {
          className:"bx-kicker",
          children:t(paused?"pause.paused":state.score?"blox.result":"pause.ready")
        }), jsxRuntime.jsx("h1", {
          id:"bx-dialog-title",
          children:t("blox.title")
        })]
      }), paused&&jsxRuntime.jsx("button", {
        type:"button",
        className:"bx-close",
        onClick:onResume,
        "aria-label":t("common.close"),
        children:"×"
      })]
    }), jsxRuntime.jsxs("div", {
      className:"bx-dialog-scroll",
      children:[jsxRuntime.jsxs("div", {
        className:"bx-dialog-metrics",
        children:[jsxRuntime.jsx(BloxMetric, {
          label:t("common.score"),
          value:state.score||0
        }), jsxRuntime.jsx(BloxMetric, {
          label:t("common.lines"),
          value:state.linesCleared||0
        }), jsxRuntime.jsx(BloxMetric, {
          label:t("common.reward"),
          value:currentReward
        })]
      }), jsxRuntime.jsx("p", {
        className:"bx-intro",
        children:t(paused?"pause.bloxIntro":"blox.menuHelp")
      }), paused?jsxRuntime.jsxs(jsxRuntime.Fragment, {
        children:[jsxRuntime.jsx(BloxButton, {
          primary:true,
          onClick:onResume,
          children:t("common.resume")
        }), jsxRuntime.jsxs("div", {
          className:"bx-two-actions",
          children:[jsxRuntime.jsx(BloxButton, {
            onClick:onStart,
            children:t("common.restart")
          }), jsxRuntime.jsx(BloxButton, {
            onClick:onFinish,
            children:t("common.endRun")
          })]
        }), jsxRuntime.jsx("p", {
          className:"bx-retained",
          children:t("blox.savedTray", {
            count:trayPieces
          })
        })]
      }):jsxRuntime.jsxs(jsxRuntime.Fragment, {
        children:[jsxRuntime.jsx(BloxButton, {
          primary:true,
          onClick:onStart,
          children:t("common.start")
        }), jsxRuntime.jsx("p", {
          className:"bx-retained",
          children:t("blox.bestReward", {
            best:state.highScore||0,
            reward:currentReward
          })
        })]
      }), jsxRuntime.jsx(BloxButton, {
        onClick:onExit,
        children:t("nav.allGames")
      }), !paused&&jsxRuntime.jsxs("section", {
        className:"bx-leaders",
        children:[jsxRuntime.jsx("h2", {
          children:t("common.leaderboard")
        }), leaders.length?leaders.slice(0, 3).map((z, L)=>jsxRuntime.jsxs("div", {
          className:"bx-leader-row",
            "aria-current":z.isSelf ? "true" : undefined,
          children:[jsxRuntime.jsxs("span", {
            children:[z.rank||L+1, ". ", publicLeaderboardName(z, t("app.player")), z.isSelf ? ` (${t("common.you")})` : ""]
          }), jsxRuntime.jsx("strong", {
            children:z.highScore
          })]
        }, z.rank)):jsxRuntime.jsx("p", {
          children:t("common.noScores")
        })]
      })]
    })]
  })
}
function BloxPresentation(props){
  const{
    t:t,
    language:language
  }=useAppI18n();
  const{
    resolvedLayout:resolvedLayout,
    viewport:viewport,
    editorVisible:editorVisible
  }=useHudLayout();
  const stageRef=React.useRef(null);
  const dialogRef=React.useRef(null);
  const[size, setSize]=React.useState({
    width:viewport.width,
    height:viewport.height
  });
  const[keyboardCell, setKeyboardCell]=React.useState({
    row:0,
    col:0
  });
  const[keyboardFocused, setKeyboardFocused]=React.useState(false);
  const{
    state:state,
    paused:paused,
    selectedPiece:selectedPiece,
    sceneState:sceneState,
    currentReward:currentReward,
    rewardProgress:rewardProgress
  }=props;
  const phase=state.gameActive?paused?"paused":"playing":"menu";
  const latestEvent=useGameEvents(V=>V.events).find(V=>V.game==="blox");
  React.useEffect(()=>{
    if(!latestEvent)return;
    const V=setTimeout(()=>useGameEvents.getState().dismissEvent(latestEvent.id), Math.max(0, latestEvent.createdAt+latestEvent.ttlMs-Date.now()));
    return()=>clearTimeout(V)
  }, [latestEvent]);
  React.useLayoutEffect(()=>{
    const V=stageRef.current;
    if(!V)return;
    let X=0;
    const be=()=>{
      cancelAnimationFrame(X);
      X=requestAnimationFrame(()=>{
        const R=V.getBoundingClientRect();
        const H=Math.round(R.width);
        const P=Math.round(R.height);
        setSize(ce=>ce.width===H&&ce.height===P?ce:{
          width:H,
          height:P
        })
      });
    };
    be();
    const me=new ResizeObserver(be);
    return me.observe(V),
    window.addEventListener("resize", be),
    window.visualViewport?.addEventListener("resize", be),
    ()=>{
      cancelAnimationFrame(X);
      me.disconnect();
      window.removeEventListener("resize", be);
      window.visualViewport?.removeEventListener("resize", be);
    }
  }, []);
  const composition=React.useMemo(()=>composeBlox({
    ...size,
    hudLayout:resolvedLayout,
 safe:remainingArcadeSafeInsets(resolvedLayout.viewport?.safeAreaInsets)
  }), [size, resolvedLayout]);
  const effectiveSceneState=React.useMemo(()=>({
    ...sceneState,
    bloxComposition:composition,
    bloxKeyboardCell:keyboardFocused&&phase==="playing"?keyboardCell:null
  }), [sceneState, composition, keyboardFocused, keyboardCell, phase]);
  useDialogFocus(dialogRef, {
    active:phase!=="playing"&&!editorVisible,
    resetKey:phase
  });
  useEscapeDismiss(phase==="paused", props.onResume);
  const handleBoardKeyDown=V=>{
    if(phase!=="playing")return;
    const X=bloxKeyboardIntent(V, keyboardCell);
    X&&(V.preventDefault(), X.type==="move"?setKeyboardCell(X.cell):X.type==="place"?sceneState.onBloxCell?.(X.cell.row, X.cell.col):X.type==="pause"&&props.onPause())
  };
  const formattedScore=new Intl.NumberFormat(language==="ru"?"ru":"en").format(state.score||0);
  const inputHint=selectedPiece>=0?t("blox.placeHint"):t("blox.selectHint");
  return jsxRuntime.jsxs(HudRegion, {
    id:"gameShell",
    ref:stageRef,
    className:"bx-stage",
    "data-game-shell":"blox",
    "data-bx-phase":phase,
    "data-bx-arrangement":composition.landscape?"side":"stack",
    "data-bx-compact":composition.compact?"true":"false",
    children:[jsxRuntime.jsxs(HudEditableRegion, {
      id:"bloxBackgroundAsset",
      className:"bx-background",
      "aria-hidden":"true",
      children:[jsxRuntime.jsx("img", {
        src:bloxArtUrl("background"),
        alt:""
      }), jsxRuntime.jsx("span", {
      })]
    }), jsxRuntime.jsx("div", {
      className:"bx-runtime",
      children:jsxRuntime.jsx(BloxRuntimeBoundary, {
        children:jsxRuntime.jsx(React.Suspense, {
          fallback:jsxRuntime.jsx(BloxRuntimeStatus, {
          }),
          children:jsxRuntime.jsx(BloxCanvas, {
            sceneState:effectiveSceneState,
            loadingFallback:jsxRuntime.jsx(BloxRuntimeStatus, {
            }),
            errorFallback:jsxRuntime.jsx(BloxRuntimeStatus, {
              error:true
            })
          })
        })
      })
    }), state.gameActive&&jsxRuntime.jsxs("div", {
      className:"bx-controls",
      "aria-hidden":paused||void 0,
      children:[composition.title&&jsxRuntime.jsxs(HudEditableRegion, {
        id:"bloxTitle",
        className:"bx-title",
        style:absoluteRect(composition.title),
        children:[t("blox.brandFirst"), " ", jsxRuntime.jsx("b", {
          children:t("blox.brandLast")
        })]
      }), jsxRuntime.jsx(HudEditableRegion, {
        id:"gameplayHud",
        className:"bx-hud bx-skin",
        style:{
          ...absoluteRect(composition.hud),
          ...bloxPanelSkin("panel")
        },
        children:jsxRuntime.jsxs("div", {
          className:"bx-metrics",
          children:[jsxRuntime.jsx(BloxMetric, {
            label:t("common.score"),
            value:formattedScore,
            maxSize:composition.compact?20:24
          }), jsxRuntime.jsx(BloxMetric, {
            label:t("common.lines"),
            value:state.linesCleared||0
          }), jsxRuntime.jsx(BloxMetric, {
            label:t("common.reward"),
            value:currentReward,
            progress:rewardProgress
          })]
        })
      }), jsxRuntime.jsxs(HudEditableRegion, {
        id:"bloxActions",
        className:"bx-actions",
        style:absoluteRect(composition.actions),
        children:[jsxRuntime.jsxs("button", {
          type:"button",
          className:"bx-action bx-skin",
          style:bloxPanelSkin("button"),
          "data-blox-rotate":"true",
          "data-count":state.rotateCharges||0,
          "aria-label":t("blox.rotateTooltip", {
            count:state.rotateCharges||0
          }),
          disabled:phase!=="playing"||(state.rotateCharges||0)<=0,
          onClick:props.onRotate,
          children:[jsxRuntime.jsx("img", {
            src:bloxArtUrl("rotate"),
            alt:""
          }), jsxRuntime.jsx("span", {
            className:"bx-rotate-count",
            children:state.rotateCharges||0
          })]
        }), jsxRuntime.jsx("button", {
          type:"button",
          className:"bx-action bx-skin",
          style:bloxPanelSkin("button"),
          "data-game-pause":"true",
          "aria-label":t("common.pause"),
          onClick:props.onPause,
          children:jsxRuntime.jsx("img", {
            src:bloxArtUrl("pause"),
            alt:""
          })
        })]
      }), jsxRuntime.jsx("div", {
        role:"grid",
        tabIndex:phase==="playing"?0:-1,
        className:"bx-keyboard-board",
        style:absoluteRect(composition.board),
        "aria-label":t("blox.keyboardBoard", {
          row:keyboardCell.row+1,
          col:keyboardCell.col+1
        }),
        "aria-rowcount":10,
        "aria-colcount":10,
        "aria-activedescendant":`bx-cell-${keyboardCell.row}-${keyboardCell.col}`,
        onFocus:()=>setKeyboardFocused(true),
        onBlur:()=>setKeyboardFocused(false),
        onKeyDown:handleBoardKeyDown,
        children:jsxRuntime.jsx("span", {
          className:"bx-sr-only",
          children:Array.from({
            length:10
          }, (V, X)=>jsxRuntime.jsx("span", {
            role:"row",
            children:Array.from({
              length:10
            }, (be, me)=>jsxRuntime.jsx("span", {
              role:"gridcell",
              id:`bx-cell-${X}-${me}`,
              "aria-selected":keyboardCell.row===X&&keyboardCell.col===me,
              children:t(state.board[X]?.[me]?"blox.occupiedCell":"blox.emptyCell", {
                row:X+1,
                col:me+1
              })
            }, me))
          }, X))
        })
      }), jsxRuntime.jsx(HudEditableRegion, {
        id:"bloxTrayDock",
        className:"bx-keyboard-tray",
        style:absoluteRect(composition.tray),
        children:composition.slots.map((V, X)=>jsxRuntime.jsx("button", {
          type:"button",
          className:"bx-keyboard-slot",
          tabIndex:state.tray[X]?.placed?-1:0,
          style:absoluteRect({
            ...V,
            left:V.left-composition.tray.left,
            top:V.top-composition.tray.top
          }),
          disabled:!state.tray[X]?.piece||state.tray[X]?.placed,
          "aria-label":t("blox.selectPiece", {
            number:X+1,
            cells:state.tray[X]?.piece?.cells?.length||0
          }),
          "aria-pressed":selectedPiece===X,
          onClick:()=>sceneState.onBloxTray?.(X)
        }, X))
      }), jsxRuntime.jsx(HudEditableRegion, {
        id:"eventLog",
        className:"bx-status",
        style:absoluteRect(composition.status),
        role:"status",
        "aria-live":"polite",
        "data-tone":latestEvent?.tone,
        children:latestEvent?`${latestEvent.title}${latestEvent.value?" "+latestEvent.value:""}`:inputHint
      })]
    }), phase!=="playing"&&jsxRuntime.jsxs(jsxRuntime.Fragment, {
      children:[jsxRuntime.jsx("div", {
        className:"bx-scrim",
        "aria-hidden":"true",
        "data-menu-blocker":"true",
        onClick:paused?props.onResume:void 0
      }), jsxRuntime.jsx(BloxDialog, {
        ...props,
        paused:paused&&state.gameActive,
        dialogRef:dialogRef,
        maxWidth:resolvedLayout.regions.pauseOverlay?.maxWidth||460
      })]
    })]
  })
}

export default BloxPresentation;

