import React from 'react';
import { useGame } from '../lib/GameContext';
import { useGardenI18n } from '../lib/i18n';
import { R2_RESEARCH, R2_PROJECTS } from '../../../../game-logic/garden-r2/catalog.js';
import { formatR2Gold, formatR2Rate, r2MasteryOffer } from '../lib/gardenR2View.js';

export function MasteryOffer({ plant, Button, run, busy }: any) {
  const { r2, r2Command, accountingReady } = useGame();
  const { t } = useGardenI18n();
  const offer = r2MasteryOffer(r2, plant);
  return <section className="gs2-r2-card"><h3>{t('r2.mastery', { level: plant.mastery })}</h3>
    <p>{t('r2.masteryPermanent')}</p>
    {offer ? <><p>{t('r2.masteryDelta', { amount: formatR2Rate(offer.delta) })}</p>
      {!offer.unlocked && <p>{t('r2.masteryRequires', { chapter: offer.chapter, tier: offer.target })}{offer.target === 3 && ` ${t('r2.masteryProject')}`}</p>}
      <Button primary disabled={busy || !accountingReady || !offer.unlocked || r2.substrate < offer.cost} onClick={() => run(() => r2Command?.('upgradeMastery', { type: plant.type }))}>{t('r2.masteryBuy', { level: offer.target, amount: offer.cost })}</Button>
    </> : <p>{t('r2.masteryComplete')}</p>}
  </section>;
}
export default function GardenR2Progress({ Dialog, Button, onClose, onQuests, run, busy }: any) {
  const { r2, state, r2Command, accountingReady } = useGame();
  const { t } = useGardenI18n();
  const act = (name, input = {}) => run(() => r2Command?.(name, input));
  const blocked = busy || !accountingReady;
  const studyReady = r2.study.cards > 0 && r2.study.taps >= 5 && r2.study.waters >= 1;
  return <Dialog title={t('r2.title')} kind="progression" onClose={onClose}>
    <section className="gs2-r2-card"><h3>{t('r2.substrateAmount', { amount: r2.substrate, capacity: r2.substrateCapacity })}</h3>
      <p>{t('r2.substrateHelp')}</p>
      {r2.substrate >= r2.substrateCapacity && <p>{t('r2.substrateFull')}</p>}
      {r2.introReady && <Button primary disabled={blocked || r2.substrate + 3 > r2.substrateCapacity} onClick={() => act('claimIntro')}>{t('r2.claimIntro')}</Button>}
    </section>
    <Button primary onClick={onQuests}>{t('quest.title')}</Button>
    <section className="gs2-r2-card"><h3>{t('r2.study')}</h3>
      <p>{r2.study.unlocked ? t('r2.studyProgress', { cards: r2.study.cards, capacity: r2.study.capacity, taps: r2.study.taps, waters: r2.study.waters }) : t('r2.studyLocked')}</p>
      <p>{t('r2.studyHelp')}</p>
      <Button primary disabled={blocked || !studyReady || r2.substrate + 3 > r2.substrateCapacity} onClick={() => act('claimStudy')}>{t('r2.claimStudy')}</Button>
    </section>
    <h3>{t('r2.research')}</h3>
    {R2_RESEARCH.map(node => {
      const complete = r2.researchIds.includes(node.id), unlocked = r2.chapter >= node.chapter && (!node.prerequisite || r2.researchIds.includes(node.prerequisite));
      return <section className="gs2-r2-card" key={node.id} data-r2-research={node.id}>
        <h3>{t(`r2.research.${node.id}.title`)}</h3><p>{t(`r2.research.${node.id}.body`)}</p>
        {!complete && <p>{t('r2.researchRequires', { chapter: node.chapter })}{node.prerequisite ? ` · ${t(`r2.research.${node.prerequisite}.title`)}` : ''}</p>}
        <Button primary disabled={blocked || complete || !unlocked || state.gold < node.gold || r2.substrate < node.substrate} onClick={() => act('research', { researchId: node.id })}>{complete ? t('r2.completed') : t('r2.price', { gold: formatR2Gold(node.gold), substrate: node.substrate })}</Button>
      </section>;
    })}
    <h3>{t('r2.projects')}</h3><p>{t('r2.projectHelp')}</p>
    {R2_PROJECTS.map(project => {
      const complete = r2.projectsCompleted.includes(project.id), active = r2.activeProject?.projectId === project.id;
      const mature = r2.plants.filter(p => p.phase === 3 && p.isActive === true);
      const available = r2.researchIds.includes('collection_1') && !r2.activeProject && project.types.every(type => mature.some(p => p.type === type)) && project.types.some(type => (r2.masteryByType[type] || 0) >= 1);
      const projectReady = active && r2.serverNow >= r2.activeProject.finishAt;
      return <section className="gs2-r2-card" key={project.id} data-r2-project={project.id}>
        <h3>{t(`r2.project.${project.id}`)}</h3><p>{project.types.map(type => t(`plant.${type}`)).join(', ')}</p>
        <p>{t('r2.hours', { hours: project.durationMs / 3600000 })}</p>
        {active && <p>{t('r2.projectRemaining', { minutes: Math.max(0, Math.ceil((r2.activeProject.finishAt - r2.serverNow) / 60000)) })}</p>}
        <Button primary disabled={blocked || complete || (active ? !projectReady : !available || state.gold < project.gold || r2.substrate < project.substrate)} onClick={() => active ? act('claimProject') : act('startProject', { projectId: project.id })}>{complete ? t('r2.completed') : active ? t('quest.claim') : t('r2.price', { gold: formatR2Gold(project.gold), substrate: project.substrate })}</Button>
      </section>;
    })}
  </Dialog>;
}
