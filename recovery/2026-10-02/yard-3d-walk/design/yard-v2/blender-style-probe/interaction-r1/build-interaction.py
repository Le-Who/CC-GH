"""One bounded real 3D walk-align-pawtap-walk interaction. Art unapproved.
Loads immutable R2 mesh/skin checkpoint and animates its actual bones.
"""
import bpy, math, json, sys, hashlib
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view
H=Path(__file__).resolve().parent
input_text=(H/'interaction-samples.json').read_text();S=json.loads(input_text)
(H/'render-samples-used.json').write_text(input_text)
input_sha=hashlib.sha256(input_text.encode()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(H.parent/'motion-r2/mika-3d-walk-technical-r2.blend'))
scene=bpy.context.scene;arm=bpy.data.objects['Mika technical walk skeleton'];cam=scene.camera
arm.animation_data_clear();cam.animation_data_clear();arm.location=(0,0,0)
rest={n:(b.head_local.copy(),b.tail_local.copy()) for n,b in arm.data.bones.items() if n!='root'}
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
scene.frame_set(1);bpy.context.view_layer.update()

def srgb(s):
    a=[int(s[i:i+2],16)/255 for i in (0,2,4)];return tuple(x/12.92 if x<=.04045 else((x+.055)/1.055)**2.4 for x in a)
def mat(name,c,rough=.8):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*srgb(c),1);p.inputs['Roughness'].default_value=rough;return m
mouse_gray=mat('prototype mouse warm grey wool','918b88');mouse_light=mat('prototype mouse knit highlights','aaa49d');mouse_pink=mat('prototype mouse rose wool','d8897d');mouse_black=mat('prototype mouse stitched dark eyes','251d19',.28)
# A little wool bump complements visible curved stitch geometry.
n=mouse_gray.node_tree.nodes;p=n.get('Principled BSDF');noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=105
b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.3;b.inputs['Distance'].default_value=.003;mouse_gray.node_tree.links.new(noise.outputs['Fac'],b.inputs['Height']);mouse_gray.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal'])
mouse=bpy.data.objects.new('interaction mouse root',None);bpy.context.collection.objects.link(mouse);toy_objects=[];colliders=[]
def toy_ell(name,loc,scale,material,collision=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=28,ring_count=18,location=loc);o=bpy.context.object;o.name='interaction mouse '+name;o.scale=scale
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    o.data.materials.append(material);o.parent=mouse;toy_objects.append(o)
    if collision:colliders.append(o)
    return o
def toy_curve(name,pts,r,material):
    c=bpy.data.curves.new('interaction mouse '+name,'CURVE');c.dimensions='3D';c.resolution_u=10;c.bevel_depth=r;c.bevel_resolution=2
    sp=c.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for p,co in zip(sp.bezier_points,pts):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    o=bpy.data.objects.new('interaction mouse '+name,c);bpy.context.collection.objects.link(o);c.materials.append(material);o.parent=mouse;toy_objects.append(o);return o
toy_ell('soft body',(0,0,.11),(.22,.13,.095),mouse_gray,True)
toy_ell('tapered face',(-.16,0,.092),(.128,.095,.078),mouse_gray,True)
for side in (-1,1):
    toy_ell('ear wool',( -.09,side*.097,.181),(.070,.022,.058),mouse_gray,True)
    toy_ell('ear pink inset',(-.104,side*.097-.009,.183),(.052,.020,.044),mouse_pink)
    toy_ell('eye',(-.205,side*.080,.131),(.014,.013,.017),mouse_black)
    toy_ell('tiny foot',(.06,side*.100,.027),(.045,.035,.027),mouse_gray)
toy_ell('pink nose',(-.274,0,.09),(.027,.028,.028),mouse_pink,True)
for strand in range(2):
    pts=[]
    for i in range(17):
        t=i/16;pts.append((.19+.31*t,.006*math.sin(t*5*math.pi+strand*math.pi)+.025*math.sin(t*math.pi),.045+.020*math.cos(t*5*math.pi+strand*math.pi)+.035*t))
    toy_curve('twisted rose tail',pts,.009,mouse_pink)
# Short paired V-stitches lie on the actual body ellipsoid.
for row in range(8):
    x=-.145+row*.043;rad=math.sqrt(max(0,1-(x/.22)**2))
    for col in range(8):
        theta=.18+col*(math.pi-.36)/7
        pts=[]
        for dx,dt in [(-.013,-.08),(0,0),(.013,-.08)]:
            xx=x+dx;rr=math.sqrt(max(0,1-(xx/.22)**2));th=theta+dt
            pts.append((xx,.131*rr*math.cos(th),.11+.096*rr*math.sin(th)))
        toy_curve('visible yarn stitch',pts,.0026,mouse_light)

def pose_absolute(name,start,end):
    a,b=rest[name];q=(b-a).rotation_difference(Vector(end)-Vector(start));rot=q@arm.data.bones[name].matrix_local.to_quaternion()
    arm.pose.bones[name].matrix=Matrix.Translation(Vector(start))@rot.to_matrix().to_4x4();bpy.context.view_layer.update()
def shift_rot(name,shift,q=None):
    a,b=rest[name];q=q or Quaternion((1,0,0,0));pose_absolute(name,a+Vector(shift),a+Vector(shift)+q@(b-a))
TP=[rest['tail_0'][0],rest['tail_0'][1],rest['tail_1'][1],rest['tail_2'][1]]
for sample in S['samples']:
    f=sample['frame'];scene.frame_set(f);arm.location=sample['root'];arm.keyframe_insert('location',frame=f)
    shift=Vector(sample.get('bodyShift',[0,0,sample.get('bodyBob',0)]));att=sample.get('attention',0);phase=sample.get('phase',0)
    shift_rot('body',shift)
    headrot=Quaternion(Vector((0,0,1)),.045*att)@Quaternion(Vector((0,1,0)),.18*att+.025*math.sin(2*math.pi*phase)*(1-att))
    shift_rot('head',shift,headrot)
    for name,l in sample['limbs'].items():
        pose_absolute(name+'_upper',l['hip'],l['knee']);pose_absolute(name+'_lower',l['knee'],l['ankle']);a,b=rest[name+'_paw'];pose_absolute(name+'_paw',l['ankle'],Vector(l['ankle'])+(b-a))
    st=TP[0]+shift;q=Quaternion((1,0,0,0))
    for i in range(3):
        n='tail_'+str(i);a,b=rest[n];q=q@Quaternion(Vector((1,0,0)),(.033+.008*i)*math.sin(2*math.pi*phase-i*.3)*(1-.5*att));en=st+q@(b-a);pose_absolute(n,st,en);st=en
    for b in arm.pose.bones:
        b.rotation_mode='QUATERNION';b.keyframe_insert('location',frame=f);b.keyframe_insert('rotation_quaternion',frame=f);b.keyframe_insert('scale',frame=f)
    mo=sample['mouse'];center=mo['worldCenter'];mouse.location=(center[0],center[1],0);compression=mo.get('compression',1);mouse.scale=(1+(1-compression)*.20,1+(1-compression)*.12,compression);mouse.rotation_euler[2]=mo.get('rotationZ',0)
    for prop in ['location','scale','rotation_euler']:mouse.keyframe_insert(prop,frame=f)
for o in [arm,mouse]:
    if o.animation_data and o.animation_data.action:
        for fc in o.animation_data.action.fcurves:
            for k in fc.keyframe_points:k.interpolation='LINEAR'
# Fixed game-camera angle and fixed world view for this multi-object contact proof.
cam.location=(6.30,-8.0,4.90);target=Vector((.64,0,.93));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=5.6
scene.render.resolution_x=512;scene.render.resolution_y=320;scene.render.resolution_percentage=100;scene.cycles.samples=32
scene.frame_start=1;scene.frame_end=len(S['samples']);scene.render.fps=S['fps'];scene.render.film_transparent=True
# Inspect actual skinned soles, exact bone endpoints and the toy's real upper surfaces.
body=bpy.data.objects['Mika compact continuous body and four paws'];sole={};paw_vertices={}
for name in S['rest']:
    gi=body.vertex_groups[name+'_paw'].index
    sole[name]=[v.index for v in body.data.vertices if v.co.z<.045 and any(g.group==gi and g.weight>.995 for g in v.groups)]
    paw_vertices[name]=[v.index for v in body.data.vertices if v.co.z<.18 and any(g.group==gi and g.weight>.995 for g in v.groups)]
audit=[];max_error=0
for sample in S['samples']:
    scene.frame_set(sample['frame']);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();ev=body.evaluated_get(dg);me=ev.to_mesh();rec={'frame':sample['frame'],'time':sample.get('timeSeconds',sample.get('time',sample.get('t',0))),'phaseName':sample.get('phaseName'),'limbs':{}}
    for name,l in sample['limbs'].items():
        u=arm.pose.bones[name+'_upper'];lo=arm.pose.bones[name+'_lower'];pa=arm.pose.bones[name+'_paw'];errors=[(u.head-Vector(l['hip'])).length,(u.tail-Vector(l['knee'])).length,(lo.tail-Vector(l['ankle'])).length,(pa.head-Vector(l['ankle'])).length];max_error=max(max_error,*errors)
        pts=[ev.matrix_world@me.vertices[i].co for i in sole[name]];ct=sum(pts,Vector())/len(pts);uv=world_to_camera_view(scene,cam,Vector(l['worldPaw']))
        rec['limbs'][name]={'contact':l['contact'],'supportId':l['supportId'],'sole_centroid_world':list(ct),'sole_min_world_z':min(p.z for p in pts),'max_bone_error':max(errors),'foot_screen':[uv.x*512,(1-uv.y)*320]}
    # Ray casting against actual toy meshes is independent of the authored contact socket.
    if True:
        vv=[];ff=[]
        for ob in colliders:
            eo=ob.evaluated_get(dg);mesh=eo.to_mesh();mesh.calc_loop_triangles();off=len(vv);vv.extend([eo.matrix_world@v.co for v in mesh.vertices]);ff.extend([tuple(off+i for i in tri.vertices) for tri in mesh.loop_triangles]);eo.to_mesh_clear()
        bv=BVHTree.FromPolygons(vv,ff,all_triangles=True);clear=[]
        for i in paw_vertices['foreNear']:
            p=ev.matrix_world@me.vertices[i].co;hit,n,idx,dist=bv.ray_cast(Vector((p.x,p.y,2)),Vector((0,0,-1)),3)
            if hit is not None:clear.append((p.z-hit.z,list(p),list(hit)))
        if clear:
            gap,pv,tv=min(clear,key=lambda x:x[0]);rec['actualPawToyUpperSurfaceClearance']={'world_z_gap':gap,'pawVertex':pv,'toySurface':tv,'overlapping_xy_samples':len(clear)}
        me.calc_loop_triangles();ground_overlaps={}
        for name,l in sample['limbs'].items():
            if not l['contact']:continue
            inds=set(paw_vertices[name]);tris=[tuple(t.vertices) for t in me.loop_triangles if all(i in inds for i in t.vertices)]
            if tris:
                verts=[ev.matrix_world@v.co for v in me.vertices]
                pb=BVHTree.FromPolygons(verts,tris,all_triangles=True);ground_overlaps[name]=len(pb.overlap(bv))
        rec['groundPawToyTriangleOverlaps']=ground_overlaps
    ev.to_mesh_clear();audit.append(rec)
assert max_error<1e-4,max_error
(H/'blender-contact-audit.json').write_text(json.dumps({'input_sha256':input_sha,'max_bone_endpoint_error':max_error,'samples':audit},indent=2))
(H/'interaction-scene-contract.json').write_text(json.dumps({'style':'REJECTED','purpose':'bounded technical interaction','frames':len(S['samples']),'fps':S['fps'],'resolution':[512,320],'samples':32,'fixed_camera':True,'actual_3d_toy':True,'actual_mesh_contact_checked':True,'input_sha256':input_sha,'toy_reference':'assets-source/yard-v2/rig-parts/mouse.png','production_integration':False},indent=2))
(H/'interaction-frames').mkdir(exist_ok=True);scene.frame_set(1);bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(H/'mika-3d-interaction-prototype-r1.blend'),compress=True)
frames=[] if '--audit' in sys.argv else ([1,55,68,69,76,128] if '--preview' in sys.argv else range(1,len(S['samples'])+1))
for f in frames:
    scene.frame_set(f);scene.render.filepath=str(H/f'interaction-frames/frame-{f:03d}.png');bpy.ops.render.render(write_still=True)
print('MIKA_INTERACTION_RENDER_COMPLETE')
