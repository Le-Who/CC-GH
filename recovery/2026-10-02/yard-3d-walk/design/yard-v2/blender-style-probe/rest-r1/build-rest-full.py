"""Evaluate true spine/limb rest transitions before rendering a long clip."""
import bpy,math,json,hashlib,sys
from pathlib import Path
from mathutils import Vector,Matrix,Quaternion
from mathutils.bvhtree import BVHTree
H=Path(__file__).resolve().parent
raw=(H/'rest-approach-full.json').read_bytes();S=json.loads(raw);(H/'rest-full-render-samples-used.json').write_bytes(raw);sha=hashlib.sha256(raw).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(H/'mika-rest-keypose-prototype-r1.blend'))
scene=bpy.context.scene;arm=bpy.data.objects['Mika technical walk skeleton'];arm.animation_data_clear();arm.location=(0,0,0)
rest={n:(b.head_local.copy(),b.tail_local.copy()) for n,b in arm.data.bones.items() if n!='root'}
F=Vector((.93,-.368,0)).normalized();U=Vector((0,0,1));TP=[rest['tail_0'][0],rest['tail_0'][1],rest['tail_1'][1],rest['tail_2'][1]]
body=bpy.data.objects['Mika compact continuous body and four paws'];head=bpy.data.objects['Mika wide kitten head'];tail=bpy.data.objects['plush upright curling tail'];bed=bpy.data.objects['rest cushion flat seat .18']
open_eyes=[o for o in scene.objects if any(o.name.startswith(n) for n in ['soft brown eyelid','cream sclera','amber iris','large warm pupil','large eye sparkle','small reflected glow'])]
closed_eyes=[o for o in scene.objects if o.name.startswith('rest closed eye line')]
for o in open_eyes+closed_eyes:o.animation_data_clear()

def basis(y,up):
    y=Vector(y).normalized();x=y.cross(Vector(up)).normalized();z=x.cross(y).normalized();return Matrix((x,y,z)).transposed()
def set_bone(name,a,b,up=None):
    ra,rb=rest[name];a=Vector(a);b=Vector(b)
    q=(basis(b-a,up)@basis(rb-ra,(0,0,1)).transposed()).to_quaternion() if up is not None else (rb-ra).rotation_difference(b-a)
    rot=q@arm.data.bones[name].matrix_local.to_quaternion();arm.pose.bones[name].matrix=Matrix.Translation(a)@rot.to_matrix().to_4x4();bpy.context.view_layer.update()
def set_head(h):
    q=(basis(h['forward'],h['up'])@basis(F,U).transposed()).to_quaternion();arm.pose.bones['head'].matrix=Matrix.Translation(Vector(h['center']))@(q@arm.data.bones['head'].matrix_local.to_quaternion()).to_matrix().to_4x4();bpy.context.view_layer.update()
for pose in S['frames']:
    f=pose['frame']+1;scene.frame_set(f);arm.location=pose['root'];arm.keyframe_insert('location',frame=f)
    for n in ['pelvis','lumbar','chest','neck']:
        b=pose['spine'][n];set_bone(n,b['head'],b['tail'],b['up'])
    set_head(pose['head'])
    for n,l in pose['limbs'].items():
        set_bone(n+'_upper',l['hip'],l['knee']);set_bone(n+'_lower',l['knee'],l['ankle']);a,b=rest[n+'_paw'];set_bone(n+'_paw',l['ankle'],Vector(l['ankle'])+Vector(l['pawForward'])*(b-a).length,[0,0,1])
    pd=arm.pose.bones['pelvis'].matrix@arm.data.bones['pelvis'].matrix_local.inverted();start=pd@TP[0];amount=pose['curlAmount']
    for i in range(3):
        n='tail_'+str(i);a,b=rest[n];straight=(pd.to_3x3()@(b-a)).normalized();wrapped=Vector([[-.59,-.39,-.65],[.05,-.975,-.22],[.85,-.48,-.06]][i]).normalized();direction=(straight*(1-amount)+wrapped*amount).normalized();end=start+direction*(b-a).length;set_bone(n,start,end);start=end
    for b in arm.pose.bones:
        b.rotation_mode='QUATERNION';b.keyframe_insert('location',frame=f);b.keyframe_insert('rotation_quaternion',frame=f);b.keyframe_insert('scale',frame=f)
    shut=pose['eyeClose']>.95
    for o in open_eyes:o.hide_render=shut;o.keyframe_insert('hide_render',frame=f)
    for o in closed_eyes:o.hide_render=not shut;o.keyframe_insert('hide_render',frame=f)
for o in [arm]+open_eyes+closed_eyes:
    if o.animation_data and o.animation_data.action:
        for fc in o.animation_data.action.fcurves:
            for k in fc.keyframe_points:k.interpolation='CONSTANT' if fc.data_path=='hide_render' else 'LINEAR'
scene.camera.data.ortho_scale=5.7;scene.camera.location=Vector((-.8,0,.93))+Vector((5.66,-8,3.97));scene.camera.rotation_euler=(Vector((-.8,0,.93))-scene.camera.location).to_track_quat('-Z','Y').to_euler()
scene.render.resolution_x=640;scene.render.resolution_y=416;scene.cycles.samples=32;scene.render.fps=S['fps'];scene.frame_start=1;scene.frame_end=len(S['frames'])
# Cushion upper surface is fixed. Flat seat fast path is safely inside its polygon.
bed.data.calc_loop_triangles();bv=BVHTree.FromPolygons([bed.matrix_world@v.co for v in bed.data.vertices],[tuple(t.vertices) for t in bed.data.loop_triangles],all_triangles=True)
def surface(x,y):
    dx=abs(x+.1)-.75;dy=abs(y)-.50;sdf=math.hypot(max(dx,0),max(dy,0))+min(max(dx,dy),0)-.40
    if sdf<-.003:return .18
    hit,n,idx,dist=bv.ray_cast(Vector((x,y,3)),Vector((0,0,-1)),4)
    return hit.z if hit is not None else 0.0
sole={}
for name in ['foreNear','foreFar','hindNear','hindFar']:
    gi=body.vertex_groups[name+'_paw'].index
    sole[name]=[v.index for v in body.data.vertices if v.co.z<.16 and any(g.group==gi and g.weight>.995 for g in v.groups)]
rows=[];maxerr=0;prev=None;maxdrift=0;penetrations=[]
for pose in S['frames']:
    f=pose['frame']+1;scene.frame_set(f);bpy.context.view_layer.update();dg=bpy.context.evaluated_depsgraph_get();rec={'frame':f,'timeSeconds':pose['timeSeconds'],'phaseName':pose['phaseName'],'curlAmount':pose['curlAmount'],'limbs':{},'skinFloor':{}}
    for name,b in pose['spine'].items():maxerr=max(maxerr,(arm.pose.bones[name].head-Vector(b['head'])).length,(arm.pose.bones[name].tail-Vector(b['tail'])).length)
    for label,ob in [('body',body),('head',head),('tail',tail)]:
        ev=ob.evaluated_get(dg);me=ev.to_mesh();verts=[ev.matrix_world@v.co for v in me.vertices]
        low=[(v.z-surface(v.x,v.y),i,v) for i,v in enumerate(verts) if v.z<=.25]
        if low:
            gap,idx,p=min(low,key=lambda a:a[0]);rec['skinFloor'][label]={'minimumGap':gap,'vertexIndex':idx,'world':list(p)}
            if gap<-.003:penetrations.append({'frame':f,'mesh':label,'gap':gap,'vertexIndex':idx,'world':list(p)})
        else:rec['skinFloor'][label]={'clearAboveMaximumCushionSurface':True,'lowestWorldZ':min(v.z for v in verts)}
        if label=='body':
            for name,l in pose['limbs'].items():
                pts=[verts[i] for i in sole[name]];cent=sum(pts,Vector())/len(pts);pb=arm.pose.bones[name+'_paw'];maxerr=max(maxerr,(arm.pose.bones[name+'_upper'].head-Vector(l['hip'])).length,(arm.pose.bones[name+'_upper'].tail-Vector(l['knee'])).length,(arm.pose.bones[name+'_lower'].tail-Vector(l['ankle'])).length)
                rec['limbs'][name]={'contact':l['contact'],'supportId':l['supportId'],'centroid':list(cent),'soleVertexCount':len(pts),'pawForward':l['pawForward']}
                if prev and l['contact'] and prev['limbs'][name]['contact']:
                    maxdrift=max(maxdrift,(cent-Vector(prev['limbs'][name]['centroid'])).length)
        ev.to_mesh_clear()
    rows.append(rec);prev=rec
assert maxerr<1e-4,maxerr
report={'inputSha256':sha,'frames':len(rows),'maximumBoneEndpointError':maxerr,'maximumAdjacentPlantedSoleDrift':maxdrift,'penetrationCount':len(penetrations),'penetrations':penetrations,'rows':rows,'status':'FAIL_SKIN_FLOOR' if penetrations else 'NUMERIC_SKIN_FLOOR_PASS_VISUAL_REVIEW_PENDING','limits':'Primary solid body/head/tail against actual cushion surface. Decorative fibre wisps are excluded; not a general self-collision test.'}
(H/'rest-full-skin-audit.json').write_text(json.dumps(report,indent=2));print('AUDIT',json.dumps({k:v for k,v in report.items() if k not in ['rows','penetrations']}))
(H/'rest-full-frames').mkdir(exist_ok=True);scene.frame_set(1);bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(H/'mika-rest-full-prototype-r1.blend'),compress=True)
selected=[1,41,61,91,119,143,167,191,203,263] if '--preview' in sys.argv else ([] if '--audit' in sys.argv else range(1,len(rows)+1))
for f in selected:
    scene.frame_set(f);scene.render.filepath=str(H/f'rest-full-frames/frame-{f:03}.png');bpy.ops.render.render(write_still=True)
