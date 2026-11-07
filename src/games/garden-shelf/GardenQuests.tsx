import React, { useMemo, useState } from 'react';
import { Check, Lock, Hand, Sparkles, ArrowUpCircle } from 'lucide-react';
import { useGame } from './lib/GardenContext';
import { useGardenI18n } from './lib/i18n';
import { formatGardenGoldAmount } from './constants';
import { buildGardenQuestSections } from '../../../game-logic/garden-quests.js';
import { orderGardenQuests } from './gardenInteraction.js';
import { formatR2Gold } from './lib/gardenR2View.js';
import { Art, Button, Dialog, MenuTabs, Progress } from './GardenViewShared.tsx';
import { useMenuCompletion } from './useMenuCompletion';
import './garden-menus.css';

const goalArt: Record<string, string> = {tap:'leaf',water:'water',tend:'water',gold:'coin',xp:'leaf',plant:'pot',upgrade:'leaf',placed:'pot',mature:'leaf',first_plant:'pot',mature_plant:'leaf',level_2:'leaf',filled_shelf:'pot',second_shelf:'quest'};
function Quests({ onClose, run, busy }: any) {
  const { state, claimQuest, r2, accountingReady } = useGame();
  const { t } = useGardenI18n();
  const [tab, setTab] = useState('daily');
  const quests = useMemo(() => orderGardenQuests(r2 ? r2.quests : buildGardenQuestSections(state)), [state, r2]);
  const completion = useMenuCompletion(id => {
    const quest = quests.find(q => q.id === id);
    return quest?.claimed ? `${t(quest.titleKey, quest.titleVars)}: ${t('quest.claimed')}` : null;
  }, busy);
  const groups = quests.reduce((result: any[], quest: any) => {
    const key = `${quest.kind}:${!!quest.claimed}:${!!quest.locked}`;
    const previous = result[result.length - 1];
    if (previous?.key === key) previous.quests.push(quest);
    else result.push({key,kind:quest.kind,claimed:!!quest.claimed,locked:!!quest.locked,quests:[quest]});
    return result;
  }, []);
  const cards = (items: any[]) => items.map(q => {
    const goal = q.templateKey ? q.templateKey.split('_')[0] : q.id;
    const ready = q.unlocked && q.complete && !q.claimed;
    const reward = <span className="gs2-quest-reward" id={`quest-reward-${q.id}`} aria-label={`${t('hud.gold')}: ${r2 ? formatR2Gold(q.reward) : formatGardenGoldAmount(q.reward)}`}><Art name="coin" /><strong>{r2 ? formatR2Gold(q.reward) : formatGardenGoldAmount(q.reward)}</strong></span>;
    return <article key={q.id} className="gs2-quest-card" data-quest-id={q.id} data-quest-kind={q.kind} data-quest-claimed={String(!!q.claimed)} data-quest-locked={String(!!q.locked)} data-quest-ready={String(ready)} aria-label={t(q.bodyKey,q.bodyVars)}>
      <span className="gs2-quest-crest" aria-hidden="true"><Art name={goalArt[goal] || 'quest'} />{goal === 'tap' ? <Hand/> : goal === 'xp' ? <Sparkles/> : goal === 'upgrade' ? <ArrowUpCircle/> : null}</span>
      <h3 title={t(q.bodyKey,q.bodyVars)}>{goalArt[goal] ? t(`menu.goal.${goal}`) : t(q.bodyKey,q.bodyVars)}</h3>
      {ready ? <Button primary className="gs2-quest-claim" aria-label={t('quest.claim')} aria-describedby={`quest-reward-${q.id}`} data-menu-completion-action="true" disabled={busy || !accountingReady} onClick={event => completion.run(q.id,event,() => run(() => claimQuest(q.id,q.reward)))}>{t('quest.claim')}{reward}</Button> : reward}
      <div className="gs2-quest-meters"><Progress value={q.current / q.target * 100} label={t('quest.progress',{current:q.current,target:q.target})} />
        {q.careAlternative && <div className="gs2-quest-alternative"><span>{t('menu.questAlternative')}</span><Progress value={q.careAlternative.current / q.careAlternative.target * 100} label={t('quest.progress',q.careAlternative)} /></div>}
      </div>
      {q.claimed && <span className="gs2-menu-state gs2-quest-state"><Check size={16}/>{t('quest.claimed')}</span>}
      {q.locked && <span className="gs2-menu-state gs2-quest-state"><Lock size={14}/>{t('quest.locked')}</span>}
    </article>;
  });
  return <Dialog title={t('quest.title')} kind="quests" onClose={onClose} navigation={<MenuTabs id="garden-quests-tabs" label={t('quest.title')} value={tab} onChange={setTab} items={[{id:'daily',label:t('menu.today')},{id:'story',label:t('menu.achievements')}]}/> }>
    <p className="gs2-menu-announcement" role="status" aria-live="polite" aria-atomic="true">{completion.message}</p>
    <div id="garden-quests-tabs-panel" role="tabpanel" aria-labelledby={`garden-quests-tabs-${tab}`} className="gs2-quest-list">{groups.length ? groups.map(group => <section className="gs2-quest-group" key={group.quests[0].id} hidden={group.kind !== tab}>
      {group.claimed || group.locked ? <details className="gs2-quest-archive"><summary tabIndex={0}>{group.claimed ? <Check size={16}/> : <Lock size={16}/>}<span>{t(group.claimed ? 'menu.claimed' : 'menu.later')}</span><b>{group.quests.length}</b></summary><div>{cards(group.quests)}</div></details> : cards(group.quests)}
    </section>) : <p className="gs2-empty-state">{t('ui.noQuests')}</p>}</div>
  </Dialog>;
}
export default Quests;
export { Quests };
