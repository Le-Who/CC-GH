/** Recovered game-only source from the owned Match3 v2 r2 preview. See recovery manifest. */
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {HudRegion,HudEditableRegion,useHudLayout} from '../../app/hud-layout/index.js';
import {useAppI18n} from '../../app/i18n.jsx';
import {useDialogFocus} from '../../app/useDialogFocus.js';
import {useEscapeDismiss} from '../../app/useDismissableLayer.js';
import {resolveAssetUrl} from '../../game-runtime/assetBundles.js';
import {remainingArcadeSafeInsets} from '../../app/arcadeBoundary.js';
import {composeMatch3} from './match3Composition.js';
import {MATCH3_RETAINED_ASSET_KEYS,MATCH3_GEM_ART,MATCH3_TOOL_ART,MATCH3_TOOLS,MATCH3_SPECIAL_ASSET_KEYS,MATCH3_PIXI_ASSETS,match3ArtUrl,match3PanelSkin} from './match3Art.js';
import './match3-presentation.css';
const Match3Canvas=React.lazy(()=>Promise.all([import('../../game-runtime/PixiGameHost.jsx'),import('../../game-runtime/scenes/match3Scene.js')]).then(([host,scene])=>({default:function Match3Canvas(props){return jsxRuntime.jsx(host.default,{sceneKey:'match3',buildScene:scene.buildMatch3Scene,isolated:true,className:'m3-canvas',assetUrls:MATCH3_PIXI_ASSETS,assetKeys:MATCH3_RETAINED_ASSET_KEYS,...props})}})));

const absoluteRect=n=>({
  position:"absolute",
  left:n.left,
  top:n.top,
  width:n.width,
  height:n.height,
  maxWidth:"none"
});
function Match3Button({
  children:children,
  className:className="",
  primary:primary=false,
  ...props
}){
  return jsxRuntime.jsx("button", {
    type:"button",
    className:`m3-button m3-skin${primary?" m3-primary":""}${className?" "+className:""}`,
    style:match3PanelSkin("card", [10, 10, 10, 10]),
    ...props,
    children:children
  })
}
function Match3RuntimeStatus({
  error:error=false
}){
  const{
    t:t
  }=useAppI18n();
  return jsxRuntime.jsxs("div", {
    className:`m3-runtime-status${error?" m3-runtime-error":""}`,
    role:error?"alert":"status",
    children:[jsxRuntime.jsx("strong", {
      children:t(error?"app.gameLoadErrorTitle":"app.loadingGameRuntime")
    }), error&&jsxRuntime.jsxs(jsxRuntime.Fragment, {
      children:[jsxRuntime.jsx("span", {
        children:t("app.gameLoadErrorBody")
      }), jsxRuntime.jsx(Match3Button, {
        onClick:()=>window.location.reload(),
        children:t("common.retry")
      })]
    })]
  })
}
class Match3RuntimeBoundary extends React.Component{
  state={
    failed:false
  };
  static getDerivedStateFromError(){
    return{
      failed:true
    }
  }
  componentDidCatch(i){
    console.error("Match3 renderer failed", i)
  }
  render(){
    return this.state.failed?jsxRuntime.jsx(Match3RuntimeStatus, {
      error:true
    }):this.props.children
  }
}
function Match3Metric({
  label:label,
  value:value,
  className:className="",
  size:size=28,
  progress:progress=null
}){
  const length=String(value).length;
  return jsxRuntime.jsxs("div", {
    className:`m3-metric ${className}`,
    "aria-label":`${label}: ${value}`,
    children:[jsxRuntime.jsx("span", {
      children:label
    }), jsxRuntime.jsx("strong", {
      style:{
        fontSize:Math.max(14, Math.min(size, size*6/Math.max(6, length)))
      },
      children:value
    }), progress!=null&&jsxRuntime.jsx("i", {
      className:"m3-reward-progress",
      "aria-hidden":"true",
      children:jsxRuntime.jsx("b", {
        style:{
          width:`${Math.max(0,Math.min(1,progress))*100}%`
        }
      })
    })]
  })
}
function Match3Dialog({
  paused:paused,
  score:score,
  movesLeft:movesLeft,
  combo:combo,
  mode:mode,
  modes:modes,
  leaders:leaders,
  onResume:onResume,
  onStart:onStart,
  onNew:onNew,
  onFinish:onFinish,
  onExit:onExit,
  onModeChange:onModeChange,
  onReroll:onReroll,
  dialogRef:dialogRef,
  maxWidth:maxWidth
}){
  const{
    t:j
  }=useAppI18n();
  return jsxRuntime.jsxs(HudEditableRegion, {
    id:"pauseOverlay",
    ref:dialogRef,
    as:"aside",
    className:"m3-dialog m3-skin",
    style:{
      ...match3PanelSkin("card", [20, 20, 20, 20]),
      "--m3-dialog-max":`${maxWidth}px`
    },
    role:"dialog",
    "aria-modal":"true",
    "aria-labelledby":"m3-dialog-title",
    tabIndex:-1,
    children:[jsxRuntime.jsxs("div", {
      className:"m3-dialog-heading",
      children:[jsxRuntime.jsx("h1", {
        id:"m3-dialog-title",
        children:j(paused?"pause.paused":"match3.title")
      }), paused&&jsxRuntime.jsx("button", {
        type:"button",
        className:"m3-close",
        "aria-label":j("common.close"),
        onClick:onResume,
        children:"×"
      })]
    }), jsxRuntime.jsx("div", {
      className:"m3-dialog-scroll",
      children:paused?jsxRuntime.jsxs(jsxRuntime.Fragment, {
        children:[jsxRuntime.jsxs("div", {
          className:"m3-pause-metrics",
          children:[jsxRuntime.jsx(Match3Metric, {
            label:j("common.score"),
            value:score,
            size:24
          }), jsxRuntime.jsx(Match3Metric, {
            label:j(mode==="timed"?"common.time":"common.moves"),
            value:movesLeft,
            size:24
          }), jsxRuntime.jsx(Match3Metric, {
            label:j("common.combo"),
            value:combo||"—",
            size:24
          })]
        }), jsxRuntime.jsx(Match3Button, {
          primary:true,
          onClick:onResume,
          children:j("common.resume")
        }), jsxRuntime.jsxs("div", {
          className:"m3-two-actions",
          children:[jsxRuntime.jsx(Match3Button, {
            onClick:onFinish,
            children:j("common.endRun")
          }), jsxRuntime.jsx(Match3Button, {
            onClick:onNew,
            children:j("common.new")
          })]
        }), jsxRuntime.jsx(Match3Button, {
          onClick:onExit,
          children:j("nav.allGames")
        })]
      }):jsxRuntime.jsxs(jsxRuntime.Fragment, {
        children:[jsxRuntime.jsx("p", {
          className:"m3-menu-intro",
          children:j("match3.selectMode")
        }), jsxRuntime.jsx("div", {
          className:"m3-modes",
          "data-mode-selector":"match3",
          "aria-label":j("match3.selectMode"),
          children:modes.map(X=>jsxRuntime.jsxs(Match3Button, {
            className:"m3-mode",
            "aria-pressed":mode===X.id,
            onClick:()=>onModeChange(X.id),
            children:[jsxRuntime.jsx("strong", {
              children:j(X.labelKey)
            }), jsxRuntime.jsx("span", {
              children:j(X.hintKey)
            })]
          }, X.id))
        }), jsxRuntime.jsx(Match3Button, {
          primary:true,
          onClick:onStart,
          children:j("common.start")
        }), jsxRuntime.jsxs("div", {
          className:"m3-two-actions",
          children:[jsxRuntime.jsx(Match3Button, {
            onClick:onReroll,
            children:j("match3.reshuffle")
          }), jsxRuntime.jsx(Match3Button, {
            onClick:onExit,
            children:j("nav.allGames")
          })]
        }), jsxRuntime.jsxs("section", {
          className:"m3-leaders",
          "aria-labelledby":"m3-leaders-title",
          children:[jsxRuntime.jsx("h2", {
            id:"m3-leaders-title",
            children:j("common.leaderboard")
          }), leaders.length?leaders.slice(0, 3).map((X, te)=>jsxRuntime.jsxs("div", {
            className:"m3-leader-row",
            children:[jsxRuntime.jsxs("span", {
              children:[X.rank||te+1, ". ", X.username]
            }), jsxRuntime.jsx("strong", {
              children:X.highScore
            })]
          }, `${X.rank}-${X.username}`)):jsxRuntime.jsx("p", {
            className:"m3-empty",
            children:j("common.noScores")
          })]
        })]
      })
    })]
  })
}
function Match3Presentation(props){
  const{
    t:t,
    language:language
  }=useAppI18n();
  const{
    resolvedLayout:resolvedLayout,
    viewport:viewport
  }=useHudLayout();
  const stageRef=React.useRef(null);
  const dialogRef=React.useRef(null);
  const[size, setSize]=React.useState({
    width:viewport.width,
    height:viewport.height
  });
  const{
    gameActive:gameActive,
    paused:paused,
    inputLocked:inputLocked,
    score:score,
    movesLeft:movesLeft,
    combo:combo,
    currentReward:currentReward,
    rewardProgress:rewardProgress,
    mode:mode,
    currentMode:currentMode,
    modes:modes,
    selectedGemType:selectedGemType,
    activeBooster:activeBooster,
    shuffleCharges:shuffleCharges,
    boosters:boosters,
    leaders:leaders,
    sceneState:sceneState,
    runtimeAssetManifest:runtimeAssetManifest
  }=props;
  const phase=gameActive?paused?"paused":"playing":"menu";
  React.useLayoutEffect(()=>{
    const ne=stageRef.current;
    if(!ne)return;
    let S=0;
    const C=()=>{
      cancelAnimationFrame(S);
      S=requestAnimationFrame(()=>{
        const B=ne.getBoundingClientRect();
        const V=Math.round(B.width);
        const P=Math.round(B.height);
        setSize(K=>K.width===V&&K.height===P?K:{
          width:V,
          height:P
        })
      });
    };
    C();
    const O=new ResizeObserver(C);
    return O.observe(ne),
    window.addEventListener("resize", C),
    window.visualViewport?.addEventListener("resize", C),
    ()=>{
      cancelAnimationFrame(S);
      O.disconnect();
      window.removeEventListener("resize", C);
      window.visualViewport?.removeEventListener("resize", C);
    }
  }, []);
  const composition=React.useMemo(()=>composeMatch3({
    ...size,
    hudLayout:resolvedLayout,
 safe:remainingArcadeSafeInsets(resolvedLayout.viewport?.safeAreaInsets)
  }), [size, resolvedLayout]);
  const effectiveSceneState=React.useMemo(()=>({
    ...sceneState,
    match3Composition:composition
  }), [sceneState, composition]);
  useDialogFocus(dialogRef, {
    active:phase!=="playing",
    resetKey:phase
  });
  useEscapeDismiss(phase==="paused", props.onResume);
  const selectedGemAsset=selectedGemType?MATCH3_GEM_ART[selectedGemType]?match3ArtUrl(MATCH3_GEM_ART[selectedGemType]):resolveAssetUrl(MATCH3_SPECIAL_ASSET_KEYS[selectedGemType], {
    runtimeManifest:runtimeAssetManifest
  }):null;
  const selectionText=inputLocked?t("match3.settling"):activeBooster?t(`match3.booster.${activeBooster}`):selectedGemType?`${t("match3.selectedGem")}: ${t(`match3.gem.${selectedGemType}`)}`:t("match3.noSelection");
  const formattedScore=new Intl.NumberFormat(language==="ru"?"ru":"en").format(score);
  const hud=composition.hud;
  const tightHud=composition.landscape&&composition.hud.height<82;
  const metricSize=tightHud?14:composition.compact?composition.landscape?18:22:28;
  return jsxRuntime.jsxs(HudRegion, {
    id:"gameShell",
    ref:stageRef,
    className:"m3-stage",
    "data-game-shell":"match3",
    "data-m3-phase":phase,
    "data-m3-arrangement":composition.landscape?"side":"stack",
    "data-m3-compact":composition.compact?"true":"false",
    "data-m3-tight":tightHud?"true":"false",
    children:[jsxRuntime.jsxs(HudEditableRegion, {
      id:"match3BackgroundAsset",
      className:"m3-background",
      "aria-hidden":"true",
      children:[jsxRuntime.jsx("img", {
        src:match3ArtUrl(composition.landscape?"backgroundLandscape":"backgroundPortrait"),
        alt:""
      }), jsxRuntime.jsx("span", {
      })]
    }), jsxRuntime.jsx("div", {
      className:"m3-runtime",
      children:jsxRuntime.jsx(Match3RuntimeBoundary, {
        children:jsxRuntime.jsx(React.Suspense, {
          fallback:jsxRuntime.jsx(Match3RuntimeStatus, {
          }),
          children:jsxRuntime.jsx(Match3Canvas, {
            sceneState:effectiveSceneState,
            loadingFallback:jsxRuntime.jsx(Match3RuntimeStatus, {
            }),
            errorFallback:jsxRuntime.jsx(Match3RuntimeStatus, {
              error:true
            })
          })
        })
      })
    }), gameActive&&jsxRuntime.jsxs("div", {
      className:"m3-controls",
      "aria-hidden":paused||void 0,
      children:[composition.title&&jsxRuntime.jsxs(HudEditableRegion, {
        id:"match3TitleAsset",
        className:"m3-title",
        style:{
          ...absoluteRect(composition.title),
          fontSize:composition.title.height*.5
        },
        children:[jsxRuntime.jsx("img", {
          src:match3ArtUrl("title"),
          alt:""
        }), jsxRuntime.jsx("span", {
          children:t("match3.title")
        })]
      }), jsxRuntime.jsxs(HudEditableRegion, {
        id:"gameplayHud",
        className:"m3-hud m3-skin",
        style:{
          ...absoluteRect(hud),
          ...match3PanelSkin(composition.landscape?"hudLandscape":"hudPortrait")
        },
        "aria-label":t("match3.title"),
        children:[composition.landscape?jsxRuntime.jsxs("div", {
          className:"m3-stat-grid",
          children:[jsxRuntime.jsx(Match3Metric, {
            label:t("common.score"),
            value:formattedScore,
            size:metricSize
          }), jsxRuntime.jsx(Match3Metric, {
            label:t(mode==="timed"?"common.time":"common.moves"),
            value:movesLeft,
            size:tightHud?16:composition.compact?18:30
          }), jsxRuntime.jsx(Match3Metric, {
            label:t("common.combo"),
            value:combo?`×${combo}`:"—",
            size:metricSize,
            className:"m3-combo"
          }), jsxRuntime.jsx(Match3Metric, {
            label:t("common.reward"),
            value:currentReward,
            size:metricSize,
            progress:rewardProgress
          })]
        }):jsxRuntime.jsxs(jsxRuntime.Fragment, {
          children:[jsxRuntime.jsx(Match3Metric, {
            className:"m3-score",
            label:t("common.score"),
            value:formattedScore,
            size:metricSize
          }), jsxRuntime.jsxs("div", {
            className:"m3-turns",
            style:{
              backgroundImage:`url(${JSON.stringify(match3ArtUrl("round"))})`
            },
            "aria-label":`${t(mode==="timed"?"common.time":"common.moves")}: ${movesLeft}`,
            children:[jsxRuntime.jsx("span", {
              children:t(mode==="timed"?"common.time":"common.moves")
            }), jsxRuntime.jsx("strong", {
              children:movesLeft
            })]
          }), jsxRuntime.jsxs("div", {
            className:"m3-combo-reward",
            children:[jsxRuntime.jsx(Match3Metric, {
              label:t("common.combo"),
              value:combo?`×${combo}`:"—",
              className:"m3-combo",
              size:composition.compact?18:26
            }), jsxRuntime.jsxs("span", {
              children:[t("common.reward"), " ", jsxRuntime.jsx("b", {
                children:currentReward
              })]
            }), jsxRuntime.jsx("i", {
              className:"m3-reward-progress",
              "aria-hidden":"true",
              children:jsxRuntime.jsx("b", {
                style:{
                  width:`${Math.max(0,Math.min(1,rewardProgress))*100}%`
                }
              })
            })]
          })]
        }), jsxRuntime.jsx("button", {
          type:"button",
          className:"m3-pause",
          "data-game-pause":"true",
          "aria-label":t("common.pause"),
          onClick:props.onPause,
          style:{
            backgroundImage:`url(${JSON.stringify(match3ArtUrl("round"))})`
          },
          children:jsxRuntime.jsx("img", {
            src:match3ArtUrl("pause"),
            alt:""
          })
        })]
      }), jsxRuntime.jsxs(HudEditableRegion, {
        id:"match3SelectionHud",
        className:"m3-selection m3-skin",
        style:{
          ...absoluteRect(composition.selection),
          ...match3PanelSkin("hudPortrait", [8, 7, 8, 7])
        },
        "aria-busy":inputLocked,
        children:[jsxRuntime.jsx("span", {
          className:"m3-selection-image",
          children:selectedGemAsset&&jsxRuntime.jsx("img", {
            src:selectedGemAsset,
            alt:""
          })
        }), jsxRuntime.jsx("span", {
          "aria-live":"polite",
          title:selectionText,
          children:selectionText
        })]
      }), jsxRuntime.jsx(HudEditableRegion, {
        id:"match3ActionDock",
        className:"m3-tools",
        style:absoluteRect(composition.tools),
        "aria-label":t("match3.actionDock"),
        children:MATCH3_TOOLS.map((ne, S)=>{
          const C=composition.buttons[S];
          const O=ne==="mix"?shuffleCharges:boosters[ne]||0;
          const B=t(`match3.booster.${ne}`);
          return jsxRuntime.jsxs("button", {
            type:"button",
            className:"m3-tool m3-skin",
            style:{
              ...absoluteRect({
                ...C,
                left:C.left-composition.tools.left,
                top:C.top-composition.tools.top
              }),
              ...match3PanelSkin("card"),
              "--m3-tool-icon":`${Math.max(20,Math.min(C.height-24,C.width-12))}px`
            },
            "aria-label":t("match3.boosterTooltip", {
              booster:B,
              count:O
            }),
            "aria-pressed":ne==="mix"?void 0:activeBooster===ne,
            disabled:inputLocked||O<=0,
            onClick:ne==="mix"?props.onShuffle:()=>props.onBooster(ne),
            "data-match3-shuffle":ne==="mix"?"true":void 0,
            "data-match3-booster":ne==="mix"?void 0:ne,
            "data-count":O,
            children:[jsxRuntime.jsx("img", {
              src:match3ArtUrl(MATCH3_TOOL_ART[ne]),
              alt:""
            }), jsxRuntime.jsx("span", {
              className:"m3-tool-label",
              children:B
            }), jsxRuntime.jsx("span", {
              className:"m3-count",
              "aria-hidden":"true",
              children:O
            })]
          }, ne)
        })
      }), composition.mode&&jsxRuntime.jsx(HudEditableRegion, {
        id:"match3ModeLabel",
        className:"m3-mode-label",
        style:absoluteRect(composition.mode),
        children:t(currentMode.labelKey)
      })]
    }), phase!=="playing"&&jsxRuntime.jsxs(jsxRuntime.Fragment, {
      children:[jsxRuntime.jsx("div", {
        className:"m3-scrim",
        "data-menu-blocker":"true",
        "aria-hidden":"true",
        onClick:paused?props.onResume:void 0
      }), jsxRuntime.jsx(Match3Dialog, {
        ...props,
        paused:paused&&gameActive,
        dialogRef:dialogRef,
        maxWidth:resolvedLayout.regions.pauseOverlay?.maxWidth||440
      })]
    })]
  })
}

export default Match3Presentation;
