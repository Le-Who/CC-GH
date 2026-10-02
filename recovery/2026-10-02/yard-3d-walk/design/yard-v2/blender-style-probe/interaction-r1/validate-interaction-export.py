from pathlib import Path
from PIL import Image
import json, math, hashlib
h=Path(__file__).resolve().parent
a=json.loads((h/'blender-contact-audit.json').read_text())
s=json.loads((h/'render-samples-used.json').read_text())
assert hashlib.sha256((h/'render-samples-used.json').read_bytes()).hexdigest()==a['input_sha256']
assert len(a['samples'])==128
edge=[]
for f in range(1,129):
    im=Image.open(h/f'interaction-frames/frame-{f:03}.png')
    assert im.size==(512,320)
    box=im.getchannel('A').point(lambda p:255 if p>=128 else 0).getbbox()
    if box[0]<2 or box[1]<2 or box[2]>510 or box[3]>318:
        edge.append((f,box))
assert not edge,edge
mx=0
for prev,cur in zip(a['samples'],a['samples'][1:]):
    for k,l in cur['limbs'].items():
        if l['contact'] and prev['limbs'][k]['contact']:
            mx=max(mx,math.dist(l['sole_centroid_world'],prev['limbs'][k]['sole_centroid_world']))
assert all(not any(p['groundPawToyTriangleOverlaps'].values()) for p in a['samples'])
contact=[a['samples'][i-1]['actualPawToyUpperSurfaceClearance']['world_z_gap'] for i in [68,69,70,71]]
assert max(abs(x) for x in contact)<.003
result={
    'input_sha256':a['input_sha256'],
    'rendered_frames':128,
    'alpha_clip_edges':'PASS',
    'bone_endpoint_max_world_error':a['max_bone_endpoint_error'],
    'adjacent_grounded_sole_max_world_drift':mx,
    'tap_press_surface_gaps_world':contact,
    'grounded_paw_toy_triangle_overlap_frames':0,
    'actual_interaction_contact':'PASS at authored tap/press frames within .003 world tolerance',
    'important_limit':'Grounded paw collision and acting paw surface queries only; not general whole-body collision physics',
    'production_art':'REJECTED',
    'browser_qa':'NOT_RUN'
}
(h/'interaction-validation.json').write_text(json.dumps(result,indent=2))
print(json.dumps(result,indent=2))
