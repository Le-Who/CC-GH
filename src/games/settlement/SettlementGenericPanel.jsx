import { useSettlementStore } from './useSettlementStore.js';
import { useSettlementText } from './useSettlementText.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { AssetIcon, HudFrame, ProgressBar, RewardBadge, formatNumber, frameStyle } from './settlementViewShared.jsx';

function GenericPanel({ activePanel, stage, resources, population }) {
  const t = useSettlementText();
  const notices = useSettlementStore((state) => state.notices);
  if (activePanel === 'inbox') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.mail} alt="" size={16} /><span>{t("Вести деревни")}</span></div>
        <div className="message-list">
          {notices.length ? notices.map((notice) => (
            <HudFrame key={notice.id} className="message-card" frame={UI_ASSETS.panel}>
              <AssetIcon src={ICONS.mail} alt="" size={24} />
              <div className="card-copy"><span>{t(notice.text)}</span></div>
            </HudFrame>
          )) : <p role="status">{t("Сейчас новых вестей нет.")}</p>}
        </div>
      </div>
    );
  }

  if (activePanel === 'inventory') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.inventory} alt="" size={16} /><span>{t("Инвентарь поселения")}</span></div>
        <div className="inventory-grid">
          <RewardBadge type="food" amount={formatNumber(resources.food)} label={t("еда")} />
          <RewardBadge type="wood" amount={formatNumber(resources.wood)} label={t("дерево")} />
          <RewardBadge type="stone" amount={formatNumber(resources.stone)} label={t("камень")} />
          <RewardBadge type="goods" amount={formatNumber(resources.goods)} label={t("товары")} />
          <RewardBadge type="culture" amount={formatNumber(resources.culture)} label={t("культура")} />
          <RewardBadge type="gems" amount={formatNumber(resources.gems)} label={t("кристаллы")} />
        </div>
      </div>
    );
  }

  if (activePanel === 'store') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.store} alt="" size={16} /><span>{t("Магазин и предложения")}</span></div>
        <HudFrame className="message-card settlement-store-unavailable" frame={UI_ASSETS.panel}>
          <AssetIcon src={ICONS.store} alt="" size={32} />
          <div className="card-copy">
            <strong>{t("Магазин пока недоступен")}</strong>
            <span>{t("Покупки и ежедневные подарки ещё не подключены. Ресурсы можно получать во вкладке «Выпуск» и за заказы жителей.")}</span>
          </div>
        </HudFrame>
      </div>
    );
  }

  if (activePanel === 'research') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.research} alt="" size={16} /><span>{t("Совет и исследования")}</span></div>
        <div className="research-stack">
          <HudFrame className="research-row" frame={UI_ASSETS.panel}>
            <AssetIcon src={ICONS.shield} alt="" size={24} />
            <div className="card-copy"><strong>{t("Безопасность")}</strong><ProgressBar value={population} max={32} fill="green" label={t(`${population}/32`)} /></div>
          </HudFrame>
          <HudFrame className="research-row" frame={UI_ASSETS.panel}>
            <AssetIcon src={ICONS.achievement} alt="" size={24} />
            <div className="card-copy"><strong>{t("Престиж")}</strong><ProgressBar value={stage.computedPrestige} max={1700} fill="gold" label={t(formatNumber(stage.computedPrestige))} /></div>
          </HudFrame>
          <HudFrame className="research-row" frame={UI_ASSETS.panel}>
            <AssetIcon src={ICONS.morale} alt="" size={24} />
            <div className="card-copy"><strong>{t("Мораль")}</strong><ProgressBar value={resources.morale} max={100} fill="green" label={t(`${Math.round(resources.morale)}%`)} /></div>
          </HudFrame>
        </div>
      </div>
    );
  }

  if (activePanel === 'rank') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.rank} alt="" size={16} /><span>{t("Ранг поселения")}</span></div>
        <HudFrame className="rank-card" frame={UI_ASSETS.panel}>
          <AssetIcon src={ICONS.shield} alt="" size={42} />
          <div className="card-copy">
            <strong>{t(stage.title)}</strong>
            <span>{t("Престиж: ")}{t(formatNumber(stage.computedPrestige))}</span>
            <ProgressBar value={stage.computedPrestige} max={1700} fill="gold" label={t("Прогресс")} />
          </div>
        </HudFrame>
      </div>
    );
  }

  if (activePanel === 'map') {
    return (
      <div className="panel-body">
        <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.map} alt="" size={16} /><span>{t("Карта")}</span></div>
        <p>{t(stage.title)}</p>
      </div>
    );
  }

  return (
    <div className="panel-body">
      <div className="panel-subtitle panel-subtitle-row"><AssetIcon src={ICONS.achievement} alt="" size={16} /><span>{t("Поселение")}</span></div>
      <p>{t("Выберите здание или раздел меню.")}</p>
    </div>
  );
}

export default GenericPanel;

export { GenericPanel };
