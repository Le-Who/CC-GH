import { useSettlementText } from './useSettlementText.js';
import { BUILDINGS, CONSTRUCTION_PANEL_DATA, COUNCIL_PANEL_DATA, GOAL_PANEL_DATA, INVENTORY_PANEL_DATA, PROPS, RESEARCH_PANEL_DATA, RESOURCES, TOP_HUD_RESOURCE_IDS, SETTLEMENT_PROFILE, VILLAGERS, WORKERS, WORLD_MAP_PANEL_DATA, getSettlementPlacementSlotLayout } from './gameData.js';
import { ICONS, MAP_ASSETS, UI_ASSETS, VFX_ASSETS, buildingAsset, trimmedAsset } from './assetRegistry.js';
import { AssetIcon, HudFrame, ProgressBar, ResourceIcon, RewardBadge, formatNumber, frameStyle } from './settlementViewShared.jsx';

const GOAL_ICON_SOURCES = {
  shield: ICONS.shield,
  'town-hall': buildingAsset('hearth-hall', 3),
  population: ICONS.population,
  prestige: ICONS.prestige,
  wood: ICONS.wood,
  stone: ICONS.stone,
  combat: ICONS.achievement
};

function GoalIcon({ icon, size = 22 }) {
  const t = useSettlementText();
  const src = GOAL_ICON_SOURCES[icon] ?? ICONS.quest;
  return <AssetIcon src={src} alt="" size={size} />;
}

function GoalsPanel({ claimedGoalRewardIds = [], onClaimRewards }) {
  const t = useSettlementText();
  const claimed = new Set(claimedGoalRewardIds);
  const longTermGoals = GOAL_PANEL_DATA.longTermGoals;
  const dailyTasks = GOAL_PANEL_DATA.dailyTasks.map((task) => ({
    ...task,
    claimed: claimed.has(task.id),
    ready: task.progress.current >= task.progress.max,
    rewardLabel: `${formatNumber(task.progress.current)} / ${formatNumber(task.progress.max)}`
  }));
  const claimableDailyTasks = dailyTasks.filter((task) => task.ready && !task.claimed);
  const readyCount = claimableDailyTasks.length;

  return (
    <div className="goals-screen goals-screen-v2">
      <HudFrame className="goals-summary-card goals-summary-card-v2" frame={UI_ASSETS.goalsSummaryCard}>
        <div className="goals-summary-icon" style={frameStyle(UI_ASSETS.goalsIconSlot)}><AssetIcon src={ICONS.quest} alt="" size={30} /></div>
        <div className="goals-summary-copy">
          <span>{t("Цели поселения")}</span>
          <strong>{t(readyCount)}{t(" награды готовы к сбору")}</strong>
          <ProgressBar value={readyCount} max={Math.max(1, GOAL_PANEL_DATA.dailyTasks.length)} fill="green" label={t(`${readyCount} / ${GOAL_PANEL_DATA.dailyTasks.length}`)} className="goals-summary-progress" />
        </div>
        <div className="goals-summary-reward" style={frameStyle(UI_ASSETS.goalsClaimCountBadge)}>
          <ResourceIcon type="prestige" size={15} />
          <b>{t(readyCount)}</b>
        </div>
      </HudFrame>

      <div className="goals-section-head">
        <span>{t("Долгосрочные цели")}</span>
        <b>{t(longTermGoals.length)}{t(" задачи")}</b>
      </div>
      <div className="goal-card-list goals-longterm-list">
        {longTermGoals.map((goal) => (
          <HudFrame key={goal.id} className="goal-card goal-card-v2" frame={UI_ASSETS.goalsLongtermRow}>
            <div className="goal-card-icon" style={frameStyle(UI_ASSETS.goalsIconSlot)}>
              <GoalIcon icon={goal.icon} />
            </div>
            <div className="goal-card-copy">
              <strong>{t(goal.title)}</strong>
              <span>{t(goal.description)}</span>
              <ProgressBar
                value={goal.progress.current}
                max={goal.progress.max}
                fill="green"
                label={t(`${formatNumber(goal.progress.current)} / ${formatNumber(goal.progress.max)}`)}
              />
            </div>
            <div className="goal-card-reward">
              <span>{t("Награда")}</span>
              <RewardBadge type={goal.reward.type} amount={goal.reward.amount} frame={UI_ASSETS.goalsRewardBadge} />
            </div>
          </HudFrame>
        ))}
      </div>

      <div className="goals-section-head">
        <span>{t("Ежедневные задачи")}</span>
        <b>{t("Обновление через: ")}{t(GOAL_PANEL_DATA.dailyRefreshLabel)}</b>
      </div>
      <div className="daily-task-list daily-task-list-v2">
        {dailyTasks.map((task) => (
          <HudFrame key={task.id} className={`daily-task-card daily-task-card-v2 ${task.ready ? 'done' : ''} ${task.claimed ? 'claimed' : ''}`} frame={UI_ASSETS.goalsDailyRow}>
            <div className="daily-task-icon" style={frameStyle(UI_ASSETS.goalsIconSlot)}>
              <GoalIcon icon={task.icon} size={20} />
            </div>
            <div className="daily-task-copy">
              <strong>{t(task.title)}</strong>
              <span>{t(task.description)}</span>
              <ProgressBar value={task.progress.current} max={task.progress.max} fill="green" label={t(task.rewardLabel)} />
            </div>
            <div className="daily-task-reward">
              <span>{t("Награда")}</span>
              <RewardBadge type={task.reward.type} amount={task.reward.amount} frame={UI_ASSETS.goalsRewardBadge} />
            </div>
          </HudFrame>
        ))}
      </div>

      <button className={`goals-claim-button ${readyCount > 0 ? 'ready' : ''}`} type="button" onClick={onClaimRewards} disabled={!readyCount} style={frameStyle(readyCount > 0 ? UI_ASSETS.goalsClaimButtonIdle : UI_ASSETS.goalsClaimButtonDisabled)}>
        <AssetIcon src={ICONS.gift} alt="" size={18} />
        <span>{t("Забрать награды")}</span>
        <b style={frameStyle(UI_ASSETS.goalsClaimCountBadge)}>{t(readyCount)}</b>
      </button>
    </div>
  );
}

export default GoalsPanel;

export { GoalsPanel };
