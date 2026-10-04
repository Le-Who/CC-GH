"""Derive closed application contracts from exact frozen deliveries; render no art.

Inputs are consumer-local directories. Original source receipts and pixels stay
unchanged. All geometry below is measured saved source data, never a sprite box.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import shutil

P = argparse.ArgumentParser()
P.add_argument('--fox-source', type=Path, required=True)
P.add_argument('--fox-media', type=Path, required=True)
P.add_argument('--turtle-delivery', type=Path, required=True)
A = P.parse_args()
ROOT = Path(__file__).resolve().parents[1]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
load = lambda p: json.loads(p.read_text(encoding='utf-8'))

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, separators=(',', ':')) + '\n', encoding='utf-8')

def verify(root, records):
    for row in records:
        p = root / row['path']
        assert p.resolve().is_relative_to(root.resolve())
        assert p.stat().st_size == row['bytes'], row['path']
        assert sha(p) == row['sha256'], row['path']

fox_files = load(A.fox_source / 'checkpoint-files.json')
verify(A.fox_source, [dict(path=p, **row) for p, row in fox_files.items()])
fox_manifest = load(A.fox_media / 'file-manifest.json')
verify(A.fox_media, fox_manifest['files'])
turtle_root = load(A.turtle_delivery / 'CONTENT-ROOT.json')
verify(A.turtle_delivery, turtle_root['files'])
# Turtle's digest hashes the published list order. The delivery's prose says
# path-sorted, but sorting again changes that frozen digest; record the caveat.
canonical = lambda v: json.dumps(v, sort_keys=True, separators=(',', ':')).encode()
assert hashlib.sha256(canonical(turtle_root['files'])).hexdigest() == turtle_root['contentRootRevision']
assert hashlib.sha256(canonical(fox_manifest['files'])).hexdigest() == fox_manifest['packageContentDigest']

motion = load(A.fox_source / 'motion-r5/fox-authored-motion-r5.json')
mesh = load(A.fox_source / 'motion-r5/fox-motion-mesh-audit-r5.json')
moon = load(A.fox_media / 'source-identities/moon-r2.json')
handoff = load(A.fox_media / 'handoff.json')
interactions = load(A.fox_media / 'interactions/runtime-media.json')['clips']

def center(points):
    return [sum(p[i] for p in points) / len(points) for i in range(3)]

def rotate(p, a):
    return [p[0]*math.cos(a)-p[1]*math.sin(a), p[0]*math.sin(a)+p[1]*math.cos(a)]

def motion_contract(actor):
    walk = motion['clips'][actor + '/walk']['rows']
    templates = {}
    for foot, poly in walk[0]['actualSoles'].items():
        anchor = center(poly)
        templates[foot] = [rotate([p[0]-anchor[0], p[1]-anchor[1]], -walk[0]['footYaws'][foot]) for p in poly]
    clips, max_error = {}, 0
    for kind, source_kind in [('hop','walk'),('left90','turn-left'),('right90','turn-right')]:
        rows = motion['clips'][actor + '/' + source_kind]['rows']
        bounds = mesh['actors'][actor]['clips'][source_kind]['rootNormalizedBounds']
        assert len(bounds) == len(rows)
        frames, body, supports = [], [], {}
        for row, measured in zip(rows, bounds):
            assert row['atMs'] == measured['atMs']
            contacts = []
            for foot in row['support']:
                poly = row['actualSoles'][foot]
                anchor = center(poly)
                yaw = row['footYaws'][foot]
                local = [rotate([p[0]-anchor[0], p[1]-anchor[1]], -yaw) for p in poly]
                error = max(math.dist(a,b) for a,b in zip(local, templates[foot]))
                max_error = max(max_error,error)
                # Source feet articulate during the stepping turn. A single
                # rigid sole/yaw template would lose measured contact geometry.
                # Preserve every evaluated support polygon without simplifying.
                contacts.append(dict(foot=foot,supportId=f'{kind}:{foot}:{row["atMs"]}',world=anchor,yaw=yaw,polygon=[[p[0],p[1]] for p in poly]))
            frames.append(dict(atMs=row['atMs'],root=row['root'],bodyYaw=row['yaw'],contacts=contacts))
            body.append(dict(atMs=row['atMs'],box=[measured['min'][0]+row['root'][0],measured['min'][1]+row['root'][1],measured['max'][0]+row['root'][0],measured['max'][1]+row['root'][1]]))
        clips[kind] = dict(durationMs=frames[-1]['atMs'],frames=frames,bodyBounds=body)
    # Only the source's canonical standing support, used by navigation guard.
    # This is not a fabricated animated rest clip and never selects pixels.
    first, bound = copy.deepcopy(clips['hop']['frames'][0]), copy.deepcopy(clips['hop']['bodyBounds'][0])
    last, end_bound = copy.deepcopy(first), copy.deepcopy(bound)
    last['atMs'] = end_bound['atMs'] = 40
    clips['rest'] = dict(durationMs=40,frames=[first,last],bodyBounds=[bound,end_bound],evidenceRole='source-canonical-standing-support-only')
    contract = dict(format='yard-authored-ground-motion/v1',id=f'{actor}-authored-ground/r2',visitorId=actor+'_fox',unitsPerWorld=8,sourceSampleMs=40,strideWorld=.28,cycleMs=1120,paddingWorld=.025,facings=[0,2,4,6],soles=templates,clips=clips,
        sourceContractSha256=sha(A.fox_source/'motion-r5/fox-authored-motion-r5.json'),sourceMeshAuditSha256=sha(A.fox_source/'motion-r5/fox-motion-mesh-audit-r5.json'),contactGeometry='measured-per-row-world-polygons',singleRigidSoleTemplateMaximumErrorWorld=max_error,runtimeReady=False)
    stride = dict(format='yard-authored-stride/v1',id=f'{actor}-authored-stride/r2',durationMs=1120,strideWorld=.28,sourceSampleMs=40,rootExtentWorld=[0,.28],frames=[dict(atMs=r['atMs'],frameIndex=i,distanceWorld=r['root'][0]) for i,r in enumerate(walk)],rootSamples=[dict(atMs=r['atMs'],distanceWorld=r['root'][0]) for r in walk],continuousRootIsDiagnosticOnly=True,runtimeReady=False)
    return contract,stride

for actor in ['willow','starlit']:
    ground,stride=motion_contract(actor)
    out=ROOT/'game-logic/yard-v2/media/foxes-r2'
    write(out/f'{actor}-ground.json',ground)
    write(out/f'{actor}-stride.json',stride)
    actor_clips={}
    for cid,raster in interactions.items():
        if raster['visitorId'] != actor+'_fox': continue
        expression=raster['activity'] in ['listen','glow']
        rel=f'expression-r7/{actor}-expression-source-r7.json' if expression else f'interaction-r6/{actor}-moon-source-r6.json'
        source=load(A.fox_source/rel)
        assert not source['overreach'] and not source['propCollisions']
        assert source['restEndpointVertexErrorWorld']==0 and source['maxPlantedSlipWorld']<1e-6
        assert len(source['rows'])==raster['frameCount']
        assert all(r['atMs']==t and math.dist(r['root'],p)<1e-7 for r,t,p in zip(source['rows'],raster['sourceTimesMs'],raster['sourceRootWorld']))
        solids=[r['worldBounds'] for r in source['rows']]
        pb=moon['conditionBounds'][raster['condition']]
        solids.append(dict(min=[pb['min'][i]+raster['propRoot'][i] for i in range(3)],max=[pb['max'][i]+raster['propRoot'][i] for i in range(3)]))
        envelope=dict(minimum=[min(b['min'][i] for b in solids)-(.025 if i<2 else 0) for i in range(3)],maximum=[max(b['max'][i] for b in solids)+(.025 if i<2 else 0) for i in range(3)])
        footprints=[];seen=set()
        for row in source['rows']:
            for foot in row['support']:
                poly=[[p[0],p[1]] for p in row['soles'][foot]]
                key=(foot,tuple(round(n,6) for p in poly for n in p))
                if key not in seen:footprints.append(dict(foot=foot,polygon=poly));seen.add(key)
        c=dict(format='yard-combined-prop-binding/v1',id=cid,revision=f'{cid}:source-contract/r2',visitorId=actor+'_fox',goodieId='moon_lamp',activityIds=[raster.get('catalogActivity',raster['activity'])],conditions=[raster['condition']],propMode='composited',staticProp=True,unitsPerWorld=8,sourceSampleMs=40,durationMs=source['durationMs'],sourceRigSha256=raster['sourceRigSha256'],sourceMotionSha256=sha(A.fox_source/'motion-r5/fox-authored-motion-r5.json'),sourceContractSha256=sha(A.fox_source/rel),intrinsicPropSha256=moon['sourceBlendSha256'],propRoot=raster['propRoot'],propBounds=dict(min=[pb['min'][i]+raster['propRoot'][i] for i in range(3)],max=[pb['max'][i]+raster['propRoot'][i] for i in range(3)]),supportedPropYaw=0,entry=dict(root=source['entryRoot'],facing=0),exit=dict(root=source['exitRoot'],facing=source['exitFacing']),restLoop={k:raster['restLoop'][k] for k in ['startMs','endMs','frames']},phases=[dict(id=p['name'],startMs=p['startMs'],endMs=p['endMs']) for p in source['phases']],requiredPhases=[p['name'] for p in source['phases']],validatedPhases=[p['name'] for p in source['phases']],geometryValidated=True,groundPaddingWorld=.025,groundFootprints=footprints,compositeEnvelope=envelope,samples=[dict(atMs=r['atMs'],root=r['root'],bodyYaw=r['bodyYaw'],phase=r['phase']) for r in source['rows']],playbackReady=False,runtimeActivated=False)
        actor_clips[cid]=c
    write(out/f'{actor}-combined.json',actor_clips)

for actor in ['basil','sage']:
    for kind in ['ground','stride','combined']:
        source=A.turtle_delivery/'source/contracts-r2'/f'{actor}-{kind}.json'
        target=ROOT/'game-logic/yard-v2/media/turtles-r2'/source.name
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(source,target)
    base=load(A.turtle_delivery/'source/contracts-r2'/f'{actor}-combined.json')
    art=load(A.turtle_delivery/'runtime'/f'{actor}-art-descriptors.json')
    identities=load(A.turtle_delivery/'handoff/SOURCE-IDENTITIES-HANDOFF-r2.json')
    variants={}
    for condition,raster in art['conditionClips'].items():
        c=copy.deepcopy(base)
        c.update(id=raster['id'],revision=f'{actor}-fountain-{condition}-source/r2',conditions=[condition],sourceRigSha256=raster['sourceRigSha256'])
        if condition!='new':
            identity=identities['actors'][actor]['conditionCompositions'][condition]
            c['intrinsicPropSha256']=identity['intrinsicPropSha256']
            c['sourceConditionContractSha256']=identity['manifest']['sha256']
        variants[c['id']]=c
    write(ROOT/'game-logic/yard-v2/media/turtles-r2'/f'{actor}-conditions.json',variants)

for source,target in [(A.fox_media,ROOT/'recovery-tools/yard-family-frozen/assets/yard-fox'),(A.turtle_delivery/'runtime',ROOT/'recovery-tools/yard-family-frozen/assets/yard-turtles')]:
    shutil.copytree(source,target,dirs_exist_ok=True)

proofdir=ROOT/'game-logic/yard-v2/media/shared-props/r2-evidence'
for source,name in [(A.fox_media/'source-identities/moon-r2.json','moon-source-identities.json'),(A.turtle_delivery/'handoff/SOURCE-IDENTITIES-HANDOFF-r2.json','fountain-source-identities.json'),(A.turtle_delivery/'source/fountain-r2/fountain-source-contract.json','fountain-source-contract.json'),(A.turtle_delivery/'source/fountain-conditions-r2/condition-source-manifest.json','fountain-condition-contract.json')]:
    proofdir.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,proofdir/name)

write(proofdir/'materialization.json',dict(format='yard-family-consumer-materialization/v1',foxRuntimeDigest=fox_manifest['packageContentDigest'],turtleContentRoot=turtle_root['contentRootRevision'],foxSourceFilesVerified=len(fox_files),foxRuntimeFilesVerified=len(fox_manifest['files']),turtleFilesVerified=len(turtle_root['files']),turtleDigestOrder='published-files-array-order',runtimeActivated=False,releaseGateOpened=False))
print(json.dumps(dict(foxSources=len(fox_files),foxRuntime=len(fox_manifest['files']),turtleFiles=len(turtle_root['files']),renderedNewPixels=0,releaseGateOpened=False)))
