#!/usr/bin/env python3
"""Create a guarded NEW overlay. Never writes the input preview or renderer sources.

Run after prepare-game-pilot.py/add-pilot-qa.py. The build owner applies the overlay
only while its manifest before-hashes still match, then regenerates provenance.
"""
from pathlib import Path
import argparse
import hashlib
import json

VERSION = 1
FIXTURE = 'living-growth'
SOURCE_FIXTURE_ANCHOR = "  if (id === 'inventory') player.garden.plants.push("
SOURCE_FIXTURE_INSERT = """  // QA-only initial fixture; subsequent transitions use normal game inputs/ticks.
  if (id === 'living-growth') {
    Object.assign(player.garden, {
      level: 30, xp: 28000, xpRequired: getGardenXpRequired(30), shelvesUnlocked: 2,
      plants: [
        { ...plant('qa-grow-0', 'daisy', 0, 0, 0), phaseProgress: 100000 },
        { ...plant('qa-grow-1', 'monstera', 0, 1, 1), phaseProgress: 450000 },
        { ...plant('qa-grow-2', 'fern', 0, 2, 2), phaseProgress: 1780000 },
      ],
    });
    player.resources.gold = 125000;
  }
"""
COMPILED_FIXTURE_ANCHOR = 'return o==="inventory"&&u.garden.plants.push('
COMPILED_FIXTURE_INSERT = 'if(o==="living-growth"){Object.assign(u.garden,{level:30,xp:28000,xpRequired:Ka(30),shelvesUnlocked:2,plants:[{...Kn("qa-grow-0","daisy",0,0,0),phaseProgress:100000},{...Kn("qa-grow-1","monstera",0,1,1),phaseProgress:450000},{...Kn("qa-grow-2","fern",0,2,2),phaseProgress:1780000}]});u.resources.gold=125000;}'

def digest(data):
    return hashlib.sha256(data).hexdigest()

def unique(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise ValueError(f'{label}: expected one exact anchor; found {count}')
    return text.replace(old, new, 1)

def plan(source, template):
    changes = {}
    def edit(name, callback):
        path = source / name
        if not path.is_file():
            raise ValueError(f'Missing required input: {name}')
        before = path.read_bytes()
        after = callback(before.decode('utf-8')).encode('utf-8')
        if before == after:
            raise ValueError(f'No guarded change produced: {name}')
        changes[name] = (before, after)

    # Additive wrapper preserves all twelve existing QUICK scenarios verbatim.
    def profiles(text):
        if 'livingAcceptanceCases' in text:
            raise ValueError('Living acceptance overlay is already present')
        for case in ['garden-living-tap-water', 'garden-living-scroll-landscape']:
            if text.count("id:'" + case + "'") != 1:
                raise ValueError(f'Missing or repeated prior pilot case: {case}')
        text = unique(text, 'export function casesFor(', 'function pilotCasesFor(', 'profiles export')
        return "import {livingAcceptanceCases} from './living-acceptance.mjs';\n" + text + "\nexport function casesFor(game,options={}){const prior=pilotCasesFor(game,options);return game==='garden'?prior.concat(livingAcceptanceCases()):prior;}\n"
    edit('qa/profiles.mjs', profiles)
    edit('qa/run-qa.mjs', lambda s: unique(s,
         'await actor.navigate(profile,scenario.options);await scenario.run(actor);',
         "if(scenario.setup)await scenario.setup(actor);await actor.navigate(profile,scenario.options);await scenario.run(actor);",
         'pre-navigation setup hook'))
    edit('source-excerpt/preview/garden/fixture-ids.js', lambda s: unique(s,
         "'level-ready', 'poor']", "'level-ready', 'poor', 'living-growth']", 'source fixture registry'))
    edit('source-excerpt/preview/garden/fixtures.js', lambda s: unique(s,
         SOURCE_FIXTURE_ANCHOR, SOURCE_FIXTURE_INSERT + SOURCE_FIXTURE_ANCHOR, 'source fixture'))
    edit('dist-garden-preview/assets/version-DqqkhP_u.js', lambda s: unique(s,
         '"level-ready","poor"]', '"level-ready","poor","living-growth"]', 'compiled fixture registry'))
    edit('dist-garden-preview/assets/host-BacBU0WN.js', lambda s: unique(s,
         COMPILED_FIXTURE_ANCHOR, COMPILED_FIXTURE_INSERT + COMPILED_FIXTURE_ANCHOR, 'compiled fixture'))
    def marker(text):
        value=json.loads(text)
        if value.get('game')!='garden' or value.get('productionCompatible') is not False or value.get('storage')!='memory-only':
            raise ValueError('Target is not the isolated Garden preview')
        fixtures=value.get('fixtures')
        if not isinstance(fixtures,list) or fixtures.count('full')!=1 or FIXTURE in fixtures:
            raise ValueError('Unexpected marker fixture registry')
        fixtures.append(FIXTURE)
        value['livingAcceptanceQa']={'version':VERSION,'addedCases':4,'fallbackFaultCases':'not implemented','browserStatus':'not run by patch builder'}
        return json.dumps(value,ensure_ascii=False,indent=2)+'\n'
    edit('dist-garden-preview/garden-preview.json', marker)
    target='qa/living-acceptance.mjs'
    if (source/target).exists():
        raise ValueError('Refusing to replace an existing acceptance module')
    changes[target]=(None,template.read_bytes())
    return changes

def write_overlay(source, output, template):
    source=source.resolve(strict=True)
    output=output.absolute()
    if output.exists():
        raise ValueError('Output must be a NEW absent directory')
    if output==source or source in output.parents:
        raise ValueError('Overlay output must be outside the input preview')
    changes=plan(source,template)  # Validate every anchor before any output write.
    manifest={'version':VERSION,'kind':'garden-living-acceptance-overlay','source':str(source),
              'browserRun':False,'fixture':'initial synthetic state only; transitions use real inputs/ticks',
              'unrunFaultCoverage':['missing image','WebGL unavailable','context loss'], 'files':[]}
    output.mkdir(parents=True)
    for name,(before,after) in changes.items():
        path=output/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(after)
        manifest['files'].append({'path':name,'beforeSha256':digest(before) if before is not None else None,
                                  'afterSha256':digest(after),'bytes':len(after)})
    (output/'OVERLAY-MANIFEST.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    return manifest

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path,default=Path(__file__).resolve().parents[1]/'game-preview')
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    manifest=write_overlay(args.source,args.output,Path(__file__).with_name('living-acceptance-cases.mjs'))
    print(json.dumps({'output':str(args.output.absolute()),'changedFiles':len(manifest['files']),'browserRun':False}))

if __name__=='__main__':
    main()
