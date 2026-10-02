from pathlib import Path
import hashlib,json,shutil
root=Path(__file__).resolve().parents[1]
base=Path('/workspace/shared/garden-merge-hotfix-20261002/garden')
target=root/'game-preview'
dist=target/'dist-garden-preview'
runtime=dist/'games/garden-living';runtime.mkdir(parents=True,exist_ok=True)
for file in (root/'assets').glob('*.webp'):
 shutil.copyfile(file,runtime/file.name)
source=target/'source-excerpt/src/games/garden-shelf';(source/'living').mkdir(exist_ok=True)
for name in ['living-plant-art.mjs','plant-motion.mjs','plant-profiles.mjs','plant-stage-profiles.mjs','plant-presentation-contract.mjs']:
 for dest in [runtime/name,source/'living'/name]:shutil.copyfile(root/'src'/name,dest)
bundleRelative=Path('dist-garden-preview/assets/host-BacBU0WN.js')
bundle=(base/bundleRelative).read_text()
anchor='function os({plant:n,size:i=112})'
assert bundle.count(anchor)==1
bundle=bundle.replace(anchor,'const ggArt=ggMake(L,ggLegacyArt);function os(n){return A.jsx(ggSupports(n.plant?.type)?ggArt:ggLegacyArt,n)}function ggLegacyArt({plant:n,size:i=112})')
tap='u||(f(n.id),c(g(n.phase>=3?"plantDetail.tapGold":"plantDetail.tapGrowth")))'
assert bundle.count(tap)==1
bundle=bundle.replace(tap,'u||(f(n.id),ggTouch(n.id),c(g(n.phase>=3?"plantDetail.tapGold":"plantDetail.tapGrowth")))')
care='className:"gs2-detail-tap",onClick:()=>{f(z.id),d(E(V?"plantDetail.tapGold":"plantDetail.tapGrowth"))}'
assert bundle.count(care)==1
bundle=bundle.replace(care,care.replace('f(z.id),','f(z.id),ggTouch(z.id),'))
bundle='import{makeLivingPlantArt as ggMake,supportsLivingPlant as ggSupports,notifyPlantTouch as ggTouch}from"/games/garden-living/living-plant-art.mjs";\n'+bundle
(target/bundleRelative).write_text(bundle)
sourceRelative=Path('source-excerpt/src/games/garden-shelf/GardenPresentation.tsx')
s=(base/sourceRelative).read_text();assert s.count('function PlantArt({')==1
s=s.replace('function PlantArt({','const LivingPlantArt=makeLivingPlantArt(React,LegacyPlantArt);\nfunction PlantArt(props:any){return supportsLivingPlant(props.plant?.type)?<LivingPlantArt {...props}/>:<LegacyPlantArt {...props}/>;}\nfunction LegacyPlantArt({')
s=s.replace('    tapPlant(plant.id);','    tapPlant(plant.id);\n    notifyPlantTouch(plant.id);')
care_source='          tapPlant(p.id);'
assert s.count(care_source)==1
s=s.replace(care_source,care_source+'\n          notifyPlantTouch(p.id);')
s="import {makeLivingPlantArt,supportsLivingPlant,notifyPlantTouch} from './living/living-plant-art.mjs';\n"+s
(target/sourceRelative).write_text(s)
css='\n/* Pilot visual-only overlay stays inside the existing Garden HUD geometry. */\n.gs2-water-ready{z-index:3}.gs2-live-plant{position:relative}.gs2-live-surface{contain:strict}\n'
for relative in ['source-excerpt/src/games/garden-shelf/garden-presentation.css','dist-garden-preview/assets/host-DSh9NqDm.css']:
 (target/relative).write_text((base/relative).read_text()+css)
server=Path('scripts/garden-preview-serve.mjs')
serverText=(base/server).read_text();assert "'.js': 'text/javascript; charset=utf-8'" in serverText
(target/server).write_text(serverText.replace("'.js': 'text/javascript; charset=utf-8'","'.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8'"))
policy=Path('source-excerpt/preview/garden/request-policy.js');policyText=(base/policy).read_text()
needle="      url.pathname === '/games/garden-shelf/assets_transparent.png'"
assert policyText.count(needle)==1
policyText=policyText.replace(needle,"      /^\\/games\\/garden-living\\/[a-z0-9-]+\\.(?:mjs|webp)$/.test(url.pathname) ||\n"+needle)
(target/policy).write_text(policyText)
compiledPolicy=Path('dist-garden-preview/assets/request-policy-ChoEaSUk.js');cp=(base/compiledPolicy).read_text();needle='s.pathname==="/games/garden-shelf/assets_transparent.png"';assert cp.count(needle)==1
cp=cp.replace(needle,'/^\\/games\\/garden-living\\/[a-z0-9-]+\\.(?:mjs|webp)$/.test(s.pathname)||'+needle)
(target/compiledPolicy).write_text(cp)
record={'status':'fourteen-species development build, not release, no full source rebuild','base':'Garden hf1 verified user quick QA10/10','mutations':['unique compiled PlantArt dispatch','visual-only deliberate-touch notification for shelf and care','equivalent source excerpt modifications','new presentation modules and art'],'unchanged':['gameplay/economy/backend/receipt logic','legacy art fallback on new image failure'],'files':{}}
for p in [target/bundleRelative,target/sourceRelative,*runtime.iterdir()]:record['files'][str(p.relative_to(target))]=hashlib.sha256(p.read_bytes()).hexdigest()
(target/'LIVING-PILOT-PROVENANCE.json').write_text(json.dumps(record,ensure_ascii=False,indent=2))
print(json.dumps({'runtimeFiles':len(list(runtime.iterdir())),'bundleSha256':record['files'][str(bundleRelative)]}))
