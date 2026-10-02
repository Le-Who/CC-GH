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

const labels = { yarn_mouse:'Мышка', sun_cushion:'Подушка', kibble:'Корм', berry_plate:'Ягоды', bonito_bowl:'Бонито', alchemy_living_arbor:'Живая беседка', alchemy_echo_chimes:'Колокольчики эха' };
const name = id => labels[id] || YARD_GOODIES[id]?.name || YARD_VISITORS[id]?.name || id;
const cost = value => [value?.treats ? `${value.treats} лакомств` : '', value?.shinyTreats ? `${value.shinyTreats} сияющих` : ''].filter(Boolean).join(' + ') || 'Бесплатно';
const uuid = () => globalThis.crypto.randomUUID();
const defaultAnchor = id => ({...MIKA_PLACEMENT_SUGGESTIONS[id]});

function Row({title,detail,children}) { return <div className="cy-row"><div><strong>{title}</strong><small>{detail}</small></div><div className="cy-row-actions">{children}</div></div>; }

export default function CourtyardGame() {
  const {language}=useAppI18n();
  const snapshot=useGameHub(s=>s.snapshot),message=useGameHub(s=>s.message),pending=useGameHub(s=>s.pendingActions);
  const canvas=useRef(null),scene=useRef(null),latest=useRef(snapshot),dialog=useRef(null),drag=useRef(null),ghostRef=useRef(null);
  const [view,setView]=useState(null),[panel,setPanel]=useState(null),[ghost,setGhost]=useState(null),[error,setError]=useState('');
  const [companionName,setCompanionName]=useState('');
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
  const feedback=yardFeedbackText(language,playerFeedbackText(language,error || message));
  const status=feedback || (busy?'Сохраняем действие…':ghost?(ghost.valid?'Место свободно':'Здесь предмет мешает проходу'):visibleStatus(current));
  return <div className="cy-app" data-yard-version="persistent-mika-r1">
    <header className="cy-header"><button aria-label="Вернуться к играм" onClick={()=>useGameHub.getState().setActiveTab('garden')}>‹</button><h1>Тихий двор</h1><span className="cy-preview">ПРОБА</span><span className="cy-wallet" aria-label="Лакомства">● {yard.currencies?.treats ?? '—'}</span></header>
    <HudRegion id="yardStage" className="cy-scene" applyLayout={false}>
      <HudEditableRegion id="yardBackgroundAsset" as="img" className="cy-background" src="/assets/yard-mika/background.webp" alt="" />
      <canvas ref={canvas} tabIndex={0} aria-label="Двор. Для перестановки используйте стрелки, Enter или касание свободного места" onPointerDown={pointerDown} onPointerMove={e=>{if(drag.current===e.pointerId)moveGhost(scene.current?.point(e));}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={cancel} onKeyDown={keyDown}/>
    </HudRegion>
    <HudRegion id="yardVisitStatus" className="cy-status" applyLayout={false} role="status">{status}</HudRegion>
    {ghost && <div className="cy-placement"><button onClick={cancel}>Отмена</button><button onClick={confirm} disabled={!ghost.valid || blocked}>Поставить</button></div>}
    <HudRegion id="yardBottomDock" as="nav" className="cy-actions" applyLayout={false} aria-label="Действия во дворе">
      {[['food','Еда',current.bowls.some(b=>b.servings>0)?'Миска полна':'Добавить корм'],['decor','Предметы',`${(yard.placedGoodies||[]).length} во дворе`],['guests','Гости',current.pendingGifts.length?`${current.pendingGifts.length} подарков`:'Друзья и воспоминания']].map(([id,title,detail])=><button key={id} onClick={()=>setPanel(id)}><strong>{title}</strong><span>{detail}</span></button>)}
    </HudRegion>
    <dialog ref={dialog} className="cy-dialog" aria-labelledby="cy-dialog-title" onCancel={closePanel} onClose={closePanel}>
      <header><h2 id="cy-dialog-title">{{food:'Еда',decor:'Предметы',guests:'Гости'}[panel]}</h2><button aria-label="Закрыть панель двора" onClick={closePanel}>×</button></header>
      <div className="cy-panel">
      {panel==='food' && <><p>Гости приходят со временем. Корм и визиты используют обычное время, даже когда двор закрыт.</p>
        {(yard.bowls||[]).map(b=><Row key={b.id} title={b.id==='bowl-1'?'Миска':'Вторая миска'} detail={b.foodId?`${name(b.foodId)} · порций ${b.servings}`:'Пока пуста'}><button disabled={blocked || !(yard.foodInventory?.kibble>0)} onClick={()=>act('yard.setFood',{bowlId:b.id,foodId:'kibble'})}>Наполнить</button></Row>)}
        {Object.values(YARD_FOODS).map(f=><Row key={f.id} title={name(f.id)} detail={`В запасе: ${yard.foodInventory?.[f.id] || 0} · ${cost(f.cost)}${f.id!=='kibble'?' · появится в следующем наборе':''}`}><button disabled={blocked || !bindings.foods?.[f.id]?.buy} onClick={()=>act('yard.buyFood',{foodId:f.id,qty:1})}>Взять</button></Row>)}
      </>}
      {panel==='decor' && <><p>Предметы и пути занятого гостя остаются свободными до конца его движения.</p>
        {(yard.placedGoodies||[]).map(raw=>{const p=current.props.find(p=>p.slotId===raw.slotId),supported=SUPPORTED_PROPS.includes(raw.goodieId),reserved=current.runtime?.visits?.some(v=>v.slotId===raw.slotId && v.reserved);return <Row key={raw.slotId} title={name(raw.goodieId)} detail={!supported?'Сохранён · новая сцена ещё не готова':reserved?'Занято гостем':p?.readiness?.status==='reposition-needed'?'Выберите место с безопасным подходом':raw.condition!=='new'?'Нужен ремонт':p?'Во дворе':'Нужно выбрать место'}>
          <button disabled={blocked || reserved || !supported} onClick={()=>startPlacement(p || raw)}>Двигать</button>
          <button disabled={blocked || reserved} onClick={()=>act('yard.pickupGoodie',{slotId:raw.slotId})}>Убрать</button>
          {raw.condition!=='new' && <button disabled={blocked || reserved || !supported} onClick={()=>act('yard.fixGoodie',{slotId:raw.slotId})}>Починить · {cost(YARD_GOODIES[raw.goodieId]?.fixCost)}</button>}
        </Row>;})}
        <h3>В запасе</h3>{Object.entries(yard.goodieInventory||{}).filter(([,n])=>n>0).map(([id,n])=><Row key={id} title={`${name(id)} × ${n}`} detail={SUPPORTED_PROPS.includes(id)?'Можно поставить':'Сохранён · новая сцена ещё не поддерживает'}><button disabled={blocked || !SUPPORTED_PROPS.includes(id) || !bindings.goodies?.[id]?.place} onClick={()=>startPlacement({goodieId:id},true)}>Поставить</button></Row>)}
        <h3>Магазин</h3>{SUPPORTED_PROPS.map(id=><Row key={id} title={name(id)} detail={cost(YARD_GOODIES[id].cost)}><button disabled={blocked || !bindings.goodies?.[id]?.buy} onClick={()=>act('yard.buyGoodie',{goodieId:id})}>Купить</button></Row>)}
        <h3>Оформление</h3>{Object.values(YARD_REMODELS).map(r=><Row key={r.id} title={r.name} detail={`${yard.remodel===r.id?'Выбрано':yard.ownedRemodels?.includes(r.id)?'У вас есть':cost(r.cost)}${r.id!=='meadow'?' · сцена готовится':''}`}><button disabled={blocked || !bindings.remodels?.[r.id]?.select || yard.remodel===r.id} onClick={()=>act('yard.setRemodel',{remodelId:r.id})}>Выбрать</button></Row>)}
        <Row title="Больше места" detail={yard.expansion?.level>=2?'Расширение сохранено':'Расширение появится вместе со следующим набором'}><button disabled>Расширить</button></Row>
      </>}
      {panel==='guests' && <><Row title="Подарки" detail={`${current.pendingGifts.length} ждут сбора`}><button disabled={blocked || !current.pendingGifts.length} onClick={()=>act('yard.collectGifts')}>Забрать</button></Row>
        <Row title="Ежедневное письмо" detail={`Марок: ${yard.dailyLetter?.stamps || 0}`}><button disabled={blocked || yard.dailyLetter?.lastClaimedDate===new Date(snapshot?.serverTime||Date.now()).toISOString().slice(0,10)} onClick={()=>act('yard.claimDailyLetter')}>Открыть</button></Row>
        {(current.runtime?.visits||[]).map(v=><Row key={v.visitId} title={name(v.visitorId)} detail={v.source==='legacy'?'Прежний визит сохранён; подарок появится после ухода':'В гостях'}><button disabled={blocked} onClick={()=>act('yard.capturePhoto',{visitId:v.visitId})}>В альбом</button></Row>)}
        <h3>Знакомые гости</h3>{Object.entries(yard.petbook||{}).map(([id,p])=><Row key={id} title={name(id)} detail={`Визитов: ${p.visits || 0}`}><button disabled={blocked} onClick={()=>act('yard.capturePhoto',{visitorId:id})}>Портрет</button></Row>)}
        <h3>Альбом</h3>{(yard.album?.photos||[]).map(p=><Row key={p.id} title={p.caption || name(p.visitorId)} detail={p.favorite?'Любимый снимок':'Воспоминание сохранено'}><button disabled={blocked || p.favorite} onClick={()=>act('yard.favoritePhoto',{photoId:p.id})}>Любимый</button></Row>)}
        <h3>Помощник</h3><label>Имя<input value={companionName} maxLength={16} onChange={e=>setCompanionName(e.target.value)} /></label><button className="cy-wide" disabled={blocked || !companionName.trim()} onClick={()=>act('yard.configureCompanion',{name:companionName})}>Сохранить имя</button>
        {yard.helper?.unlocked && <button className="cy-wide" disabled={blocked} onClick={()=>act('yard.configureCompanion',{helperAutoRefill:!yard.helper.autoRefill,preferredFoodId:'kibble'})}>Автокорм: {yard.helper.autoRefill?'включён':'выключен'}</button>}
        <p className="cy-note">Проба постоянного двора: Mika, мышка и подушка. Остальные гости и предметы сохранены. Их новые сцены появятся позже.</p>
      </>}
      {feedback && <p role="alert">{feedback}</p>}
      </div>
    </dialog>
  </div>;
}
