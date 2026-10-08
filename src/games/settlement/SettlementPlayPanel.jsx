import { SettlementFrameArt } from './SettlementFrameArt.jsx';
import { SETTLEMENT_CARD_MATERIAL } from './settlementIllustratedMaterials.js';
import { useEffect, useRef, useState } from 'react';
import { useAppI18n } from '../../app/i18n.jsx';
import { HudEditableRegion } from '../../app/hud-layout/HudRegion.jsx';
import { useHudLayout } from '../../app/hud-layout/HudLayoutContext.jsx';
import { ICONS, UI_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { useSettlementStore, canPay, productionFrom } from './useSettlementStore.js';
import { PRODUCTION_MS, MAX_READY_BATCHES, DEVELOPMENTS, residentOrder, batchYield, addCycleIncome } from './settlementCycle.js';

const COPY = {
  ru: { production: 'Выпуск', orders: 'Заказы', growth: 'Развитие', collect: 'Собрать', deliver: 'Доставить', develop: 'Развить', ready: 'Готово', next: 'Следующая партия', full: 'Склад полон · выполните заказ', done: 'Деревня процветает', continue: 'Доставляйте заказы и копите престиж', missing: 'Нужны ресурсы', wait: 'Ждите партию', delivered: 'Заказ доставлен', collected: 'Партия на складе', grown: 'Поселение выросло · выпуск +20%', failed: 'Проверьте ресурсы и попробуйте снова', busy: 'Дождитесь улучшения здания', details: 'Здание', reward: 'Награда', stock: 'Склад', deliveries: 'Доставки' },
  en: { production: 'Produce', orders: 'Orders', growth: 'Develop', collect: 'Collect', deliver: 'Deliver', develop: 'Develop', ready: 'Ready', next: 'Next batch', full: 'Storage full · deliver an order', done: 'A thriving village', continue: 'Keep delivering orders to earn prestige', missing: 'Need resources', wait: 'Wait for a batch', delivered: 'Order delivered', collected: 'Batch stored', grown: 'Village expanded · output +20%', failed: 'Check resources and try again', busy: 'Wait for the building upgrade', details: 'Building', reward: 'Reward', stock: 'Stock', deliveries: 'Deliveries' },
};
const LABELS = {
  ru: { food: 'Еда', wood: 'Дерево', stone: 'Камень', goods: 'Товары', culture: 'Культура', gold: 'Золото', prestige: 'Престиж' },
  en: { food: 'Food', wood: 'Wood', stone: 'Stone', goods: 'Goods', culture: 'Culture', gold: 'Gold', prestige: 'Prestige' },
};
function ResourceChips({ values, resources, language, stock = false }) {
  return <div className="settlement-cycle-chips">{Object.entries(values).map(([key, value]) => <span key={key} className={resources && resources[key] < value ? 'short' : ''} title={LABELS[language][key]} aria-label={`${LABELS[language][key]} ${stock ? Math.floor(resources[key] ?? 0) + '/' : ''}${value}`}>
    <img src={ICONS[key]} alt={LABELS[language][key]} draggable={false} />
    {stock ? `${Math.floor(resources[key] ?? 0)}/` : ''}{value}
  </span>)}</div>;
}

export default function SettlementPlayPanel() {
  const hudLayout = useHudLayout();
  const besideMap = hudLayout.resolvedLayout?.regions?.settlementCompactDetail?.alignment === 'right';
  const { language: appLanguage } = useAppI18n();
  const language = appLanguage === 'ru' ? 'ru' : 'en';
  const c = COPY[language];
  const state = useSettlementStore();
  const [tab, setTab] = useState('production');
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const cycle = state.settlementCycle;
  const previousCollected = useRef(cycle.collected);
  useEffect(() => {
    if (cycle.collected > previousCollected.current) setFeedback(c.collected);
    previousCollected.current = cycle.collected;
  }, [cycle.collected, c.collected]);
  const order = residentOrder(cycle);
  const milestone = DEVELOPMENTS[cycle.development];
  const illustratedBuildingId = tab === 'orders' ? 'market-green' : tab === 'growth' ? (milestone?.buildingId ?? 'hearth-hall') : 'common-garden';
  const illustratedBuilding = trimmedAsset(buildingAsset(illustratedBuildingId, state.levels[illustratedBuildingId] ?? 1));
  const yieldValues = batchYield(productionFrom(state.levels, state.constructedBuildings), cycle.development);
  const withBatch = addCycleIncome(state.resources, yieldValues, state.inventoryCaps);
  const full = Object.keys(yieldValues).every(key => withBatch[key] === state.resources[key]);
  const seconds = Math.max(1, Math.ceil((PRODUCTION_MS - (Date.now() - cycle.productionAt)) / 1000));
  const act = async (action, message) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    try { setFeedback(await action() ? message : c.failed); }
    finally { pendingRef.current = false; setPending(false); }
  };
  if (state.rightPanelOpen) return null;

  return <HudEditableRegion id="settlementCompactDetail" as="section" applyLayout={false} className="settlement-compact-detail settlement-play-panel settlement-illustrated-life settlement-illustrated-frame" style={{ backgroundImage: `url(${UI_ASSETS.smallPanel})`, ...(besideMap ? { left: 'auto', right: 10, transform: 'none' } : {}) }} aria-label={language === 'ru' ? 'Жизнь поселения' : 'Village life'} data-cycle-development={cycle.development}>
    <SettlementFrameArt material={SETTLEMENT_CARD_MATERIAL} />
    <nav className="settlement-cycle-tabs" aria-label={language === 'ru' ? 'Дела поселения' : 'Village tasks'}>
      {['production', 'orders', 'growth'].map(id => <button key={id} type="button" aria-pressed={tab === id} onClick={() => { setTab(id); setFeedback(''); }} data-testid={`settlement-tab-${id}`}>{c[id]}</button>)}
      <button className="settlement-compact-detail-open" type="button" aria-label={c.details} onClick={() => state.selectBuilding(state.selectedBuildingId)}>{c.details}</button>
    </nav>
    <div className="settlement-cycle-body" data-save-ready={state.persistenceReady}>
      <img className="settlement-cycle-illustration" src={illustratedBuilding} alt="" draggable={false} />
      {tab === 'production' ? <>
        <div className="settlement-cycle-copy"><strong>{c.ready}: {cycle.ready}/{MAX_READY_BATCHES}</strong><span>{full ? c.full : cycle.ready === MAX_READY_BATCHES ? `${c.stock} · ${c.collect}` : `${c.next}: ${seconds}s`}</span><ResourceChips values={yieldValues} language={language} /></div>
        <button type="button" className="settlement-cycle-action" disabled={!state.persistenceReady || pending || !cycle.ready || full} onClick={() => act(state.collect, c.collected)} data-testid="settlement-collect">{c.collect}</button>
      </> : tab === 'orders' ? <>
        <div className="settlement-cycle-copy"><strong>{order[language]}</strong><ResourceChips values={order.cost} resources={state.resources} language={language} stock /><span>{c.reward}: {order.reward.gold} {LABELS[language].gold} · +{order.reward.prestige} {LABELS[language].prestige}</span></div>
        <button type="button" className="settlement-cycle-action" disabled={!state.persistenceReady || pending || !canPay(state.resources, order.cost)} onClick={() => act(() => state.fulfillResidentOrder(order.id), c.delivered)} data-testid="settlement-deliver">{c.deliver}</button>
      </> : milestone ? <>
        <div className="settlement-cycle-copy"><strong>{milestone[language]} · {Math.min(cycle.deliveries, milestone.deliveries)}/{milestone.deliveries}</strong><ResourceChips values={milestone.cost} resources={state.resources} language={language} stock /><span>{state.activeUpgrade ? c.busy : cycle.deliveries < milestone.deliveries ? c.deliveries : !canPay(state.resources, milestone.cost) ? c.missing : `${c.production} +20%`}</span></div>
        <button type="button" className="settlement-cycle-action" disabled={!state.persistenceReady || pending || cycle.deliveries < milestone.deliveries || !canPay(state.resources, milestone.cost) || Boolean(state.activeUpgrade)} onClick={() => act(() => state.developSettlement(cycle.development), c.grown)} data-testid="settlement-develop">{c.develop}</button>
      </> : <div className="settlement-cycle-copy"><strong>{c.done}</strong><span>{c.continue}</span><span>{c.deliveries}: {cycle.deliveries} · {c.production} +60%</span></div>}
    </div>
    <div className="settlement-cycle-feedback" role="status" aria-live="polite">{state.persistenceError ? language === 'ru' ? 'Не удалось сохранить. Повторите действие.' : 'Could not save. Try again.' : feedback || (tab === 'orders' && !canPay(state.resources, order.cost) ? c.missing : '')}</div>
  </HudEditableRegion>;
}

