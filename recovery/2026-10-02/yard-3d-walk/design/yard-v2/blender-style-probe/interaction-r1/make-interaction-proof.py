"""Offline proof composition. Uses untouched real 3D frames, no interpolation."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,math,hashlib,subprocess
H=Path(__file__).resolve().parent;ROOT=H.parents[3]
S=json.loads((H/'render-samples-used.json').read_text());A=json.loads((H/'blender-contact-audit.json').read_text())
paths=[H/f'interaction-frames/frame-{i:03}.png' for i in range(1,129)]
assert all(p.exists() for p in paths)
frames=[Image.open(p).convert('RGBA') for p in paths]
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';ft=lambda n:ImageFont.truetype(font,n)
labels={'walk-in':'Approach','decelerate':'Slow down','align':'Settle paws','attention':'Look at the mouse','reach':'Lift and reach','tap-press':'Tap / soft press','recoil':'Recoil','recover':'Regain stance','accelerate':'Resume walking','walk-out':'Walk on','complete':'One-shot test complete'}
close=[];game=[]
stage=Image.open(ROOT/'assets-source/yard-v2/stage-empty.png').convert('RGBA').resize((360,300),Image.Resampling.LANCZOS)
scale=80/(291*(512/5.6)/(384/3.12))
for i,im in enumerate(frames):
 sample=S['samples'][i];phase=sample['phaseName'];label=labels.get(phase,phase)
 c=Image.new('RGBA',(512,384),'#eee7d8');c.alpha_composite(im,(0,38));d=ImageDraw.Draw(c)
 d.text((14,9),'MIKA / REAL 3D INTERACTION PROTOTYPE',font=ft(16),fill='#33452e')
 d.text((14,357),f'{sample["timeSeconds"]:.2f} s  ·  {label}  ·  art under review',font=ft(13),fill='#72583c');close.append(c.convert('RGB'))
 g=Image.new('RGBA',(360,450),'#eee7d8');g.alpha_composite(stage,(0,57));g.alpha_composite(im.resize((round(512*scale),round(320*scale)),Image.Resampling.LANCZOS),(70,218));d=ImageDraw.Draw(g)
 d.text((12,11),'COZY YARD / 3D PROTOTYPE',font=ft(15),fill='#33452e');d.text((12,33),'80 px pet · art still under review',font=ft(12),fill='#72583c')
 d.text((12,374),label,font=ft(17),fill='#33452e');d.text((12,402),'Actual mesh contact · one-shot test',font=ft(12),fill='#72583c');d.line((12,435,348,435),fill='#b8ba9f',width=3);d.line((12,435,12+336*i/127,435),fill='#81966b',width=3);game.append(g.convert('RGB'))

def encode(frames,path):
 w,h=frames[0].size
 cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{w}x{h}','-framerate','20','-i','-','-an','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',str(path)]
 p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
 for im in frames:p.stdin.write(im.tobytes())
 p.stdin.close();assert p.wait()==0
encode(close,H/'mika-interaction-closeup.mp4');encode(game,H/'mika-interaction-game-scale.mp4')
# Fixed palette prevents the unchanged grass/background bloating every frame.
bgpal=game[0].quantize(colors=192).getpalette()[:576];catpal=close[67].quantize(colors=64).getpalette()[:192];pal=Image.new('P',(1,1));pal.putpalette(bgpal+catpal)
indexed=[im.quantize(palette=pal,dither=Image.Dither.NONE) for im in game]
indexed[0].save(H/'mika-interaction-game-scale.gif',save_all=True,append_images=indexed[1:],duration=50,loop=0,optimize=True)
game[67].save(H/'mika-interaction-game-scale-contact.png')
# Selected real key moments, clearly named. No drawing over the animal.
chosen=[1,37,55,63,68,69,76,85,119];sheet=Image.new('RGB',(1536,1152),'#eee7d8');d=ImageDraw.Draw(sheet)
for j,f in enumerate(chosen):sheet.paste(close[f-1],((j%3)*512,(j//3)*384))
sheet.save(H/'interaction-contact-sheet.jpg',quality=95)
# Two-times inspection crops of the actual paw and toy around contact.
contact=Image.new('RGB',(1056,320),'#eee7d8');dd=ImageDraw.Draw(contact)
for j,f in enumerate([67,68,69,71]):
 im=frames[f-1];crop=im.crop((290,190,420,320)).resize((260,260),Image.Resampling.LANCZOS)
 bg=Image.new('RGBA',(264,320),'#eee7d8');bg.alpha_composite(crop,(2,34));bd=ImageDraw.Draw(bg);bd.text((8,8),f'frame {f} / {S["samples"][f-1]["timeSeconds"]:.2f} s',font=ft(14),fill='#33452e')
 gap=A['samples'][f-1].get('actualPawToyUpperSurfaceClearance',{}).get('world_z_gap')
 bd.text((8,300),f'mesh gap {gap:+.5f}' if gap is not None else 'no XY contact',font=ft(12),fill='#72583c');contact.paste(bg.convert('RGB'),(j*264,0))
contact.save(H/'actual-contact-detail-x2.jpg',quality=95)
# Runtime-format estimate only: these are scene proof frames, not the production separate-entity atlas.
R=H/'scene-runtime-candidate';R.mkdir(exist_ok=True)
for i,im in enumerate(frames):im.resize((256,160),Image.Resampling.LANCZOS).save(R/f'frame-{i+1:03}.webp',quality=88,method=6)
posekeys=[]
for s in S['samples']:
 posekeys.append(json.dumps({'root':s['root'],'bodyShift':s['bodyShift'],'attention':s['attention'],'limbs':{k:{x:v[x] for x in ['hip','knee','ankle','paw']} for k,v in s['limbs'].items()},'mouse':s['mouse']},sort_keys=True))
report={'rendered_frames':128,'duration_seconds':6.4,'fps':20,'distinct_transform_states':len(set(posekeys)),'source_png_bytes':sum(p.stat().st_size for p in paths),'scene_webp_candidate_bytes':sum(p.stat().st_size for p in R.glob('*.webp')),'decoded_scene_webp_rgba_bytes':128*256*160*4,'closeup_mp4_bytes':(H/'mika-interaction-closeup.mp4').stat().st_size,'game_mp4_bytes':(H/'mika-interaction-game-scale.mp4').stat().st_size,'game_gif_bytes':(H/'mika-interaction-game-scale.gif').stat().st_size,'viewport_game':[360,450],'pet_reference_width_css_pixels':80,'separate_entity_production_atlas':False,'art_status':'REJECTED','browser_qa':'NOT_RUN','source_input_sha256':A['input_sha256']}
(H/'interaction-export-audit.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2))
