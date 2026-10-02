"""Bounded Mika 3D appearance experiment. One static model, no animation claim.
Blender 4.3.2. No downloaded meshes, materials, add-ons, or external dependencies.
Run: blender -b --python build-mika.py -- [output directory]
"""
import bpy, math, random, json, sys, os
from mathutils import Vector, Matrix
from pathlib import Path
random.seed(412)
OUT=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else Path(__file__).parent
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
for block in list(bpy.data.materials): bpy.data.materials.remove(block)

def srgb(c):
    if isinstance(c,str): c=[int(c[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in c)
CREAM=srgb('ffedcc'); ORANGE=srgb('d38934'); DEEP=srgb('c77931'); PINK=srgb('e59783')
def mat(name,color,rough=.62):
    m=bpy.data.materials.new(name);m.diffuse_color=(*color,1);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*color,1);p.inputs['Roughness'].default_value=rough
    p.inputs['Subsurface Weight'].default_value=.07
    p.inputs['Subsurface Radius'].default_value=(.5,.25,.12)
    return m
cream=mat('warm ivory soft fur',CREAM); ginger=mat('golden ginger soft fur',ORANGE)
pink=mat('warm inner ear',PINK); dark=mat('soft warm eye outline',srgb('785632'),.45)
white=mat('warm eye white',srgb('fff6e7'),.28); iris=mat('amber brown iris',srgb('825022'),.25)
pupil=mat('deep brown pupil',srgb('1b110b'),.18); nose=mat('coral nose',srgb('d17b70'),.38)
glint=mat('eye glints',srgb('fff9e8'),.1)
fur=bpy.data.materials.new('painted tonal fur attributes');fur.use_nodes=True
n=fur.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=.83;p.inputs['Subsurface Weight'].default_value=.1
att=n.new('ShaderNodeAttribute');att.attribute_name='fur_color';fur.node_tree.links.new(att.outputs['Color'],p.inputs['Base Color'])
noise=n.new('ShaderNodeTexNoise');noise.inputs['Scale'].default_value=115;noise.inputs['Detail'].default_value=2
bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.06;bump.inputs['Distance'].default_value=.0015
fur.node_tree.links.new(noise.outputs['Fac'],bump.inputs['Height']);fur.node_tree.links.new(bump.outputs['Normal'],p.inputs['Normal'])

def ell(name,loc,scale,material=None,quat=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40,ring_count=24,location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale
    if quat:o.rotation_mode='QUATERNION';o.rotation_quaternion=quat
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for poly in o.data.polygons:poly.use_smooth=True
    if material:o.data.materials.append(material)
    return o

def tube(name,points,radii,material=None,sides=16):
    # Smooth organically tapering sections, not a chain of balls.
    verts=[];faces=[]
    for i,(point,radius) in enumerate(zip(points,radii)):
        p=Vector(point);t=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        t.normalize();a=t.cross(Vector((0,1,0))).normalized();b=t.cross(a).normalized()
        for j in range(sides):
            theta=2*math.pi*j/sides;v=p+radius*(a*math.cos(theta)+b*math.sin(theta));verts.append(tuple(v))
    for i in range(len(points)-1):
        for j in range(sides): faces.append((i*sides+j,i*sides+(j+1)%sides,(i+1)*sides+(j+1)%sides,(i+1)*sides+j))
    faces.append(tuple(reversed(range(sides))));faces.append(tuple((len(points)-1)*sides+j for j in range(sides)))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    o=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(o)
    for poly in mesh.polygons:poly.use_smooth=True
    if material:mesh.materials.append(material)
    sub=o.modifiers.new('soft continuous limb surface','SUBSURF');sub.levels=2
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=sub.name)
    return o

def merge_soft(name,objects,voxel=.035):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();o=bpy.context.object;o.name=name
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    mod=o.modifiers.new('joined organic silhouette','REMESH');mod.mode='VOXEL';mod.voxel_size=voxel
    bpy.ops.object.modifier_apply(modifier=mod.name)
    smooth=o.modifiers.new('soft anatomy','SMOOTH');smooth.factor=1.1;smooth.iterations=6;bpy.ops.object.modifier_apply(modifier=smooth.name)
    sub=o.modifiers.new('surface polish','SUBSURF');sub.levels=1;bpy.ops.object.modifier_apply(modifier=sub.name)
    for p in o.data.polygons:p.use_smooth=True
    return o

def mix(a,b,t):return tuple(x*(1-t)+y*t for x,y in zip(a,b))
def smoothstep(a,b,v):
    t=max(0,min(1,(v-a)/(b-a)));return t*t*(3-2*t)
def pattern(p,kind):
    x,y,z=p
    wave=.027*math.sin(24*x+19*y)+.014*math.sin(55*z-7*y)
    if kind=='ear':return ORANGE
    if kind=='body':
        edge=.72+.11*math.sin(x*2.1)+wave
        t=smoothstep(edge-.08,edge+.08,z)*(1-smoothstep(.4,.67,x))
        # Large ginger saddle, a warm white chest and legs.
        col=mix(CREAM,ORANGE,t)
        stripe=.08*(.5+.5*math.sin(22*x+5*y+2*z))**10*t
        return mix(col,DEEP,stripe)
    if kind=='head':
        q=Vector(p)-HEAD;hx=q.dot(RIGHT);hy=q.dot(FWD);hz=q.z
        blaze=.02+.28*math.exp(-(hx/.16)**2)
        t=smoothstep(blaze-.03+wave,blaze+.03+wave,hz)
        col=mix(CREAM,ORANGE,t)
        stripe=.22*(.5+.5*math.cos(30*hx+3*hz))**16*t*smoothstep(.30,.45,hz)
        return mix(col,DEEP,stripe)
    if kind=='tail':
        band=.5+.5*math.sin(z*11 + x*1.4)
        return mix(CREAM,ORANGE,smoothstep(.22,.65,band))
    return CREAM

def color_mesh(o,kind):
    o.data.materials.clear();o.data.materials.append(fur)
    a=o.data.color_attributes.new(name='fur_color',type='FLOAT_COLOR',domain='POINT')
    for v in o.data.vertices:
        p=o.matrix_world@v.co;a.data[v.index].color=(*pattern(p,kind),1)

def add_fur(o,kind,count,length=.055,width=.006):
    # Individually tapered tiny geometric fibre wisps follow the skin normal.
    # This is model geometry, not a billboard or edited master texture.
    mesh=o.data;mesh.calc_loop_triangles();tris=mesh.loop_triangles
    areas=[t.area for t in tris];chosen=random.choices(range(len(tris)),weights=areas,k=count)
    verts=[];faces=[];colors=[]
    for ti in chosen:
        tri=tris[ti];a,b,c=[mesh.vertices[j] for j in tri.vertices]
        u=random.random();v=random.random()
        if u+v>1:u=1-u;v=1-v
        p=(1-u-v)*a.co+u*b.co+v*c.co;n=((1-u-v)*a.normal+u*b.normal+v*c.normal).normalized()
        p=o.matrix_world@p;n=(o.matrix_world.to_3x3()@n).normalized()
        if kind=='head':
            q=p-HEAD
            # Keep face/eye surface clean. Fluffy cheeks and forehead silhouette.
            if q.dot(FWD)>.36 and q.z<.24:continue
            groom=Vector((-.03,0,-.018))
        elif kind=='tail':groom=Vector((-.01,0,.018))
        else:groom=Vector((-.024,0,-.016))
        ln=length*random.uniform(.65,1.15)
        tangent_groom=groom-n*groom.dot(n)
        if tangent_groom.length<.001:tangent_groom=Vector((.01,0,-.01))
        direction=(n*.53+tangent_groom.normalized()*.85).normalized()
        tangent=n.cross(Vector((0,0,1)))
        if tangent.length<.1:tangent=n.cross(Vector((1,0,0)))
        tangent.normalize();w=width*random.uniform(.6,1.4)
        base=p-n*.006;mid=base+direction*ln*.56;tip=base+direction*ln
        idx=len(verts);verts.extend([tuple(base-tangent*w/2),tuple(base+tangent*w/2),tuple(mid+tangent*w*.25),tuple(tip),tuple(mid-tangent*w*.25)])
        faces.append((idx,idx+1,idx+2,idx+3,idx+4))
        co=pattern(p,kind);shade=random.uniform(.98,1.025)
        colors.extend([(*[min(1,x*shade) for x in co],1)]*5)
    m=bpy.data.meshes.new(kind+' groomed surface fibres');m.from_pydata(verts,[],faces);m.update();f=bpy.data.objects.new(kind+' soft silhouette wisps',m);bpy.context.collection.objects.link(f);m.materials.append(fur)
    col=m.color_attributes.new(name='fur_color',type='FLOAT_COLOR',domain='POINT')
    for i,co in enumerate(colors):col.data[i].color=co
    for poly in m.polygons:poly.use_smooth=True
    return f

# Compact kitten body. Four full-volume limbs and actual ground-facing paws.
parts=[ell('short rounded torso',(-.25,0,.72),(.75,.42,.40)),ell('front fluffy chest',(.29,0,.72),(.41,.44,.45)),ell('soft hip',(-.77,0,.64),(.36,.42,.40))]
for side in (-1,1):
    y=side*.265
    # relaxed grounded stance, near forefoot slightly forward
    fx=.50+(.08 if side==-1 else 0)
    pts=[(.31,y,.72),(.29,y,.54),(.28,y,.40),(fx,y,.21),(fx+.03,y,.14)]
    parts.append(tube(('near' if side==-1 else 'far')+' foreleg',pts,[.205,.184,.154,.135,.125]))
    parts.append(ell('front soft paw',(fx+.10,y-.005,.115),(.21,.165,.12)))
    pts=[(-.76,y,.65),(-.59,y,.44),(-.79,y,.27),(-.80,y,.15)]
    parts.append(tube(('near' if side==-1 else 'far')+' hindleg',pts,[.258,.225,.148,.125]))
    parts.append(ell('rear soft paw',(-.71,y,.115),(.20,.165,.12)))
body=merge_soft('Mika compact continuous body and four paws',parts,.025);color_mesh(body,'body');add_fur(body,'body',35000,.047,.0038)

# Face axes: mostly faces forward, gently turns toward viewer.
HEAD=Vector((.61,-.015,1.15));FWD=Vector((.93,-.368,0));RIGHT=Vector((.368,.93,0));UP=Vector((0,0,1))
Q=Matrix((RIGHT,FWD,UP)).transposed().to_quaternion()
def hp(x,y,z):return HEAD+RIGHT*x+FWD*y+UP*z
head=merge_soft('Mika wide kitten head',[ell('cranial volume',HEAD,(.52,.46,.46),quat=Q),ell('left soft cheek',hp(-.30,.08,-.14),(.29,.33,.25),quat=Q),ell('right soft cheek',hp(.30,.08,-.14),(.29,.33,.25),quat=Q)],.019)
color_mesh(head,'head');add_fur(head,'head',30000,.035,.003)

# Rounded triangular ears with a recessed inner surface, no sphere ear caps.
def ear(name,cx,far=False):
    verts=[];faces=[]
    outline=[(-.20,0,0),(-.18,-.03,.19),(-.06,-.06,.45),(.015,-.05,.50),(.10,-.025,.39),(.22,0,.015)]
    for depth in (-.05,.075):
        for x,y,z in outline:verts.append(tuple(hp(cx+x*1.08,y+depth,.285+z*.70)))
    faces=[tuple(range(5,-1,-1)),tuple(range(6,12))]
    for i in range(6):faces.append((i,(i+1)%6,(i+1)%6+6,i+6))
    m=bpy.data.meshes.new(name);m.from_pydata(verts,[],faces);m.update();o=bpy.data.objects.new(name,m);bpy.context.collection.objects.link(o);m.materials.append(ginger)
    bevel=o.modifiers.new('rounded ear rim','BEVEL');bevel.width=.06;bevel.segments=3
    sub=o.modifiers.new('soft ear silhouette','SUBSURF');sub.levels=2
    bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=bevel.name);bpy.ops.object.modifier_apply(modifier=sub.name)
    for p in o.data.polygons:p.use_smooth=True
    color_mesh(o,'ear');add_fur(o,'ear',2500,.018,.0025)
    # Inner ear is a closed tapered patch set just in front, with softened corners.
    vv=[tuple(hp(cx-.130,.081,.340)),tuple(hp(cx-.041,.050,.556)),tuple(hp(cx+.027,.056,.575)),tuple(hp(cx+.140,.080,.347)),tuple(hp(cx,.108,.390))]
    mm=bpy.data.meshes.new(name+' pink');mm.from_pydata(vv,[],[(0,1,4),(1,2,4),(2,3,4),(3,0,4)]);mm.update();oo=bpy.data.objects.new(name+' recessed inner pink',mm);bpy.context.collection.objects.link(oo);mm.materials.append(pink)
    su=oo.modifiers.new('soft inset','SUBSURF');su.levels=2
    sol=oo.modifiers.new('inset thickness','SOLIDIFY');sol.thickness=.012
    return o
for cx in (-.33,.33): ear('left ear' if cx<0 else 'right ear',cx)

# Face: generous brown eyes, clean white blaze, small coral nose, soft muzzle.
for side in (-1,1):
    ex=side*.252
    ell('soft brown eyelid',hp(ex,.396,.015),(.135,.043,.160),dark,Q)
    ell('cream sclera',hp(ex,.430,.017),(.120,.030,.143),white,Q)
    ell('amber iris',hp(ex+side*.008,.454,.010),(.109,.028,.138),iris,Q)
    ell('large warm pupil',hp(ex+side*.008,.477,.022),(.067,.019,.108),pupil,Q)
    ell('large eye sparkle',hp(ex-.025,.491,.071),(.019,.009,.025),glint,Q)
    ell('small reflected glow',hp(ex+.028,.486,-.060),(.009,.006,.011),glint,Q)
for side in (-1,1):ell('soft muzzle pad',hp(side*.103,.447,-.180),(.171,.126,.113),cream,Q)
ell('small chin',hp(0,.422,-.268),(.13,.065,.052),cream,Q)
# A softly bevelled triangle nose.
v=[tuple(hp(-.079,.563,-.126)),tuple(hp(.079,.563,-.126)),tuple(hp(0,.578,-.195)),tuple(hp(0,.525,-.146))]
m=bpy.data.meshes.new('heart nose');m.from_pydata(v,[],[(0,1,2),(0,3,1),(0,2,3),(1,3,2)]);m.update();o=bpy.data.objects.new('coral tiny triangular nose',m);bpy.context.collection.objects.link(o);m.materials.append(nose)
b=o.modifiers.new('soft nose corners','BEVEL');b.width=.02;b.segments=3
s=o.modifiers.new('soft nose','SUBSURF');s.levels=1

def curve(name,pts,radius,material):
    c=bpy.data.curves.new(name,'CURVE');c.dimensions='3D';c.resolution_u=16;c.bevel_depth=radius;c.bevel_resolution=2
    sp=c.splines.new('BEZIER');sp.bezier_points.add(len(pts)-1)
    for p,co in zip(sp.bezier_points,pts):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,c);bpy.context.collection.objects.link(ob);c.materials.append(material);return ob
curve('short philtrum',[hp(0,.557,-.188),hp(0,.558,-.220)],.006,dark)
for side in (-1,1):
    curve('gentle tiny smile',[hp(0,.557,-.220),hp(side*.052,.54,-.238),hp(side*.092,.52,-.221)],.0045,dark)
    for i in range(3):
        z=-.158-i*.038
        curve('fine ivory whisker',[hp(side*.135,.502,z),hp(side*.32,.51,z+.015),hp(side*.51,.47,z+.060-i*.025)],.0027,cream)

# Full plush upright curled tail: continuous thick tapered sweep with banded colour.
points=[];radii=[]
def bez(a,b,c,d,t):return (1-t)**3*Vector(a)+3*(1-t)**2*t*Vector(b)+3*(1-t)*t*t*Vector(c)+t**3*Vector(d)
for i in range(50):
    t=i/49
    if t<.76:
        p=bez((-.91,.08,.80),(-1.19,.08,1.04),(-1.29,.07,1.37),(-1.15,.045,1.55),t/.76)
    else:
        p=bez((-1.15,.045,1.55),(-1.04,.03,1.72),(-1.19,.02,1.74),(-1.38,.015,1.68),(t-.76)/.24)
    points.append(tuple(p));radii.append(.13+.073*math.sin(math.pi*t*.92)-.09*t**12)
tail=tube('plush upright curling tail',points,radii,sides=24);color_mesh(tail,'tail');add_fur(tail,'tail',18000,.049,.0038)

# Studio world matches the warm upper-left courtyard light. Transparent sprite.
world=bpy.data.worlds.new('warm diffuse environment');bpy.context.scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.84,1,1);world.node_tree.nodes['Background'].inputs[1].default_value=.45

def area(name,loc,power,size,color):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape='DISK';d.size=size;d.color=color
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
area('large warm upper-left key',(-3,-4,7),650,5,(1,.82,.60));area('soft cool camera fill',(5,-4,4),170,4,(.80,.89,1));area('gentle warm rear bounce',(-2,4,3),220,3,(1,.90,.72))
# Shadow catcher keeps genuine paw contacts in the scene composite.
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.008));ground=bpy.context.object;ground.name='ground shadow catcher';ground.is_shadow_catcher=True;ground.hide_render=True;ground.data.materials.append(mat('neutral ground',(.4,.4,.4)))
camdata=bpy.data.cameras.new('fixed elevated game camera');cam=bpy.data.objects.new('fixed elevated game camera',camdata);bpy.context.collection.objects.link(cam)
target=Vector((-.16,0,1.03));cam.location=(5.5,-8.0,5.0);cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=3.12;bpy.context.scene.camera=cam
sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.device='CPU';sc.cycles.samples=96;sc.cycles.use_denoising=False;sc.cycles.max_bounces=5
sc.render.resolution_x=768;sc.render.resolution_y=768;sc.render.resolution_percentage=100;sc.render.film_transparent=True
sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGBA';sc.render.image_settings.color_depth='8'
sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast';sc.view_settings.exposure=.35
sc.render.filepath=str(OUT/'mika-3d-motion-base-r2.png')
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'mika-3d-motion-base-r2.blend'),compress=True)
meta={'revision':'motion-r2-rest-anatomy','status':'BOUNDED_STATIC_STYLE_EXPERIMENT_NOT_APPROVED','generator':'Blender 4.3.2 local Python geometry','seed':412,'camera':{'type':'ORTHO','location':list(cam.location),'target':list(target),'ortho_scale':camdata.ortho_scale},'floor_z':-.008,'render':[768,768],'samples':96,'frames':1,'rigged':False,'objects':len(sc.objects),'vertices':sum(len(o.data.vertices) for o in sc.objects if o.type=='MESH'),'source_master':'assets-source/yard-v2/mika-walk/frame-00.png','source_master_used_as_texture':False}
(OUT/'scene-contract.json').write_text(json.dumps(meta,indent=2))
print("BASE_SCENE_ONLY_NO_STATIC_STYLE_RENDER")
print('MIKA_STATIC_RENDER_COMPLETE',str(OUT))
