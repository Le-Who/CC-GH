"""Deterministic hotfix of recovered preview bundles; this is not a source rebuild."""
from pathlib import Path
import hashlib,json
ROOT=Path(__file__).resolve().parents[1]
changes=[]
def write(p,s,reason):
 old=p.read_text(); assert old!=s, str(p)
 changes.append({'path':str(p.relative_to(ROOT)),'before_sha256':hashlib.sha256(old.encode()).hexdigest(),'after_sha256':hashlib.sha256(s.encode()).hexdigest(),'reason':reason})
 p.write_text(s)
def one(s,a,b):
 assert s.count(a)==1, (a[:100],s.count(a))
 return s.replace(a,b)

# Keep Garden's native keyboard button behavior. Only the QA protocol changes.
for game in ['garden','merge']:
 p=ROOT/game/'qa/actor.mjs';s=p.read_text()
 a="await this.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key,code,windowsVirtualKeyCode,...extra});"
 b="const text=!(extra.modifiers&~8)?(key==='Enter'?'\\r':key.length===1?key:''):'';await this.send('Input.dispatchKeyEvent',{type:text?'keyDown':'rawKeyDown',key,code,windowsVirtualKeyCode,...(text?{text,unmodifiedText:text}:{}),...extra});"
 s=one(s,a,b)
 # Capture failed hit tests with exact locator and returned hit details.
 s=one(s,"if(!hit||!(hit===e||e.contains(hit)))throw Error('Click target obscured');", "if(!hit||!(hit===e||e.contains(hit)))throw Error('Click target obscured: '+JSON.stringify({locator:"+"${json(locator)}"+",target:e.outerHTML.slice(0,500),hit:hit?.outerHTML.slice(0,500)||null,point:{x,y},rect:{x:r.x,y:r.y,width:r.width,height:r.height},active:d.activeElement?.outerHTML.slice(0,200)}));")
 write(p,s,'Emit native text-bearing Enter/Space keyDown; preserve raw command keys; expose hit-test evidence')
 p=ROOT/game/'qa/profiles.mjs';s=p.read_text();s=one(s,"await a.click({role:'button',name:'Close'});", "await a.click('[role=dialog] .gs2-close');")
 # Assert focus target and record the real before/after state without changing app state.
 s=one(s,'await a.key(\'Enter\');await a.waitFor(`return JSON.parse(w.localStorage.getItem(\'terrarium_save\')).dailyQuests.stats.taps===${before+1};`,\'Keyboard tap did not increment exactly once\');',
 "await a.check('Keyboard target is the real focused plant button',\"return d.activeElement===d.querySelector('.gs2-plant-target')&&!d.activeElement.disabled;\");await a.key('Enter');await a.waitFor(`return JSON.parse(w.localStorage.getItem('terrarium_save')).dailyQuests.stats.taps===${before+1};`,'Keyboard tap did not increment exactly once');await a.check('Keyboard activation leaves care closed',\"return !d.querySelector('[role=dialog]');\");")
 write(p,s,'Scope Garden Close to the active dialog; assert native keyboard focus and no accidental care')

# Garden: the safe usable width may be narrower than the default landscape breakpoint.
p=ROOT/'garden/source-excerpt/src/games/garden-shelf/gardenComposition.js';s=p.read_text()
s=one(s,'landscape = w >= spec.landscapeMinWidth && w >= h;', '''// A short safe frame still uses the side rail if three 44px targets fit.
    // Preserve the configured breakpoint for taller layouts.
    sideFitWidth = spec.railMin + padding * 2 + gap + 3 * 44 + 2 * spec.spotGap,
    landscape = w >= h && (w >= spec.landscapeMinWidth || (h < spec.compactHeight && w >= sideFitWidth));''')
write(p,s,'Use a fit-tested side composition at short safe-frame widths')
p=ROOT/'garden/dist-garden-preview/assets/host-BacBU0WN.js';s=p.read_text()
s=one(s,'z=h>=c.landscapeMinWidth&&h>=f,','z=h>=f&&(h>=c.landscapeMinWidth||f<c.compactHeight&&h>=c.railMin+y*2+v+3*44+2*c.spotGap),')
write(p,s,'Exact compiled equivalent of Garden composition source correction')

# Small-height dialog chrome consumes less of the body; controls remain >=44px.
css='''\n/* Recovered preview hotfix: retain a 44px close route and a scrollable body at short heights. */
@media (max-height:400px){
 .gs2-dialog{border-width:8px;border-image-width:8px}
 .gs2-dialog-heading{min-height:44px;padding:0 2px 4px;gap:8px}
 .gs2-dialog-heading h2{font-size:18px}
 .gs2-dialog-heading .gs2-close{width:44px;height:44px;min-height:44px;padding:0}
 .gs2-dialog-scroll{padding:6px 2px 2px;gap:8px}
 .gs2-dialog[data-garden-panel=quests] .gs2-dialog-scroll>.gs2-muted{display:none}
 .gs2-quest-card{padding:10px;gap:6px}
}
'''
for rel in ['source-excerpt/src/games/garden-shelf/garden-presentation.css','dist-garden-preview/assets/host-DSh9NqDm.css']:
 p=ROOT/'garden'/rel;write(p,p.read_text()+css,'Reduce only short-height dialog decoration, retaining body scrolling and close target')

# Merge: never let the outer safe frame become the scroll owner for a taller workspace.
p=ROOT/'merge/dist-merge-preview/assets/host-Bh9Bo-RB.css';s=p.read_text()
a='.ml-safe{position:absolute;top:var(--ml-safe-top,0);right:var(--ml-safe-right,0);bottom:var(--ml-safe-bottom,0);left:var(--ml-safe-left,0);min-width:0;min-height:0;overflow:hidden}'
s=one(s,a,a.replace('overflow:hidden','overflow:clip'))
s=one(s,'min-height:304px;row-gap:6px','min-height:0;row-gap:6px')
s=one(s,'min-height:314px;grid-template-rows:44px 44px minmax(148px,1fr) 44px','min-height:0;grid-template-rows:44px 44px minmax(148px,1fr) 44px')
# The 44px HUD row currently has 16px of border plus 28px text; remove spare padding,
# keep count labels on one line and scale the decorative side cap instead of clipping text.
s+='''\n/* Compact HUD count labels must fit their 44px row without clipping. */
.ml-root[data-compact=true] .ml-balance{border-top-width:4px;border-bottom-width:4px;border-image-width:4px 8px;padding:0 1px;gap:3px}
.ml-root[data-compact=true] .ml-balance strong{white-space:nowrap}
.ml-root[data-compact=true] .ml-balance strong small{font-size:10px}
.ml-root[data-orientation=landscape][data-compact=true] .ml-balance>svg{width:14px;height:14px;flex:0 0 14px}
'''
write(p,s,'Constrain workspace to safe height so its own overflow scrolls; keep safe-frame/modal fixed; fit compact counters')

# A modal view can change without changing onClose. Restore focus on that transition,
# and capture Escape even if removing a focused control temporarily leaves body active.
p=ROOT/'merge/dist-merge-preview/assets/host-BCxrcnPt.js';s=p.read_text()
a=s.index('function Hp(');b=s.index('function wp(',a);old=s[a:b]
new=old.replace('const M=X=>{if(X.key==="Escape"&&(X.preventDefault(),X.stopPropagation(),f()),X.key==="Tab")', 'const M=X=>{if(X.key==="Escape"&&!X.defaultPrevented&&!X.isComposing&&[...document.querySelectorAll(\'[role="dialog"][aria-modal="true"]\')].at(-1)===g){X.preventDefault();X.stopPropagation();f();return}if(X.key==="Tab")')
assert new!=old
new=one(new,'g.addEventListener("keydown",M);','document.addEventListener("keydown",M,!0);')
new=one(new,'g.removeEventListener("keydown",M),','document.removeEventListener("keydown",M,!0),')
new=one(new,'}},[f]),d.jsx','}},[f,s]),d.jsx')
s=s[:a]+new+s[b:];write(p,s,'Refocus Merge dialog after view changes; handle Escape at document capture with topmost-modal guard')

# Keep the base provenance, but clearly identify the derived artifact instead of claiming a rebuild.
for game,oldver,newver,marker in [
 ('garden','garden-v2-20261001-r2','garden-v2-20261002-hf1','garden-preview.json'),
 ('merge','merge-v3-20261001-r1','merge-v3-20261002-hf1','merge-preview.json')]:
 dist=ROOT/game/f'dist-{game}-preview'
 for p in dist.rglob('*'):
  if p.suffix in ['.js','.json','.html'] and p.is_file() and p.name!=marker:
   s=p.read_text()
   if oldver in s:write(p,s.replace(oldver,newver),'Identify the derived hotfix preview independently of its base')
 p=dist/marker;d=json.loads(p.read_text());d['basePreviewVersion']=oldver;d['previewVersion']=newver
 d['artifactType']='recovered-bundle-hotfix-not-source-rebuild'
 d['browserQa']='NOT RUN: fresh Chromium launch blocked by host socket restriction; user rerun required'
 d['hotfixScope']='QA key protocol and locator; usable-height composition; Merge dialog lifecycle. No production data or economy changes.'
 write(p,json.dumps(d,ensure_ascii=False,indent=2)+'\n','Mark hotfix scope and unverified browser boundary')
(ROOT/'HOTFIX-CHANGES.json').write_text(json.dumps(changes,indent=2)+'\n')
print('Patched',len(changes),'files, originals preserved in recovered-games')
