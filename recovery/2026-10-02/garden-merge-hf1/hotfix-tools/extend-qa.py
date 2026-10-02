from pathlib import Path
R=Path(__file__).resolve().parents[1]
for game in ['garden','merge']:
 p=R/game/'qa/profiles.mjs';s=p.read_text()
 old="await a.screenshot('safe-inset-game');await a.click(game==='garden'?{role:'button',name:'Квесты сада'}:t('ml-open-journal'));await a.checkDialog();await a.screenshot('safe-inset-dialog');await a.dismiss();"
 new="""await a.screenshot('safe-inset-game');
 if(game==='garden'){
  if(width>height)await a.check('Short usable frame keeps the side rail',\"return d.querySelector('.gs2-stage').dataset.gs2Arrangement==='side';\");
  await a.check('Shelf scroll reaches a real care button inside the usable frame',\"const e=d.querySelector('.gs2-details');e.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});const r=e.getBoundingClientRect(),hit=d.elementFromPoint(r.x+r.width/2,r.y+r.height/2),v=d.querySelector('.gs2-shelf-viewport').getBoundingClientRect();return r.y>=v.y-1&&r.bottom<=v.bottom+1&&r.x>=-1&&r.right<=w.innerWidth+1&&(hit===e||e.contains(hit));\");
 }
 await a.click(game==='garden'?{role:'button',name:'Квесты сада'}:t('ml-open-journal'));await a.checkDialog();
 if(game==='merge')await a.check('Only the workspace scrolls; safe frame remains stationary',\"const e=d.querySelector('.ml-workspace'),s=d.querySelector('.ml-safe');return e.clientHeight<=s.clientHeight+1&&s.scrollTop===0&&getComputedStyle(e).overflowY==='auto';\");
 await a.screenshot('safe-inset-dialog');
 await a.check('Dialog body scroll reaches its lower content',\"const e=d.querySelector('.gs2-dialog-scroll,.ml-dialog-scroll');e.scrollTop=e.scrollHeight;const r=e.getBoundingClientRect(),last=e.lastElementChild?.getBoundingClientRect();return r.height>=44&&e.scrollHeight>=e.clientHeight&&Math.abs(e.scrollTop-Math.max(0,e.scrollHeight-e.clientHeight))<=2&&Boolean(last)&&last.bottom<=r.bottom+2;\");
 await a.checkDialog();await a.screenshot('safe-inset-dialog-bottom');await a.dismiss();"""
 assert s.count(old)==1;s=s.replace(old,new)
 old="await a.waitFor(\"return !d.querySelector('[data-testid=ml-quote]');\",'Quote did not confirm');"
 new=old+"await a.check('Quote transition restores focus into the current dialog',\"const e=d.querySelector('[role=dialog]');return Boolean(e&&e.contains(d.activeElement));\");"
 assert s.count(old)==1;s=s.replace(old,new);p.write_text(s)
