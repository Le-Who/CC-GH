"""Art-unapproved Mika: real multi-segment spine/pelvis rest-pose gate."""
import bpy,math,json,sys
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
H=Path(__file__).resolve().parent
S=json.loads((H/'rest-keyposes.json').read_text())
bpy.ops.wm.open_mainfile(filepath=str(H.parent/'motion-r2/mika-3d-walk-technical-r2.blend'))
scene=bpy.context.scene;arm=bpy.data.objects['Mika technical walk skeleton'];arm.animation_data_clear();scene.camera.animation_data_clear();arm.location=(0,0,0)
for b in arm.pose.bones:b.matrix_basis=Matrix.Identity(4)
scene.frame_set(1);bpy.context.view_layer.update()
body=bpy.data.objects['Mika compact continuous body and four paws'];headmesh=bpy.data.objects['Mika wide kitten head'];tailmesh=bpy.data.objects['plush upright curling tail']
bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='EDIT')
for name,part in S['restSpine'].items():
    b=arm.data.edit_bones.new(name);b.head=part['head'];b.tail=part['tail'];b.parent=arm.data.edit_bones['root' if name=='pelvis' else {'lumbar':'pelvis','chest':'lumbar','neck':'chest'}[name]]
for name in ['foreNear','foreFar']:arm.data.edit_bones[name+'_upper'].parent=arm.data.edit_bones['chest']
for name in ['hindNear','hindFar']:arm.data.edit_bones[name+'_upper'].parent=arm.data.edit_bones['pelvis']
arm.data.edit_bones['head'].parent=arm.data.edit_bones['neck'];arm.data.edit_bones['tail_0'].parent=arm.data.edit_bones['pelvis']
bpy.ops.object.mode_set(mode='OBJECT');arm.data.bones['body'].use_deform=False
rest={n:(b.head_local.copy(),b.tail_local.copy()) for n,b in arm.data.bones.items() if n!='root'}
def smooth(a,b,v):
    t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
def spine_weights(p):
    x,y,z=p
    if x<-.605:ws={'pelvis':1}
    elif x<-.245:
        q=smooth(-.605,-.245,x);ws={'pelvis':1-q,'lumbar':q}
    elif x<.13:
        q=smooth(-.245,.13,x);ws={'lumbar':1-q,'chest':q}
    else:ws={'chest':1}
    neck=.65*smooth(.20,.58,x)*smooth(.83,1.08,z)
    ws={k:w*(1-neck) for k,w in ws.items()};ws['neck']=neck
    return ws
skin_audit={}
for ob in [body,bpy.data.objects['body soft silhouette wisps']]:
    # Complete lower paw must be rigid in its own frame. The old x-region blend
    # incorrectly gave the rear toe ~47% pelvis weight and pulled it into the pad.
    corrected=0
    for v in ob.data.vertices:
        p=ob.matrix_world@v.co
        family='hind' if p.x<-.35 else ('fore' if p.x>.25 else None)
        if family is None or abs(p.y)<.07 or p.z>=.245:continue
        amount=1-smooth(.16,.245,p.z)
        if amount<=0:continue
        target=ob.vertex_groups[family+('Near' if p.y<0 else 'Far')+'_paw']
        original={g.group:g.weight for g in v.groups}
        for gi,w in original.items():ob.vertex_groups[gi].add([v.index],w*(1-amount),'REPLACE')
        target.add([v.index],original.get(target.index,0)*(1-amount)+amount,'REPLACE')
        corrected+=1
    old=ob.vertex_groups['body'];gi=old.index
    weights={v.index:next((g.weight for g in v.groups if g.group==gi),0) for v in ob.data.vertices}
    groups={n:ob.vertex_groups.new(name=n) for n in S['restSpine']}
    for v in ob.data.vertices:
        w=weights[v.index]
        if w<=0:continue
        for n,a in spine_weights(ob.matrix_world@v.co).items():
            if a>0:groups[n].add([v.index],a*w,'REPLACE')
    ob.vertex_groups.remove(old)
    skin_audit[ob.name]={'vertices':len(ob.data.vertices),'spine_groups':list(groups),'old_body_group_removed':True,'paw_contact_vertices_reweighted':corrected}

# Actual eyelid surface shape keys. The body is never scaled to fake sleep.
HEAD=Vector((.61,-.015,1.15));F=Vector((.93,-.368,0)).normalized();R=Vector((.368,.93,0)).normalized();U=Vector((0,0,1));Q=Matrix((R,F,U)).transposed().to_quaternion()
def hp(x,y,z):return HEAD+R*x+F*y+U*z
def srgb(h):
    c=[int(h[i:i+2],16)/255 for i in (0,2,4)];return tuple(v/12.92 if v<=.04045 else((v+.055)/1.055)**2.4 for v in c)
cream=srgb('ffedcc');ginger=srgb('d38934');eyelids=[];lashes=[]
def bind_head(ob):
    g=ob.vertex_groups.new(name='head');g.add(list(range(len(ob.data.vertices))),1,'REPLACE');m=ob.modifiers.new('head skin binding','ARMATURE');m.object=arm;ob.parent=arm
for side in [-1,1]:
    ex=side*.252;bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=20,location=hp(ex,.474,.017));ob=bpy.context.object;ob.name='rest upper eyelid '+str(side);ob.scale=(.141,.071,.169);ob.rotation_mode='QUATERNION';ob.rotation_quaternion=Q;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    coords=[v.co.copy() for v in ob.data.vertices]
    for v in ob.data.vertices:v.co.z=.181+v.co.z*.027
    ob.shape_key_add(name='Open');closed=ob.shape_key_add(name='Close')
    for i,v in enumerate(coords):closed.data[i].co=v
    for p in ob.data.polygons:p.use_smooth=True
    ob.data.materials.append(bpy.data.materials['painted tonal fur attributes']);attr=ob.data.color_attributes.new(name='fur_color',type='FLOAT_COLOR',domain='POINT')
    for i,v in enumerate(coords):
        hx=ex+v.x;hz=.017+v.z;edge=.02+.28*math.exp(-(hx/.16)**2);t=smooth(edge-.03,edge+.03,hz);attr.data[i].color=(*[a*(1-t)+b*t for a,b in zip(cream,ginger)],1)
    bind_head(ob);eyelids.append(ob)
    c=bpy.data.curves.new('closed eyelid line','CURVE');c.dimensions='3D';c.resolution_u=12;c.bevel_depth=.004;c.bevel_resolution=2;sp=c.splines.new('BEZIER');sp.bezier_points.add(2)
    def surface_y(x,z):return .46*math.sqrt(max(.01,1-(x/.52)**2-(z/.46)**2))+.013
    for bp,co in zip(sp.bezier_points,[hp(ex-.102,surface_y(ex-.102,.025),.025),hp(ex,surface_y(ex,.004),.004),hp(ex+.102,surface_y(ex+.102,.025),.025)]):bp.co=co;bp.handle_left_type='AUTO';bp.handle_right_type='AUTO'
    line=bpy.data.objects.new('rest closed eye line '+str(side),c);bpy.context.collection.objects.link(line);c.materials.append(bpy.data.materials['soft warm eye outline']);bpy.ops.object.select_all(action='DESELECT');line.select_set(True);bpy.context.view_layer.objects.active=line;bpy.ops.object.convert(target='MESH');bind_head(line);lashes.append(line)

# Flat-centre soft cushion: actual top z=.10, rounded fabric shoulders.
def rounded_loop(w,h,r,z,n=12):
    out=[]
    for cx,cy,start in [(w/2-r,h/2-r,0),(-w/2+r,h/2-r,90),(-w/2+r,-h/2+r,180),(w/2-r,-h/2+r,270)]:
        for j in range(n):
            a=math.radians(start+j*90/n);out.append((cx+r*math.cos(a)-.1,cy+r*math.sin(a),z))
    return out
verts=[];faces=[];loops=[(2.30,1.80,.40,.18),(2.55,2.08,.55,.235),(2.80,2.40,.70,.135),(2.60,2.20,.62,.006)]
for w,h,r,z in loops:verts.extend(rounded_loop(w,h,r,z))
N=48
faces.append(tuple(range(N)))
for ring in range(3):
    for j in range(N):faces.append((ring*N+j,ring*N+(j+1)%N,(ring+1)*N+(j+1)%N,(ring+1)*N+j))
faces.append(tuple(reversed(range(3*N,4*N))))
mesh=bpy.data.meshes.new('soft cushion flat seat geometry');mesh.from_pydata(verts,[],faces);mesh.update();cushion=bpy.data.objects.new('rest cushion flat seat .18',mesh);bpy.context.collection.objects.link(cushion)
m=bpy.data.materials.new('prototype soft sage woven cushion');m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*srgb('8fa89c'),1);p.inputs['Roughness'].default_value=.88
n=m.node_tree.nodes.new('ShaderNodeTexNoise');n.inputs['Scale'].default_value=155;b=m.node_tree.nodes.new('ShaderNodeBump');b.inputs['Strength'].default_value=.2;b.inputs['Distance'].default_value=.002;m.node_tree.links.new(n.outputs['Fac'],b.inputs['Height']);m.node_tree.links.new(b.outputs['Normal'],p.inputs['Normal']);mesh.materials.append(m)
for p in mesh.polygons:p.use_smooth=p.index not in [0,len(mesh.polygons)-1]
curve=bpy.data.curves.new('cushion seam','CURVE');curve.dimensions='3D';curve.bevel_depth=.008;curve.bevel_resolution=2;sp=curve.splines.new('POLY');pts=rounded_loop(2.68,2.25,.62,.19);sp.points.add(len(pts)-1)
for v,co in zip(sp.points,pts):v.co=(*co,1)
sp.use_cyclic_u=True;seam=bpy.data.objects.new('cushion cream stitched rim',curve);bpy.context.collection.objects.link(seam);curve.materials.append(bpy.data.materials['warm ivory soft fur'])

# Desired full body frames preserve axial roll, not just endpoint direction.
def basis(y,up):
    y=Vector(y).normalized();x=y.cross(Vector(up)).normalized();z=x.cross(y).normalized();return Matrix((x,y,z)).transposed()
def set_bone(name,a,b,up=None):
    ra,rb=rest[name];a=Vector(a);b=Vector(b)
    delta=(basis(b-a,up)@basis(rb-ra,(0,0,1)).transposed()).to_quaternion() if up is not None else (rb-ra).rotation_difference(b-a)
    rot=delta@arm.data.bones[name].matrix_local.to_quaternion();arm.pose.bones[name].matrix=Matrix.Translation(a)@rot.to_matrix().to_4x4();bpy.context.view_layer.update()
def set_head(center,forward,up):
    rot=(basis(forward,up)@basis(F,U).transposed()).to_quaternion();a,b=rest['head'];arm.pose.bones['head'].matrix=Matrix.Translation(Vector(center))@(rot@arm.data.bones['head'].matrix_local.to_quaternion()).to_matrix().to_4x4();bpy.context.view_layer.update()
TP=[rest['tail_0'][0],rest['tail_0'][1],rest['tail_1'][1],rest['tail_2'][1]]
cam=scene.camera;target=Vector((-.1,-.1,.80));cam.location=target+Vector((5.66,-8,3.97));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=4.2
scene.render.resolution_x=640;scene.render.resolution_y=512;scene.cycles.samples=48
(H/'keypose-frames').mkdir(exist_ok=True);audits=[]
for pi,pose in enumerate(S['poses']):
    scene.frame_set(pi+1);arm.location=pose.get('root',[0,0,0])
    for name in ['pelvis','lumbar','chest','neck']:
        p=pose['spine'][name];set_bone(name,p['head'],p['tail'],p.get('up',[0,0,1]))
    h=pose['head'];set_head(h['center'],h['forward'],h.get('up',[0,0,1]))
    for name,l in pose['limbs'].items():
        set_bone(name+'_upper',l['hip'],l['knee']);set_bone(name+'_lower',l['knee'],l['ankle']);a,b=rest[name+'_paw'];set_bone(name+'_paw',l['ankle'],Vector(l['ankle'])+Vector(l.get('pawForward',[1,0,0]))*(b-a).length,[0,0,1])
    pelvic_delta=arm.pose.bones['pelvis'].matrix@arm.data.bones['pelvis'].matrix_local.inverted();start=pelvic_delta@TP[0]
    for i in range(3):
        name='tail_'+str(i);a,b=rest[name]
        if pose['name']=='curl':direction=Vector([[-.59,-.39,-.65],[.05,-.975,-.22],[.85,-.48,-.06]][i]).normalized()
        else:direction=(pelvic_delta.to_3x3()@(b-a)).normalized()
        end=start+direction*(b-a).length;set_bone(name,start,end);start=end
    for lid in eyelids:
        lid.data.shape_keys.key_blocks['Close'].value=pose.get('eyeClose',0);lid.hide_render=True
    for ob in scene.objects:
        if any(ob.name.startswith(n) for n in ['soft brown eyelid','cream sclera','amber iris','large warm pupil','large eye sparkle','small reflected glow']):ob.hide_render=pose.get('eyeClose',0)>.95
    for l in lashes:l.hide_render=pose.get('eyeClose',0)<.98
    bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();ec=cushion.evaluated_get(dg);cm=ec.to_mesh();cm.calc_loop_triangles();bv=BVHTree.FromPolygons([ec.matrix_world@v.co for v in cm.vertices],[tuple(t.vertices) for t in cm.loop_triangles],all_triangles=True);ec.to_mesh_clear()
    rec={'pose':pose['name'],'spine_endpoint_errors':{},'mesh_surface_clearance':{}}
    for name,p in pose['spine'].items():rec['spine_endpoint_errors'][name]=max((arm.pose.bones[name].head-Vector(p['head'])).length,(arm.pose.bones[name].tail-Vector(p['tail'])).length)
    for name,ob in [('body',body),('head',headmesh),('tail',tailmesh)]:
        ev=ob.evaluated_get(dg);me=ev.to_mesh();gaps=[]
        for v in me.vertices:
            p=ev.matrix_world@v.co;hit,n,idx,dist=bv.ray_cast(Vector((p.x,p.y,3)),Vector((0,0,-1)),4)
            if hit is not None:gaps.append((p.z-hit.z,list(p),list(hit)))
        if gaps:
            gap,pv,sv=min(gaps,key=lambda x:x[0]);rec['mesh_surface_clearance'][name]={'min_world_z_gap':gap,'vertex':pv,'cushion_surface':sv}
        ev.to_mesh_clear()
    audits.append(rec);scene.render.filepath=str(H/f'keypose-frames/{pose["name"]}.png');bpy.ops.render.render(write_still=True)
(H/'rest-skin-audit.json').write_text(json.dumps({'skin':skin_audit,'poses':audits,'style':'REJECTED','status':'KEYPOSE_REVIEW_PENDING'},indent=2))
bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(H/'mika-rest-keypose-prototype-r1.blend'),compress=True)
print('REST_KEYPOSE_RENDER_COMPLETE')
