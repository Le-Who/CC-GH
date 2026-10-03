import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useGameHub } from '../../game-state/useGameHub.js';
import { HudEditableRegion, HudRegion } from '../../app/hud-layout/index.js';
import { playerFeedbackText, useAppI18n } from '../../app/i18n.jsx';
import { YARD_FOODS, YARD_GOODIES, YARD_REMODELS, YARD_VISITORS } from '../../../game-logic/yard-catalog.js';
import { createCourtyardScene } from './scene.mjs';
import { checkPlacement, courtyardPresentation, SUPPORTED_PROPS, visibleStatus } from './presentation.mjs';
import { MIKA_CLIPS as clips } from '../../../game-logic/yard-v2/media/mika-clips.mjs';
import { MIKA_PLACEMENT_SUGGESTIONS } from '../../../game-logic/yard-v2/mika-media.mjs';
import { yardFeedbackText } from './feedback.mjs';
import './courtyard.css';
import './i18n.js';

const uuid = () => globalThis.crypto.randomUUID();
const defaultAnchor = id => ({...MIKA_PLACEMENT_SUGGESTIONS[id]});

function Row({title,detail,children}) { return <div className="cy-row"><div><strong>{title}</strong><small>{detail}</small></div><div className="cy-row-actions">{children}</div></div>; }

export default function CourtyardGame() {
  const {language,t}=useAppI18n();
  const name=id=>{
    if(id==='alchemy_living_arbor')return t('yard.persistent.alchemyArbor');
    if(id==='alchemy_echo_chimes')return t('yard.persistent.alchemyChimes');
    for(const [type,catalog]of [['foods',YARD_FOODS],['goodies',YARD_GOODIES],['remodels',YARD_REMODELS]])
      if(Object.hasOwn(catalog,id))return t(`yard.catalog.${type}.${id}.name`);
    return (Object.hasOwn(YARD_VISITORS,id)?YARD_VISITORS[id].name:null) || t('yard.persistent.unknownItem');
  };
  const cost=value=>[value?.treats?t('yard.cost.treats',{count:value.treats}):'',value?.shinyTreats?t('yard.cost.shiny',{count:value.shinyTreats}):''].filter(Boolean).join(' + ')||t('yard.cost.free');
  const snapshot=useGameHub(s=>s.snapshot),message=useGameHub(s=>s.message),pending=useGameHub(s=>s.pendingActions);
  const canvas=useRef(null),scene=useRef(null),latest=useRef(snapshot),dialog=useRef(null),drag=useRef(null),ghostRef=useRef(null);
  const [view,setView]=useState(null),[panel,setPanel]=useState(null),[ghost,setGhost]=useState(null),[error,setError]=useState('');
  const [companionName,setCompanionName]=useState('');
  const [bowlFood,setBowlFood]=useState({});
  latest.current=snapshot;
  const yard=snapshot?.yard || {},busy=pending.some(p=>p.action.startsWith('yard.') && p.status!=='failed');
  const current=view || courtyardPresentation(snapshot,snapshot?.yardRuntime?.serverNow||0,clips);
  const closePanel=useCallback(()=>setPanel(null),[]);
  const cancel=useCallback(()=>{drag.current=null;ghostRef.current=null;setGhost(null);scene.current?.setGhost(null);},[]);
  useEffect(()=>{
    useGameHub.getState().setActiveGameShell({id:'room',openPanel:!!panel,closePanel});
    return ()=>{const s=useGameHub.getState();if(s.activeGameShell?.id==='room')s.setActiveGameShell(null);};
  },[panel,closePanel]);
  useEffect(()=>{
    const renderer=createCourtyardScene(canvas.current,{onView:setView,onError:()=>setError('YARD_SCENE_FAILED')});scene.current=renderer;renderer.update(latest.current);
    const blur=()=>cancel();window.addEventListener('blur',blur);
    const visibility=()=>{if(document.hidden)cancel();else useGameHub.getState().loadSnapshot();};document.addEventListener('visibilitychange',visibility);
    const interval=setInterval(()=>{if(!document.hidden)useGameHub.getState().loadSnapshot();},10000);
    return ()=>{clearInterval(interval);window.removeEventListener('blur',blur);document.removeEventListener('visibilitychange',visibility);renderer.dispose();scene.current=null;};
  },[cancel]);
  useEffect(()=>{scene.current?.update(snapshot);if(ghostRef.current){const g=ghostRef.current;const result=checkPlacement(snapshot,g,{placing:g.placing});const next={...g,valid:result.ok};ghostRef.current=next;setGhost(next);scene.current?.setGhost(next);}},[snapshot]);
  useEffect(()=>{if(panel && !dialog.current.open)dialog.current.showModal();else if(!panel && dialog.current.open)dialog.current.close();},[panel]);
  useEffect(()=>{if(panel==='guests')setCompanionName(yard.companion?.name || '');},[panel,yard.companion?.name]);
  const act=async(action,payload={})=>{
    if(busy || !current.mutable)return;
    const result=await useGameHub.getState().performReliableAction(action,payload,{clientActionId:`yard-v2:${uuid()}`,durability:'outbox'});
    if(result.error)setError(result.error);
    return result;
  };
  const startPlacement=(prop,placing=false)=>{
    if(prop.reserved || !current.mutable || busy)return;
    const coords=prop.transform || prop.anchor || defaultAnchor(prop.goodieId);
    const candidate={...coords,slotId:prop.slotId || `free_v2_${uuid()}`,goodieId:prop.goodieId,placing};
    const result=checkPlacement(latest.current,candidate,{placing});const next={...candidate,valid:result.ok};
    ghostRef.current=next;setGhost(next);scene.current?.setGhost(next);setPanel(null);canvas.current.focus();
  };
  const moveGhost=point=>{if(!point || !ghostRef.current)return;const next={...ghostRef.current,...point};next.valid=checkPlacement(latest.current,next,{placing:next.placing}).ok;ghostRef.current=next;setGhost(next);scene.current?.setGhost(next);};
  const confirm=async()=>{const g=ghostRef.current;if(!g?.valid)return;await act(g.placing?'yard.placeGoodie':'yard.moveGoodie',{slotId:g.slotId,goodieId:g.goodieId,x:g.x,y:g.y});cancel();};
  const pointerDown=e=>{if(ghostRef.current){drag.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);moveGhost(scene.current?.point(e));}else{const prop=scene.current?.hit(e);if(prop)startPlacement(prop);}};
  const keyDown=e=>{if(!ghostRef.current || e.repeat)return;if(e.key==='Escape'){e.preventDefault();cancel();}else if(e.key==='Enter'){e.preventDefault();confirm();}else{const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]}[e.key];if(d){e.preventDefault();moveGhost({x:ghostRef.current.x+d[0],y:ghostRef.current.y+d[1]});}}};
  const blocked=busy || !current.mutable;
  const bindings=current.runtime?.supportedBindings || {};
  const feedback=yardFeedbackText(playerFeedbackText(language,error || message),t);
  const status=feedback || (busy?t('yard.persistent.saving'):ghost?(ghost.valid?t('yard.persistent.spaceFree'):t('yard.persistent.pathBlocked')):visibleStatus(current,t));
  return <div className="cy-app" data-yard-version="persistent-mika-r1">
    <header className="cy-header"><button aria-label={t('yard.persistent.back')} onClick={()=>useGameHub.getState().setActiveTab('garden')}>‹</button><h1>{t('yard.title')}</h1><span className="cy-preview">{t('yard.persistent.preview')}</span><span className="cy-wallet" aria-label={t('yard.treats')}>● {yard.currencies?.treats ?? '—'}</span></header>
    <HudRegion id="yardStage" className="cy-scene" applyLayout={false}>
      <HudEditableRegion id="yardBackgroundAsset" as="img" className="cy-background" src="/assets/yard-mika/background.webp" alt="" />
      <canvas ref={canvas} tabIndex={0} aria-label={t('yard.persistent.canvas')} onPointerDown={pointerDown} onPointerMove={e=>{if(drag.current===e.pointerId)moveGhost(scene.current?.point(e));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={cancel} onKeyDown={keyDown}/>
    </HudRegion>
    <HudRegion id="yardVisitStatus" className="cy-status" applyLayout={false} role="status">{status}</HudRegion>
    {ghost && <div className="cy-placement"><button onClick={cancel}>{t('yard.persistent.cancel')}</button><button onClick={confirm} disabled={!ghost.valid || blocked}>{t('yard.place')}</button></div>}
    <HudRegion id="yardBottomDock" as="nav" className="cy-actions" applyLayout={false} aria-label={t('yard.persistent.actions')}>
      {[['food',t('yard.nav.food'),current.bowls.some(b=>b.servings>0)?t('yard.persistent.bowlFull'):t('yard.persistent.addFood')],['decor',t('yard.persistent.decor'),t('yard.persistent.placedCount',{count:(yard.placedGoodies||[]).length})],['guests',t('yard.persistent.guests'),current.pendingGifts.length?t('yard.persistent.giftCount',{count:current.pendingGifts.length}):t('yard.persistent.memories')]].map(([id,title,detail])=><button key={id} onClick={()=>setPanel(id)}><strong>{title}</strong><span>{detail}</span></button>)}
    </HudRegion>
    <dialog ref={dialog} className="cy-dialog" aria-labelledby="cy-dialog-title" onCancel={closePanel} onClose={closePanel}>
      <header><h2 id="cy-dialog-title">{{food:t('yard.nav.food'),decor:t('yard.persistent.decor'),guests:t('yard.persistent.guests')}[panel]}</h2><button aria-label={t('yard.persistent.closePanel')} onClick={closePanel}>×</button></header>
      <div className="cy-panel">
      {panel==='food' && <><p>{t('yard.persistent.foodNote')}</p>
        {(yard.bowls||[]).map(b=>{const foodId=bowlFood[b.id]||'kibble',ready=bindings.bowls?.[b.id]?.set===true;return <Row key={b.id} title={b.id==='bowl-1'?t('yard.persistent.bowl'):t('yard.persistent.secondBowl')} detail={!ready?t('yard.persistent.bowlSavedUnavailable'):b.foodId?t('yard.persistent.servings',{name:name(b.foodId),count:b.servings}):t('yard.persistent.bowlEmpty')}>
          <select className="cy-food-select" aria-label={t('yard.persistent.foodFor',{bowl:b.id==='bowl-1'?t('yard.persistent.bowl'):t('yard.persistent.secondBowl')})} value={foodId} disabled={blocked || !ready} onChange={e=>setBowlFood(v=>({...v,[b.id]:e.target.value}))}>
            {Object.values(YARD_FOODS).map(f=><option key={f.id} value={f.id} disabled={!bindings.foods?.[f.id]?.set}>{name(f.id)} · {yard.foodInventory?.[f.id]||0}</option>)}
          </select><button disabled={blocked || !ready || !bindings.foods?.[foodId]?.set || !(yard.foodInventory?.[foodId]>0)} onClick={()=>act('yard.setFood',{bowlId:b.id,foodId})}>{t('yard.persistent.fill')}</button>
        </Row>;})}
        {Object.values(YARD_FOODS).map(f=><Row key={f.id} title={name(f.id)} detail={t('yard.persistent.stockCost',{count:yard.foodInventory?.[f.id]||0,cost:cost(f.cost)})+(!bindings.foods?.[f.id]?.buy?t('yard.persistent.unavailableSuffix'):'')}><button disabled={blocked || !bindings.foods?.[f.id]?.buy} onClick={()=>act('yard.buyFood',{foodId:f.id,qty:1})}>{t('yard.persistent.take')}</button></Row>)}
      </>}
      {panel==='decor' && <><p>{t('yard.persistent.decorNote')}</p>
        {(yard.placedGoodies||[]).map(raw=>{const p=current.props.find(p=>p.slotId===raw.slotId),supported=SUPPORTED_PROPS.includes(raw.goodieId),reserved=current.runtime?.visits?.some(v=>v.slotId===raw.slotId && v.reserved);return <Row key={raw.slotId} title={name(raw.goodieId)} detail={!supported?t('yard.persistent.savedScenePending'):reserved?t('yard.persistent.occupied'):p?.readiness?.status==='reposition-needed'?t('yard.persistent.safeApproach'):raw.condition!=='new'?t('yard.persistent.repairNeeded'):p?t('yard.persistent.inYard'):t('yard.persistent.chooseSpot')}>
          <button disabled={blocked || reserved || !supported} onClick={()=>startPlacement(p || raw)}>{t('yard.move')}</button>
          <button disabled={blocked || reserved} onClick={()=>act('yard.pickupGoodie',{slotId:raw.slotId})}>{t('yard.store')}</button>
          {raw.condition!=='new' && <button disabled={blocked || reserved || !supported} onClick={()=>act('yard.fixGoodie',{slotId:raw.slotId})}>{t('yard.persistent.repairCost',{cost:cost(YARD_GOODIES[raw.goodieId]?.fixCost)})}</button>}
        </Row>;})}
        <h3>{t('yard.inventory')}</h3>{Object.entries(yard.goodieInventory||{}).filter(([,n])=>n>0).map(([id,n])=><Row key={id} title={`${name(id)} × ${n}`} detail={SUPPORTED_PROPS.includes(id)?t('yard.persistent.placeReady'):t('yard.persistent.savedUnsupported')}><button disabled={blocked || !SUPPORTED_PROPS.includes(id) || !bindings.goodies?.[id]?.place} onClick={()=>startPlacement({goodieId:id},true)}>{t('yard.place')}</button></Row>)}
        <h3>{t('yard.nav.shop')}</h3>{SUPPORTED_PROPS.map(id=><Row key={id} title={name(id)} detail={cost(YARD_GOODIES[id].cost)}><button disabled={blocked || !bindings.goodies?.[id]?.buy} onClick={()=>act('yard.buyGoodie',{goodieId:id})}>{t('yard.buy')}</button></Row>)}
        <h3>{t('yard.persistent.remodels')}</h3>{Object.values(YARD_REMODELS).map(r=><Row key={r.id} title={name(r.id)} detail={`${yard.remodel===r.id?t('yard.persistent.selected'):yard.ownedRemodels?.includes(r.id)?t('yard.persistent.owned'):cost(r.cost)}${r.id!=='meadow'?t('yard.persistent.scenePendingSuffix'):''}`}><button disabled={blocked || !bindings.remodels?.[r.id]?.select || yard.remodel===r.id} onClick={()=>act('yard.setRemodel',{remodelId:r.id})}>{t('yard.persistent.select')}</button></Row>)}
        <Row title={t('yard.persistent.moreSpace')} detail={yard.expansion?.level>=2?t('yard.persistent.expansionSaved'):t('yard.persistent.expansionLater')}><button disabled>{t('yard.persistent.expand')}</button></Row>
      </>}
      {panel==='guests' && <><Row title={t('yard.gifts')} detail={t('yard.persistent.giftsWaiting',{count:current.pendingGifts.length})}><button disabled={blocked || !current.pendingGifts.length} onClick={()=>act('yard.collectGifts')}>{t('yard.collect')}</button></Row>
        <Row title={t('yard.dailyLetter')} detail={t('yard.persistent.stamps',{count:yard.dailyLetter?.stamps||0})}><button disabled={blocked || yard.dailyLetter?.lastClaimedDate===new Date(snapshot?.serverTime||Date.now()).toISOString().slice(0,10)} onClick={()=>act('yard.claimDailyLetter')}>{t('yard.persistent.open')}</button></Row>
        {(current.runtime?.visits||[]).map(v=><Row key={v.visitId} title={name(v.visitorId)} detail={v.source==='legacy'?t('yard.persistent.legacyVisit'):t('yard.persistent.visiting')}><button disabled={blocked} onClick={()=>act('yard.capturePhoto',{visitId:v.visitId})}>{t('yard.persistent.addAlbum')}</button></Row>)}
        <h3>{t('yard.persistent.knownGuests')}</h3>{Object.entries(yard.petbook||{}).map(([id,p])=><Row key={id} title={name(id)} detail={t('yard.persistent.visits',{count:p.visits||0})}><button disabled={blocked} onClick={()=>act('yard.capturePhoto',{visitorId:id})}>{t('yard.persistent.portrait')}</button></Row>)}
        <h3>{t('yard.screen.album')}</h3>{(yard.album?.photos||[]).map(p=><Row key={p.id} title={p.caption || name(p.visitorId)} detail={p.favorite?t('yard.persistent.favoritePhoto'):t('yard.persistent.memorySaved')}><button disabled={blocked || p.favorite} onClick={()=>act('yard.favoritePhoto',{photoId:p.id})}>{t('yard.favorite')}</button></Row>)}
        <h3>{t('yard.persistent.helper')}</h3><label>{t('yard.persistent.name')}<input value={companionName} maxLength={16} onChange={e=>setCompanionName(e.target.value)} /></label><button className="cy-wide" disabled={blocked || !companionName.trim()} onClick={()=>act('yard.configureCompanion',{name:companionName})}>{t('yard.persistent.saveName')}</button>
        {yard.helper?.unlocked && <label>{t('yard.persistent.helperFood')}<select className="cy-food-select" aria-label={t('yard.persistent.helperFood')} value={yard.helper.preferredFoodId||''} disabled={blocked} onChange={e=>act('yard.configureCompanion',{preferredFoodId:e.target.value})}>
          {!bindings.foods?.[yard.helper.preferredFoodId]?.set && <option value={yard.helper.preferredFoodId||''} disabled>{t('yard.persistent.savedPreference')}</option>}
          {Object.values(YARD_FOODS).filter(f=>bindings.foods?.[f.id]?.set).map(f=><option key={f.id} value={f.id}>{name(f.id)}</option>)}
        </select></label>}
        {yard.helper?.unlocked && <button className="cy-wide" disabled={blocked} onClick={()=>act('yard.configureCompanion',{helperAutoRefill:!yard.helper.autoRefill})}>{t('yard.persistent.autoFood',{state:yard.helper.autoRefill?t('yard.on'):t('yard.off')})}</button>}
        <p className="cy-note">{t('yard.persistent.previewNote')}</p>
      </>}
      {feedback && <p role="alert">{feedback}</p>}
      </div>
    </dialog>
  </div>;
}
