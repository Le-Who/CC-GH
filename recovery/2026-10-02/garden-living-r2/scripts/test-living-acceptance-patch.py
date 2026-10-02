import importlib.util
from pathlib import Path
import tempfile
import unittest

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('patcher',HERE/'add-living-acceptance-qa.py')
patcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(patcher)
SOURCE=HERE.parent/'game-preview'

class GuardTests(unittest.TestCase):
    def test_unique_anchor(self):
        self.assertEqual(patcher.unique('a-needle-b','needle','new','test'),'a-new-b')
        for value in ['absent','needle needle']:
            with self.assertRaises(ValueError):patcher.unique(value,'needle','new','test')

    def test_current_input_plans_eight_files_without_writing_it(self):
        names=['qa/profiles.mjs','qa/run-qa.mjs','source-excerpt/preview/garden/fixtures.js',
               'dist-garden-preview/assets/host-BacBU0WN.js']
        before={n:(SOURCE/n).read_bytes() for n in names}
        changes=patcher.plan(SOURCE,HERE/'living-acceptance-cases.mjs')
        self.assertEqual(len(changes),8)
        self.assertEqual(before,{n:(SOURCE/n).read_bytes() for n in names})
        self.assertIsNone(changes['qa/living-acceptance.mjs'][0])

    def test_output_must_be_absent_and_outside_source(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'NEW absent'):
                patcher.write_overlay(SOURCE,Path(d),HERE/'living-acceptance-cases.mjs')
        with self.assertRaisesRegex(ValueError,'outside'):
            patcher.write_overlay(SOURCE,SOURCE/'never-create-acceptance-output',HERE/'living-acceptance-cases.mjs')

    def test_bad_anchor_fails_before_creating_output(self):
        with tempfile.TemporaryDirectory() as d:
            source=Path(d)/'input';(source/'qa').mkdir(parents=True)
            (source/'qa/profiles.mjs').write_text('missing prior cases')
            output=Path(d)/'output'
            with self.assertRaises(ValueError):patcher.write_overlay(source,output,HERE/'living-acceptance-cases.mjs')
            self.assertFalse(output.exists())

if __name__=='__main__':unittest.main()
