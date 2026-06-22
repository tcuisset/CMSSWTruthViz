import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import truth_pipeline
from truth_pipeline import PipelineOptions


class TruthPipelineTests(unittest.TestCase):
    def test_cmsrun_command_includes_one_event_and_skip_events(self):
        command = truth_pipeline.cmsrun_command(
            Path("/cmssw/src"),
            Path("/cmssw/src/PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py"),
            Path("/inputs/sample.root"),
            Path("/jobs/1/cmssw"),
            PipelineOptions(event_index=7, dumper_args=["--no-keepSpectators", "-s", "23"]),
        )

        self.assertIn("cmsRun", command)
        self.assertIn("file:/inputs/sample.root", command)
        self.assertIn("-n 1", command)
        self.assertIn("--skipEvents 7", command)
        self.assertIn("--no-keepSpectators -s 23", command)

    def test_find_single_newest_uses_event_suffixed_dot(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            older = directory / "truthlogicalgraph_run1_lumi1_event1.dot"
            newer = directory / "truthlogicalgraph_run1_lumi1_event2.dot"
            older.write_text("old", encoding="utf-8")
            newer.write_text("new", encoding="utf-8")
            os.utime(older, (1, 1))
            os.utime(newer, (2, 2))

            found = truth_pipeline.find_single_newest(
                "truthlogicalgraph*_run*_lumi*_event*.dot",
                directory,
                "logical DOT file",
            )

            self.assertEqual(found, newer)

    def test_cmsrun_subprocess_args_supports_wrapper(self):
        args = truth_pipeline.cmsrun_subprocess_args("cd /cmssw/src && cmsRun cfg.py", "cmssw-el9")

        self.assertEqual(args, ["cmssw-el9", "--command-to-run", "cd /cmssw/src && cmsRun cfg.py"])

    def test_load_catalog_requires_samples_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            catalog = Path(tmp) / "catalog.json"
            catalog.write_text(json.dumps({"samples": [{"id": "zmm", "path": "/tmp/zmm.root"}]}), encoding="utf-8")

            loaded = truth_pipeline.load_catalog(catalog)

            self.assertEqual(loaded["samples"][0]["id"], "zmm")

    @mock.patch("truth_pipeline.run_checked")
    @mock.patch("truth_pipeline.subprocess.run")
    def test_process_cmssw_root_discovers_outputs_and_runs_converters(self, mock_run, mock_run_checked):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cmssw_src = root / "CMSSW" / "src"
            cfg = cmssw_src / "PhysicsTools" / "TruthInfo" / "test" / "dumpTruthGraphsFromGENSIMRECO_cfg.py"
            cfg.parent.mkdir(parents=True)
            cfg.write_text("# cfg", encoding="utf-8")
            input_root = root / "input.root"
            input_root.write_text("root", encoding="utf-8")
            job_root = root / "jobs"

            def fake_run(args, **kwargs):
                outdir = job_root / "job1" / "cmssw"
                outdir.mkdir(parents=True, exist_ok=True)
                (outdir / "truthlogicalgraph_run1_lumi1_event8.dot").write_text("digraph {}", encoding="utf-8")
                (outdir / "rechits_nano.root").write_text("root", encoding="utf-8")
                completed = mock.Mock()
                completed.returncode = 0
                completed.stdout = ""
                completed.stderr = ""
                return completed

            mock_run.side_effect = fake_run

            result = truth_pipeline.process_cmssw_root(
                input_root,
                PipelineOptions(
                    event_index=8,
                    job_id="job1",
                    job_root=job_root,
                    cmssw_src=cmssw_src,
                    copy_to_viewer=False,
                ),
            )

            self.assertEqual(result.dot_path.name, "truthlogicalgraph_run1_lumi1_event8.dot")
            self.assertEqual(result.rechits_root_path.name, "rechits_nano.root")
            self.assertEqual(mock_run_checked.call_count, 2)


if __name__ == "__main__":
    unittest.main()
