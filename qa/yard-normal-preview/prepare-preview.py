#!/usr/bin/env python3
"""File-only preparation. Never serves, publishes, downloads, or installs."""
import hashlib,json,os,pathlib,shutil,sys
here=pathlib.Path(__file__).resolve().parent
root=pathlib.Path(sys.argv[1]).resolve(strict=True)
target=here/'work/preview-source'
if target.exists():raise SystemExit('Refusing to replace existing preview source')
target.mkdir(parents=True)
rows=[]
def copy(src,rel):
 if src.is_symlink() or not src.is_file():raise ValueError('Non-regular input: '+str(src))
 b=src.read_bytes();dest=target/rel;dest.parent.mkdir(parents=True,exist_ok=True)
 # Owned immutable snapshot inputs are hardlinked to avoid duplicate media copies.
 os.link(src,dest)
 rows.append({'path':str(rel),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
for name in ['src','game-logic','scripts','preview','recovery-tools','design']:
 for src in sorted((root/name).rglob('*')):
  if src.is_file() or src.is_symlink():copy(src,src.relative_to(root))
for name in ['game-logic.js','package.json','pnpm-lock.yaml','vite.config.js','postcss.config.js','tailwind.config.js']:
 copy(root/name,pathlib.Path(name))
for src in sorted((root/'public/assets').glob('yard-*')):
 for item in sorted(src.rglob('*')):
  if item.is_file() or item.is_symlink():copy(item,pathlib.Path('preview-public')/item.relative_to(root/'public'))
for name in ['games/companion-yard','games/hud-redesign/room']:
 for item in sorted((root/'public'/name).rglob('*')):
  if item.is_file() or item.is_symlink():copy(item,pathlib.Path('preview-public')/item.relative_to(root/'public'))
for src in sorted((here/'templates').iterdir()):shutil.copyfile(src,target/src.name)
shutil.copyfile(here/'preview-fixture.mjs',target/'preview-fixture.mjs')
os.symlink(root/'node_modules',target/'node_modules',target_is_directory=True)
(here/'work/preview-source-pin.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'files':len(rows),'bytes':sum(r['bytes'] for r in rows)}))
