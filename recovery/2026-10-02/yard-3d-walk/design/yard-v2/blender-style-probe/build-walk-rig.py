"""Technical one-cycle deformation probe for ART-REJECTED Mika R3.
Uses the local deterministic walk solver's measured paw/ankle targets.
Does not promote the style or create a production atlas.
"""
import bpy, json, math, sys
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
H=Path(__file__).resolve().parent
S=json.loads((H/'walk-samples.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(H/'mika-3d-style-r3.blend'))
scene=bpy.context.scene
# Closed curves become ordinary skinnable 3D mesh; preserve geometry and materials.
for ob in list(scene.objects):
    if ob.type=='CURVE':
        bpy.ops.object.select_all(action='DESELECT');ob.select_set(True);bpy.context.view_layer.objects.active=ob;bpy.ops.object.convert(target='MESH')
mesh_objects=[o for o in scene.objects if o.type=='MESH' and o.name!='ground shadow catcher']
armdata=bpy.data.armatures.new('Mika technical walk skeleton');arm=bpy.data.objects.new('Mika technical walk skeleton',armdata);bpy.context.collection.objects.link(arm)
bpy.context.view_layer.objects.active=arm;arm.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
def eb(name,a,b,parent=None):
    bone=armdata.edit_bones.new(name);bone.head=a;bone.tail=b
    if parent:bone.parent=armdata.edit_bones[parent]
    return bone
rest={}
def addbone(name,a,b,parent='root'):
    rest[name]=(Vector(a),Vector(b));return eb(name,a,b,parent)
eb('root',(0,0,0),(0,0,.18))
addbone('body',(-.25,0,.72),(.30,0,.72))
addbone('head',(.61,-.015,1.15),(.61,-.015,1.45),'body')
for name,chain in S['rest'].items():
    addbone(name+'_upper',chain['hip'],chain['knee'],'body')
    addbone(name+'_lower',chain['knee'],chain['ankle'],name+'_upper')
    # Paw bone rests nearly horizontal. Its desired orientation remains horizontal at stance.
    p=Vector(chain['ankle']);toe=p+Vector((.18,0,0))
    addbone(name+'_paw',p,toe,name+'_lower')
TP=[(-.91,.08,.80),(-1.19,.075,1.17),(-1.16,.04,1.52),(-1.38,.015,1.68)]
for i in range(3):addbone('tail_'+str(i),TP[i],TP[i+1],'body' if i==0 else 'tail_'+str(i-1))
bpy.ops.object.mode_set(mode='OBJECT')
for b in armdata.bones:b.use_deform=b.name!='root'

def smooth(a,b,v):
    t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
def weights_body(p):
    x,y,z=p
    front=smooth(.08,.28,x);hind=smooth(-.42,-.63,x)
    region=max(front,hind);strength=region*smooth(.71,.33,z)
    if strength<=.0001:return {'body':1}
    near=1-smooth(-.095,.095,y);far=1-near;prefix='fore' if front>=hind else 'hind'
    knee=.36 if prefix=='fore' else .44
    paw=smooth(.24,.115,z)
    lower=(1-paw)*smooth(knee+.085,knee-.075,z)
    upper=1-paw-lower
    out={'body':1-strength}
    for side,amount in [('Near',near),('Far',far)]:
        for part,w in [('upper',upper),('lower',lower),('paw',paw)]:
            if w*amount*strength>.00001:out[prefix+side+'_'+part]=w*amount*strength
    return out

def weights_tail(p):
    # Smooth distance blend around the two hinge regions; the broad tail is real volume.
    nodes=[Vector(v) for v in TP]
    distances=[]
    for i in range(3):
        a,b=nodes[i],nodes[i+1];v=b-a;t=max(0,min(1,(p-a).dot(v)/v.length_squared));distances.append((p-(a+t*v)).length)
    vals=[math.exp(-d*d/.028) for d in distances];total=sum(vals)
    if total<1e-10:return {'tail_'+str(min(range(3),key=lambda i:distances[i])):1}
    return {'tail_'+str(i):w/total for i,w in enumerate(vals) if w/total>.00001}
weight_audit={}
for ob in mesh_objects:
    is_body=ob.name.startswith('Mika compact') or ob.name.startswith('body soft')
    is_tail=ob.name.startswith('plush upright') or ob.name.startswith('tail soft')
    groups={b:ob.vertex_groups.new(name=b) for b in rest}
    total_min=1;total_max=1;unweighted=0
    for v in ob.data.vertices:
        p=ob.matrix_world@v.co
        ws=weights_body(p) if is_body else weights_tail(p) if is_tail else {'head':1}
        total=sum(ws.values());total_min=min(total_min,total);total_max=max(total_max,total)
        if total<.999:unweighted+=1
        for bone,w in ws.items():
            if w>0:groups[bone].add([v.index],w,'REPLACE')
    mod=ob.modifiers.new('actual mesh skeleton deformation','ARMATURE');mod.object=arm;mod.use_deform_preserve_volume=True
    ob.parent=arm
    weight_audit[ob.name]={'vertices':len(ob.data.vertices),'weight_sum_min':total_min,'weight_sum_max':total_max,'unweighted':unweighted,'role':'body' if is_body else 'tail' if is_tail else 'head'}

# FK matrices from exact analytic 2-bone target solutions, not separate sprite tweens.
def pose_absolute(name,start,end):
    a,b=rest[name];q=(b-a).rotation_difference(Vector(end)-Vector(start));rot=q@armdata.bones[name].matrix_local.to_quaternion()
    arm.pose.bones[name].matrix=Matrix.Translation(Vector(start))@rot.to_matrix().to_4x4()
    bpy.context.view_layer.update()
def pose_shift_rot(name,shift,rotation=None):
    a,b=rest[name];q=rotation or Quaternion((1,0,0,0));pose_absolute(name,a+Vector(shift),a+Vector(shift)+q@(b-a))
cam=scene.camera;base_cam=cam.location.copy()
for sample in S['samples']:
    frame=sample['frame'];phase=sample['phase'];bob=sample['bodyBob'];scene.frame_set(frame)
    arm.location=sample['root'];arm.keyframe_insert('location',frame=frame)
    pose_shift_rot('body',(0,0,bob))
    pose_shift_rot('head',(0,0,bob),Quaternion(Vector((0,1,0)),.018*math.sin(2*math.pi*phase)))
    for name,limb in sample['limbs'].items():
        pose_absolute(name+'_upper',limb['hip'],limb['knee'])
        pose_absolute(name+'_lower',limb['knee'],limb['ankle'])
        # Rigid paw retains the rest orientation; no skating during stance.
        a,b=rest[name+'_paw'];pose_absolute(name+'_paw',limb['ankle'],Vector(limb['ankle'])+(b-a))
    tail_start=Vector(TP[0])+Vector((0,0,bob));tail_rot=Quaternion((1,0,0,0))
    for i in range(3):
        name='tail_'+str(i);a,b=rest[name];tail_rot=tail_rot@Quaternion(Vector((1,0,0)),(.022+.006*i)*math.sin(2*math.pi*phase-i*.3))
        tail_end=tail_start+tail_rot@(b-a);pose_absolute(name,tail_start,tail_end);tail_start=tail_end
    for bone in arm.pose.bones:
        bone.rotation_mode='QUATERNION';bone.keyframe_insert('location',frame=frame);bone.keyframe_insert('rotation_quaternion',frame=frame);bone.keyframe_insert('scale',frame=frame)
    # Root distance drives both world motion and the tracking camera; exported image is a stable-pivot in-place sprite.
    cam.location=base_cam+Vector(sample['root']);cam.keyframe_insert('location',frame=frame)
for ob in (arm,cam):
    if ob.animation_data and ob.animation_data.action:
        for fc in ob.animation_data.action.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'
# Verify recorded keyframes through Blender's evaluated armature and actual sole vertices.
from bpy_extras.object_utils import world_to_camera_view
bodymesh=next(o for o in mesh_objects if o.name.startswith('Mika compact'))
sole_indices={}
for limb in S['rest']:
    gi=bodymesh.vertex_groups[limb+'_paw'].index
    sole_indices[limb]=[v.index for v in bodymesh.data.vertices if (bodymesh.matrix_world@v.co).z<.045 and any(g.group==gi and g.weight>.995 for g in v.groups)]
actual_audit=[];max_bone_error=0.0
for sample in S['samples']:
    scene.frame_set(sample['frame']);bpy.context.view_layer.update()
    dg=bpy.context.evaluated_depsgraph_get();evaluated=bodymesh.evaluated_get(dg);em=evaluated.to_mesh()
    limbs={}
    for name,limb in sample['limbs'].items():
        upper=arm.pose.bones[name+'_upper'];lower=arm.pose.bones[name+'_lower'];paw=arm.pose.bones[name+'_paw']
        errors=[(upper.head-Vector(limb['hip'])).length,(upper.tail-Vector(limb['knee'])).length,(lower.head-Vector(limb['knee'])).length,(lower.tail-Vector(limb['ankle'])).length,(paw.head-Vector(limb['ankle'])).length]
        max_bone_error=max(max_bone_error,*errors)
        pts=[evaluated.matrix_world@em.vertices[i].co for i in sole_indices[name]]
        centroid=sum(pts,Vector())/len(pts) if pts else None
        target_world=Vector(sample['root'])+Vector(limb['paw']);uv=world_to_camera_view(scene,cam,target_world)
        limbs[name]={'max_bone_endpoint_error':max(errors),'sole_vertex_count':len(pts),'sole_centroid_world':list(centroid) if centroid else None,'sole_min_world_z':min(p.z for p in pts) if pts else None,'foot_screen_384':[uv.x*384,(1-uv.y)*384],'contact':limb['contact'],'supportId':limb['supportId']}
    evaluated.to_mesh_clear();actual_audit.append({'frame':sample['frame'],'limbs':limbs})
assert max_bone_error<1e-4, f'Blender bone mismatch {max_bone_error}'
(H/'blender-contact-audit.json').write_text(json.dumps({'max_bone_endpoint_error':max_bone_error,'samples':actual_audit},indent=2))
scene.frame_start=1;scene.frame_end=len(S['samples']);scene.render.fps=S['fps']
scene.render.resolution_x=384;scene.render.resolution_y=384;scene.cycles.samples=48
scene.render.filepath=str(H/'walk-frames/frame-');scene.render.image_settings.file_format='PNG'
scene.frame_set(1);bpy.context.view_layer.update()
(H/'walk-frames').mkdir(exist_ok=True)
(H/'skin-weight-audit.json').write_text(json.dumps(weight_audit,indent=2))
contract={'style_status':'R3_ART_REJECTED','animation_status':'TECHNICAL_PROBE_PENDING_VISUAL_REVIEW','frames':len(S['samples']),'fps':S['fps'],'root_stride_world':S['stride'],'cycle_seconds':S['cycleSeconds'],'camera_tracks_root':True,'frame_pivot_constant':True,'render_size':[384,384],'samples':48,'skeleton_bones':len(armdata.bones),'real_3d_armature_deformation':True,'rest_matrices':{n:{'head':list(v[0]),'tail':list(v[1])} for n,v in rest.items()}}
(H/'walk-scene-contract.json').write_text(json.dumps(contract,indent=2))
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(H/'mika-3d-walk-technical-r1.blend'),compress=True)
# First three posture checks before the full render: contact, passing, swing.
frames=[1,5,9] if '--preview' in sys.argv else range(1,len(S['samples'])+1)
for frame in frames:
    scene.frame_set(frame);scene.render.filepath=str(H/f'walk-frames/frame-{frame:02d}.png');bpy.ops.render.render(write_still=True)
print('MIKA_WALK_TECHNICAL_RENDER_COMPLETE')
