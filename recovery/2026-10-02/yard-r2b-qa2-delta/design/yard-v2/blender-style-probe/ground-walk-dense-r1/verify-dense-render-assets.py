"""Verify actualPNG inputs and record hashes; does not create or alter images."""
from pathlib import Path
from PIL import Image
import json,hashlib
H=Path(__file__).resolve().parent;repo=H.parents[3];C=json.loads((H/'ground-walk-phase-contract.json').read_text());R=json.loads((H/'new-phases-render-contract.json').read_text());assert len(R['renderedFrames'])==16
rows=[];new=0;old=0;minimum=999
for entry in C['entries']:
 for asset in entry['assets']:
  path=repo/asset['relativeToRepository'];raw=path.read_bytes()
  with Image.open(path) as im:
   im.load();assert im.size==(210,168);assert im.mode=='RGBA';box=im.getchannel('A').getbbox();assert box;left,top,right,bottom=box;margins=[left,top,210-right,168-bottom];minimum=min(minimum,*margins)
  row={**asset,'frameIndex':entry['frameIndex'],'phaseNumerator':entry['phaseNumerator'],'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'alphaBounds':list(box),'alphaMargins':margins};rows.append(row)
  if asset['baseline']:old+=1
  else:
   new+=1;render=next(f for f in R['renderedFrames'] if f['facingIndex']==asset['facingIndex'] and f['phaseNumerator']==entry['phaseNumerator']);assert render['sha256']==row['sha256']
assert new==16 and old==96;assert minimum>=2
out={'status':'PASS_ACTUAL_PNG_INTEGRITY_ALPHA_BOUNDS','existingPNGReused':old,'newGenuineBlenderPNG':new,'imagesInterpolated':0,'canvas':[210,168],'minimumAlphaMargin':minimum,'newPNGBytes':sum(r['bytes'] for r in rows if not r['baseline']),'sourcePosePackSha256':C['sourcePosePackSha256'],'renderContractSha256':hashlib.sha256((H/'new-phases-render-contract.json').read_bytes()).hexdigest(),'rows':rows,'limits':'Checks files, originalRGBA dimensions, hashes and alpha margins. Visual review and browser runtime behavior remain separate.'};(H/'dense-assets-audit.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({k:v for k,v in out.items() if k!='rows'}))
