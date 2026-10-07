import {canonicalSavedInventoryCommandAllowed} from './canonical-saved-inventory-actions.mjs';
import {canonicalSavedFoodReady,canonicalSavedFoodCommandAllowed} from './canonical-saved-food-actions.mjs';
import {selectCanonicalFoodState} from '../../../game-logic/yard-v2/canonical-food-contract.mjs';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {CANONICAL_LOCATION,CANONICAL_MAX_PLACEMENTS,CANONICAL_ACTION_NONCE_PREFIX,canonicalCommandScope,canonicalNoncePrefix,canonicalCapability,canonicalPlacements,canonicalItemState,checkCanonicalPlacement,isCanonicalItemIntent} from '../../game-state/canonicalYardItems.mjs';
import { useGameHub } from '../../game-state/useGameHub.js';
import { HudRegion } from '../../app/hud-layout/index.js';
import { playerFeedbackText, useAppI18n } from '../../app/i18n.jsx';
import { YARD_FOODS, YARD_GOODIES, YARD_REMODELS, YARD_VISITORS } from '../../../game-logic/yard-catalog.js';
import { createCourtyardScene } from './scene-entry.mjs';
import { checkPlacement, courtyardPresentation, SUPPORTED_PROPS, visibleStatus } from './presentation.mjs';
import { MIKA_CLIPS as clips } from '../../../game-logic/yard-v2/media/mika-clips.mjs';
import { MIKA_PLACEMENT_SUGGESTIONS } from '../../../game-logic/yard-v2/mika-media.mjs';
import { yardFeedbackText } from './feedback.mjs';
import {sceneCatalogPreview, scenePhotoPreview, canAffordCatalogCost, placementMessageKey, occupiedDecorLabels, YARD_UI_ART} from './catalog-ui.mjs';
import {formatYardCurrencyBalance} from '../companion-yard/currencyDisplay.js';
import {openHome} from '../../app/homeNavigation.js';
import {useEscapeDismiss} from '../../app/useDismissableLayer.js';
import {LOCAL_PLACEMENT_ERRORS,ownsPlacement,placementCommand,pendingPlacement,retryablePlacement,recoverPlacement} from './placement-recovery.mjs';
import {createUiImageReserve} from './ui-image-reserve.mjs';
import {isCanonicalYardEntryAllowed,PIP_GROUNDING_PREVIEW_RECIPE} from './pip-preview-gate.mjs';
import './courtyard.css';
import './i18n.js';

const VisualCatalogContext=React.createContext(null);
const UiImageAdmissionContext=React.createContext(null);
function UiImage({src,...props}) {
  const admit=React.useContext(UiImageAdmissionContext),[reserved,setReserved]=useState(null);
  useEffect(()=>{if(!src){setReserved(null);return;}if(admit?.(src))setReserved(src);},[src,admit]);
  return <img {...props} src={reserved===src?src:undefined}/>;
}
const uuid = () => globalThis.crypto.randomUUID();
const hasCanonicalIntent=state=>(state.pendingActions||[]).some(item=>item.status!=='failed'&&item.accountId===state.snapshot?.player?.id&&isCanonicalItemIntent(item.payload,item.clientActionId));
const defaultAnchor = id => ({...(MIKA_PLACEMENT_SUGGESTIONS[id] || {x:50,y:50})});

function Icon({name}) { return <span className={`cy-icon cy-icon-${name}`} aria-hidden="true" />; }
function Preview({src,photo}) {
  const visualCatalog=React.useContext(VisualCatalogContext),art=photo && scenePhotoPreview(visualCatalog,photo);
  return <span className={`cy-preview-art${photo?' cy-photo-art':''}`} aria-hidden="true">
    {art?.background && <UiImage className="cy-photo-background" src={art.background} alt="" loading="lazy" />}
    {art?.goodie && <UiImage className="cy-photo-goodie" src={art.goodie} alt="" loading="lazy" />}
    {(art?.visitor || src) && <UiImage className="cy-preview-object" src={art?.visitor || src} alt="" loading="lazy" />}
  </span>;
}
function Row({title,detail,src,children}) { return <div className="cy-row">{src && <Preview src={src}/>}<div className="cy-row-copy"><strong>{title}</strong><small>{detail}</small></div><div className="cy-row-actions">{children}</div></div>; }
function Card({title,detail,src,photo,children}) { return <article className="cy-card"><Preview src={src} photo={photo}/><strong>{title}</strong><small>{detail}</small>{children && <div className="cy-card-actions">{children}</div>}</article>; }
function Empty({src,children}) { return <div className="cy-empty"><Preview src={src}/><p>{children}</p></div>; }

export default function CourtyardGame({allowCanonicalEntry=false,allowPipPrototype=false,allowCanonicalFoodPreview=false,pipGroundingRecipe='baseline'}={}) {
  const {language,t}=useAppI18n();
  // Build permission only makes the lazy owner available. Its initial mode is
  // still legacy; the internal button performs the explicit visual opt-in.
  const optionalSceneAllowed=allowPipPrototype||allowCanonicalEntry;
  const canonicalFoodPreview=allowPipPrototype?allowCanonicalFoodPreview:allowCanonicalEntry;
  const groundingRecipe=allowPipPrototype?pipGroundingRecipe:allowCanonicalEntry?PIP_GROUNDING_PREVIEW_RECIPE:'baseline';
  const name=id=>{
    if(id==='alchemy_living_arbor')return t('yard.persistent.alchemyArbor');
    if(id==='alchemy_echo_chimes')return t('yard.persistent.alchemyChimes');
    for(const [type,catalog]of [['foods',YARD_FOODS],['goodies',YARD_GOODIES],['remodels',YARD_REMODELS]])
      if(Object.hasOwn(catalog,id))return t(`yard.catalog.${type}.${id}.name`);
    return (Object.hasOwn(YARD_VISITORS,id)?YARD_VISITORS[id].name:null) || t('yard.persistent.unknownItem');
  };
  const cost=value=>[value?.treats?t('yard.cost.treats',{count:value.treats}):'',value?.shinyTreats?t('yard.cost.shiny',{count:value.shinyTreats}):''].filter(Boolean).join(' + ')||t('yard.cost.free');
  const snapshot=useGameHub(s=>s.snapshot),message=useGameHub(s=>s.message),pending=useGameHub(s=>s.pendingActions),storageError=useGameHub(s=>s.outboxStorageError);
  const directHost=useRef(null);
  const [pipPreview,setPipPreview]=useState({enabled:false,phase:"off",settled:false});
  const canvas=useRef(null),scene=useRef(null),latest=useRef(snapshot),dialog=useRef(null),drag=useRef(null),ghostRef=useRef(null);
  const [view,setView]=useState(null),[panel,setPanel]=useState(null),[ghost,setGhost]=useState(null),[error,setError]=useState(''),[menuSelection,setMenuSelection]=useState(null);
  const [uiImages]=useState(()=>createUiImageReserve());
  const admitImage=useCallback(src=>{try{if(uiImages.admit([src]))return true;}catch{}setError('YARD_CAMERA_MEDIA_UNAVAILABLE');return false;},[uiImages]);
  const [companionName,setCompanionName]=useState('');
  const [bowlFood,setBowlFood]=useState({});
  const [decorTab,setDecorTab]=useState('placed'),[selectedDecor,setSelectedDecor]=useState(null),[guestTab,setGuestTab]=useState('visits');
  const placementSubmission=useRef(false),[submittingPlacement,setSubmittingPlacement]=useState(false);
  latest.current=snapshot;
  const yard=snapshot?.yard || {},busy=pending.some(p=>p.action.startsWith('yard.') && p.status!=='failed');
  const current=view || {...courtyardPresentation(snapshot,snapshot?.yardRuntime?.serverNow||0,clips),mutable:false,mediaReady:false};
  const canonicalState=canonicalItemState(snapshot);
  const savedMode=current.canonicalSavedVisits===true,savedPending=savedMode&&snapshot?.yardRuntime?.status==='reconciliation-pending';
  const itemMode=current.canonicalItems===true,itemMutable=!savedMode&&itemMode&&current.mediaReady&&!!canonicalCapability(snapshot);
  const actionSession=useGameHub(s=>s.accountSession);
  const canonicalFood=canonicalFoodPreview&&itemMode?selectCanonicalFoodState(snapshot):null;
  const canUseCanonicalFood=(snap=snapshot)=>savedMode?canonicalSavedFoodReady(snap,current,pipPreview):!!(canonicalFoodPreview&&itemMode&&current.mediaReady===true&&snap?.player?.id&&canonicalCapability(snap)&&selectCanonicalFoodState(snap).available&&current.canonicalFood?.render?.available===true&&!current.canonicalFood?.reentryRequired&&current.canonicalFood.render.state===selectCanonicalFoodState(snap).state);
  const foodConflict=canonicalFood?.reason==='CANONICAL_FOOD_SOCKET_OCCUPIED';
  const foodReentryRequired=current.canonicalFood?.reentryRequired===true;
  const foodNotice=foodReentryRequired?t('yard.canonical.food.reentry'):foodConflict?t('yard.canonical.food.occupied',{slots:occupiedDecorLabels(canonicalFood.occupiedSlotIds,canonicalPlacements(snapshot),name,t('yard.persistent.unknownItem'))}):canonicalFood&&!canonicalFood.available?t('yard.canonical.food.unavailable'):canonicalFood&&current.canonicalFood?.loading?t('yard.canonical.food.loading'):canonicalFood&&current.canonicalFood?.render?.available!==true?t('yard.canonical.food.unavailable'):'';
  // A canonical scene owns placement only. Acquisition still uses the shared
  // wallet and ordinary Yard receipt, with the exact advertised shop binding.
  const canBuyGoodie=(goodieId,snap=snapshot)=>savedMode?canonicalSavedInventoryCommandAllowed(snap,current,'yard.buyGoodie',{goodieId},pipPreview):!!(itemMode
    ? goodieId==='leaf_pot'&&current.mediaReady===true&&snap?.player?.id&&canonicalCapability(snap)
      &&snap.yardRuntime.supportedBindings?.goodies?.leaf_pot?.buy===true&&canAffordCatalogCost(YARD_GOODIES.leaf_pot.cost,snap.yard?.currencies)
    : current.mutable&&current.runtime?.supportedBindings?.goodies?.[goodieId]?.buy&&canAffordCatalogCost(YARD_GOODIES[goodieId]?.cost,snap?.yard?.currencies));
  const validatePlacement=(snap,g)=>{if(!isCanonicalItemIntent(g))return checkPlacement(snap,g,{placing:g.placing});const result=checkCanonicalPlacement(snap,g);return result.ok?(scene.current?.checkPlacement(g)||result):result;};
  const catalogPreview=(kind,id,options)=>sceneCatalogPreview(current.renderCatalog,kind,id,options);
  const navigationArt=id=>id==='decor'&&itemMode?catalogPreview('goodie','leaf_pot'):YARD_UI_ART[id];
  const closePanel=useCallback(()=>setPanel(null),[]);
  useEscapeDismiss(!!panel,closePanel);
  const cancel=useCallback((accepted=false)=>{if(accepted!==true&&pendingPlacement(useGameHub.getState(),ghostRef.current))return;if(drag.current!=null&&canvas.current?.hasPointerCapture?.(drag.current))canvas.current.releasePointerCapture(drag.current);drag.current=null;scene.current?.endPointer();ghostRef.current=null;setGhost(null);scene.current?.setGhost(null);},[]);
  useEffect(()=>{
    useGameHub.getState().setActiveGameShell({id:'room',openPanel:!!panel,closePanel});
    return ()=>{const s=useGameHub.getState();if(s.activeGameShell?.id==='room')s.setActiveGameShell(null);};
  },[panel,closePanel]);
  useEffect(()=>{
    const renderer=createCourtyardScene(canvas.current,{uiImageOwner:uiImages,directHost:directHost.current,prototypeAllowed:optionalSceneAllowed,canonicalFoodPreview,groundingRecipe,onPrototypeState:setPipPreview,onPointerInterrupt:cancel,onSceneFailure:()=>cancel(true),onView:setView,onError:error=>setError(error?.code||'YARD_SCENE_FAILED')});scene.current=renderer;renderer.update(latest.current,{accountSession:useGameHub.getState().accountSession});
    const blur=()=>cancel();window.addEventListener('blur',blur);
    const visibility=()=>{if(document.hidden)cancel();else useGameHub.getState().loadSnapshot();};document.addEventListener('visibilitychange',visibility);
    const interval=setInterval(()=>{if(!document.hidden)useGameHub.getState().loadSnapshot();},10000);
    return ()=>{clearInterval(interval);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);renderer.dispose();scene.current=null;};
  },[cancel,uiImages,optionalSceneAllowed,canonicalFoodPreview,groundingRecipe]);
  useEffect(()=>{
    if(!optionalSceneAllowed)return;
    const diagnostics=Object.freeze({snapshot:()=>scene.current?.diagnostics()||null});window.__yardPipIntegration=diagnostics;
    return()=>{if(window.__yardPipIntegration===diagnostics)delete window.__yardPipIntegration;};
  },[optionalSceneAllowed]);
  useEffect(()=>{scene.current?.update(snapshot,{accountSession:actionSession});if(ghostRef.current){const g=ghostRef.current;if(!ownsPlacement(useGameHub.getState(),g)){cancel(true);return;}const result=validatePlacement(snapshot,g);const next={...g,valid:result.ok,placementError:result.errors?.[0]?.code};ghostRef.current=next;setGhost(next);scene.current?.setGhost(next);}},[snapshot,actionSession]);
  useEffect(()=>{scene.current?.setCanonicalActionPending(hasCanonicalIntent(useGameHub.getState()));},[pending,snapshot]);
  useEffect(()=>{
    const g=ghostRef.current,state=useGameHub.getState();
    if(g){
      if(g.recoveryNonce&&ownsPlacement(state,g)&&!state.pendingActions.some(item=>item.clientActionId===g.recoveryNonce)){setError('');cancel(true);}
      return;
    }
    const recovered=recoverPlacement(state);if(!recovered||!(isCanonicalItemIntent(recovered)?itemMutable:current.mutable))return;
    const result=validatePlacement(latest.current,recovered),next={...recovered,valid:result.ok,placementError:result.errors?.[0]?.code};
    ghostRef.current=next;setGhost(next);scene.current?.setGhost(next);setError('OUTBOX_STORAGE_UNAVAILABLE');
  },[pending,storageError,snapshot,current.mutable,itemMutable,ghost?.recoveryNonce,cancel]);
  useEffect(()=>{if(panel && !dialog.current.open)dialog.current.showModal();else if(!panel && dialog.current.open){dialog.current.close();if(ghostRef.current)canvas.current.focus();}},[panel]);
  useEffect(()=>{if(panel==='guests')setCompanionName(yard.companion?.name || '');},[panel,yard.companion?.name]);
  const act=async(action,payload={})=>{
    const canonical=isCanonicalItemIntent(payload),state=useGameHub.getState();
    if(state.accountSession!==actionSession||state.snapshot?.player?.id!==snapshot?.player?.id)return;
    const actionBusy=state.pendingActions.some(p=>p.action.startsWith('yard.')&&p.status!=='failed');
    const purchase=itemMode&&action==='yard.buyGoodie'&&canBuyGoodie(payload.goodieId,state.snapshot);
    const foodAction=savedMode?canonicalSavedFoodCommandAllowed(state.snapshot,current,action,payload,pipPreview):canUseCanonicalFood(state.snapshot)&&(action==='yard.setFood'&&payload.bowlId==='bowl-1'&&state.snapshot.yardRuntime.supportedBindings?.bowls?.['bowl-1']?.set===true&&state.snapshot.yardRuntime.supportedBindings?.foods?.[payload.foodId]?.set===true&&state.snapshot.yard.foodInventory?.[payload.foodId]>0||action==='yard.buyFood'&&payload.qty===1&&state.snapshot.yardRuntime.supportedBindings?.foods?.[payload.foodId]?.buy===true&&canAffordCatalogCost(YARD_FOODS[payload.foodId]?.cost,state.snapshot.yard.currencies));
    if(actionBusy || !(canonical?itemMutable&&canonicalCapability(state.snapshot,action):savedMode?(foodAction||canonicalSavedInventoryCommandAllowed(state.snapshot,current,action,payload,pipPreview)):current.mutable||purchase||foodAction))return;
    if(canonical)scene.current?.setCanonicalActionPending(true);
    try{const result=await useGameHub.getState().performReliableAction(action,payload,{clientActionId:`${canonical?canonicalNoncePrefix(state.snapshot):'yard-v2:'}${uuid()}`,durability:'outbox'});
      if(result.error)setError(result.error);else if(result.success&&result.pending)setError('');
      return result;
    }finally{if(canonical)scene.current?.setCanonicalActionPending(hasCanonicalIntent(useGameHub.getState()));}
  };
  const startPlacement=(prop,placing=false)=>{
    if(prop.reserved || !(itemMode?itemMutable:current.mutable) || busy)return;
    const coords=itemMode?(placing?scene.current?.defaultItemAnchor():{x:prop.x,y:prop.y}):(prop.transform || prop.anchor || defaultAnchor(prop.goodieId));
    if(!coords)return;
    const owner=useGameHub.getState();
    const candidate={...coords,...(itemMode?canonicalCommandScope(owner.snapshot):{}),slotId:prop.slotId || `${itemMode?'canonical:':'free_v2_'}${uuid()}`,goodieId:prop.goodieId,placing,ownerAccountId:owner.snapshot?.player?.id,ownerSession:owner.accountSession};
    const result=validatePlacement(latest.current,candidate);const next={...candidate,valid:result.ok,placementError:result.errors?.[0]?.code};
    ghostRef.current=next;setGhost(next);scene.current?.setGhost(next);setPanel(null);canvas.current.focus();
  };
  const moveGhost=point=>{const state=useGameHub.getState();if(!point||!ownsPlacement(state,ghostRef.current)||pendingPlacement(state,ghostRef.current))return;const next={...ghostRef.current,...point};const result=validatePlacement(latest.current,next);next.valid=result.ok;next.placementError=result.errors?.[0]?.code;ghostRef.current=next;setGhost(next);scene.current?.setGhost(next);};
  const confirm=async()=>{
    const g=ghostRef.current;if(!g?.valid||placementSubmission.current||!ownsPlacement(useGameHub.getState(),g))return;
    const checked=validatePlacement(useGameHub.getState().snapshot,g);if(!checked.ok){const next={...g,valid:false,placementError:checked.errors?.[0]?.code};ghostRef.current=next;setGhost(next);scene.current?.setGhost(next);return;}
    placementSubmission.current=true;setSubmittingPlacement(true);
    try{
      const {action,payload}=placementCommand(g),result=await act(action,payload);
      if(result?.success&&result.pending){cancel(true);return;}
      if(result?.error&&LOCAL_PLACEMENT_ERRORS.has(result.error)){
        const state=useGameHub.getState(),currentGhost=ghostRef.current,intent=pendingPlacement(state,currentGhost);
        if(intent&&ownsPlacement(state,g)&&currentGhost.slotId===g.slotId){const next={...currentGhost,recoveryNonce:intent.clientActionId};ghostRef.current=next;setGhost(next);}
      }else if(result)cancel(true);
    }finally{placementSubmission.current=false;setSubmittingPlacement(false);}
  };
  const retryPlacement=async()=>{
    const g=ghostRef.current,state=useGameHub.getState();
    if(!g?.valid||!(isCanonicalItemIntent(g)?itemMutable:current.mutable)||placementSubmission.current||!retryablePlacement(state,g))return;
    placementSubmission.current=true;setSubmittingPlacement(true);
    try{
      const result=await state.drainOutbox(),next=useGameHub.getState();
      if(!ownsPlacement(next,g)){setError('ACCOUNT_CHANGED');return;}
      if(result?.error&&LOCAL_PLACEMENT_ERRORS.has(result.error)){setError(result.error);return;}
      if(result&&!next.outboxStorageError){setError('');cancel(true);}
    }finally{placementSubmission.current=false;setSubmittingPlacement(false);}
  };
  const pointerDown=e=>{if(ghostRef.current){drag.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);scene.current?.beginPointer();moveGhost(scene.current?.point(e));}else{const prop=scene.current?.hit(e);if(prop)startPlacement(prop);}};
  const keyDown=e=>{if(!ghostRef.current || e.repeat)return;if(e.key==='Escape'){e.preventDefault();cancel();}else if(e.key==='Enter'){e.preventDefault();confirm();}else{const d={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]}[e.key];if(d){e.preventDefault();moveGhost(scene.current?.offsetPoint(ghostRef.current,{x:d[0],y:d[1]}));}}};
  const internalEntryAvailable=isCanonicalYardEntryAllowed({enabled:allowCanonicalEntry,snapshot,mediaReady:true});
  const enterCanonicalYard=()=>{
    const state=useGameHub.getState();
    if(submittingPlacement||state.accountSession!==actionSession||state.snapshot?.player?.id!==snapshot?.player?.id
      ||!isCanonicalYardEntryAllowed({enabled:allowCanonicalEntry,snapshot:state.snapshot,mediaReady:current.mediaReady}))return;
    setError(value=>value==='YARD_PIP_SCENE_FAILED'?'':value);setPanel(null);setDecorTab('inventory');setSelectedDecor(null);
    scene.current?.setCanonicalItemsEnabled(true);
  };
  const foodBlocked=busy||!(current.mutable||canUseCanonicalFood());
  const savedFoodDisabled=(action,payload)=>savedMode&&!canonicalSavedFoodCommandAllowed(snapshot,current,action,payload,pipPreview);
  const blocked=busy || savedMode || !current.mutable,itemBlocked=busy||!itemMutable,placementBlocked=isCanonicalItemIntent(ghost)?itemBlocked:blocked;
  const bindings=current.runtime?.supportedBindings || {};
  const feedbackCode=error||message||pending.find(item=>item.requiresUserDecision||item.requiresCanonicalReview||item.status==='rollout-paused'&&item.blockedReason==='UNSUPPORTED_YARD_STORAGE_VERSION')?.blockedReason;
  const feedback=feedbackCode==='YARD_PIP_SCENE_FAILED'?t('yard.canonical.displayFailed'):feedbackCode==='YARD_CAMERA_MEDIA_UNAVAILABLE'?t('yard.persistent.error.visualMedia'):feedbackCode==='OUTBOX_STORAGE_UNAVAILABLE'?t('yard.persistent.error.storage'):yardFeedbackText(playerFeedbackText(language,feedbackCode),t);
  const placementState=useGameHub.getState(),placementPending=pendingPlacement(placementState,ghost),placementRetry=storageError&&retryablePlacement(placementState,ghost);
  const previewStatus=t(pipPreview.settled?'yard.pipPreview.inspectionDone':'yard.pipPreview.inspectionActive');
  const sceneLoading=current.mediaReady===false&&current.runtime?.version===1&&current.runtime.status==='ready'&&current.runtime.mutable===true&&!current.runtime.error;
  const status=!snapshot?.yard?t('yard.persistent.loading'):feedback || (busy?t('yard.persistent.saving'):ghost?(ghost.valid?t('yard.persistent.spaceFree'):t(placementMessageKey(ghost.placementError))):sceneLoading?t('yard.persistent.loading'):visibleStatus(current,t));
  const canonicalPending=pending.find(item=>isCanonicalItemIntent(item.payload,item.clientActionId)&&['canonical-blocked','rollout-paused'].includes(item.status));
  const canonicalEntryAvailable=!!canonicalCapability(snapshot)||(canonicalState.available&&canonicalState.records.length>0)||pending.some(item=>isCanonicalItemIntent(item.payload,item.clientActionId)||item.requiresCanonicalReview);
  const interactionPhase=pipPreview.interaction?.phase,interactionIssue=['no-path','entry-blocked','blocked-occupancy','unavailable'].includes(interactionPhase);
  const interactionStatusKey=({planning:'planning',approaching:'approaching',inspecting:'inspecting',recovering:'recovering',settled:'settled','no-path':'noPath','entry-blocked':'entryBlocked','blocked-occupancy':'occupied',unavailable:'unavailable',cancelled:'cancelled'})[interactionPhase];
  const interactionStatus=interactionStatusKey?t(`yard.canonical.interaction.${interactionStatusKey}`):'';
  const canonicalImportant=itemMode&&(foodNotice||interactionIssue||interactionPhase==='planning'||canonicalPending||feedback||busy||!canonicalState.available||ghost&&!ghost.valid);
  const placedItems=itemMode?canonicalPlacements(snapshot):(yard.placedGoodies||[]);
  const decorRows=(decorTab==='placed'?placedItems.map((raw,index)=>({key:raw.slotId,id:raw.goodieId,raw,number:index+1})):decorTab==='inventory'?Object.entries(yard.goodieInventory||{}).filter(([,n])=>n>0).map(([id,count])=>({key:id,id,count})):SUPPORTED_PROPS.map(id=>({key:id,id}))).filter(item=>!itemMode||item.id==='leaf_pot');
  const selected=decorRows.find(item=>item.key===selectedDecor)||decorRows[0];
  const itemState=item=>{
    const supported=itemMode?item.id==='leaf_pot':SUPPORTED_PROPS.includes(item.id),raw=item.raw;
    const prop=raw && current.props.find(p=>p.slotId===raw.slotId);
    const reserved=!itemMode && raw && current.runtime?.visits?.some(v=>v.slotId===raw.slotId && v.reserved);
    const detail=decorTab==='shop'?cost(YARD_GOODIES[item.id].cost):decorTab==='inventory'?t('yard.persistent.stock',{count:item.count})+(supported?'':` · ${t('yard.persistent.savedUnsupported')}`):!supported?t('yard.persistent.savedScenePending'):reserved?t('yard.persistent.occupied'):prop?.readiness?.status==='reposition-needed'?t('yard.persistent.safeApproach'):raw.condition!=='new'?t('yard.persistent.repairNeeded'):prop?t('yard.persistent.inYard'):t('yard.persistent.chooseSpot');
    return {supported,prop,reserved,detail};
  };
  const chosen=selected && itemState(selected);
  const affordable=value=>canAffordCatalogCost(value,yard.currencies);
  const purchaseNote=(value,available)=>!available?t('yard.persistent.unavailableSuffix'):!affordable(value)?` · ${t('yard.persistent.insufficientFunds')}`:'';
  const wallet=(key,label,icon)=>{
    const value=yard.currencies?.[key],formatted=value==null?null:formatYardCurrencyBalance(value,language);
    return <span className="cy-wallet" aria-label={`${label}: ${formatted?.exact??t('yard.persistent.loading')}`} title={formatted?.exact}><Icon name={icon}/><span><small className="cy-visually-hidden">{label}</small><strong>{formatted?.compact??'—'}</strong></span></span>;
  };
  return <UiImageAdmissionContext.Provider value={admitImage}><VisualCatalogContext.Provider value={current.renderCatalog||null}><div className="cy-app" data-yard-version="persistent-mika-r1" data-pip-preview={pipPreview.enabled?"true":"false"} data-canonical-items={itemMode?"true":"false"}>
    <header className="cy-header"><button className="cy-home" aria-label={t('yard.persistent.back')} onClick={openHome}><Icon name="back"/></button><h1 className="cy-visually-hidden">{itemMode?t('yard.canonical.title'):pipPreview.enabled?t('yard.pipPreview.title'):t('yard.title')}</h1><HudRegion id="yardCurrencyStack" className="cy-wallets" applyLayout={false}>{wallet('treats',t('yard.treats'),'treats')}{wallet('shinyTreats',t('yard.shiny'),'shiny')}</HudRegion></header>
    <HudRegion id="yardStage" className="cy-scene" applyLayout={false}>
      <canvas ref={canvas} tabIndex={0} aria-label={t('yard.persistent.canvas')} onPointerDown={pointerDown} onPointerMove={e=>{if(drag.current===e.pointerId)moveGhost(scene.current?.point(e));}} onPointerUp={e=>{if(e.currentTarget.hasPointerCapture?.(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);drag.current=null;scene.current?.endPointer();}} onPointerCancel={cancel} onKeyDown={keyDown}/>
      <div ref={directHost} className="cy-pip-direct-layer" aria-hidden="true"/>
      {itemMode&&!canonicalState.available&&!pipPreview.viewportBlocked && <p className="cy-pip-viewport-note" role="status">{t(savedPending?'yard.persistent.loading':'yard.canonical.unknown')}</p>}
      {pipPreview.viewportBlocked && <p className="cy-pip-viewport-note" role="status">{t('yard.pipPreview.viewportPaused')}</p>}
    </HudRegion>
    <HudRegion id="yardVisitStatus" className="cy-status" data-important={canonicalImportant?'true':undefined} data-editing={itemMode&&ghost?'true':undefined} applyLayout={false} role="status" aria-label={foodNotice|| (pipPreview.enabled&&!itemMode?`${previewStatus} ${t('yard.pipPreview.readOnly')}`:undefined)}>{itemMode&&ghost&&<span className="cy-placement-status-reserve" aria-hidden="true">{t('yard.persistent.placement.blocked')}</span>}<span>{savedMode?(savedPending?t('yard.persistent.loading'):feedback||(current.pets.length?t('yard.persistent.status.visiting',{name:name('pip_hamster')}):current.pendingGifts.length?t('yard.persistent.status.gifts',{count:current.pendingGifts.length}):t(current.bowls.some(b=>b.foodId&&b.servings>0)?'yard.persistent.status.food':'yard.persistent.status.empty'))):itemMode?(canonicalPending&&t('yard.canonical.pending')||!canonicalState.available&&t('yard.canonical.unknown')||feedback||foodNotice&&t(foodReentryRequired?'yard.canonical.food.reentryShort':foodConflict?'yard.canonical.food.occupiedShort':current.canonicalFood?.loading?'yard.canonical.food.loadingShort':'yard.canonical.food.unavailableShort')||busy&&t('yard.persistent.saving')||ghost&&(ghost.valid?t('yard.persistent.spaceFree'):t('yard.persistent.placement.blocked'))||interactionStatus||t(itemMutable?'yard.canonical.ready':'yard.canonical.unavailable')):pipPreview.enabled?previewStatus:status}</span></HudRegion>
    {!savedMode&&(allowPipPrototype||internalEntryAvailable||pipPreview.enabled) && !ghost && <HudRegion id="yardPlacementControls" applyLayout={false} className="cy-placement cy-pip-controls" data-active={pipPreview.enabled?"true":"false"} role="group" aria-label={t(allowPipPrototype?'yard.pipPreview.name':'yard.canonical.title')}>
      {(allowPipPrototype||pipPreview.enabled)&&<button data-pip-control="toggle" aria-label={t(pipPreview.enabled?'yard.pipPreview.return':'yard.pipPreview.enable')} type="button" disabled={!pipPreview.enabled&&(busy||submittingPlacement)} onClick={()=>{setPanel(null);scene.current?.setPrototypeEnabled(!pipPreview.enabled);}}>{pipPreview.enabled?t('yard.pipPreview.returnShort'):t('yard.pipPreview.enable')}</button>}
      {!allowPipPrototype&&!pipPreview.enabled&&internalEntryAvailable&&<button data-yard-action="open-canonical-yard" type="button" disabled={submittingPlacement||current.mediaReady!==true} onClick={enterCanonicalYard}>{t('yard.canonical.open')}</button>}
      {pipPreview.enabled && !itemMode && <button data-pip-control="inspect-again" aria-label={t('yard.pipPreview.inspectAgainFull')} type="button" disabled={pipPreview.viewportBlocked||!pipPreview.settled} onClick={()=>{try{scene.current?.inspectAgain();}catch(e){setPipPreview(v=>({...v,error:e.message}));}}}>{t('yard.pipPreview.inspectAgain')}</button>}
      {allowPipPrototype&&!pipPreview.enabled && <button data-pip-control="canonical-items" type="button" disabled={submittingPlacement||!canonicalEntryAvailable} onClick={()=>{setError(value=>value==='YARD_PIP_SCENE_FAILED'?'':value);setPanel(null);setDecorTab('inventory');setSelectedDecor(null);scene.current?.setCanonicalItemsEnabled(true);}}>{t('yard.canonical.open')}</button>}
      {itemMode && foodReentryRequired && <button data-pip-control="reenter-food" type="button" onClick={()=>{setPanel(null);scene.current?.setCanonicalItemsEnabled(true);}}>{t('yard.canonical.food.reenter')}</button>}
      {itemMode && !foodReentryRequired && <button data-pip-control="inventory" type="button" onClick={()=>{setMenuSelection('decor');setDecorTab('inventory');setSelectedDecor(null);setPanel('decor');}}>{t('yard.persistent.stocks')}</button>}
      {pipPreview.error && !feedback && <small role="status">{t(pipPreview.error.includes('stage requires')?'yard.pipPreview.small':'yard.pipPreview.unavailable')}</small>}
    </HudRegion>}
    {ghost && <HudRegion id="yardPlacementControls" applyLayout={false} className="cy-placement"><strong>{name(ghost.goodieId)}</strong><div><button data-yard-action="cancel-placement" onClick={cancel} disabled={!!placementPending||submittingPlacement}>{t('yard.persistent.cancel')}</button>{placementRetry?<button data-yard-action="retry-placement" onClick={retryPlacement} disabled={!ghost.valid||(isCanonicalItemIntent(ghost)?!itemMutable:!current.mutable)||submittingPlacement}>{t('yard.persistent.retrySaving')}</button>:<button data-yard-action="commit-placement" onClick={confirm} disabled={!ghost.valid||placementBlocked||submittingPlacement||!ownsPlacement(placementState,ghost)}>{t('yard.place')}</button>}</div></HudRegion>}
    <HudRegion id="yardBottomDock" as="nav" className="cy-actions" applyLayout={false} aria-label={t('yard.persistent.actions')}>
      {[['food',t('yard.nav.food'),current.bowls.some(b=>b.servings>0)?t('yard.persistent.bowlFull'):t('yard.persistent.addFood')],['decor',t('yard.persistent.decor'),t('yard.persistent.placedCount',{count:placedItems.length})],['guests',t('yard.persistent.guests'),current.pendingGifts.length?t('yard.persistent.giftCount',{count:current.pendingGifts.length}):t('yard.persistent.memories')]].map(([id,title,detail])=><button key={id} data-nav-item={id} aria-pressed={menuSelection===id} aria-expanded={panel===id} onClick={()=>{setMenuSelection(id);setPanel(id);}} aria-label={`${title}. ${detail}`}><UiImage src={navigationArt(id)} data-nav-art={id} alt=""/><strong>{id==='decor'?t('yard.persistent.decorShort'):title}</strong></button>)}
    </HudRegion>
    <dialog ref={dialog} className="cy-dialog" aria-labelledby="cy-dialog-title" onCancel={closePanel} onClose={closePanel}>
      <header><UiImage src={navigationArt(panel) || undefined} alt=""/><h2 id="cy-dialog-title">{{food:t('yard.nav.food'),decor:t('yard.persistent.decor'),guests:t('yard.persistent.guests')}[panel]}</h2><button aria-label={t('yard.persistent.closePanel')} onClick={closePanel}><Icon name="close"/></button></header>
      {panel==='decor' && <div className="cy-tabs" aria-label={t('yard.persistent.itemCategories')}>{[['placed',t('yard.persistent.inYard')],['inventory',t('yard.persistent.stocks')],['shop',t('yard.nav.shop')]].map(([id,label])=><button data-decor-tab={id} key={id} aria-pressed={decorTab===id} onClick={()=>{setDecorTab(id);setSelectedDecor(null);}}>{label}</button>)}</div>}
      {panel==='guests' && <div className="cy-tabs cy-guest-tabs" aria-label={t('yard.persistent.guestCategories')}>{[['visits',t('yard.persistent.guests')],['album',t('yard.screen.album')],['helper',t('yard.persistent.helper')]].map(([id,label])=><button key={id} aria-pressed={guestTab===id} onClick={()=>setGuestTab(id)}>{label}</button>)}</div>}
      <div className="cy-panel">
      {!snapshot?.yard && <p role="status">{t('yard.persistent.loading')}</p>}
      {panel==='food' && <><p className="cy-intro">{t('yard.persistent.foodNote')}</p>{itemMode&&canonicalFoodPreview&&<p data-canonical-food-status="true" style={{overflowWrap:'anywhere'}} role="status">{foodNotice||t('yard.canonical.food.shared')}</p>}
        <h3>{t('yard.persistent.bowls')}</h3>
        {(yard.bowls||[]).map(b=>{const foodId=bowlFood[b.id]||'kibble',ready=bindings.bowls?.[b.id]?.set===true&&(!itemMode||canUseCanonicalFood()&&b.id==='bowl-1');return <Row key={b.id} src={catalogPreview('food',b.foodId && b.servings>0?b.foodId:'empty_bowl')} title={b.id==='bowl-1'?t('yard.persistent.bowl'):t('yard.persistent.secondBowl')} detail={!ready?t('yard.persistent.bowlSavedUnavailable'):b.foodId?t('yard.persistent.servings',{name:name(b.foodId),count:b.servings}):t('yard.persistent.bowlEmpty')}>
          <select className="cy-food-select" aria-label={t('yard.persistent.foodFor',{bowl:b.id==='bowl-1'?t('yard.persistent.bowl'):t('yard.persistent.secondBowl')})} value={foodId} disabled={foodBlocked || !ready} onChange={e=>setBowlFood(v=>({...v,[b.id]:e.target.value}))}>
            {Object.values(YARD_FOODS).map(f=><option key={f.id} value={f.id} disabled={!bindings.foods?.[f.id]?.set}>{name(f.id)} · {yard.foodInventory?.[f.id]||0}</option>)}
          </select><button data-yard-action="set-food" data-bowl-id={b.id} disabled={foodBlocked || savedFoodDisabled('yard.setFood',{bowlId:b.id,foodId}) || !ready || !bindings.foods?.[foodId]?.set || !(yard.foodInventory?.[foodId]>0)} onClick={()=>act('yard.setFood',{bowlId:b.id,foodId})}>{t('yard.persistent.fill')}</button>
        </Row>;})}
        <h3>{t('yard.shop.food')}</h3><div className="cy-catalog-grid">{Object.values(YARD_FOODS).map(f=><Card key={f.id} src={catalogPreview('food',f.id)} title={name(f.id)} detail={t('yard.persistent.stockCost',{count:snapshot?.yard?(yard.foodInventory?.[f.id]||0):'—',cost:cost(f.cost)})+purchaseNote(f.cost,bindings.foods?.[f.id]?.buy)}><button data-yard-action="buy-food" data-food-id={f.id} disabled={foodBlocked || savedFoodDisabled('yard.buyFood',{foodId:f.id,qty:1}) || !bindings.foods?.[f.id]?.buy || !affordable(f.cost)} onClick={()=>act('yard.buyFood',{foodId:f.id,qty:1})}>{t('yard.persistent.take')}</button></Card>)}</div>
      </>}
      {panel==='decor' && <><p className="cy-intro">{t(itemMode?'yard.canonical.note':decorTab==='placed'?'yard.persistent.decorNote':decorTab==='inventory'?'yard.persistent.inventoryNote':'yard.persistent.shopNote',{count:CANONICAL_MAX_PLACEMENTS})}</p>
        {foodConflict&&<p data-canonical-food-conflict="true" style={{overflowWrap:'anywhere'}} role="status">{foodNotice}</p>}
        {pending.filter(item=>item.requiresUserDecision).map(item=><details key={item.clientActionId} data-yard-rejected-intent={item.clientActionId}><summary style={{minHeight:44,paddingBlock:12}}>{t('yard.canonical.reviewIntent')}</summary><p>{t('yard.canonical.superseded')}</p><p style={{overflowWrap:'anywhere'}}>{t(({ 'yard.placeGoodie':'yard.canonical.intent.place','yard.moveGoodie':'yard.canonical.intent.move','yard.pickupGoodie':'yard.canonical.intent.pickup' })[item.action]||'yard.canonical.intent.other',{slot:item.payload.slotId})}</p>{Number.isFinite(item.payload.x)&&Number.isFinite(item.payload.y)&&<p>{t('yard.canonical.intent.destination',{x:item.payload.x,y:item.payload.y})}</p>}<p style={{overflowWrap:'anywhere'}}>{item.payload.locationId} · {item.payload.locationVersion} · {item.payload.geometryRevision}</p><p style={{overflowWrap:'anywhere'}}>{item.clientActionId}</p></details>)}
        {itemMode&&!canonicalState.available&&decorTab==='placed' && <p role="status">{t(savedPending?'yard.persistent.loading':'yard.canonical.unknown')}</p>}
        {snapshot?.yard && !(itemMode&&!canonicalState.available) && !decorRows.length && <Empty src={YARD_UI_ART.decor}>{t(decorTab==='placed'?'yard.persistent.emptyPlaced':'yard.persistent.emptyInventory')}</Empty>}
        <div className="cy-catalog-grid">{decorRows.map(item=>{const state=itemState(item);return <button className="cy-catalog-choice" data-goodie-id={item.id} data-slot-id={item.raw?.slotId} key={item.key} aria-pressed={selected?.key===item.key} onClick={()=>{setSelectedDecor(item.key);if(itemMode&&item.raw)scene.current?.selectCanonicalSlot(item.key);}}><Preview src={catalogPreview('goodie',item.id,{condition:item.raw?.condition})}/><strong>{name(item.id)}{itemMode&&item.number?` · ${item.number}`:''}</strong><small>{state.detail}</small>{selected?.key===item.key && <span className="cy-selected-mark" aria-hidden="true">✓</span>}</button>;})}</div>
        {decorTab==='shop' && <><h3>{t('yard.persistent.remodels')}</h3><div className="cy-catalog-grid">{Object.values(YARD_REMODELS).map(r=><Card key={r.id} src={catalogPreview('remodel',r.id)} title={name(r.id)} detail={`${yard.remodel===r.id?t('yard.persistent.selected'):yard.ownedRemodels?.includes(r.id)?t('yard.persistent.owned'):cost(r.cost)}${r.id!=='meadow'?t('yard.persistent.scenePendingSuffix'):''}`}><button disabled={blocked || !bindings.remodels?.[r.id]?.select || yard.remodel===r.id} onClick={()=>act('yard.setRemodel',{remodelId:r.id})}>{t('yard.persistent.select')}</button></Card>)}</div>
        <Row title={t('yard.persistent.moreSpace')} detail={yard.expansion?.level>=2?t('yard.persistent.expansionSaved'):t('yard.persistent.expansionLater')}><button disabled>{t('yard.persistent.expand')}</button></Row></>}
      </>}
      {panel==='guests' && guestTab==='visits' && <><Row src={YARD_UI_ART.gift} title={t('yard.gifts')} detail={t('yard.persistent.giftsWaiting',{count:current.pendingGifts.length})}><button data-yard-action="collect-gifts" disabled={(savedMode?busy||!canonicalSavedInventoryCommandAllowed(snapshot,current,'yard.collectGifts',{},pipPreview):blocked) || !current.pendingGifts.length} onClick={()=>act('yard.collectGifts')}>{t('yard.collect')}</button></Row>
        <Row src={YARD_UI_ART.letter} title={t('yard.dailyLetter')} detail={t('yard.persistent.stamps',{count:yard.dailyLetter?.stamps||0})}><button data-yard-action="claim-daily-letter" disabled={(savedMode?busy||!canonicalSavedInventoryCommandAllowed(snapshot,current,'yard.claimDailyLetter',{},pipPreview):blocked) || yard.dailyLetter?.lastClaimedDate===new Date(snapshot?.serverTime||Date.now()).toISOString().slice(0,10)} onClick={()=>act('yard.claimDailyLetter')}>{t('yard.persistent.open')}</button></Row>
        <h3>{t('yard.persistent.visiting')}</h3>
        {snapshot?.yard && !(current.runtime?.visits||[]).length && <Empty src={YARD_UI_ART.guests}>{t('yard.persistent.noVisits')}</Empty>}
        <div className="cy-catalog-grid">{(current.runtime?.visits||[]).map(v=><Card key={v.visitId} src={catalogPreview('visitor',v.visitorId)} title={name(v.visitorId)} detail={v.source==='legacy'?t('yard.persistent.legacyVisit'):t('yard.persistent.visiting')}><button disabled={blocked} onClick={()=>act('yard.capturePhoto',{visitId:v.visitId})}>{t('yard.persistent.addAlbum')}</button></Card>)}</div>
        <h3>{t('yard.persistent.knownGuests')}</h3>
        {snapshot?.yard && !Object.keys(yard.petbook||{}).length && <Empty src={YARD_UI_ART.guests}>{t('yard.persistent.noKnownGuests')}</Empty>}
        <div className="cy-catalog-grid">{Object.entries(yard.petbook||{}).map(([id,p])=><Card key={id} src={catalogPreview('visitor',id)} title={name(id)} detail={t('yard.persistent.visits',{count:p.visits||0})}><button disabled={blocked} onClick={()=>act('yard.capturePhoto',{visitorId:id})}>{t('yard.persistent.portrait')}</button></Card>)}</div>
      </>}
      {panel==='guests' && guestTab==='album' && <>{snapshot?.yard && !(yard.album?.photos||[]).length && <Empty src={YARD_UI_ART.album}>{t('yard.persistent.emptyAlbum')}</Empty>}<div className="cy-catalog-grid">{(yard.album?.photos||[]).map(p=><Card key={p.id} photo={p} title={p.caption || name(p.visitorId)} detail={p.favorite?t('yard.persistent.favoritePhoto'):t('yard.persistent.memorySaved')}><button disabled={blocked || p.favorite} onClick={()=>act('yard.favoritePhoto',{photoId:p.id})}>{t('yard.favorite')}</button></Card>)}</div></>}
      {panel==='guests' && guestTab==='helper' && <><div className="cy-helper-portrait"><Preview src={catalogPreview('companion',yard.companion?.species || 'dog')}/><h3>{t('yard.persistent.helper')}</h3></div><label>{t('yard.persistent.name')}<input value={companionName} maxLength={16} onChange={e=>setCompanionName(e.target.value)} /></label><button className="cy-wide" disabled={blocked || !companionName.trim()} onClick={()=>act('yard.configureCompanion',{name:companionName})}>{t('yard.persistent.saveName')}</button>
        {yard.helper?.unlocked && <label>{t('yard.persistent.helperFood')}<select className="cy-food-select" aria-label={t('yard.persistent.helperFood')} value={yard.helper.preferredFoodId||''} disabled={blocked} onChange={e=>act('yard.configureCompanion',{preferredFoodId:e.target.value})}>
          {!bindings.foods?.[yard.helper.preferredFoodId]?.set && <option value={yard.helper.preferredFoodId||''} disabled>{t('yard.persistent.savedPreference')}</option>}
          {Object.values(YARD_FOODS).filter(f=>bindings.foods?.[f.id]?.set).map(f=><option key={f.id} value={f.id}>{name(f.id)}</option>)}
        </select></label>}
        {yard.helper?.unlocked && <button className="cy-wide" disabled={blocked} onClick={()=>act('yard.configureCompanion',{helperAutoRefill:!yard.helper.autoRefill})}>{t('yard.persistent.autoFood',{state:yard.helper.autoRefill?t('yard.on'):t('yard.off')})}</button>}
      </>}
      {feedback && <p className="cy-feedback" role="alert">{feedback}</p>}
      </div>
      {panel==='decor' && selected && <footer className="cy-selected-actions"><div><strong>{name(selected.id)}</strong><small>{chosen.detail}{decorTab==='shop'?purchaseNote(YARD_GOODIES[selected.id]?.cost,bindings.goodies?.[selected.id]?.buy):''}{decorTab==='placed' && selected.raw.condition!=='new' && chosen.supported && !affordable(YARD_GOODIES[selected.id]?.fixCost)?` · ${t('yard.persistent.insufficientFunds')}`:''}</small></div><div className="cy-row-actions">
        {decorTab==='placed' && <><button data-yard-action="move" disabled={(itemMode?itemBlocked:blocked) || chosen.reserved || !chosen.supported} onClick={()=>startPlacement(chosen.prop || selected.raw)}>{t('yard.move')}</button><button data-yard-action="pickup" disabled={(itemMode?itemBlocked:blocked) || chosen.reserved} onClick={()=>act('yard.pickupGoodie',{slotId:selected.raw.slotId,...(itemMode?canonicalCommandScope(snapshot):{})})}>{t('yard.store')}</button>{selected.raw.condition!=='new' && <button disabled={blocked || chosen.reserved || !chosen.supported || !affordable(YARD_GOODIES[selected.id]?.fixCost)} onClick={()=>act('yard.fixGoodie',{slotId:selected.raw.slotId})}>{t('yard.persistent.repairCost',{cost:cost(YARD_GOODIES[selected.id]?.fixCost)})}</button>}</>}
        {decorTab==='placed'&&itemMode && <button data-pip-control="inspect-selected" disabled={itemBlocked||!!ghost||!pipPreview.interaction?.spawned} onClick={()=>{try{if(scene.current?.inspectCanonicalSlot(selected.raw.slotId)){setError('');setPanel(null);}else setError('CANONICAL_INTERACTION_UNAVAILABLE');}catch{setError('CANONICAL_INTERACTION_UNAVAILABLE');}}}>{t('yard.canonical.inspect')}</button>}
        {decorTab==='inventory' && <button data-yard-action="place" disabled={(itemMode?itemBlocked||placedItems.length>=CANONICAL_MAX_PLACEMENTS:blocked||!bindings.goodies?.[selected.id]?.place) || !chosen.supported} onClick={()=>startPlacement({goodieId:selected.id},true)}>{t('yard.place')}</button>}
        {decorTab==='shop' && <button data-yard-action="buy-goodie" disabled={busy || !canBuyGoodie(selected.id)} onClick={()=>act('yard.buyGoodie',{goodieId:selected.id})}>{t('yard.buy')}</button>}
      </div></footer>}
    </dialog>
  </div></VisualCatalogContext.Provider></UiImageAdmissionContext.Provider>;
}
