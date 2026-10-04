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
import {catalogPreview, photoPreview, canAffordCatalogCost, placementMessageKey, YARD_UI_ART} from './catalog-ui.mjs';
import {formatYardCurrencyBalance} from '../companion-yard/currencyDisplay.js';
import {openHome} from '../../app/homeNavigation.js';
import {useEscapeDismiss} from '../../app/useDismissableLayer.js';
import './courtyard.css';
import './i18n.js';

const uuid = () => globalThis.crypto.randomUUID();
const defaultAnchor = id => ({...(MIKA_PLACEMENT_SUGGESTIONS[id] || {x:50,y:50})});

function Icon({name}) { return <span className={`cy-icon cy-icon-${name}`} aria-hidden="true" />; }
function Preview({src,photo}) {
  const art=photo && photoPreview(photo);
  return <span className={`cy-preview-art${photo?' cy-photo-art':''}`} aria-hidden="true">
    {art?.background && <img className="cy-photo-background" src={art.background} alt="" loading="lazy" />}
    {art?.goodie && <img className="cy-photo-goodie" src={art.goodie} alt="" loading="lazy" />}
    {(art?.visitor || src) && <img className="cy-preview-object" src={art?.visitor || src} alt="" loading="lazy" />}
  </span>;
}
function Row({title,detail,src,children}) { return <div className="cy-row">{src && <Preview src={src}/>}<div className="cy-row-copy"><strong>{title}</strong><small>{detail}</small></div><div className="cy-row-actions">{children}</div></div>; }
function Card({title,detail,src,photo,children}) { return <article className="cy-card"><Preview src={src} photo={photo}/><strong>{title}</strong><small>{detail}</small>{children && <div className="cy-card-actions">{children}</div>}</article>; }
function Empty({src,children}) { return <div className="cy-empty"><Preview src={src}/><p>{children}</p></div>; }

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
  const [decorTab,setDecorTab]=useState('placed'),[selectedDecor,setSelectedDecor]=useState(null),[guestTab,setGuestTab]=useState('visits');
  latest.current=snapshot;
  const yard=snapshot?.yard || {},busy=pending.some(p=>p.action.startsWith('yard.') && p.status!=='failed');
  const current=view || courtyardPresentation(snapshot,snapshot?.yardRuntime?.serverNow||0,clips);
  const closePanel=useCallback(()=>setPanel(null),[]);
  useEscapeDismiss(!!panel,closePanel);
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
  useEffect(()=>{scene.current?.update(snapshot);if(ghostRef.current){const g=ghostRef.current;const result=checkPlacement(snapshot,g,{placing:g.placing});const next={...g,valid:result.ok,placementError:result.errors?.[0]?.code};ghostRef.current=next;setGhost(next);scene.current?.setGhost(next);}},[snapshot]);
  useEffect(()=>{if(panel && !dialog.current.open)dialog.current.showModal();else if(!panel && dialog.current.open){dialog.current.close();if(ghostRef.current)canvas.current.focus();}},[panel]);
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
    const result=checkPlacement(latest.current,candidate,{placing});const next={...candidate,valid:result.ok,placementError:result.errors?.[0]?.code};
    ghostRef.current=next;setGhost(next);scene.current?.setGhost(next);setPanel(null);canvas.current.focus();
  };
  const moveGhost=point=>{if(!point || !ghostRef.current)return;const next={...ghostRef.current,...point};const result=checkPlacement(latest.current,next,{placing:next.placing});next.valid=result.ok;next.placementError=result.errors?.[0]?.code;ghostRef.current=next;setGhost(next);scene.current?.setGhost(next);};
  const confirm=async()=>{const g=ghostRef.current;if(!g?.valid)return;await act(g.placing?'yard.placeGoodie':'yard.moveGoodie',{slotId:g.slotId,goodieId:g.goodieId,x:g.x,y:g.y});cancel();};
  const pointerDown=e=>{if(ghostRef.current){drag.current=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);moveGhost(scene.current?.point(e));}else{const prop=scene.current?.hit(e);if(prop)startPlacement(prop);}};
  const keyDown=e=>{if(!ghostRef.current || e.repeat)return;if(e.key==='Escape'){e.preventDefault();cancel();}else if(e.key==='Enter'){e.preventDefault();confirm();}else{const d={ArrowLeft:[-8,0],ArrowRight:[8,0],ArrowUp:[0,-8],ArrowDown:[0,8]}[e.key];if(d){e.preventDefault();moveGhost(scene.current?.offsetPoint(ghostRef.current,{x:d[0],y:d[1]}));}}};
  const blocked=busy || !current.mutable;
  const bindings=current.runtime?.supportedBindings || {};
  const feedback=yardFeedbackText(playerFeedbackText(language,error || message),t);
  const status=!snapshot?.yard?t('yard.persistent.loading'):feedback || (busy?t('yard.persistent.saving'):ghost?(ghost.valid?t('yard.persistent.spaceFree'):t(placementMessageKey(ghost.placementError))):visibleStatus(current,t));
  const decorRows=decorTab==='placed'?(yard.placedGoodies||[]).map(raw=>({key:raw.slotId,id:raw.goodieId,raw})):decorTab==='inventory'?Object.entries(yard.goodieInventory||{}).filter(([,n])=>n>0).map(([id,count])=>({key:id,id,count})):SUPPORTED_PROPS.map(id=>({key:id,id}));
  const selected=decorRows.find(item=>item.key===selectedDecor)||decorRows[0];
  const itemState=item=>{
    const supported=SUPPORTED_PROPS.includes(item.id),raw=item.raw;
    const prop=raw && current.props.find(p=>p.slotId===raw.slotId);
    const reserved=raw && current.runtime?.visits?.some(v=>v.slotId===raw.slotId && v.reserved);
    const detail=decorTab==='shop'?cost(YARD_GOODIES[item.id].cost):decorTab==='inventory'?t('yard.persistent.stock',{count:item.count})+(supported?'':` · ${t('yard.persistent.savedUnsupported')}`):!supported?t('yard.persistent.savedScenePending'):reserved?t('yard.persistent.occupied'):prop?.readiness?.status==='reposition-needed'?t('yard.persistent.safeApproach'):raw.condition!=='new'?t('yard.persistent.repairNeeded'):prop?t('yard.persistent.inYard'):t('yard.persistent.chooseSpot');
    return {supported,prop,reserved,detail};
  };
  const chosen=selected && itemState(selected);
  const affordable=value=>canAffordCatalogCost(value,yard.currencies);
  const purchaseNote=(value,available)=>!available?t('yard.persistent.unavailableSuffix'):!affordable(value)?` · ${t('yard.persistent.insufficientFunds')}`:'';
  const wallet=(key,label,icon)=>{
    const value=yard.currencies?.[key],formatted=value==null?null:formatYardCurrencyBalance(value,language);
    return <span className="cy-wallet" aria-label={`${label}: ${formatted?.exact??t('yard.persistent.loading')}`} title={formatted?.exact}><Icon name={icon}/><span><small>{label}</small><strong>{formatted?.compact??'—'}</strong></span></span>;
  };
  return <div className="cy-app" data-yard-version="persistent-mika-r1">
    <header className="cy-header"><button className="cy-home" aria-label={t('yard.persistent.back')} onClick={openHome}><Icon name="back"/></button><h1>{t('yard.title')}</h1><HudRegion id="yardCurrencyStack" className="cy-wallets" applyLayout={false}>{wallet('treats',t('yard.treats'),'treats')}{wallet('shinyTreats',t('yard.shiny'),'shiny')}</HudRegion></header>
    <HudRegion id="yardStage" className="cy-scene" applyLayout={false}>
      <HudEditableRegion id="yardBackgroundAsset" as="img" className="cy-background" src="/assets/yard-mika/background.webp" alt="" />
      <canvas ref={canvas} tabIndex={0} aria-label={t('yard.persistent.canvas')} onPointerDown={pointerDown} onPointerMove={e=>{if(drag.current===e.pointerId)moveGhost(scene.current?.point(e));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={cancel} onKeyDown={keyDown}/>
    </HudRegion>
    <HudRegion id="yardVisitStatus" className="cy-status" applyLayout={false} role="status">{status}</HudRegion>
    {ghost && <div className="cy-placement"><strong>{name(ghost.goodieId)}</strong><div><button onClick={cancel}>{t('yard.persistent.cancel')}</button><button onClick={confirm} disabled={!ghost.valid || blocked}>{t('yard.place')}</button></div></div>}
    <HudRegion id="yardBottomDock" as="nav" className="cy-actions" applyLayout={false} aria-label={t('yard.persistent.actions')}>
      {[['food',t('yard.nav.food'),current.bowls.some(b=>b.servings>0)?t('yard.persistent.bowlFull'):t('yard.persistent.addFood')],['decor',t('yard.persistent.decor'),t('yard.persistent.placedCount',{count:(yard.placedGoodies||[]).length})],['guests',t('yard.persistent.guests'),current.pendingGifts.length?t('yard.persistent.giftCount',{count:current.pendingGifts.length}):t('yard.persistent.memories')]].map(([id,title,detail])=><button key={id} onClick={()=>setPanel(id)} aria-label={`${title}. ${detail}`}><img src={YARD_UI_ART[id]} alt=""/><strong>{title}</strong></button>)}
    </HudRegion>
    <dialog ref={dialog} className="cy-dialog" aria-labelledby="cy-dialog-title" onCancel={closePanel} onClose={closePanel}>
      <header><img src={YARD_UI_ART[panel] || undefined} alt=""/><h2 id="cy-dialog-title">{{food:t('yard.nav.food'),decor:t('yard.persistent.decor'),guests:t('yard.persistent.guests')}[panel]}</h2><button aria-label={t('yard.persistent.closePanel')} onClick={closePanel}><Icon name="close"/></button></header>
      {panel==='decor' && <div className="cy-tabs" aria-label={t('yard.persistent.itemCategories')}>{[['placed',t('yard.persistent.inYard')],['inventory',t('yard.persistent.stocks')],['shop',t('yard.nav.shop')]].map(([id,label])=><button key={id} aria-pressed={decorTab===id} onClick={()=>{setDecorTab(id);setSelectedDecor(null);}}>{label}</button>)}</div>}
      {panel==='guests' && <div className="cy-tabs cy-guest-tabs" aria-label={t('yard.persistent.guestCategories')}>{[['visits',t('yard.persistent.guests')],['album',t('yard.screen.album')],['helper',t('yard.persistent.helper')]].map(([id,label])=><button key={id} aria-pressed={guestTab===id} onClick={()=>setGuestTab(id)}>{label}</button>)}</div>}
      <div className="cy-panel">
      {!snapshot?.yard && <p role="status">{t('yard.persistent.loading')}</p>}
      {panel==='food' && <><p className="cy-intro">{t('yard.persistent.foodNote')}</p>
        <h3>{t('yard.persistent.bowls')}</h3>
        {(yard.bowls||[]).map(b=>{const foodId=bowlFood[b.id]||'kibble',ready=bindings.bowls?.[b.id]?.set===true;return <Row key={b.id} src={catalogPreview('food',b.foodId && b.servings>0?b.foodId:'empty_bowl')} title={b.id==='bowl-1'?t('yard.persistent.bowl'):t('yard.persistent.secondBowl')} detail={!ready?t('yard.persistent.bowlSavedUnavailable'):b.foodId?t('yard.persistent.servings',{name:name(b.foodId),count:b.servings}):t('yard.persistent.bowlEmpty')}>
          <select className="cy-food-select" aria-label={t('yard.persistent.foodFor',{bowl:b.id==='bowl-1'?t('yard.persistent.bowl'):t('yard.persistent.secondBowl')})} value={foodId} disabled={blocked || !ready} onChange={e=>setBowlFood(v=>({...v,[b.id]:e.target.value}))}>
            {Object.values(YARD_FOODS).map(f=><option key={f.id} value={f.id} disabled={!bindings.foods?.[f.id]?.set}>{name(f.id)} · {yard.foodInventory?.[f.id]||0}</option>)}
          </select><button disabled={blocked || !ready || !bindings.foods?.[foodId]?.set || !(yard.foodInventory?.[foodId]>0)} onClick={()=>act('yard.setFood',{bowlId:b.id,foodId})}>{t('yard.persistent.fill')}</button>
        </Row>;})}
        <h3>{t('yard.shop.food')}</h3><div className="cy-catalog-grid">{Object.values(YARD_FOODS).map(f=><Card key={f.id} src={catalogPreview('food',f.id)} title={name(f.id)} detail={t('yard.persistent.stockCost',{count:snapshot?.yard?(yard.foodInventory?.[f.id]||0):'—',cost:cost(f.cost)})+purchaseNote(f.cost,bindings.foods?.[f.id]?.buy)}><button disabled={blocked || !bindings.foods?.[f.id]?.buy || !affordable(f.cost)} onClick={()=>act('yard.buyFood',{foodId:f.id,qty:1})}>{t('yard.persistent.take')}</button></Card>)}</div>
      </>}
      {panel==='decor' && <><p className="cy-intro">{t(decorTab==='placed'?'yard.persistent.decorNote':decorTab==='inventory'?'yard.persistent.inventoryNote':'yard.persistent.shopNote')}</p>
        {snapshot?.yard && !decorRows.length && <Empty src={YARD_UI_ART.decor}>{t(decorTab==='placed'?'yard.persistent.emptyPlaced':'yard.persistent.emptyInventory')}</Empty>}
        <div className="cy-catalog-grid">{decorRows.map(item=>{const state=itemState(item);return <button className="cy-catalog-choice" key={item.key} aria-pressed={selected?.key===item.key} onClick={()=>setSelectedDecor(item.key)}><Preview src={catalogPreview('goodie',item.id,{condition:item.raw?.condition})}/><strong>{name(item.id)}</strong><small>{state.detail}</small>{selected?.key===item.key && <span className="cy-selected-mark" aria-hidden="true">✓</span>}</button>;})}</div>
        {decorTab==='shop' && <><h3>{t('yard.persistent.remodels')}</h3><div className="cy-catalog-grid">{Object.values(YARD_REMODELS).map(r=><Card key={r.id} src={catalogPreview('remodel',r.id)} title={name(r.id)} detail={`${yard.remodel===r.id?t('yard.persistent.selected'):yard.ownedRemodels?.includes(r.id)?t('yard.persistent.owned'):cost(r.cost)}${r.id!=='meadow'?t('yard.persistent.scenePendingSuffix'):''}`}><button disabled={blocked || !bindings.remodels?.[r.id]?.select || yard.remodel===r.id} onClick={()=>act('yard.setRemodel',{remodelId:r.id})}>{t('yard.persistent.select')}</button></Card>)}</div>
        <Row title={t('yard.persistent.moreSpace')} detail={yard.expansion?.level>=2?t('yard.persistent.expansionSaved'):t('yard.persistent.expansionLater')}><button disabled>{t('yard.persistent.expand')}</button></Row></>}
      </>}
      {panel==='guests' && guestTab==='visits' && <><Row src={YARD_UI_ART.gift} title={t('yard.gifts')} detail={t('yard.persistent.giftsWaiting',{count:current.pendingGifts.length})}><button disabled={blocked || !current.pendingGifts.length} onClick={()=>act('yard.collectGifts')}>{t('yard.collect')}</button></Row>
        <Row src={YARD_UI_ART.letter} title={t('yard.dailyLetter')} detail={t('yard.persistent.stamps',{count:yard.dailyLetter?.stamps||0})}><button disabled={blocked || yard.dailyLetter?.lastClaimedDate===new Date(snapshot?.serverTime||Date.now()).toISOString().slice(0,10)} onClick={()=>act('yard.claimDailyLetter')}>{t('yard.persistent.open')}</button></Row>
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
        {decorTab==='placed' && <><button disabled={blocked || chosen.reserved || !chosen.supported} onClick={()=>startPlacement(chosen.prop || selected.raw)}>{t('yard.move')}</button><button disabled={blocked || chosen.reserved} onClick={()=>act('yard.pickupGoodie',{slotId:selected.raw.slotId})}>{t('yard.store')}</button>{selected.raw.condition!=='new' && <button disabled={blocked || chosen.reserved || !chosen.supported || !affordable(YARD_GOODIES[selected.id]?.fixCost)} onClick={()=>act('yard.fixGoodie',{slotId:selected.raw.slotId})}>{t('yard.persistent.repairCost',{cost:cost(YARD_GOODIES[selected.id]?.fixCost)})}</button>}</>}
        {decorTab==='inventory' && <button disabled={blocked || !chosen.supported || !bindings.goodies?.[selected.id]?.place} onClick={()=>startPlacement({goodieId:selected.id},true)}>{t('yard.place')}</button>}
        {decorTab==='shop' && <button disabled={blocked || !bindings.goodies?.[selected.id]?.buy || !affordable(YARD_GOODIES[selected.id]?.cost)} onClick={()=>act('yard.buyGoodie',{goodieId:selected.id})}>{t('yard.buy')}</button>}
      </div></footer>}
    </dialog>
  </div>;
}
