/** Game-only DOM presentation with accessible menu, pause, results and compact scroll surface.
 * Recovered from the owned Bubbo v2 review build; see recovery manifest.
 * React and app services are imports from the production app, never bundled copies.
 */
import * as React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import {HudRegion,HudEditableRegion,useHudLayout} from '../../app/hud-layout/index.js';
import {useAppI18n,playerFeedbackText} from '../../app/i18n.jsx';
import {useGameEvents} from '../../game-state/gameEvents.js';
import {useDialogFocus} from '../../app/useDialogFocus.js';
import {useEscapeDismiss} from '../../app/useDismissableLayer.js';
import {composeBubbo} from './bubboComposition.js';
import {remainingBubboSafeInsets} from './bubboBoundary.js';
import {bubboArtUrl,bubboPanelSkin} from './bubboArt.js';
import BubboField from './BubboField.jsx';
import './bubbo-presentation.css';

const absoluteRect=i=>({
  position:"absolute",
  left:i.left,
  top:i.top,
  width:i.width,
  height:i.height
});
function BubboButton({
  children:children,
  primary:primary=false,
  className:className="",
  ...props
}){
  return jsxRuntime.jsx("button", {
    type:"button",
    className:`bb-button bb-skin${primary?" bb-primary":""} ${className}`,
    style:bubboPanelSkin("button"),
    ...props,
    children:children
  })
}
function BubboMetric({
  label:label,
  value:value
}){
  return jsxRuntime.jsxs("div", {
    className:"bb-metric",
    children:[jsxRuntime.jsx("span", {
      children:label
    }), jsxRuntime.jsx("strong", {
      style:{
        fontSize:`${Math.max(13,Math.min(20,80/Math.max(4,String(value).length)))}px`
      },
      children:value
    })]
  })
}
function BubboPresentation({
  sceneState:sceneState,
  gameActive:gameActive,
  paused:paused,
  runResult:runResult,
  mode:mode,
  onMode:onMode,
  onStart:onStart,
  onResumeSaved:onResumeSaved,
  savedRun:savedRun,
  onPause:onPause,
  onResume:onResume,
  onFinish:onFinish,
  onExit:onExit,
  onSwap:onSwap,
  onPower:onPower,
  swapCharges:swapCharges,
  currentReward:currentReward,
  highScore:highScore,
  starting:starting=false,
  error:error="",
  onBusy:onBusy
}){
  const{
    t:t,
    language:language
  }=useAppI18n();
  const{
    viewport:viewport,
    resolvedLayout:resolvedLayout,
    editorVisible:editorVisible
  }=useHudLayout();
  const stageRef=React.useRef(null);
  const dialogRef=React.useRef(null);
  const fieldRef=React.useRef(null);
  const scrollRef=React.useRef(null);
  const[scrolledToLauncher, setScrolledToLauncher]=React.useState(false);
  const[size, setSize]=React.useState({
    width:viewport.width,
    height:viewport.height
  });
  const[flightBusy, setFlightBusy]=React.useState(false);
  const[aimDegrees, setAimDegrees]=React.useState(0);
  const bubbo=sceneState.bubbo;
  const phase=gameActive?paused?"paused":"playing":runResult?"result":"menu";
  const events=useGameEvents(oe=>oe.events);
  const latestEvent=events.find(oe=>oe.game==="bubbo");
  React.useEffect(()=>{
    if(!latestEvent)return;
    const oe=setTimeout(()=>useGameEvents.getState().dismissEvent(latestEvent.id), Math.max(0, latestEvent.createdAt+latestEvent.ttlMs-Date.now()));
    return()=>clearTimeout(oe)
  }, [latestEvent]);
  React.useLayoutEffect(()=>{
    const oe=stageRef.current;
    if(!oe)return;
    let ht=0;
    const fe=()=>{
      cancelAnimationFrame(ht);
      ht=requestAnimationFrame(()=>{
        const Xe=oe.getBoundingClientRect();
        setSize(_t=>_t.width===Xe.width&&_t.height===Xe.height?_t:{
          width:Xe.width,
          height:Xe.height
        })
      });
    };
    fe();
    const Se=new ResizeObserver(fe);
    return Se.observe(oe),
    window.addEventListener("resize", fe),
    window.addEventListener("orientationchange", fe),
    window.visualViewport?.addEventListener("resize", fe),
    ()=>{
      cancelAnimationFrame(ht);
      Se.disconnect();
      window.removeEventListener("resize", fe);
      window.removeEventListener("orientationchange", fe);
      window.visualViewport?.removeEventListener("resize", fe);
    }
  }, []);
  const composition=React.useMemo(()=>composeBubbo({
    ...size,
    hudLayout:resolvedLayout,
    safe:remainingBubboSafeInsets(resolvedLayout.viewport?.safeAreaInsets)
  }), [size, resolvedLayout]);
  useDialogFocus(dialogRef, {
    active:phase!=="playing"&&!editorVisible,
    resetKey:phase
  });
  useEscapeDismiss(phase==="paused", onResume);
  const limitValue=mode==="timed"?`${Math.max(0,bubbo.timeLeft||0)}s`:bubbo.shotsLeft;
  const formattedScore=new Intl.NumberFormat(language==="ru"?"ru":"en").format(bubbo.score||0);
  const pressureSeconds=Math.max(1, Math.ceil((1-(bubbo.pressureStep||0))*9.5));
  const handleBusy=oe=>{
    setFlightBusy(oe);
    onBusy?.(oe);
  };
  const aimHint=bubbo.activePowerup?t("bubbo.armed", {
    name:t(`bubbo.powerup.${bubbo.activePowerup}`)
  }):t(flightBusy?"bubbo.inFlight":"bubbo.aimHint");
  return jsxRuntime.jsxs(HudRegion, {
    id:"gameShell",
    ref:stageRef,
    className:"bb-stage",
    "data-game-shell":"bubbo",
    "data-bb-phase":phase,
    "data-bb-arrangement":composition.landscape?"side":"stack",
    "data-bb-ultra":composition.ultra?"true":"false",
    "data-bb-compact":composition.compact?"true":"false",
    "data-testid":"bb-stage",
    children:[jsxRuntime.jsxs(HudEditableRegion, {
      id:"bubboBackgroundAsset",
      className:"bb-background",
      "aria-hidden":"true",
      children:[jsxRuntime.jsx("img", {
        src:bubboArtUrl(composition.landscape?"background":"background-portrait"),
        alt:""
      }), jsxRuntime.jsx("span", {
      })]
    }), composition.scroll&&jsxRuntime.jsxs(HudEditableRegion, {
      id:"bubboCompactScroll",
      applyLayout:false,
      className:"bb-scroll-nav",
      children:[jsxRuntime.jsx("span", {
        children:t("bubbo.lowHeight")
      }), jsxRuntime.jsx(BubboButton, {
        onClick:()=>scrollRef.current?.scrollTo({
          top:scrolledToLauncher?0:scrollRef.current.scrollHeight,
          behavior:"instant"
        }),
        children:t(scrolledToLauncher?"bubbo.showField":"bubbo.showCannon")
      })]
    }), jsxRuntime.jsx("div", {
      ref:scrollRef,
      className:"bb-scroll-surface",
      "data-scroll":composition.scroll?"true":"false",
      style:{
        top:composition.scrollTop
      },
      tabIndex:composition.scroll?0:-1,
      role:"region",
      "aria-label":t("bubbo.scrollRegion"),
      onScroll:oe=>setScrolledToLauncher(oe.currentTarget.scrollTop>20),
      children:jsxRuntime.jsxs("div", {
        className:"bb-layout",
        style:{
          height:composition.height
        },
        children:[jsxRuntime.jsxs(HudEditableRegion, {
          id:"bubboComposition",
          applyLayout:false,
          className:"bb-playfield",
          style:absoluteRect(composition.field),
          children:[jsxRuntime.jsx(BubboField, {
            ref:fieldRef,
            state:{
              ...bubbo,
              runActive:gameActive
            },
            width:composition.field.width,
            height:composition.field.height,
            onShotStart:sceneState.onBubboShotStart,
            onFire:sceneState.onBubboFire,
            onPause:onPause,
            onBusy:handleBusy,
            onAim:setAimDegrees,
            canvasLabel:t("bubbo.keyboardField"),
            nextLabel:t("bubbo.next"),
            loadingLabel:t("app.loadingGameRuntime"),
            loadErrorLabel:t("app.gameLoadErrorTitle"),
            retryLabel:t("common.retry")
          }), gameActive&&jsxRuntime.jsx(BubboButton, {
            className:"bb-fire",
            "data-testid":"bb-fire",
            disabled:phase!=="playing"||flightBusy,
            onClick:()=>fieldRef.current?.fire(),
            children:t("bubbo.fire")
          })]
        }), gameActive&&jsxRuntime.jsxs("div", {
          className:"bb-controls",
          "aria-hidden":paused||void 0,
          children:[composition.heading&&jsxRuntime.jsxs("div", {
            className:"bb-brand",
            style:absoluteRect(composition.heading),
            children:[t("bubbo.brand"), " ", jsxRuntime.jsx("span", {
              children:t("bubbo.brand")
            })]
          }), jsxRuntime.jsxs(HudEditableRegion, {
            id:"gameplayHud",
            applyLayout:false,
            className:"bb-hud bb-skin",
            style:{
              ...absoluteRect(composition.hud),
              ...bubboPanelSkin()
            },
            children:[jsxRuntime.jsxs("div", {
              className:"bb-stats",
              children:[jsxRuntime.jsx(BubboMetric, {
                label:t("common.score"),
                value:formattedScore
              }), jsxRuntime.jsx(BubboMetric, {
                label:t(mode==="timed"?"common.time":"common.shots"),
                value:limitValue
              }), jsxRuntime.jsx("button", {
                type:"button",
                className:"bb-pause bb-skin",
                style:bubboPanelSkin("button"),
                "aria-label":t("common.pause"),
                "data-game-pause":"true",
                "data-testid":"bb-pause",
                onClick:onPause,
                children:jsxRuntime.jsx("span", {
                  "aria-hidden":"true",
                  children:"Ⅱ"
                })
              })]
            }), jsxRuntime.jsxs("div", {
              className:"bb-pressure",
              role:"timer",
              "aria-label":t("bubbo.descent", {
                seconds:pressureSeconds
              }),
              children:[jsxRuntime.jsx("span", {
                children:t("bubbo.descent", {
                  seconds:pressureSeconds
                })
              }), jsxRuntime.jsx("i", {
                "aria-hidden":"true",
                children:jsxRuntime.jsx("b", {
                  style:{
                    width:`${Math.max(0,Math.min(1,bubbo.pressureStep||0))*100}%`
                  }
                })
              })]
            })]
          }), jsxRuntime.jsx(HudEditableRegion, {
            id:"bubboActionDock",
            applyLayout:false,
            className:"bb-powers",
            style:absoluteRect(composition.actions),
            children:["swap", "bomb", "rainbow", "lightning"].map(oe=>{
              const ht=oe==="swap"?swapCharges:bubbo.powerups[oe];
              return jsxRuntime.jsxs("button", {
                type:"button",
                className:"bb-power bb-skin",
                style:bubboPanelSkin("button"),
                "data-testid":`bb-${oe}`,
                "data-bubbo-powerup":oe==="swap"?void 0:oe,
                "aria-pressed":oe==="swap"?void 0:bubbo.activePowerup===oe,
                "aria-label":t("bubbo.powerupTooltip", {
                  powerup:t(oe==="swap"?"bubbo.swap":`bubbo.powerup.${oe}`),
                  count:ht
                }),
                disabled:phase!=="playing"||flightBusy||ht<=0,
                onClick:()=>oe==="swap"?onSwap():onPower(oe),
                children:[jsxRuntime.jsx("img", {
                  src:bubboArtUrl(oe),
                  alt:"",
                  draggable:false
                }), jsxRuntime.jsx("span", {
                  children:t(oe==="swap"?"bubbo.swap":`bubbo.powerup.${oe}`)
                }), jsxRuntime.jsx("b", {
                  children:ht
                })]
              }, oe)
            })
          }), jsxRuntime.jsxs(HudEditableRegion, {
            id:"eventLog",
            applyLayout:false,
            className:"bb-status",
            style:absoluteRect(composition.status),
            "aria-live":"polite",
            "aria-atomic":"true",
            children:[jsxRuntime.jsx("span", {
              children:latestEvent?`${latestEvent.title} ${latestEvent.value}`:aimHint
            }), jsxRuntime.jsxs("span", {
              id:"bb-aim-help",
              children:[t("bubbo.keyHint"), aimDegrees?` · ${aimDegrees>0?"+":""}${aimDegrees}°`:""]
            })]
          })]
        })]
      })
    }), phase!=="playing"&&jsxRuntime.jsxs(jsxRuntime.Fragment, {
      children:[jsxRuntime.jsx("div", {
        className:"bb-scrim",
        "data-menu-blocker":"true",
        "aria-hidden":"true",
        onClick:phase==="paused"?onResume:void 0
      }), jsxRuntime.jsxs(HudEditableRegion, {
        id:"pauseOverlay",
        applyLayout:false,
        ref:dialogRef,
        as:"section",
        className:"bb-dialog bb-skin",
        style:{
          ...bubboPanelSkin("panel", 18),
          "--bb-dialog-max":`${composition.dialogMax}px`
        },
        role:"dialog",
        "aria-modal":"true",
        "aria-labelledby":"bb-title",
        tabIndex:-1,
        children:[jsxRuntime.jsxs("header", {
          children:[jsxRuntime.jsxs("div", {
            children:[phase!=="menu"&&jsxRuntime.jsx("span", {
              className:"bb-kicker",
              children:t(phase==="paused"?"pause.paused":"bubbo.result.kicker")
            }), jsxRuntime.jsx("h1", {
              id:"bb-title",
              children:t("bubbo.title")
            })]
          }), phase==="paused"&&jsxRuntime.jsx("button", {
            type:"button",
            className:"bb-close",
            "aria-label":t("common.close"),
            onClick:onResume,
            children:"×"
          })]
        }), jsxRuntime.jsxs("div", {
          className:"bb-dialog-scroll",
          children:[phase==="menu"?jsxRuntime.jsxs(jsxRuntime.Fragment, {
            children:[jsxRuntime.jsx("div", {
              className:"bb-token-row",
              "aria-hidden":"true",
              children:["mint", "amber", "coral", "sky", "berry"].map(oe=>jsxRuntime.jsx("img", {
                src:bubboArtUrl(oe),
                alt:""
              }, oe))
            }), jsxRuntime.jsx("div", {
              className:"bb-modes",
              children:["classic", "timed"].map(oe=>jsxRuntime.jsxs(BubboButton, {
                "data-testid":`bb-mode-${oe}`,
                "aria-pressed":mode===oe,
                onClick:()=>onMode(oe),
                children:[jsxRuntime.jsx("strong", {
                  children:t(`bubbo.mode.${oe}`)
                }), jsxRuntime.jsx("span", {
                  children:t(`bubbo.mode.${oe}Hint`)
                })]
              }, oe))
            }), jsxRuntime.jsx(BubboButton, {
              primary:true,
              disabled:starting,
              "data-testid":"bb-start",
              onClick:()=>onStart(mode),
              "aria-busy":starting,
              children:t("common.start")
            }), savedRun?.board&&jsxRuntime.jsx(BubboButton, {
              "data-testid":"bb-resume-saved",
              onClick:onResumeSaved,
              children:t("bubbo.resumeSaved")
            }), jsxRuntime.jsx("p", {
              className:"bb-small",
              children:t("bubbo.highScore", {
                score:highScore
              })
            })]
          }):jsxRuntime.jsxs(jsxRuntime.Fragment, {
            children:[jsxRuntime.jsxs("div", {
              className:"bb-dialog-metrics",
              children:[jsxRuntime.jsx(BubboMetric, {
                label:t("common.score"),
                value:runResult?.score??bubbo.score
              }), jsxRuntime.jsx(BubboMetric, {
                label:t(mode==="timed"?"common.time":"common.shots"),
                value:runResult?.limitValue??limitValue
              }), jsxRuntime.jsx(BubboMetric, {
                label:t("common.reward"),
                value:currentReward
              })]
            }), phase==="paused"&&jsxRuntime.jsx("p", {
              children:t("bubbo.pauseHelp")
            }), phase==="paused"?jsxRuntime.jsxs(jsxRuntime.Fragment, {
              children:[jsxRuntime.jsx(BubboButton, {
                primary:true,
                "data-testid":"bb-resume",
                onClick:onResume,
                children:t("common.resume")
              }), jsxRuntime.jsxs("div", {
                className:"bb-two-actions",
                children:[jsxRuntime.jsx(BubboButton, {
                  "data-testid":"bb-restart",
                  disabled:starting,
                  onClick:()=>onStart(mode),
                  children:t("common.restart")
                }), jsxRuntime.jsx(BubboButton, {
                  "data-testid":"bb-finish",
                  onClick:onFinish,
                  children:t("common.endRun")
                })]
              })]
            }):jsxRuntime.jsx(BubboButton, {
              primary:true,
              disabled:starting,
              "data-testid":"bb-restart",
              onClick:()=>onStart(mode),
              children:t("common.restart")
            })]
          }), phase==="menu"&&jsxRuntime.jsxs("div", {
            className:"bb-menu-feedback",
            children:[jsxRuntime.jsx("p", {
              className:"bb-menu-feedback-reserve",
              "aria-hidden":"true",
              children:t("bubbo.menuHelp")
            }), jsxRuntime.jsx("p", {
              className:`bb-menu-feedback-copy${error?" bb-error":""}`,
              role:error?"alert":void 0,
              tabIndex:error?0:void 0,
              children:error?playerFeedbackText(language,error):t("bubbo.menuHelp")
            },error?"error":"help")]
          }), phase!=="menu"&&error&&jsxRuntime.jsx("p", {
            className:"bb-error",
            role:"alert",
            children:playerFeedbackText(language,error)
          }), jsxRuntime.jsx(BubboButton, {
            "data-testid":"bb-exit",
            onClick:onExit,
            children:t("common.exit")
          }), jsxRuntime.jsxs("details", {
            className:"bb-help",
            children:[jsxRuntime.jsx("summary", {
              children:t("bubbo.how")
            }), jsxRuntime.jsx("p", {
              children:t("bubbo.ruleHelp")
            }), jsxRuntime.jsx("ul", {
              children:["bomb", "rainbow", "lightning"].map(oe=>jsxRuntime.jsxs("li", {
                children:[jsxRuntime.jsxs("b", {
                  children:[t(`bubbo.powerup.${oe}`), ":"]
                }), " ", t(`bubbo.help.${oe}`)]
              }, oe))
            })]
          })]
        })]
      })]
    })]
  })
}

export default BubboPresentation;
