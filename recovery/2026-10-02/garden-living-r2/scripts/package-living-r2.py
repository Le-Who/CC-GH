from pathlib import Path
import json,shutil,hashlib,zipfile
r=Path(__file__).resolve().parents[1];p=r/'game-preview';dest=Path('/workspace/scratch/29f38c39d215/garden-living-r2-delivery');dest.mkdir(exist_ok=True)
validation={'status':'LOCAL_CHECKS_PASS_BROWSER_PENDING','previewVersion':'garden-v2-20261002-living-r2','nodeTests':35,'collectorAdditionalNodeTests':6,'pythonLauncherTests':4,'pythonOverlayGuardTests':4,'assignedArtFilesDecoded':56,'quickBrowserCasesPrepared':16,'browserExecuted':False,'priorPilotBrowserResult':'12/12 Windows cases; not R2 acceptance','unrun':['WebGL context loss','missing-image fault','all56states browser art sweep','GPU/compositor timing'],'sourceBuild':'guarded recovered hf1 bundle plus equivalent source excerpts, no full repository build'}
(p/'PACKAGING-VALIDATION.json').write_text(json.dumps(validation,indent=2))
(p/'PROVENANCE.json').write_text(json.dumps({'base':'Garden hf1','version':validation['previewVersion'],'changes':['56 authored art states for14species','stage-specific leaf zones and restrained rigid plants','stronger deliberate touch/water response','care touch parity','visual state identity reset','readonly lifecycle/growth diagnostics','four new real-input QA cases'],'scope':'isolated memory preview, no production/economy changes','validation':validation},indent=2))
(p/'MANIFEST.json').write_text(json.dumps({str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(p.rglob('*')) if f.is_file() and f.name!='MANIFEST.json' and '__pycache__' not in f.parts},indent=2))
def archive(source,out,select):
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,6) as z:
  for f in sorted(source.rglob('*')):
   if f.is_file() and '__pycache__' not in f.parts and select(f.relative_to(source)):z.write(f,f.relative_to(source))
 with zipfile.ZipFile(out) as z:assert z.testzip() is None
 return {'path':str(out),'bytes':out.stat().st_size,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
a=archive(p,dest/'cc-gh-garden-living-20261002-r2-preview.zip',lambda x:True)
(r/'PLAN.json').write_text(json.dumps({'status':'14species r2 packaged, user browser QA pending','artStates':56,'sourceImages':57,'unitAndStaticChecks':validation,'remaining':['actual R2 browser QA','growth pot alignment polish if visible','fallback browser tests','full hub integration later']},indent=2))
b=archive(r,dest/'garden-living-plants-source-wip-20261002-r1.zip',lambda x:x.parts[0] not in ['game-preview'] and 'motion-frames' not in x.parts and 'motion-r2-frames' not in x.parts and not x.name.endswith('-data.json'))
for name in ['garden-fourteen-plants-progress.jpg','garden-plants-motion-proof-r2.mp4']:shutil.copyfile(r/'review'/name,dest/name)
(dest/'DELIVERY-VALIDATION.json').write_text(json.dumps([a,b],indent=2));print(json.dumps([a,b],indent=2))
with zipfile.ZipFile(a['path']) as z:z.extractall(dest/'restored-preview')
