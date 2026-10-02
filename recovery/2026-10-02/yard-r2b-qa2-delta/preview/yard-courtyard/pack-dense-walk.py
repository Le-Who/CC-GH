from pathlib import Path
from PIL import Image
import argparse,json,math,hashlib
p=argparse.ArgumentParser();p.add_argument('--source-root',required=True);p.add_argument('--assets',required=True);a=p.parse_args();S=Path(a.source_root);A=Path(a.assets);C=S/'design/yard-v2/blender-style-probe/ground-walk-dense-r1/ground-walk-phase-contract.json';c=json.loads(C.read_text());out=A/'atlases';mediaPath=A/'runtime-media.json';m=json.loads(mediaPath.read_text());files=[]
for facing in c['facings']:
 for entry in c['entries']:
  asset=next(x for x in entry['assets']if x['facingIndex']==facing);files.append(S/asset['relativeToRepository'])
assert len(files)==112;w,h=c['projection']['canvas'];pages=[];audit=[]
for start in range(0,112,108):
 batch=files[start:start+108];cols=min(9,len(batch));im=Image.new('RGBA',(cols*w,math.ceil(len(batch)/cols)*h));margins=[]
 for i,path in enumerate(batch):
  frame=Image.open(path).convert('RGBA');assert frame.size==(w,h);b=frame.getchannel('A').getbbox();margin=min(b[0],b[1],w-b[2],h-b[3]);assert margin>=2;margins.append(margin);im.alpha_composite(frame,((i%cols)*w,(i//cols)*h))
 name=f'walk-dense-{len(pages):02}.webp';path=out/name;im.save(path,'WEBP',quality=90,method=6);page={'src':'atlases/'+name,'first':start,'count':len(batch),'cols':cols,'tileWidth':w,'tileHeight':h,'width':im.width,'height':im.height,'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()};pages.append(page);audit.append({**page,'minimumAlphaMargin':min(margins),'decodedBytes':im.width*im.height*4})
poseSha=hashlib.sha256((C.parent/c['sourcePosePack']).read_bytes()).hexdigest()
for order,facing in enumerate(c['facings']):
 old=m['walk']['facings'][str(facing)];start=order*28;end=start+28;subset=[]
 for page in pages:
  lo=max(start,page['first']);hi=min(end,page['first']+page['count'])
  if lo<hi:subset.append({**page,'first':lo-start,'count':hi-lo,'offset':lo-page['first']})
 angle=facing*math.pi/4;co=math.cos(angle);si=math.sin(angle);contacts=[]
 for e in c['entries']:
  contacts.append([[co*l['paw'][0]-si*l['paw'][1],si*l['paw'][0]+co*l['paw'][1],l['paw'][2]]for l in e['localPaws'].values()if l['contact']])
 m['walk']['facings'][str(facing)]={**old,'mode':'root-neutral-pet-nonuniform-phase','frameCount':28,'fps':None,'phaseControlled':True,'phaseSamples':c['phases'],'phaseUnits96':c['phaseNumerators'],'sourceSamplesSha256':poseSha,'baselineSamplesSha256':c['baselinePosePackSha256'],'phaseContractSha256':hashlib.sha256(C.read_bytes()).hexdigest(),'pivotPx':c['projection']['rootPivotPx'],'pages':subset,'groundContacts':contacts}
m['walk']['cardinalPhaseUnits96']=c['phaseNumerators'];m['walk']['newRenderedPhaseImages']=16;m['walk']['legacyBaselineImagesReused']=96
mouse=m['clips']['mika-mouse-r1'];mouse['durationMs']=6300;mouse['playbackFrameCount']=126;mouse['storedFrameCount']=128;mouse['canonicalEndpointFrames']=[126,127];mouse['terminalHandoff']='At6300ms exact canonical endpoint is rendered by the free-walk phase0; no unique source pose removed. Contact3350 and final toy3900 unchanged.'
mediaPath.write_text(json.dumps(m,indent=2));report={'newRealImages':16,'unchangedBaselineImages':96,'cardinalPhaseFrames':112,'phaseSamples':c['phaseNumerators'],'sourcePoseSha256':poseSha,'phaseContractSha256':hashlib.sha256(C.read_bytes()).hexdigest(),'runtimeAddedBytes':sum(x['bytes']for x in pages),'minimumAlphaMargin':min(x['minimumAlphaMargin']for x in audit),'pages':audit};(A.parent/'DENSE-ATLAS-VALIDATION.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items()if k!='pages'},indent=2))
