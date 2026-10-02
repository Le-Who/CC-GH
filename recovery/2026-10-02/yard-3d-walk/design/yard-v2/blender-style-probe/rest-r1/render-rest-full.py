import bpy,sys
from pathlib import Path
H=Path(__file__).resolve().parent
bpy.ops.wm.open_mainfile(filepath=str(H/'mika-rest-full-prototype-r1.blend'));s=bpy.context.scene;s.cycles.samples=24;s.render.resolution_x=640;s.render.resolution_y=416
args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else ['0','2'];offset,stride=map(int,args)
for f in range(1+offset,s.frame_end+1,stride):
 p=H/f'rest-full-frames/frame-{f:03}.png'
 if p.exists():continue
 s.frame_set(f);s.render.filepath=str(p);bpy.ops.render.render(write_still=True)
