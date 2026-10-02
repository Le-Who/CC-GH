"""Bake corrected-rest-rig ground walk and exact departure handoff. No renders.
All saved armatures have root translation extracted; yaw is baked per facing block.
"""
import bpy,json,math,hashlib
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
H=Path(__file__).resolve().parent;REST=H.parent/'rest-r1';source=REST/'mika-rest-keypose-prototype-r1.blend'
D=Vector((5.66,-8,3.97)).normalized();R=Vector((-D.y,D.x,0)).normalized();U=D.cross(R).normalized();pivot=[210,168+80*U.z]
reports={}
for mode,filename,outputname in [('dense','ground-walk-dense-poses.json','mika-ground-walk-dense-r1.blend')]:
 raw=(H/filename).read_bytes();P=json.loads(raw);bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;arm=bpy.data.objects['Mika technical walk skeleton'];arm.animation_data_clear();arm.location=(0,0,0);arm.rotation_euler=(0,0,0);scene.camera.animation_data_clear()
 for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
 for o in scene.objects:
  if 'cushion' in o.name:o.hide_render=True
  if o.name.startswith('rest upper eyelid') or o.name.startswith('rest closed eye line'):o.animation_data_clear();o.hide_render=True
  if any(o.name.startswith(n) for n in ['soft brown eyelid','cream sclera','amber iris','large warm pupil','large eye sparkle','small reflected glow']):o.animation_data_clear();o.hide_render=False
 rest={n:(b.head_local.copy(),b.tail_local.copy()) for n,b in arm.data.bones.items() if n!='root'};TP=[rest['tail_0'][0],rest['tail_0'][1],rest['tail_1'][1],rest['tail_2'][1]]
 F=Vector((.93,-.368,0)).normalized();UP=Vector((0,0,1))
 def basis(y,up):
  y=Vector(y).normalized();x=y.cross(Vector(up)).normalized();z=x.cross(y).normalized();return Matrix((x,y,z)).transposed()
 def bone(name,a,b,up=None):
  a,b=Vector(a),Vector(b);ra,rb=rest[name];q=(basis(b-a,up)@basis(rb-ra,(0,0,1)).transposed()).to_quaternion() if up else (rb-ra).rotation_difference(b-a)
  arm.pose.bones[name].matrix=Matrix.Translation(a)@(q@arm.data.bones[name].matrix_local.to_quaternion()).to_matrix().to_4x4();bpy.context.view_layer.update()
 def apply_pose(pose):
  for n,p in pose['spine'].items():bone(n,p['head'],p['tail'],p['up'])
  h=pose['head'];q=(basis(h['forward'],h['up'])@basis(F,UP).transposed()).to_quaternion();arm.pose.bones['head'].matrix=Matrix.Translation(Vector(h['center']))@(q@arm.data.bones['head'].matrix_local.to_quaternion()).to_matrix().to_4x4();bpy.context.view_layer.update()
  for n,l in pose['limbs'].items():
   bone(n+'_upper',l['hip'],l['knee']);bone(n+'_lower',l['knee'],l['ankle']);a,b=rest[n+'_paw'];bone(n+'_paw',l['ankle'],Vector(l['ankle'])+(b-a))
  shift=Vector((0,0,pose['bodyBob']));start=TP[0]+shift;q=Quaternion((1,0,0,0));phase=pose['phase'];weight=pose.get('tailSwayWeight',1)
  for i in range(3):
   n='tail_'+str(i);a,b=rest[n];q=q@Quaternion(Vector((1,0,0)),(.033+.008*i)*math.sin(2*math.pi*phase-i*.3)*weight);end=start+q@(b-a);bone(n,start,end);start=end
 facings=P.get('facings',[{'id':'yaw000','yawRadians':0}]);baked=[]
 for facing in facings:
  for pose in P['frames']:
   f=len(baked)+1;scene.frame_set(f);arm.location=(0,0,0);arm.rotation_euler=(0,0,facing['yawRadians']);arm.keyframe_insert('location',frame=f);arm.keyframe_insert('rotation_euler',frame=f);apply_pose(pose)
   for b in arm.pose.bones:
    b.rotation_mode='QUATERNION';b.keyframe_insert('location',frame=f);b.keyframe_insert('rotation_quaternion',frame=f);b.keyframe_insert('scale',frame=f)
   baked.append({'blenderFrame':f,'facing':facing['id'],'yaw':facing['yawRadians'],'pose':pose})
 if arm.animation_data and arm.animation_data.action:
  for fc in arm.animation_data.action.fcurves:
   for k in fc.keyframe_points:k.interpolation='CONSTANT'
 cam=scene.camera;target=Vector((0,0,.8));cam.location=target+Vector((5.66,-8,3.97));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=4.2
 scene.render.resolution_x=420;scene.render.resolution_y=336;scene.render.resolution_percentage=100;scene.render.film_transparent=True;scene.render.fps=20;scene.frame_start=1;scene.frame_end=len(baked)
 body=bpy.data.objects['Mika compact continuous body and four paws'];head=bpy.data.objects['Mika wide kitten head'];tail=bpy.data.objects['plush upright curling tail']
 sole={}
 for n in ['foreNear','foreFar','hindNear','hindFar']:
  gi=body.vertex_groups[n+'_paw'].index;sole[n]=[v.index for v in body.data.vertices if v.co.z<.16 and any(g.group==gi and g.weight>.995 for g in v.groups)]
 maxerr=0;maxdrift=0;minz=math.inf;rows=[];prior={};bounds={'min':[math.inf,math.inf],'max':[-math.inf,-math.inf]};fail=[]
 for entry in baked:
  f=entry['blenderFrame'];pose=entry['pose'];scene.frame_set(f);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();rec={'blenderFrame':f,'facing':entry['facing'],'sourceFrame':pose['frame'],'skinFloor':{},'limbs':{}}
  for n,l in pose['limbs'].items():
   for seg,a,b in [('upper','hip','knee'),('lower','knee','ankle')]:maxerr=max(maxerr,(arm.pose.bones[n+'_'+seg].head-Vector(l[a])).length,(arm.pose.bones[n+'_'+seg].tail-Vector(l[b])).length)
  for n,p in pose['spine'].items():maxerr=max(maxerr,(arm.pose.bones[n].head-Vector(p['head'])).length,(arm.pose.bones[n].tail-Vector(p['tail'])).length)
  motion=Vector(pose.get('motionRoot',pose['root']));yaw=Quaternion(Vector((0,0,1)),entry['yaw']);motion=yaw@motion
  for label,o in [('body',body),('head',head),('tail',tail)]:
   ev=o.evaluated_get(dg);me=ev.to_mesh();v=[ev.matrix_world@x.co for x in me.vertices];z=min(x.z for x in v);minz=min(minz,z);rec['skinFloor'][label]=z
   if z<-.003:fail.append({'frame':f,'mesh':label,'minWorldZ':z})
   if label=='body':
    for n,l in pose['limbs'].items():
     center=sum((v[i] for i in sole[n]),Vector())/len(sole[n])+motion;rec['limbs'][n]={'contact':l['contact'],'supportId':l['supportId'],'motionWorldSoleCentroid':list(center)}
     key=(entry['facing'],n)
     if l['contact'] and key in prior and prior[key]['contact'] and prior[key]['supportId']==l['supportId']:maxdrift=max(maxdrift,(center-Vector(prior[key]['motionWorldSoleCentroid'])).length)
     prior[key]=rec['limbs'][n]
   ev.to_mesh_clear()
  for o in scene.objects:
   if o.hide_render or o.type!='MESH' or o.parent!=arm:continue
   ev=o.evaluated_get(dg)
   for corner in ev.bound_box:
    p=ev.matrix_world@Vector(corner);xy=(pivot[0]+100*R.dot(p),pivot[1]-100*U.dot(p))
    for i in range(2):bounds['min'][i]=min(bounds['min'][i],xy[i]);bounds['max'][i]=max(bounds['max'][i],xy[i])
  rows.append(rec)
 wrapDrift=0
 for facing in facings:
  r=[x for x in rows if x['facing']==facing['id']];first,last=r[0],r[-1];delta=Quaternion(Vector((0,0,1)),facing['yawRadians'])@Vector((.64,0,0))
  for n in sole:
   a,b=last['limbs'][n],first['limbs'][n]
   if a['contact'] and b['contact'] and int(a['supportId'].split(':')[-1])==int(b['supportId'].split(':')[-1])+1:wrapDrift=max(wrapDrift,(Vector(a['motionWorldSoleCentroid'])-Vector(b['motionWorldSoleCentroid'])-delta).length)
 report={'status':'PASS_NUMERIC_SKIN_NO_RENDER' if not fail and maxerr<1e-4 and maxdrift<1e-5 and wrapDrift<1e-5 else 'FAIL','visualStyleStatus':'REJECTED','renders':0,'sourceSamplesSha256':hashlib.sha256(raw).hexdigest(),'sourceRigSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
  'posesPerFacing':len(P['frames']),'facings':len(facings),'bakedFrames':len(baked),'maximumBoneEndpointError':maxerr,'maximumMotionWorldPlantedSoleDrift':maxdrift,'maximumWrapMotionWorldPlantedSoleDrift':wrapDrift,'minimumSolidWorldZ':minz,'solidFloorPenetrationCount':len(fail),'penetrations':fail,
  'conservativeProjectedObjectBoundsPx':bounds,'canvas':[420,336],'rootPivotPx':pivot,'worldPixels':100,'rootMotionExtracted':True,'limits':'Actual primary evaluated solid floor and rigid sole drift; object AABB projected bounds include wisps but are conservative, not alpha render QA.','rows':rows}
 (H/f'{mode}-skin-audit.json').write_text(json.dumps(report,indent=2)+'\n');scene.frame_set(1);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(H/outputname),compress=True);reports[mode]={k:v for k,v in report.items() if k not in ['rows','penetrations']};print('GROUND_AUDIT',mode,json.dumps(reports[mode]),flush=True)
(H/'ground-walk-dense-build-audit.json').write_text(json.dumps(reports,indent=2)+'\n');print('GROUND_WALK_DENSE_BUILD_DONE_NO_RENDERS',flush=True)
if reports['dense']['status']=='FAIL':raise RuntimeError('Dense walk skin gate failed')
