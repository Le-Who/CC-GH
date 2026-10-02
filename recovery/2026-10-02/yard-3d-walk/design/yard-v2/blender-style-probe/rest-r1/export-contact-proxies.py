import bpy,json
from pathlib import Path
H=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(H/'mika-rest-keypose-prototype-r1.blend'))
body=bpy.data.objects['Mika compact continuous body and four paws'];bed=bpy.data.objects['rest cushion flat seat .18']
centers={'foreNear':(.68,-.265,0),'foreFar':(.60,.265,0),'hindNear':(-.71,-.265,0),'hindFar':(-.71,.265,0)}
paws={}
for name,c in centers.items():
    gi=body.vertex_groups[name+'_paw'].index;cells={}
    for v in body.data.vertices:
        if v.co.z>.16 or not any(g.group==gi and g.weight>.995 for g in v.groups):continue
        p=[v.co.x-c[0],v.co.y-c[1],v.co.z-c[2]];key=(round(p[0]/.018),round(p[1]/.018))
        if key not in cells or p[2]<cells[key][2]:cells[key]=p
    paws[name]={'restAnchor':c,'lowerSurfacePoints':list(cells.values()),'pointCount':len(cells)}
mesh=bed.data;mesh.calc_loop_triangles()
result={'source':'Evaluated rig variant rest-r1-paw-binding-r3; original paw vertices in rest space, dominant rigid-paw region','limits':'Downsampled lower paw surface; final contact still requires full skinned mesh verification','cushion':{'vertices':[list(bed.matrix_world@v.co) for v in mesh.vertices],'triangles':[list(t.vertices) for t in mesh.loop_triangles],'seatZ':.18,'floorZ':0},'paws':paws}
(H/'contact-surface-proxies.json').write_text(json.dumps(result,indent=2));print({k:v['pointCount'] for k,v in paws.items()})
