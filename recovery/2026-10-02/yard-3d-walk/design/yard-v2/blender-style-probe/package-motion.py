from pathlib import Path
import json,hashlib,zipfile
from PIL import Image
H=Path(__file__).resolve().parent;ROOT=H.parents[2];DEST=ROOT.parent/'cc-gh-yard-3d-walk-technical-20261002-r1.zip'
N=['build-mika.py','mika-3d-style-r3.blend','mika-3d-still-r3.png','build-walk-rig.py','mika-3d-walk-technical-r1.blend','walk-solver.mjs','walk-solver.test.mjs','walk-samples.json','walk-scene-contract.json','blender-contact-audit.json','deformed-contact-summary.json','skin-weight-audit.json','walk-tests.log','walk-export-audit.json','WALK-README.txt','STYLE-GATE.md','walk-inspector.html','make-walk-proof.py','package-motion.py','walk-3d-technical-loop.gif','walk-3d-contact-loop.gif','walk-3d-contact-sheet.jpg','walk-3d-game-scale.mp4','walk-3d-game-scale-still.jpg','master-vs-3d-r3-actual-scale.png','courtyard-master-vs-3d-r3.jpg','rig-build-preview.log','rig-render-full.log']
files=[H/n for n in N]+sorted((H/'walk-frames').glob('*.png'))+sorted((H/'walk-runtime-candidate').glob('*.webp'))+[ROOT/'assets-source/yard-v2/stage-empty.png',ROOT/'assets-source/yard-v2/mika-walk/frame-00.png']
assert len(list((H/'walk-frames').glob('*.png')))==24
for p in files:assert p.is_file(),p
manifest={'scope':'One 3D technical walk; art rejected; natural motion not accepted','files':[{'path':str(p.relative_to(ROOT)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]}
(H/'motion-checkpoint-manifest.json').write_text(json.dumps(manifest,indent=2));files.append(H/'motion-checkpoint-manifest.json')
with zipfile.ZipFile(DEST,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for p in files:z.write(p,p.relative_to(ROOT))
with zipfile.ZipFile(DEST) as z:
 assert z.testzip() is None
 for r in manifest['files']:assert hashlib.sha256(z.read(r['path'])).hexdigest()==r['sha256']
result={'archive':str(DEST),'bytes':DEST.stat().st_size,'sha256':hashlib.sha256(DEST.read_bytes()).hexdigest(),'entries':len(files),'CRC':'PASS','all_member_SHA256':'PASS','solver_tests':'11/11 PASS','browser_QA':'NOT_RUN','production_art':'REJECTED','natural_walk':'NOT_ACCEPTED_SHORT_STRIDE_PROBE'}
(H/'motion-checkpoint-validation.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
