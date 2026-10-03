import React, { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Home, Settings, X, Plus, Info, ChevronLeft, ChevronRight, Archive, Trash2, Lock, ArrowUpCircle, Check } from 'lucide-react';
import { useGame } from './lib/GardenContext';
import { useGardenI18n } from './lib/i18n';
import { MAX_SHELVES, SPOTS_PER_SHELF, PLANT_TYPES, SHELF_UNLOCK_COSTS, formatGardenGoldAmount, toGardenGoldDisplayValue, formatGardenRate, getProduction, getUpgradeCost, getPlantUnlockLevel, getGardenWaterCooldownMs, getGardenLevelReward } from './constants';
import { buildGardenQuestSections, getGardenReadyQuestCount } from '../../../game-logic/garden-quests.js';
import { createGardenPressSession, createGardenActionGate, createGardenShelfDrag, orderGardenQuests, clampGardenPercent } from './gardenInteraction.js';
import { formatR2Gold, formatR2Rate, gardenPlantPhaseDuration } from './lib/gardenR2View.js';
import { Art, Button, Dialog, Progress } from './GardenViewShared.tsx';

function Quests({
  onClose,
  run,
  busy
}: any) {
  const {
      state,
      claimQuest, r2,
      accountingReady
    } = useGame(),
    {
      t
    } = useGardenI18n(),
    quests = useMemo(() => orderGardenQuests(r2 ? r2.quests : buildGardenQuestSections(state)), [state, r2]);
  return <Dialog title={t('quest.title')} kind="quests" onClose={onClose}><p className="gs2-muted">{t('quest.subtitle')}</p><div className="gs2-quest-list">{quests.length ? quests.map(q => <article key={q.id} className="gs2-quest-card" data-quest-id={q.id} data-quest-kind={q.kind} data-quest-claimed={String(!!q.claimed)} data-quest-locked={String(!!q.locked)}><span className="gs2-kicker">{t(q.kind === 'daily' ? 'quest.daily' : 'quest.story')}</span><h3>{t(q.titleKey, q.titleVars)}</h3><p>{t(q.bodyKey, q.bodyVars)}</p>{q.careAlternative && <p>{t('r2.questAlternative', q.careAlternative)}</p>}<div className="gs2-quest-reward"><Art name="coin" /><strong>{r2 ? formatR2Gold(q.reward) : formatGardenGoldAmount(q.reward)}</strong></div><Progress value={q.careAlternative ? Math.max(q.percent, q.careAlternative.current / q.careAlternative.target * 100) : q.percent} label={t('quest.progress', {
          current: q.current,
          target: q.target
        })} />{q.endowed > 0 && <small>{t('quest.endowed', {
            count: q.endowed
          })}</small>}<Button primary disabled={busy || !accountingReady || !q.unlocked || !q.complete || q.claimed} onClick={() => run(() => claimQuest(q.id, q.reward))}>{q.claimed ? <Check size={18} /> : q.locked ? <Lock size={18} /> : <Art name="quest" />}{t(q.claimed ? 'quest.claimed' : q.locked ? 'quest.locked' : 'quest.claim')}</Button></article>) : <p>{t('ui.noQuests')}</p>}</div></Dialog>;
}

export default Quests;

export { Quests };
