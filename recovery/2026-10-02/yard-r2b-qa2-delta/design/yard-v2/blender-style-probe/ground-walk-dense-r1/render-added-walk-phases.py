"""Render only the16 newly authored cardinal phase images; never resample oldPNG."""
import bpy,json,hashlib
from pathlib import Path
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
H=Path(__file__).resolve().parent;raw=(H/'ground-walk-dense-poses.json').read_bytes();P=json.loads(raw);audit=json.loads((H/'dense-skin-audit.json').read_text());assert audit['status']=='PASS_NUMERIC_SKIN_NO_RENDER';assert audit['sourceSamplesSha256']==hashlib.sha256(raw).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(H/'mika-ground-walk-dense-r1.blend'));s=bpy.context.scene;t=Vector((0,0,.8));s.camera.location=t+Vector((5.66,-8,3.97));s.camera.rotation_euler=(t-s.camera.location).to_track_quat('-Z','Y').to_euler();s.camera.data.ortho_scale=4.2;s.render.resolution_x=210;s.render.resolution_y=168;s.render.resolution_percentage=100;s.cycles.samples=32;s.render.film_transparent=True;s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA';out=H/'rendered';out.mkdir(exist_ok=True)
v=world_to_camera_view(s,s.camera,Vector((0,0,0)));meta={'id':'ground-walk-dense-r1-new-phases','sourceSamplesSha256':hashlib.sha256(raw).hexdigest(),'canvas':[210,168],'pivotPx':[v.x*210,(1-v.y)*168],'pixelsPerWorld':50,'cameraTarget':[0,0,.8],'cameraOffset':[5.66,-8,3.97],'cyclesSamples':32,'cyclesSeed':s.cycles.seed,'animatedSeed':s.cycles.use_animated_seed,'renderedFrames':[],'baselineFramesRendered':0}
for facing in P['facings']:
 for index in P['renderNewOnly']['tableIndices']:
  pose=P['frames'][index];f=facing['firstBlenderFrame']+index;name=f"{facing['id']}-phase-{pose['phaseNumerator']:02d}-of96.png";target=out/name
  s.frame_set(f);s.render.filepath=str(target);bpy.ops.render.render(write_still=True);meta['renderedFrames'].append({'file':name,'facingIndex':facing['facingIndex'],'phaseNumerator':pose['phaseNumerator'],'tableIndex':index,'blenderFrame':f,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()});print('DENSE_RENDERED',name,flush=True)
assert len(meta['renderedFrames'])==16
(H/'new-phases-render-contract.json').write_text(json.dumps(meta,indent=2)+'\n');print('DENSE_RENDER_DONE',len(meta['renderedFrames']),flush=True)
