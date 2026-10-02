"""Displays untouched true Blender frames and exact projected ground targets for QA."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,math,hashlib
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
S=json.loads((H/'walk-samples.json').read_text());A=json.loads((H/'blender-contact-audit.json').read_text())
frames=[Image.open(H/f'walk-frames/frame-{i:02}.png').convert('RGBA') for i in range(1,25)]
bboxes=[im.getchannel('A').point(lambda p:255 if p>=128 else 0).getbbox() for im in frames]
B=(min(b[0] for b in bboxes),min(b[1] for b in bboxes),max(b[2] for b in bboxes),max(b[3] for b in bboxes));width=B[2]-B[0]
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';ft=lambda s:ImageFont.truetype(font,s)
colors={'foreNear':'#8c3042','foreFar':'#256284','hindNear':'#857119','hindFar':'#3d8059'}
# Large raw loop with exact one-frame time. Contains no added faux limb motion.
loop=[];marked=[]
for i,im in enumerate(frames):
    c=Image.new('RGBA',(460,452),'#ece6d9');c.alpha_composite(im,(38,36));d=ImageDraw.Draw(c)
    d.text((14,10),'REAL 3D WALK / technical only / art rejected',font=ft(14),fill='#394232')
    d.text((14,420),f'Pose {i+1:02}/24 · 20 fps · 1.2 s · stride 0.32 world',font=ft(13),fill='#594d3d')
    loop.append(c.convert('RGB'))
    for name,l in A['samples'][i]['limbs'].items():
        x,y=l['foot_screen_384'];x+=38;y+=36;r=3
        if l['contact']:d.ellipse((x-r,y-r,x+r,y+r),fill=colors[name])
        else:d.ellipse((x-r,y-r,x+r,y+r),outline=colors[name],width=1)
    marked.append(c.convert('RGB'))
loop[0].save(H/'walk-3d-technical-loop.gif',save_all=True,append_images=loop[1:],duration=50,loop=0,optimize=False)
marked[0].save(H/'walk-3d-contact-loop.gif',save_all=True,append_images=marked[1:],duration=50,loop=0,optimize=False)
# 12-frame posture/contact sheet. Genuine frame order, no generated in-betweens.
sheet=Image.new('RGB',(1152,1050),'#ece6d9');d=ImageDraw.Draw(sheet)
d.text((18,14),'24 real 3D poses / every other frame shown / style NOT approved',font=ft(17),fill='#394232')
for cell,idx in enumerate(range(0,24,2)):
    tile=marked[idx].resize((288,283),Image.Resampling.LANCZOS);x=(cell%4)*288;y=47+(cell//4)*320;sheet.paste(tile,(x,y));d.text((x+12,y+289),f'frame {idx+1:02}  contacts '+str(sum(l['contact'] for l in A['samples'][idx]['limbs'].values())),font=ft(12),fill='#594d3d')
d.text((18,1015),'Filled markers = planted ground targets; hollow markers = lifted. Source pose and camera stay coherent.',font=ft(13),fill='#594d3d')
sheet.save(H/'walk-3d-contact-sheet.jpg',quality=95)
# Stable-camera game-size scene loops: root movement comes from the solver's physical distance.
stage=Image.open(ROOT/'assets-source/yard-v2/stage-empty.png').convert('RGBA').resize((720,600),Image.Resampling.LANCZOS)
# Orthographic camera X basis: exact fixed camera position/target from R3.
dir=(5.5+.16,-8.0,5.0-1.03);L=math.sqrt(sum(v*v for v in dir));n=tuple(v/L for v in dir)
right=(8/math.hypot(8,5.66),5.66/math.hypot(8,5.66),0)
up=(-n[2]*right[1],n[2]*right[0],n[0]*right[1]-n[1]*right[0])
px_per_world=384/3.12;screen_x=(right[0]*px_per_world,-up[0]*px_per_world)
scene_frames=[]
for k in range(72):
    i=k%24;cycle=k//24;dist=cycle*S['stride']+S['samples'][i]['root'][0]
    c=stage.copy();d=ImageDraw.Draw(c);d.rectangle((0,0,720,66),fill='#f2ecde');d.text((16,10),'3D WALK / same physical root and gait phase',font=ft(17),fill='#394232');d.text((16,37),'64 px and 80 px sprites · style rejected · no browser QA claim',font=ft(13),fill='#594d3d')
    for size,anchor in [(64,(220,440)),(80,(450,440))]:
        scale=size/width;im=frames[i].resize((round(384*scale),round(384*scale)),Image.Resampling.LANCZOS)
        ox=round(anchor[0]-B[0]*scale+dist*screen_x[0]*scale);oy=round(anchor[1]-B[3]*scale+dist*screen_x[1]*scale)
        c.alpha_composite(im,(ox,oy));d.text((anchor[0],470),f'{size} px',font=ft(13),fill='#253221')
    scene_frames.append(c.convert('RGB'))
scene_frames[0].save(H/'walk-3d-game-scale.gif',save_all=True,append_images=scene_frames[1:],duration=50,loop=0,optimize=False)
scene_frames[23].save(H/'walk-3d-game-scale-still.jpg',quality=95)
# Additional runtime-format measurement, not a production release or fake atlas preview.
R=H/'walk-runtime-candidate';R.mkdir(exist_ok=True)
for i,im in enumerate(frames):im.resize((192,192),Image.Resampling.LANCZOS).save(R/f'frame-{i+1:02}.webp',quality=88,method=6)
files=list(R.glob('*.webp'))
report={'frames':24,'unique_render_hashes':len(set(hashlib.sha256((H/f'walk-frames/frame-{i:02}.png').read_bytes()).hexdigest() for i in range(1,25))),'source_png_bytes':sum((H/f'walk-frames/frame-{i:02}.png').stat().st_size for i in range(1,25)),'webp_candidate_bytes':sum(p.stat().st_size for p in files),'decoded_rgba_candidate_bytes':24*192*192*4,'constant_canvas':[384,384],'common_alpha_bbox':B,'screen_world_x_384':screen_x,'game_display_sprite_widths':[64,80],'style':'REJECTED','visual_motion':'PENDING_ROOT_REVIEW'}
(H/'walk-export-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
