import React, { useState } from 'react';
import { Check, Clock, Lock, ChevronDown } from 'lucide-react';
import { useGame } from '../lib/GardenContext';
import { useGardenI18n } from '../lib/i18n';
import { R2_RESEARCH, R2_PROJECTS } from '../../../../game-logic/garden-r2/catalog.js';
import { formatR2Gold, formatR2Rate, r2MasteryOffer, r2NextUnlock } from '../lib/gardenR2View.js';
import { Art, MenuTabs, MenuPrice, PlantArt, Progress } from '../GardenViewShared.tsx';
import { useMenuCompletion } from '../useMenuCompletion';
import '../garden-menus.css';

export function MasteryOffer({ plant, Button, run, busy }: any) {
  const { r2, r2Command, accountingReady } = useGame();
  const { t } = useGardenI18n();
  const offer = r2MasteryOffer(r2, plant);
  const completion = useMenuCompletion(id => {
    const [type,target] = id.split(':');
    return (r2.masteryByType[type] || 0) >= Number(target) ? `${t(`plant.${type}`)}: ${t('r2.mastery',{level:Number(target)})}` : null;
  },busy);
  return <section className="gs2-r2-card gs2-mastery-card">
    <p className="gs2-menu-announcement" role="status" aria-live="polite" aria-atomic="true">{completion.message}</p>
    <details className="gs2-menu-guide"><summary tabIndex={0}>{t('r2.mastery',{level:plant.mastery})}</summary><p>{t('r2.masteryPermanent')}</p>{offer && !offer.unlocked && <p>{t('r2.masteryRequires',{chapter:offer.chapter,tier:offer.target})}{offer.target === 3 && ` ${t('r2.masteryProject')}`}</p>}</details>
    <div className="gs2-mastery-steps" aria-hidden="true">{[1,2,3].map(level => <i key={level} data-earned={level <= plant.mastery}><Art name="leaf"/></i>)}</div>
    {offer && <><p className="gs2-mastery-gain">{t('r2.masteryDelta',{amount:formatR2Rate(offer.delta)})}</p>
      {offer.unlocked ? <Button primary disabled={busy || !accountingReady || r2.substrate < offer.cost} aria-label={t('r2.masteryBuy',{level:offer.target,amount:offer.cost})} onClick={event => completion.run(`${plant.type}:${offer.target}`,event,() => run(() => r2Command?.('upgradeMastery',{type:plant.type})))}><span>{t('plantDetail.evolve')}</span><MenuPrice substrate={offer.cost}/></Button> : <div className="gs2-menu-locked"><Lock size={14}/><MenuPrice substrate={offer.cost}/></div>}
    </>}
  </section>;
}

export default function GardenR2Progress({ Dialog, Button, onClose, onQuests, run, busy }: any) {
  const { r2, state, r2Command, accountingReady } = useGame();
  const { t, language } = useGardenI18n();
  const [tab,setTab] = useState('overview');
  const act = (name: string,input: any = {}) => run(() => r2Command?.(name,input));
  const blocked = busy || !accountingReady;
  const studyReady = r2.study.cards > 0 && r2.study.taps >= 5 && r2.study.waters >= 1;
  const next = r2NextUnlock(r2.chapter);
  const fullGold = formatR2Gold(state.gold);
  const displayedGold = fullGold.length > 10 ? new Intl.NumberFormat(language,{notation:'compact',maximumFractionDigits:1}).format(state.gold) : fullGold;
  const completion = useMenuCompletion(id => {
    if (id === 'intro') return r2.chapter >= 7 && !r2.introReady ? `${t('r2.claimIntro')}: ${t('quest.claimed')}` : null;
    const [kind,key] = id.split(':');
    if (kind === 'research' && r2.researchIds.includes(key)) return `${t(`r2.research.${key}.title`)}: ${t('r2.completed')}`;
    if (kind === 'project' && r2.projectsCompleted.includes(key)) return `${t(`r2.project.${key}`)}: ${t('r2.completed')}`;
    if (kind === 'project-start' && r2.activeProject?.projectId === key) return `${t(`r2.project.${key}`)}: ${t('r2.projectRemaining',{minutes:Math.max(0,Math.ceil((r2.activeProject.finishAt-r2.serverNow)/60000))})}`;
    return null;
  },busy);
  const tabs = [{id:'overview',label:t('menu.overview')},{id:'research',label:t('r2.research')},{id:'collections',label:t('menu.collections')}].map(item => ({...item,panelId:`garden-progress-${item.id}`}));
  return <Dialog title={t('r2.title')} kind="progression" onClose={onClose} navigation={<MenuTabs id="garden-progress-tabs" label={t('r2.title')} value={tab} onChange={setTab} items={tabs}/>}>
    <p className="gs2-menu-announcement" role="status" aria-live="polite" aria-atomic="true">{completion.message}</p>
    <div id="garden-progress-overview" role="tabpanel" aria-labelledby="garden-progress-tabs-overview" hidden={tab !== 'overview'} className="gs2-progress-overview">
      <section className="gs2-level-card" data-garden-level-card="true"><Art name="leaf"/><span>{t('hud.level')}</span><strong>{r2.chapter}<small>/30</small></strong><Progress value={r2.chapter === 30 ? 100 : r2.xp/r2.xpRequired*100} label={r2.chapter === 30 ? undefined : `${r2.xp}/${r2.xpRequired}`}/>{next && <p>{t('r2.nextUnlock',{level:next.level,items:next.items.map(item => t(item.key,{tier:item.tier})).join(' · ')})}</p>}</section>
      <div className="gs2-resource-pair"><div><Art name="coin"/><span>{t('hud.gold')}</span><strong title={fullGold} aria-label={`${t('hud.gold')}: ${fullGold}`}>{displayedGold}</strong></div><div><Art name="pot"/><span>{t('menu.substrate')}</span><strong>{r2.substrate}<small>/{r2.substrateCapacity}</small></strong></div></div>
      <Button primary className="gs2-quest-entry" onClick={onQuests}><Art name="quest"/>{t('quest.title')}</Button>
      {r2.substrate >= r2.substrateCapacity && <p className="gs2-menu-notice">{t('r2.substrateFull')}</p>}
      {r2.introReady && <Button primary disabled={blocked || r2.substrate+3>r2.substrateCapacity} aria-label={t('r2.claimIntro')} onClick={event => completion.run('intro',event,() => act('claimIntro'))}>{t('quest.claim')}<MenuPrice substrate={3}/></Button>}
      <details className="gs2-menu-guide gs2-resource-guide"><summary tabIndex={0}>{t('menu.substrate')}</summary><p>{t('r2.substrateHelp')}</p></details>
      <section className="gs2-r2-card gs2-study-card"><h3>{t('r2.study')}</h3>{r2.study.unlocked ? <><span className="gs2-study-stock">{t('menu.cards')} {r2.study.cards}/{r2.study.capacity}</span><div className="gs2-study-goals"><div><Art name="coin"/><span>{t('menu.goldTaps')}</span><Progress value={r2.study.taps/5*100} label={`${r2.study.taps}/5`}/></div><div><Art name="water"/><span>{t('menu.waterings')}</span><Progress value={r2.study.waters*100} label={`${r2.study.waters}/1`}/></div></div><Button primary disabled={blocked || !studyReady || r2.substrate+3>r2.substrateCapacity} aria-label={t('r2.claimStudy')} onClick={() => act('claimStudy')}>{t('quest.claim')}<MenuPrice substrate={3}/></Button></> : <span className="gs2-menu-locked"><Lock size={14}/>{t('r2.studyLocked')}</span>}<details className="gs2-menu-guide"><summary tabIndex={0}>{t('menu.requirements')}</summary><p>{t('r2.studyHelp')}</p></details></section>
    </div>
    <div id="garden-progress-research" role="tabpanel" aria-labelledby="garden-progress-tabs-research" hidden={tab !== 'research'} className="gs2-research-list">
      {['care','idle','collection'].map(branch => <details key={branch} className="gs2-research-branch" data-research-branch={branch} open={branch === 'care' ? true : undefined}><summary tabIndex={0}><Art name={branch === 'care' ? 'water' : branch === 'idle' ? 'coin' : 'pot'}/><span>{t(`menu.branch.${branch}`)}</span><b>{R2_RESEARCH.filter(node => node.branch === branch && r2.researchIds.includes(node.id)).length}/3</b><ChevronDown className="gs2-disclosure" size={14}/></summary><div>{R2_RESEARCH.filter(node => node.branch === branch).map(node => {
        const complete = r2.researchIds.includes(node.id), unlocked = r2.chapter >= node.chapter && (!node.prerequisite || r2.researchIds.includes(node.prerequisite));
        const price = t('r2.price',{gold:formatR2Gold(node.gold),substrate:node.substrate});
        return <section className="gs2-r2-card gs2-research-node" key={node.id} data-r2-research={node.id}><h3 aria-label={`${t(`r2.research.${node.id}.title`)}: ${t(`r2.research.${node.id}.body`)}`}><i>{['I','II','III'][node.tier-1]}</i>{t(`r2.research.${node.id}.body`)}</h3>
          {!complete && !unlocked && <p className="gs2-menu-requires"><Lock size={12}/>{r2.chapter < node.chapter && t('r2.researchRequires',{chapter:node.chapter})}{node.prerequisite && !r2.researchIds.includes(node.prerequisite) && `${r2.chapter < node.chapter ? ' · ' : ''}${t(`r2.research.${node.prerequisite}.title`)}`}</p>}
          {complete ? <span className="gs2-menu-state"><Check size={16}/>{t('r2.completed')}</span> : unlocked ? <Button primary data-menu-completion-action="true" disabled={blocked || state.gold<node.gold || r2.substrate<node.substrate} aria-label={price} onClick={event => completion.run(`research:${node.id}`,event,() => act('research',{researchId:node.id}))}><MenuPrice gold={formatR2Gold(node.gold)} substrate={node.substrate}/></Button> : <MenuPrice gold={formatR2Gold(node.gold)} substrate={node.substrate}/>}
        </section>;
      })}</div></details>)}
    </div>
    <div id="garden-progress-collections" role="tabpanel" aria-labelledby="garden-progress-tabs-collections" hidden={tab !== 'collections'} className="gs2-collection-list"><details className="gs2-menu-guide"><summary tabIndex={0}>{t('menu.requirements')}</summary><p>{t('r2.projectHelp')}</p></details>{R2_PROJECTS.map(project => {
      const complete = r2.projectsCompleted.includes(project.id), active = r2.activeProject?.projectId === project.id;
      const mature = r2.plants.filter(p => p.phase === 3 && p.isActive === true);
      const available = r2.researchIds.includes('collection_1') && !r2.activeProject && project.types.every(type => mature.some(p => p.type === type)) && project.types.some(type => (r2.masteryByType[type] || 0)>=1);
      const projectReady = active && r2.serverNow>=r2.activeProject.finishAt;
      const price = t('r2.price',{gold:formatR2Gold(project.gold),substrate:project.substrate});
      return <section className="gs2-r2-card gs2-collection-card" key={project.id} data-r2-project={project.id}><h3>{t(`r2.project.${project.id}`)}</h3><div className="gs2-project-plants gs2-catalog">{project.types.map(type => <figure key={type}>{tab === 'collections' && <PlantArt plant={{type,phase:3}} size={54}/>}<figcaption>{t(`plant.${type}`)}</figcaption></figure>)}</div><span className="gs2-project-time"><Clock size={14}/>{active ? t('r2.projectRemaining',{minutes:Math.max(0,Math.ceil((r2.activeProject.finishAt-r2.serverNow)/60000))}) : `${project.durationMs/3600000} ${t('menu.hoursShort')}`}</span>
        {complete ? <span className="gs2-menu-state"><Check size={16}/>{t('r2.completed')}</span> : (active ? projectReady : available) ? <Button primary data-menu-completion-action="true" disabled={blocked || (!active && (state.gold<project.gold || r2.substrate<project.substrate))} aria-label={active ? t('quest.claim') : price} onClick={event => completion.run(`${active ? 'project' : 'project-start'}:${project.id}`,event,() => active ? act('claimProject') : act('startProject',{projectId:project.id}))}>{active ? t('quest.claim') : <MenuPrice gold={formatR2Gold(project.gold)} substrate={project.substrate}/>}</Button> : !active && <MenuPrice gold={formatR2Gold(project.gold)} substrate={project.substrate}/>}
      </section>;
    })}</div>
  </Dialog>;
}
