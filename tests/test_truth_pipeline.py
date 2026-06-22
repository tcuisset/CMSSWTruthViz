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
    def test_cmsrun_wrapper_config_sets_skip_events(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            wrapper = root / "wrapper_cfg.py"
            original_cfg = root / "dumpTruthGraphsFromGENSIMRECO_cfg.py"
            output_dir = root / "out"
            input_root = root / "sample.root"

            truth_pipeline.write_cmsrun_wrapper_config(
                wrapper,
                original_cfg,
                input_root,
                output_dir,
                PipelineOptions(event_index=7, dumper_args=["--no-keepSpectators", "-s", "23"]),
            )

            content = wrapper.read_text(encoding="utf-8")
            self.assertIn("runpy.run_path", content)
            self.assertIn("file:" + str(input_root), content)
            self.assertIn("'-n', '1'", content)
            self.assertIn("--no-keepSpectators", content)
            self.assertIn("process.source.skipEvents = cms.untracked.uint32(7)", content)

    def test_cmsrun_command_runs_wrapper_config_only(self):
        command = truth_pipeline.cmsrun_command(
            Path("/cmssw/src"),
            Path("/cmssw/src/PhysicsTools/TruthInfo/test/dumpTruthGraphsFromGENSIMRECO_cfg.py"),
        )

        self.assertIn("cmsRun", command)
        self.assertIn("dumpTruthGraphsFromGENSIMRECO_cfg.py", command)
        self.assertNotIn("--skipEvents", command)

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

    def test_resolve_cmssw_src_prefers_app_local_install(self):
        with tempfile.TemporaryDirectory() as tmp:
            project_root = Path(tmp) / "CMSSWGraphViz"
            app_local_src = project_root / truth_pipeline.DEFAULT_CMSSW_RELEASE / "src"
            app_local_src.mkdir(parents=True)

            with mock.patch.object(truth_pipeline, "PROJECT_ROOT", project_root):
                with mock.patch.dict(os.environ, {}, clear=True):
                    self.assertEqual(truth_pipeline.resolve_cmssw_src(), app_local_src.resolve())

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
