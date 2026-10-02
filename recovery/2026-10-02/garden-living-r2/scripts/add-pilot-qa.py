from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1];target=root/'game-preview'
base=Path('/workspace/shared/garden-merge-hotfix-20261002/garden')
p=target/'qa/profiles.mjs';s=(base/'qa/profiles.mjs').read_text();assert s.count('export function casesFor(')==1
s=s.replace('export function casesFor(','function baseCasesFor(')
s+='''
export function casesFor(game,options={}){
 const cases=baseCasesFor(game,options);if(game!=='garden')return cases;
 return cases.concat([
  {id:'garden-living-tap-water',options:view(390,844,{fixture:'progress',language:'ru'}),run:async a=>{
   await a.waitFor("const stats=w.__GARDEN_LIVING_QA__?.snapshot();return stats?.surfaces.some(s=>s.frames>1&&s.textures>0);",'Live plant renderer did not become ready');
   await a.check('New artwork loaded with a shared surface',"return d.querySelectorAll('.gs2-live-surface').length===1&&d.querySelector('[data-living-species=daisy] img')?.naturalWidth>0;");
   const before=await a.evaluate("return w.__GARDEN_LIVING_QA__.snapshot().surfaces.reduce((n,s)=>n+s.touches,0);");
   await a.click('[data-plant-id="preview-daisy"] .gs2-plant-target');
   await a.check('One accepted tap requests one visual response',`return w.__GARDEN_LIVING_QA__.snapshot().surfaces.reduce((n,s)=>n+s.touches,0)===${before+1};`);
   await a.screenshot('living-daisy-after-tap');
   await a.click('[data-plant-id="preview-daisy"] [data-plant-details-button]');await a.checkDialog();
   await a.waitFor("return w.__GARDEN_LIVING_QA__.snapshot().surfaces.length===2;");
   await a.click('.gs2-dialog button:has(img[src$="/water.webp"])');
   await a.waitFor("return w.__GARDEN_LIVING_QA__.snapshot().surfaces.some(s=>s.waterings>0);",'Confirmed water state did not trigger plant response');
   await a.screenshot('living-daisy-water-detail');await a.dismiss();await a.waitFor("return w.__GARDEN_LIVING_QA__.snapshot().surfaces.length===1;");
   await a.check('Closing detail releases its surface',"return w.__GARDEN_LIVING_QA__.snapshot().surfaces.length===1;");
   await a.check('No texture load errors',"return w.__GARDEN_LIVING_QA__.snapshot().surfaces.every(s=>s.failed.length===0);");
   a.record.livingArtSnapshot=await a.evaluate("return w.__GARDEN_LIVING_QA__.snapshot();");
  }},
  {id:'garden-living-scroll-landscape',options:view(568,320,{fixture:'full',language:'en',chrome:'telegram-safe'}),run:async a=>{
   await a.waitFor("return w.__GARDEN_LIVING_QA__?.snapshot().surfaces.some(s=>s.frames>1);");
   await a.screenshot('living-compact-first-shelves');
   await a.click('[data-plant-id="preview-full-13"] [data-plant-details-button]');await a.checkDialog();
   await a.waitFor("return d.querySelector('[role=dialog] [data-living-species=fern] img')?.naturalWidth>0;");
   await a.screenshot('living-fern-compact-detail');await a.dismiss();await a.waitFor("return w.__GARDEN_LIVING_QA__.snapshot().surfaces.length===1;");
   await a.screenshot('living-compact-lower-shelf');
   await a.check('No horizontal overflow',"return d.documentElement.scrollWidth<=w.innerWidth+1;");
   await a.check('Dialog surface disposed after close',"return d.querySelectorAll('.gs2-live-surface').length===1;");
   a.record.livingArtSnapshot=await a.evaluate("return w.__GARDEN_LIVING_QA__.snapshot();");
  }}
 ]);
}
'''
p.write_text(s)
version='garden-v2-20261002-living-pilot1'
for relative in ['source-excerpt/preview/garden/version.js','dist-garden-preview/assets/version-DqqkhP_u.js']:
 text=(base/relative).read_text();assert 'garden-v2-20261002-hf1' in text
 (target/relative).write_text(text.replace('garden-v2-20261002-hf1',version))
old=json.loads((base/'dist-garden-preview/garden-preview.json').read_text())
(target/'BASE-HF1-PROVENANCE.json').write_text(json.dumps(old,indent=2))
marker={key:old[key] for key in ['kind','game','productionCompatible','storage','network','pwa','entrypoints','fixtures']}
marker.update(previewVersion=version,artifactType='living-art-pilot-over-recovered-bundle-not-source-rebuild',browserQa='NOT RUN for new living art; user-run verification required',newArtSpecies=['daisy','monstera','fern'],remainingLegacyArtSpecies=11,basePreviewVersion=old['previewVersion'])
marker['assets']=[]
for file in (target/'dist-garden-preview/games').rglob('*'):
 if file.is_file():marker['assets'].append({'path':'/'+str(file.relative_to(target/'dist-garden-preview')),'bytes':file.stat().st_size,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
(target/'dist-garden-preview/garden-preview.json').write_text(json.dumps(marker,indent=2))
print(version)
for relative in ['RUN-QA.cmd','START-GARDEN-PREVIEW.cmd','START-GARDEN-PREVIEW.sh']:
 text=(target/relative).read_text();(target/relative).write_text(text.replace('garden-v2-20261002-hf1',version))
(target/'RUN-QA-FULL.cmd').write_text('@echo off\nsetlocal\ncd /d "%~dp0"\nnode qa\\run-qa.mjs --root "%CD%" --game garden %*\nset "QA_EXIT=%ERRORLEVEL%"\npause\nexit /b %QA_EXIT%\n')
(target/'README-FIRST.txt').write_text('''GARDEN SHELF — LIVING PLANTS PILOT 1

Промежуточная проверочная сборка: новая графика и живое движение пока у
ромашки, монстеры и папоротника. Остальные 11 видов сохраняют прежнюю графику.
Для трёх новых видов подготовлено по четыре отдельные прозрачные стадии.

START-GARDEN-PREVIEW.cmd — открыть игру.
RUN-QA.cmd — 12 быстрых сценариев, настоящие клики и PNG в qa-results.
RUN-QA-FULL.cmd — расширенная матрица; пока не обязательна.
Нужны уже установленный Node.js и Chrome/Edge. Ничего не устанавливается.
Нет автоматической загрузки результатов, внешних API или доступа к аккаунтам.

Сборка изолирована и использует тестовое состояние в памяти. Прогресс основной
игры не читается и не меняется. Это не production-сборка.

Проверено: 18 локальных тестов математики/контрактов/имитатора поверхности,
синтаксис и HTTP-ресурсы. WebGL здесь пока не проверен настоящим браузером.
18 тестов не равны визуальной проверке: её дадут PNG и результаты RUN-QA.
Технический ролик движения рендерился отдельно из тех же координат.

Код изменения графики добавлен поверх восстановленного исполняемого hf1;
эквивалентные изменения исходного фрагмента включены. Полная исходная сборка
репозитория не выполнялась. BASE-HF1-PROVENANCE.json сохраняет прежние данные.
''')
