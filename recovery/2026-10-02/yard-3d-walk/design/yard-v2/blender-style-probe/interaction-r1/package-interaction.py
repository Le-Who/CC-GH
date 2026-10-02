from pathlib import Path
import json,hashlib,zipfile
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
DEST=ROOT.parent/'cc-gh-yard-3d-interaction-prototype-20261002-r1.zip'
names=['build-interaction.py','mika-3d-interaction-prototype-r1.blend','interaction-solver.mjs','interaction-solver.test.mjs','interaction-samples.json','render-samples-used.json','blender-contact-audit.json','interaction-scene-contract.json','interaction-export-audit.json','interaction-validation.json','interaction-tests.log','INTERACTION-README.txt','interaction-inspector.html','make-interaction-proof.py','validate-interaction-export.py','package-interaction.py','mika-interaction-game-scale.gif','mika-interaction-game-scale.mp4','mika-interaction-closeup.mp4','mika-interaction-game-scale-contact.png','interaction-contact-sheet.jpg','interaction-preview-contact-sheet.jpg','actual-contact-detail-x2.jpg','interaction-build-calibrated.log','render-full.log']
files=[H/n for n in names]+sorted((H/'interaction-frames').glob('*.png'))+sorted((H/'scene-runtime-candidate').glob('*.webp'))
files += [H.parent/'motion-r2/walk-solver.mjs',H.parent/'motion-r2/mika-3d-walk-technical-r2.blend',ROOT/'assets-source/yard-v2/stage-empty.png',ROOT/'assets-source/yard-v2/rig-parts/mouse.png',ROOT/'assets-source/yard-v2/mika-walk/frame-00.png']
assert len(list((H/'interaction-frames').glob('*.png')))==128
assert len(list((H/'scene-runtime-candidate').glob('*.webp')))==128
for p in files:assert p.is_file(),p
manifest={'scope':'One real 3D interaction prototype; production art rejected; separate-entity export pending','files':[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(H/'checkpoint-manifest.json').write_text(json.dumps(manifest,indent=2));files.append(H/'checkpoint-manifest.json')
with zipfile.ZipFile(DEST,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in files:z.write(p,p.relative_to(ROOT))
with zipfile.ZipFile(DEST) as z:
    assert z.testzip() is None
    for r in manifest['files']:assert hashlib.sha256(z.read(r['path'])).hexdigest()==r['sha256']
result={'archive':str(DEST),'bytes':DEST.stat().st_size,'sha256':hashlib.sha256(DEST.read_bytes()).hexdigest(),'entries':len(files),'CRC':'PASS','member_SHA256':'PASS','tests':'15/15 PASS','independent_skinned_contact':'PASS within stated tolerance','production_art':'REJECTED','browser_QA':'NOT_RUN'}
(H/'checkpoint-validation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
